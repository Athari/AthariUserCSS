import assert from 'node:assert/strict';
import { Ct } from './cssTokens.ts';
import { kw, Kw } from './cssKeywords.ts';
import { Cu } from './cssUnits.ts';
import { Cv } from './cssValues.ts';
import { Opt, logError, deepMerge, isObject, throwError, isString } from '../utils.ts';

export namespace CvFont {

  // MARK: Types

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

  export class Parser extends Cv.Parser {
    readonly defaultOpts: Options = { isFontFaceRule: false, strict: false };
    opts: ParserOptions = this.defaultOpts;

    // MARK: Parser: public

    #parse<T>(source: Source, opts: Opt<ParserOptions>, parse: () => Opt<T>): Opt<T> {
      const decl: Opt<CssDecl> = isObject(source) && 'type' in source && source.type === 'decl' ? source : undefined;
      const css: string = decl?.value ?? isString(source) ? <string>source : throwError(`source must be string or Decl, ${typeof(source)} received`);
      this.opts = deepMerge(null, this.defaultOpts, opts);
      this.p = Ct.parser(css);
      this.p.onParseError = ex => logError(ex, `Failed to parse ${decl?.prop ?? 'a font property'}`);
      return parse();
    }

    parseFont(source: Source, opts: Opt<ParserOptions> = undefined): Opt<Font> {
      const font = <Font>{};
      return this.#parse(source, opts, () => this.parseFontShorthand(font) ? font : undefined);
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
    //   return this.#parse(source, opts, (p, o) => consumeFontVariant(p, o));
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

    // MARK: Parser: Private

    private parseFontShorthand(font: Font): boolean {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.family.system, ct))
        return this.consumeSystemFont(font);
      return this.consumeFont(font);
    }

    private consumeSystemFont(font: Font): boolean {
      const ct = this.p.consume();
      assert(Ct.isIdent(ct));
      font.family = [ Cv.keyword(Ct.value(ct)) ];
      return true;
    }

    private consumeFont(font: Font): boolean {
      let fontStyle: Opt<Style>;
      let fontVariant: Opt<Variant>;
      let fontWeight: Opt<Weight>;
      let fontStretch: Opt<Stretch>;

      for (let i = 0; i < 4 && !this.p.isEof(); i++) {
        const ct = this.p.peek();
        const ident = Ct.isIdent(ct) ? Ct.value(ct) : undefined;

        if (Kw.equals(ident, kw.normal)) {
          this.p.consume();
          continue;
        }
        if (!fontStyle && Kw.equals(ident, kw.font.style.all)) {
          fontStyle = this.consumeFontStyle();
          if (!fontStyle)
            return false;
          continue;
        }
        if (!fontVariant && Kw.equals(ident, kw.font.variantCss21)) {
          fontVariant = this.consumeFontVariantCSS21();
          if (fontVariant)
            continue;
        }
        if (!fontWeight) {
          fontWeight = this.consumeFontWeight();
          if (fontWeight)
            continue;
        }
        if (!fontStretch) {
          fontStretch = this.consumeFontStretchKeywordOnly();
          if (fontStretch)
            continue;
        }
        break;
      }

      if (this.p.isEof())
        return false;

      // || Cv.keyword(keywords.normal[0])
      font.style = fontStyle;
      font.variant = fontVariant;
      font.weight = fontWeight;
      font.stretch = fontStretch;

      const fontSize = this.consumeFontSize();
      if (!fontSize || this.p.isEof())
        return false;
      font.size = fontSize;

      if (this.consumeSlashWithSpace()) {
        const lineHeight = this.consumeLineHeight();
        if (!lineHeight)
          return false;
        font.lineHeight = lineHeight;
      }

      const fontFamily = this.consumeFontFamily();
      if (!fontFamily)
        return false;
      font.family = fontFamily;

      return true;
    }

    private consumeFontSize(unitless?: boolean): Opt<Size> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.size.all, ct))
        return this.consumeIdent();
      return this.consumeLengthOrPercent(Ct.NumberRange.NonNegative, unitless);
    }

    private consumeLineHeight(): Opt<LineHeight> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.lineHeight, ct))
        return this.consumeIdent();

      const lineHeight = this.consumeNumber(Ct.NumberRange.NonNegative);
      if (lineHeight)
        return lineHeight;
      return this.consumeLengthOrPercent(Ct.NumberRange.NonNegative, undefined);
    }

    private consumeFontFamily(): Opt<Families> {
      const list: Family[] = [];
      do {
        const genericFamily = this.consumeGenericFamily();
        if (genericFamily) {
          list.push(genericFamily);
        } else {
          const familyName = this.consumeFamilyName();
          if (familyName)
            list.push(familyName);
          else
            return;
        }
      } while (this.consumeCommaWithSpace());
      return list;
    }

    private consumeNonGenericFamilyNameList(): Opt<Families> {
      const list: Family[] = [];
      do {
        const parsedValue = this.consumeGenericFamily();
        if (parsedValue)
          return;
        const familyName = this.consumeFamilyName();
        if (familyName)
          list.push(familyName);
        else
          return;
      } while (this.consumeCommaWithSpace());
      return list;
    }

    private consumeGenericFamily(): Opt<Family> {
      return this.consumeIdent(kw.font.family.generic.all);
    }

    private consumeFamilyName(): Opt<Family> {
      const ct = this.p.peek();
      if (Ct.isString(ct))
        return Cv.fromToken(ct, this.p.consumeWithSpace().raws);
      if (!Ct.isIdent(ct))
        return;
      const familyName = this.concatenateFamilyName();
      if (!familyName)
        return;
      return Cv.string(familyName);
    }

    private concatenateFamilyName(): Opt<string> {
      const sb: string[] = [];
      let addedSpace = false;
      const ct0 = this.p.peek();

      let ct: Ct.Token;
      while (Ct.isIdent(ct = this.p.peek())) {
        if (sb.length > 0) {
          sb.push(" ");
          addedSpace = true;
        }
        this.p.consumeWithSpace();
        sb.push(Ct.value(ct));
      }

      if (!addedSpace && (Ct.isIdentValue(kw.global, ct0) || Ct.isIdentValue(kw.default, ct0)))
        return;
      return sb.join("");
    }

    private consumeFontStyle(): Opt<Style> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.style.generic, ct))
        return this.consumeIdent();
      if (Ct.isIdentValue(kw.auto, ct) && this.opts.isFontFaceRule)
        return this.consumeIdent();
      if (!Ct.isIdentValue(kw.font.style.oblique, ct))
        return;

      const idOblique = this.consumeIdent(kw.font.style.oblique)!;
      const startAngle = this.consumeAngle();
      if (!startAngle)
        return idOblique;

      if (!this.opts.isFontFaceRule || this.p.isEof())
        return { keyword: idOblique.keyword, value: startAngle.value };

      const endAngle = this.consumeAngle();
      if (!endAngle)
        return;

      return { keyword: idOblique.keyword, start: startAngle, end: endAngle };
    }

    private consumeFontStretchKeywordOnly(): Opt<Stretch> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(kw.font.stretch.all, ct))
        return this.consumeIdent();
      if (Ct.isIdentValue(kw.auto, ct) && this.opts.isFontFaceRule)
        return this.consumeIdent();
      return;
    }

    private consumeFontStretch(): Opt<Stretch> {
      const parsedKeyword = this.consumeFontStretchKeywordOnly();
      if (parsedKeyword)
        return parsedKeyword;

      const startPercent = this.consumePercent(Ct.NumberRange.NonNegative);
      if (!startPercent)
        return;

      if (!this.opts.isFontFaceRule || this.p.isEof())
        return startPercent;

      const endPercent = this.consumePercent(Ct.NumberRange.NonNegative);
      if (!endPercent)
        return;

      return Cv.numericRange(startPercent, endPercent);
    }

    private consumeFontWeight(): Opt<Weight> {
      const ct = this.p.peek();
      if (Ct.isIdentValue(this.opts.isFontFaceRule ? kw.font.weight.allFontFace : kw.font.weight.all, ct))
        return this.consumeIdent();

      if (Ct.isNumber(ct)) {
        const value = Ct.value(ct);
        if (value < 1 || value > 1000)
          return;
      }

      const startWeight = this.consumeNumber(Ct.NumberRange.NonNegative);
      if (!startWeight || startWeight.value < 1 || startWeight.value > 1000)
        return;

      if (!this.opts.isFontFaceRule || this.p.isEof())
        return startWeight;

      const endWeight = this.consumeNumber(Ct.NumberRange.NonNegative);
      if (!endWeight || endWeight.value < 1 || endWeight.value > 1000)
        return;

      return Cv.numericRange(startWeight, endWeight);
    }

    private consumeFontVariantCSS21(): Opt<Variant> {
      return this.consumeIdent(kw.font.variantCss21);
    }
  }
}