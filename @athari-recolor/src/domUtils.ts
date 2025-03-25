import * as htmlParser from 'htmlparser2';
import * as htmlDom from 'domhandler';
import * as htmlDomUtils from 'domutils';
import * as htmlCssSelect from 'css-select';

import * as postCss from 'postcss';
import cssParserSafe from 'postcss-safe-parser';
import cssSelParser from 'postcss-selector-parser';

import * as cssCt from '@csstools/css-tokenizer';
import * as cssCn from '@csstools/css-parser-algorithms';
import * as cssSelSpec from '@csstools/selector-specificity';

import assert from 'node:assert/strict';
import { DeepRequired } from 'utility-types';
import {
  Assigned, Guard, GuardAny, Opt, MostSpecific,
  deepMerge, isAssigned, isArray, isSome, isUndefined, logError, throwError,
  isString as isStringPrimitive,
  isNumber as isNumberPrimitive,
} from './utils.ts';

// MARK: Html

// Html: Declarations

declare module 'domhandler' {
  interface CompiledQuery<T> {
    (node: T): boolean;
    shouldTestNextSiblings?: boolean;
  }

  type Query<T extends Element> = string | CompiledQuery<T> | import('css-what').Selector[][];

  interface Element { }

  interface Node {
    querySelector(this: Node, selector: Query<Element>): Element | null;
    querySelectorAll(this: Node, selector: Query<Element>): Element[];
    matches(this: Node, selector: Query<Element>): boolean;
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
  export type Query<T extends Element> = Parameters<typeof htmlCssSelect.selectOne<NodeBase, T>>[0];
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

  export function querySelector(node: NodeBase, selector: Query<Element>): Element | null {
    return htmlCssSelect.selectOne<NodeBase, Element>(selector, node);
  }

  export function querySelectorAll(node: NodeBase, selector: Query<Element>): Element[] {
    return htmlCssSelect.selectAll<NodeBase, Element>(selector, node);
  }

  export function matches(node: Element, selector: Query<Element>): boolean {
    return htmlCssSelect.is<NodeBase, Element>(node, selector);
  }

  export function compileQuery(selector: SimpleSelector): CompiledQuery<Element> {
    return htmlCssSelect.compile<NodeBase, Element>(selector);
  }

  // Html: Prototype

  export function extendPrototype() {
    Object.assign(NodeBase.prototype, {
      querySelector(this: NodeBase, selector: Query<Element>) { return querySelector(this, selector) },
      querySelectorAll(this: NodeBase, selector: Query<Element>) { return querySelectorAll(this, selector) },
      matches(this: NodeBase, selector: Query<Element>): boolean { return isElement(this) && matches(this, selector) },
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
  export type Processors = ReturnType<Assigned<Plugin['prepare']>>;
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

  function parseNode<T extends Node>(guard: GuardAny<T>): (css: string) => T {
    return css => {
      const node = parseRoot(css).nodes.single();
      assert(guard(node));
      return node;
    };
  }

  function parseNodes<T extends Node>(guard?: GuardAny<T>): (css: string) => T[] {
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

  // Ct: Types

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

  export type Raw = Space | Comment;

  export import ParseError = cssCt.ParseError;
  export import ParseErrorWithToken = cssCt.ParseErrorWithToken;
  export import HashType = cssCt.HashType;
  export import NumberType = cssCt.NumberType;
  export import Type = cssCt.TokenType;

  export type ParseErrorCallback = (error: ParseError) => void;

  export type WithAnyValue = AtKeyword | Delim | Function | Hash | Ident | Dimension | Number | Percentage | String | Url;
  export type ValueType = string | number;
  export type WithValue<T extends WithAnyValue, V extends ValueType> = T & { [4]: { value: V } };

  export type WithAnyType = Dimension | Hash | Number;
  export type TypeType = NumberType | HashType;
  export type WithType<T extends WithAnyType, V extends TypeType> = T & { [4]: { type: V } };

  export type UnitType = string;
  export type WithUnit<V extends UnitType> = Dimension & { [4]: { unit: V } };

  export type IdentOf<T extends Token> = T extends TokenT<infer U, any> ? U : never;
  export type ValueOf<T extends WithAnyValue> = T[4]['value'];
  export type TypeOf<T extends WithAnyType> = T[4]['type'];

  // Ct: Guards

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
  export import isRaw = cssCt.isTokenWhiteSpaceOrComment;
  export import isSpace = cssCt.isTokenWhitespace;

  type CtGuard<T extends Token> = Guard<Token, T>;

  const keywordComparer = Intl.Collator('en-US', { usage: 'search', sensitivity: 'variant', ignorePunctuation: false });

  export function keywordEquals<A extends Opt<string>, B extends string>(a: A, b: B): a is MostSpecific<A, B> {
    return isAssigned(a) && isAssigned(b) && !keywordComparer.compare(a, b);
  }

  export function keywordEqualsOneOf<A extends Opt<string>, B extends string>(a: A, b: readonly B[]): a is MostSpecific<A, B> {
    return b.some(v => keywordEquals(a, v));
  }

  export function isTokenValue<T extends WithAnyValue, V extends ValueType>(g: CtGuard<T>, value: readonly V[] | V, ct: Token): ct is WithValue<T, V>;
  export function isTokenValue<T extends WithAnyValue, V extends ValueType>(g: CtGuard<T>, value: readonly V[] | V): CtGuard<WithValue<T, V>>;
  export function isTokenValue<T extends WithAnyValue, V extends ValueType>(g: CtGuard<T>, value: readonly V[] | V, ct: Token | null = null): any {
    const guard = (ct: Token) => g(ct) &&
      (isStringPrimitive(ct[4].value)
        ? (isStringPrimitive(value) ? keywordEquals(ct[4].value, value) : keywordEqualsOneOf(ct[4].value, value as readonly string[]))
        : (isNumberPrimitive(value) ? ct[4].value === value : (value as readonly number[]).includes(ct[4].value)));
    return ct === null ? guard : guard(ct);
  }

  export function isIdentValue<V extends string>(value: readonly V[] | V, ct: Token): ct is WithValue<Ident, V>;
  export function isIdentValue<V extends string>(value: readonly V[] | V): CtGuard<WithValue<Ident, V>>;
  export function isIdentValue<V extends string>(value: readonly V[] | V, ct: Token | null = null): any {
    const guard = (ct: Token) => isIdent(ct) && (isStringPrimitive(value) ? keywordEquals(ct[4].value, value) : keywordEqualsOneOf(ct[4].value, value));
    return ct === null ? guard : guard(ct);
  }

  export function isDimensionUnit<U extends string>(value: readonly U[] | U, ct: Token): ct is WithUnit<U>;
  export function isDimensionUnit<U extends string>(value: readonly U[] | U): CtGuard<WithUnit<U>>;
  export function isDimensionUnit<U extends string>(value: readonly U[] | U, ct: Token | null = null): any {
    const guard = (ct: Token) => isDimension(ct) && (isStringPrimitive(value) ? keywordEquals(ct[4].unit, value) : keywordEqualsOneOf(ct[4].unit, value));
    return ct === null ? guard : guard(ct);
  }

  // Ct: Parse

  export interface Parser {
    readonly lastError: Opt<ParseError | ParseErrorWithToken>;
    readonly lastErrorToken: Opt<Token>;
    onParseError?: Opt<ParseErrorCallback>;
    peek(): Token;
    consume(): Token;
    consumeSpace(): Raw[];
    consumeWithSpace(): { ct: Token; raws: Raw[] };
    isEof(): boolean;
  }

  export function parser(css: string, unicodeRangesAllowed?: Opt<boolean>): Parser {
    let nextToken: Opt<Token>;
    let lastError: Opt<ParseError>;

    const tokenizer = cssCt.tokenizer({
      css,
      unicodeRangesAllowed: unicodeRangesAllowed ?? false,
    }, {
      onParseError(error: ParseError) {
        lastError = error;
        parser.onParseError?.(error);
      }
    });

    const parser = new class CtParser {
      get lastError() {
        return lastError;
      }
      get lastErrorToken() {
        return lastError instanceof ParseErrorWithToken ? lastError.token : undefined;
      }
      onParseError: Opt<ParseErrorCallback>;
      peek() {
        lastError = undefined;
        return nextToken ??= tokenizer.nextToken();
      }
      consume() {
        if (nextToken) {
          const currentToken = nextToken;
          nextToken = undefined;
          return currentToken;
        } else {
          lastError = undefined;
          nextToken = undefined;
          return tokenizer.nextToken();
        }
      }
      consumeSpace() {
        const spaceTokens: Raw[] = [];
        while (isRaw(this.peek()))
          spaceTokens.push(this.consume() as Raw);
        return spaceTokens;
      }
      consumeWithSpace() {
        return { ct: this.consume(), raws: this.consumeSpace() };
      }
      isEof() {
        return !nextToken && tokenizer.endOfFile();
      }
    };

    return parser;
  }

  export function parse(css: string): Ct.Token[] {
    return cssCt.tokenize({ css });
  }

  export function stringify(tokens: Ct.Token[]): string {
    return cssCt.stringify(...tokens);
  }

  // Ct: Mutate

  export import setIdent = cssCt.mutateIdent;
  export import setDimensionUnit = cssCt.mutateUnit;
}

// MARK: Cn

export namespace Cn {

  // Cn: Types

  export import Comment = cssCn.CommentNode;
  export import ContainerBase = cssCn.ContainerNodeBaseClass; // function|block
  export import Function = cssCn.FunctionNode;
  export import Block = cssCn.SimpleBlockNode;
  export import Token = cssCn.TokenNode;
  export import Space = cssCn.WhitespaceNode;

  export type Node = cssCn.ComponentValue;
  export type Container = cssCn.ContainerNode;
  export type Type = cssCn.ComponentValueType;

  // Cn: Guards

  export import isComment = cssCn.isCommentNode;
  export import isFunction = cssCn.isFunctionNode;
  export import isBlock = cssCn.isSimpleBlockNode;
  export import isTokenAny = cssCn.isTokenNode;
  export import isSpaceOrComment = cssCn.isWhiteSpaceOrCommentNode;
  export import isSpace = cssCn.isWhitespaceNode;

  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T, node: Node
  ): node is Token & { value: T };
  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T
  ): (node: Node) => node is Token & { value: T };
  export function isToken<T extends Ct.Token>(
    isTokenType: (x: Ct.Token) => x is T, node?: Node
  ): any {
    const guard = (node: Node) => isTokenAny(node) && isTokenType(node.value);
    return isUndefined(node) ? guard : guard(node);
  }

  export function isTokenValue<T extends Ct.WithAnyValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue, node: Node
  ): node is Token & { value: T & { [4]: { value: TValue } } };
  export function isTokenValue<T extends Ct.WithAnyValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue
  ): (node: Node) => node is Token & { value: T & { [4]: { value: TValue } } };
  export function isTokenValue<T extends Ct.WithAnyValue, TValue extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, value: TValue, node?: Node
  ): any {
    const guard = (node: Node) => isTokenAny(node) && isTokenType(node.value) && node.value[4].value === value;
    return isUndefined(node) ? guard : guard(node);
  }

  export function isTokenType<T extends Ct.WithAnyType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType, node: Node
  ): node is Token & { value: T & { [4]: { type: TType } } };
  export function isTokenType<T extends Ct.WithAnyType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType
  ): (node: Node) => node is Token & { value: T & { [4]: { type: TType } } };
  export function isTokenType<T extends Ct.WithAnyType, TType extends Ct.ValueType>(
    isTokenType: (x: Ct.Token) => x is T, type: TType, node?: Node
  ): any {
    const guard = (node: Node) => isTokenAny(node) && isTokenType(node.value) && node.value[4].type === type;
    return isUndefined(node) ? guard : guard(node);
  }

  // Cn: Parse

  function toTokens(source: string | Ct.Token[]): Ct.Token[] {
    return isArray(source) ? source : Ct.parse(source);
  }

  function onParseError(ex: cssCt.ParseError): void {
    logError(ex, "Failed to parse CSS node");
  }

  export function parse(source: string | Ct.Token[]): Node {
    return cssCn.parseComponentValue(toTokens(source), { onParseError }) ?? throwError("Failed to parse CSS node");
  }

  export function parseCommaList(source: string | Ct.Token[]): Node[][] {
    return cssCn.parseCommaSeparatedListOfComponentValues(toTokens(source), { onParseError });
  }

  export function parseList(source: string | Ct.Token[]): Node[] {
    return cssCn.parseListOfComponentValues(toTokens(source), { onParseError });
  }

  export function stringify(node: Node): string {
    return cssCt.stringify(...node.tokens());
  }

  export import stringifyList = cssCn.stringify;

  // Cn: Modify

  export import forEach = cssCn.forEach;
  export import gatherParents = cssCn.gatherNodeAncestry;
  export import replaceList = cssCn.replaceComponentValues;
  export import walk = cssCn.walk;

  export function getValue<T extends Ct.Type, U, C extends Ct.TokenT<T, U> & Ct.WithAnyValue>(cn: Token & { value: C }): C[4]['value'] {
    return cn.value[4].value;
  }

  export function getType<T extends Ct.Type, U, C extends Ct.TokenT<T, U> & Ct.WithAnyType>(cn: Token & { value: C }): C[4]['type'] {
    return cn.value[4].type;
  }
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