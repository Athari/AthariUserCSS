import * as htmlParser from 'htmlparser2';
import * as htmlDom from 'domhandler';
import * as htmlDomUtils from 'domutils';
import * as htmlCssSelect from 'css-select';

import * as postCss from 'postcss';
import cssParserSafe from 'postcss-safe-parser';
import cssSelParser from 'postcss-selector-parser';

import * as cssCt from '@csstools/css-tokenizer';
import * as cssComp from '@csstools/css-parser-algorithms';
import * as cssSelSpec from '@csstools/selector-specificity';

import assert from 'node:assert/strict';
import { DeepRequired, NonUndefined } from 'utility-types';
import {
  Assigned, Guard,
  deepMerge, isArray, isSome, isUndefined, logError, throwError,
} from './utils.ts';

// MARK: Html

// Html: Declarations

declare module 'domhandler' {
  type Element_ = htmlDom.Element;
  interface Node {
    querySelector(this: Node, selector: string): Element_ | null;
    querySelectorAll(this: Node, selector: string): Element_[];
    matches(this: Node, selector: string): boolean;
    readonly innerText: string;
    readonly innerTextAll: string;
  }
}

export namespace Html {

  // Html: Types

  export import CData = htmlDom.CDATA;
  export import Comment = htmlDom.Comment;
  export import DataNode = htmlDom.DataNode; // text|comment|instruction
  export import Document = htmlDom.Document;
  export import Element = htmlDom.Element;
  export import NodeBase = htmlDom.Node;
  export import Container = htmlDom.NodeWithChildren; // document|element|cdata
  export import Directive = htmlDom.ProcessingInstruction;
  export import Text = htmlDom.Text;

  export type Node = htmlDom.AnyNode;
  export type ChildNode = htmlDom.ChildNode;
  export type ParentNode = htmlDom.ParentNode;

  export type CompiledQuery<T extends Element> = ReturnType<typeof htmlCssSelect.compile<NodeBase, T>>;
  export type Selector<T extends Element> = Parameters<typeof htmlCssSelect.selectOne<NodeBase, T>>[0];
  export type SimpleSelector = Parameters<typeof htmlCssSelect.compile<NodeBase, Element>>[0];

  // Html: Guards

  export import isCData = htmlDom.isCDATA;
  export import isComment = htmlDom.isComment;
  export import isDirective = htmlDom.isDirective;
  export import isDocument = htmlDom.isDocument;
  export import isElement = htmlDom.isTag;
  export import isText = htmlDom.isText;

  export import hasChildren = htmlDom.hasChildren;

  // Html: Clone

  export import clone = htmlDom.cloneNode;

  // Html: Parse

  export import parseDocument = htmlParser.parseDocument;

  // Html: Utils

  export import getInnerTextAll = htmlDomUtils.textContent;
  export import getInnerText = htmlDomUtils.innerText;

  // Html: Query

  export function querySelector<T extends Element>(node: NodeBase, selector: Selector<T>): T | null {
    return htmlCssSelect.selectOne<NodeBase, T>(selector, node);
  }

  export function querySelectorAll<T extends Element>(node: NodeBase, selector: Selector<T>): T[] {
    return htmlCssSelect.selectAll<NodeBase, T>(selector, node);
  }

  export function matches<T extends Element>(node: T, selector: Selector<T>): boolean {
    return htmlCssSelect.is<NodeBase, T>(node, selector);
  }

  export function compileQuery<T extends Element>(selector: SimpleSelector): CompiledQuery<T> {
    return htmlCssSelect.compile<NodeBase, T>(selector);
  }

  // Html: Prototype

  export function extendPrototype() {
    Object.assign(NodeBase.prototype, {
      querySelector(this: NodeBase, selector: string) { return querySelector(this, selector) },
      querySelectorAll(this: NodeBase, selector: string) { return querySelectorAll(this, selector) },
      matches(this: NodeBase, selector: string): boolean { return isElement(this) && matches<Element>(this, selector) },
    });
    Object.defineProperties(NodeBase.prototype, {
      innerText: { get: function (this: NodeBase) { return getInnerText(this as Node) } },
      innerTextAll: { get: function (this: NodeBase) { return getInnerTextAll(this as Node) } },
    });
  }
}

// MARK: PostCss

export namespace PostCss {

  // PostCss: Types

  export import Processor = postCss.Processor;
  export import Result = postCss.Result;
  export import Warning = postCss.Warning;

  export type Plugin = postCss.Plugin;
  export type Processors = ReturnType<NonUndefined<Plugin['prepare']>>;
  export type PluginCreate<O> = ((opts?: O) => Plugin) & { postcss: true };

  // PostCss: Plugins

  export function declarePlugin<O>(
    name: string,
    defaultOpts: DeepRequired<O>,
    processors: (opts: DeepRequired<O>) => Processors,
  ): PluginCreate<O> {
    return Object.assign(
      (opts?: O): Plugin => ({
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

  export function declarePluginOpt<O>(
    name: string,
    defaultOptions: O,
    processors: (opts: O) => Processors,
  ): PluginCreate<O> {
    return Object.assign(
      (opts?: O): Plugin => ({
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
}

// MARK: Css

export namespace Css {

  // Css: Types

  export import AtRule = postCss.AtRule;
  export import Comment = postCss.Comment;
  export import Container = postCss.Container;
  export import Decl = postCss.Declaration;
  export import Document = postCss.Document;
  export import NodeBase = postCss.Node;
  export import Root = postCss.Root;
  export import Rule = postCss.Rule;

  export type Node = postCss.AnyNode;
  export type ChildNode = postCss.ChildNode;

  export type NodeNames = Node['type'];
  export type ChildNodeNames = ChildNode['type'];

  export type NodeTypes = {
    [K in NodeNames]: Extract<Node, { type: K }>;
  };

  // Css: Guards

  export const isAtRule = (n: unknown): n is AtRule => n instanceof AtRule;
  export const isComment = (n: unknown): n is Comment => n instanceof Comment;
  export const isContainer = (n: unknown): n is Container => n instanceof Container;
  export const isDecl = (n: unknown): n is Decl => n instanceof Decl;
  export const isDocument = (n: unknown): n is Document => n instanceof Document;
  export const isNode = (n: unknown): n is Node => n instanceof NodeBase;
  export const isRoot = (n: unknown): n is Root => n instanceof Root;
  export const isRule = (n: unknown): n is Rule => n instanceof Rule;
  export const isChildNode = isSome(isAtRule, isComment, isDecl, isRule);

  // Css: Parse

  function parseNode<T extends Node>(guard: Guard<T>): (css: string) => T {
    return css => {
      const node = parseRoot(css).nodes.single();
      assert(guard(node));
      return node;
    };
  }

  function parseNodes<T extends Node>(guard?: Guard<T>): (css: string) => T[] {
    return css => parseRoot(css).nodes
      .map(node => {
        assert(guard?.(node));
        return node;
      });
  }

  export const parseRoot = (css: string) => cssParserSafe(css);
  export const parseRule = parseNode(isRule);
  export const parseAtRule = parseNode(isRule);
  export const parseComment = parseNode(isComment);

  export function parseDecl(css: string): Decl {
    const rule = parseRule(`*{${css}}`);
    const node = rule.nodes.single();
    assert(isDecl(node));
    return node;
  }

  export const parseChildNodes = parseNodes(isChildNode);
  export const parseRules = parseNodes(isRule);
  export const parseAtRules = parseNodes(isRule);
  export const parseComments = parseNodes(isComment);

  export function parseDecls(css: string): Decl[] {
    return parseRule(`*{${css}}`).nodes.map(node => {
      assert(isDecl(node));
      return node;
    });
  }
}

// MARK: Ct

export namespace Ct {

  // Tok: Types

  export type Token = cssCt.CSSToken;
  export type NumericToken = cssCt.NumericToken;
  export type TokenT<T extends Type, U> = cssCt.Token<T, U>;
  export type AtKeyword = cssCt.TokenAtKeyword;
  export type BadString = cssCt.TokenBadString;
  export type BadUrl = cssCt.TokenBadURL;
  export type CDC = cssCt.TokenCDC;
  export type CDO = cssCt.TokenCDO;
  export type CloseCurly = cssCt.TokenCloseCurly;
  export type CloseParen = cssCt.TokenCloseParen;
  export type CloseSquare = cssCt.TokenCloseSquare;
  export type Colon = cssCt.TokenColon;
  export type Comma = cssCt.TokenComma;
  export type Comment = cssCt.TokenComment;
  export type Delim = cssCt.TokenDelim;
  export type Dimension = cssCt.TokenDimension;
  export type Eof = cssCt.TokenEOF;
  export type Function = cssCt.TokenFunction;
  export type Hash = cssCt.TokenHash;
  export type Ident = cssCt.TokenIdent;
  export type Number = cssCt.TokenNumber;
  export type OpenCurly = cssCt.TokenOpenCurly;
  export type OpenParen = cssCt.TokenOpenParen;
  export type OpenSquare = cssCt.TokenOpenSquare;
  export type Percentage = cssCt.TokenPercentage;
  export type Semicolon = cssCt.TokenSemicolon;
  export type String = cssCt.TokenString;
  export type Url = cssCt.TokenURL;
  export type UnicodeRange = cssCt.TokenUnicodeRange;
  export type Space = cssCt.TokenWhitespace;

  export import HashType = cssCt.HashType;
  export import NumberType = cssCt.NumberType;
  export import Type = cssCt.TokenType;

  export type WithValue = AtKeyword | Delim | Function | Hash | Ident | Dimension | Number | Percentage | String | Url;
  export type ValueType = string | number;

  export type WithType = Dimension | Hash | Number;
  export type TypeType = NumberType | HashType;

  // Tok: Guards

  export import isToken = cssCt.isToken;
  export import isAtKeyword = cssCt.isTokenAtKeyword;
  export import isBadString = cssCt.isTokenBadString;
  export import isBadUrl = cssCt.isTokenBadURL;
  export import isCDC = cssCt.isTokenCDC;
  export import isCDO = cssCt.isTokenCDO;
  export import isCloseCurly = cssCt.isTokenCloseCurly;
  export import isCloseParen = cssCt.isTokenCloseParen;
  export import isCloseSquare = cssCt.isTokenCloseSquare;
  export import isColon = cssCt.isTokenColon;
  export import isComma = cssCt.isTokenComma;
  export import isComment = cssCt.isTokenComment;
  export import isDelim = cssCt.isTokenDelim;
  export import isDimension = cssCt.isTokenDimension;
  export import isEOF = cssCt.isTokenEOF;
  export import isFunction = cssCt.isTokenFunction;
  export import isHash = cssCt.isTokenHash;
  export import isIdent = cssCt.isTokenIdent;
  export import isNumber = cssCt.isTokenNumber;
  export import isNumeric = cssCt.isTokenNumeric;
  export import isOpenCurly = cssCt.isTokenOpenCurly;
  export import isOpenParen = cssCt.isTokenOpenParen;
  export import isOpenSquare = cssCt.isTokenOpenSquare;
  export import isPercentage = cssCt.isTokenPercentage;
  export import isSemicolon = cssCt.isTokenSemicolon;
  export import isString = cssCt.isTokenString;
  export import isUrl = cssCt.isTokenURL;
  export import isUnicodeRange = cssCt.isTokenUnicodeRange;
  export import isSpaceOrComment = cssCt.isTokenWhiteSpaceOrComment;
  export import isSpace = cssCt.isTokenWhitespace;

  // Tok: Parse

  export function parse(css: string): Ct.Token[] {
    return cssCt.tokenize({ css });
  }

  export function stringify(tokens: Ct.Token[]): string {
    return cssCt.stringify(...tokens);
  }
}

// MARK: Comp

export namespace Cc {

  // Comp: Types

  export import Comment = cssComp.CommentNode;
  export import ContainerBase = cssComp.ContainerNodeBaseClass;
  export import Function = cssComp.FunctionNode;
  export import Block = cssComp.SimpleBlockNode;
  export import Token = cssComp.TokenNode;
  export import Space = cssComp.WhitespaceNode;

  export type Comp = cssComp.ComponentValue;
  export type Container = cssComp.ContainerNode;
  export type Type = cssComp.ComponentValueType;

  // Comp: Guards

  export import isComment = cssComp.isCommentNode;
  export import isFunction = cssComp.isFunctionNode;
  export import isBlock = cssComp.isSimpleBlockNode;
  export import isTokenAny = cssComp.isTokenNode;
  export import isSpaceOrComment = cssComp.isWhiteSpaceOrCommentNode;
  export import isSpace = cssComp.isWhitespaceNode;

  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T, comp: Comp
  ): comp is Token & { value: T };
  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T
  ): (comp: Comp) => comp is Token & { value: T };
  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T, comp?: Comp
  ): any {
    const guard = (comp: Comp) => isTokenAny(comp) && isTokenType(comp.value);
    return isUndefined(comp) ? guard : guard(comp);
  }

  export function isTokenValue<T extends Ct.WithValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue, comp: Comp
  ): comp is Token & { value: T & { [4]: { value: TValue } } };
  export function isTokenValue<T extends Ct.WithValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue
  ): (comp: Comp) => comp is Token & { value: T & { [4]: { value: TValue } } };
  export function isTokenValue<T extends Ct.WithValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue, comp?: Comp
  ): any {
    const guard = (comp: Comp) => isTokenAny(comp) && isTokenType(comp.value) && comp.value[4].value === value;
    return isUndefined(comp) ? guard : guard(comp);
  }

  export function isTokenType<T extends Ct.WithType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType, comp: Comp
  ): comp is Token & { value: T & { [4]: { type: TType } } };
  export function isTokenType<T extends Ct.WithType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType
  ): (comp: Comp) => comp is Token & { value: T & { [4]: { type: TType } } };
  export function isTokenType<T extends Ct.WithType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType, comp?: Comp
  ): any {
    const guard = (comp: Comp) => isTokenAny(comp) && isTokenType(comp.value) && comp.value[4].type === type;
    return isUndefined(comp) ? guard : guard(comp);
  }

  // Comp: Parse

  function toTokens(source: string | Ct.Token[]): Ct.Token[] {
    return isArray(source) ? source : Ct.parse(source);
  }

  function onParseError(ex: cssCt.ParseError): void {
    logError(ex, "Failed to parse CSS component");
  }

  export function parse(source: string | Ct.Token[]): Comp {
    return cssComp.parseComponentValue(toTokens(source), { onParseError }) ?? throwError("Failed to parse CSS comp");
  }

  export function parseCommaList(source: string | Ct.Token[]): Comp[][] {
    return cssComp.parseCommaSeparatedListOfComponentValues(toTokens(source), { onParseError });
  }

  export function parseList(source: string | Ct.Token[]): Comp[] {
    return cssComp.parseListOfComponentValues(toTokens(source), { onParseError });
  }

  export function stringify(node: Comp): string {
    return cssCt.stringify(...node.tokens());
  }

  export import stringifyList = cssComp.stringify;

  export import forEach = cssComp.forEach;
  export import gatherParents = cssComp.gatherNodeAncestry;
  export import replaceList = cssComp.replaceComponentValues;
  export import walk = cssComp.walk;
}

// MARK: Sel

export namespace Sel {

  // Sel: Types

  export type AsyncProcessor = cssSelParser.AsyncProcessor;
  export type Attribute = cssSelParser.Attribute;
  export type AttributeOperator = cssSelParser.AttributeOperator;
  export type AttributeOptions = cssSelParser.AttributeOptions;
  export type Base = cssSelParser.Base;
  export type Class = cssSelParser.ClassName;
  export type Combinator = cssSelParser.Combinator;
  export type CombinatorRaws = cssSelParser.CombinatorRaws;
  export type Comment = cssSelParser.Comment;
  export type ContainerBase = cssSelParser.Container;
  export type ContainerOptions = cssSelParser.ContainerOptions;
  export type ErrorOptions = cssSelParser.ErrorOptions;
  export type Identifier = cssSelParser.Identifier;
  export type Namespace = cssSelParser.Namespace;
  export type NamespaceOptions = cssSelParser.NamespaceOptions;
  export type Nesting = cssSelParser.Nesting;
  export type Node = cssSelParser.Node;
  export type NodeOptions = cssSelParser.NodeOptions;
  export type NodeSource = cssSelParser.NodeSource;
  export type NodeTypes = cssSelParser.NodeTypes;
  export type Options = cssSelParser.Options;
  export type ParserOptions = cssSelParser.ParserOptions;
  export type PreferredQuoteMarkOptions = cssSelParser.PreferredQuoteMarkOptions;
  export type Pseudo = cssSelParser.Pseudo;
  export type Root = cssSelParser.Root;
  export type Selector = cssSelParser.Selector;
  export type SmartQuoteMarkOptions = cssSelParser.SmartQuoteMarkOptions;
  export type SpaceAround = cssSelParser.SpaceAround;
  export type Spaces = cssSelParser.Spaces;
  export type String = cssSelParser.String;
  export type Tag = cssSelParser.Tag;
  export type Universal = cssSelParser.Universal;

  export type Container = Root | Selector | Pseudo;
  export type NodeNames = keyof NodeTypes;
  export type ParseOptions = Assigned<Parameters<ReturnType<typeof cssSelParser>['astSync']>[1]>;

  // Sel: Guards

  export import isAttribute = cssSelParser.isAttribute;
  export import isClass = cssSelParser.isClassName;
  export import isCombinator = cssSelParser.isCombinator;
  export import isComment = cssSelParser.isComment;
  export import isContainer = cssSelParser.isContainer;
  export import isIdentifier = cssSelParser.isIdentifier;
  export import isNamespace = cssSelParser.isNamespace;
  export import isNesting = cssSelParser.isNesting;
  export import isNode = cssSelParser.isNode;
  export import isPseudo = cssSelParser.isPseudo;
  export import isPseudoClass = cssSelParser.isPseudoClass;
  export import isPseudoElement = cssSelParser.isPseudoElement;
  export import isRoot = cssSelParser.isRoot;
  export import isSelector = cssSelParser.isSelector;
  export import isString = cssSelParser.isString;
  export import isTag = cssSelParser.isTag;
  export import isUniversal = cssSelParser.isUniversal;

  // Sel: Parse

  export import parser = cssSelParser;

  export function parseRoot(selectors: string | Css.Rule, opts?: ParseOptions): Root {
    return cssSelParser().astSync(selectors, Object.assign(<ParseOptions>{ lossless: false }, opts));
  }

  export function parseSelector(selector: string | Css.Rule, opts?: ParseOptions): Selector {
    return parseRoot(selector, opts).nodes.single();
  }

  // Sel: Compare

  export function areEqual(a: Node, b: Node): boolean {
    return a.toString() === b.toString();
  }

  export function areHeadersEqual(a: Node, b: Node): boolean {
    return cloneHeader(a).toString() === cloneHeader(b).toString();
  }

  // Sel: Clone

  export function clone<T extends Node>(node: T): T {
    return node.clone() as T;
  }

  export function cloneHeader<T extends Node>(node: T): T {
    if (isRoot(node))
      return root() as T;
    if (isSelector(node))
      return selector() as T;
    if (isPseudoClass(node))
      return pseudoClass(node.value) as T;
    return clone(node);
  }

  // Sel: Create

  export function attribute(attribute: string, operator?: AttributeOperator, value?: string, insensitive?: boolean): Attribute {
    const opts: AttributeOptions = {
      attribute, value, quoteMark: null,
      insensitive: insensitive ?? false,
      raws: {},
    };
    if (operator !== undefined)
      opts.operator = operator;
    const ret = cssSelParser.attribute(opts);
    ret.quoteMark = ret.smartQuoteMark({ quoteMark: "'" });
    return ret;
  }

  export function className(className: string): Class {
    return cssSelParser.className({ value: className });
  }

  export function combinator(combinator: string): Combinator {
    return cssSelParser.combinator({ value: combinator });
  }

  export function comment(comment: string): Comment {
    return cssSelParser.comment({ value: `/*${comment}*/` });
  }

  export function id(id: string): Identifier {
    return cssSelParser.id({ value: id });
  }

  export function nesting(): Nesting {
    return cssSelParser.nesting();
  }

  export function pseudoClass(pseudoClass: string, nodes?: Selector[]): Pseudo {
    const opts: ContainerOptions = { value: pseudoClass.startsWith(':') ? pseudoClass : `:${pseudoClass}` };
    if (nodes)
      opts.nodes = nodes;
    return cssSelParser.pseudo(opts);
  }

  export function pseudoElement(pseudoElement: string): Pseudo {
    return cssSelParser.pseudo({ value: pseudoElement.startsWith(':') ? pseudoElement : `::${pseudoElement}` });
  }

  export function root(nodes?: Selector[]): Root {
    const opts: ContainerOptions = { value: "" };
    if (nodes)
      opts.nodes = nodes;
    return cssSelParser.root(opts);
  }

  export function selector(nodes?: Node[]): Selector {
    const opts: ContainerOptions = { value: "" };
    if (nodes)
      opts.nodes = nodes;
    return cssSelParser.selector(opts);
  }

  export function string(str: string): String {
    return cssSelParser.string({ value: str });
  }

  export function tag(tag: string): Tag {
    return cssSelParser.tag({ value: tag });
  }

  export function universal(): Universal {
    return cssSelParser.universal();
  }

  // Sel: Specificity

  export import getSpecificity = cssSelSpec.selectorSpecificity;
  export import compareSpecificity = cssSelSpec.compare;

  export type Specificity = cssSelSpec.Specificity;
}