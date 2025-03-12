import { InterpolatedValue, regex } from 'regex';
import { DeepRequired } from 'utility-types';
import {
  CssRoot, CssRule,
  Sel, SelNode, SelNodeNames, SelRoot,
  SelSelector,
  declarePostCssPlugin,
} from './domUtils.ts';
import {
  OneOrArray, OptionalArray, OptionalOneOrArray,
  isAssigned, objectValues, throwError, toAssignedArrayIfNeeded, valuesOf,
} from './utils.ts';

interface DerandomTransformOption {
  flags?: string | undefined;
  find: string[];
  replace: string;
}

interface DerandomTransform {
  find: RegExp;
  replace: string;
  type: SelNodeNames;
  transform(node: SelNode): SelNode[] | null;
}

const SelDerandomKeys = valuesOf<SelNodeNames>()('class', 'id');

type DerandomTransformer<TTransform, TKeys extends readonly SelNodeNames[], IsOptional extends boolean> =
  Pick<
    Record<
      SelNodeNames,
      IsOptional extends true ?
        OptionalArray<TTransform> :
        Array<TTransform>>,
    TKeys[number]>;

export interface DerandomSelectorsPluginOptions extends
  Partial<DerandomTransformer<DerandomTransformOption | undefined, typeof SelDerandomKeys, true>> { }

interface Runner extends DerandomTransformer<DerandomTransform, typeof SelDerandomKeys, false> { }

type Options = DeepRequired<DerandomSelectorsPluginOptions>;

type MatchedTypesCounter = Partial<Record<SelNodeNames, number>>;

// https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/#token-diagrams
const r = new class CssTokenRegExps {
  "" = null;
  newLine = regex('i')`
    \n | \r\n | \r | \f
  `;
  whiteSpace = regex('i')`
    \ | \t | ${this.newLine}
  `;
  digit = regex('i')`
    [ 0-9 ]
  `;
  hexDigit = regex('i')`
    [ 0-9 a-f ]
  `;
  escape = regex('i')`
    \\ (
      ${this.hexDigit}{1,6} ${this.whiteSpace}? |
      ( (?! ${this.newLine} | ${this.hexDigit} ) . )
    )
  `;
  whiteSpaceStar = regex('i')`
    ${this.whiteSpace}*
  `;
  alpha = regex('i')`
    [ a-z _ ]
  `;
  alphaNum = regex('i')`
    [ a-z 0-9 ]
  `;
  alphaNumDash = regex('i')`
    [ a-z 0-9 \- ]
  `;
  alphaNumUnder = regex('i')`
    [ a-z 0-9 _ ]
  `;
  alphaNumUnderDash = regex('i')`
    [ a-z 0-9 _ \- ]
  `;
  sign = regex('i')`
    [ \+ \- ]
  `;
  ident = regex('i')`
    (
      -- |
      -? ( ${this.alpha} | ${this.escape} )
    )
    (
      ${this.alphaNumUnderDash} | ${this.escape}
    )*
  `;
  identDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  identSingleDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      (?! -- )
      ${this.alphaNumDash} | ${this.escape}
    )*
  `;
  identUnderDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      ${this.alphaNumUnder} | ${this.escape}
    )*
  `;
  identUnderSingleDash = regex('i')`
    (
      ${this.alpha} | ${this.escape}
    )
    (
      (?! -- )
      ${this.alphaNumUnderDash} | ${this.escape}
    )*
  `;
  number = regex('i')`
    ${this.sign}?
    (
      ( ${this.digit}+ \. ${this.digit}+ ) |
      ( \. ${this.digit}+ ) |
      ${this.digit}+
    )+
    (
      e
      ${this.sign}?
      ${this.digit}+
    )?
  `;
  dim = regex('i')`
    ${this.number} ${this.ident}
  `;
  percent = regex('i')`
    ${this.number} %
  `;
}();

function getDerandomTransform(type: SelNodeNames, opt: DerandomTransformOption): DerandomTransform {
  const raw: string[] = [ "^" ];
  const values: InterpolatedValue[] = [];

  const appendRaw = (s: string) => raw[raw.length - 1] += s;
  const appendValue = (v: InterpolatedValue) => (values.push(v), raw.push(""));
  const escapeRegExp = (s: string) => s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

  for (const s of opt.find) {
    if (!s.includes('=')) {
      appendRaw(escapeRegExp(s));
    } else {
      const [ name, key = "" ] = s.split('=', 2) as [ string, keyof typeof r ];
      appendRaw(name.length > 0 ? `(?<${name}>` : "(");
      appendValue(r[key] ?? throwError(`regex '${key}' not found`));
      appendRaw(")");
    }
  }
  appendRaw("$");

  return {
    find: regex(opt.flags ?? 'i')({ raw }, ...values),
    replace: opt.replace,
    type,
    transform(node: SelNode): SelNode[] | null {
      if (node.type !== this.type || !node.value )
        return null;
      const newValue = node.value.replace(this.find, this.replace);
      if (newValue === node.value)
        return null;
      return Sel.parseRoot(newValue).nodes.single().nodes;
    },
  };
}

function optionsToRunner(opts: Options): Runner {
  return {
    class: toAssignedArrayIfNeeded(opts.class).map(t => getDerandomTransform('class', t)),
    id: toAssignedArrayIfNeeded(opts.id).map(t => getDerandomTransform('id', t)),
  };
}

function applySelTransforms(sel: SelSelector, transforms: DerandomTransform[], counter: MatchedTypesCounter): void {
  sel.walk((node: SelNode): void => {
    for (const transform of transforms) {
      const newNodes = transform.transform(node);
      if (newNodes) {
        counter[transform.type] = (counter[transform.type] ?? 0) + 1;
        node.replaceWith(...newNodes);
      }
    }
  });
}

export default declarePostCssPlugin<DerandomSelectorsPluginOptions>('derandom-selectors', {
  class: [],
  id: [],
}, (opts: Options) => {
  const runner: Runner = optionsToRunner(opts);
  const transforms = objectValues(runner).flat(1).filter(isAssigned);

  return {
    OnceExit(css: CssRoot) {
      const matchedTypesCount: MatchedTypesCounter = {};

      css.walkRules((rule: CssRule) => {
        const root: SelRoot = Sel.parseRoot(rule);
        for (const sel of root.nodes.toArray())
          applySelTransforms(sel, transforms, matchedTypesCount);
        rule.selector = root.toString();
      });

      console.log(`Derandomised ${objectValues(matchedTypesCount).sum()} selectors`, matchedTypesCount);
    }
  }
});