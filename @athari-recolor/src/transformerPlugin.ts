import { fail } from 'node:assert/strict';
import { isRegExp } from 'node:util/types';
import { Optional, SetComplement } from 'utility-types';
import { cssTokenRegExps } from './commonUtils.ts';
import {
  Css, CssChildNode,CssChildNodeNames, CssRoot, CssAnyNode,
  Sel, SelNode, SelNodeNames, SelRoot,
  isCssNode, isCssRule, isCssComment,
  isSelNode, isSelRoot, isSelSelector, isSelAttribute, isSelComment, isSelClass, isSelCombinator, isSelNesting, isSelPseudo, isSelTag, isSelUniversal,
  declarePostCssPluginOpt,
} from './domUtils.ts';
import {
  Guard, SubUnion, Opt, OptObject, OneOrArray, KeyOfAny, ArrayGenerator, Counter, RegExpTemplate,
  isSome, isArray, isString, objectAssignedValues, objectEntries, toAssignedArrayIfNeeded, throwError, assertNever, inspectPretty,
} from './utils.ts';

type MatchProps =
  | 'name' | 'value' | 'operator' | 'text' | 'namespace';

type CssTransNodeNames = SetComplement<CssChildNodeNames, 'rule'>;
type CssMatchPropsOn<N extends CssTransNodeNames, V extends CssTransNodeNames, P extends MatchProps, Else> =
  N extends V ? SubUnion<MatchProps, P> : Else;
type CssMatchProps<N extends CssTransNodeNames> =
  CssMatchPropsOn<N, 'atrule', 'name' | 'value',
  CssMatchPropsOn<N, 'comment', 'text',
  CssMatchPropsOn<N, 'decl', 'name' | 'value',
  never>>>;

const cssNodePropMap: {
  [N in CssTransNodeNames]: {
    [K in MatchProps as CssMatchProps<N>]: KeyOfAny<CssChildNode>;
  }
} = {
  atrule: { name: 'name', value: 'params' },
  comment: { text: 'text' },
  decl: { name: 'prop', value: 'value' },
};

type SelTransNodeNames = SetComplement<SelNodeNames, 'string' | 'selector' | 'root'>;
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
    [K in MatchProps as SelMatchProps<N>]: KeyOfAny<SelNode>;
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

type Node = CssChildNode | SelNode;
type NodeNames<T extends Node> = keyof NodePropMap<T>;
type NodePropMap<T extends Node> =
  T extends CssChildNode ? typeof cssNodePropMap :
  T extends SelNode ? typeof selNodePropMap : never;

type CssOp = 'rename' | 'set' | 'replace' | 'remove';
type SelOp = 'rename' | 'set' | 'replace' | 'remove' | 'removeSelector' | 'removeRule';
type TransAnyOp = CssOp | SelOp;
type TransOp<T extends Node> =
  T extends CssChildNode ? CssOp :
  T extends SelNode ? SelOp : never;

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
  css?: Opt<TransformerOptions<CssChildNode>>;
  selector?: Opt<TransformerOptions<SelNode>>;
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
            if (isCssNode(node))
              result.merge(performCssOperation(node, operation as TransOpOption<CssChildNode>, ctxOp, ctxNode), operation.operation);
            else if (isSelNode(node))
              result.merge(performSelOperation(node, operation as TransOpOption<SelNode>, ctxOp, ctxNode), operation.operation);

            if (result.code === TransformCode.MatchedBreak)
              return result;
          }
          return result;
        }
      };
    }
  }

  function performCssOperation(
    node: CssChildNode, op: TransOpOption<CssChildNode>, ctxOp: OperationContext, ctxNode: NodeContext
  ): TransformCode {
    const replace = () => applyReplaceTemplate(op.replace, ctxNode);

    switch (op.operation) {
      case 'remove':
        node.remove();
        return TransformCode.Matched;

      case 'rename':
        if (isCssComment(node))
          node.text = replace();
        else
          setPropertyUnsafe(node, ctxOp.propMap.name, replace());
        return TransformCode.Matched;

      case 'replace':
        node.replaceWith(...Css.parseChildNodes(replace()));
        return TransformCode.Matched;

      case 'set':
        if (isCssComment(node))
          node.text = replace();
        else
          setPropertyUnsafe(node, ctxOp.propMap.value, replace());
        return TransformCode.Matched;

      default:
        throwError(`Unknown operation ${op.operation}`);
    }
  }

  function performSelOperation(
    node: SelNode, op: TransOpOption<SelNode>, ctxOp: OperationContext, ctxNode: NodeContext
  ): TransformCode {
    const replace = () => applyReplaceTemplate(op.replace, ctxNode);
    const isSelWithName = isSome(isSelAttribute, isSelClass, isSelCombinator, isSelPseudo, isSelTag);
    const isSelWithoutValue = isSome(isSelNesting, isSelUniversal);

    switch (op.operation) {
      case 'remove':
        node.remove();
        return TransformCode.Matched;

      case 'removeRule':
        return removeSelParent(node, isSelRoot);

      case 'removeSelector':
        return removeSelParent(node, isSelSelector);

      case 'rename':
        if (isSelComment(node))
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
        if (isSelComment(node))
          node.value = replace();
        else if (isSelWithoutValue(node))
          throwError(`Node of type ${node.type} cannot be set`);
        else
          setPropertyUnsafe(node, op.what ?? ctxOp.propMap.name, replace());
        return TransformCode.Matched;

      default:
        throwError(`Unknown operation ${op.operation}`);
    }

    function removeSelParent<T extends SelNode>(node: SelNode | undefined, guard: Guard<T>): TransformCode {
      for (node = node; !!node; node = <SelNode>node?.parent) {
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
    propMap: PropMap, option: Optional<Record<MatchProps, RegExpMatchOption>>, flagsDefault: string | undefined
  ): ArrayGenerator<RegExpMatch<T>> {
    for (const [ matcherProp, nodeProp ] of objectEntries(propMap)) {
      const matcher: RegExpMatchOption | undefined = option[matcherProp];
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

  function applyReplaceTemplate(replace: string | undefined, ctxNode: NodeContext): string {
    return (replace ?? throwError("Operation's replace not set")).template(ctxNode.matchGroups, "$<", ">");
  }

  function setPropertyUnsafe(o: unknown, k: PropertyKey, v: unknown) {
    const a = o as any;
    if (!(k in a))
      throwError(`Property ${String(k)} on ${typeof o} not found`);
    a[k] = v;
  }
}

export default declarePostCssPluginOpt<RegularTransformerPluginOptions>('regular-transformer', {
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
    OnceExit(cssRoot: CssRoot): void {
      if (cssTransforms.length === 0 && selTransforms.length === 0)
        return;

      const cssCounter = new Counter<`${NodeNames<CssChildNode>}-${TransAnyOp}`>();
      const selCounter = new Counter<`${NodeNames<SelNode>}-${TransAnyOp}`>();

      cssRoot.walk((cssNode: CssChildNode): false | void => {
        for (const cssTransform of cssTransforms) {
          const ret = cssTransform.transform(cssNode);
          if (ret.code !== TransformCode.NotMatched)
            cssCounter.increment(`${cssTransform.type}-${ret.operation}`);
          if (ret.code === TransformCode.MatchedBreak)
            break;
        }

        if (!isCssRule(cssNode) || selTransforms.length === 0)
          return;

        const selRoot: SelRoot = Sel.parseRoot(cssNode);
        selRoot.walk((selNode: SelNode): false | void => {
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