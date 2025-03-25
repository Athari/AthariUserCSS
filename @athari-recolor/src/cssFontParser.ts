import assert from 'node:assert';
import { Ct } from './domUtils.ts';
import {
  Guard, LiteralUnion, Opt,
  isNull, isNumber, isString, logError, throwError,
} from './utils.ts';

interface Context {
  isFontFaceRule: boolean;
  // TODO: Remove value checks in non-strict mode
  strict: boolean;
}

export class CssFontParser {
  getZero(): CssNumericValue<null> {
    return { value: 0, unit: null, type: Ct.NumberType.Integer };
  }

  parseFont(source: string): Opt<CssFont> {
    const parser = Ct.parser(source);
    parser.onParseError = ex => logError(ex, "Failed to parse font");
    const font = <CssFont>{};
    return parseFontShorthand(parser, { isFontFaceRule: false, strict: false }, font) ? font : undefined;
  }

  tokenizeFont(font: CssFont): Ct.Token[] {
    throw "";
  }

  stringifyFont(font: CssFont): string {
    return Ct.stringify(this.tokenizeFont(font));
  }
}

// MARK: Parse font props

function parseFontShorthand(p: Ct.Parser, ctx: Context, font: CssFont): boolean {
  p.consumeSpace();
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.family.system)(ct))
    return consumeSystemFont(p, font);
  return consumeFont(p, ctx, font);
}

function consumeSystemFont(p: Ct.Parser, font: CssFont): boolean {
  const ct = p.consume();
  assert(Ct.isIdent(ct));
  font.family = [ { keyword: ct[4].value } ];
  return true;
}

function consumeFont(p: Ct.Parser, ctx: Context, font: CssFont): boolean {
  let fontStyle: Opt<CssFontStyle>;
  let fontVariant: Opt<CssFontVariant>;
  let fontWeight: Opt<CssFontWeight>;
  let fontStretch: Opt<CssFontStretch>;

  for (let i = 0; i < 4 && !p.isEof(); i++) {
    const ct = p.peek();
    const ident = Ct.isIdent(ct) ? ct[4].value : undefined;

    if (Ct.keywordEqualsOneOf(ident, keywords.normal)) {
      p.consume();
      continue;
    }
    if (!fontStyle && Ct.keywordEqualsOneOf(ident, keywords.font.style.all)) {
      fontStyle = consumeFontStyle(p, ctx);
      if (!fontStyle)
        return false;
      continue;
    }
    if (!fontVariant && Ct.keywordEqualsOneOf(ident, keywords.font.variantCss21)) {
      fontVariant = consumeFontVariantCSS21(p);
      if (fontVariant)
        continue;
    }
    if (!fontWeight) {
      fontWeight = consumeFontWeight(p, ctx);
      if (fontWeight)
        continue;
    }
    if (!fontStretch) {
      fontStretch = consumeFontStretchKeywordOnly(p, ctx);
      if (fontStretch)
        continue;
    }
    break;
  }

  if (p.isEof())
    return false;

  font.style = fontStyle || { keyword: keywords.normal[0] };
  font.variant = fontVariant || { keyword: keywords.normal[0] };
  font.weight = fontWeight || { keyword: keywords.normal[0] };
  font.stretch = fontStretch || { keyword: keywords.normal[0] };

  const fontSize = consumeFontSize(p, ctx);
  if (!fontSize || p.isEof())
    return false;
  font.size = fontSize;

  if (consumeSlashWithSpace(p)) {
    const lineHeight = consumeLineHeight(p, ctx);
    if (!lineHeight)
      return false;
    font.lineHeight = lineHeight;
  }

  const fontFamily = consumeFontFamily(p);
  if (!fontFamily)
    return false;
  font.family = fontFamily;

  return true;
}

function consumeFontSize(p: Ct.Parser, ctx: Context, unitless?: boolean): Opt<CssFontSize> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.size.all)(ct))
    return consumeIdent(p);
  return consumeLengthOrPercent(p, ValueRange.NonNegative, unitless);
}

function consumeLineHeight(p: Ct.Parser, ctx: Context): Opt<CssFontLineHeight> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.lineHeight)(ct))
    return consumeIdent(p);

  const lineHeight = consumeNumber(p, ValueRange.NonNegative);
  if (lineHeight)
    return lineHeight;
  return consumeLengthOrPercent(p, ValueRange.NonNegative, undefined);
}

function consumeFontFamily(p: Ct.Parser): Opt<CssFontFamilies> {
  const list: CssFontFamily[] = [];
  do {
    const genericFamily = consumeGenericFamily(p);
    if (genericFamily) {
      list.push(genericFamily);
    } else {
      const familyName = consumeFamilyName(p);
      if (familyName)
        list.push(familyName);
      else
        return;
    }
  } while (consumeCommaWithSpace(p));
  return list;
}

function consumeNonGenericFamilyNameList(p: Ct.Parser): Opt<CssFontFamilies> {
  const list: CssFontFamily[] = [];
  do {
    const parsedValue = consumeGenericFamily(p);
    if (parsedValue)
      return;
    const familyName = consumeFamilyName(p);
    if (familyName)
      list.push(familyName);
    else
      return;
  } while (consumeCommaWithSpace(p));
  return list;
}

function consumeGenericFamily(p: Ct.Parser): Opt<CssFontFamily> {
  return consumeIdent(p, keywords.font.family.generic.all);
}

function consumeFamilyName(p: Ct.Parser): Opt<CssFontFamily> {
  const ct = p.peek();
  if (Ct.isString(ct)) {
    p.consume();
    return { value: ct[4].value };
  }
  if (!Ct.isIdent(ct))
    return;
  const familyName = concatenateFamilyName(p);
  if (!familyName)
    return;
  return { value: familyName };
}

function concatenateFamilyName(p: Ct.Parser): Opt<string> {
  const builder: string[] = [];
  let addedSpace = false;
  const ct0 = p.peek();

  let ct: Ct.Token;
  while (Ct.isIdent(ct = p.peek())) {
    if (builder.length > 0) {
      builder.push(" ");
      addedSpace = true;
    }
    p.consume();
    builder.push(ct[4].value);
  }

  if (!addedSpace && (Ct.isIdentValue(keywords.global)(ct0) || Ct.isIdentValue(keywords.default)(ct0)))
    return;
  return builder.join("");
}

function consumeFontStyle(p: Ct.Parser, ctx: Context): Opt<CssFontStyle> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.style.generic)(ct))
    return consumeIdent(p);
  if (Ct.isIdentValue(keywords.auto)(ct) && ctx.isFontFaceRule)
    return consumeIdent(p);
  if (!Ct.isIdentValue(keywords.font.style.oblique)(ct))
    return;

  const idOblique = consumeIdent(p, keywords.font.style.oblique)!;
  const startAngle = consumeAngle(p);
  if (!startAngle)
    return idOblique;

  if (!ctx.isFontFaceRule || p.isEof())
    return { keyword: idOblique.keyword, value: startAngle.value };

  const endAngle = consumeAngle(p);
  if (!endAngle)
    return;

  return { keyword: idOblique.keyword, start: startAngle, end: endAngle };
}

function consumeFontStretchKeywordOnly(p: Ct.Parser, ctx: Context): Opt<CssFontStretch> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.stretch.all)(ct))
    return consumeIdent(p);
  if (Ct.isIdentValue(keywords.auto)(ct) && ctx.isFontFaceRule)
    return consumeIdent(p);
  return;
}

function consumeFontStretch(p: Ct.Parser, ctx: Context): Opt<CssFontStretch> {
  const parsedKeyword = consumeFontStretchKeywordOnly(p, ctx);
  if (parsedKeyword)
    return parsedKeyword;

  const startPercent = consumePercent(p, ValueRange.NonNegative);
  if (!startPercent)
    return;

  if (!ctx.isFontFaceRule || p.isEof())
    return startPercent;

  const endPercent = consumePercent(p, ValueRange.NonNegative);
  if (!endPercent)
    return;

  return { start: startPercent, end: endPercent };
}

function consumeFontWeight(p: Ct.Parser, ctx: Context): Opt<CssFontWeight> {
  const ct = p.peek();
  if (Ct.isIdent(ct)) {
    const id = ct[4].value;
    if (!ctx.isFontFaceRule) {
      if (Ct.keywordEqualsOneOf(id, keywords.font.weight.all))
        return consumeIdent(p);
    } else {
      if (Ct.keywordEqualsOneOf(id, [ ...keywords.font.weight.absolute, ...keywords.auto ]))
        return consumeIdent(p);
    }
  }

  if (Ct.isNumber(ct)) {
    const value = ct[4].value;
    if (value < 1 || value > 1000)
      return;
  }

  const startWeight = consumeNumber(p, ValueRange.NonNegative);
  if (!startWeight || startWeight.value < 1 || startWeight.value > 1000)
    return;

  if (!ctx.isFontFaceRule || p.isEof())
    return startWeight;

  const endWeight = consumeNumber(p, ValueRange.NonNegative);
  if (!endWeight || endWeight.value < 1 || endWeight.value > 1000)
    return;

  return { start: startWeight, end: endWeight };
}

function consumeFontVariantCSS21(p: Ct.Parser): Opt<CssFontVariant> {
  return consumeIdent(p, keywords.font.variantCss21);
}

// MARK: Parse values

function consumeIdent<T extends string>(p: Ct.Parser, values: readonly T[] = []): Opt<CssKeywordValue<T>> {
  const ct = p.peek();
  if (values.length === 0 && Ct.isIdent(ct) || Ct.isIdentValue(values)(ct)) {
    const { raws } = p.consumeWithSpace();
    return withRaws<CssKeywordValue<T>>({ keyword: ct[4].value.toLowerCase() as T }, raws);
  }
  return;
}

function consumeLengthOrPercent(p: Ct.Parser, range: ValueRange, unitless?: boolean): Opt<CssNumericValueLaxOpt<CssLengthUnit | CssPercentUnit>> {
  const ct = p.peek();
  if (Ct.isDimension(ct) || Ct.isNumber(ct))
    return consumeLength(p, range, unitless);
  if (Ct.isPercentage(ct))
    return consumePercent(p, range);
  return;
}

function consumeLength(p: Ct.Parser, range: ValueRange, unitless?: boolean): Opt<CssNumericValueLaxOpt<CssLengthUnit>> {
  const ct = p.peek();
  if (Ct.isDimension(ct)) {
    if (!Ct.isDimensionUnit(keywords.unit.length.all)(ct))
      return;
    const value = ct[4].value;
    if (range == ValueRange.NonNegative && value < 0)
      return;
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<CssLengthUnit>>({ ...ct[4] }, raws);
  }
  if (Ct.isNumber(ct)) {
    const value = ct[4].value;
    if (value != 0 && !unitless)
      return;
    if (range == ValueRange.NonNegative && value < 0)
      return;
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<null>>({ ...ct[4], unit: null }, raws);
  }
  return;
}

function consumePercent(p: Ct.Parser, range: ValueRange): Opt<CssNumericValueLaxOpt<CssPercentUnit>> {
  const ct = p.peek();
  if (Ct.isPercentage(ct)) {
    const value = ct[4].value;
    if (range == ValueRange.NonNegative && value < 0)
      return;
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<CssPercentUnit>>({ ...ct[4], unit: '%', type: Ct.NumberType.Number }, raws);
  }
  return;
}

function consumeNumber(p: Ct.Parser, range: ValueRange): Opt<CssNumericValue<null>> {
  const ct = p.peek();
  if (Ct.isNumber(ct)) {
    const value = ct[4].value;
    if (range == ValueRange.NonNegative && value < 0)
      return;
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<null>>({ ...ct[4], unit: null, type: Ct.NumberType.Number }, raws);
  }
  return;
}

function consumeAngle(p: Ct.Parser): Opt<CssNumericValueLax<CssAngleUnit>> {
  const ct = p.peek();
  if (Ct.isDimensionUnit(keywords.unit.angle)(ct)) {
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<CssAngleUnit>>({ ...ct[4] }, raws);
  }
  if (Ct.isNumber(ct) && ct[4].value == 0) {
    const { raws } = p.consumeWithSpace();
    return withRaws<CssNumericValue<CssAngleUnit>>({ ...ct[4], unit: 'deg' }, raws);
  }
  return;
}

function consumeSlashWithSpace(p: Ct.Parser): boolean {
  const ct = p.peek();
  if (Ct.isTokenValue(Ct.isDelim, '/')(ct)) {
    p.consume();
    p.consumeSpace();
    return true;
  }
  return false;
}

function consumeCommaWithSpace(p: Ct.Parser): boolean {
  const ct = p.peek();
  if (Ct.isComma(ct)) {
    p.consume();
    p.consumeSpace();
    return true;
  }
  return false;
}

function withRaws<T extends WithRaws>(value: T, after: Opt<Ct.Raw[]>): T {
  if (after)
    (value.raws ??= {}).after = after;
  return value;
}

// MARK: Value types

const enum ValueRange { All, NonNegative, Integer, NonNegativeInteger, PositiveInteger };

interface CssValueRaws {
  before?: Ct.Raw[];
  after?: Ct.Raw[];
}

interface WithRaws {
  raws?: Opt<CssValueRaws>;
}

interface CssValueRaws {
  before?: Ct.Raw[];
  after?: Ct.Raw[];
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

interface CssNumericValueRange<T> {
  start: CssNumericValue<T>;
  end: CssNumericValue<T>;
}

type CssKeywordValueLax<T extends string> = CssKeywordValue<LiteralUnion<T>>;
type CssNumericValueLax<T extends string> = CssNumericValue<LiteralUnion<T>>;
type CssNumericValueLaxOpt<T extends string> = CssNumericValue<LiteralUnion<T> | null>;
type CssNumericValueRangeLax<T extends string> = CssNumericValueRange<LiteralUnion<T>>;
type CssNumericValueRangeLaxOpt<T extends string> = CssNumericValueRange<LiteralUnion<T> | null>;

// MARK: Keywords

const keywords = new class {
  readonly global = [ 'inherit', 'initial', 'revert', 'revert-layer', 'unset' ] as const;
  readonly normal = [ 'normal' ] as const;
  readonly default = [ 'default' ] as const;
  readonly auto = [ 'auto' ] as const;
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
    readonly variantCss21 = [ 'normal', 'small-caps' ] as const;
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

type CssFontVariantKeyword = typeof keywords.font.variantCss21[number];

type CssFontWeightAbsoluteKeyword = typeof keywords.font.weight.absolute[number];
type CssFontWeightRelativeKeyword = typeof keywords.font.weight.relative[number];
type CssFontWeightKeyword = typeof keywords.font.weight.all[number];

type CssFontLineHeightKeyword = typeof keywords.font.lineHeight[number];

// MARK: Font types

interface CssFont {
  family: CssFontFamilies;
  size: CssFontSize;
  stretch: CssFontStretch;
  style: CssFontStyle;
  variant: CssFontVariant;
  weight: CssFontWeight;
  lineHeight?: Opt<CssFontLineHeight>;
}

interface CssFontStyleObliqueValue extends
  CssKeywordValue<CssFontStyleObliqueKeyword>,
  CssNumericValueLax<CssAngleUnit> { }
interface CssFontStyleObliqueValueRange extends
  CssKeywordValue<CssFontStyleObliqueKeyword>,
  CssNumericValueRangeLax<CssAngleUnit> { }
interface CssFontFamilyScriptSpecificKeywordValue extends
  CssKeywordValueLax<CssFontFamilyScritSpecificString> {
  scriptSpecific: true;
}

type CssFontFamily =
  | CssStringValue
  | CssFontFamilyScriptSpecificKeywordValue
  | CssKeywordValueLax<CssFontFamilyGenericString | CssFontFamilySystemString>;

type CssFontFamilies =
  | CssKeywordValueLax<CssGlobalValueKeyword>
  | Array<CssFontFamily>;

type CssFontSize =
  | CssKeywordValueLax<CssFontSizeKeyword | CssGlobalValueKeyword>
  | CssNumericValueLaxOpt<CssLengthUnit | CssPercentUnit>;

type CssFontStretch =
  | CssKeywordValueLax<CssFontStretchKeyword | CssGlobalValueKeyword>
  | CssNumericValueLaxOpt<CssPercentUnit>
  | CssNumericValueRangeLaxOpt<CssPercentUnit>;

type CssFontStyle =
  | CssKeywordValueLax<CssFontStyleGenericKeyword | CssGlobalValueKeyword>
  | CssFontStyleObliqueValue
  | CssFontStyleObliqueValueRange;

type CssFontVariant =
  | CssKeywordValueLax<CssFontVariantKeyword | CssGlobalValueKeyword>;

type CssFontWeight =
  | CssKeywordValueLax<CssFontWeightKeyword | CssGlobalValueKeyword>
  | CssNumericValue<null>
  | CssNumericValueRange<null>;

type CssFontLineHeight =
  | CssKeywordValueLax<CssFontLineHeightKeyword | CssGlobalValueKeyword>
  | CssNumericValueLaxOpt<CssLengthUnit | CssPercentUnit>;

// MARK: CSS value utils

export const isCssUnitLengthAbsolute = (v: string) => Ct.keywordEqualsOneOf(v, keywords.unit.length.absolute);

export function isCssValueAnyNumeric(v: CssKeywordValue<unknown> | CssNumericValue<unknown>): v is CssNumericValue<unknown> {
  return true
    && 'value' in v && isNumber(v.value)
    && 'unit' in v && (isString(v.unit) || isNull(v.unit))
    && 'type' in v && (v.type === Ct.NumberType.Integer || v.type === Ct.NumberType.Number);
}

export function isCssValueNumeric<T extends string>(v: CssKeywordValue<T> | CssNumericValue<T>, guard: Guard<string, T>): v is CssNumericValue<T> {
  return isCssValueAnyNumeric(v) && guard(v.unit);
}

export function isCssValueUnitlessNumeric<T>(v: CssKeywordValue<T> | CssNumericValue<T>): v is CssNumericValue<T> {
  return isCssValueAnyNumeric(v) && isNull(v.unit);
}

export function isCssValueAnyKeyword(v: CssKeywordValue<unknown> | CssNumericValue<unknown>): v is CssKeywordValue<unknown> {
  return 'keyword' in v && isString(v.keyword);
}

export function isValueKeyword<T extends string>(v: CssKeywordValue<T> | CssNumericValue<T>, guard: Guard<string, T>): v is CssKeywordValue<T> {
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
  from: CssNumericValue<CssAbsoluteLengthUnit>, toUnit: CssAbsoluteLengthUnit
): CssNumericValue<CssAbsoluteLengthUnit> {
  return {
    ...from,
    value: from.value * getMult(from.unit, "Source") / getMult(toUnit, "Target"),
    unit: toUnit,
  };

  function getMult(unit: CssAbsoluteLengthUnit, msg: string) {
    if (!isCssUnitLengthAbsolute(from.unit))
      throwError(`${msg} unit must be absolute, ${unit} provided`);
    return cssAbsoluteLengthMult[unit.toLowerCase() as CssAbsoluteLengthUnit];
  }
}