import assert from 'node:assert/strict';
import * as Ct from './cssTokens.ts';
import * as Kw from './cssKeywords.ts';
import * as Cu from './cssUnits.ts';
import * as Cv from './cssValues.ts';
import {
  Opt, OptObject,EventName, EventHandler, HasEvents, ReadonlyTuple, IntRange,
  isArray, isString, isObject, isDefined, isNumber,
  throwError, deepMerge, fallback, eventGet, eventSet,
} from '../utils.ts';
import EventEmitter from 'node:events';

const kw = Kw.kw;

// MARK: Types: Font

export interface Font extends Cv.Shorthand<Kw.Prop.Font.AnyShorthand, AnyShorthand> {
  family?: Opt<Families>;
  size?: Opt<Size>;
  stretch?: Opt<Stretch>;
  style?: Opt<Style>;
  variant?: Opt<Variant>;
  weight?: Opt<Weight>;
  lineHeight?: Opt<LineHeight>;
}

export interface FamilyScriptSpecific extends
  Cv.KeywordLax<Kw.Font.FamilyScritSpecific> {
  scriptSpecific: true;
}

export type Family =
  | Cv.String
  | FamilyScriptSpecific
  | Cv.KeywordLax<Kw.Font.FamilyGeneric | Kw.Font.FamilySystem>;

export type Families =
  | Cv.KeywordLax<Kw.GlobalValue>
  | Array<Family>;

export type Size =
  | Cv.KeywordLax<Kw.Font.Size | Kw.GlobalValue>
  | Cv.NumericOptLax<Cu.Length | Cu.Percent>;

export type Stretch =
  | Cv.KeywordLax<Kw.Font.Stretch | Kw.GlobalValue>
  | Cv.NumericOptLax<Cu.Percent>
  | Cv.NumericOptLaxRange<Cu.Percent>;

export type Style =
  | Cv.KeywordLax<Kw.Font.StyleGeneric | Kw.GlobalValue>
  | Cv.NumericLaxWithKeyword<Kw.Font.StyleOblique, Cu.Angle>
  | Cv.NumericLaxRangeWithKeyword<Kw.Font.StyleOblique, Cu.Angle>;

export type Variant =
  | Cv.KeywordLax<Kw.Font.VariantCss21 | Kw.GlobalValue>;

export type Weight =
  | Cv.KeywordLax<Kw.Font.Weight | Kw.GlobalValue>
  | Cv.Numeric<null>
  | Cv.NumericRange<null>;

export type LineHeight =
  | Cv.KeywordLax<Kw.Font.LineHeight | Kw.GlobalValue>
  | Cv.NumericOptLax<Cu.Length | Cu.Percent>;

export type AnyShorthand = Cv.AnyValue | Cv.AnyValue[];

// MARK: Types: Parsing

interface ParserOpts {
  isFontFaceRule: boolean;
  // TODO: Remove value checks in non-strict mode
  strict: boolean;
}

export interface ParserOptions extends OptObject<ParserOpts> { }

interface ParserEvents {
  parseError: [ Ct.ParseError, Ct.Token | null ];
}

type ParserEventsOpts = {
  [N in keyof ParserEvents]: (...args: ParserEvents[N]) => void;
}

type Opts = Opt<OptObject<ParserOpts>>;
type Init = Opt<OptObject<ParserOpts & ParserEventsOpts>>;

// MARK: Types: Utility

interface CssNode {
  readonly type: 'decl' | 'rule' | 'atrule';
}

type CssAnyNode = CssDecl | CssRule | CssAtRule;

interface CssDecl extends CssNode {
  readonly type: 'decl';
  get prop(): string
  get value(): string
}

interface CssRuleOrAtRule extends CssNode {
  readonly type: 'rule' | 'atrule';
  each(callback: (node: unknown) => void): void;
}

interface CssRule extends CssRuleOrAtRule {
  readonly type: 'rule';
}

interface CssAtRule extends CssRuleOrAtRule {
  readonly type: 'atrule';
  get name(): string;
}

// MARK: Parser

export class Parser extends Cv.Parser implements HasEvents<ParserEvents> {
  readonly #events = new EventEmitter<ParserEvents>();
  readonly #defaultOptions: ParserOptions;
  #opts: ParserOptions;
  #font: Font;

  constructor(init?: Init) {
    super();
    const { isFontFaceRule, strict, parseError } = init ?? {};
    this.#defaultOptions = { isFontFaceRule, strict };
    this.#opts = this.setOptions({});
    this.#font = this.resetFont();
    this.onParseError = parseError ?? null;
  }

  get font() { return this.#font }

  resetFont(): Font {
    return this.#font = { props: new Map() };
  }

  private setOptions(opts: Opts): ParserOptions {
    return this.#opts = deepMerge(null, { isFontFaceRule: false, strict: false }, this.#defaultOptions, opts);
  }

  private setProp<P extends Exclude<keyof Font, 'props'>>(prop: P, value: Font[P]): Font {
    return Cv.setShorthandProp(this.#font, kw.prop.font, prop, value);
  }

  on(name: EventName<ParserEvents>, handler: EventHandler<ParserEvents, typeof name>): this {
    return this.#events.on(name, handler), this;
  }

  off(name: EventName<ParserEvents>, handler: EventHandler<ParserEvents, typeof name>): this {
    return this.#events.off(name, handler), this;
  }

  once(name: EventName<ParserEvents>, handler: EventHandler<ParserEvents, typeof name>): this {
    return this.#events.once(name, handler), this;
  }

  get onParseError() { return eventGet(this.#events, 'parseError'); }
  set onParseError(v) { eventSet(this.#events, 'parseError', v); }

  parseFont(source: CssDecl  | string, opts?: Opts): Opt<Font> {
    return this.parseProc(source, opts, () => this.consumeFont());
  }

  parseFontFamily(source: CssDecl  | string, opts?: Opts): Opt<Families> {
    return this.parseProc(source, opts, () => this.consumeFontFamilyList());
  }

  parseFontFaceFontFamily(source: CssDecl  | string, opts?: Opts): Opt<Families> {
    return this.parseProc(source, opts, () => this.consumeNonGenericFontFamilyList());
  }

  parseFontSize(source: CssDecl  | string, opts?: Opts): Opt<Size> {
    return this.parseProc(source, opts, () => this.consumeFontSize());
  }

  parseFontStretch(source: CssDecl  | string, opts?: Opts): Opt<Stretch> {
    return this.parseProc(source, opts, () => this.consumeFontStretch());
  }

  parseFontStyle(source: CssDecl  | string, opts?: Opts): Opt<Style> {
    return this.parseProc(source, opts, () => this.consumeFontStyle());
  }

  // TODO: Parse full font variant
  parseFontVariant(source: CssDecl  | string, opts: Opts = undefined): Opt<Variant> {
    return this.parseProc(source, opts, () => this.consumeFontVariantCSS21());
  }

  parseFontWeight(source: CssDecl  | string, opts?: Opts): Opt<Weight> {
    return this.parseProc(source, opts, () => this.consumeFontWeight());
  }

  parseLineHeight(source: CssDecl  | string, opts?: Opts): Opt<LineHeight> {
    return this.parseProc(source, opts, () => this.consumeLineHeight());
  }

  private parseProc<T>(source: CssDecl  | string, opts: Opts, parse: () => Opt<T>): Opt<T> {
    const decl: Opt<CssDecl> = isObject(source) && 'type' in source && source.type === 'decl' ? source : undefined;
    const value: string = decl?.value ?? isString(source) ? <string>source : throwError(`source must be string or Decl, ${typeof(source)} received`);
    this.setOptions(opts);
    this.p = Ct.tokenizer(value);
    this.p.onParseError = (ex) => this.#events.emit('parseError', ex, this.p.lastErrorToken ?? null);
    return parse();
  }

  parseDeclValue(value: string, prop: string, opts?: Opts): Opt<Font>;
  parseDeclValue(decl: CssDecl, opts?: Opts): Opt<Font>;
  parseDeclValue(a0: CssDecl  | string, a1?: string | Opts, a2?: Opts): Opt<Font> {
    const [ source, prop, opts ] =
      isString(a0) && isString(a1) ? [ a0, a1, a2 ] :
      isObject(a0) && !isString(a1) ? [ a0.value, a0.prop, a1 ] :
      throwError("Incorrect arguments");
    return this.parseDeclValueProc(source, prop, opts);
  }

  private parseDeclValueProc(source: string, prop: string, opts: Opts): Opt<Font> {
    if (Kw.equals(prop, kw.prop.font.shorthand))
      return this.parseProc(source, opts, () => this.consumeFont());

    if (Kw.equals(prop, kw.prop.font.shorthandSub)) {
      switch (prop.toLowerCase()) {
        case kw.prop.font.family:
          return this.setProp('family', this.#opts.isFontFaceRule
            ? this.parseFontFaceFontFamily(source, opts)
            : this.parseFontFamily(source, opts));
        case kw.prop.font.size:
          return this.setProp('size', this.parseFontSize(source, opts));
        case kw.prop.font.stretch:
          return this.setProp('stretch', this.parseFontStretch(source, opts));
        case kw.prop.font.style:
          return this.setProp('style', this.parseFontStyle(source, opts));
        case kw.prop.font.variant:
          return this.setProp('variant', this.parseFontVariant(source, opts));
        case kw.prop.font.weight:
          return this.setProp('weight', this.parseFontWeight(source, opts));
        case kw.prop.font.lineHeight:
          return this.setProp('lineHeight', this.parseLineHeight(source, opts));
        default:
          assert.fail();
      }
    }
    throwError(`A font property expected, got ${prop}`);
  }

  parseRule(rule: CssRule, opts?: Opts): Opt<Font> {
    return this.parseRuleOrAtRuleProc(rule, opts);
  }

  parseFontFaceAtRule(atRule: CssAtRule, opts?: Opts): Opt<Font> {
    if (!Kw.equals(atRule.name, kw.atRule.fontFace))
      throwError(`A @font-face at-rule expected, got @${atRule.name}`);
    return this.parseRuleOrAtRuleProc(atRule, { ...opts, isFontFaceRule: true });
  }

  private parseRuleOrAtRuleProc(source: CssRuleOrAtRule, opts?: Opts): Opt<Font> {
    source.each((child: unknown) => {
      const decl = child as CssAnyNode;
      if (decl.type !== 'decl' || !Kw.equals(decl.prop, kw.prop.font.all))
        return;
      this.parseDeclValueProc(decl.value, decl.prop, opts);
    });
    return this.#font.props.size > 0 ? this.#font : undefined;
  }

  *tokenizeFont(font: Font): ArrayIterator<Ct.Token> {
    // TODO: Make sure order is correct (for fonts modified manually)
    for (const [ prop, value ] of font.props.entries())
      yield* this.tokenizeDeclValueProc(value, prop, true);
  }

  *tokenizeDeclValue(value: AnyShorthand, prop: string): ArrayIterator<Ct.Token> {
    if (!Kw.equals(prop, kw.prop.font.shorthandSub))
      throwError(`A font property expected, got '${prop}'`);
    yield* this.tokenizeDeclValueProc(value, prop, false);
  }

  private *tokenizeDeclValueProc(value: AnyShorthand, prop: string, shorthand: boolean): ArrayIterator<Ct.Token> {
    if (shorthand && Kw.equals(prop, kw.prop.font.lineHeight))
      yield Ct.delim('/');
    yield* isArray(value)
      ? Cv.tokenizeList(value, Ct.token(Ct.Type.Comma))
      : Cv.tokenize(value);
  }

  stringifyFont(font: Font): string {
    return Ct.stringify(this.tokenizeFont(font));
  }

  stringifyDeclValue(value: AnyShorthand, prop: string): string {
    return Ct.stringify(this.tokenizeDeclValue(value, prop));
  }

  // MARK: Parser: Parsing

  private consumeFont(): Opt<Font> {
    const ct = this.p.peek();
    if (Ct.isIdentValue(kw.font.family.system, ct))
      return this.consumeSystemFont();

    const partialFont = this.consumeOptionalFontPropsPartial();
    if (!isDefined(partialFont))
      return;

    const fontSize = this.consumeFontSize();
    if (!isDefined(fontSize) || this.p.isEof)
      return;
    this.setProp('size', fontSize);

    const slashRaws = this.consumeSlashWithRaws();
    if (isDefined(slashRaws)) {
      const lineHeight = this.consumeLineHeight();
      if (!isDefined(lineHeight))
        return;
      Cv.setRawProp(lineHeight, 'before', slashRaws);
      this.setProp('lineHeight', lineHeight);
    }

    const fontFamily = this.consumeFontFamilyList();
    if (!isDefined(fontFamily))
      return;
    this.setProp('family', fontFamily);

    return this.#font;
  }

  private consumeSystemFont(): Opt<Font> {
    const ct = this.p.peek();
    if (Ct.isIdent(ct))
      this.setProp('family', [ Cv.fromTokenPeek(ct, this.p) ]);
    return this.#font;
  }

  private consumeOptionalFontPropsPartial(): Opt<Font> {
    for (let i = 0; i < 4 && !this.p.isEof; i++) {
      const ct = this.p.peek();
      const ident = Ct.isIdent(ct) ? Ct.value(ct) : undefined;

      if (Kw.equals(ident, kw.normal)) {
        // TODO: Store raws of `normal` values (distribute `normal` values among missing props?)
        this.p.consumeWithRaws();
        continue;
      }
      if (!isDefined(this.#font.style) && Kw.equals(ident, kw.font.style.all)) {
        const fontStyle = this.consumeFontStyle();
        if (isDefined(fontStyle)) {
          this.setProp('style', fontStyle);
          continue;
        }
        return;
      }
      if (!isDefined(this.#font.variant) && Kw.equals(ident, kw.font.variantCss21)) {
        const fontVariant = this.consumeFontVariantCSS21();
        if (isDefined(fontVariant)) {
          this.setProp('variant', fontVariant);
          continue;
        }
      }
      if (!isDefined(this.#font.weight)) {
        const fontWeight = this.consumeFontWeight();
        if (isDefined(fontWeight)) {
          this.setProp('weight', fontWeight);
          continue;
        }
      }
      if (!isDefined(this.#font.stretch)) {
        const fontStretch = this.consumeFontStretchKeywordOnly();
        if (isDefined(fontStretch)) {
          this.setProp('stretch', fontStretch);
          continue;
        }
      }
      break;
    }
    return this.p.isEof ? undefined : this.#font;
  }

  private consumeFontSize(unitless?: boolean): Opt<Size> {
    return fallback<Size>(
      () => this.consumeKeyword(kw.font.size.all),
      () => this.consumeLengthOrPercent(Ct.NumberRange.NonNegative, unitless),
    );
  }

  private consumeLineHeight(): Opt<LineHeight> {
    return fallback<LineHeight>(
      () => this.consumeKeyword(kw.font.lineHeight),
      () => this.consumeNumber(Ct.NumberRange.NonNegative),
      () => this.consumeLengthOrPercent(Ct.NumberRange.NonNegative),
    );
  }

  private consumeFontFamilyList(): Opt<Families> {
    return this.consumeFamilyList(() =>
      fallback<Family>(
        () => this.consumeGenericFamily(),
        () => this.consumeFamilyName(),
      ));
  }

  private consumeNonGenericFontFamilyList(): Opt<Families> {
    return this.consumeFamilyList(() =>
      fallback<Family>(
        [ () => this.consumeGenericFamily(), v => undefined ],
        () => this.consumeFamilyName(),
      ));
  }

  private consumeFamilyList(consumeFamilyFn: () => Opt<Family>): Opt<Families> {
    const families: Family[] = [];
    let rawsBefore: Opt<Ct.Raw[]>;
    for (;;) {
      const family = consumeFamilyFn();
      if (!isDefined(family))
        return;
      Cv.setRawProp(family, 'before', rawsBefore);
      families.push(family);
      const commaRaws = this.consumeCommaWithRaws();
      if (!isDefined(commaRaws))
        break;
      rawsBefore = commaRaws;
    }
    return families;
  }

  private consumeGenericFamily(): Opt<Family> {
    return this.consumeKeyword(kw.font.family.generic.all);
  }

  private consumeFamilyName(): Opt<Family> {
    const ct = this.p.peek();
    if (Ct.isString(ct))
      return Cv.fromTokenPeek(ct, this.p);
    if (!Ct.isIdent(ct))
      return;
    const familyName = this.concatenateIdents();
    return isDefined(familyName) ? Cv.string(familyName) : undefined;
  }

  private consumeFontStyle(): Opt<Style> {
    const keywordGeneric = this.consumeKeyword(this.#opts.isFontFaceRule ? kw.auto : kw.font.style.generic);
    if (isDefined(keywordGeneric))
      return keywordGeneric;
    const keywordOblique = this.consumeKeyword(kw.font.style.oblique);
    if (!isDefined(keywordOblique))
      return;

    const startAngle = this.consumeAngle();
    if (!isDefined(startAngle))
      return keywordOblique;
    if (!this.#opts.isFontFaceRule || this.p.isEof)
      return Cv.numericWithKeyword(keywordOblique, startAngle);
    const endAngle = this.consumeAngle();
    if (!isDefined(endAngle))
      return;
    return Cv.numericRangeWithKeyword(keywordOblique, startAngle, endAngle);
  }

  private consumeFontStretchKeywordOnly(): Opt<Stretch> {
    return this.consumeKeyword(this.#opts.isFontFaceRule ? kw.auto : kw.font.stretch.all);
  }

  private consumeFontStretch(): Opt<Stretch> {
    return fallback<Stretch>(
      () => this.consumeFontStretchKeywordOnly(),
      () => this.consumeNumericRangeIfFontFace(
        () => this.consumePercent(Ct.NumberRange.NonNegative),
        v => true,
      ),
    );
  }

  private consumeFontWeight(): Opt<Weight> {
    return fallback<Weight>(
      () => this.consumeKeyword(this.#opts.isFontFaceRule ? kw.font.weight.allFontFace : kw.font.weight.all),
      () => this.consumeNumericRangeIfFontFace(
        () => this.consumeNumber(Ct.NumberRange.NonNegative),
        v => v >= 1 && v <= 1000,
      ),
    );
  }

  private consumeFontVariantCSS21(): Opt<Variant> {
    return this.consumeKeyword(kw.font.variantCss21);
  }

  private consumeNumericRangeIfFontFace<V extends Cv.KwAnyOpt>(
    consumeValueFn: () => Opt<Cv.Numeric<V>>,
    validateFn: (v: number) => boolean,
  ): Opt<Cv.Numeric<V> | Cv.NumericRange<V>> {
    const start = consumeValueFn();
    if (!isDefined(start) || !validateFn(start.value))
      return;

    if (!this.#opts.isFontFaceRule || this.p.isEof)
      return start;

    const end = consumeValueFn();
    if (!isDefined(end) || !validateFn(end.value))
      return;

    return Cv.numericRange(start, end);
  }

  private concatenateIdents(): Opt<string> {
    const ct0 = this.p.peek();
    const sb: string[] = [];
    let addedSpace = false;
    let ct: Ct.Token;

    while (Ct.isIdent(ct = this.p.peek())) {
      if (sb.length > 0) {
        sb.push(" ");
        addedSpace = true;
      }
      // TODO: Store non-normalized family name
      this.p.consumeWithRaws();
      sb.push(Ct.value(ct));
    }

    if (!addedSpace && (Ct.isIdentValue(kw.global, ct0) || Ct.isIdentValue(kw.default, ct0)))
      return;
    return sb.join("");
  }
}

// MARK: Size calc

// Based on https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/css/font_size_functions.cc

interface SizeOpts {
  readonly quirksMode: boolean;
  readonly defaultFontSize: number; // normal=16 monospace=13
}

export type SizeOptions = OptObject<SizeOpts>;

const sizeKeyBegin = 9;
const sizeKeyEnd = 17;

type SizeKey = IntRange<typeof sizeKeyBegin, typeof sizeKeyEnd>;
type SizeFactors = ReadonlyTuple<number, 8>;
type SizeTable = { [N in SizeKey]: SizeFactors };

// CSS font-size = legacy HTML <font size>
// xxs=(0) xs=1 s=2 m=3 l=4 xl=5 xxl=6 (xxxl)=7
// m = user pref
const sizeTable = new class {
  readonly quirks: SizeTable = {
    9: [ 9, 9, 9, 9, 11, 14, 18, 28 ],
    10: [ 9, 9, 9, 10, 12, 15, 20, 31 ],
    11: [ 9, 9, 9, 11, 13, 17, 22, 34 ],
    12: [ 9, 9, 10, 12, 14, 18, 24, 37 ],
    13: [ 9, 9, 10, 13, 16, 20, 26, 40 ],
    14: [ 9, 9, 11, 14, 17, 21, 28, 42 ],
    15: [ 9, 10, 12, 15, 17, 23, 30, 45 ],
    16: [ 9, 10, 13, 16, 18, 24, 32, 48 ],
  };
  readonly strict: SizeTable = {
    9: [ 9, 9, 9, 9, 11, 14, 18, 27 ],
    10: [ 9, 9, 9, 10, 12, 15, 20, 30 ],
    11: [ 9, 9, 10, 11, 13, 17, 22, 33 ],
    12: [ 9, 9, 10, 12, 14, 18, 24, 36 ],
    13: [ 9, 10, 12, 13, 16, 20, 26, 39 ],
    14: [ 9, 10, 12, 14, 17, 21, 28, 42 ],
    15: [ 9, 10, 13, 15, 18, 23, 30, 45 ],
    16: [ 9, 10, 13, 16, 18, 24, 32, 48 ],
  };
  readonly factors: SizeFactors = [
    0.60, 0.75, 0.89, 1.0, 1.2, 1.5, 2.0, 3.0,
  ];
  get(quirksMode: boolean): SizeTable {
    return quirksMode ? this.quirks : this.strict;
  }
};

/** Convert CSS absolute `font-size` keyword `xx-small` | ... | `xxx-large` ({@link Kw.Font.SizeAbsolute}) to pixel font size. */
export function getPixelSizeForKeyword(keyword: string, opts?: Opt<SizeOptions>): Opt<number> {
  return getSizeProc(Kw.index(keyword, kw.font.size.absolute), opts);
}

/** Convert N from legacy `<font size=N>` to pixel font size. */
export function getPixelSizeForFontTag(size: IntRange<0, 8>, opts?: Opt<SizeOptions>): number;
export function getPixelSizeForFontTag(size: number, opts?: Opt<SizeOptions>): Opt<number>;
export function getPixelSizeForFontTag(size: number, opts?: Opt<SizeOptions>): Opt<number> {
  return getSizeProc(size, opts);
}

function getSizeProc(col: number, opts?: Opt<SizeOptions>): Opt<number> {
  if (!isNumber(col) || col < 0 || col >= 8)
    return;
  const opt: SizeOpts = deepMerge(null, { quirksMode: false, defaultFontSize: 16 }, opts);
  const row = getSizeTableRow(opt);
  return row !== -1
    ? sizeTable.get(opt.quirksMode)[row][col]
    : sizeTable.factors[col]! * opt.defaultFontSize;
}

function getSizeTableRow(opts: SizeOpts): SizeKey | -1 {
  const mediumSize = opts.defaultFontSize;
  return mediumSize >= sizeKeyBegin && mediumSize < sizeKeyEnd ? mediumSize as SizeKey : -1;
}