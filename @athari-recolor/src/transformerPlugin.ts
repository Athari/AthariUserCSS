import { fail } from 'node:assert/strict';
import { isRegExp } from 'node:util/types';
import { Optional, SetComplement } from 'utility-types';
import { cssTokenRegExps } from './commonUtils.ts';
import { PostCss, Css, Sel } from './domUtils.ts';
import {
  Guard, SubUnion, Opt, OptObject, OneOrArray, KeyOfAny, ArrayGenerator, Counter, RegExpTemplate,
  isSome, isArray, isString, objectAssignedValues, objectEntries, toAssignedArrayIfNeeded, throwError, assertNever, inspectPretty,
} from './utils.ts';

type MatchProps =
  | 'name' | 'value' | 'operator' | 'text' | 'namespace';

type CssTransNodeNames = SetComplement<Css.ChildNodeNames, 'rule'>;
type CssMatchPropsOn<N extends CssTransNodeNames, V extends CssTransNodeNames, P extends MatchProps, Else> =
  N extends V ? SubUnion<MatchProps, P> : Else;
type CssMatchProps<N extends CssTransNodeNames> =
  CssMatchPropsOn<N, 'atrule', 'name' | 'value',
  CssMatchPropsOn<N, 'comment', 'text',
  CssMatchPropsOn<N, 'decl', 'name' | 'value',
  never>>>;

const cssNodePropMap: {
  [N in CssTransNodeNames]: {
    [K in MatchProps as CssMatchProps<N>]: KeyOfAny<Css.ChildNode>;
  }
} = {
  atrule: { name: 'name', value: 'params' },
  comment: { text: 'text' },
  decl: { name: 'prop', value: 'value' },
};

type SelTransNodeNames = SetComplement<Sel.NodeNames, 'string' | 'selector' | 'root'>;
type SelMatchPropsOn<N extends SelTransNodeNames, V extends SelTransNodeNames, P extends MatchProps, Else> =
  N extends V ? SubUnion<MatchProps, P> : Else;
type SelMatchProps<N extends SelTransNodeNames> =
  SelMatchPropsOn<N, 'attribute', 'name' | 'namespace' | 'operator' | 'value',
  SelMatchPropsOn<N, 'class', 'name',
  SelMatchPropsOn<N, 'combinator', 'name',
  SelMatchPropsOn<N, 'comment', 'text',
  SelMatchPropsOn<N, 'id', 'name',
  SelMatchPropsOn<N, 'nesting', never,
  SelMatchPropsOn<N, 'pseudo', 'name',
  SelMatchPropsOn<N, 'tag', 'name' | 'namespace',
  SelMatchPropsOn<N, 'universal', never,
  never>>>>>>>>>;

const selNodePropMap: {
  [N in SelTransNodeNames]: {
    [K in MatchProps as SelMatchProps<N>]: KeyOfAny<Sel.Node>;
  }
} = {
  attribute: { name: 'attribute', operator: 'operator', value: 'value', namespace: 'namespaceString' },
  class: { name: 'value' },
  combinator: { name: 'value' },
  comment: { text: 'value' },
  id: { name: 'value' },
  nesting: {},
  pseudo: { name: 'value' },
  tag: { name: 'value', namespace: 'namespaceString' },
  universal: {},
};

type Node = Css.ChildNode | Sel.Node;
type NodeNames<T extends Node> = keyof NodePropMap<T>;
type NodePropMap<T extends Node> =
  T extends Css.ChildNode ? typeof cssNodePropMap :
  T extends Sel.Node ? typeof selNodePropMap : never;

type CssOp = 'rename' | 'set' | 'replace' | 'remove';
type SelOp = 'rename' | 'set' | 'replace' | 'remove' | 'removeSelector' | 'removeRule';
type TransAnyOp = CssOp | SelOp;
type TransOp<T extends Node> =
  T extends Css.ChildNode ? CssOp :
  T extends Sel.Node ? SelOp : never;

type TransMatchesOption<T extends Node, N extends NodeNames<T>> = {
  [K in KeyOfAny<NodePropMap<T>[N]>]?: Opt<RegExpMatchOption>;
};

interface TransOpOption<T extends Node> {
  operation: TransOp<T>;
  replace?: Opt<string>;
  what?: Opt<MatchProps>;
}

type TransOption<T extends Node, N extends NodeNames<T>> =
  & TransMatchesOption<T, N>
  & {
    flags?: Opt<string>;
    operations: OneOrArray<TransOpOption<T>>;
  };

type RegExpMatchOption =
  | RegExp
  | OneOrArray<string>
  | {
    flags?: Opt<string>;
    negate?: Opt<boolean>,
    find: RegExp | OneOrArray<string>;
  };

interface RegExpMatch<T extends Node> {
  prop: KeyOfAny<T>;
  negate: boolean,
  regex: RegExp;
}

type TransformerOptions<T extends Node> = {
  [N in keyof NodePropMap<T>]?: Opt<OneOrArray<TransOption<T, N>>>;
};

export interface RegularTransformerPluginOptions {
  css?: Opt<TransformerOptions<Css.ChildNode>>;
  selector?: Opt<TransformerOptions<Sel.Node>>;
}

const enum TransformCode { Matched = 1, MatchedBreak = 2, NotMatched = 3 };

class TransformResult {
  code!: TransformCode;
  operation!: TransAnyOp;

  constructor(code: TransformCode, operation: TransAnyOp | null) {
    Object.assign(this, { code, operation });
  }

  merge(code: TransformCode, operation: TransAnyOp | null) {
    if (code === TransformCode.NotMatched)
      return;
    this.code = code;
    this.operation = operation ?? this.operation;
  }
}

interface Transform<T extends Node> {
  type: NodeNames<T>;
  transform(node: T): TransformResult;
}

type Transformer<T extends Node> = {
  [N in NodeNames<T>]?: Transform<T>[];
};

function getTransformer<T extends Node>(
  options: TransformerOptions<T>, map: NodePropMap<T>
): Transformer<T> {
  type NodeName = keyof NodePropMap<T>;
  type PropMap = Record<MatchProps, KeyOfAny<T>>;

  interface OperationContext {
    type: NodeName;
    propMap: PropMap;
    regexes: RegExpMatch<T>[];
  }
  interface NodeContext {
    matchGroups: Record<string, string>;
  }

  const transformer: Transformer<T> = {};
  for (const [ nodeType, propMap ] of objectEntries(map))
    transformer[nodeType] = getTransforms(propMap as PropMap, nodeType).toArray();
  return transformer;

  function* getTransforms(propMap: PropMap, nodeType: NodeName): ArrayGenerator<Transform<T>> {
    for (const option of toAssignedArrayIfNeeded(options[nodeType])) {
      const ctxOp: OperationContext = new class {
        type = nodeType;
        propMap = propMap;
        regexes = getAllRegexes(propMap, option, option.flags ?? 'i').toArray();
      };

      yield {
        type: nodeType,
        transform(node: T): TransformResult {
          const ctxNode: NodeContext = new class {
            matchGroups = {};
          };
          let result = new TransformResult(TransformCode.NotMatched, null);
          if (testRegex(node, ctxOp, ctxNode) === TransformCode.NotMatched)
            return result;

          for (const operation of toAssignedArrayIfNeeded(option.operations)) {
            if (Css.isNode(node))
              result.merge(performCssOperation(node, operation as TransOpOption<Css.ChildNode>, ctxOp, ctxNode), operation.operation);
            else if (Sel.isNode(node))
              result.merge(performSelOperation(node, operation as TransOpOption<Sel.Node>, ctxOp, ctxNode), operation.operation);

            if (result.code === TransformCode.MatchedBreak)
              return result;
          }
          return result;
        }
      };
    }
  }

  function performCssOperation(
    node: Css.ChildNode, op: TransOpOption<Css.ChildNode>, ctxOp: OperationContext, ctxNode: NodeContext
  ): TransformCode {
    const replace = () => applyReplaceTemplate(op.replace, ctxNode);

    switch (op.operation) {
      case 'remove':
        node.remove();
        return TransformCode.Matched;

      case 'rename':
        if (Css.isComment(node))
          node.text = replace();
        else
          setPropertyUnsafe(node, ctxOp.propMap.name, replace());
        return TransformCode.Matched;

      case 'replace':
        node.replaceWith(...Css.parseChildNodes(replace()));
        return TransformCode.Matched;

      case 'set':
        if (Css.isComment(node))
          node.text = replace();
        else
          setPropertyUnsafe(node, ctxOp.propMap.value, replace());
        return TransformCode.Matched;

      default:
        throwError(`Unknown operation ${op.operation}`);
    }
  }

  function performSelOperation(
    node: Sel.Node, op: TransOpOption<Sel.Node>, ctxOp: OperationContext, ctxNode: NodeContext
  ): TransformCode {
    const replace = () => applyReplaceTemplate(op.replace, ctxNode);
    const isSelWithName = isSome(Sel.isAttribute, Sel.isClass, Sel.isCombinator, Sel.isPseudo, Sel.isTag);
    const isSelWithoutValue = isSome(Sel.isNesting, Sel.isUniversal);

    switch (op.operation) {
      case 'remove':
        node.remove();
        return TransformCode.Matched;

      case 'removeRule':
        return removeSelParent(node, Sel.isRoot);

      case 'removeSelector':
        return removeSelParent(node, Sel.isSelector);

      case 'rename':
        if (Sel.isComment(node))
          node.value = replace();
        else if (isSelWithName(node))
          setPropertyUnsafe(node, ctxOp.propMap.name, replace());
        else
          throwError(`Node of type ${node.type} cannot be renamed`);
        return TransformCode.Matched;

      case 'replace':
        node.replaceWith(...Sel.parseSelector(replace()).nodes);
        return TransformCode.Matched;

      case 'set':
        if (Sel.isComment(node))
          node.value = replace();
        else if (isSelWithoutValue(node))
          throwError(`Node of type ${node.type} cannot be set`);
        else
          setPropertyUnsafe(node, op.what ?? ctxOp.propMap.name, replace());
        return TransformCode.Matched;

      default:
        throwError(`Unknown operation ${op.operation}`);
    }

    function removeSelParent<T extends Sel.Node>(node: Opt<Sel.Node>, guard: Guard<T>): TransformCode {
      for (node = node; !!node; node = <Sel.Node>node?.parent) {
        if (guard(node)) {
          node.remove();
          return TransformCode.MatchedBreak;
        }
      }
      fail(`Missing node parent`);
    }
  }

  function testRegex(node: T, ctxOp: OperationContext, ctxNode: NodeContext): TransformCode {
    if (node.type !== ctxOp.type)
      return TransformCode.NotMatched;

    for (const regex of ctxOp.regexes) {
      const value = node[regex.prop];
      if (!isString(value))
        return TransformCode.NotMatched;

      const match = regex.regex.exec(value);
      Object.assign(ctxNode.matchGroups, match?.groups ?? {});
      if (!!match === regex.negate)
        return TransformCode.NotMatched;
    }
    return TransformCode.Matched;
  }

  function* getAllRegexes(
    propMap: PropMap, option: Optional<Record<MatchProps, RegExpMatchOption>>, flagsDefault: Opt<string>
  ): ArrayGenerator<RegExpMatch<T>> {
    for (const [ matcherProp, nodeProp ] of objectEntries(propMap)) {
      const matcher: Opt<RegExpMatchOption> = option[matcherProp];
      if (!matcher)
        continue;

      const { re, find, flags, negate }: OptObject<{ re: RegExp, find: string[], flags: string, negate: boolean }> =
        isRegExp(matcher) ?
          { re: matcher } :
        isString(matcher) ?
          { find: [ matcher ] } :
        isArray(matcher) ?
          { find: toAssignedArrayIfNeeded(matcher) } :
        isArray(matcher.find) ?
          { ...matcher, re: undefined, find: toAssignedArrayIfNeeded(matcher.find) } :
        isRegExp(matcher.find) ?
          { ...matcher, re: matcher.find, find: undefined } :
        isString(matcher.find) ?
          { ...matcher, re: undefined, find: [ matcher.find ] } :
          assertNever(matcher.find);

      yield {
        prop: nodeProp,
        negate: negate ?? false,
        regex: re ?? buildRegex(find ?? [], flags ?? flagsDefault ?? 'i'),
      };
    }
  }

  function buildRegex(find: string[], flags: string): RegExp {
    const tpl = new RegExpTemplate(flags ?? 'i');
    tpl.appendRaw("^");
    for (const s of find) {
      if (!s.includes('=')) {
        tpl.appendRawEscaped(s);
      } else {
        const [ name, key = "" ] = s.split('=', 2) as [ string, keyof typeof cssTokenRegExps ];
        tpl.appendRaw(name.length > 0 ? `(?<${name}>` : "(");
        tpl.appendValue(cssTokenRegExps[key] ?? throwError(`regex '${key}' not found`));
        tpl.appendRaw(")");
      }
    }
    tpl.appendRaw("$");
    return tpl.formatRegExp();
  }

  function applyReplaceTemplate(replace: Opt<string>, ctxNode: NodeContext): string {
    return (replace ?? throwError("Operation's replace not set")).template(ctxNode.matchGroups, "$<", ">");
  }

  function setPropertyUnsafe(o: unknown, k: PropertyKey, v: unknown) {
    const a = o as any;
    if (!(k in a))
      throwError(`Property ${String(k)} on ${typeof o} not found`);
    a[k] = v;
  }
}

export default PostCss.declarePluginOpt<RegularTransformerPluginOptions>('regular-transformer', {
  css: {
    atrule: [],
    comment: [],
    decl: [],
  },
  selector: {
    attribute: [],
    class: [],
    combinator: [],
    comment: [],
    id: [],
    nesting: [],
    pseudo: [],
    tag: [],
    universal: [],
  },
}, (opts: RegularTransformerPluginOptions) => {
  const cssTransforms = opts.css ? objectAssignedValues(getTransformer(opts.css, cssNodePropMap)).flat(1) : [];
  const selTransforms = opts.selector ? objectAssignedValues(getTransformer(opts.selector, selNodePropMap)).flat(1) : [];

  return {
    OnceExit(cssRoot: Css.Root): void {
      if (cssTransforms.length === 0 && selTransforms.length === 0)
        return;

      const cssCounter = new Counter<`${NodeNames<Css.ChildNode>}-${TransAnyOp}`>();
      const selCounter = new Counter<`${NodeNames<Sel.Node>}-${TransAnyOp}`>();

      cssRoot.walk((cssNode: Css.ChildNode): false | void => {
        for (const cssTransform of cssTransforms) {
          const ret = cssTransform.transform(cssNode);
          if (ret.code !== TransformCode.NotMatched)
            cssCounter.increment(`${cssTransform.type}-${ret.operation}`);
          if (ret.code === TransformCode.MatchedBreak)
            break;
        }

        if (!Css.isRule(cssNode) || selTransforms.length === 0)
          return;

        const selRoot: Sel.Root = Sel.parseRoot(cssNode);
        selRoot.walk((selNode: Sel.Node): false | void => {
          for (const selTransform of selTransforms) {
            const ret = selTransform.transform(selNode);
            if (ret.code !== TransformCode.NotMatched)
              selCounter.increment(`${selTransform.type}-${ret.operation}`);
            if (ret.code === TransformCode.MatchedBreak)
              break;
          }
        });

        for (const selSel of selRoot.nodes)
          if (selSel.length === 0)
            selSel.remove();

        if (selRoot.length === 0)
          cssNode.remove();
        else
          cssNode.selector = selRoot.toString();
      });

      if  (cssCounter.size > 0)
        console.log(`Transformed ${cssCounter.total} CSS nodes`, inspectPretty(cssCounter.getCounts()));
      if (selCounter.size > 0)
        console.log(`Transformed ${selCounter.total} CSS selector nodes`, inspectPretty(selCounter.getCounts()));
    }
  };
});