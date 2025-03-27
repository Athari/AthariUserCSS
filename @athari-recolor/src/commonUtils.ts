import fs from 'node:fs/promises';
import { regex } from "regex";

// MARK: Types

export enum ColorFormula {
  Dark = 'dark',
  DarkFull = 'dark-full',
  DarkAuto = 'dark-auto',
  DarkFullAuto = 'dark-full-auto',
}

// MARK: Regex

// https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/#token-diagrams
export const cssTokenRegExps = new class CssTokenRegExps {
  "" = null;
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
    [ a-z 0-9 ]
  `;
  alphaNumDash = regex('i')`
    [ a-z 0-9 \- ]
  `;
  alphaNumUnder = regex('i')`
    [ a-z 0-9 _ ]
  `;
  alphaNumUnderDash = regex('i')`
    [ a-z 0-9 _ \- ]
  `;
  sign = regex('i')`
    [ \+ \- ]
  `;
  ident = regex('i')`
    (
      -- |
      -? ( ${this.alpha} | ${this.escape} )
    )
    (
      ${this.alphaNumUnderDash} | ${this.escape}
    )*
  `;
  identDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  identSingleDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      (?! -- )
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  identUnderDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      ${this.alphaNumUnder} | ${this.escape}
    )*
  `;
  identUnderSingleDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      (?! -- )
      ${this.alphaNumUnderDash} | ${this.escape}
    )*
  `;
  number = regex('i')`
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
  dim = regex('i')`
    ${this.number} ${this.ident}
  `;
  percent = regex('i')`
    ${this.number} %
  `;
}();

// MARK: Utils

export async function getSiteDir(siteName: string): Promise<string> {
  const siteDir = `./sites/${siteName}`;
  await fs.mkdir(siteDir, { recursive: true });
  return await fs.realpath(siteDir);
}