declare module 'string' {
  const S: {
    (o: unknown): String;
    VERSION: string;
    TMPL_OPEN: string;
    TMPL_CLOSE: string;
    extendPrototype(): void;
    restorePrototype(): void;
  };

  export default S;
}

interface String {
  between(left: string, right?: string): string;
  camelize(): string;
  capitalize(): string;
  chompLeft(prefix: string): string;
  chompRight(suffix: string): string;
  collapseWhitespace(): string;
  contains(ss: string): boolean;
  count(substring: string): number;
  dasherize(): string;
  decodeHTMLEntities(): string;
  endsWith(ss: string): boolean;
  escapeHTML(): string;
  ensureLeft(prefix: string): string;
  ensureRight(suffix: string): string;
  humanize(): string;
  include(ss: string): boolean;
  isAlpha(): boolean;
  isAlphaNumeric(): boolean;
  isEmpty(): boolean;
  isLower(): boolean;
  isNumeric(): boolean;
  isUpper(): boolean;
  latinise(): string;
  left(n: number): string;
  lines(): string[];
  pad(len: number, char?: string | number): string;
  padLeft(len: number, char?: string | number): string;
  padRight(len: number, char?: string | number): string;
  parseCSV(delimiter?: string, qualifier?: string, escape?: string, lineDelimiter?: string): string[];
  repeat(n: number): string;
  replaceAll(ss: string, newStr: string): string;
  strip(...strings: string[]): string;
  stripLeft(...strings: string[]): string;
  stripRight(...strings: string[]): string;
  right(n: number): string;
  setValue(string: any): string;
  slugify(): string;
  startsWith(prefix: string): boolean;
  stripPunctuation(): string;
  stripTags(...tags: string[]): string;
  template(values: Object, open?: string, close?: string): string;
  times(n: number): string;
  titleCase(): string;
  toBoolean(): boolean;
  toCSV(delimiter?: string, qualifier?: string): string;
  toCSV(options: {
    delimiter?: string | undefined;
    qualifier?: string | undefined;
    escape?: string | undefined;
    encloseNumbers?: boolean | undefined;
    keys?: boolean | undefined;
  }): string;
  toFloat(precision?: number): number;
  toInt(): number;
  toInteger(): number;
  toString(): string;
  trim(): string;
  trimLeft(): string;
  trimRight(): string;
  truncate(length: number, chars?: string): string;
  underscore(): string;
  unescapeHTML(): string;
  wrapHTML(element?: string, attributes?: Object): string;
}