import cssSelParser from 'postcss-selector-parser';
import * as cssSelSpec from '@csstools/selector-specificity';
import * as Css from './cssDom.ts';
import { Assigned } from '../utils.ts';

// MARK: Types

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

// MARK: Guards

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

// MARK: Parse

export import parser = cssSelParser;

export function parseRoot(selectors: string | Css.Rule, opts?: ParseOptions): Root {
  return cssSelParser().astSync(selectors, Object.assign(<ParseOptions>{ lossless: false }, opts));
}

export function parseSelector(selector: string | Css.Rule, opts?: ParseOptions): Selector {
  return parseRoot(selector, opts).nodes.single();
}

// MARK: Compare

export function areEqual(a: Node, b: Node): boolean {
  return a.toString() === b.toString();
}

export function areHeadersEqual(a: Node, b: Node): boolean {
  return cloneHeader(a).toString() === cloneHeader(b).toString();
}

// MARK: Clone

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

// MARK: Create

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

// MARK: Specificity

export import getSpecificity = cssSelSpec.selectorSpecificity;
export import compareSpecificity = cssSelSpec.compare;

export type Specificity = cssSelSpec.Specificity;