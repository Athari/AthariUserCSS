import fs from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';
import enquirer from 'enquirer';
import JSON5 from 'json5';
import { format as prettifyCode } from 'prettier';
import cssNanoPlugin from 'cssnano';
import cssNanoPresetDeault from 'cssnano-preset-default';
import autoPrefixerPlugin from 'autoprefixer';
import { initializeLinq } from 'linq-to-typescript'
import { regex, pattern as re } from 'regex'
import cssColorsNames from 'color-name';
import S from 'string';
import monkeyutils from '@athari/monkeyutils'
const { isString, assignDeep, throwError, withTimeout } = monkeyutils;
import {
  Command,
  Option as CommandOption,
} from 'commander';
import postCss, {
  Comment as CssComment,
  Declaration as CssDecl,
  Rule as CssRule,
} from 'postcss';
import cssSafeParser from 'postcss-safe-parser';
import cssSelectorParser from 'postcss-selector-parser';
const {
  isAttribute: isSelAttribute,
  isCombinator: isSelCombinator,
  isContainer: isSelContainer,
  isNode: isSelNode,
  isPseudo: isSelPseudo,
  isRoot: isSelRoot,
  isSelector: isSelSelector,
} = cssSelectorParser;
import {
  selectorSpecificity as getCssSelSpecificity,
  compare as compareCssSelSpecificity,
} from '@csstools/selector-specificity'
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
  parseComponentValue as parseCssComp,
  replaceComponentValues as replaceCssComps,
  stringify as stringifyCssComps,
} from '@csstools/css-parser-algorithms';
import {
  isTokenHash, isTokenIdent, isTokenDelim, isTokenOpenSquare,
  tokenize as tokenizeCss,
  stringify as stringifyCss,
  HashType as CssHashType,
} from '@csstools/css-tokenizer';
import {
  parseDocument as parseHtmlDocument,
} from 'htmlparser2';
import {
  Document as HtmlDocument,
  Node as HtmlNode,
  Element as HtmlElement,
  Text as HtmlText,
  isTag as isHtmlElement,
  isText as isHtmlText,
  hasChildren as hasHtmlChildren,
} from 'domhandler';
import {
  selectOne as htmlSelectOne,
  selectAll as htmlSelectAll,
} from 'css-select';
import {
  textContent as htmlInnerText,
} from 'domutils';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import NetscapeCookieStore from './tough-cookie-netscape.js';

initializeLinq();
S.extendPrototype();
String.prototype.ellipsis = function (maxLength) {
  return this.length > maxLength ? this.substring(0, maxLength - 3) + "..." : this;
};

const downloadTimeout = 30000;

const readTextFile = (path) => fs.readFile(path, 'utf-8');

console.log(`Loading cookies...`);
const netscapeCookies = new NetscapeCookieStore('./cookies.txt', { alwaysWrite: false });
const memoryCookies = new MemoryCookieStore();
netscapeCookies.export(memoryCookies);
const fetchCookie = makeFetchCookie(fetch, new CookieJar(memoryCookies));

const downloadText = async (url, init = {}) => {
  const response =  await withTimeout(fetchCookie(url, Object.assign(init, {
    headers: {
      'accept': "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      // TODO: Accept gzip encoding
      //'accept-encoding': "gzip, deflate, br, zstd",
      'accept-language': "en-US,en",
      'user-agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    },
  })), downloadTimeout);
  if (!response.ok) {
    console.error(`WARNING: Failed to download ${url}`);
    return null;
  }
  return await response.text();
};

const stringifyNode = node => stringifyCss(...node.tokens());
const parseCssCompStr = css => parseCssComp(tokenizeCss({ css }));
const roundStrNumbers = s => s.replace(/(\d+\.\d+|\d+\.|\.\d+)/g,
  (_, d) => (+d).toFixed(2).replace(/(\.\d*)0+$/, "$1").replace(/\.0+$/, ""));

const mergeSimilarSelectorsPlugin = (opts = {}) => {
  opts = Object.assign({
    pseudo: ':is',
    unsafe: false,
  }, opts);

  const reIsValue = regex('i')`
    ^ :
    ( - ( webkit | moz | ms ) - )?
    ( is | any | matches ) $
  `;
  const defaultPrintHeadWidth = 40;
  const defaultPrintCssWidth = 80;

  const removeSelectorComments = (root) => {
    root.walkComments(comment => {
      console.log(`comment "${comment.value}"`);
      comment.remove();
    });
  };

  const printNodeHead = (node, headWidth = defaultPrintHeadWidth) => (
    node.value === undefined ? node.type :
    isSelCombinator(node) ? `"${node.value}"` :
    isSelAttribute(node) ? `${node.type} "${node.attribute}" ${node.operator}${node.insensitiveFlag} "${node.value}"` :
    `${node.type} "${node.value}"`
  ).padRight(headWidth);

  const printNodeHeadFull = (node, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth) =>
    printNodeHead(node, headWidth) + ` -> ${node.toString().ellipsis(cssWidth)}`;

  const printNode = (root, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth) => {
    const indentStr = "  ";
    const printNodeProc = (node, indent = "") => [
      `${indent}${printNodeHeadFull(node, headWidth, cssWidth)}`,
      ...isSelContainer(node) ? node.map(n => printNodeProc(n, indent + indentStr)) : [],
    ].join("\n");
    return printNodeProc(root);
  };

  const areNodesEqual = (a, b) => a.toString() == b.toString();

  const areNodeHeadersEqual = (a, b) => {
    if (a.type != b.type)
      return false;
    else if (isSelPseudo(a))
      return a.value == b.value;
    else if (!isSelContainer(a))
      return areNodesEqual(a, b);
    else
      throw new Error("Should not be comparing those");
  };

  const areNodesCompatible = (a, b, specA, specB) => {
    if (areNodeHeadersEqual(a, b))
      return true;
    if (a.type == b.type)
      return true;
    specA ??= getCssSelSpecificity(a);
    specB ??= getCssSelSpecificity(b);
    if (!compareCssSelSpecificity(specA, specB))
      return false;
    // TODO:> Check compat properly
    return a.type == b.type;
  };

  class TrieNode {
    /** @const {string} */
    type = 'trie'
    /** @type {TrieVariant[]} */
    variants = []
    /** @type {TrieNode[]} */
    tries = []
    /** @param {Partial<TrieNode>} init */
    constructor(init) { Object.assign(this, init) }
  }

  class TrieVariant {
    type = 'variant'
    /** @type {import('postcss-selector-parser').Selector} */
    selector
    /** @type {import('postcss-selector-parser').Node} */
    node
    /** @type {import('@csstools/selector-specificity').Specificity} */
    //specificity
    /** @param {Partial<TrieVariant>} init */
    constructor(init) { Object.assign(this, init) }
  }

  const printTrie = (trie) =>
    JSON5.stringify(trie, {
      quote: false,
      space: "  ",
      replacer: (k, v) => {
        if (isSelNode(v))
          return k != 'selector' ? printNodeHeadFull(v) : undefined;
        if (v instanceof TrieVariant)
          return printNodeHeadFull(v.node);
        if (k == 'type' || v instanceof Array && v.length == 0)
          return undefined;
        return v;
      },
    });

  /** @param {import('postcss-selector-parser').Root} root */
  const mergeSimilarSelectors = (root) => {
    const trieRoot = new TrieNode();

    /** 
     * @param {import('postcss-selector-parser').Node} node
     * @param {TrieNode} trie */
    const mergeByPrefix = (node, trie) => {
      if (isSelRoot(node)) {
        trie.variants.push(new TrieVariant({ node }));
        node.each(sel => {
          mergeByPrefix(sel, trie);
        });
      } else if (isSelSelector(node)) {
        let currentTrie = trie;
        node.each(part => {
          let compatTrie = currentTrie.tries.find(t => t.variants.some(v => areNodesCompatible(v.node, part)));
          if (!compatTrie) {
            compatTrie = new TrieNode();
            currentTrie.tries.push(compatTrie);
          }
          if (compatTrie.variants.every(v => !areNodesEqual(v.node, part))) {
            compatTrie.variants.push(new TrieVariant({ selector: node, node: part }));
          }
          currentTrie = compatTrie;
          if (isSelContainer(part))
            mergeByPrefix(part, compatTrie);
        })
      } else if (isSelContainer(node)) {
        // TODO:> Process container node
      } else if (isSelPseudo(node)) {
        // TODO: Pseudo: split :is, chain others
      } else {
        throw new Error("unexpected?");
      }
    };
    mergeByPrefix(root, trieRoot);
    console.log(printTrie(trieRoot));
  };

  return {
    postcssPlugin: 'merge-similar-selectors',
    Rule(rule) {
      if (rule.selectors.length <= 1)
        return;
      cssSelectorParser((root) => {
        console.log(printTrie(new TrieVariant({ node: root })));
        removeSelectorComments(root);
        console.log(printNode(root));
        mergeSimilarSelectors(root);
      }).processSync(rule, { lossless: false });
    }
  };
};
mergeSimilarSelectorsPlugin.postcss = true;

const derandomSelectorPlugin = (opts = {}) => ({
  postcssPlugin: 'derandom-selector',
  Once(css) {
    opts = Object.assign({
      classTransforms: [
        {
          find: [ 'main=identSingleDash', '--', 'sub=identSingleDash', '--', 'hash=identSingleDash' ],
          replace: '[class*="{main}--{sub}--"]',
        },
      ],
    }, opts);

    // https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/#token-diagrams
    const r = {};
    r.newLine = re`(
      \n | \r\n | \r | \f
    )`;
    r.whiteSpace = re`(
      \ | \t | ${r.newLine}
    )`;
    r.hexDigit = re`(
      [ 0-9 a-f ]
    )`;
    r.escape = re`(
      \\ (
        ${r.hexDigit}{1,6} ${r.whiteSpace}? |
        ( (?! ${r.newLine} | ${r.hexDigit} ) . )
      )
    )`;
    r.whiteSpaceStar = re`(
      ${r.whiteSpace}*
    )`;
    r.alpha = re`(
      [ a-z _ ]
    )`;
    r.alphaDigit = re`(
      [ a-z 0-9 _ ]
    )`;
    r.alphaDigitDash = re`(
      [ a-z 0-9 _ - ]
    )`;
    r.identToken = re`(
      (
        -- |
        -? ( ${r.alpha} | ${r.escape} )
      )
      (
        ${r.alphaDigitDash} | ${r.escape}
      )*
    )`;
    r.identSingleDash = re`(
      (
        ${r.alpha} | ${r.escape}
      )
      (
        (?! -- )
        ${r.alphaDigitDash} | ${r.escape}
      )*
    )`;
    r.identNoDash = re`(
      (
        ${r.alpha} | ${r.escape}
      )
      (
        ${r.alphaDigit} | ${r.escape}
      )*
    )`;
    // TODO: Support declarative derandom replacements
    //console.log(regex('i')`^${identToken}$`);
    css.walkRules(rule => {
      let didDerandom = false;

      // derandom classes
      let prevNode = null;
      let newComps = replaceCssComps(parseCssCompCommaList(tokenizeCss({ css: rule.selector })), (node) => {
        if (
          isTokenNode(prevNode) && isTokenDelim(prevNode?.value) && prevNode.value[4].value == "." &&
          isTokenNode(node) && isTokenIdent(node.value)
        ) {
          const className = node.value[4].value;
          const newSelector = className.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[class*="$1--$2--"]');
          if (newSelector != className) {
            didDerandom = true;
            return parseCssCompStr(newSelector);
          }
        }
        prevNode = node;
      });

      let newTokens = tokenizeCss({ css: stringifyCssComps(newComps) });
      if (didDerandom) {
        newTokens = newTokens.filter((token, i) => {
          const nextToken = newTokens[i + 1];
          return !(isTokenDelim(token) && token[4].value == "." && isTokenOpenSquare(nextToken));
        });
      }

      // derandom ids
      newComps = replaceCssComps(parseCssCompCommaList(newTokens), (node) => {
        if (isTokenNode(node) && isTokenHash(node.value) && node.value[4].type == CssHashType.ID) {
          const idName = node.value[4].value;
          const newSelector = idName.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[id^="$1--$2--"]');
          if (newSelector != idName) {
            didDerandom = true;
            return parseCssCompStr(newSelector);
          }
        }
        prevNode = node;
      });

      if (didDerandom)
        rule.selector = stringifyCssComps(newComps);
    });
  }
});
derandomSelectorPlugin.postcss = true;

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|tap-highlight|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;
const reAtRuleMediaDark = /prefers-color-scheme\s*:\s*dark/i;
const reAtRuleMediaNameAllowed = /container|media|scope|starting-style|supports/i;

const recolorPlugin = (opts = {}) => ({
  postcssPlugin: 'recolor',
  Once(css) {
    // TODO: Disable palette gen by default
    opts = Object.assign({ colorFormula: 'dark', palette: true }, opts);

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
});
recolorPlugin.postcss = true;

const basePrettierOptions = {
  tabWidth: 2, endOfLine: 'cr',
  htmlWhitespaceSensitivity: 'ignore',
  trailingComma: 'all', bracketSpacing: true, semi: true,
};

const prettifyCodeSafe = async (filepath, source, options) => {
  try {
    const pretty = await prettifyCode(source, { filepath, ...basePrettierOptions, ...options });
    return pretty.trimEnd();
  } catch (ex) {
    console.log(`Failed to prettify ${filepath}, keeping formatting`);
    console.log(`${ex.message}\n${ex.stack}`);
    return source.trimEnd();
  }
};

const prettifyCss = async (filepath, css) => (await prettifyCodeSafe(filepath, css, { printWidth: 999 }));

const prettifyHtml = async (filepath, html) => (await prettifyCodeSafe(filepath, html, { printWidth: 160 }));

const getSiteDir = async (siteName) => {
  const siteDir = `./sites/${siteName}`;
  fs.mkdir(siteDir, { recursive: true });
  return await fs.realpath(siteDir);
}

const downloadSiteHtml = async (siteName, site) => {
  const siteDir = await getSiteDir(siteName);

  const addSiteCss = (css) => {
    site.css ??= [];
    // TODO: Specify CSS source for debugging
    if (css.url && site.css.some(c => c.url == css.url))
      return false;
    site.css.push(css);
    return true;
  };

  const prettifyOneSiteHtml = async (html) => {
    const pathPretty = html.path.replace(/\.html$/i, ".pretty.html");
    const textPretty = await prettifyHtml(html.path, html.text);
    await fs.writeFile(pathPretty, textPretty);
    console.log(`Prettier HTML written to ${pathPretty}`);
  };

  const downloadOneSiteHtml = async (html) => {
    html.path = `${siteDir}/${html.name}`;
    console.log(`Downloading HTML ${html.url}`);
    html.text = await downloadText(html.url);
    if (!html.text) {
      delete html.path;
      return;
    }
    await fs.writeFile(html.path, html.text);
    console.log(`HTML written to ${html.path}`);
    await prettifyOneSiteHtml(html);
  };

  const readOneSiteHtml = async (html) => {
    html.text = await readTextFile(html.path);
    console.log(`Original HTML read from ${html.path}`);
    await prettifyOneSiteHtml(html);
  };

  const parseLinkedCss = async (doc, html) => {
    for (const elLinkCss of htmlSelectAll('link[rel="stylesheet"]', doc)) {
      if (!isHtmlElement(elLinkCss))
        continue;
      const cssUrl = new URL(elLinkCss.attribs.href, html.url).toString();
      let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1];
      cssName = cssName.replace(/[^\w\d\._-]/ig, "");
      if (!cssName.match(/\.css$/i))
        cssName += ".css";
      if (addSiteCss({ name: cssName, url: cssUrl }))
        console.log(`Found CSS link '${cssName}' ${cssUrl}`);
    }
  };

  const parseEmbeddedCss = async (doc, html) => {
    let iEmbedStyle = 1;
    for (const elStyle of htmlSelectAll('style:is([type="text/css"], [type=""], :not([type]))', doc)) {
      if (!isHtmlElement(elStyle))
        continue;
      const cssText = htmlInnerText(elStyle).trim();
      const cssName = html.name.replace(/\.html$/i, `.embed${iEmbedStyle}.css`);
      const cssPath = `${siteDir}/${cssName}`;
      await fs.writeFile(cssPath, cssText);
      if (addSiteCss({ name: cssName, path: cssPath, text: cssText }))
        console.log(`Found embedded CSS '${cssName}'`);
      iEmbedStyle++;
    }
  };

  const parseNextJSBuildManifest = async (doc, html) => {
    let elBuildManifest = htmlSelectOne('script[src$="buildManifest.js" i]', doc);
    if (!elBuildManifest || !isHtmlElement(elBuildManifest))
      return;

    const manifestUrl = new URL(elBuildManifest.attribs.src, html.url).toString();
    console.log(`Found Next.js build manifest ${manifestUrl}`);

    const manifestCode = await downloadText(manifestUrl);
    if (!manifestCode)
      return;
    const manifestPath = `${siteDir}/buildManifest.js`;
    await fs.writeFile(manifestPath, manifestCode);

    const manifestCtx = { };
    const initCode = `var self = globalThis;`;
    vm.runInNewContext(`${initCode}\n\n${manifestCode}`, manifestCtx, {
      filename: manifestUrl,
      timeout: 10000,
    });
    const manifest = manifestCtx.__BUILD_MANIFEST;
    if (!manifest)
      return;

    const nextJSRouteToPath = (path) => path.substring(1)
      .replace(/\.+/g, '.').replace(/-+/g, '-')
      .replace(/[^a-z0-9\[\]\/#_+-]/ig, '').replace(/\//g, '--');

    console.log(manifestCtx);
    const csss = Object.entries(manifest)
      .flatMap(([ route, chunkUrls ]) =>
        route.startsWith("/")
          ? chunkUrls
            .filter(u => u.match(/\.css$/i))
            .map((url, index) => ({
              name: `${nextJSRouteToPath(route)}-${index}.css`,
              url: new URL(`../../${url}`, manifestUrl).toString(),
            }))
          : [])
      .groupBy(c => c.url, c => c.name, (url, names) => ({
        url,
        name: names.orderBy(n => n.length, (a, b) => a - b).first(),
      }))
      .selectMany(c => c)
      .toArray();
    for (const css of csss)
      if (addSiteCss(css))
        console.log(`Found Next.js CSS chunk '${css.name}' ${css.url}`);
  };

  const parseWebpackMiniCssChunks = async (doc, html) => {
    const elWebpack = htmlSelectOne('script[src*="webpack" i][src$=".js" i]', doc);
    if (!elWebpack || !isHtmlElement(elWebpack))
      return;

    const webpackUrl = new URL(elWebpack.attribs.src, html.url).toString();
    console.log(`Found WebPack script ${webpackUrl}`);

    let webpackCode = await downloadText(webpackUrl);
    if (!webpackCode)
      return;
    // TODO: Find a proper pattern for webpack miniCss hook
    webpackCode = webpackCode.replace("h.nc=void 0", "self.webpack = h;");
    const webpackPath = `${siteDir}/webpack.js`;
    await fs.writeFile(webpackPath, webpackCode);

    const initCode = `var self = globalThis;`;
    const webpackCtx = { };
    vm.runInNewContext(`${initCode}\n\n${webpackCode}`, webpackCtx, {
      filename: webpackUrl,
      timeout: 10000,
    });
    const webpack = webpackCtx.webpack;
    if (!webpack)
      return;

    console.log("webpack", webpack);
    const urlPrefix = Object.values(webpack).filter(v => isString(v) && v.startsWith("https://"))[0];
    let emptyUrlCount = 0;
    for (let iChunk = 0; iChunk < 1_000_000; iChunk++) {
      const cssUrl = urlPrefix + webpack.miniCssF(iChunk);
      if (cssUrl.includes('undefined')) {
        emptyUrlCount++;
        if (emptyUrlCount > 100_000)
          return;
        continue;
      }
      emptyUrlCount = 0;
      const cssName = basename(cssUrl);
      if (addSiteCss({ name: cssName, url: cssUrl }))
        console.log(`Found Next.js CSS chunk #${iChunk} '${cssName}' ${cssUrl}`);
    }
  };

  for (const html of site.html.filter(h => h.url && !h.path && !h.text))
    await downloadOneSiteHtml(html);
  for (const html of site.html.filter(h => h.path && !h.text))
    await readOneSiteHtml(html);
  site.html = site.html.filter(c => c.text);

  for (const html of site.html) {
    const doc = parseHtmlDocument(html.text);
    await parseNextJSBuildManifest(doc, html);
    await parseWebpackMiniCssChunks(doc, html);
    await parseLinkedCss(doc, html);
    await parseEmbeddedCss(doc, html);
  }
};

const recolorCss = async (inputPath, outputPath, opts) => {
  const runPostCss = async (css, plugins) => {
    const result = await postCss(plugins).process(css, { from: inputPath, parser: cssSafeParser });
    for (const message of result.messages)
      //console.log(message);
      console.log(`  ${message.plugin}: ${message.type} ${message.node?.toString()}`);
    return result;
  };
  const inputCss = await readTextFile(inputPath);
  let result = await runPostCss(inputCss, [
    autoPrefixerPlugin({ add: false }),
    cssNanoPlugin({
      preset: [
        cssNanoPresetDeault({
          //discardComments: false,
        }),
      ],
    }),
  ]);
  // TODO: Split plugin options
  result = await runPostCss(result.css, [
    mergeSimilarSelectorsPlugin(opts),
    derandomSelectorPlugin(opts),
    recolorPlugin(opts),
  ]);

  const outputCssPretty = await prettifyCss(outputPath, result.css);
  const outputCssUserstyle = (opts.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Transformed CSS written to ${outputPath}`);
};

const recolorSiteCss = async (siteName, site) => {
  const { options } = site;
  const siteDir = await getSiteDir(siteName);

  const prettifyOneSiteCss = async (css) => {
    const pathPretty = css.path.replace(/\.css$/i, ".pretty.css");
    const textPretty = await prettifyCss(css.path, css.text);
    await fs.writeFile(pathPretty, textPretty);
    css.text = textPretty;
    console.log(`Prettier CSS written to ${pathPretty}`);
  };

  const downloadOneSiteCss = async (css) => {
    css.path = `${siteDir}/${css.name}`;
    console.log(`Downloading CSS ${css.url}`);
    css.text = await downloadText(css.url, 'text');
    if (!css.text) {
      delete css.path;
      return;
    }
    await fs.writeFile(css.path, css.text);
    console.log(`Original CSS written to ${css.path}`);
    await prettifyOneSiteCss(css);
  };

  const readOneSiteCss = async (css) => {
    css.text = await readTextFile(css.path);
    console.log(`Original CSS read from ${css.path}`);
    await prettifyOneSiteCss(css);
  };

  const recolorOneSiteCss = async (css, extraHeaderLines) => {
    const outputPath = css.path.replace(/\.css$/i, ".out.css");
    const headerLines = [
      "generated",
      `formula: ${options.colorFormula ?? 'dark'}`,
      `site: ${siteName}`,
      ...extraHeaderLines,
    ].map(s => ` * ${s}\n`).join("");
    await recolorCss(css.path, outputPath, Object.assign(options, {
      header: `/*\n${headerLines} */\n`,
    }));
  };

  const getCssHeader = ({ name, path, url }) => [
    `name: ${name}`,
    !url && path ? `path: ${basename(path)}` : null,
    url ? `url: ${url}` : null,
  ].filter(s => s);

  for (const css of site.css.filter(c => c.url && !c.path && !c.text))
    await downloadOneSiteCss(css);
  for (const css of site.css.filter(c => c.path && !c.text))
    await readOneSiteCss(css);
  site.css = site.css.filter(c => c.text);

  if (options.combine) {
    const combinedCss = {
      path: `${siteDir}/_.css`,
      text: site.css.map(c => c.text).join("\n"),
    };
    await fs.writeFile(combinedCss.path, combinedCss.text);
    console.log(`Combined prettier CSS written to ${combinedCss.path}`);
    await recolorOneSiteCss(combinedCss, site.css.flatMap(getCssHeader));
  }
  else {
    for (const css of site.css)
      await recolorOneSiteCss(css, getCssHeader(css));
  }
};

const validateRequired = (name) => (input) => input ? true : `Argument ${name} cannot be empty`;

const question = (type, a, name, message, opts, cfg) =>
  Object.assign(cfg ?? {}, {
    type, name, message,
    skip: () => !!a[name],
    initial: () => a[name] ?? opts.initial?.(),
    result: v => a[name] = v,
    validate: validateRequired(name),
  });

const questionInput = (a, name, message, opts) =>
  question('input', a, name, message, opts ?? {});

const questionSelect = (a, name, message, opts) =>
  question('select', a, name, message, opts ?? {}, {
    choices: opts.choices,
  });

const loadJson = async (path) => JSON5.parse(await readTextFile(path));

const jsonPackage = await loadJson("./package.json");
const jsonSites = await loadJson("./sites.json");

const program = new Command();
const optionColorFormula = new CommandOption('-c, --color-formula', "Color transform formula")
  .choices([ 'dark', 'dark-full', 'dark-auto', 'dark-full-auto' ]);

program
  .name('recolor')
  .version(jsonPackage.version)
  .description(jsonPackage.description);

program
  .command('recolor-css [inputPath] [outputPath]')
  .description("Recolor CSS file")
  .addOption(optionColorFormula)
  .action(async (inputPath, outputPath, o) => {
    const a = Object.assign(o, { inputPath, outputPath });
    if (!a.inputPath?.length) {
      await enquirer.prompt([
        questionInput(a, 'inputPath', "Path to input CSS file:"),
        questionInput(a, 'outputPath', "Path to output CSS file:", {
          initial() {
            const autoOutputPath = a.inputPath.replace(/\.css$/i, '.out.css');
            return a.inputPath != autoOutputPath ? autoOutputPath : undefined;
          }
        }),
      ]);
    }
    await recolorCss(a.inputPath, a.outputPath, { ...a });
  });

program
  .command('recolor-site-css [siteName]')
  .description("Recolor all CSS files of a site defined in sites.json")
  .addOption(optionColorFormula)
  .action(async (siteName, o) => {
    const a = Object.assign(o, { siteName });
    if (!a.siteName?.length) {
      await enquirer.prompt([
        questionSelect(a, 'siteName', "Site to download CSS from:", {
          choices: Object.keys(jsonSites),
        }),
      ]);
    }
    const site = assignDeep(
      { options: {}, html: [], css: [] },
      jsonSites[a.siteName] ?? throwError(`Site ${a.siteName} not found`));
    site.options.colorFormula ??= o.colorFormula;
    site.options.palette ??= o.palette;
    site.options.combine ??= o.combine;
    if (!site.options.colorFormula) {
      await enquirer.prompt([
        questionSelect(site.options, optionColorFormula.attributeName(), optionColorFormula.description, {
          choices: optionColorFormula.argChoices,
        })
      ]);
    }
    console.log("Site config: ", a.siteName, site);
    await downloadSiteHtml(a.siteName, site);
    await recolorSiteCss(a.siteName, site);
  });

program
  .command('version')
  .description("Show version")
  .action(() => {
    console.log(jsonPackage.version);
  });

try {
  if (process.argv[2] == undefined) {
    program.outputHelp();
    process.exit(1);
  }
  await program.parseAsync(process.argv);
} catch (ex) {
  console.error(`Error running command "${process.argv[2] ?? '<?>'}": ${ex.message}\n${ex.stack}`);
  process.exit(1);
}