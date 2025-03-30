import assert from 'node:assert/strict';
import * as cssCt from '@csstools/css-tokenizer';
import * as Kw from './cssKeywords.ts';
import {
  Opt,
  isDefined,  throwError,
  isString as isStr, isNumber as isNum,
} from '../utils.ts';

// MARK: Types

export type Token = cssCt.CSSToken;
export type NumericToken = cssCt.NumericToken;
export type TokenT<T extends Type, U> = cssCt.Token<T, U>;
export type AtKeyword = cssCt.TokenAtKeyword;
export type BadString = cssCt.TokenBadString;
export type BadUrl = cssCt.TokenBadURL;
export type CDC = cssCt.TokenCDC;
export type CDO = cssCt.TokenCDO;
export type CloseCurly = cssCt.TokenCloseCurly;
export type CloseParen = cssCt.TokenCloseParen;
export type CloseSquare = cssCt.TokenCloseSquare;
export type Colon = cssCt.TokenColon;
export type Comma = cssCt.TokenComma;
export type Comment = cssCt.TokenComment;
export type Delim = cssCt.TokenDelim;
export type Dimension = cssCt.TokenDimension;
export type Eof = cssCt.TokenEOF;
export type Function = cssCt.TokenFunction;
export type Hash = cssCt.TokenHash;
export type Ident = cssCt.TokenIdent;
export type Number = cssCt.TokenNumber;
export type OpenCurly = cssCt.TokenOpenCurly;
export type OpenParen = cssCt.TokenOpenParen;
export type OpenSquare = cssCt.TokenOpenSquare;
export type Percentage = cssCt.TokenPercentage;
export type Semicolon = cssCt.TokenSemicolon;
export type String = cssCt.TokenString;
export type Url = cssCt.TokenURL;
export type UnicodeRange = cssCt.TokenUnicodeRange;
export type Space = cssCt.TokenWhitespace;

export type Raw = Space | Comment;

export import ParseError = cssCt.ParseError;
export import ParseErrorWithToken = cssCt.ParseErrorWithToken;
export import HashType = cssCt.HashType;
export import NumberType = cssCt.NumberType;
export import Type = cssCt.TokenType;

// MARK: Types (extended)

export const enum NumberRange { All, NonNegative, Integer, NonNegativeInteger, PositiveInteger };

export type ParseErrorCallback = (error: ParseError) => void;
export type TokenStream = ReturnType<typeof cssCt['tokenizer']>;

export type AnyWithData = AtKeyword | Delim | Dimension | Function | Hash | Ident | Number | Percentage | String | UnicodeRange | Url;
export type AnyWithoutData = BadString | BadUrl | CDC | CDO | CloseCurly | CloseParen | CloseSquare | Colon | Comma | Comment | Eof | OpenCurly | OpenParen | OpenSquare | Semicolon | Space;
export type AnyTypeWithData = AnyWithData[0];
export type AnyTypeWithoutData = AnyWithoutData[0];

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

export type IdentOf<T extends Token> = T extends TokenT<infer U, any> ? U : never;
export type DataOf<T extends Token> = T[4];
export type ValueOf<T extends AnyWithValue> = DataOf<T>['value'];
export type TypeOf<T extends AnyWithType> = DataOf<T>['type'];
export type UnitOf<T extends Dimension> = DataOf<T>['unit'];

// MARK: Guards

export import isToken = cssCt.isToken;
export import isAtKeyword = cssCt.isTokenAtKeyword;
export import isBadString = cssCt.isTokenBadString;
export import isBadUrl = cssCt.isTokenBadURL;
export import isCDC = cssCt.isTokenCDC;
export import isCDO = cssCt.isTokenCDO;
export import isCloseCurly = cssCt.isTokenCloseCurly;
export import isCloseParen = cssCt.isTokenCloseParen;
export import isCloseSquare = cssCt.isTokenCloseSquare;
export import isColon = cssCt.isTokenColon;
export import isComma = cssCt.isTokenComma;
export import isComment = cssCt.isTokenComment;
export import isDelim = cssCt.isTokenDelim;
export import isDimension = cssCt.isTokenDimension;
export import isEof = cssCt.isTokenEOF;
export import isFunction = cssCt.isTokenFunction;
export import isHash = cssCt.isTokenHash;
export import isIdent = cssCt.isTokenIdent;
export import isNumber = cssCt.isTokenNumber;
export import isNumeric = cssCt.isTokenNumeric;
export import isOpenCurly = cssCt.isTokenOpenCurly;
export import isOpenParen = cssCt.isTokenOpenParen;
export import isOpenSquare = cssCt.isTokenOpenSquare;
export import isPercentage = cssCt.isTokenPercentage;
export import isSemicolon = cssCt.isTokenSemicolon;
export import isString = cssCt.isTokenString;
export import isUrl = cssCt.isTokenURL;
export import isUnicodeRange = cssCt.isTokenUnicodeRange;
export import isRaw = cssCt.isTokenWhiteSpaceOrComment;
export import isSpace = cssCt.isTokenWhitespace;

// MARK: Guards (extended)

export type Guard<T extends Token> = (ct: Token) => ct is Extract<T, Token>;

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

type TokenWithType<T extends Type> = Extract<Token, { [0]: T }>;
type AnyTokenWithSingleValue = CDC | CDO | CloseCurly | CloseParen | CloseSquare | Colon | Comma | Semicolon | OpenCurly | OpenParen | OpenSquare;
type AnyTypeWithSingleValue = AnyTokenWithSingleValue[0];
const singleTokenValues: Record<AnyTypeWithSingleValue, string> = {
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
};

export function token<T extends AnyTypeWithSingleValue>(type: T): TokenWithType<T>;
export function token<T extends AnyTypeWithoutData>(type: T, css: string): TokenWithType<T>;
export function token<T extends AnyTypeWithData>(type: T, css: string, value: TokenWithType<T>[4]): TokenWithType<T>;
export function token<T extends Type>(type: T, css?: string, value?: TokenWithType<T>[4]): TokenWithType<T> {
  return <TokenWithType<T>>[ type, (singleTokenValues as Record<Type, Opt<string>>)[type] ?? css, -1, -1, value ];
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

export function stringify(tokens: Token[]): string {
  return cssCt.stringify(...tokens);
}

// MARK: Parse (extended)

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

export import setIdentValue = cssCt.mutateIdent;
export import setUnit = cssCt.mutateUnit;

// MARK: Modify (extended)

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