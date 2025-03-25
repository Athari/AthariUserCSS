import { match, P } from 'ts-pattern';
import { Ct, Cn } from './domUtils.ts';
import {
  Guard, LiteralUnion, Opt, ValueOf,
  deepMerge, isArray, isDefined, isNull, isNumber, isSome, isString, throwError,
} from './utils.ts';
;
const { select: val, when: is, instanceOf: ctr, any } = P;
const z = <T>(a: T) => a;
const noop = () => {};

class Val<T, V extends { type: T }> {
  t: T;
  #v: V;
  v() { return this.#v }
  constructor(v: V) {
    this.t = v.type;
    this.#v = v;
  }
}

//function w<V extends { type: unknown }>(v: Record<PropertyKey, V>): Record<PropertyKey, Val<V['type'], V>>;
function w<V extends { type: unknown }>(v: V[][]): Val<V['type'], V>[][];
function w<V extends { type: unknown }>(v: V[]): Val<V['type'], V>[];
function w<V extends { type: unknown }>(v: V): Val<V['type'], V>;
function w<V extends { type: unknown }>(v: V[][] | V[] | V): Val<V['type'], V>[][] | Val<V['type'], V>[] | Val<V['type'], V> {
  return isArray(v) ? (v as any).map(w) : new Val(v);
}

//function u<T, V extends { type: T }>(v: Record<PropertyKey, Val<T, V>>): Record<PropertyKey, V>;
function u<T, V extends { type: T }>(v: Val<T, V>[][]): V[][];
function u<T, V extends { type: T }>(v: Val<T, V>[]): V[];
function u<T, V extends { type: T }>(v: Val<T, V>): V;
function u<T, V extends { type: T }>(v: Val<T, V>[][] | Val<T, V>[] | Val<T, V>): V[][] | V[][] | V {
  return v instanceof Val ? v.v() : isArray(v) ? (v as any).map(u) : v;
}

function wg<W extends V, V extends { type: T }, T>(g: (v: V) => v is W) {
  return (val: Val<T, V>): val is Val<W['type'], W> => g(val.v());
}

export class CssFontParser {
  // [
  //   [
  //     || <'font-style'>
  //     || <font-variant-css2>
  //     || <'font-weight'>
  //     || <font-width-css3>
  //   ]?
  //   <'font-size'>
  //   [
  //     / <'line-height'>
  //   ]?
  //   <'font-family'>#
  // ]
  // | <system-family-name>
  parseFont(source: string | Ct.Token[]): CssFont {
    const [ cnsMain, ...cnsFamilies ] = Cn.parseCommaList(source);
    const fontFamilies: CssFontFamilies = [];
    for (const cnsFamily of cnsFamilies)
      fontFamilies.push(this.#parseFamily(cnsFamily));
    ;
    return {
      family: [ { value: 'Segoe UI' }, { value: 'sans-serif' }, { scriptSpecific: true, value: 'kai' } ],
      size: { value: 10, unit: 'rem', type: Ct.NumberType.Number },
      stretch: { keyword: "condensed" },
      style: { keyword: 'oblique', value: 14, unit: 'deg', type: Ct.NumberType.Integer },
      variant: { keyword: 'small-caps' },
      weight: { keyword: 'revert' },
      lineHeight: { value: 2, unit: null, type: Ct.NumberType.Number },
    };
  }

  tokenizeFont(font: CssFont): Ct.Token[] {
    throw "";
  }

  stringifyFont(font: CssFont): string {
    return Ct.stringify(this.tokenizeFont(font));
  }

  #parseFamily(cnsFamily: Cn.Node[]): CssFontFamily {
    const { value, raws } = this.#splitCnValueAndRaws(cnsFamily);
    return match(w(value)).returnType<CssFontFamily>()
      .with(
        [ val(is(c => wg(Cn.isFunction)(c) && u(c).getName() == 'generic')) ],
        c => {
          const { value: keyword, raws: valueRaws } = this.#parseIdent(u(c).tokens(), keywords.font.family.scriptSpecific);
          return <CssFontFamilyScriptSpecificKeywordValue>{
            keyword,
            scriptSpecific: true,
            raws: deepMerge(null, {}, raws, { value: valueRaws }),
          };
        })
      .with(
        [ val(is(wg(Cn.isToken(Ct.isIdent)))) ],
        c => isCssFontFamilyGeneric(Cn.getValue(u(c)))
          ? <CssKeywordValue<CssFontFamilyGenericString>>{
            keyword: Cn.getValue(u(c)),
            raws,
          }
          : <CssStringValue>{
            value: Cn.getValue(u(c)),
            raws,
          })
      .with(
        [ val(is(wg(Cn.isToken(Ct.isString)))) ],
        c => <CssStringValue>{
          value: Cn.getValue(u(c)),
          raws,
        })
      .otherwise(
        cs => <CssStringValue>{
          value: Cn.stringifyList([ u(cs) ]),
          raws,
        });
  }

  #parseIdent<T extends string>(cts: Ct.Token[], keywords: readonly T[]): ValueWithRaws<LiteralUnion<T>> {
    const { value, raws } = this.#splitCtValueAndRaws(cts);
    const id = match<Ct.Token[], LiteralUnion<T>>(value)
      .with(
        [ [ Ct.Type.Ident as const, any, any, any, { value: val() } ] ],
        v => v.toString())
      .otherwise(
        ts => Ct.stringify(ts));
    return this.#withRaws(id, raws?.before, raws?.after);
  }

  // #CtMatch<T extends Ct.Token>(type: T[0], value?: object) {
  //   return P.shape([ type, any, any, any, value ?? any ]);
  // }

  #splitCtValueAndRaws(cts: Ct.Token[]): ValueWithRaws<Ct.Token[]> {
    if (cts.every(Ct.isRaw))
      return this.#withRaws([], getCtsRaws(cts), undefined);
    const before = getCtsRaws(cts.takeWhile(Ct.isRaw));
    const after = getCtsRaws(cts.toReversed().takeWhile(Ct.isRaw));
    const value = cts.slice(before.length, cts.length - after.length);
    return this.#withRaws(value, before, after);

    function getCtsRaws(cts: Iterable<Ct.Token>): CtRaw[] {
      // TODO: Fix signature of IEnumerable.where to make it behave like Array.filter, then remove redundant filter call. Same below.
      return [...cts].filter(isSome(Ct.isSpace, Ct.isComment)).toArray();
    }
  }

  #splitCnValueAndRaws(cns: Cn.Node[]): ValueWithRaws<Cn.Node[]> {
    if (cns.every(Cn.isSpaceOrComment))
      return this.#withRaws([], getCnsRaws(cns), undefined);
    const before = getCnsRaws(cns.takeWhile(Cn.isSpaceOrComment));
    const after = getCnsRaws(cns.toReversed().takeWhile(Cn.isSpaceOrComment));
    const value = cns.slice(before.length, cns.length - after.length);
    return this.#withRaws(value, before, after);

    function getCnsRaws(cns: Iterable<Cn.Node>): CtRaw[] {
      return [...cns]
        .flatMap((cn: Cn.Node) =>
          match(w(cn)).returnType<Ct.Token[]>()
            .with(is(wg(Cn.isSpace)), c => u(c).value)
            .with(is(wg(Cn.isComment)), c => [ u(c).value ])
            .otherwise(_ => []))
        .filter(Ct.isRaw);
    }
  }

  #withRaws<T>(value: T, before: Opt<CtRaw[]>, after: Opt<CtRaw[]>): ValueWithRaws<T> {
    const ret = <ValueWithRaws<T>>{ value };
    if (before)
      (ret.raws ??= {}).before = before;
    if (after)
      (ret.raws ??= {}).after = after;
    return ret;
  }
}

interface ValueWithRaws<T> {
  value: T;
  raws?: Opt<CssValueRaws>;
}

type CtRaw = Ct.Space | Ct.Comment;

interface CssValueRaws {
  before?: CtRaw[];
  after?: CtRaw[];
}

interface CssKeywordValue<T> {
  keyword: T;
  raws?: CssValueRaws;
}

interface CssStringValue<T extends string = string> {
  value: T;
  raws?: CssValueRaws;
}

interface CssNumericValue<T> {
  value: number;
  unit: T;
  type: Ct.NumberType;
  signCharacter?: '+' | '-';
  raws?: CssValueRaws;
}

interface CssFontStyleObliqueValue extends CssKeywordValue<CssFontStyleObliqueKeyword>, CssNumericValue<CssAngleUnit> { }

interface CssFontFamilyScriptSpecificKeywordValue extends CssKeywordValue<LiteralUnion<CssFontFamilyScritSpecificString>> {
  scriptSpecific: true; // wrapped in `generic()` function
}

const keywords = new class {
  readonly global = [ 'inherit', 'initial', 'revert', 'revert-layer', 'unset' ] as const;
  readonly unit = new class {
    readonly angle = [ 'deg', 'grad', 'rad', 'turn' ] as const;
    readonly length = new class {
      readonly absolute = [ 'px', 'cm', 'mm', 'q', 'in', 'pc', 'pt' ] as const;
      readonly relative = [ 'cap', 'ch', 'em', 'ex', 'ic', 'lh' ] as const;
      readonly relativeRoot = [ 'rcap', 'rch', 'rem', 'rex', 'ric', 'rlh' ] as const;
      readonly containerQuery = [ 'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax' ] as const;
      readonly viewport = new class {
        readonly default = [ 'vh', 'vw', 'vmax', 'vmin', 'vb', 'vi' ] as const;
        readonly small = [ 'svh', 'svw', 'svmax', 'svmin', 'svb', 'svi' ] as const;
        readonly large = [ 'lvh', 'lvw', 'lvmax', 'lvmin', 'lvb', 'lvi' ] as const;
        readonly dynamic = [ 'dvh', 'dvw', 'dvmax', 'dvmin', 'dvb', 'dvi' ] as const;
        readonly all = [ ...this.default, ...this.small, ...this.large, ...this.dynamic ] as const;
      };
      readonly all = [ ...this.absolute, ...this.relative, ...this.relativeRoot, ...this.containerQuery, ...this.viewport.all ] as const;
    };
    readonly percent = [ '%' ] as const;
  };
  readonly font = new class {
    readonly family = new class {
      readonly generic = new class {
        readonly complete = [ 'serif', 'sans-serif', 'system-ui', 'cursive', 'fantasy', 'math', 'monospace' ] as const;
        readonly incomplete = [ 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded' ] as const;
        readonly extra = [ 'emoji', 'fangsong' ] as const;
        readonly all = [ ...this.complete, ...this.incomplete, ...this.extra ] as const;
      };
      readonly system = [ 'caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar' ] as const;
      readonly scriptSpecific = [ 'fangsong', 'kai', 'khmer-mul', 'nastaliq' ] as const;
    };
    readonly size = new class {
      readonly absolute = [ 'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large' ] as const;
      readonly relative = [ 'smaller', 'larger' ] as const;
      readonly math = [ 'math' ] as const;
      readonly all = [ ...this.absolute, ...this.relative, ...this.math ] as const;
    };
    readonly stretch = new class {
      readonly condensed = [ 'semi-condensed', 'condensed', 'extra-condensed', 'ultra-condensed' ] as const;
      readonly expanded = [ 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded' ] as const;
      readonly normal = [ 'normal' ] as const;
      readonly all = [ ...this.normal, ...this.condensed, ...this.expanded ] as const;
    };
    readonly style = new class {
      readonly generic = [ 'normal', 'italic' ] as const;
      readonly oblique = [ 'oblique' ] as const;
      readonly all = [ ...this.generic, ...this.oblique ] as const;
    };
    // small subset of values supported in the `font` shorthand
    readonly variant = [ 'normal', 'small-caps' ] as const;
    readonly weight = new class {
      readonly absolute = [ 'normal', 'bold' ] as const;
      readonly relative = [ 'lighter', 'bolder' ] as const;
      readonly all = [ ...this.absolute, ...this.relative ] as const;
    };
    readonly lineHeight = [ 'normal' ] as const;
  };
};

type CssGlobalValueKeyword = typeof keywords.global[number];

type CssAngleUnit = typeof keywords.unit.angle[number];

type CssAbsoluteLengthUnit = typeof keywords.unit.length.absolute[number];
type CssRelativeLengthUnit = typeof keywords.unit.length.relative[number];
type CssRelativeRootLengthUnit = typeof keywords.unit.length.relativeRoot[number];
type CssContainerQueryLengthUnit = typeof keywords.unit.length.containerQuery[number];
type CssViewportDefaultLengthUnit = typeof keywords.unit.length.viewport.default[number];
type CssViewportSmallLengthUnit = typeof keywords.unit.length.viewport.small[number];
type CssViewportLargeLengthUnit = typeof keywords.unit.length.viewport.large[number];
type CssViewportDynamicLengthUnit = typeof keywords.unit.length.viewport.dynamic[number];
type CssViewportLengthUnit = typeof keywords.unit.length.viewport.all[number];
type CssLengthUnit = typeof keywords.unit.length.all[number];

type CssPercentUnit = typeof keywords.unit.percent[number];

type CssFontFamilyGenericString = typeof keywords.font.family.generic.all[number];
type CssFontFamilySystemString = typeof keywords.font.family.system[number];
type CssFontFamilyScritSpecificString = typeof keywords.font.family.scriptSpecific[number];

type CssFontSizeAbsoluteKeyword = typeof keywords.font.size.absolute[number];
type CssFontSizeRelativeKeyword = typeof keywords.font.size.relative[number];
type CssFontSizeMathKeyword = typeof keywords.font.size.math[number];
type CssFontSizeKeyword = typeof keywords.font.size.all[number];

type CssFontStretchCondensedKeyword = typeof keywords.font.stretch.condensed[number];
type CssFontStretchExpandedKeyword = typeof keywords.font.stretch.expanded[number];
type CssFontStretchKeyword = typeof keywords.font.stretch.all[number];

type CssFontStyleGenericKeyword = typeof keywords.font.style.generic[number];
type CssFontStyleObliqueKeyword = typeof keywords.font.style.oblique[number];
type CssFontStyleKeyword = typeof keywords.font.style.all[number];

type CssFontVariantKeyword = typeof keywords.font.variant[number];

type CssFontWeightAbsoluteKeyword = typeof keywords.font.weight.absolute[number];
type CssFontWeightRelativeKeyword = typeof keywords.font.weight.relative[number];
type CssFontWeightKeyword = typeof keywords.font.weight.all[number];

type CssFontLineHeightKeyword = typeof keywords.font.lineHeight[number];

interface CssFont {
  family: CssFontFamilies;
  size: CssFontSize;
  stretch: CssFontStretch;
  style: CssFontStyle;
  variant: CssFontVariant;
  weight: CssFontWeight;
  lineHeight: CssFontLineHeight;
}

type CssFontFamily =
  | CssStringValue
  | CssFontFamilyScriptSpecificKeywordValue
  | CssKeywordValue<LiteralUnion<CssFontFamilyGenericString | CssFontFamilySystemString>>;

type CssFontFamilies =
  | CssKeywordValue<LiteralUnion<CssGlobalValueKeyword>>
  | Array<CssFontFamily>;

type CssFontSize =
  | CssKeywordValue<LiteralUnion<CssFontSizeKeyword | CssGlobalValueKeyword>>
  | CssNumericValue<LiteralUnion<CssLengthUnit | CssPercentUnit> | null>;

type CssFontStretch =
  | CssKeywordValue<LiteralUnion<CssFontStretchKeyword | CssGlobalValueKeyword>>
  | CssNumericValue<LiteralUnion<CssPercentUnit> | null>;

type CssFontStyle =
  | CssKeywordValue<LiteralUnion<CssFontStyleGenericKeyword | CssGlobalValueKeyword>>
  | CssFontStyleObliqueValue;

type CssFontVariant =
  | CssKeywordValue<LiteralUnion<CssFontVariantKeyword | CssGlobalValueKeyword>>;

type CssFontWeight =
  | CssKeywordValue<LiteralUnion<CssFontWeightKeyword | CssGlobalValueKeyword>>
  | CssNumericValue<null>;

type CssFontLineHeight =
  | CssKeywordValue<LiteralUnion<CssFontLineHeightKeyword | CssGlobalValueKeyword>>
  | CssNumericValue<LiteralUnion<CssLengthUnit | CssPercentUnit> | null>;

const stringComparer = Intl.Collator('en-US', { sensitivity: 'base' });

// function isStringAnyOf<T extends string, U extends T>(value: T | Uppercase<T>, values: readonly U[]): value is U | Uppercase<U> {
//   return isDefined(value) && values.some(v => stringComparer.compare(v, value) === 0);
// }
function isStringAnyOf<T extends string, U extends T>(value: T, values: readonly U[]): value is U {
  return isDefined(value) && values.some(v => stringComparer.compare(v, value) === 0);
}

export const isCssUnitLengthAbsolute = (v: string) => isStringAnyOf(v, keywords.unit.length.absolute);

const isCssFontFamilyGeneric = (v: string) => isStringAnyOf(v, keywords.font.family.generic.all);
const isCssFontFamilySystem = (v: string) => isStringAnyOf(v, keywords.font.family.system);
const isCssFontFamilyScriptSpecific = (v: string) => isStringAnyOf(v, keywords.font.family.scriptSpecific);

export function isCssValueAnyNumeric(v: CssKeywordValue<unknown> | CssNumericValue<unknown>): v is CssNumericValue<unknown> {
  return true
    && 'value' in v && isNumber(v.value)
    && 'unit' in v && (isString(v.unit) || isNull(v.unit))
    && 'type' in v && (v.type === Ct.NumberType.Integer || v.type === Ct.NumberType.Number);
}

export function isCssValueNumeric<T>(v: CssKeywordValue<T> | CssNumericValue<T>, guard: Guard<T>): v is CssNumericValue<T> {
  return isCssValueAnyNumeric(v) && guard(v.unit);
}

export function isCssValueUnitlessNumeric<T>(v: CssKeywordValue<T> | CssNumericValue<T>): v is CssNumericValue<T> {
  return isCssValueAnyNumeric(v) && isNull(v.unit);
}

export function isCssValueAnyKeyword(v: CssKeywordValue<unknown> | CssNumericValue<unknown>): v is CssKeywordValue<unknown> {
  return 'keyword' in v && isString(v.keyword);
}

export function isValueKeyword<T>(v: CssKeywordValue<T> | CssNumericValue<T>, guard: Guard<T>): v is CssKeywordValue<T> {
  return isCssValueAnyKeyword(v) && guard(v.keyword);
}

const cssAbsoluteLengthMult: Record<CssAbsoluteLengthUnit, number> = {
  px: 1,
  cm: 96 / 2.54,
  mm: 96 / 2.54 / 10,
  q: 96 / 2.54 / 10 / 4,
  in: 96,
  pc: 96 / 6,
  pt: 96 / 72,
};

export function convertCssAbsoluteLength(
  value: CssNumericValue<CssAbsoluteLengthUnit>, toUnit: CssAbsoluteLengthUnit
): CssNumericValue<CssAbsoluteLengthUnit> {
  return {
    ...value,
    value: value.value * getMult(value.unit, "Source") / getMult(toUnit, "Target"),
    unit: toUnit,
  };

  function getMult(unit: CssAbsoluteLengthUnit, msg: string) {
    if (!isCssUnitLengthAbsolute(value.unit))
      throwError(`${msg} unit must be absolute, ${unit} provided`);
    return cssAbsoluteLengthMult[unit.toLowerCase() as CssAbsoluteLengthUnit];
  }
}