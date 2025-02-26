import { regex, pattern as re } from 'regex';
import {
  Comment as CssComment,
  Declaration as CssDecl,
  Rule as CssRule,
  Root as CssRoot,
  AtRule as CssAtRule,
  Container as CssContainer,
} from 'postcss';
import {
  ComponentValue as CssCompValue,
  isTokenNode,
  parseCommaSeparatedListOfComponentValues as parseCssCompCommaList,
  replaceComponentValues as replaceCssComps,
  stringify as stringifyCssComps,
} from '@csstools/css-parser-algorithms';
import {
  isTokenHash, isTokenIdent, isTokenDelim, isTokenOpenSquare,
  tokenize as tokenizeCss,
  stringify as stringifyCss,
  HashType as CssHashType,
} from '@csstools/css-tokenizer';
import { parseCssCompStr, RegExpPattern } from './utils.js';

interface DerandomSelectorPluginOptions {
  classTransforms?: {
    find: string[];
    replace: string;
  }[];
}

function derandomSelectorPlugin(opts: DerandomSelectorPluginOptions = {}): { postcssPlugin: string; Once: (css: CssRoot) => void } {
  return {
    postcssPlugin: 'derandom-selector',
    Once(css: CssRoot) {
      opts = Object.assign({
        classTransforms: [
          {
            find: ['main=identSingleDash', '--', 'sub=identSingleDash', '--', 'hash=identSingleDash'],
            replace: '[class*="{main}--{sub}--"]',
          },
        ],
      }, opts);

      // https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/#token-diagrams
      const r: Record<string, RegExpPattern | RegExp> = {};
      r.newLine = re`(
        \n | \r\n | \r | \f
      )`;
      r.whiteSpace = regex`(
        \ | \t | ${r.newLine}
      )`;
      r.hexDigit = re`(
        [0-9a-f]
      )`;
      r.escape = regex`(
        \\ (
          ${r.hexDigit}{1,6} ${r.whiteSpace}? |
          ( (?! ${r.newLine} | ${r.hexDigit} ) . )
        )
      )`;
      r.whiteSpaceStar = regex`(
        ${r.whiteSpace}*
      )`;
      r.alpha = re`(
        [a-z_]
      )`;
      r.alphaDigit = re`(
        [a-z0-9_]
      )`;
      r.alphaDigitDash = re`(
        [a-z0-9_-]
      )`;
      r.identToken = regex`(
        (
          -- |
          -? ( ${r.alpha} | ${r.escape} )
        )
        (
          ${r.alphaDigitDash} | ${r.escape}
        )*
      )`;
      r.identSingleDash = regex`(
        (
          ${r.alpha} | ${r.escape}
        )
        (
          (?! -- )
          ${r.alphaDigitDash} | ${r.escape}
        )*
      )`;
      r.identNoDash = regex`(
        (
          ${r.alpha} | ${r.escape}
        )
        (
          ${r.alphaDigit} | ${r.escape}
        )*
      )`;
      // TODO: Support declarative derandom replacements
      //console.log(regex('i')`^${identToken}$`);
      css.walkRules((rule: CssRule) => {
        let didDerandom = false;

        // derandom classes
        let prevNode: CssCompValue;
        let newComps = replaceCssComps(parseCssCompCommaList(tokenizeCss({ css: rule.selector })), (node) => {
          if (
            isTokenNode(prevNode) && isTokenDelim(prevNode.value) && prevNode.value[4].value === "." &&
            isTokenNode(node) && isTokenIdent(node.value)
          ) {
            const className = node.value[4].value;
            const newSelector = className.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[class*="$1--$2--"]');
            if (newSelector !== className) {
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
            return !(isTokenDelim(token) && token[4].value === "." && isTokenOpenSquare(nextToken));
          });
        }

        // derandom ids
        newComps = replaceCssComps(parseCssCompCommaList(newTokens), (node) => {
          if (isTokenNode(node) && isTokenHash(node.value) && node.value[4].type === CssHashType.ID) {
            const idName = node.value[4].value;
            const newSelector = idName.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[id^="$1--$2--"]');
            if (newSelector !== idName) {
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
  };
}
derandomSelectorPlugin.postcss = true;

export default derandomSelectorPlugin;