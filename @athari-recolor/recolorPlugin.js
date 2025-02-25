import cssColorsNames from 'color-name';
import {
  Comment as CssComment,
  Declaration as CssDecl,
  Rule as CssRule,
} from 'postcss';
import {
  color as parseCssColor,
  serializeRGB as serializeRgb,
  serializeOKLCH as serializeOkLch,
  serializeP3,
  colorDataFitsRGB_Gamut as colorDataFitsRgbGamut,
  ColorNotation,
} from '@csstools/css-color-parser';
import {
  isFunctionNode, isTokenNode,
  parseCommaSeparatedListOfComponentValues as parseCssCompCommaList,
  replaceComponentValues as replaceCssComps,
  stringify as stringifyCssComps,
} from '@csstools/css-parser-algorithms';
import {
  isTokenHash, isTokenIdent,
  tokenize as tokenizeCss,
} from '@csstools/css-tokenizer';
import { parseCssCompStr, stringifyNode } from './utils.js';

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|tap-highlight|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;
const reAtRuleMediaDark = /prefers-color-scheme\s*:\s*dark/i;
const reAtRuleMediaNameAllowed = /container|media|scope|starting-style|supports/i;

function roundStrNumbers(s) {
  return s.replace(/(\d+\.\d+|\d+\.|\.\d+)/g,
    (_, d) => (+d).toFixed(2).replace(/(\.\d*)0+$/, "$1").replace(/\.0+$/, ""));
}

export function recolorPlugin(opts = {}) {
  // TODO: Disable palette gen by default
  opts = Object.assign({ colorFormula: 'dark', palette: true }, opts);
  return {
    postcssPlugin: 'recolor',
    Once(css) {
      const palette = {
        uniqueColors: {},
        colors: [],
      };
      const paletteVarPrefix = 'c';

      const identifiableColorNotations = new Set([ ColorNotation.HEX, ColorNotation.RGB, ColorNotation.HSL, ColorNotation.HWB ]);
      const cssColorMap = Object.fromEntries(Object.entries(cssColorsNames).map(([ name, [ r, g, b ] ]) => [ `${r}|${g}|${b}`, name ]));
      const getIdentColorName = color => {
        const [ r, g, b ] = color.channels;
        if (r == 0 && g == 0 && b == 0 && color.alpha == 0)
          return 'transparent';
        if (color.alpha !== 1 || !identifiableColorNotations.has(color.colorNotation))
          return null;
        return cssColorMap[`${255 * r}|${255 * g}|${255 * b}`] ?? null;
      };

      css.walkAtRules(rule => {
        //console.log(`rule: ${rule.name} = ${rule.params}`);
        // TODO: Support animating colors with @keyframes (parse at-rules with https://github.com/postcss/postcss-at-rule-parser)
        if (
          rule.name == 'media' && reAtRuleMediaDark.test(rule.params) ||
          !reAtRuleMediaNameAllowed.test(rule.name)
        ) {
          rule.remove();
        }
      });

      css.walkDecls(decl => {
        let newDeclProp = '-';
        let newDeclValue = null;
        let isComplexValue = false;
        const newComps = replaceCssComps(parseCssCompCommaList(tokenizeCss({ css: decl.value })), (node) => {
          isComplexValue ||= isFunctionNode(node) && !reColorFunction.test(node.getName());
          if (
            isFunctionNode(node) && reColorFunction.test(node.getName()) ||
            isTokenNode(node) && (isTokenHash(node.value) || isTokenIdent(node.value))
          ) {
            // TODO: Deal with color parser producing component value in color alpha property, plus other SyntaxFlag values
            const colorData = parseCssColor(node);
            if (!colorData) {
              isComplexValue = true;
              return;
            }

            let strNode = stringifyNode(node);
            const [ colorRgbStr, colorOkLchStr ] = [ serializeRgb(colorData), serializeP3(colorData) ];
            let colorUniqueKey = `${colorRgbStr}/${colorOkLchStr}`;
            const colorIdent = getIdentColorName(colorData);
            if (isTokenNode(node))
              strNode = strNode.toLowerCase();
            let paletteColor = palette.uniqueColors[colorUniqueKey];
            if (paletteColor === undefined) {
              const paletteVarName = colorIdent ?? roundStrNumbers(strNode)
                .replace(/\./ig, "_").replace(/[^\w\d-]/ig, "-").replace(/-+/g, "-").replace(/^-?(.*?)-?$/, "$1")
                .toLowerCase();
              paletteColor = {
                colorData,
                colorRgb: roundStrNumbers(stringifyNode(colorDataFitsRgbGamut(colorData) ? colorRgbStr : colorOkLchStr)),
                colorOkLch: roundStrNumbers(stringifyNode(serializeOkLch(colorData))),
                colorStr: colorIdent ?? strNode,
                expr: "",
                count: 0,
                name: `--${paletteVarPrefix}-${paletteVarName}`,
              };
              palette.colors.push(paletteColor);
              palette.uniqueColors[colorUniqueKey] = paletteColor;
            }
            paletteColor.count++;
            const paletteResult = `var(${paletteColor.name})`;

            const colorVarPrefix = '';
            const colorVar = (s, i) => `var(--${colorVarPrefix}${String.fromCharCode(s.charCodeAt(0) + i)})`;
            const colorComp = (c, b) => typeof b == 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
            const colorOkLch = (orig, l, c, h) => `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
            const colorAutoTheme = (orig, expr) => `light-dark(${orig.toString()}, ${expr})`;
            const colorDark = colorOkLch(node, 1, 0, 0);
            const colorDarkAuto = colorAutoTheme(node, colorDark);
            const colorDarkFull = colorOkLch(node, 1, 1, 1);
            const colorDarkFullAuto = colorAutoTheme(node, colorDarkFull);
            const colorResult = {
              'dark': colorDark,
              'dark-full': colorDarkFull,
              'dark-auto': colorDarkAuto,
              'dark-full-auto': colorDarkFullAuto,
            }[opts.colorFormula] ?? colorDark;
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
        });
        if (newDeclProp != '-')
          decl.cloneBefore({ prop: newDeclProp, value: newDeclValue ?? stringifyCssComps(newComps), important: decl.important });
        decl.remove();
      });

      css.cleanRaws();

      const removeEmptyNodes = (node) => {
        if (!node.nodes)
          return;
        node.nodes = node.nodes.filter(child => {
          removeEmptyNodes(child);
          return child.nodes?.length > 0 || child.type === 'decl';
        });
      };
      removeEmptyNodes(css);

      if (opts.palette) {
        css.prepend(
          new CssRule({
            selector: ':root',
            nodes: palette.colors
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