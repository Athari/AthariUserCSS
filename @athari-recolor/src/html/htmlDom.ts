import * as htmlParser from 'htmlparser2';
import * as htmlDom from 'domhandler';
import * as htmlDomUtils from 'domutils';
import * as htmlCssSelect from 'css-select';

// MARK: Declarations

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

// MARK: Types

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

// MARK: Guards

export import isCData = htmlDom.isCDATA;
export import isComment = htmlDom.isComment;
export import isDirective = htmlDom.isDirective;
export import isDocument = htmlDom.isDocument;
export import isElement = htmlDom.isTag;
export import isText = htmlDom.isText;

export import hasChildren = htmlDom.hasChildren;

// MARK: Clone

export import clone = htmlDom.cloneNode;

// MARK: Parse

export import parseDocument = htmlParser.parseDocument;

// MARK: Utils

export import getInnerTextAll = htmlDomUtils.textContent;
export import getInnerText = htmlDomUtils.innerText;

// MARK: Query

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

// MARK: Prototype

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