import assert from 'node:assert';
import JSON5 from 'json5';
import { regex } from 'regex';
import {
  CssRule,
  SelNodeTypes, SelNode, SelContainer, SelRoot, SelSelector, SelPseudo, SelSpecificity,
  isSelAttribute, isSelCombinator, isSelContainer, isSelNode, isSelPseudo, isSelRoot, isSelSelector, isSelPseudoClass,
  cssSelectorParser, getSelSpecificity, compareSelSpecificity,
} from './domUtils.js';
import { isArray, throwError } from './utils.js';
import { Brand } from 'utility-types';

const defaultPrintHeadWidth = 40;
const defaultPrintCssWidth = 80;

class TrieNode {
  type: 'trie' = 'trie';
  /** List of compatible {@link SelNode nodes}. Lists of incompatible nodes are within the siblings to this trie node. */
  variants: TrieVariant[] = [];
  /** List of possible right siblings within {@link SelSelector selector}, grouped by compatibility. */
  tries: TrieNode[] = [];
  /** Sub-tree of {@link TrieNode trie nodes} for {@link SelPseudo} with children, separate from {@link variants}. */
  sub: TrieNode | null = null;

  constructor(init?: Partial<TrieNode>) {
    Object.assign(this, init);
  }
}

/** Info about one of compatble {@link SelNode nodes} within {@link TrieNode trie node}'s {@link TrieNode.variants variants}. */
class TrieVariant {
  type: 'variant' = 'variant';
  /** The node of the variant. */
  node: SelNode;
  /** The parent {@link SelSelector selector} of the {@link node}. */
  selector: SelSelector | null;
  /** Right siblings of the {@link node} within the {@link selector}. */
  nextTries: Set<TrieNode> = new Set;
  /** Exact right siblings of the {@link node} within the {@link selector}. */
  nextVariants: Set<TrieVariant> = new Set;

  constructor(node: SelNode, selector?: SelSelector) {
    this.node = node;
    this.selector = selector ?? null;
  }
}

interface MergeSimilarSelectorsPluginOptions {
  pseudo?: string;
  unsafe?: boolean;
}

const reIsValue = regex('i')`
  ^ :
  ( - ( webkit | moz | ms ) - )?
  ( is | any | matches )
  $
`;

type SelPseudoIsValue = Brand<string, "SelPseudoIsValue">;
//type SelPseudoIsValue = ':-webkit-any' | ':any' | ':-moz-any' | ':is' | ':matches';

function isSelPseudoClassIs(node: SelNode): node is SelPseudo & { value: SelPseudoIsValue } {
  return isSelPseudoClass(node) && reIsValue.test(node.value);
}

function removeSelectorComments(root: SelRoot) {
  root.walkComments(comment => {
    console.log(`comment "${comment.value}"`);
    comment.remove();
  });
}

function printNodeHead(node: SelNode): string {
  if (node.value === undefined)
    return node.type;
  if (isSelCombinator(node))
    return `"${node.value}"`;
  if (isSelAttribute(node))
    return `${node.type} "${node.attribute}" ${node.operator}${node.insensitiveFlag} "${node.value}"`;
  return `${node.type} "${node.value}"`;
}

function printNodeHeadFull(node: SelNode, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string {
  return printNodeHead(node).padEnd(headWidth) + ` -> ${node.toString().ellipsis(cssWidth)}`;
}

function printNode(root: SelRoot, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string {
  const indentStr = "  ";
  const printNodeProc = (node: SelNode, indent = ""): string => [
    `${indent}${printNodeHeadFull(node, headWidth, cssWidth)}`,
    ...isSelContainer(node) ? node.nodes.map(n => printNodeProc(n, indent + indentStr)) : [],
  ].join("\n");
  return printNodeProc(root);
}

function areNodesEqual(a: SelNode, b: SelNode): boolean {
  return a.toString() === b.toString();
}

type SelNodeCompatTypes = 'a' | 'b' | 'c' | 'value' | 'never';

const selNodeCompat: Record<keyof SelNodeTypes, SelNodeCompatTypes> = {
  string: 'never',
  selector: 'never',
  root: 'never',
  nesting: 'never',
  comment: 'never',
  combinator: 'value',
  pseudo: 'value',
  id: 'a',
  class: 'b',
  attribute: 'b',
  tag: 'c',
  universal: 'c',
};

function areNodesCompatible(a: SelNode, b: SelNode): boolean {
  const cmp = (() => {
    const [ aCompat, bCompat ] = [ selNodeCompat[a.type], selNodeCompat[b.type] ];
    if (aCompat === 'never' || bCompat === 'never')
      assert(false, `Unexpected selector node compat check: ${a} | ${b}`);
    const [ aSpec, bSpec ] = [ getSelSpecificity(a), getSelSpecificity(b) ];
    const areSpecEqual = compareSelSpecificity(aSpec, bSpec) == 0;
    if (!areSpecEqual)
      return false;
    if (aCompat === 'value' || bCompat === 'value')
      return aCompat === 'value' && bCompat === 'value' && a.type === b.type && a.value === b.value;
    if (aCompat.length === 1 && bCompat.length === 1)
      return areSpecEqual;
    assert(false, `Unexpected selector node compat type: ${aCompat} | ${bCompat}`);
  })();
  const formatSelSpecificity = (spec: SelSpecificity) => `(${spec.a}:${spec.b}:${spec.c})`;
  const formatCmp = (a: SelNode) => `${formatSelSpecificity(getSelSpecificity(a))} ${printNodeHead(a).ellipsis(30)}`.padEnd(40);
  return console.debug(`cmp: ${formatCmp(a)} ${cmp ? "==" : "!="} ${formatCmp(b)}`), cmp;
}

function printTrie(trie: TrieNode | TrieVariant): string {
  //const tryFormatVariant = (v: unknown) => v instanceof TrieVariant ? printNodeHead(v.node) : "?";
  const tryFormatVariant = (v: unknown) => v instanceof TrieVariant ? `${v.node}` : "?";
  const tryFormatNode = (n: unknown) => n instanceof TrieNode ? n.tries.map(t => t.variants.map(tryFormatVariant).join(" | ")).join(" || ") : "?";
  const tryFormatNodeVariants = (n: unknown) => n instanceof TrieNode ? n.variants.map(tryFormatVariant).join(" | ") : "?";
  return JSON5.stringify(trie, {
    quote: null,
    space: "  ",
    replacer: function(key: string, value: unknown): any | undefined {
      if (value == null || isArray(value) && value.length == 0 || value instanceof Set && value.size == 0)
        return undefined;
      if (isSelNode(value))
        return key !== 'selector' ? printNodeHeadFull(value) : undefined;
      if (value instanceof TrieVariant && value.nextTries.size == 0 && value.nextVariants.size == 0)
        return printNodeHeadFull(value.node);
      if (this instanceof TrieVariant) {
        if (key == 'nextTries')
          return [...value as Set<TrieNode>].map(tryFormatNodeVariants).join(" || ");
        if (key == 'nextVariants')
          return [...value as Set<TrieVariant>].map(tryFormatVariant).join(" | ");
        return undefined;
      }
      if (key === 'type' || isArray(value) && value.length === 0)
        return undefined;
      return value;
    },
  });
}

function mergeByPrefix(node: SelNode, trie: TrieNode) {
  const mergeChildrenByPrefix = (node: SelContainer, trie: TrieNode) =>
    node.each(child => mergeByPrefix(child, trie));

  if (isSelRoot(node)) {
    // Root: trie with single variant, merge selectors
    trie.variants.push(new TrieVariant(node));
    mergeChildrenByPrefix(node, trie);

  } else if (isSelSelector(node)) {
    // Selector: find compatible variants
    let currentTrie: TrieNode = trie;
    let prevVariant: TrieVariant | null = null;
    for (const part of node.nodes) {
      if (isSelPseudoClassIs(part))
        mergeByPrefix(part, currentTrie);
      else {
        let compatTrie = currentTrie.tries.find(t => t.variants.some(v => areNodesCompatible(v.node, part)));
        if (!compatTrie)
          currentTrie.tries.push(compatTrie = new TrieNode());
        prevVariant?.nextTries.add(compatTrie);
        currentTrie = compatTrie;

        let equalVariant = compatTrie.variants.find(v => areNodesEqual(v.node, part))
        if (!equalVariant)
          compatTrie.variants.push(equalVariant = new TrieVariant(part, node));
        prevVariant?.nextVariants.add(equalVariant);
        prevVariant = equalVariant;

        if (isSelPseudo(part))
          mergeByPrefix(part, compatTrie);
        else if (isSelContainer(part))
          assert(false, `Non-is pseudo expected, got ${part.type} container`);
      }
    }

  } else if (isSelPseudoClassIs(node)) {
    // Pseudo :is: split into tries
    mergeChildrenByPrefix(node, trie);

  } else if (isSelPseudo(node)) {
    // Pseudo with children: put into sub
    if (node.length > 0) {
      console.debug("sub", node.toString());
      mergeChildrenByPrefix(node, trie.sub ??= new TrieNode());
    }

  } else {
    assert(false, `Container expected, got ${node.type}`);
  }
}

function mergeSimilarSelectors(root: SelRoot) {
  const trieRoot = new TrieNode();
  mergeByPrefix(root, trieRoot);
  console.log(printTrie(trieRoot));
}

function mergeSimilarSelectorsPlugin(opts: MergeSimilarSelectorsPluginOptions = {}) {
  opts = Object.assign({
    pseudo: ':is',
    unsafe: false,
  }, opts);

  return {
    postcssPlugin: 'merge-similar-selectors',
    Rule(rule: CssRule) {
      if (rule.selectors.length <= 1)
        return;
      cssSelectorParser((root: SelRoot) => {
        removeSelectorComments(root);
        console.log(printNode(root));
        mergeSimilarSelectors(root);
      }).processSync(rule, { lossless: false });
    }
  };
}
mergeSimilarSelectorsPlugin.postcss = true;

export default mergeSimilarSelectorsPlugin;