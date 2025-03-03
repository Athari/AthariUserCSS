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
import { isTokenHash, isTokenIdent } from '@csstools/css-tokenizer';
import {
  CssRoot, CssContainer, CssAtRule, CssRule, CssDecl, CssComment,
  Comp,
  isCompFunction, isCompToken,
  tokenizeCss, parseCssCompStr, stringifyCssComp, parseCssCompCommaList, stringifyCssComps, replaceCssComps,
} from './domUtils.js';
import { ColorFormula } from './utils.js';

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

interface RecolorPluginOptions {
  colorFormula: ColorFormula;
  palette: boolean;
  paletteVarPrefix: string;
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

function recolorPlugin(opts: Partial<RecolorPluginOptions> = {}): { postcssPlugin: string, Once: (css: CssRoot) => void } {
  const opt: RecolorPluginOptions = Object.assign({
    colorFormula: ColorFormula.Dark,
    palette: true,
    paletteVarPrefix: "c-",
  } as RecolorPluginOptions, opts);
  return {
    postcssPlugin: 'recolor',
    Once(css: CssRoot) {
      const paletteUniqueColors: Record<string, PaletteColor> = {};
      const paletteColors: PaletteColor[] = [];

      const identifiableColorNotations = new Set([ColorNotation.HEX, ColorNotation.RGB, ColorNotation.HSL, ColorNotation.HWB]);
      const cssColorMap = Object.fromEntries(Object.entries(cssColorsNames).map(([name, [r, g, b]]) => [`${r}|${g}|${b}`, name]));
      const getIdentColorName = (color: ColorData): string | null => {
        const [r, g, b] = color.channels;
        if (r === 0 && g === 0 && b === 0 && color.alpha === 0)
          return 'transparent';
        if (color.alpha !== 1 || !identifiableColorNotations.has(color.colorNotation))
          return null;
        return cssColorMap[`${255 * r}|${255 * g}|${255 * b}`] ?? null;
      };

      css.walkAtRules((rule: CssAtRule) => {
        //console.log(`rule: ${rule.name} = ${rule.params}`);
        // TODO: Support animating colors with @keyframes (parse at-rules with https://github.com/postcss/postcss-at-rule-parser)
        if (
          rule.name === 'media' && reAtRuleMediaDark.test(rule.params) ||
          !reAtRuleMediaNameAllowed.test(rule.name)
        ) {
          rule.remove();
        }
      });

      css.walkDecls((decl: CssDecl) => {
        let newDeclProp = '-';
        let newDeclValue: string | null = null;
        let isComplexValue = false;
        const newComps = replaceCssComps(parseCssCompCommaList(tokenizeCss(decl.value)), (node: Comp) => {
          isComplexValue ||= isCompFunction(node) && !reColorFunction.test(node.getName());
          if (
            isCompFunction(node) && reColorFunction.test(node.getName()) ||
            isCompToken(node) && (isTokenHash(node.value) || isTokenIdent(node.value))
          ) {
            // TODO: Deal with color parser producing component value in color alpha property, plus other SyntaxFlag values
            const colorData = parseCssColor(node);
            if (!colorData) {
              isComplexValue = true;
              return;
            }

            let strNode = stringifyCssComp(node);
            const [colorRgbStr, colorOkLchStr] = [serializeRgb(colorData), serializeDisplayP3(colorData)];
            let colorUniqueKey = `${colorRgbStr}/${colorOkLchStr}`;
            const colorIdent = getIdentColorName(colorData);
            if (isCompToken(node))
              strNode = strNode.toLowerCase();
            let paletteColor = paletteUniqueColors[colorUniqueKey];
            if (paletteColor === undefined) {
              const paletteVarName = colorIdent ?? roundStrNumbers(strNode)
                .replace(/\./ig, "_").replace(/[^\w\d-]/ig, "-").replace(/-+/g, "-").replace(/^-?(.*?)-?$/, "$1")
                .toLowerCase();
              paletteColor = {
                colorData,
                colorRgb: roundStrNumbers(stringifyCssComp(isColorDataFitsRgbGamut(colorData) ? colorRgbStr : colorOkLchStr)),
                colorOkLch: roundStrNumbers(stringifyCssComp(serializeOkLch(colorData))),
                colorStr: colorIdent ?? strNode,
                expr: "",
                count: 0,
                name: `--${opt.paletteVarPrefix}${paletteVarName}`,
              };
              paletteColors.push(paletteColor);
              paletteUniqueColors[colorUniqueKey] = paletteColor;
            }
            paletteColor.count++;
            const paletteResult = `var(${paletteColor.name})`;

            type cmp = string | boolean | number;
            const colorVarPrefix = '';
            const colorVar = (s: string, i: number) =>
              `var(--${colorVarPrefix}${String.fromCharCode(s.charCodeAt(0) + i)})`;
            const colorComp = (c: string, b: cmp) =>
              typeof b === 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
            const colorOkLch = (orig: Comp, l: cmp, c: cmp, h: cmp) =>
              `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
            const colorAutoTheme = (orig: Comp, expr: cmp) =>
              `light-dark(${orig.toString()}, ${expr})`;
            const colorDark = colorOkLch(node, 1, 0, 0);
            const colorDarkAuto = colorAutoTheme(node, colorDark);
            const colorDarkFull = colorOkLch(node, 1, 1, 1);
            const colorDarkFullAuto = colorAutoTheme(node, colorDarkFull);
            const colorResult = {
              'dark': colorDark,
              'dark-full': colorDarkFull,
              'dark-auto': colorDarkAuto,
              'dark-full-auto': colorDarkFullAuto,
            }[opt.colorFormula] ?? colorDark;
            paletteColor.expr = colorResult;
            const cssResult = opts.palette ? paletteResult : colorResult;

            if (reColorPropSimple.test(decl.prop) || decl.variable || isComplexValue) {
              //console.log(`simple: ${decl.prop} = ${node.toString()}`);
              newDeclProp = decl.prop;
              return parseCssCompStr(cssResult);
            } else if (reColorPropSplit.test(decl.prop)) {
              //console.log(`split: ${decl.prop} = ... ${node.toString()} ...`);
              newDeclProp = `${decl.prop}-color`;
              newDeclValue = cssResult;
            } else if (reColorPropComplexSplit.test(decl.prop)) {
              // TODO: Split complex values like border(-width|-style|-color)
              newDeclProp = decl.prop;
              return parseCssCompStr(cssResult);
            } else {
              console.log(`unknown: ${decl.prop} = ${decl.value}`);
            }
          }
          return;
        });
        if (newDeclProp !== '-')
          decl.cloneBefore({ prop: newDeclProp, value: newDeclValue ?? stringifyCssComps(newComps), important: decl.important });
        decl.remove();
      });

      css.cleanRaws();

      const removeEmptyNodes = (node: CssContainer) => {
        if (!node.nodes)
          return;
        node.nodes = node.nodes.filter(child => {
          const isContainer = child.type == 'rule' || child.type == 'atrule';
          if (isContainer)
            removeEmptyNodes(child);
          return isContainer && (child.nodes?.length ?? 0) > 0 || child.type === 'decl';
        });
      };
      removeEmptyNodes(css);

      if (opts.palette) {
        css.prepend(
          new CssRule({
            selector: ':root',
            nodes: paletteColors
              .orderBy(c => c.count, (a, b) => b - a)
              .thenBy(c => c.colorRgb, (a, b) => a.localeCompare(b))
              .selectMany(c => [
                new CssComment({ text: `color ${c.colorStr} n=${c.count} ${c.colorRgb} ${c.colorOkLch}` }),
                new CssDecl({ prop: c.name, value: c.expr }),
              ])
              .toArray(),
          })
        );
      }
    }
  };
}
recolorPlugin.postcss = true;

export default recolorPlugin;