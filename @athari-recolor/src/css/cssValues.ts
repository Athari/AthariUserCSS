import assert from 'node:assert/strict';
import { Optional } from 'utility-types';
import { Ct } from './cssTokens.ts';
import { Kw, kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import {
  LiteralUnion, Opt,
  isNull, isNumber, isString, isAssigned, isDefined, throwError,
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
  }

  export interface WithRaws {
    raws?: Opt<Raws>;
  }

  export interface Function<T extends KwAny = KwAny> extends WithRaws {
    name: T;
    params: AnyValue[];
    raws?: Raws;
  }

  export interface Keyword<T extends KwAny = KwAny> extends WithRaws {
    name: T;
    raws?: Raws;
  }

  export interface Numeric<U extends KwAnyOpt = KwAnyOpt> extends WithRaws {
    value: number;
    unit: U;
    //signCharacter?: '+' | '-';
    raws?: Raws;
  }

  export interface NumericRange<U extends KwAnyOpt = KwAnyOpt> {
    start: Numeric<U>;
    end: Numeric<U>;
  }

  export interface String<T extends KwAny = KwAny> extends WithRaws {
    value: T;
    raws?: Raws;
  }

  export interface Url extends WithRaws {
    url: URL;
    raws?: Raws;
  }

  export type KeywordLax<T extends KwAny = KwAny> = Keyword<KwUnion<T>>;
  export type NumericLax<T extends KwAny = KwAny> = Numeric<KwUnion<T>>;
  export type NumericOpt<T extends KwAnyOpt = KwAnyOpt> = Numeric<KwUnion<T | null>>;
  export type NumericLaxOpt<T extends KwAnyOpt = KwAnyOpt> = Numeric<KwUnion<T | null>>;
  export type NumericRangeLax<T extends KwAny = KwAny> = NumericRange<KwUnion<T>>;
  export type NumericRangeOpt<T extends KwAnyOpt = KwAnyOpt> = NumericRange<KwUnion<T | null>>;
  export type NumericRangeLaxOpt<T extends KwAnyOpt = KwAnyOpt> = NumericRange<KwUnion<T | null>>;

  export type AnyValue = Function | Keyword | Numeric | String | Url;

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

  export function isNumeric(v: AnyValue): v is Numeric<KwAnyOpt> {
    return true
      && 'value' in v && isNumber(v.value)
      && 'unit' in v && (isString(v.unit) || isNull(v.unit))
      && 'type' in v && (v.type === Ct.NumberType.Integer || v.type === Ct.NumberType.Number);
  }

  export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[]): v is Numeric<T>;
  export function isNumericUnit(v: AnyValue, units: null): v is Numeric<null>;
  export function isNumericUnit<T extends KwAny>(v: AnyValue, units: readonly T[] | null): v is Numeric<T> {
    return isNumeric(v) &&
      (isAssigned(units) ? isString(v.unit) && Kw.equals(v.unit, units) : isNull(v.unit));
  }

  export function isNumericOpt<T extends KwAny>(v: AnyValue, units: readonly T[]): v is Numeric<KwUnion<T | null>> {
    return isNumeric(v) &&
      (isString(v.unit) ? Kw.equals(v.unit, units) : isNull(v.unit));
  }

  export function isKeyword(v: AnyValue): v is Keyword<KwAny> {
    return 'name' in v && isString(v.name) && !('params' in v);
  }

  export function isKeywordName<T extends KwAny>(v: AnyValue, keywords: readonly T[]): v is Keyword<T> {
    return isKeyword(v) && Kw.equals(v.name, keywords);
  }

  // MARK: Create

  function withRaws<T extends WithRaws>(value: T, after: Opt<Ct.Raw[]>): T {
    setRawProp(value, 'after', after);
    return value;
  }

  export function fromToken<T extends Ct.Token>(ct: T, raws?: Opt<Ct.Raw[]>): TokenToValue<T>;
  export function fromToken<T extends Ct.Token>(ct: T, raws?: Opt<Ct.Raw[]>): unknown {
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
    return fromToken(ct, p.consumeWithRaws().raws);
  }

  export function func<T extends KwAny>(name: string, params: AnyValue[] = [], raws?: Opt<Ct.Raw[]>): Function {
    return withRaws<Function>({ name: name.toLowerCase() as T, params }, raws);
  }

  export function keyword<T extends KwAny>(name: T, raws?: Opt<Ct.Raw[]>): Keyword<T> {
    return withRaws<Keyword<T>>({ name: name.toLowerCase() as T }, raws);
  }

  export function numeric<T extends KwAnyOpt>(value: number, unit: T, raws?: Opt<Ct.Raw[]>): Numeric<T> {
    return withRaws<Numeric<T>>({ value, unit }, raws);
  }

  export function numericRange<T extends KwAnyOpt>(start: Numeric<T>, end: Numeric<T>): NumericRange<T> {
    return { start, end };
  }

  export function string<T extends KwAny>(value: T, raws?: Opt<Ct.Raw[]>): String<T> {
    return withRaws<String<T>>({ value }, raws);
  }

  export function url(url: string, raws?: Opt<Ct.Raw[]>): Url {
    return withRaws<Url>({ url: new URL(url) }, raws);
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

    protected consumeAngle(): Opt<NumericLax<Cu.Angle>> {
      const ct = this.p.peek();
      if (Ct.isDimensionUnit(kw.unit.angle, ct))
        return fromTokenPeek(ct, this.p);
      if (Ct.isNumber(ct) && Ct.value(ct) == 0)
        return numeric(Ct.value(ct), kw.unit.angle[0], this.p.consumeWithRaws().raws);
      return;
    }

    protected consumeSlashWithRaws(): Opt<Ct.Raw[]> {
      return this.p.consumeWithRawsIf(Ct.isTokenValue(Ct.isDelim, '/'))?.raws;
    }

    protected consumeCommaWithRaws(): Opt<Ct.Raw[]> {
      return this.p.consumeWithRawsIf(Ct.isComma)?.raws;
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

  const cssAbsoluteLengthMult: Record<Cu.AbsoluteLength, number> = {
    px: 1,
    cm: 96 / 2.54,
    mm: 96 / 2.54 / 10,
    q: 96 / 2.54 / 10 / 4,
    in: 96,
    pc: 96 / 6,
    pt: 96 / 72,
  };

  export function convertAbsoluteLength(from: Numeric<Cu.AbsoluteLength>, toUnit: Cu.AbsoluteLength): Numeric<Cu.AbsoluteLength> {
    return {
      ...from,
      value: from.value * getMult(from.unit, "Source") / getMult(toUnit, "Target"),
      unit: toUnit,
    };

    function getMult(unit: Cu.AbsoluteLength, msg: string) {
      if (!Cu.isLengthAbsolute(from.unit))
        throwError(`${msg} unit must be absolute, ${unit} provided`);
      return cssAbsoluteLengthMult[unit.toLowerCase() as Cu.AbsoluteLength];
    }
  }
}