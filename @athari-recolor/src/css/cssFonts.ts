import { Ct } from './cssTokens.ts';
import { Kw, kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import { Cv } from './cssValues.ts';
import {
  Opt, ArrayGenerator,
  isArray, isString, isObject, isDefined, logError, throwError, deepMerge, fallback,
} from '../utils.ts';

export namespace CvFont {

  // MARK: Types

  export interface Font extends Cv.Shorthand<Kw.Prop.Font.AnyShorthand, AnyShorthand> {
    family: Families;
    size: Size;
    stretch?: Opt<Stretch>;
    style?: Opt<Style>;
    variant?: Opt<Variant>;
    weight?: Opt<Weight>;
    lineHeight?: Opt<LineHeight>;
  }

  export type StyleOblique = Cv.NumericLaxWithKeyword<Kw.Font.StyleOblique, Cu.Angle>;

  export type StyleObliqueRange = Cv.NumericLaxRangeWithKeyword<Kw.Font.StyleOblique, Cu.Angle>;

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
    | StyleOblique
    | StyleObliqueRange;

  export type Variant =
    | Cv.KeywordLax<Kw.Font.VariantCss21 | Kw.GlobalValue>;

  export type Weight =
    | Cv.KeywordLax<Kw.Font.Weight | Kw.GlobalValue>
    | Cv.Numeric<null>
    | Cv.NumericRange<null>;

  export type LineHeight =
    | Cv.KeywordLax<Kw.Font.LineHeight | Kw.GlobalValue>
    | Cv.NumericOptLax<Cu.Length | Cu.Percent>;

  export type AnyShorthand = Families | Size | Stretch | Style | Variant | Weight | LineHeight;

  // MARK: Parser

  export interface ParserOptions {
    isFontFaceRule?: Opt<boolean>;
    // TODO: Remove value checks in non-strict mode
    strict?: Opt<boolean>;
  }

  type Options = Required<ParserOptions>;

  interface CssDecl {
    readonly type: 'decl';
    get prop(): string
    get value(): string
  }

  type Source = string | CssDecl;

  const defaultOpts: Options = { isFontFaceRule: false, strict: false };
  const nullFont: Font = { family: [], size: Cv.numeric(0, null), props: new Map() };

  export class Parser extends Cv.Parser {
    #opts: ParserOptions = defaultOpts;
    #font: Font = nullFont;

    // MARK: Parser: Public

    #parse<T>(source: Source, opts: Opt<ParserOptions>, parse: () => Opt<T>): Opt<T> {
      const decl: Opt<CssDecl> = isObject(source) && 'type' in source && source.type === 'decl' ? source : undefined;
      const css: string = decl?.value ?? isString(source) ? <string>source : throwError(`source must be string or Decl, ${typeof(source)} received`);
      this.#opts = deepMerge(null, defaultOpts, opts);
      this.p = Ct.tokenizer(css);
      this.p.onParseError = ex => logError(ex, `Failed to parse ${decl?.prop ?? 'a font property'}`);
      return parse();
    }

    parseFont(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Font> {
      this.#font = structuredClone(nullFont);
      return this.#parse(source, opts, () => this.consumeFont());
    }

    parseFontSize(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Size> {
      return this.#parse(source, opts, () => this.consumeFontSize());
    }

    parseFontStretch(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Stretch> {
      return this.#parse(source, opts, () => this.consumeFontStretch());
    }

    parseFontStyle(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Style> {
      return this.#parse(source, opts, () => this.consumeFontStyle());
    }

    // TODO: Parse font variant
    // parseFontVariant(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Variant> {
    //   return this.#parse(source, opts, () => consumeFontVariant());
    // }

    parseFontWeight(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Weight> {
      return this.#parse(source, opts, () => this.consumeFontWeight());
    }

    parseLineHeight(source: Source, opts: Opt<ParserOptions> = undefined): Opt<LineHeight> {
      return this.#parse(source, opts, () => this.consumeLineHeight());
    }

    *tokenizeFont(font: Font): ArrayGenerator<Ct.Token> {
      for (const [ prop, value ] of font.props.entries()) {
        if (prop === 'line-height')
          yield Ct.delim('/');
        if (!isArray(value))
          yield* Cv.toTokens(value);
        else {
          for (let i = 0; i < value.length; i++) {
            if (i > 0)
              yield Ct.token(Ct.Type.Comma);
            yield* Cv.toTokens(value[i]!);
          }
        }
      }
    }

    stringifyFont(font: Font): string {
      return Ct.stringify(this.tokenizeFont(font).toArray());
    }

    // MARK: Utils

    setFontProp<P extends Exclude<keyof Font, 'props'>>(prop: P, value: Font[P]): Font {
      return Cv.setShorthandProp(this.#font, kw.prop.font, prop, value);
    }

    // MARK: Parser: Private

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
      this.setFontProp('size', fontSize);

      const slashRaws = this.consumeSlashWithRaws();
      if (isDefined(slashRaws)) {
        const lineHeight = this.consumeLineHeight();
        if (!isDefined(lineHeight))
          return;
        Cv.setRawProp(lineHeight, 'before', slashRaws);
        this.setFontProp('lineHeight', lineHeight);
      }

      const fontFamily = this.consumeFontFamilyList();
      if (!isDefined(fontFamily))
        return;
      this.setFontProp('family', fontFamily);

      return this.#font;
    }

    private consumeSystemFont(): Opt<Font> {
      const ct = this.p.peek();
      if (Ct.isIdent(ct))
        this.setFontProp('family', [ Cv.fromTokenPeek(ct, this.p) ]);
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
            this.setFontProp('style', fontStyle);
            continue;
          }
          return;
        }
        if (!isDefined(this.#font.variant) && Kw.equals(ident, kw.font.variantCss21)) {
          const fontVariant = this.consumeFontVariantCSS21();
          if (isDefined(fontVariant)) {
            this.setFontProp('variant', fontVariant);
            continue;
          }
        }
        if (!isDefined(this.#font.weight)) {
          const fontWeight = this.consumeFontWeight();
          if (isDefined(fontWeight)) {
            this.setFontProp('weight', fontWeight);
            continue;
          }
        }
        if (!isDefined(this.#font.stretch)) {
          const fontStretch = this.consumeFontStretchKeywordOnly();
          if (isDefined(fontStretch)) {
            this.setFontProp('stretch', fontStretch);
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
}