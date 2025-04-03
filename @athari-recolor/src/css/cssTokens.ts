import assert from 'node:assert/strict';
import * as cssCt from '@csstools/css-tokenizer';
import * as Kw from './cssKeywords.ts';
import {
  Opt,
  isDefined,  throwError,
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

interface TokenT<N extends Type, V extends Token> extends Token {
  0: N;
  4: V[4];
}

interface Simple extends Token {
  0: TypeSimple;
  4: undefined;
}

interface SimpleT<N extends TypeSimple> extends Simple {
  0: N;
  4: undefined;
}

export interface AtKeyword extends TokenT<Type.AtKeyword, cssCt.TokenAtKeyword> {}
export interface Delim extends TokenT<Type.Delim, cssCt.TokenDelim> {}
export interface Dimension extends TokenT<Type.Dimension, cssCt.TokenDimension> {}
export interface Function extends TokenT<Type.Function, cssCt.TokenFunction> {}
export interface Hash extends TokenT<Type.Hash, cssCt.TokenHash> {}
export interface Ident extends TokenT<Type.Ident, cssCt.TokenIdent> {}
export interface Number extends TokenT<Type.Number, cssCt.TokenNumber> {}
export interface Percentage extends TokenT<Type.Percentage, cssCt.TokenPercentage> {}
export interface String extends TokenT<Type.String, cssCt.TokenString> {}
export interface UnicodeRange extends TokenT<Type.UnicodeRange, cssCt.TokenUnicodeRange> {}
export interface Url extends TokenT<Type.URL, cssCt.TokenURL> {}

type AnyToken = Simple | AtKeyword | Delim | Dimension | Function | Hash | Ident | Number | Percentage | String | Url | UnicodeRange;
type AnyWithData = Exclude<AnyToken, Simple>;
type AnyNumeric = Dimension | Number | Percentage;
export type Raw = Extract<Simple, { 0: TypeRaw }>;

type TypeSimple =
  | Type.BadString | Type.BadURL | Type.CDC | Type.CDO | Type.Colon | Type.Comma | Type.Comment | Type.EOF | Type.Semicolon | Type.Whitespace
  | Type.CloseCurly | Type.CloseParen | Type.CloseSquare | Type.OpenCurly | Type.OpenParen | Type.OpenSquare;
type TypeWithSingleValue =
  | Type.CDC | Type.CDO | Type.Colon | Type.Comma | Type.Semicolon
  | Type.CloseCurly | Type.CloseParen | Type.CloseSquare | Type.OpenCurly | Type.OpenParen | Type.OpenSquare;
type TypeWithData = AnyWithData[0];
type TypeRaw = Type.Comment | Type.Whitespace;

export import ParseError = cssCt.ParseError;
export import ParseErrorWithToken = cssCt.ParseErrorWithToken;
export import HashType = cssCt.HashType;
export import NumberType = cssCt.NumberType;
export import Type = cssCt.TokenType;

export const enum NumberRange { All, NonNegative, Integer, NonNegativeInteger, PositiveInteger };

type ParseErrorCallback = (error: ParseError) => void;

interface TokenStream {
  nextToken(): Token;
  endOfFile(): boolean;
}

export type AnyWithValue = AtKeyword | Delim | Function | Hash | Ident | Dimension | Number | Percentage | String | Url;
//type AnyWithStringValue = AtKeyword | Delim | Function | Hash | Ident | String | Url;
//type AnyWithNumberValue = Dimension | Number | Percentage;
export type ValueType = string | number;
export type WithValue<T extends AnyWithValue, V extends ValueType> = Extract<T, { [4]: { value: V } }>;
//type WithStringValue<T extends AnyWithStringValue, V extends string> = Extract<T, { [4]: { value: V } }>;
//type WithNumberValue<T extends AnyWithNumberValue, V extends number> = Extract<T, { [4]: { value: V } }>;

export type AnyWithType = Dimension | Hash | Number;
export type TypeType = NumberType | HashType;
//type WithType<T extends AnyWithType, N extends TypeType> = Extract<T, { [4]: { type: N } }>;

//export type AnyWithUnit = Dimension;
export type UnitType = string;
export type WithUnit<V extends UnitType> = Extract<Dimension, { [4]: { unit: V } }>;

export type DataOf<T extends Token> = T[4];
export type ValueOf<T extends AnyWithValue> = DataOf<T>['value'];
export type TypeOf<T extends AnyWithType> = DataOf<T>['type'];
export type UnitOf<T extends Dimension> = DataOf<T>['unit'];

// MARK: Guards

export type Guard<T extends Token> = (ct: Token) => ct is T;
export type GuardSimple<N extends TypeSimple> = (ct: Token) => ct is SimpleT<N>;

export const isToken = (t: unknown): t is Token => cssCt.isToken(t);

export const isBadString: GuardSimple<Type.BadString> = (t: Token): t is SimpleT<Type.BadString> => cssCt.isTokenBadString(<CompatToken>t);
export const isBadUrl: GuardSimple<Type.BadURL> = (t: Token): t is SimpleT<Type.BadURL> => cssCt.isTokenBadURL(<CompatToken>t);
export const isCDC: GuardSimple<Type.CDC> = (t: Token): t is SimpleT<Type.CDC> => cssCt.isTokenCDC(<CompatToken>t);
export const isCDO: GuardSimple<Type.CDO> = (t: Token): t is SimpleT<Type.CDO> => cssCt.isTokenCDO(<CompatToken>t);
export const isCloseCurly: GuardSimple<Type.CloseCurly> = (t: Token): t is SimpleT<Type.CloseCurly> => cssCt.isTokenCloseCurly(<CompatToken>t);
export const isCloseParen: GuardSimple<Type.CloseParen> = (t: Token): t is SimpleT<Type.CloseParen> => cssCt.isTokenCloseParen(<CompatToken>t);
export const isCloseSquare: GuardSimple<Type.CloseSquare> = (t: Token): t is SimpleT<Type.CloseSquare> => cssCt.isTokenCloseSquare(<CompatToken>t);
export const isColon: GuardSimple<Type.Colon> = (t: Token): t is SimpleT<Type.Colon> => cssCt.isTokenColon(<CompatToken>t);
export const isComma: GuardSimple<Type.Comma> = (t: Token): t is SimpleT<Type.Comma> => cssCt.isTokenComma(<CompatToken>t);
export const isComment: GuardSimple<Type.Comment> = (t: Token): t is SimpleT<Type.Comment> => cssCt.isTokenComment(<CompatToken>t);
export const isDelim: Guard<Delim> = (t: Token): t is Delim => cssCt.isTokenDelim(<CompatToken>t);
export const isDimension: Guard<Dimension> = (t: Token): t is Dimension => cssCt.isTokenDimension(<CompatToken>t);
export const isEof: GuardSimple<Type.EOF> = (t: Token): t is SimpleT<Type.EOF> => cssCt.isTokenEOF(<CompatToken>t);
export const isFunction: Guard<Function> = (t: Token): t is Function => cssCt.isTokenFunction(<CompatToken>t);
export const isHash: Guard<Hash> = (t: Token): t is Hash => cssCt.isTokenHash(<CompatToken>t);
export const isIdent: Guard<Ident> = (t: Token): t is Ident => cssCt.isTokenIdent(<CompatToken>t);
export const isNumber: Guard<Number> = (t: Token): t is Number => cssCt.isTokenNumber(<CompatToken>t);
export const isNumeric: Guard<AnyNumeric> = (t: Token): t is AnyNumeric => cssCt.isTokenNumeric(<CompatToken>t);
export const isOpenCurly: GuardSimple<Type.OpenCurly> = (t: Token): t is SimpleT<Type.OpenCurly> => cssCt.isTokenOpenCurly(<CompatToken>t);
export const isOpenParen: GuardSimple<Type.OpenParen> = (t: Token): t is SimpleT<Type.OpenParen> => cssCt.isTokenOpenParen(<CompatToken>t);
export const isOpenSquare: GuardSimple<Type.OpenSquare> = (t: Token): t is SimpleT<Type.OpenSquare> => cssCt.isTokenOpenSquare(<CompatToken>t);
export const isPercentage: Guard<Percentage> = (t: Token): t is Percentage => cssCt.isTokenPercentage(<CompatToken>t);
export const isSemicolon: GuardSimple<Type.Semicolon> = (t: Token): t is SimpleT<Type.Semicolon> => cssCt.isTokenSemicolon(<CompatToken>t);
export const isString: Guard<String> = (t: Token): t is String => cssCt.isTokenString(<CompatToken>t);
export const isUrl: Guard<Url> = (t: Token): t is Url => cssCt.isTokenURL(<CompatToken>t);
export const isUnicodeRange: Guard<UnicodeRange> = (t: Token): t is UnicodeRange => cssCt.isTokenUnicodeRange(<CompatToken>t);
export const isRaw: Guard<Raw> = (t: Token): t is Raw => cssCt.isTokenWhiteSpaceOrComment(<CompatToken>t);
export const isSpace: GuardSimple<Type.Whitespace> = (t: Token): t is SimpleT<Type.Whitespace> => cssCt.isTokenWhitespace(<CompatToken>t);

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

type TokenWithType<N extends Type> = Extract<AnyToken, { [0]: N }>;

const singleTokenValues: Partial<Record<Type, string>> = {
  [Type.OpenCurly]: '{', [Type.OpenParen]: '(', [Type.OpenSquare]: '[',
  [Type.CloseCurly]: '}', [Type.CloseParen]: ')', [Type.CloseSquare]: ']',
  [Type.Colon]: ':', [Type.Comma]: ',', [Type.Semicolon]: ';',
  [Type.CDC]: '-->', [Type.CDO]: '<!--',
} satisfies Record<TypeWithSingleValue, string>;

export function token<N extends TypeWithSingleValue>(type: N): TokenWithType<N>;
export function token<N extends TypeSimple>(type: N, css: string): TokenWithType<N>;
export function token<N extends TypeWithData>(type: N, css: string, value: TokenWithType<N>[4]): TokenWithType<N>;
export function token<N extends Type>(type: N, css?: string, value?: TokenWithType<N>[4]): TokenWithType<N> {
  return <TokenWithType<N>>[ type, singleTokenValues[type] ?? css, -1, -1, value ];
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
    //this.#nextToken ??= this.#stream.nextToken(); console.log("peek", this.#nextToken); return this.#nextToken;
  }

  consume(): Token {
    if (this.#nextToken) {
      const currentToken = this.#nextToken;
      this.#nextToken = undefined;
      //console.log("consume cur", currentToken);
      return currentToken;
    } else {
      this.lastError = undefined;
      this.#nextToken = undefined;
      return this.#stream.nextToken();
      //const t = this.#stream.nextToken(); console.log("consume", t); return t;
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