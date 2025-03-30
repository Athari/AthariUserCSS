import assert from 'node:assert/strict';
import * as cssCt from '@csstools/css-tokenizer';
import * as Kw from './cssKeywords.ts';
import {
  Opt,
  isDefined,  throwError, typed,
  isString as isStr, isNumber as isNum,
} from '../utils.ts';

// MARK: Types

export type CompatToken = /*cssCt.CSSToken*/any;

export interface Token extends Array<any> {
  0: Type;
  1: string;
  2: number;
  3: number;
  4: unknown;
}

//export type TokenT<T extends Type, U> = cssCt.Token<T, U>;
export interface Simple extends Token { 0: TypeSimple; 4: undefined }
export interface SimpleT<T extends TypeSimple> extends Simple { 0: T; 4: undefined }

export interface AtKeyword extends Token { [0]: Type.AtKeyword; [4]: cssCt.TokenAtKeyword[4] }
export interface Delim extends Token { [0]: Type.Delim; [4]: cssCt.TokenDelim[4] }
export interface Dimension extends Token { [0]: Type.Dimension; [4]: cssCt.TokenDimension[4] }
export interface Function extends Token { [0]: Type.Function; [4]: cssCt.TokenFunction[4] }
export interface Hash extends Token { [0]: Type.Hash; [4]: cssCt.TokenHash[4] }
export interface Ident extends Token { [0]: Type.Ident; [4]: cssCt.TokenIdent[4] }
export interface Number extends Token { [0]: Type.Number; [4]: cssCt.TokenNumber[4] }
export interface Percentage extends Token { [0]: Type.Percentage; [4]: cssCt.TokenPercentage[4] }
export interface String extends Token { [0]: Type.String; [4]: cssCt.TokenString[4] }
export interface UnicodeRange extends Token { [0]: Type.UnicodeRange; [4]: cssCt.TokenUnicodeRange[4] }
export interface Url extends Token { [0]: Type.URL; [4]: cssCt.TokenURL[4] }

export type AnyToken = Simple | AtKeyword | Delim | Dimension | Function | Hash | Ident | Number | Percentage | String | Url | UnicodeRange;
export type AnyWithData = Exclude<AnyToken, Simple>;
export type AnyNumeric = Dimension | Number | Percentage;
export type Raw = Extract<Simple, { 0: TypeRaw }>;

export type TypeSimple =
  | Type.BadString | Type.BadURL | Type.CDC | Type.CDO | Type.Colon | Type.Comma | Type.Comment | Type.EOF | Type.Semicolon | Type.Whitespace
  | Type.CloseCurly | Type.CloseParen | Type.CloseSquare | Type.OpenCurly | Type.OpenParen | Type.OpenSquare;
type TypeWithSingleValue =
  | Type.CDC | Type.CDO | Type.Colon | Type.Comma | Type.Semicolon
  | Type.CloseCurly | Type.CloseParen | Type.CloseSquare | Type.OpenCurly | Type.OpenParen | Type.OpenSquare;
export type TypeWithData = AnyWithData[0];
export type TypeRaw = Type.Comment | Type.Whitespace;

export import ParseError = cssCt.ParseError;
export import ParseErrorWithToken = cssCt.ParseErrorWithToken;
export import HashType = cssCt.HashType;
export import NumberType = cssCt.NumberType;
export import Type = cssCt.TokenType;

export const enum NumberRange { All, NonNegative, Integer, NonNegativeInteger, PositiveInteger };

export type ParseErrorCallback = (error: ParseError) => void;

export interface TokenStream {
  nextToken(): Token;
  endOfFile(): boolean;
}

export type AnyWithValue = AtKeyword | Delim | Function | Hash | Ident | Dimension | Number | Percentage | String | Url;
export type AnyWithStringValue = AtKeyword | Delim | Function | Hash | Ident | String | Url;
export type AnyWithNumberValue = Dimension | Number | Percentage;
export type ValueType = string | number;
export type WithValue<T extends AnyWithValue, V extends ValueType> = Extract<T, { [4]: { value: V } }>;
export type WithStringValue<T extends AnyWithStringValue, V extends string> = Extract<T, { [4]: { value: V } }>;
export type WithNumberValue<T extends AnyWithNumberValue, V extends number> = Extract<T, { [4]: { value: V } }>;

export type AnyWithType = Dimension | Hash | Number;
export type TypeType = NumberType | HashType;
export type WithType<T extends AnyWithType, V extends TypeType> = Extract<T, { [4]: { type: V } }>;

export type UnitType = string;
export type WithUnit<V extends UnitType> = Extract<Dimension, { [4]: { unit: V } }>;

export type DataOf<T extends Token> = T[4];
export type ValueOf<T extends AnyWithValue> = DataOf<T>['value'];
export type TypeOf<T extends AnyWithType> = DataOf<T>['type'];
export type UnitOf<T extends Dimension> = DataOf<T>['unit'];

// MARK: Guards

export type Guard<T extends Token> = (ct: Token) => ct is T;

export const isToken = (t: unknown): t is Token => cssCt.isToken(t);

export const isBadString = (t: Token): t is SimpleT<Type.BadString> => cssCt.isTokenBadString(<CompatToken>t);
export const isBadUrl = (t: Token): t is SimpleT<Type.BadURL> => cssCt.isTokenBadURL(<CompatToken>t);
export const isCDC = (t: Token): t is SimpleT<Type.CDC> => cssCt.isTokenCDC(<CompatToken>t);
export const isCDO = (t: Token): t is SimpleT<Type.CDO> => cssCt.isTokenCDO(<CompatToken>t);
export const isCloseCurly = (t: Token): t is SimpleT<Type.CloseCurly> => cssCt.isTokenCloseCurly(<CompatToken>t);
export const isCloseParen = (t: Token): t is SimpleT<Type.CloseParen> => cssCt.isTokenCloseParen(<CompatToken>t);
export const isCloseSquare = (t: Token): t is SimpleT<Type.CloseSquare> => cssCt.isTokenCloseSquare(<CompatToken>t);
export const isColon = (t: Token): t is SimpleT<Type.Colon> => cssCt.isTokenColon(<CompatToken>t);
export const isComma = (t: Token): t is SimpleT<Type.Comma> => cssCt.isTokenComma(<CompatToken>t);
export const isComment = (t: Token): t is SimpleT<Type.Comment> => cssCt.isTokenComment(<CompatToken>t);
export const isDelim = (t: Token): t is Delim => cssCt.isTokenDelim(<CompatToken>t);
export const isDimension = (t: Token): t is Dimension => cssCt.isTokenDimension(<CompatToken>t);
export const isEof = (t: Token): t is SimpleT<Type.EOF> => cssCt.isTokenEOF(<CompatToken>t);
export const isFunction = (t: Token): t is Function => cssCt.isTokenFunction(<CompatToken>t);
export const isHash = (t: Token): t is Hash => cssCt.isTokenHash(<CompatToken>t);
export const isIdent = (t: Token): t is Ident => cssCt.isTokenIdent(<CompatToken>t);
export const isNumber = (t: Token): t is Number => cssCt.isTokenNumber(<CompatToken>t);
export const isNumeric = (t: Token): t is AnyNumeric => cssCt.isTokenNumeric(<CompatToken>t);
export const isOpenCurly = (t: Token): t is SimpleT<Type.OpenCurly> => cssCt.isTokenOpenCurly(<CompatToken>t);
export const isOpenParen = (t: Token): t is SimpleT<Type.OpenParen> => cssCt.isTokenOpenParen(<CompatToken>t);
export const isOpenSquare = (t: Token): t is SimpleT<Type.OpenSquare> => cssCt.isTokenOpenSquare(<CompatToken>t);
export const isPercentage = (t: Token): t is Percentage => cssCt.isTokenPercentage(<CompatToken>t);
export const isSemicolon = (t: Token): t is SimpleT<Type.Semicolon> => cssCt.isTokenSemicolon(<CompatToken>t);
export const isString = (t: Token): t is String => cssCt.isTokenString(<CompatToken>t);
export const isUrl = (t: Token): t is Url => cssCt.isTokenURL(<CompatToken>t);
export const isUnicodeRange = (t: Token): t is UnicodeRange => cssCt.isTokenUnicodeRange(<CompatToken>t);
export const isRaw = (t: Token): t is Raw => cssCt.isTokenWhiteSpaceOrComment(<CompatToken>t);
export const isSpace = (t: Token): t is SimpleT<Type.Whitespace> => cssCt.isTokenWhitespace(<CompatToken>t);

export function isTokenValue<T extends AnyWithValue, V extends ValueType>(g: Guard<T>, values: readonly V[] | V, ct: Token): ct is WithValue<T, V>;
export function isTokenValue<T extends AnyWithValue, V extends ValueType>(g: Guard<T>, values: readonly V[] | V): Guard<WithValue<T, V>>;
export function isTokenValue<T extends AnyWithValue, V extends ValueType>(g: Guard<T>, values: readonly V[] | V, ct: Token | null = null): any {
  const guard = (ct: Token) => {
    if (!g(ct))
      return false;
    const v: ValueOf<T> = value(ct);
    if (isStr(v))
      return Kw.equals(v, values as (readonly string[] | string));
    else
      return isNum(values) ? v === (values as number) : (values as readonly number[]).includes(v);
  };
  return ct === null ? guard : guard(ct);
}

export function isIdentValue<V extends string>(values: readonly V[] | V, ct: Token): ct is WithValue<Ident, V>;
export function isIdentValue<V extends string>(values: readonly V[] | V): Guard<WithValue<Ident, V>>;
export function isIdentValue<V extends string>(values: readonly V[] | V, ct: Token | null = null): any {
  const guard = (ct: Token) => isIdent(ct) && Kw.equals(value(ct), values);
  return ct === null ? guard : guard(ct);
}

export function isDimensionUnit<U extends string>(values: readonly U[] | U, ct: Token): ct is WithUnit<U>;
export function isDimensionUnit<U extends string>(values: readonly U[] | U): Guard<WithUnit<U>>;
export function isDimensionUnit<U extends string>(values: readonly U[] | U, ct: Token | null = null): any {
  const guard = (ct: Token) => isDimension(ct) && Kw.equals(unit(ct), values);
  return ct === null ? guard : guard(ct);
}

// MARK: Create (extended)

type TokenWithType<T extends Type> = Extract<AnyToken, { [0]: T }>;

const singleTokenValues: Partial<Record<Type, string>> = typed<Record<TypeWithSingleValue, string>>({
  [Type.CDC]: '-->',
  [Type.CDO]: '<!--',
  [Type.CloseCurly]: '}',
  [Type.CloseParen]: ')',
  [Type.CloseSquare]: ']',
  [Type.Colon]: ':',
  [Type.Comma]: ',',
  [Type.Semicolon]: ';',
  [Type.OpenCurly]: '{',
  [Type.OpenParen]: '(',
  [Type.OpenSquare]: '[',
});

export function token<T extends TypeWithSingleValue>(type: T): TokenWithType<T>;
export function token<T extends TypeSimple>(type: T, css: string): TokenWithType<T>;
export function token<T extends TypeWithData>(type: T, css: string, value: TokenWithType<T>[4]): TokenWithType<T>;
export function token<T extends Type>(type: T, css?: string, value?: TokenWithType<T>[4]): TokenWithType<T> {
  return <TokenWithType<T>>[ type, singleTokenValues[type] ?? css, -1, -1, value ];
}

export function delim(value: string): Delim {
  return token(Type.Delim, value, { value });
}

export function numberData(value: number, unit: string): { value: number, type: NumberType, unit: string };
export function numberData(value: number): { value: number, type: NumberType };
export function numberData(value: number, unit: Opt<string>): { value: number, type: NumberType, unit: Opt<string> };
export function numberData(value: number, unit?: Opt<string>): { value: number, type: NumberType, unit: Opt<string> } {
  return { value, type: Number.isInteger(value) ? NumberType.Integer : NumberType.Number, unit };
}

// MARK: Parse

export function tokenStream(css: string, unicodeRangesAllowed?: Opt<boolean>): TokenStream {
  return cssCt.tokenizer({
    css,
    unicodeRangesAllowed: unicodeRangesAllowed ?? false,
  });
}

export function tokenize(css: string): Token[] {
  return cssCt.tokenize({ css });
}

export function stringify(tokens: Iterable<Token>): string {
  return cssCt.stringify(...tokens as Iterable<CompatToken>);
}

export interface Tokenizer {
  get isEof(): boolean;
  get lastError(): Opt<ParseError | ParseErrorWithToken>;
  get lastErrorToken(): Opt<Token>;

  onParseError?: Opt<ParseErrorCallback>;

  peek(): Token;
  consume(): Token;
  consumeIf<T extends Token>(ctGuard: Guard<T>): Opt<T>;
  consumeRaws(): Raw[];
  consumeRawsAfter(ct: Token): Raw[];
  consumeRawsAfterIf<T extends Token>(ctGuard: Guard<T>): Opt<Raw[]>;
  consumeWithRaws(): TokenWithRaws;
  consumeWithRawsIf<T extends Token>(ctGuard: Guard<T>): Opt<TokenWithRaws<T>>;
}

export interface TokenWithRaws<T extends Token = Token> {
  ct: T;
  raws: Raw[];
}

class TokenizerImpl implements Tokenizer {
  readonly #stream: TokenStream;
  #nextToken: Opt<Token>;

  lastError: Opt<ParseError | ParseErrorWithToken>;

  constructor(tokenizer: TokenStream) {
    this.#stream = tokenizer;
  }

  get isEof() {
    return !this.#nextToken && this.#stream.endOfFile();
  }

  get lastErrorToken() {
    return this.lastError instanceof ParseErrorWithToken ? this.lastError.token : undefined;
  }

  onParseError: Opt<ParseErrorCallback>;

  peek(): Token {
    this.lastError = undefined;
    return this.#nextToken ??= this.#stream.nextToken();
  }

  consume(): Token {
    if (this.#nextToken) {
      const currentToken = this.#nextToken;
      this.#nextToken = undefined;
      return currentToken;
    } else {
      this.lastError = undefined;
      this.#nextToken = undefined;
      return this.#stream.nextToken();
    }
  }

  consumeIf<T extends Token>(ctGuard: Guard<T>): Opt<T> {
    const ct = this.peek();
    if (!ctGuard(ct))
      return;
    this.consume();
    return ct;
  }

  consumeRaws(): Raw[] {
    const raws: Raw[] = [];
    while (isRaw(this.peek()))
      raws.push(this.consume() as Raw);
    return raws;
  }

  consumeRawsAfter(ct: Token): Raw[] {
    assert.equal(this.peek(), ct);
    this.consume();
    return this.consumeRaws();
  }

  consumeRawsAfterIf<T extends Token>(ctGuard: Guard<T>): Opt<Raw[]> {
    const ct = this.consumeIf(ctGuard);
    if (!isDefined(ct))
      return;
    this.consume();
    return this.consumeRaws();
  }

  consumeWithRaws(): TokenWithRaws {
    return { ct: this.consume(), raws: this.consumeRaws() };
  }

  consumeWithRawsIf<T extends Token>(ctGuard: Guard<T>): Opt<TokenWithRaws<T>> {
    const ct = this.consumeIf(ctGuard);
    return isDefined(ct) ? { ct, raws: this.consumeRaws() } : undefined;
  }
}

export function tokenizer(css: string, unicodeRangesAllowed?: Opt<boolean>): Tokenizer {
  const tokenizer = new TokenizerImpl(tokenStream(css, unicodeRangesAllowed));
  tokenizer.onParseError = (error: ParseError) => {
    tokenizer.lastError = error;
    tokenizer.onParseError?.(error);
  };
  return tokenizer;
}

// MARK: Modify

export function data<T extends Token>(ct: T): DataOf<T> {
  return ct[4];
}

export function value<T extends AnyWithValue>(ct: T): ValueOf<T> {
  return ct[4].value;
}

export function type<T extends AnyWithType>(ct: T): TypeOf<T> {
  return ct[4].type;
}

export function unit(ct: Dimension): string {
  return ct[4].unit;
}

export function isInRange(source: Token | number, range: NumberRange): boolean {
  const [ v, isInt ] =
    isNum(source) ? [
      source,
      Number.isInteger(source),
    ] :
    isToken(source) && isNumeric(source) ? [
      value(source),
      !isPercentage(source) && type(source) === NumberType.Integer,
    ] :
    throwError(`source must be token or number, ${typeof(source)} received`);
  switch (range) {
    case NumberRange.All: return true;
    case NumberRange.NonNegative: return v >= 0;
    case NumberRange.Integer: return isInt;
    case NumberRange.NonNegativeInteger: isInt && v >= 0;
    case NumberRange.PositiveInteger: isInt && v > 0;
    default: throwError(`Invalid range value: ${range}`);
  }
}