import * as cssCt from '@csstools/css-tokenizer';
import { Kw } from './cssKeywords.ts';
import {
  Opt,
  throwError,
  isString as isStringPrimitive,
  isNumber as isNumberPrimitive,
} from '../utils.ts';

export namespace Ct {

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

  export type AnyWithValue = AtKeyword | Delim | Function | Hash | Ident | Dimension | Number | Percentage | String | Url;
  export type AnyWithStringValue = AtKeyword | Delim | Function | Hash | Ident | String | Url;
  export type AnyWithNumberValue = Dimension | Number | Percentage;
  export type ValueType = string | number;
  export type WithValue<T extends AnyWithValue, V extends ValueType> = T & { [4]: { value: V } };
  export type WithStringValue<T extends AnyWithStringValue, V extends string> = T & { [4]: { value: V } };
  export type WithNumberValue<T extends AnyWithNumberValue, V extends number> = T & { [4]: { value: V } };

  export type AnyWithType = Dimension | Hash | Number;
  export type TypeType = NumberType | HashType;
  export type WithType<T extends AnyWithType, V extends TypeType> = T & { [4]: { type: V } };

  export type UnitType = string;
  export type WithUnit<V extends UnitType> = Dimension & { [4]: { unit: V } };

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
      if (isStringPrimitive(v))
        return Kw.equals(v, values as (readonly string[] | string));
      else
        return isNumberPrimitive(values) ? v === (values as number) : (values as readonly number[]).includes(v);
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

  // MARK: Parse

  export function tokenStream(css: string, unicodeRangesAllowed?: Opt<boolean>): TokenStream {
    return cssCt.tokenizer({
      css,
      unicodeRangesAllowed: unicodeRangesAllowed ?? false,
    });
  }

  export function tokenize(css: string): Ct.Token[] {
    return cssCt.tokenize({ css });
  }

  export function stringify(tokens: Ct.Token[]): string {
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
    consumeWithRaws(): TokenWithRaws;
    consumeWithRawsIf<T extends Token>(ctGuard: Guard<T>): Opt<TokenWithRaws<T>>;
  }

  export interface TokenWithRaws<T extends Token = Token> {
    ct: T;
    raws: Raw[];
  }

  class TokenizerImpl implements Tokenizer {
    readonly #stream: TokenStream;
    #nextToken: Opt<Ct.Token>;

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

    consumeWithRaws(): TokenWithRaws {
      return { ct: this.consume(), raws: this.consumeRaws() };
    }

    consumeWithRawsIf<T extends Token>(ctGuard: Guard<T>): Opt<TokenWithRaws<T>> {
      const ct = this.peek();
      if (!ctGuard(ct))
        return;
      this.consume();
      return { ct, raws: this.consumeRaws() };
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
      isNumberPrimitive(source) ? [
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
}