import { Ct } from './cssTokens.ts';
import { Kw, kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import { isNull, isNumber, isString, LiteralUnion, Opt, throwError } from '../utils.ts';

export namespace Cv {

  // MARK: Types

  export interface Raws {
    before?: Ct.Raw[];
    after?: Ct.Raw[];
  }

  export interface WithRaws {
    raws?: Opt<Raws>;
  }

  export interface Raws {
    before?: Ct.Raw[];
    after?: Ct.Raw[];
  }

  export interface Keyword<T> {
    keyword: T;
    raws?: Raws;
  }

  export interface String<T extends string = string> {
    value: T;
    raws?: Raws;
  }

  export interface Numeric<T> {
    value: number;
    unit: T;
    signCharacter?: '+' | '-';
    raws?: Raws;
  }

  export interface NumericRange<T> {
    start: Numeric<T>;
    end: Numeric<T>;
  }

  export type KeywordLax<T extends string> = Keyword<LiteralUnion<T>>;
  export type NumericLax<T extends string> = Numeric<LiteralUnion<T>>;
  export type NumericLaxOpt<T extends string> = Numeric<LiteralUnion<T> | null>;
  export type NumericRangeLax<T extends string> = NumericRange<LiteralUnion<T>>;
  export type NumericRangeLaxOpt<T extends string> = NumericRange<LiteralUnion<T> | null>;

  // MARK: Create

  function withRaws<T extends WithRaws>(value: T, after: Opt<Ct.Raw[]>): T {
    if (after)
      (value.raws ??= {}).after = after;
    return value;
  }

  export function fromToken<T extends Ct.Ident>(ct: T, raws?: Opt<Ct.Raw[]>): Keyword<string>;
  export function fromToken<T extends Ct.String>(ct: T, raws?: Opt<Ct.Raw[]>): String<string>;
  export function fromToken<U extends Ct.UnitType, T extends Ct.WithUnit<U>>(ct: T, raws?: Opt<Ct.Raw[]>): Numeric<U>;
  export function fromToken<T extends Ct.Dimension>(ct: T, raws?: Opt<Ct.Raw[]>): Numeric<string>;
  export function fromToken<T extends Ct.Percentage>(ct: T, raws?: Opt<Ct.Raw[]>): Numeric<'%'>;
  export function fromToken<T extends Ct.Number>(ct: T, raws?: Opt<Ct.Raw[]>): Numeric<null>;
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
    throwError(`Unexpected token type: ${ct[0]}`);
  }

  export function keyword<T extends string>(keyword: T, raws?: Opt<Ct.Raw[]>): Keyword<T> {
    return withRaws<Keyword<T>>({ keyword: keyword.toLowerCase() as T }, raws);
  }

  export function string<T extends string>(value: T, raws?: Opt<Ct.Raw[]>): String<T> {
    return withRaws<String<T>>({ value: value }, raws);
  }

  export function numberType(value: number): Ct.NumberType {
    return Number.isInteger(value) ? Ct.NumberType.Integer : Ct.NumberType.Number;
  }

  export function numeric<T extends string | null>(value: number, unit: T, raws?: Opt<Ct.Raw[]>): Numeric<T> {
    return withRaws<Numeric<T>>({ value, unit }, raws);
  }

  export function numericRange<T extends string | null>(start: Numeric<T>, end: Numeric<T>): NumericRange<T> {
    return { start, end };
  }

  // MARK: Parse

  export abstract class Parser {
    protected p: Ct.Parser = Ct.parser("");

    protected consumeIdent<T extends string>(values: readonly T[] = []): Opt<Keyword<T>> {
      const ct = this.p.peek();
      if (values.length === 0 && Ct.isIdent(ct) || Ct.isIdentValue(values, ct))
        return keyword(Ct.value(ct) as T, this.p.consumeWithSpace().raws);
      return;
    }

    protected consumeLengthOrPercent(range: Ct.NumberRange, unitless?: boolean): Opt<NumericLaxOpt<Cu.Length | Cu.Percent>> {
      const ct = this.p.peek();
      if (Ct.isDimension(ct) || Ct.isNumber(ct))
        return this.consumeLength(range, unitless);
      if (Ct.isPercentage(ct))
        return this.consumePercent(range);
      return;
    }

    protected consumeLength(range: Ct.NumberRange, unitless?: boolean): Opt<NumericLaxOpt<Cu.Length>> {
      const ct = this.p.peek();
      if (Ct.isDimension(ct) && Ct.isDimensionUnit(kw.unit.length.all, ct) && Ct.isInRange(ct, range))
        return fromToken(ct, this.p.consumeWithSpace().raws);
      if (Ct.isNumber(ct) && (Ct.value(ct) === 0 || unitless) && Ct.isInRange(ct, range))
        return fromToken(ct, this.p.consumeWithSpace().raws);
      return;
    }

    protected consumePercent(range: Ct.NumberRange): Opt<Numeric<Cu.Percent>> {
      const ct = this.p.peek();
      if (Ct.isPercentage(ct) && Ct.isInRange(ct, range))
        return fromToken(ct, this.p.consumeWithSpace().raws);
      return;
    }

    protected consumeNumber(range: Ct.NumberRange): Opt<Numeric<null>> {
      const ct = this.p.peek();
      if (Ct.isNumber(ct) && Ct.isInRange(ct, range))
        return fromToken(ct, this.p.consumeWithSpace().raws);
      return;
    }

    protected consumeAngle(): Opt<NumericLax<Cu.Angle>> {
      const ct = this.p.peek();
      if (Ct.isDimensionUnit(kw.unit.angle, ct))
        return fromToken(ct, this.p.consumeWithSpace().raws);
      if (Ct.isNumber(ct) && Ct.value(ct) == 0)
        return numeric(Ct.value(ct), kw.unit.angle[0], this.p.consumeWithSpace().raws);
      return;
    }

    protected consumeSlashWithSpace(): boolean {
      const ct = this.p.peek();
      if (Ct.isTokenValue(Ct.isDelim, '/', ct)) {
        this.p.consume();
        this.p.consumeSpace();
        return true;
      }
      return false;
    }

    protected consumeCommaWithSpace(): boolean {
      const ct = this.p.peek();
      if (Ct.isComma(ct)) {
        this.p.consume();
        this.p.consumeSpace();
        return true;
      }
      return false;
    }
  }

  // MARK: Utils

  export function isAnyNumeric(v: Keyword<unknown> | Numeric<unknown>): v is Numeric<unknown> {
    return true
      && 'value' in v && isNumber(v.value)
      && 'unit' in v && (isString(v.unit) || isNull(v.unit))
      && 'type' in v && (v.type === Ct.NumberType.Integer || v.type === Ct.NumberType.Number);
  }

  export function isNumeric<T extends string>(v: Keyword<T> | Numeric<T>, units: readonly T[]): v is Numeric<T> {
    return isAnyNumeric(v) && Kw.equals(v.unit, units);
  }

  export function isUnitlessNumeric<T>(v: Keyword<T> | Numeric<T>): v is Numeric<T> {
    return isAnyNumeric(v) && isNull(v.unit);
  }

  export function isAnyKeyword(v: Keyword<unknown> | Numeric<unknown>): v is Keyword<unknown> {
    return 'keyword' in v && isString(v.keyword);
  }

  export function isKeyword<T extends string>(v: Keyword<T> | Numeric<T>, keywords: readonly T[]): v is Keyword<T> {
    return isAnyKeyword(v) && Kw.equals(v.keyword, keywords);
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