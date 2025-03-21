// HTML: HTMLParser2

export {
  parseDocument as parseHtmlDocument,
} from 'htmlparser2';

import {
  Element as HtmlElement,
  Node as HtmlNode,
} from 'domhandler';

export {
  CDATA as HtmlCData,
  Comment as HtmlComment,
  DataNode as HtmlDataNode, // text|comment|instruction
  Document as HtmlDocument,
  Element as HtmlElement,
  Node as HtmlNode,
  NodeWithChildren as HtmlContainer, // document|element|cdata
  ProcessingInstruction as HtmlDirective,
  Text as HtmlText,
  cloneNode as cloneHtmlNode,
  hasChildren as hasHtmlChildren,
  isCDATA as isHtmlCData,
  isComment as isHtmlComment,
  isDirective as isHtmlDirective,
  isDocument as isHtmlDocument,
  isTag as isHtmlTag,
  isText as isHtmlText,
} from 'domhandler';

export type {
  AnyNode as HtmlAnyNode,
  ChildNode as HtmlChildNode,
  ParentNode as HtmlParentNode,
} from 'domhandler';

export {
  textContent as getHtmlAllInnerText,
  innerText as getHtmlInnerText,
} from 'domutils';

import {
  selectOne as htmlSelectOne,
  selectAll as htmlSelectAll,
  is as htmlSelectIs,
  compile as htmlSelectCompile,
} from 'css-select';

// CSS: PostCSS

import postCss, {
  AnyNode as CssAnyNode,
  AtRule as CssAtRule,
  ChildNode as CssChildNode,
  Comment as CssComment,
  Container as CssContainer,
  Declaration as CssDecl,
  Document as CssDocument,
  Node as CssNode,
  Plugin as PostCssPlugin,
  Root as CssRoot,
  Rule as CssRule,
} from 'postcss';

export type {
  AnyNode as CssAnyNode,
  ChildNode as CssChildNode,
  Helpers as PostCssHelpers,
} from 'postcss';

export {
  AtRule as CssAtRule,
  Comment as CssComment,
  Container as CssContainer,
  Declaration as CssDecl,
  Document as CssDocument,
  Node as CssNode,
  Plugin as PostCssPlugin,
  PluginCreator as PostCssPluginCreator,
  Processor as PostCssProcessor,
  Result as PostCssResult,
  Root as CssRoot,
  Rule as CssRule,
  Warning as PostCssWarning,
} from 'postcss';

import cssSafeParser from 'postcss-safe-parser';

import cssSelectorParser from 'postcss-selector-parser';

import type {
  AttributeOptions as SelAttributeOptions,
  Attribute as SelAttribute,
  AttributeOperator as SelAttributeOperator,
  ClassName as SelClassName,
  Combinator as SelCombinator,
  Comment as SelComment,
  ContainerOptions as SelContainerOptions,
  Container as SelContainerBase,
  Identifier as SelIdentifier,
  Nesting as SelNesting,
  Node as SelNode,
  NodeTypes as SelNodeTypes,
  Pseudo as SelPseudo,
  QuoteMark as SelQuoteMark,
  Root as SelRoot,
  Selector as SelSelector,
  String as SelString,
  Tag as SelTag,
  Universal as SelUniversal,
} from 'postcss-selector-parser';

const {
  isAttribute: isSelAttribute,
  isClassName: isSelClass,
  isCombinator: isSelCombinator,
  isComment: isSelComment,
  isContainer: isSelContainer,
  isIdentifier: isSelIdentifier,
  isNamespace: isSelNamespace,
  isNesting: isSelNesting,
  isNode: isSelNode,
  isPseudo: isSelPseudo,
  isPseudoClass: isSelPseudoClass,
  isPseudoElement: isSelPseudoElement,
  isRoot: isSelRoot,
  isSelector: isSelSelector,
  isString: isSelString,
  isTag: isSelTag,
  isUniversal: isSelUniversal,
} = cssSelectorParser;

export {
  isSelAttribute,
  isSelClass,
  isSelCombinator,
  isSelComment,
  isSelContainer,
  isSelIdentifier,
  isSelNamespace,
  isSelNesting,
  isSelNode,
  isSelPseudo,
  isSelPseudoClass,
  isSelPseudoElement,
  isSelRoot,
  isSelSelector,
  isSelString,
  isSelTag,
  isSelUniversal,
  cssSelectorParser,
};

export type {
  Attribute as SelAttribute,
  AttributeOperator as SelAttributeOperator,
  ClassName as SelClassName,
  Combinator as SelCombinator,
  Comment as SelComment,
  //Container as SelContainer,
  Identifier as SelIdentifier,
  Nesting as SelNesting,
  Node as SelNode,
  NodeTypes as SelNodeTypes,
  Pseudo as SelPseudo,
  QuoteMark as SelQuoteMark,
  Root as SelRoot,
  Selector as SelSelector,
  String as SelString,
  Tag as SelTag,
  Universal as SelUniversal,
} from 'postcss-selector-parser';

// CSS: CSSTools

import {
  isTokenNode as isCompToken,
  parseComponentValue as parseCssComp,
} from '@csstools/css-parser-algorithms';

import type {
  ComponentValue as Comp,
  TokenNode as CompToken,
} from '@csstools/css-parser-algorithms';

export {
  ContainerNode as CompContainer,
  CommentNode as CompComment,
  ContainerNodeBaseClass as CompContainerBase,
  FunctionNode as CompFunction,
  SimpleBlockNode as CompBlock,
  TokenNode as CompToken,
  WhitespaceNode as CompWhitespace,
  isCommentNode as isCompComment,
  isFunctionNode as isCompFunction,
  isSimpleBlockNode as isCompBlock,
  isTokenNode as isCompToken,
  isWhiteSpaceOrCommentNode as isCompWhiteSpaceOrComment,
  isWhitespaceNode as isCompWhitespace,
  parseComponentValue as parseCssComp,
  parseCommaSeparatedListOfComponentValues as parseCssCompCommaList,
  parseListOfComponentValues as parseCssCompList,
  replaceComponentValues as replaceCssComps,
  stringify as stringifyCssComps,
} from '@csstools/css-parser-algorithms';

export type {
  ComponentValue as Comp,
} from '@csstools/css-parser-algorithms';

export {
  selectorSpecificity as getSelSpecificity,
  compare as compareSelSpecificity,
} from '@csstools/selector-specificity';

export type {
  Specificity as SelSpecificity,
} from '@csstools/selector-specificity';

import {
  CSSToken as CssToken,
  tokenize as tokenizeCssProc,
  stringify as stringifyCss,
  HashType as CssHashType,
  NumberType as CssNumberType,
  TokenDelim, TokenIdent, TokenHash, TokenAtKeyword, TokenFunction, TokenDimension, TokenNumber, TokenPercentage, TokenString, TokenURL,
} from '@csstools/css-tokenizer';

export {
  HashType as CssHashType,
  NumberType as CssNumberType,
} from '@csstools/css-tokenizer';

export type {
  CSSToken as CssToken,
  Token as CssTokenT,
  stringify as stringifyCss,
} from '@csstools/css-tokenizer';

// Utils

import assert from 'node:assert/strict';

import {
  DeepRequired, NonUndefined,
} from 'utility-types';

import {
  Assigned, Guard,
  deepMerge, isSome, throwError,
} from './utils.ts';

// HTML: Functions

type HtmlCompiledQuery<T extends HtmlElement> = ReturnType<typeof htmlSelectCompile<HtmlNode, T>>;

type HtmlSelector<T extends HtmlElement> = Parameters<typeof htmlSelectOne<HtmlNode, T>>[0];

type HtmlSimpleSelector = Parameters<typeof htmlSelectCompile<HtmlNode, HtmlElement>>[0];

export function htmlQuerySelector<T extends HtmlElement>(node: HtmlNode, selector: HtmlSelector<T>): T | null {
  return htmlSelectOne<HtmlNode, T>(selector, node);
}

export function htmlQuerySelectorAll<T extends HtmlElement>(node: HtmlNode, selector: HtmlSelector<T>): T[] {
  return htmlSelectAll<HtmlNode, T>(selector, node);
}

export function htmlMatches<T extends HtmlElement>(node: T, selector: HtmlSelector<T>): boolean {
  return htmlSelectIs<HtmlNode, T>(node, selector);
}

export function htmlCompileQuery<T extends HtmlElement>(selector: HtmlSimpleSelector): HtmlCompiledQuery<T> {
  return htmlSelectCompile<HtmlNode, T>(selector);
}

// CSS: Functions

export type CssNodeNames = CssAnyNode['type'];

export type CssChildNodeNames = CssChildNode['type'];

export type CssNodeTypes = {
  [K in CssNodeNames]: Extract<CssAnyNode, { type: K }>;
};

export const isCssAtRule = (n: unknown): n is CssAtRule => n instanceof CssAtRule;
export const isCssComment = (n: unknown): n is CssComment => n instanceof CssComment;
export const isCssContainer = (n: unknown): n is CssContainer => n instanceof CssContainer;
export const isCssDecl = (n: unknown): n is CssDecl => n instanceof CssDecl;
export const isCssDocument = (n: unknown): n is CssDocument => n instanceof CssDocument;
export const isCssNode = (n: unknown): n is CssNode => n instanceof CssNode;
export const isCssRoot = (n: unknown): n is CssRoot => n instanceof CssRoot;
export const isCssRule = (n: unknown): n is CssRule => n instanceof CssRule;
export const isCssChildNode = (n: unknown): n is CssChildNode => isSome(isCssAtRule, isCssComment, isCssDecl, isCssRule)(n);

export type PostCssProcessors = ReturnType<NonUndefined<PostCssPlugin['prepare']>>;

export type PostCssPluginCreate<O> = ((opts?: O) => PostCssPlugin) & { postcss: true };

export function declarePostCssPlugin<O>(
  name: string,
  defaultOpts: DeepRequired<O>,
  processors: (opts: DeepRequired<O>) => PostCssProcessors,
): PostCssPluginCreate<O> {
  return Object.assign(
    (opts?: O): PostCssPlugin => ({
      postcssPlugin: name,
      prepare() {
        const actualOpts = deepMerge(null, {}, defaultOpts, opts) as DeepRequired<O>;
        return processors(actualOpts);
      },
    }),
    {
      postcss: true as const,
    },
  );
}

export function declarePostCssPluginOpt<O>(
  name: string,
  defaultOptions: O,
  processors: (opts: O) => PostCssProcessors,
): PostCssPluginCreate<O> {
  return Object.assign(
    (opts?: O): PostCssPlugin => ({
      postcssPlugin: name,
      prepare() {
        const actualOpts = Object.assign({}, defaultOptions, opts) as O;
        return processors(actualOpts);
      },
    }),
    {
      postcss: true as const,
    },
  );
}

export namespace Css {
  function parseNode<T extends CssAnyNode>(guard: Guard<T>): (css: string) => T {
    return css => {
      const node = parseRoot(css).nodes.single();
      assert(guard(node));
      return node;
    };
  }

  function parseNodes<T extends CssAnyNode>(guard?: Guard<T>): (css: string) => T[] {
    return css => parseRoot(css).nodes
      .map(node => {
        assert(guard?.(node));
        return node;
      });
  }

  export const parseRoot = (css: string) => cssSafeParser(css);
  export const parseRule = parseNode(isCssRule);
  export const parseAtRule = parseNode(isCssRule);
  export const parseComment = parseNode(isCssComment);

  export function parseDecl(css: string): CssDecl {
    const rule = parseRule(`*{${css}}`);
    const node = rule.nodes.single();
    assert(isCssDecl(node));
    return node;
  }

  export const parseChildNodes = parseNodes(isCssChildNode);
  export const parseRules = parseNodes(isCssRule);
  export const parseAtRules = parseNodes(isCssRule);
  export const parseComments = parseNodes(isCssComment);

  export function parseDecls(css: string): CssDecl[] {
    return parseRule(`*{${css}}`).nodes.map(node => {
      assert(isCssDecl(node));
      return node;
    });
  }
}

export type SelNodeNames = keyof SelNodeTypes;

export type SelParseOptions = Assigned<Parameters<ReturnType<typeof cssSelectorParser>['astSync']>[1]>;

export type SelContainer = SelRoot | SelSelector | SelPseudo;

export function tokenizeCss(css: string): CssToken[] {
  return tokenizeCssProc({ css });
}

export function stringifyCssComp(node: Comp): string {
  return stringifyCss(...node.tokens());
}

export function parseCssCompStr(css: string): Comp {
  return parseCssComp(tokenizeCss(css)) ?? throwError("Failed to parse CSS comp");
}

type TokenWithValue = TokenAtKeyword | TokenDelim | TokenFunction | TokenHash | TokenIdent | TokenDimension | TokenNumber | TokenPercentage | TokenString | TokenURL;
type TokenValueType = string | number;
type TokenWithType = TokenDimension | TokenHash | TokenNumber;
type TokenTypeType = CssNumberType | CssHashType;

export function isCompTokenType<T extends CssToken>(
  comp: Comp, isTokenType: (x: CssToken) => x is T)
  : comp is CompToken & { value: T } {
  return isCompToken(comp) && isTokenType(comp.value);
}

export function isCompTokenTypeValue<TToken extends TokenWithValue, TValue extends TokenValueType>(
  comp: Comp, isTokenType: (x: CssToken) => x is TToken, value: TValue)
  : comp is CompToken & { value: TToken & { [4]: { value: TValue } } } {
  return isCompToken(comp) && isTokenType(comp.value) && comp.value[4].value === value;
}

export function isCompTokenTypeType<TToken extends TokenWithType, TType extends TokenTypeType>(
  comp: Comp, isTokenType: (x: CssToken) => x is TToken, type: TType)
  : comp is CompToken & { value: TToken & { [4]: { type: TType } } } {
  return isCompToken(comp) && isTokenType(comp.value) && comp.value[4].type === type;
}

export function areSelNodesEqual(a: SelNode, b: SelNode): boolean {
  return a.toString() === b.toString();
}

export function areSelNodeHeadersEqual(a: SelNode, b: SelNode): boolean {
  return cloneSelNodeHeader(a).toString() === cloneSelNodeHeader(b).toString();
}

export function cloneSelNode<T extends SelNode>(node: T): T {
  return node.clone() as T;
}

export function cloneSelNodeHeader<T extends SelNode>(node: T): T {
  if (isSelRoot(node))
    return Sel.root() as T;
  if (isSelSelector(node))
    return Sel.selector() as T;
  if (isSelPseudoClass(node))
    return Sel.pseudoClass(node.value) as T;
  return cloneSelNode(node);
}

export namespace Sel {
  export function parseRoot(selectors: string | CssRule, opts?: SelParseOptions): SelRoot {
    return cssSelectorParser().astSync(selectors, Object.assign(<SelParseOptions>{ lossless: false }, opts));
  }

  export function parseSelector(selector: string | CssRule, opts?: SelParseOptions): SelSelector {
    return parseRoot(selector, opts).nodes.single();
  }

  export function attribute(attribute: string, operator?: SelAttributeOperator, value?: string, insensitive?: boolean): SelAttribute {
    const opts: SelAttributeOptions = {
      attribute, value, quoteMark: null,
      insensitive: insensitive ?? false,
      raws: {},
    };
    if (operator !== undefined)
      opts.operator = operator;
    const ret = cssSelectorParser.attribute(opts);
    ret.quoteMark = ret.smartQuoteMark({ quoteMark: "'" });
    return ret;
  }

  export function className(className: string): SelClassName {
    return cssSelectorParser.className({ value: className });
  }

  export function combinator(combinator: string): SelCombinator {
    return cssSelectorParser.combinator({ value: combinator });
  }

  export function comment(comment: string): SelComment {
    return cssSelectorParser.comment({ value: `/*${comment}*/` });
  }

  export function id(id: string): SelIdentifier {
    return cssSelectorParser.id({ value: id });
  }

  export function nesting(): SelNesting {
    return cssSelectorParser.nesting();
  }

  export function pseudoClass(pseudoClass: string, nodes?: SelSelector[]): SelPseudo {
    const opts: SelContainerOptions = { value: pseudoClass.startsWith(':') ? pseudoClass : `:${pseudoClass}` };
    if (nodes)
      opts.nodes = nodes;
    return cssSelectorParser.pseudo(opts);
  }

  export function pseudoElement(pseudoElement: string): SelPseudo {
    return cssSelectorParser.pseudo({ value: pseudoElement.startsWith(':') ? pseudoElement : `::${pseudoElement}` });
  }

  export function root(nodes?: SelSelector[]): SelRoot {
    const opts: SelContainerOptions = { value: "" };
    if (nodes)
      opts.nodes = nodes;
    return cssSelectorParser.root(opts);
  }

  export function selector(nodes?: SelNode[]): SelSelector {
    const opts: SelContainerOptions = { value: "" };
    if (nodes)
      opts.nodes = nodes;
    return cssSelectorParser.selector(opts);
  }

  export function string(str: string): SelString {
    return cssSelectorParser.string({ value: str });
  }

  export function tag(tag: string): SelTag {
    return cssSelectorParser.tag({ value: tag });
  }

  export function universal(): SelUniversal {
    return cssSelectorParser.universal();
  }
}