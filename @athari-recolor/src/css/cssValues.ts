import assert from 'node:assert/strict';
import { Optional } from 'utility-types';
import * as Ct from './cssTokens.ts';
import * as Kw from './cssKeywords.ts';
import * as Cu from './cssUnits.ts';
import {
  LiteralUnion, Opt, Guard,
  isNull, isDefined, isObject, isArray, throwError,
  isFunction as isFn, isString as isStr,
} from '../utils.ts';

const kw = Kw.kw;

// MARK: Types

export type KwAny = string;
export type KwAnyOpt = string | null;
export type KwUnion<T extends KwAnyOpt> =
  T extends null ? null :
  string extends T ? string :
  T extends string ? LiteralUnion<T> :
  never;

export interface Shorthand<T extends KwAny = KwAny, V = AnyValue> {
  props: Map<T, V>;
}

export type ShorthandKey<T extends Shorthand<any, any>> = T extends Shorthand<infer K, any> ? K : never;
export type ShorthandValue<T extends Shorthand<any, any>> = T extends Shorthand<any, infer V> ? V : never;

export interface Raws {
  before?: Opt<Ct.Raw[]>;
  after?: Opt<Ct.Raw[]>;
  between?: Opt<Ct.Raw[]>;
}

export enum ValueType {
  Function = 'function',
  Keyword = 'keyword',
  Numeric = 'numeric',
  NumericRange = 'numeric-range',
  NumericWithKeyword = 'numeric-with-keyword',
  NumericRangeWithKeyword = 'numeric-range-with-keyword',
  String = 'string',
  Url = 'url',
}

const valueTypes = Object.values(ValueType).filter(isStr);

export interface WithKeyword<N extends KwAny = KwAny> {
  name: N;
}

export interface WithNumber<U extends KwAnyOpt = KwAnyOpt> {
  value: number;
  unit: U;
}

export interface WithRange<V = AnyValue> {
  start: V;
  end: V;
}

export interface WithRaws {
  raws?: Opt<Raws>;
}

export interface Value {
  readonly type: ValueType;
}

export interface ValueT<T extends ValueType> extends Value {
  readonly type: T;
}

export interface Function<N extends KwAny = KwAny, V = AnyValue>
  extends ValueT<ValueType.Function>, WithKeyword<N>, WithRaws {
  params: V[];
}

export interface Keyword<N extends KwAny = KwAny>
  extends ValueT<ValueType.Keyword>, WithKeyword<N>, WithRaws {}

export interface Numeric<U extends KwAnyOpt = KwAnyOpt>
  extends ValueT<ValueType.Numeric>, WithNumber<U>, WithRaws {}

export interface NumericRange<U extends KwAnyOpt = KwAnyOpt>
  extends ValueT<ValueType.NumericRange>, WithRange<Numeric<U>> {
}

export interface NumericWithKeyword<N extends KwAny = KwAny, U extends KwAnyOpt = KwAnyOpt>
  extends ValueT<ValueType.NumericWithKeyword>, WithKeyword<N>, WithNumber<U>, WithRaws {
}

export interface NumericRangeWithKeyword<N extends KwAny = KwAny, U extends KwAnyOpt = KwAnyOpt>
  extends ValueT<ValueType.NumericRangeWithKeyword>, WithKeyword<N>, WithRange<Numeric<U>> {
}

export interface String<V extends KwAny = KwAny>
  extends ValueT<ValueType.String>, WithRaws {
  value: V;
}

export interface Url
  extends ValueT<ValueType.Url>, WithRaws {
  url: URL;
}

export type KeywordLax<N extends KwAny = KwAny> = Keyword<KwUnion<N>>;

export type NumericLax<U extends KwAny = KwAny> = Numeric<KwUnion<U>>;
export type NumericLaxRange<U extends KwAny = KwAny> = NumericRange<KwUnion<U>>;
export type NumericLaxWithKeyword<N extends KwAny = KwAny, U extends KwAny = KwAny> = NumericWithKeyword<KwUnion<N>, KwUnion<U>>;
export type NumericLaxRangeWithKeyword<N extends KwAny = KwAny, U extends KwAny = KwAny> = NumericRangeWithKeyword<KwUnion<N>, KwUnion<U>>;

export type NumericOpt<U extends KwAnyOpt = KwAnyOpt> = Numeric<U | null>;
export type NumericOptLax<U extends KwAnyOpt = KwAnyOpt> = Numeric<KwUnion<U | null>>;
export type NumericOptRange<U extends KwAnyOpt = KwAnyOpt> = NumericRange<U | null>;
export type NumericOptLaxRange<U extends KwAnyOpt = KwAnyOpt> = NumericRange<KwUnion<U | null>>;

export type AnyValue = Function | Keyword | Numeric | NumericRange | NumericWithKeyword | NumericRangeWithKeyword | String | Url;

type TokenToValue<T extends Ct.Token> =
  T extends Ct.WithValue<Ct.Ident, string> ? Keyword<Ct.ValueOf<T>> :
  T extends Ct.WithValue<Ct.String, string> ? String<Ct.ValueOf<T>> :
  T extends Ct.Dimension ? Numeric<Ct.UnitOf<T>> :
  T extends Ct.Percentage ? Numeric<'%'> :
  T extends Ct.Number ? Numeric<null> :
  T extends Ct.Function ? Function<Ct.ValueOf<T>> :
  T extends Ct.Url ? Url :
  never;

// MARK: Guards

export function isValue(v: unknown): v is AnyValue {
  return isObject(v) && 'type' in v && isStr(v.type) && Kw.equals(v.type, valueTypes);
}

export function isFunction(v: AnyValue): v is Function {
  return !!v && v.type === 'function';
}

export function isFunctionName<T extends KwAny>(v: AnyValue, names: readonly T[]): v is Function<T> {
  return isFunction(v) && Kw.equals(v.name, names);
}

export function isKeyword(v: AnyValue): v is Keyword {
  return !!v && v.type === 'keyword';
}

export function isKeywordName<T extends KwAny>(v: AnyValue, names: readonly T[]): v is Keyword<T> {
  return isKeyword(v) && Kw.equals(v.name, names);
}

export function isNumeric(v: AnyValue): v is Numeric {
  return !!v && v.type === 'numeric';
}

export function isNumericUnit<T extends KwAny>(v: AnyValue, unitGuard: Guard<KwAny | null | undefined, T | null>): v is Numeric<T>;
export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[] | T): v is Numeric<T>;
export function isNumericUnit(v: AnyValue, units: null): v is Numeric<null>;
export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[] | T | Guard<KwAny | null | undefined, T | null> | null): v is Numeric<T> {
  if (!isNumeric(v))
    return false;
  if (isNull(units))
    return isNull(v.unit);
  if (!isStr(v.unit))
    return false;
  if (isFn(units))
    return units(v.unit);
  return Kw.equals(v.unit, units);
}

export function isNumericOpt<T extends KwAny>(v: AnyValue, units: readonly T[] | T): v is Numeric<KwUnion<T | null>> {
  return isNumeric(v) &&
    (isStr(v.unit) ? Kw.equals(v.unit, units) : isNull(v.unit));
}

export function isNumericRange(v: AnyValue): v is NumericRange {
  return !!v && v.type === 'numeric-range';
}

export function isNumericRangeWithKeyword(v: AnyValue): v is NumericRangeWithKeyword {
  return !!v && v.type === 'numeric-range-with-keyword';
}

export function isNumericWithKeyword(v: AnyValue): v is NumericWithKeyword {
  return !!v && v.type === 'numeric-with-keyword';
}

export function isString(v: AnyValue): v is String {
  return !!v && v.type === 'string';
}

export function isStringValue<T extends KwAny>(v: AnyValue, values: readonly T[]): v is String<T> {
  return isString(v) && Kw.equals(v.value, values);
}

export function isUrl(v: AnyValue): v is Url {
  return !!v && v.type === 'url';
}

// MARK: Convert

export function fromToken<T extends Ct.Token>(ct: T, raws?: Opt<Raws | Ct.Raw[]>): TokenToValue<T>;
export function fromToken<T extends Ct.Token>(ct: T, raws?: Opt<Raws | Ct.Raw[]>): unknown {
  // TODO: Move signCharacter to raws
  if (Ct.isIdent(ct))
    return keyword(Ct.value(ct), raws);
  if (Ct.isString(ct))
    return string(Ct.value(ct), raws);
  if (Ct.isDimension(ct))
    return numeric(Ct.value(ct), Ct.unit(ct), raws);
  if (Ct.isPercentage(ct))
    return numeric(Ct.value(ct), '%', raws);
  if (Ct.isNumber(ct))
    return numeric(Ct.value(ct), null, raws);
  if (Ct.isFunction(ct))
    return func(Ct.value(ct), [], raws);
  if (Ct.isUrl(ct))
    return url(Ct.value(ct), raws);
  throwError(`Unexpected token type: ${ct[0]}`);
}

export function fromTokenPeek<T extends Ct.Token>(ct: T, p: Ct.Tokenizer): TokenToValue<T> {
  return fromToken(ct, p.consumeRawsAfter(ct));
}

export function* tokenize(v: AnyValue): ArrayIterator<Ct.Token> {
  const raws: Opt<Raws> = 'raws' in v ? v.raws : undefined;

  yield* raws?.before ?? [];

  switch (v.type) {
    case ValueType.Function:
      yield Ct.token(Ct.Type.Function, `${Kw.encodeIdent(v.name)}(`, { value: v.name });
      for (const p of v.params)
        yield* tokenize(p);
      yield Ct.token(Ct.Type.CloseParen);
      break;

    case ValueType.Keyword:
      yield tokenizeKeyword(v);
      break;

    case ValueType.Numeric:
      yield tokenizeNumeric(v);
      break;

    case ValueType.NumericRange:
      yield* tokenizeRange(v);
      break;

    case ValueType.NumericWithKeyword:
      yield tokenizeKeyword(v);
      yield* raws?.between ?? [];
      yield tokenizeNumeric(v);
      break;

    case ValueType.NumericRangeWithKeyword:
      yield tokenizeKeyword(v);
      yield* raws?.between ?? [];
      yield* tokenizeRange(v);
      break;

    case ValueType.String:
      // TODO: Preserve original quote mark in strings
      yield Ct.token(Ct.Type.String, Kw.encodeString(v.value, '"'), { value: v.value });
      break;

    case ValueType.Url:
      yield Ct.token(Ct.Type.URL, Kw.encodeUrl(v.url), { value: v.url.toString() });
      break;
  }

  yield* raws?.after ?? [];

  function tokenizeKeyword(v: WithKeyword) {
    return Ct.token(Ct.Type.Ident, Kw.encodeIdent(v.name), { value: v.name });
  }

  function tokenizeNumeric(v: WithNumber) {
    // TODO: Preserve sign character in numbers
    return v.unit === null ?
      Ct.token(Ct.Type.Number, Kw.encodeNumber(v.value), Ct.numberData(v.value)) :
      Ct.token(Ct.Type.Dimension, `${Kw.encodeNumber(v.value)}${Kw.encodeIdent(v.unit)}`, Ct.numberData(v.value, v.unit));
  }

  function* tokenizeRange(v: WithRange) {
    yield* tokenize(v.start);
    yield* tokenize(v.end);
  }
}

export function* tokenizeList(vs: Iterable<AnyValue>, ...separator: Ct.Token[]): ArrayIterator<Ct.Token> {
  let isFirst = true;
  for (const v of vs) {
    if (isFirst)
      isFirst = false;
    else
      yield* separator;
    yield* tokenize(v);
  }
}

export function stringify(v: AnyValue): string {
  return Ct.stringify(tokenize(v));
}

export function stringifyList(vs: Iterable<AnyValue>, ...separator: Ct.Token[]): string {
  return Ct.stringify(tokenizeList(vs, ...separator));
}

// MARK: Create

function withRaws<T extends WithRaws>(value: T, raws: Opt<Raws | Ct.Raw[]>): T {
  if (isDefined(raws)) {
    if (isArray(raws))
      setRawProp(value, 'after', raws);
    else {
      setRawProp(value, 'before', raws.before);
      setRawProp(value, 'after', raws.after);
      setRawProp(value, 'between', raws.between);
    }
  }
  return value;
}

export function func<N extends KwAny>(name: N, params: AnyValue[] = [], raws?: Opt<Raws | Ct.Raw[]>): Function<N> {
  return withRaws<Function<N>>({ type: ValueType.Function, name: name.toLowerCase() as N, params }, raws);
}

export function keyword<N extends KwAny>(name: N, raws?: Opt<Raws | Ct.Raw[]>): Keyword<N> {
  return withRaws<Keyword<N>>({ type: ValueType.Keyword, name: name.toLowerCase() as N }, raws);
}

export function numeric<U extends KwAnyOpt>(value: number, unit: U, raws?: Opt<Raws | Ct.Raw[]>): Numeric<U> {
  return withRaws<Numeric<U>>({ type: ValueType.Numeric, value, unit }, raws);
}

export function numericRange<U extends KwAnyOpt>(start: Numeric<U>, end: Numeric<U>): NumericRange<U> {
  return { type: ValueType.NumericRange, start, end };
}

export function numericWithKeyword<N extends KwAny, U extends KwAnyOpt>(
  keyword: Keyword<N>, value: Numeric<U>
): NumericWithKeyword<N, U> {
  return withRaws<NumericWithKeyword<N, U>>(
    { type: ValueType.NumericWithKeyword, name: keyword.name, value: value.value, unit: value.unit },
    { between: keyword.raws?.after, after: value.raws?.after });
}

export function numericRangeWithKeyword<N extends KwAny, U extends KwAnyOpt>(
  keyword: Keyword<N>, start: Numeric<U>, end: Numeric<U>
): NumericRangeWithKeyword<N, U> {
  setRawProp(start, 'before', keyword.raws?.after);
  return { type: ValueType.NumericRangeWithKeyword, name: keyword.name, start, end };
}

export function string<T extends KwAny>(value: T, raws?: Opt<Raws | Ct.Raw[]>): String<T> {
  return withRaws<String<T>>({ type: ValueType.String, value }, raws);
}

export function url(url: string, raws?: Opt<Raws | Ct.Raw[]>): Url {
  return withRaws<Url>({ type: ValueType.Url, url: new URL(url) }, raws);
}

// MARK: Parse

export abstract class Parser {
  protected p: Ct.Tokenizer = Ct.tokenizer("");

  protected consumeKeyword<T extends string>(values: readonly T[]): Opt<Keyword<T>>;
  protected consumeKeyword(): Opt<Keyword<string>>;
  protected consumeKeyword<T extends string>(values: readonly T[] = []): Opt<Keyword<string>> {
    const ct = this.p.peek();
    if (values.length === 0 && Ct.isIdent(ct) || Ct.isIdentValue(values, ct))
      return fromTokenPeek(ct, this.p);
    return;
  }

  protected consumeLengthOrPercent(range: Ct.NumberRange, unitless?: boolean): Opt<NumericOpt<Cu.Length | Cu.Percent>> {
    const ct = this.p.peek();
    if (Ct.isDimension(ct) || Ct.isNumber(ct))
      return this.consumeLength(range, unitless);
    if (Ct.isPercentage(ct))
      return this.consumePercent(range);
    return;
  }

  protected consumeLength(range: Ct.NumberRange, unitless?: boolean): Opt<NumericOpt<Cu.Length>> {
    const ct = this.p.peek();
    if (Ct.isDimension(ct) && Ct.isDimensionUnit(kw.unit.length.all, ct) && Ct.isInRange(ct, range))
      return fromTokenPeek(ct, this.p);
    if (Ct.isNumber(ct) && (Ct.value(ct) === 0 || unitless) && Ct.isInRange(ct, range))
      return fromTokenPeek(ct, this.p);
    return;
  }

  protected consumePercent(range: Ct.NumberRange): Opt<Numeric<Cu.Percent>> {
    const ct = this.p.peek();
    if (Ct.isPercentage(ct) && Ct.isInRange(ct, range))
      return fromTokenPeek(ct, this.p);
    return;
  }

  protected consumeNumber(range: Ct.NumberRange): Opt<Numeric<null>> {
    const ct = this.p.peek();
    if (Ct.isNumber(ct) && Ct.isInRange(ct, range))
      return fromTokenPeek(ct, this.p);
    return;
  }

  protected consumeAngle(): Opt<Numeric<Cu.Angle>> {
    const ct = this.p.peek();
    if (Ct.isDimensionUnit(kw.unit.angle, ct))
      return fromTokenPeek(ct, this.p);
    if (Ct.isNumber(ct) && Ct.value(ct) == 0)
      return numeric(Ct.value(ct), kw.unit.angle[0], this.p.consumeRawsAfter(ct));
    return;
  }

  protected consumeSlashWithRaws(): Opt<Ct.Raw[]> {
    return this.p.consumeRawsAfterIf(Ct.isTokenValue(Ct.isDelim, '/'));
  }

  protected consumeCommaWithRaws(): Opt<Ct.Raw[]> {
    return this.p.consumeRawsAfterIf(Ct.isComma);
  }
}

// MARK: Modify

export function setShorthandProp<T extends Shorthand<KwAny, V> & Optional<Record<P, V>>, P extends Exclude<keyof T, 'props'>, V>(
  shorthand: T, propMap: Record<P, ShorthandKey<T>>, prop: P, value: T[P]
): T {
  if (isDefined(value)) {
    shorthand.props.set(propMap[prop], value);
    shorthand[prop] = value;
  }
  else {
    shorthand.props.delete(propMap[prop]);
    delete shorthand[prop];
  }
  return shorthand;
}

export function setRawProp<T extends WithRaws, P extends keyof Raws>(value: T, prop: P, raws: Opt<Ct.Raw[]>) {
  if (!raws)
    return;
  value.raws ??= {};
  assert.equal(value.raws[prop], undefined);
  value.raws[prop] = raws;
}

export function convertAngle(from: NumericOpt, toUnit: Cu.Angle): Numeric<Cu.Angle> {
  return convertAngleStrict(from as Numeric<Cu.Angle>, toUnit);
}

export function convertAngleStrict(from: Numeric<Cu.Angle>, toUnit: Cu.Angle): Numeric<Cu.Angle> {
  return numeric(Cu.convertAngle(from.value, from.unit, toUnit), toUnit, from.raws);
}

export function convertFrequency(from: NumericOpt, toUnit: Cu.Frequency): Numeric<Cu.Frequency> {
  return convertFrequencyStrict(from as Numeric<Cu.Frequency>, toUnit);
}

export function convertFrequencyStrict(from: Numeric<Cu.Frequency>, toUnit: Cu.Frequency): Numeric<Cu.Frequency> {
  return numeric(Cu.convertFrequency(from.value, from.unit, toUnit), toUnit, from.raws);
}

export function convertLength(from: NumericOpt, toUnit: Cu.AbsoluteLength): Numeric<Cu.AbsoluteLength> {
  return convertLengthStrict(from as Numeric<Cu.AbsoluteLength>, toUnit);
}

export function convertLengthStrict(from: Numeric<Cu.AbsoluteLength>, toUnit: Cu.AbsoluteLength): Numeric<Cu.AbsoluteLength> {
  return numeric(Cu.convertLength(from.value, from.unit, toUnit), toUnit, from.raws);
}

export function convertPercent(from: NumericOpt, toUnit: Cu.Percent): Numeric<Cu.Percent>;
export function convertPercent(from: NumericOpt, toUnit: null): Numeric<null>;
export function convertPercent(from: NumericOpt, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent>;
export function convertPercent(from: NumericOpt, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent> {
  return convertPercentStrict(from as NumericOpt<Cu.Percent>, toUnit);
}

export function convertPercentStrict(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent): Numeric<Cu.Percent>;
export function convertPercentStrict(from: NumericOpt<Cu.Percent>, toUnit: null): Numeric<null>;
export function convertPercentStrict(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent>;
export function convertPercentStrict(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent> {
  return numeric(Cu.convertPercent(from.value, from.unit, toUnit), toUnit, from.raws);
}

export function convertResolution(from: NumericOpt, toUnit: Cu.Resolution): Numeric<Cu.Resolution> {
  return convertResolutionStrict(from as Numeric<Cu.Resolution>, toUnit);
}

export function convertResolutionStrict(from: Numeric<Cu.Resolution>, toUnit: Cu.Resolution): Numeric<Cu.Resolution> {
  return numeric(Cu.convertResolution(from.value, from.unit, toUnit), toUnit, from.raws);
}