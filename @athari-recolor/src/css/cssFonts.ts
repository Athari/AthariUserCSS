import { Ct } from './cssTokens.ts';
import { Kw, kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import { Cv } from './cssValues.ts';
import {
  Opt,
  isString, isObject, isDefined, logError, throwError, deepMerge,
} from '../utils.ts';

export namespace CvFont {

  // MARK: Types

  export interface Font extends Cv.Shorthand<Kw.Prop.Font.AnyShorthand, AnyShorthand> {
    family: Families;
    size?: Opt<Size>;
    stretch?: Opt<Stretch>;
    style?: Opt<Style>;
    variant?: Opt<Variant>;
    weight?: Opt<Weight>;
    lineHeight?: Opt<LineHeight>;
  }

  export interface StyleOblique extends
    Cv.Keyword<Kw.Font.StyleOblique>,
    Cv.NumericLax<Cu.Angle> { }

  export interface StyleObliqueRange extends
    Cv.Keyword<Kw.Font.StyleOblique>,
    Cv.NumericRangeLax<Cu.Angle> { }

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
    | Cv.NumericLaxOpt<Cu.Length | Cu.Percent>;

  export type Stretch =
    | Cv.KeywordLax<Kw.Font.Stretch | Kw.GlobalValue>
    | Cv.NumericLaxOpt<Cu.Percent>
    | Cv.NumericRangeLaxOpt<Cu.Percent>;

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
    | Cv.NumericLaxOpt<Cu.Length | Cu.Percent>;

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
  const defaultFont: Font = { family: [], props: new Map() };

  export class Parser extends Cv.Parser {
    #opts: ParserOptions = defaultOpts;
    #font: Font = defaultFont;

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
      this.#font = structuredClone(defaultFont);
      return this.#parse(source, opts, () => this.consumeFontShorthand());
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

    // TODO: Stringify font
    tokenizeFont(font: Font): Ct.Token[] {
      throw "NotImplemented";
    }

    stringifyFont(font: Font): string {
      return Ct.stringify(this.tokenizeFont(font));
    }

    // MARK: Utils

    setFontProp<P extends Exclude<keyof Font, 'props'>>(prop: P, value: Font[P]): Font {
      return Cv.setShorthandProp(this.#font, kw.prop.font, prop, value);
    }

    // MARK: Parser: Private

    private consumeFontShorthand(): Opt<Font> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.family.system, ct))
        return this.consumeSystemFont();
      return this.consumeFont();
    }

    private consumeSystemFont(): Opt<Font> {
      const ct = this.p.peek();
      if (Ct.isIdent(ct))
        this.setFontProp('family', [ Cv.fromTokenPeek(ct, this.p) ]);
      return this.#font;
    }

    private consumeFont(): Opt<Font> {
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
          if (!isDefined(fontStyle))
            return;
          this.setFontProp('style', fontStyle);
          continue;
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

      if (this.p.isEof)
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

    private consumeFontSize(unitless?: boolean): Opt<Size> {
      const keyword = this.consumeKeyword(kw.font.size.all);
      return isDefined(keyword) ? keyword : this.consumeLengthOrPercent(Ct.NumberRange.NonNegative, unitless);
    }

    private consumeLineHeight(): Opt<LineHeight> {
      const keyword = this.consumeKeyword(kw.font.lineHeight);
      if (isDefined(keyword))
        return keyword;
      const lineHeight = this.consumeNumber(Ct.NumberRange.NonNegative);
      return isDefined(lineHeight) ? lineHeight : this.consumeLengthOrPercent(Ct.NumberRange.NonNegative);
    }

    private consumeFontFamilyList(): Opt<Families> {
      return this.consumeFamilyList(() => {
        const genericFamily = this.consumeGenericFamily();
        return isDefined(genericFamily) ? genericFamily : this.consumeFamilyName();
      });
    }

    private consumeNonGenericFontFamilyList(): Opt<Families> {
      return this.consumeFamilyList(() => {
        const genericFamily = this.consumeGenericFamily();
        return isDefined(genericFamily) ? undefined : this.consumeFamilyName();
      });
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

    private concatenateIdents(): Opt<string> {
      const sb: string[] = [];
      let addedSpace = false;
      const ct0 = this.p.peek();

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

    private consumeFontStyle(): Opt<Style> {
      const keyword = this.consumeKeyword(this.#opts.isFontFaceRule ? kw.auto : kw.font.style.generic);
      if (isDefined(keyword))
        return keyword;

      const keywordOblique = this.consumeKeyword(kw.font.style.oblique);
      if (!isDefined(keywordOblique))
        return;

      const startAngle = this.consumeAngle();
      if (!isDefined(startAngle))
        return keywordOblique;

      if (!this.#opts.isFontFaceRule || this.p.isEof)
        return { name: keywordOblique.name, value: startAngle.value };

      const endAngle = this.consumeAngle();
      if (!isDefined(endAngle))
        return;

      return { name: keywordOblique.name, start: startAngle, end: endAngle };
    }

    private consumeFontStretchKeywordOnly(): Opt<Stretch> {
      return this.consumeKeyword(this.#opts.isFontFaceRule ? kw.auto : kw.font.stretch.all);
    }

    private consumeFontStretch(): Opt<Stretch> {
      const keywordStretch = this.consumeFontStretchKeywordOnly();
      if (isDefined(keywordStretch))
        return keywordStretch;

      return this.consumeNumericRange(
        () => this.consumePercent(Ct.NumberRange.NonNegative),
        v => true,
      );
    }

    private consumeFontWeight(): Opt<Weight> {
      const keywordWeight = this.consumeKeyword(this.#opts.isFontFaceRule ? kw.font.weight.allFontFace : kw.font.weight.all);
      if (isDefined(keywordWeight))
        return keywordWeight;

      return this.consumeNumericRange(
        () => this.consumeNumber(Ct.NumberRange.NonNegative),
        v => v >= 1 && v <= 1000,
      );
    }

    private consumeNumericRange<V extends Cv.KwAnyOpt>(
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

    private consumeFontVariantCSS21(): Opt<Variant> {
      return this.consumeKeyword(kw.font.variantCss21);
    }
  }
}