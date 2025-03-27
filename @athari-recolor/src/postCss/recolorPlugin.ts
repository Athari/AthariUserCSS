import { DeepRequired } from 'utility-types';
import { regex } from 'regex';
import cssColorsNames from 'color-name';
import {
  ColorData, ColorNotation,
  color as parseCssColor,
  serializeRGB as serializeRgb,
  serializeOKLCH as serializeOkLch,
  serializeP3 as serializeDisplayP3,
  colorDataFitsRGB_Gamut as isColorDataFitsRgbGamut,
} from '@csstools/css-color-parser';
import { ColorFormula } from '../commonUtils.ts';
import { PostCss, Css, Ct, Cn } from '../domUtils.ts';
import {
  Opt, OptArray,
  compare, isSome, objectEntries, objectFromEntries, regexp,
} from '../utils.ts';

// MARK: Types

export interface RecolorPluginOptions {
  /**
   * How to modify original CSS code.
   * * `append` Add modified color declarations, keep all old declarations.
   * * `replace` Replace color declarations, keep non-color declarations.
   * * `override` Remove all non-color declarations, leave only modified color declarations.
   */
  mode?: Opt<TransformMode>;
  formula?: Opt<ColorFormula>;
  /** Whether to generate palette or to inline color values. */
  palette?: Opt<boolean>;
  /** Prefix of generated custom properties of the shared colors. */
  colorVar?: Opt<string>;
  /** Prefix of generated custom properties of the palette. */
  paletteVar?: Opt<string>;
  /** Find-replace pairs for renaming generated custom properties. */
  renameVar?: OptArray<RecolorVarTransform>;
}

interface RecolorVarTransform {
  /** String to find. */
  find: string;
  /** String to replace with. */
  replace: string;
  /** @private */
  regex?: RegExp;
}

type TransformMode = 'append' | 'replace' | 'override';

type Options = DeepRequired<RecolorPluginOptions>;

type CnColor = Cn.Function | Cn.Token;

type CssColorName = keyof typeof cssColorsNames | 'transparent';

interface Palette {
  colors: PaletteColor[];
  uniqueColors: Record<string, PaletteColor>;
}

interface PaletteColor {
  colorData: ColorData;
  colorRgb: string;
  colorOkLch: string;
  colorStr: string;
  expr: string;
  count: number;
  name: string;
}

// MARK: Syntax

const identifiableColorNotations = new Set([ ColorNotation.HEX, ColorNotation.RGB, ColorNotation.HSL, ColorNotation.HWB ]);

const cssColorMap = objectFromEntries(objectEntries(cssColorsNames).map(([name, [r, g, b]]) => [ `${r}|${g}|${b}` as const, name ]));

const reColorFunction = regex('i')`
  ^ (
    rgb | rgba | hsl | hsla | hwb | lab | lch | oklab | oklch | color
  ) $`;
const reColorPropSimple = regex('i')`
  ^ (
    -moz- | -webkit- | -ms- |
  )
  (
    color | fill | stroke |
    (
      background | outline | text-decoration | text-emphasis | text-outline |
      tap-highlight | accent | column-rule | caret | stop | flood | lighting
    ) -color |
    border (
      -top | -right | -left | -bottom |
      ( -block | -inline )
      ( -start | -end ) |
    ) -color |
    scrollbar (
      -3dlight | -arrow | -base | -darkshadow | -face | -highlight | -shadow | -track |
    ) -color |
    ( box | text ) -shadow |
    background-image
  ) $ `;
const reColorPropSplit = regex('i')`
  ^ (
    -moz- | -webkit- | -ms- |
  )
  (
    background | outline | text-decoration | column-rule |
    border ( -top | -right | -left | -bottom )
  ) $ `;
const reColorPropComplexSplit = regex('i')`
  ^ (
    -moz- | -webkit- | -ms- |
  )
  (
    border ( -block | -inline | )
  ) $ `;
const reAtRuleMediaDark = regex('i')`
  prefers-color-scheme \s* : \s* dark `;
const reAtRuleMediaNameAllowed = regex('i')`
  ^ ( container | media | scope | starting-style | supports ) $ `;

// MARK: Utils

function roundStrNumbers(s: string): string {
  return s.replace(/(\d+\.\d+|\d+\.|\.\d+)/g,
    (_, d) => (+d).toFixed(2).replace(/(\.\d*)0+$/, "$1").replace(/\.0+$/, ""));
}

const isCnTokenHashOrIdent = Cn.isToken(isSome(Ct.isHash, Ct.isIdent));

// MARK: Palette

function getIdentColorName(color: ColorData): CssColorName | null {
  const [ r, g, b ] = color.channels;
  if (r === 0 && g === 0 && b === 0 && color.alpha === 0)
    return 'transparent';
  if (color.alpha !== 1 || !identifiableColorNotations.has(color.colorNotation))
    return null;
  return cssColorMap[`${255 * r}|${255 * g}|${255 * b}`] ?? null;
}

function applyVarTransforms(name: string, tfs: RecolorVarTransform[]): string {
  name = name
    .replace(/\./ig, "_").replace(/[^\w\d-]/ig, "-").replace(/-+/g, "-").replace(/^-?(.*?)-?$/, "$1")
    .toLowerCase();
  for (let i = 0; i < tfs.length; i++) {
    const nameTf = tfs.reduce((r, t) => r.replace(t.regex!, t.replace), name);
    if (nameTf == name)
      break;
    name = nameTf;
  }
  return name;
}

function getPaletteColor(colorData: ColorData, palette: Palette, node: CnColor, opts: Options): PaletteColor {
  const [ colorRgbStr, colorOkLchStr ] = [ serializeRgb(colorData), serializeDisplayP3(colorData) ];
  const colorUniqueKey = `${colorRgbStr}/${colorOkLchStr}`;
  const colorIdent = getIdentColorName(colorData);

  let strNode = Cn.stringify(node);
  if (Cn.isTokenAny(node))
    strNode = strNode.toLowerCase();

  let paletteColor = palette.uniqueColors[colorUniqueKey];
  if (paletteColor === undefined) {
    const paletteVar = applyVarTransforms(colorIdent ?? roundStrNumbers(strNode), opts.renameVar);
    paletteColor = {
      colorData,
      colorRgb: roundStrNumbers(Cn.stringify(isColorDataFitsRgbGamut(colorData) ? colorRgbStr : colorOkLchStr)),
      colorOkLch: roundStrNumbers(Cn.stringify(serializeOkLch(colorData))),
      colorStr: colorIdent ?? strNode,
      expr: "",
      count: 0,
      name: `--${opts.paletteVar}${paletteVar}`,
    };
    palette.colors.push(paletteColor);
    palette.uniqueColors[colorUniqueKey] = paletteColor;
  }
  paletteColor.count++;

  return paletteColor;
}

// MARK: Recolor

function recolorCnColor(node: CnColor, opts: Options): string {
  type ColorComp = string | boolean | number;

  const colorVar = (s: string, i: number) =>
    `var(--${opts.colorVar}${String.fromCharCode(s.charCodeAt(0) + i)})`;
  const colorComp = (c: string, b: ColorComp) =>
    typeof b === 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
  const colorOkLch = (orig: Cn.Node, l: ColorComp, c: ColorComp, h: ColorComp) =>
    `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
  const colorAutoTheme = (orig: Cn.Node, expr: ColorComp) =>
    `light-dark(${orig.toString()}, ${expr})`;

  return {
    get [ColorFormula.Dark]() { return colorOkLch(node, 1, 0, 0) },
    get [ColorFormula.DarkFull]() { return colorOkLch(node, 1, 1, 1) },
    get [ColorFormula.DarkAuto]() { return colorAutoTheme(node, this[ColorFormula.Dark]) },
    get [ColorFormula.DarkFullAuto]() { return colorAutoTheme(node, this[ColorFormula.DarkFull]) },
  }[opts.formula];
}

// MARK: Generate CSS

function buildPaletteRule(palette: Palette): Css.Rule {
  return new Css.Rule({
    selector: ':root',
    nodes: palette.colors
      .orderByDescending(c => c.count, compare)
      .thenBy(c => c.colorRgb, compare)
      .selectMany(c => [
        new Css.Comment({ text: `!ath! color ${c.colorStr} n=${c.count} ${c.colorRgb} ${c.colorOkLch}` }),
        new Css.Decl({ prop: c.name, value: c.expr }),
      ])
      .toArray(),
  });
}

function recolorCssAtRule(rule: Css.AtRule): false | void {
  //console.log(`rule: ${rule.name} = ${rule.params}`);
  // TODO: Support animating colors with @keyframes (parse at-rules with https://github.com/postcss/postcss-at-rule-parser)
  if (rule.name === 'media' && reAtRuleMediaDark.test(rule.params) ||
    !reAtRuleMediaNameAllowed.test(rule.name)) {
    rule.remove();
  }
}

function recolorCssDecl(decl: Css.Decl, palette: Palette, opts: Options): false | void {
  let newDeclProp = '-';
  let newDeclValue: string | null = null;
  let keepOldDecl = true;
  let isComplexValue = false;
  const newCns = Cn.replaceList(Cn.parseCommaList(decl.value), (node: Cn.Node) => {
    isComplexValue ||= Cn.isFunction(node) && !reColorFunction.test(node.getName());
    if (Cn.isFunction(node) && reColorFunction.test(node.getName()) || isCnTokenHashOrIdent(node)) {
      // TODO: Deal with color parser producing component value in color alpha property, plus other SyntaxFlag values
      const colorData = parseCssColor(node);
      if (!colorData) {
        isComplexValue = true;
        return;
      }

      const paletteColor: PaletteColor = getPaletteColor(colorData, palette, node, opts);
      const paletteStr = `var(${paletteColor.name})`;
      const recolorStr = recolorCnColor(node, opts);
      paletteColor.expr = recolorStr;
      const resultStr = opts.palette ? paletteStr : recolorStr;

      if (reColorPropSimple.test(decl.prop) || decl.variable || isComplexValue) {
        //console.log(`simple: ${decl.prop} = ${node.toString()}`);
        keepOldDecl = opts.mode === 'append';
        newDeclProp = decl.prop;
        return Cn.parse(resultStr);
      } else if (reColorPropSplit.test(decl.prop)) {
        //console.log(`split: ${decl.prop} = ... ${node.toString()} ...`);
        keepOldDecl = opts.mode !== 'override';
        newDeclProp = `${decl.prop}-color`;
        newDeclValue = resultStr;
      } else if (reColorPropComplexSplit.test(decl.prop)) {
        // TODO: Split complex values like border( -width | -style | -color )
        keepOldDecl = opts.mode === 'append';
        newDeclProp = decl.prop;
        return Cn.parse(resultStr);
      } else {
        console.log(`unknown: ${decl.prop} = ${decl.value}`);
      }
    }
    return;
  });
  if (newDeclProp !== '-') {
    decl.cloneBefore({
      prop: newDeclProp,
      value: newDeclValue ?? Cn.stringifyList(newCns),
      important: decl.important,
    });
  }
  if (!keepOldDecl) {
    decl.remove();
  }
}

// MARK: Plugin

export default PostCss.declarePlugin<RecolorPluginOptions>('recolor', {
  mode: 'replace',
  formula: ColorFormula.DarkFull,
  palette: true,
  colorVar: "",
  paletteVar: "c-",
  renameVar: [
    { find: '-var-', replace: '-', regex: null! },
  ],
}, (opts: Options) => {
  for (const transform of opts.renameVar)
    transform.regex ??= regexp(transform.find, 'gi');
  return {
    OnceExit(css: Css.Root) {
      const palette: Palette = {
        colors: [],
        uniqueColors: {},
      };

      css.walkAtRules(rule => recolorCssAtRule(rule));
      css.walkDecls(decl => recolorCssDecl(decl, palette, opts));
      if (opts.palette)
        css.prepend(buildPaletteRule(palette));

      css.cleanRaws();
    }
  };
});