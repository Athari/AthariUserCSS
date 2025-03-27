import { MostSpecific, Opt, isAssigned, isString } from '../utils.ts';

// MARK: Constants

export const kw = new class {
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

  // MARK: Utils

  const equalityComparer = Intl.Collator('en-US', { usage: 'search', sensitivity: 'variant', ignorePunctuation: false });

  export function equals<T extends Opt<string>, V extends string>(kw: T, values: readonly V[] | V): kw is MostSpecific<T, V> {
    return isAssigned(kw) && isAssigned(values) &&
      (isString(values) ? !equalityComparer.compare(kw, values) : values.some(v => !equalityComparer.compare(kw, v)));
  }
}