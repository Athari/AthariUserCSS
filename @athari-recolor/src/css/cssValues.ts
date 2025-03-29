import assert from 'node:assert/strict';
import { Optional } from 'utility-types';
import { Ct } from './cssTokens.ts';
import { Kw, kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import {
  LiteralUnion, Opt,
  isNull, isAssigned, isDefined, isObject, isArray, throwError,
  isString as isStringPrimitive,
} from '../utils.ts';

export namespace Cv {

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
    before?: Ct.Raw[];
    after?: Ct.Raw[];
    between?: Ct.Raw[];
  }

  export interface WithRaws {
    raws?: Opt<Raws>;
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

  const valueTypes = Object.values(ValueType).filter(isStringPrimitive);

  export interface Value {
    readonly type: ValueType;
  }

  export interface Function<N extends KwAny = KwAny, V = AnyValue> extends Value, WithRaws {
    readonly type: ValueType.Function;
    name: N;
    params: V[];
    raws?: Raws;
  }

  export interface Keyword<N extends KwAny = KwAny> extends Value, WithRaws {
    readonly type: ValueType.Keyword;
    name: N;
    raws?: Raws;
  }

  export interface Numeric<U extends KwAnyOpt = KwAnyOpt> extends Value, WithRaws {
    readonly type: ValueType.Numeric;
    value: number;
    unit: U;
    raws?: Raws;
  }

  export interface NumericRange<U extends KwAnyOpt = KwAnyOpt> extends Value {
    readonly type: ValueType.NumericRange;
    start: Numeric<U>;
    end: Numeric<U>;
  }

  export interface NumericWithKeyword<N extends KwAny = KwAny, U extends KwAnyOpt = KwAnyOpt> extends Value, WithRaws {
    readonly type: ValueType.NumericWithKeyword;
    name: N;
    value: number;
    unit: U;
    raws?: Raws;
  }

  export interface NumericRangeWithKeyword<N extends KwAny = KwAny, U extends KwAnyOpt = KwAnyOpt> extends Value {
    readonly type: ValueType.NumericRangeWithKeyword;
    name: N;
    start: Numeric<U>;
    end: Numeric<U>;
  }

  export interface String<V extends KwAny = KwAny> extends Value, WithRaws {
    readonly type: ValueType.String;
    value: V;
    raws?: Raws;
  }

  export interface Url extends Value, WithRaws {
    readonly type: ValueType.Url;
    url: URL;
    raws?: Raws;
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
    T extends Ct.WithStringValue<Ct.Ident, any> ? Keyword<Ct.ValueOf<T>> :
    T extends Ct.WithStringValue<Ct.String, any> ? String<Ct.ValueOf<T>> :
    T extends Ct.Dimension ? Numeric<Ct.UnitOf<T>> :
    T extends Ct.Percentage ? Numeric<'%'> :
    T extends Ct.Number ? Numeric<null> :
    T extends Ct.Function ? Function<Ct.ValueOf<T>> :
    T extends Ct.Url ? Url :
    never;

  // MARK: Guards

  export function isValue(v: unknown): v is AnyValue {
    return isObject(v) && 'type' in v && isStringPrimitive(v.type) && Kw.equals(v.type, valueTypes);
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

  export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[]): v is Numeric<T>;
  export function isNumericUnit(v: AnyValue, units: null): v is Numeric<null>;
  export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[] | null): v is Numeric<T> {
    return isNumeric(v) &&
      (isAssigned(units) ? isStringPrimitive(v.unit) && Kw.equals(v.unit, units) : isNull(v.unit));
  }

  export function isNumericOpt<T extends KwAny>(v: AnyValue, units: readonly T[]): v is Numeric<KwUnion<T | null>> {
    return isNumeric(v) &&
      (isStringPrimitive(v.unit) ? Kw.equals(v.unit, units) : isNull(v.unit));
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
    name: N, value: Numeric<U>
  ): NumericWithKeyword<N, U>;
  export function numericWithKeyword<N extends KwAny, U extends KwAnyOpt>(
    name: N, value: number, unit: U, raws?: Opt<Raws | Ct.Raw[]>
  ): NumericWithKeyword<N, U>;
  export function numericWithKeyword<N extends KwAny, U extends KwAnyOpt>(
    name: N, value: Numeric<U> | number, unit?: U, raws?: Opt<Raws | Ct.Raw[]>
  ): NumericWithKeyword<N, U> {
    return isValue(value)
      ? withRaws<NumericWithKeyword<N, U>>({ type: ValueType.NumericWithKeyword, name, value: value.value, unit: value.unit }, value.raws)
      : withRaws<NumericWithKeyword<N, U>>({ type: ValueType.NumericWithKeyword, name, value, unit: unit! }, raws);
  }

  export function numericRangeWithKeyword<N extends KwAny, U extends KwAnyOpt>(name: N, start: Numeric<U>, end: Numeric<U>): NumericRangeWithKeyword<N, U> {
    return { type: ValueType.NumericRangeWithKeyword, name, start, end };
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
    if (isDefined(value))
      shorthand.props.set(propMap[prop], value);
    else
      shorthand.props.delete(propMap[prop]);
    shorthand[prop] = value;
    return shorthand;
  }

  export function setRawProp<T extends WithRaws, P extends keyof Raws>(value: T, prop: P, raws: Opt<Ct.Raw[]>) {
    if (!raws)
      return;
    value.raws ??= {};
    assert.equal(value.raws[prop], undefined);
    value.raws[prop] = raws;
  }

  export function convertAngle(from: Numeric<Cu.Angle>, toUnit: Cu.Angle): Numeric<Cu.Angle> {
    return numeric(Cu.convertAngle(from.value, from.unit, toUnit), toUnit, from.raws);
  }

  export function convertFrequency(from: Numeric<Cu.Frequency>, toUnit: Cu.Frequency): Numeric<Cu.Frequency> {
    return numeric(Cu.convertFrequency(from.value, from.unit, toUnit), toUnit, from.raws);
  }

  export function convertLength(from: Numeric<Cu.AbsoluteLength>, toUnit: Cu.AbsoluteLength): Numeric<Cu.AbsoluteLength> {
    return numeric(Cu.convertLength(from.value, from.unit, toUnit), toUnit, from.raws);
  }

  export function convertPercent(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent): Numeric<Cu.Percent>;
  export function convertPercent(from: NumericOpt<Cu.Percent>, toUnit: null): Numeric<null>;
  export function convertPercent(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent>;
  export function convertPercent(from: NumericOpt<Cu.Percent>, toUnit: Cu.Percent | null): NumericOpt<Cu.Percent> {
    return numeric(Cu.convertPercent(from.value, from.unit, toUnit), toUnit, from.raws);
  }

  export function convertResolution(from: Numeric<Cu.Resolution>, toUnit: Cu.Resolution): Numeric<Cu.Resolution> {
    return numeric(Cu.convertResolution(from.value, from.unit, toUnit), toUnit, from.raws);
  }
}