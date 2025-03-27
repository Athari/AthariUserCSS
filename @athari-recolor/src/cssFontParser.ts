import assert from 'node:assert';
import { Css, Kw, Ct } from './domUtils.ts';
import {
  Guard, LiteralUnion, Opt,
  isNull, isNumber, isString, logError, throwError, deepMerge,
} from './utils.ts';

// MARK: Parser

export interface CvFontParserOptions {
  isFontFaceRule?: Opt<boolean>;
  // TODO: Remove value checks in non-strict mode
  strict?: Opt<boolean>;
}

type Options = Required<CvFontParserOptions>;

type Source = string | Css.Decl;

export class CvFontParser {
  #parse<T>(source: Source, opts: Opt<CvFontParserOptions>, parse: (p: Ct.Parser, o: Options) => Opt<T>): Opt<T> {
    const opt = deepMerge(null, { isFontFaceRule: false, strict: false }, opts);
    const parser = Ct.parser(Css.isDecl(source) ? source.value : source);
    parser.onParseError = ex => logError(ex, `Failed to parse ${Css.isDecl(source) ? source.prop : 'a font property'}`);
    return parse(parser, opt);
  }

  parseFont(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.Font> {
    const font = <CvFont.Font>{};
    return this.#parse(source, opts, (p, o) => parseFontShorthand(p, o, font) ? font : undefined);
  }

  parseFontSize(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.Size> {
    return this.#parse(source, opts, consumeFontSize);
  }

  parseFontStretch(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.Stretch> {
    return this.#parse(source, opts, consumeFontStretch);
  }

  parseFontStyle(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.Style> {
    return this.#parse(source, opts, consumeFontStyle);
  }

  // TODO: Parse font variant
  // parseFontVariant(source: Source, opts: Opt<CvFont.ParserOptions> = undefined): Opt<CvFont.Variant> {
  //   return this.#parse(source, opts, (p, o) => consumeFontVariant(p, o));
  // }

  parseFontWeight(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.Weight> {
    return this.#parse(source, opts, consumeFontWeight);
  }

  parseLineHeight(source: Source, opts: Opt<CvFontParserOptions> = undefined): Opt<CvFont.LineHeight> {
    return this.#parse(source, opts, consumeLineHeight);
  }

  // TODO: Stringify font
  tokenizeFont(font: CvFont.Font): Ct.Token[] {
    throw "NotImplemented";
  }

  stringifyFont(font: CvFont.Font): string {
    return Ct.stringify(this.tokenizeFont(font));
  }
}

// MARK: Parse font props

function parseFontShorthand(p: Ct.Parser, opts: Options, font: CvFont.Font): boolean {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.family.system, ct))
    return consumeSystemFont(p, font);
  return consumeFont(p, opts, font);
}

function consumeSystemFont(p: Ct.Parser, font: CvFont.Font): boolean {
  const ct = p.consume();
  assert(Ct.isIdent(ct));
  font.family = [ Cv.keyword(Ct.value(ct)) ];
  return true;
}

function consumeFont(p: Ct.Parser, opts: Options, font: CvFont.Font): boolean {
  let fontStyle: Opt<CvFont.Style>;
  let fontVariant: Opt<CvFont.Variant>;
  let fontWeight: Opt<CvFont.Weight>;
  let fontStretch: Opt<CvFont.Stretch>;

  for (let i = 0; i < 4 && !p.isEof(); i++) {
    const ct = p.peek();
    const ident = Ct.isIdent(ct) ? Ct.value(ct) : undefined;

    if (Kw.equals(ident, keywords.normal)) {
      p.consume();
      continue;
    }
    if (!fontStyle && Kw.equals(ident, keywords.font.style.all)) {
      fontStyle = consumeFontStyle(p, opts);
      if (!fontStyle)
        return false;
      continue;
    }
    if (!fontVariant && Kw.equals(ident, keywords.font.variantCss21)) {
      fontVariant = consumeFontVariantCSS21(p);
      if (fontVariant)
        continue;
    }
    if (!fontWeight) {
      fontWeight = consumeFontWeight(p, opts);
      if (fontWeight)
        continue;
    }
    if (!fontStretch) {
      fontStretch = consumeFontStretchKeywordOnly(p, opts);
      if (fontStretch)
        continue;
    }
    break;
  }

  if (p.isEof())
    return false;

  // || Cv.keyword(keywords.normal[0])
  font.style = fontStyle;
  font.variant = fontVariant;
  font.weight = fontWeight;
  font.stretch = fontStretch;

  const fontSize = consumeFontSize(p, opts);
  if (!fontSize || p.isEof())
    return false;
  font.size = fontSize;

  if (consumeSlashWithSpace(p)) {
    const lineHeight = consumeLineHeight(p, opts);
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

function consumeFontSize(p: Ct.Parser, opts: Options, unitless?: boolean): Opt<CvFont.Size> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.size.all, ct))
    return consumeIdent(p);
  return consumeLengthOrPercent(p, Ct.NumberRange.NonNegative, unitless);
}

function consumeLineHeight(p: Ct.Parser, opts: Options): Opt<CvFont.LineHeight> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.lineHeight, ct))
    return consumeIdent(p);

  const lineHeight = consumeNumber(p, Ct.NumberRange.NonNegative);
  if (lineHeight)
    return lineHeight;
  return consumeLengthOrPercent(p, Ct.NumberRange.NonNegative, undefined);
}

function consumeFontFamily(p: Ct.Parser): Opt<CvFont.Families> {
  const list: CvFont.Family[] = [];
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

function consumeNonGenericFamilyNameList(p: Ct.Parser): Opt<CvFont.Families> {
  const list: CvFont.Family[] = [];
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

function consumeGenericFamily(p: Ct.Parser): Opt<CvFont.Family> {
  return consumeIdent(p, keywords.font.family.generic.all);
}

function consumeFamilyName(p: Ct.Parser): Opt<CvFont.Family> {
  const ct = p.peek();
  if (Ct.isString(ct))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  if (!Ct.isIdent(ct))
    return;
  const familyName = concatenateFamilyName(p);
  if (!familyName)
    return;
  return Cv.string(familyName);
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
    builder.push(Ct.value(ct));
  }

  if (!addedSpace && (Ct.isIdentValue(keywords.global, ct0) || Ct.isIdentValue(keywords.default, ct0)))
    return;
  return builder.join("");
}

function consumeFontStyle(p: Ct.Parser, opts: Options): Opt<CvFont.Style> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.style.generic, ct))
    return consumeIdent(p);
  if (Ct.isIdentValue(keywords.auto, ct) && opts.isFontFaceRule)
    return consumeIdent(p);
  if (!Ct.isIdentValue(keywords.font.style.oblique, ct))
    return;

  const idOblique = consumeIdent(p, keywords.font.style.oblique)!;
  const startAngle = consumeAngle(p);
  if (!startAngle)
    return idOblique;

  if (!opts.isFontFaceRule || p.isEof())
    return { keyword: idOblique.keyword, value: startAngle.value };

  const endAngle = consumeAngle(p);
  if (!endAngle)
    return;

  return { keyword: idOblique.keyword, start: startAngle, end: endAngle };
}

function consumeFontStretchKeywordOnly(p: Ct.Parser, opts: Options): Opt<CvFont.Stretch> {
  const ct = p.peek();
  if (Ct.isIdentValue(keywords.font.stretch.all, ct))
    return consumeIdent(p);
  if (Ct.isIdentValue(keywords.auto, ct) && opts.isFontFaceRule)
    return consumeIdent(p);
  return;
}

function consumeFontStretch(p: Ct.Parser, opts: Options): Opt<CvFont.Stretch> {
  const parsedKeyword = consumeFontStretchKeywordOnly(p, opts);
  if (parsedKeyword)
    return parsedKeyword;

  const startPercent = consumePercent(p, Ct.NumberRange.NonNegative);
  if (!startPercent)
    return;

  if (!opts.isFontFaceRule || p.isEof())
    return startPercent;

  const endPercent = consumePercent(p, Ct.NumberRange.NonNegative);
  if (!endPercent)
    return;

  return Cv.numericRange(startPercent, endPercent);
}

function consumeFontWeight(p: Ct.Parser, opts: Options): Opt<CvFont.Weight> {
  const ct = p.peek();
  if (Ct.isIdentValue(opts.isFontFaceRule ? keywords.font.weight.allFontFace : keywords.font.weight.all, ct))
    return consumeIdent(p);

  if (Ct.isNumber(ct)) {
    const value = Ct.value(ct);
    if (value < 1 || value > 1000)
      return;
  }

  const startWeight = consumeNumber(p, Ct.NumberRange.NonNegative);
  if (!startWeight || startWeight.value < 1 || startWeight.value > 1000)
    return;

  if (!opts.isFontFaceRule || p.isEof())
    return startWeight;

  const endWeight = consumeNumber(p, Ct.NumberRange.NonNegative);
  if (!endWeight || endWeight.value < 1 || endWeight.value > 1000)
    return;

  return Cv.numericRange(startWeight, endWeight);
}

function consumeFontVariantCSS21(p: Ct.Parser): Opt<CvFont.Variant> {
  return consumeIdent(p, keywords.font.variantCss21);
}

// MARK: Parse values

function consumeIdent<T extends string>(p: Ct.Parser, values: readonly T[] = []): Opt<Cv.Keyword<T>> {
  const ct = p.peek();
  if (values.length === 0 && Ct.isIdent(ct) || Ct.isIdentValue(values, ct))
    return Cv.keyword(Ct.value(ct) as T, p.consumeWithSpace().raws);
  return;
}

function consumeLengthOrPercent(p: Ct.Parser, range: Ct.NumberRange, unitless?: boolean): Opt<Cv.NumericLaxOpt<Cu.Length | Cu.Percent>> {
  const ct = p.peek();
  if (Ct.isDimension(ct) || Ct.isNumber(ct))
    return consumeLength(p, range, unitless);
  if (Ct.isPercentage(ct))
    return consumePercent(p, range);
  return;
}

function consumeLength(p: Ct.Parser, range: Ct.NumberRange, unitless?: boolean): Opt<Cv.NumericLaxOpt<Cu.Length>> {
  const ct = p.peek();
  if (Ct.isDimension(ct) && Ct.isDimensionUnit(keywords.unit.length.all, ct) && Ct.isInRange(ct, range))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  if (Ct.isNumber(ct) && (Ct.value(ct) === 0 || unitless) && Ct.isInRange(ct, range))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  return;
}

function consumePercent(p: Ct.Parser, range: Ct.NumberRange): Opt<Cv.Numeric<Cu.Percent>> {
  const ct = p.peek();
  if (Ct.isPercentage(ct) && Ct.isInRange(ct, range))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  return;
}

function consumeNumber(p: Ct.Parser, range: Ct.NumberRange): Opt<Cv.Numeric<null>> {
  const ct = p.peek();
  if (Ct.isNumber(ct) && Ct.isInRange(ct, range))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  return;
}

function consumeAngle(p: Ct.Parser): Opt<Cv.NumericLax<Cu.Angle>> {
  const ct = p.peek();
  if (Ct.isDimensionUnit(keywords.unit.angle, ct))
    return Cv.fromToken(ct, p.consumeWithSpace().raws);
  if (Ct.isNumber(ct) && Ct.value(ct) == 0)
    return Cv.numeric(Ct.value(ct), keywords.unit.angle[0], p.consumeWithSpace().raws);
  return;
}

function consumeSlashWithSpace(p: Ct.Parser): boolean {
  const ct = p.peek();
  if (Ct.isTokenValue(Ct.isDelim, '/', ct)) {
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

// MARK: Cu

export namespace Cu {

  // Cu: Types

  export type Angle = typeof keywords.unit.angle[number];

  export type AbsoluteLength = typeof keywords.unit.length.absolute[number];
  export type RelativeLength = typeof keywords.unit.length.relative[number];
  export type RelativeRootLength = typeof keywords.unit.length.relativeRoot[number];
  export type ContainerQueryLength = typeof keywords.unit.length.containerQuery[number];
  export type ViewportDefaultLength = typeof keywords.unit.length.viewport.default[number];
  export type ViewportSmallLength = typeof keywords.unit.length.viewport.small[number];
  export type ViewportLargeLength = typeof keywords.unit.length.viewport.large[number];
  export type ViewportDynamicLength = typeof keywords.unit.length.viewport.dynamic[number];
  export type ViewportLength = typeof keywords.unit.length.viewport.all[number];
  export type Length = typeof keywords.unit.length.all[number];

  export type Percent = typeof keywords.unit.percent[number];

  export const isLengthAbsolute = (v: string) => Kw.equals(v, keywords.unit.length.absolute);
}

// MARK: Cv

export namespace Cv {

  // Cv: Types

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

  // Cv: Create

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

  // Cv: Utils

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
      readonly auto = [ 'auto' ] as const;
      readonly all = [ ...this.absolute, ...this.relative ] as const;
      readonly allFontFace = [ ...this.absolute, ...this.auto ] as const;
    };
    readonly lineHeight = [ 'normal' ] as const;
  };
};

// MARK: Kw Font

export namespace KwCommon {
  export type GlobalValue = typeof keywords.global[number];
}

export namespace KwFont {
  export type FamilyGeneric = typeof keywords.font.family.generic.all[number];
  export type FamilySystem = typeof keywords.font.family.system[number];
  export type FamilyScritSpecific = typeof keywords.font.family.scriptSpecific[number];

  export type SizeAbsolute = typeof keywords.font.size.absolute[number];
  export type SizeRelative = typeof keywords.font.size.relative[number];
  export type SizeMath = typeof keywords.font.size.math[number];
  export type Size = typeof keywords.font.size.all[number];

  export type StretchCondensed = typeof keywords.font.stretch.condensed[number];
  export type StretchExpanded = typeof keywords.font.stretch.expanded[number];
  export type Stretch = typeof keywords.font.stretch.all[number];

  export type StyleGeneric = typeof keywords.font.style.generic[number];
  export type StyleOblique = typeof keywords.font.style.oblique[number];
  export type Style = typeof keywords.font.style.all[number];

  export type VariantCss21 = typeof keywords.font.variantCss21[number];

  export type WeightAbsolute = typeof keywords.font.weight.absolute[number];
  export type WeightRelative = typeof keywords.font.weight.relative[number];
  export type Weight = typeof keywords.font.weight.all[number];

  export type LineHeight = typeof keywords.font.lineHeight[number];
}

// MARK: Cv Font

export namespace CvFont {

  export interface Font {
    family: Families;
    size?: Size;
    stretch?: Opt<Stretch>;
    style?: Opt<Style>;
    variant?: Opt<Variant>;
    weight?: Opt<Weight>;
    lineHeight?: Opt<LineHeight>;
  }

  export interface StyleOblique extends
    Cv.Keyword<KwFont.StyleOblique>,
    Cv.NumericLax<Cu.Angle> { }
  export interface StyleObliqueRange extends
    Cv.Keyword<KwFont.StyleOblique>,
    Cv.NumericRangeLax<Cu.Angle> { }
  export interface FamilyScriptSpecific extends
    Cv.KeywordLax<KwFont.FamilyScritSpecific> {
    scriptSpecific: true;
  }

  export type Family =
    | Cv.String
    | FamilyScriptSpecific
    | Cv.KeywordLax<KwFont.FamilyGeneric | KwFont.FamilySystem>;

  export type Families =
    | Cv.KeywordLax<KwCommon.GlobalValue>
    | Array<Family>;

  export type Size =
    | Cv.KeywordLax<KwFont.Size | KwCommon.GlobalValue>
    | Cv.NumericLaxOpt<Cu.Length | Cu.Percent>;

  export type Stretch =
    | Cv.KeywordLax<KwFont.Stretch | KwCommon.GlobalValue>
    | Cv.NumericLaxOpt<Cu.Percent>
    | Cv.NumericRangeLaxOpt<Cu.Percent>;

  export type Style =
    | Cv.KeywordLax<KwFont.StyleGeneric | KwCommon.GlobalValue>
    | StyleOblique
    | StyleObliqueRange;

  export type Variant =
    | Cv.KeywordLax<KwFont.VariantCss21 | KwCommon.GlobalValue>;

  export type Weight =
    | Cv.KeywordLax<KwFont.Weight | KwCommon.GlobalValue>
    | Cv.Numeric<null>
    | Cv.NumericRange<null>;

  export type LineHeight =
    | Cv.KeywordLax<KwFont.LineHeight | KwCommon.GlobalValue>
    | Cv.NumericLaxOpt<Cu.Length | Cu.Percent>;
}