import * as cssCn from '@csstools/css-parser-algorithms';
import * as Ct from './cssTokens.ts';
import { isArray, isUndefined, logError, throwError } from '../utils.ts';

// MARK: Types

export import Comment = cssCn.CommentNode;
export import ContainerBase = cssCn.ContainerNodeBaseClass; // function|block
export import Function = cssCn.FunctionNode;
export import Block = cssCn.SimpleBlockNode;
export import Token = cssCn.TokenNode;
export import Space = cssCn.WhitespaceNode;

export type Node = cssCn.ComponentValue;
export type Container = cssCn.ContainerNode;
export type Type = cssCn.ComponentValueType;

// MARK: Guards

export import isComment = cssCn.isCommentNode;
export import isFunction = cssCn.isFunctionNode;
export import isBlock = cssCn.isSimpleBlockNode;
export import isTokenAny = cssCn.isTokenNode;
export import isSpaceOrComment = cssCn.isWhiteSpaceOrCommentNode;
export import isSpace = cssCn.isWhitespaceNode;

// MARK: Guards (extended)

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

export function isTokenValue<T extends Ct.AnyWithValue, TValue extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, value: TValue, node: Node
): node is Token & { value: T & { [4]: { value: TValue } } };
export function isTokenValue<T extends Ct.AnyWithValue, TValue extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, value: TValue
): (node: Node) => node is Token & { value: T & { [4]: { value: TValue } } };
export function isTokenValue<T extends Ct.AnyWithValue, TValue extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, value: TValue, node?: Node
): any {
  const guard = (node: Node) => isTokenAny(node) && isTokenType(node.value) && node.value[4].value === value;
  return isUndefined(node) ? guard : guard(node);
}

export function isTokenType<T extends Ct.AnyWithType, TType extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, type: TType, node: Node
): node is Token & { value: T & { [4]: { type: TType } } };
export function isTokenType<T extends Ct.AnyWithType, TType extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, type: TType
): (node: Node) => node is Token & { value: T & { [4]: { type: TType } } };
export function isTokenType<T extends Ct.AnyWithType, TType extends Ct.ValueType>(
  isTokenType: (x: Ct.Token) => x is T, type: TType, node?: Node
): any {
  const guard = (node: Node) => isTokenAny(node) && isTokenType(node.value) && node.value[4].type === type;
  return isUndefined(node) ? guard : guard(node);
}

// MARK: Parse

function toTokens(source: string | Ct.Token[]): Ct.CompatToken[] {
  return isArray(source) ? source : Ct.tokenize(source);
}

function onParseError(ex: Ct.ParseError): void {
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
  return Ct.stringify(node.tokens());
}

export import stringifyList = cssCn.stringify;

// MARK: Modify

export import forEach = cssCn.forEach;
export import gatherParents = cssCn.gatherNodeAncestry;
export import replaceList = cssCn.replaceComponentValues;
export import walk = cssCn.walk;

// MARK: Modify (extended)

export function data<T extends Ct.AnyWithValue>(cn: Extract<Token, { value: T }>): Ct.DataOf<T> {
  return cn.value[4];
}

export function value<T extends Ct.AnyWithValue>(cn: Extract<Token, { value: T }>): Ct.ValueOf<T> {
  return cn.value[4].value;
}

export function type<T extends Ct.AnyWithType>(cn: Extract<Token, { value: T }>): Ct.TypeOf<T> {
  return cn.value[4].type;
}