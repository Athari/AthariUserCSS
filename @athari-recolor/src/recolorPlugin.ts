import { DeepRequired } from 'utility-types';
import { regex } from 'regex';
import cssColorsNames from 'color-name';
import {
  ColorData,
  ColorNotation,
  color as parseCssColor,
  serializeRGB as serializeRgb,
  serializeOKLCH as serializeOkLch,
  serializeP3 as serializeDisplayP3,
  colorDataFitsRGB_Gamut as isColorDataFitsRgbGamut,
} from '@csstools/css-color-parser';
import {
  isTokenHash, isTokenIdent, TokenHash, TokenIdent,
} from '@csstools/css-tokenizer';
import { ColorFormula } from './commonUtils.ts';
import {
  CssRoot, CssAtRule, CssRule, CssDecl, CssComment,
  Comp, CompFunction, CompToken, CssToken,
  isCompFunction, isCompToken, isCompTokenType,
  tokenizeCss, parseCssCompStr, stringifyCssComp, parseCssCompCommaList, stringifyCssComps, replaceCssComps,
  declarePostCssPlugin,
} from './domUtils.ts';
import { compare, objectEntries, objectFromEntries, OptionalArray, regexp } from './utils.ts';

interface RecolorVarTransform {
  find: string;
  replace: string;
  reFind?: RegExp;
}

export interface RecolorPluginOptions {
  colorFormula?: ColorFormula | undefined;
  colorVarPrefix?: string | undefined;
  palette?: boolean | undefined;
  paletteVarPrefix?: string | undefined;
  paletteVarTransforms?: OptionalArray<RecolorVarTransform>;
}

type Options = DeepRequired<RecolorPluginOptions>;

type CompColor = CompFunction | CompToken;

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

function roundStrNumbers(s: string): string {
  return s.replace(/(\d+\.\d+|\d+\.|\.\d+)/g,
    (_, d) => (+d).toFixed(2).replace(/(\.\d*)0+$/, "$1").replace(/\.0+$/, ""));
}

function isTokenHashOrIdent(x?: CssToken | null): x is TokenHash | TokenIdent {
  return isTokenHash(x) || isTokenIdent(x)
}

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
    const nameTf = tfs.reduce((r, t) => r.replace(t.reFind!, t.replace), name);
    if (nameTf == name)
      break;
    name = nameTf;
  }
  return name;
}

function getPaletteColor(colorData: ColorData, palette: Palette, node: CompColor, opts: Options): PaletteColor {
  const [ colorRgbStr, colorOkLchStr ] = [ serializeRgb(colorData), serializeDisplayP3(colorData) ];
  const colorUniqueKey = `${colorRgbStr}/${colorOkLchStr}`;
  const colorIdent = getIdentColorName(colorData);

  let strNode = stringifyCssComp(node);
  if (isCompToken(node))
    strNode = strNode.toLowerCase();

  let paletteColor = palette.uniqueColors[colorUniqueKey];
  if (paletteColor === undefined) {
    const paletteVar = applyVarTransforms(colorIdent ?? roundStrNumbers(strNode), opts.paletteVarTransforms);
    paletteColor = {
      colorData,
      colorRgb: roundStrNumbers(stringifyCssComp(isColorDataFitsRgbGamut(colorData) ? colorRgbStr : colorOkLchStr)),
      colorOkLch: roundStrNumbers(stringifyCssComp(serializeOkLch(colorData))),
      colorStr: colorIdent ?? strNode,
      expr: "",
      count: 0,
      name: `--${opts.paletteVarPrefix}${paletteVar}`,
    };
    palette.colors.push(paletteColor);
    palette.uniqueColors[colorUniqueKey] = paletteColor;
  }
  paletteColor.count++;

  return paletteColor;
}

function recolorCompColor(node: CompColor, opts: Options): string {
  type cmp = string | boolean | number;

  const colorVar = (s: string, i: number) =>
    `var(--${opts.colorVarPrefix}${String.fromCharCode(s.charCodeAt(0) + i)})`;
  const colorComp = (c: string, b: cmp) =>
    typeof b === 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
  const colorOkLch = (orig: Comp, l: cmp, c: cmp, h: cmp) =>
    `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
  const colorAutoTheme = (orig: Comp, expr: cmp) =>
    `light-dark(${orig.toString()}, ${expr})`;

  return {
    get [ColorFormula.Dark]() { return colorOkLch(node, 1, 0, 0) },
    get [ColorFormula.DarkFull]() { return colorOkLch(node, 1, 1, 1) },
    get [ColorFormula.DarkAuto]() { return colorAutoTheme(node, this[ColorFormula.Dark]) },
    get [ColorFormula.DarkFullAuto]() { return colorAutoTheme(node, this[ColorFormula.DarkFull]) },
  }[opts.colorFormula];
}

function buildPaletteRule(palette: Palette): CssRule {
  return new CssRule({
    selector: ':root',
    nodes: palette.colors
      .orderByDescending(c => c.count, compare)
      .thenBy(c => c.colorRgb, compare)
      .selectMany(c => [
        new CssComment({ text: `!ath! color ${c.colorStr} n=${c.count} ${c.colorRgb} ${c.colorOkLch}` }),
        new CssDecl({ prop: c.name, value: c.expr }),
      ])
      .toArray(),
  });
}

function recolorCssAtRule(rule: CssAtRule): false | void {
  //console.log(`rule: ${rule.name} = ${rule.params}`);
  // TODO: Support animating colors with @keyframes (parse at-rules with https://github.com/postcss/postcss-at-rule-parser)
  if (rule.name === 'media' && reAtRuleMediaDark.test(rule.params) ||
    !reAtRuleMediaNameAllowed.test(rule.name)) {
    rule.remove();
  }
}

function recolorCssDecl(decl: CssDecl, palette: Palette, opts: Options): false | void {
  let newDeclProp = '-';
  let newDeclValue: string | null = null;
  let isComplexValue = false;
  const newComps = replaceCssComps(parseCssCompCommaList(tokenizeCss(decl.value)), (node: Comp) => {
    isComplexValue ||= isCompFunction(node) && !reColorFunction.test(node.getName());
    if (isCompFunction(node) && reColorFunction.test(node.getName()) || isCompTokenType(node, isTokenHashOrIdent)) {
      // TODO: Deal with color parser producing component value in color alpha property, plus other SyntaxFlag values
      const colorData = parseCssColor(node);
      if (!colorData) {
        isComplexValue = true;
        return;
      }

      const paletteColor: PaletteColor = getPaletteColor(colorData, palette, node, opts);
      const paletteStr = `var(${paletteColor.name})`;
      const recolorStr = recolorCompColor(node, opts);
      paletteColor.expr = recolorStr;
      const resultStr = opts.palette ? paletteStr : recolorStr;

      if (reColorPropSimple.test(decl.prop) || decl.variable || isComplexValue) {
        //console.log(`simple: ${decl.prop} = ${node.toString()}`);
        newDeclProp = decl.prop;
        return parseCssCompStr(resultStr);
      } else if (reColorPropSplit.test(decl.prop)) {
        //console.log(`split: ${decl.prop} = ... ${node.toString()} ...`);
        newDeclProp = `${decl.prop}-color`;
        newDeclValue = resultStr;
      } else if (reColorPropComplexSplit.test(decl.prop)) {
        // TODO: Split complex values like border( -width | -style | -color )
        newDeclProp = decl.prop;
        return parseCssCompStr(resultStr);
      } else {
        console.log(`unknown: ${decl.prop} = ${decl.value}`);
      }
    }
    return;
  });
  if (newDeclProp !== '-') {
    decl.cloneBefore({
      prop: newDeclProp,
      value: newDeclValue ?? stringifyCssComps(newComps),
      important: decl.important,
    });
  }
  decl.remove();
}

export default declarePostCssPlugin<RecolorPluginOptions>('recolor', {
  colorFormula: ColorFormula.DarkFull,
  colorVarPrefix: "",
  palette: true,
  paletteVarPrefix: "c-",
  paletteVarTransforms: [
    { find: '-var-', replace: '-', reFind: null! },
  ],
}, (opts: Options) => {
  for (const transform of opts.paletteVarTransforms)
    transform.reFind = regexp(transform.find, 'gi');
  return {
    OnceExit(css: CssRoot) {
      const palette: Palette = {
        colors: [],
        uniqueColors: {},
      };

      css.walkAtRules(rule => recolorCssAtRule(rule));
      css.walkDecls(decl => recolorCssDecl(decl, palette, opts));
      if (opts.palette)
        css.prepend(buildPaletteRule(palette));

      css.cleanRaws();

      const reAthComment = regex('i')` ^ \s* !ath! \s* `;
      css.walkComments(comment => {
        if (comment.parent?.nodes?.length == 1)
          comment.parent.remove();
        else if (reAthComment.test(comment.text))
          comment.text = comment.text.replace(reAthComment, "").trim();
        else
          comment.remove();
      });
    }
  };
});