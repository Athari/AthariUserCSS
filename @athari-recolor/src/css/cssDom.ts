import assert from 'node:assert/strict';
import * as postCss from 'postcss';
import cssParserSafe from 'postcss-safe-parser';
import { Guard, isSome } from '../utils.ts';

export namespace Css {

  // MARK: Types

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

  // MARK: Types (extended)

  export type NodeNames = Node['type'];
  export type ChildNodeNames = ChildNode['type'];

  export type NodeTypes = {
    [K in NodeNames]: Extract<Node, { type: K }>;
  };

  // MARK: Guards

  export const isAtRule = (n: unknown): n is AtRule => n instanceof AtRule;
  export const isComment = (n: unknown): n is Comment => n instanceof Comment;
  export const isContainer = (n: unknown): n is Container => n instanceof Container;
  export const isDecl = (n: unknown): n is Decl => n instanceof Decl;
  export const isDocument = (n: unknown): n is Document => n instanceof Document;
  export const isNode = (n: unknown): n is Node => n instanceof NodeBase;
  export const isRoot = (n: unknown): n is Root => n instanceof Root;
  export const isRule = (n: unknown): n is Rule => n instanceof Rule;

  // MARK: Guards (extended)

  export const isChildNode = isSome(isAtRule, isComment, isDecl, isRule);

  // MARK: Parse

  export const parseRoot = (css: string) => cssParserSafe(css);

  // MARK: Parse (extended)

  function parseNode<T extends Node>(guard: Guard<unknown, T>): (css: string) => T {
    return css => {
      const node = parseRoot(css).nodes.single();
      assert(guard(node));
      return node;
    };
  }

  function parseNodes<T extends Node>(guard?: Guard<unknown, T>): (css: string) => T[] {
    return css => parseRoot(css).nodes
      .map(node => {
        assert(guard?.(node));
        return node;
      });
  }

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