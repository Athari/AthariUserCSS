import { DeepRequired } from 'utility-types';
import { cssTokenRegExps } from './commonUtils.ts';
import {
  CssRoot, CssRule,
  Sel, SelNode, SelNodeNames, SelRoot,
  SelSelector,
  declarePostCssPlugin,
} from './domUtils.ts';
import {
  OptionalArray, RegExpTemplate,
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

function getDerandomTransform(type: SelNodeNames, opt: DerandomTransformOption): DerandomTransform {
  const tpl = new RegExpTemplate(opt.flags ?? 'i');
  tpl.appendRaw("^");
  for (const s of opt.find) {
    if (!s.includes('=')) {
      tpl.appendText(s);
    } else {
      const [ name, key = "" ] = s.split('=', 2) as [ string, keyof typeof cssTokenRegExps ];
      tpl.appendRaw(name.length > 0 ? `(?<${name}>` : "(");
      tpl.appendValue(cssTokenRegExps[key] ?? throwError(`regex '${key}' not found`));
      tpl.appendRaw(")");
    }
  }
  tpl.appendRaw("$");

  return {
    find: tpl.formatRegExp(),
    replace: opt.replace,
    type,
    transform(node: SelNode): SelNode[] | null {
      if (node.type !== this.type || !node.value )
        return null;
      const newValue = node.value.replace(this.find, this.replace);
      if (newValue === node.value)
        return null;
      return Sel.parseSelector(newValue).nodes;
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