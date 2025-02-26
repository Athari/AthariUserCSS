import { regex, pattern as re } from 'regex'
import {
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

export function derandomSelectorPlugin(opts = {}) {
  return {
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
  };
}
derandomSelectorPlugin.postcss = true;