import { MostSpecific, Opt, isAssigned, isString } from '../utils.ts';

// MARK: Constants

export const kw = new class {
  readonly global = [ 'inherit', 'initial', 'revert', 'revert-layer', 'unset' ] as const;
  readonly normal = [ 'normal' ] as const;
  readonly default = [ 'default' ] as const;
  readonly auto = [ 'auto' ] as const;

  readonly unit = new class {
    readonly angle = [ 'deg', 'grad', 'rad', 'turn' ] as const;
    readonly frequency = [ 'hz', 'khz' ] as const;
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
    readonly resolution = [ 'dpi', 'dpcm', 'dppx', 'x' ] as const;
    readonly time = [ 's', 'ms' ] as const;
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

  readonly prop = new class {
    readonly font = new class {
      readonly shorthand = 'font' as const;
      readonly family = 'font-family' as const;
      readonly size = 'font-size' as const;
      readonly stretch = 'font-stretch' as const;
      readonly style = 'font-style' as const;
      readonly variant = 'font-variant' as const;
      readonly weight = 'font-weight' as const;
      readonly lineHeight = 'line-height' as const;
      readonly allShorthand = [ this.family, this.size, this.stretch, this.style, this.variant, this.weight, this.lineHeight ] as const;
    };
  };
};

export namespace Kw {

  // MARK: Types

  export type GlobalValue = typeof kw.global[number];

  export namespace Font {
    export type FamilyGeneric = typeof kw.font.family.generic.all[number];
    export type FamilySystem = typeof kw.font.family.system[number];
    export type FamilyScritSpecific = typeof kw.font.family.scriptSpecific[number];

    export type SizeAbsolute = typeof kw.font.size.absolute[number];
    export type SizeRelative = typeof kw.font.size.relative[number];
    export type SizeMath = typeof kw.font.size.math[number];
    export type Size = typeof kw.font.size.all[number];

    export type StretchCondensed = typeof kw.font.stretch.condensed[number];
    export type StretchExpanded = typeof kw.font.stretch.expanded[number];
    export type Stretch = typeof kw.font.stretch.all[number];

    export type StyleGeneric = typeof kw.font.style.generic[number];
    export type StyleOblique = typeof kw.font.style.oblique[number];
    export type Style = typeof kw.font.style.all[number];

    export type VariantCss21 = typeof kw.font.variantCss21[number];

    export type WeightAbsolute = typeof kw.font.weight.absolute[number];
    export type WeightRelative = typeof kw.font.weight.relative[number];
    export type Weight = typeof kw.font.weight.all[number];

    export type LineHeight = typeof kw.font.lineHeight[number];
  }

  export namespace Prop {
    export namespace Font {
      export type AnyShorthand = typeof kw.prop.font.allShorthand[number];
    }
  }

  // MARK: Utils

  const equalityComparer = Intl.Collator('en-US', { usage: 'search', sensitivity: 'variant', ignorePunctuation: false });

  export function equals<T extends Opt<string>, V extends string>(kw: T, values: readonly V[] | V): kw is MostSpecific<T, V> {
    return isAssigned(kw) && isAssigned(values) &&
      (isString(values) ? !equalityComparer.compare(kw, values) : values.some(v => !equalityComparer.compare(kw, v)));
  }

  // MARK: Escape

  // Based on https://github.com/csstree/csstree/blob/master/lib/utils/

  const enum C {
    NullChar = 0x0000, // \0
    LineFeed = 0x000A, // \n
    CarriageReturn = 0x000D, // \r
    Space = 0x0020, //
    QuotationMark = 0x0022, // "
    Apostrophe = 0x0027, // '
    LeftParenthesis = 0x0028, // (
    RightParenthesis = 0x0029, // )
    HyphenMinus = 0x002D, // -
    ReverseSolidus = 0x005C, // \
    SurrogatePairStart = 0xD800,
    SurrogatePairEnd = 0xDFFF,
    ReplacementChar = 0xFFFD, // �
    MaxUnicodeCodePoint = 0x10FFFF,
    Eof = 0,
  };

  const enum Ch {
    Space = ' ',
    QuotationMark = '"',
    Apostrophe = "'",
    HyphenMinus = '-',
    ReverseSolidus = '\\',
    ReplacementChar = '�',
  };

  const isDigit = (c: number): boolean => c >= 0x0030 && c <= 0x0039;
  const isHexDigit = (c: number): boolean => isDigit(c) || (c >= 0x0041 && c <= 0x0046) || (c >= 0x0061 && c <= 0x0066);
  const isUppercaseLetter = (c: number): boolean => c >= 0x0041 && c <= 0x005A;
  const isLowercaseLetter = (c: number): boolean => c >= 0x0061 && c <= 0x007A;
  const isLetter = (c: number): boolean => isUppercaseLetter(c) || isLowercaseLetter(c);
  const isNonAscii = (c: number): boolean => c >= 0x0080;
  const isNameStart = (c: number): boolean => isLetter(c) || isNonAscii(c) || c === 0x005F;
  const isName = (c: number): boolean => isNameStart(c) || isDigit(c) || c === 0x002D;
  const isNewline = (c: number): boolean => c === C.LineFeed || c === C.CarriageReturn || c === 0x000C;
  const isWhitecSpace = (c: number) => isNewline(c) || c === 0x0020 || c === 0x0009;
  const isValidEscape = (c0: number, c1: number): boolean => c0 === C.ReverseSolidus && !isNewline(c1) && c1 !== C.Eof;
  const isControl = (c: number): boolean => c <= 0x001F || c === 0x007F;

  function getCharCode(s: string, i: number) {
    return i < s.length ? s.charCodeAt(i) : C.Eof;
  }

  function getNewlineLength(source: string, offset: number, code: number) {
    return code === 13 && getCharCode(source, offset + 1) === 10 ? 2 : 1;
  }

  function consumeEscaped(s: string, i: number) {
    i += 2;
    if (isHexDigit(getCharCode(s, i - 1))) {
      for (const maxOffset = Math.min(s.length, i + 5); i < maxOffset; i++)
        if (!isHexDigit(getCharCode(s, i)))
          break;
      const c = getCharCode(s, i);
      if (isWhitecSpace(c))
        i += getNewlineLength(s, i, c);
    }
    return i;
  }

  function decodeEscaped(s: string) {
    if (s.length === 1 && !isHexDigit(s.charCodeAt(0)))
      return s[0];
    let c = parseInt(s, 16);
    if ((c === C.NullChar) || (c >= C.SurrogatePairStart && c <= C.SurrogatePairEnd) || (c > C.MaxUnicodeCodePoint))
      c = C.ReplacementChar;
    return String.fromCodePoint(c);
  }

  export function isCustomProperty(s: string, i: number = 0) {
    return s.length - i >= 2 && s.charCodeAt(i) === C.HyphenMinus && s.charCodeAt(i + 1) === C.HyphenMinus;
  }

  export function getVendorPrefix(s: string, i: number = 0) {
    if (s.length - i >= 3 && s.charCodeAt(i) === C.HyphenMinus &&
      s.charCodeAt(i + 1) !== C.HyphenMinus) {
      const secondDashIndex = s.indexOf(Ch.HyphenMinus, i + 2);
      if (secondDashIndex !== -1)
        return s.substring(i, secondDashIndex + 1);
    }
    return '';
  }

  export function decodeString(s: string) {
    const len = s.length;
    const c0 = s.charCodeAt(0);
    const start = c0 === C.QuotationMark || c0 === C.Apostrophe ? 1 : 0;
    const end = start === 1 && len > 1 && s.charCodeAt(len - 1) === c0 ? len - 2 : len - 1;
    return decodeText(s, start, end, len);
  }

  export function encodeString(s: string, quoteMark: Ch.QuotationMark | Ch.Apostrophe) {
    const quoteCode = quoteMark === Ch.Apostrophe ? C.Apostrophe : C.QuotationMark;
    let r = '';
    let wsBeforeHex = false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === C.NullChar) {
        r += Ch.ReplacementChar;
        continue;
      }
      if (isControl(c)) {
        r += Ch.ReverseSolidus + c.toString(16);
        wsBeforeHex = true;
        continue;
      }
      if (c === quoteCode || c === C.ReverseSolidus) {
        r += Ch.ReverseSolidus + s.charAt(i);
        wsBeforeHex = false;
      } else {
        if (wsBeforeHex && (isHexDigit(c) || isWhitecSpace(c)))
          r += Ch.Space;
        r += s.charAt(i);
        wsBeforeHex = false;
      }
    }
    return quoteMark + r + quoteMark;
  }

  export function decodeIdent(s: string) {
    const end = s.length - 1;
    let r = '';
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c === C.ReverseSolidus) {
        if (i === end)
          break;
        c = s.charCodeAt(++i);
        if (isValidEscape(C.ReverseSolidus, c)) {
          const from = i - 1;
          const to = consumeEscaped(s, from);
          i = to - 1;
          r += decodeEscaped(s.substring(from + 1, to));
        } else if (c === C.CarriageReturn && s.charCodeAt(i + 1) === C.LineFeed)
          i++;
      } else
        r += s[i];
    }
    return r;
  }

  export function encodeIdent(s: string) {
    let r = '';
    const firstHyphen = s.charCodeAt(0) === C.HyphenMinus;
    if (s.length === 1 && firstHyphen)
      return '\\-';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === C.NullChar) {
        r += Ch.ReplacementChar;
        continue;
      }
      if (isControl(c) || (isDigit(c) && (i === 0 || i === 1 && firstHyphen))) {
        r += Ch.ReverseSolidus + c.toString(16) + Ch.Space;
        continue;
      }
      r += isName(c) ? s.charAt(i) : Ch.ReverseSolidus + s.charAt(i);
    }
    return r;
  }

  export function decodeUrl(s: string) {
    const len = s.length;
    let start = 4;
    let end = s.charCodeAt(len - 1) === C.RightParenthesis ? len - 2 : len - 1;
    while (start < end && isWhitecSpace(s.charCodeAt(start)))
      start++;
    while (start < end && isWhitecSpace(s.charCodeAt(end)))
      end--;
    return decodeText(s, start, end, len);
  }

  export function encodeUrl(s: string) {
    let r = '';
    let wsBeforeHex = false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === C.NullChar) {
        r += Ch.ReplacementChar;
        continue;
      }
      if (isControl(c)) {
        r += Ch.ReverseSolidus + c.toString(16);
        wsBeforeHex = true;
        continue;
      }
      if (
        c === C.Space || c === C.ReverseSolidus || c === C.QuotationMark || c === C.Apostrophe ||
        c === C.LeftParenthesis || c === C.RightParenthesis
      ) {
        r += Ch.ReverseSolidus + s.charAt(i);
        wsBeforeHex = false;
      } else {
        if (wsBeforeHex && isHexDigit(c))
          r += Ch.Space;
        r += s.charAt(i);
        wsBeforeHex = false;
      }
    }
    return `url(${r})`;
  }

  function decodeText(s: string, start: number, end: number, len: number) {
    let r = '';
    for (let i = start; i <= end; i++) {
      let c = s.charCodeAt(i);
      if (c === C.ReverseSolidus) {
        if (i === end) {
          if (i !== len - 1)
            r = s.substring(i + 1);
          break;
        }
        c = s.charCodeAt(++i);
        if (isValidEscape(C.ReverseSolidus, c)) {
          const from = i - 1;
          const to = consumeEscaped(s, from);
          i = to - 1;
          r += decodeEscaped(s.substring(from + 1, to));
        } else if (c === C.CarriageReturn && s.charCodeAt(i + 1) === C.LineFeed)
          i++;
      }
      else
        r += s[i];
    }
    return r;
  }
}