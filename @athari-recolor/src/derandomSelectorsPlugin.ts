import { regex } from 'regex';
import { isTokenHash, isTokenIdent, isTokenDelim, isTokenOpenSquare } from '@csstools/css-tokenizer';
import {
  CssRoot, CssRule,
  CssToken, Comp, CssHashType,
  isCompTokenType, isCompTokenTypeType, isCompTokenTypeValue,
  tokenizeCss, parseCssCompStr, parseCssCompCommaList, stringifyCssComps, replaceCssComps,
  declarePostCssPlugin,
} from './domUtils.ts';

export interface DerandomTransform {
  find: string[];
  replace: string;
};

export interface DerandomSelectorsPluginOptions {
  className: DerandomTransform[];
  id: DerandomTransform[];
}

// https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/#token-diagrams
const r = new class {
  newLine = regex('i')`
    \n | \r\n | \r | \f
  `;
  whiteSpace = regex('i')`
    \ | \t | ${this.newLine}
  `;
  digit = regex('i')`
    [ 0-9 ]
  `;
  hexDigit = regex('i')`
    [ 0-9 a-f ]
  `;
  escape = regex('i')`
    \\ (
      ${this.hexDigit}{1,6} ${this.whiteSpace}? |
      ( (?! ${this.newLine} | ${this.hexDigit} ) . )
    )
  `;
  whiteSpaceStar = regex('i')`
    ${this.whiteSpace}*
  `;
  alpha = regex('i')`
    [ a-z _ ]
  `;
  alphaNum = regex('i')`
    [ a-z 0-9 _ ]
  `;
  alphaNumDash = regex('i')`
    [ a-z 0-9 _ \- ]
  `;
  sign = regex('i')`
    [ \+ \- ]
  `;
  identToken = regex('i')`
    (
      -- |
      -? ( ${this.alpha} | ${this.escape} )
    )
    (
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  xIdentSingleDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      (?! -- )
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  xIdentNoDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      ${this.alphaNum} | ${this.escape}
    )*
  `;
  numberToken = regex('i')`
    ${this.sign}?
    (
      ( ${this.digit}+ \. ${this.digit}+ ) |
      ( \. ${this.digit}+ ) |
      ${this.digit}+
    )+
    (
      e
      ${this.sign}?
      ${this.digit}+
    )?
  `;
  dimToken = regex('i')`
    ${this.numberToken} ${this.identToken}
  `;
  percentToken = regex('i')`
    ${this.numberToken} %
  `;
}();

export default declarePostCssPlugin<DerandomSelectorsPluginOptions>('derandom-selectors', {
  className: [
    {
      find: ['main=identSingleDash', '--', 'sub=identSingleDash', '--', 'hash=identSingleDash'],
      replace: '[class*="{main}--{sub}--"]',
    },
  ],
  id: [],
}, (opts) => ({
  OnceExit(css: CssRoot) {
    console.log(regex('i')` ${r.newLine}+ `);
    // TODO: Support declarative derandom replacements
    //console.log(regex('i')`^${identToken}$`);
    css.walkRules((rule: CssRule) => {
      let didDerandom = false;

      // derandom classes
      let prevComp: Comp;
      let newComps: Comp[][] = replaceCssComps(parseCssCompCommaList(tokenizeCss(rule.selector)), (comp: Comp) => {
        if (isCompTokenTypeValue(prevComp, isTokenDelim, ".") && isCompTokenType(comp, isTokenIdent)) {
          const className = comp.value[4].value;
          const newSelector = className.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[class*="$1--$2--"]');
          if (newSelector !== className) {
            didDerandom = true;
            return parseCssCompStr(newSelector);
          }
        }
        prevComp = comp;
        return;
      });

      let newTokens: CssToken[] = tokenizeCss(stringifyCssComps(newComps));
      if (didDerandom) {
        newTokens = newTokens.filter((token, i) => {
          const nextToken = newTokens[i + 1];
          return !(isTokenDelim(token) && token[4].value === "." && isTokenOpenSquare(nextToken));
        });
      }

      // derandom ids
      newComps = replaceCssComps(parseCssCompCommaList(newTokens), (comp: Comp) => {
        if (isCompTokenTypeType(comp, isTokenHash, CssHashType.ID)) {
          const idName = comp.value[4].value;
          const newSelector = idName.replace(/^([\w\d]+)--((?:[\w\d]+)(?:-(?:[\w\d]+))*)--([\w\d\\+-]+)$/, '[id^="$1--$2--"]');
          if (newSelector !== idName) {
            didDerandom = true;
            return parseCssCompStr(newSelector);
          }
        }
        prevComp = comp;
        return;
      });

      if (didDerandom)
        rule.selector = stringifyCssComps(newComps);
    });
  }
}));