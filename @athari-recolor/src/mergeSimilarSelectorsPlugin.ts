import JSON5 from 'json5';
import { regex } from 'regex';
import {
  CssRule,
  SelNode, SelRoot, SelSelector, SelString,
  SelSpecificity,
  isSelAttribute, isSelCombinator, isSelContainer, isSelNode, isSelPseudo, isSelRoot, isSelSelector,
  cssSelectorParser, getSelSpecificity, compareSelSpecificity,
} from './domUtils.js';
import { isArray } from './utils.js';

const defaultPrintHeadWidth = 40;
const defaultPrintCssWidth = 80;

class TrieNode {
  type: 'trie' = 'trie';
  variants: TrieVariant[] = [];
  tries: TrieNode[] = [];

  constructor(init?: Partial<TrieNode>) {
    Object.assign(this, init);
  }
}

class TrieVariant {
  static #EmptyNode: SelString = cssSelectorParser.string({ value: "<empty>" });

  type: 'variant' = 'variant';
  selector?: SelSelector;
  node: SelNode = TrieVariant.#EmptyNode;
  //specificity: Specificity = { a: 0, b: 0, c: 0 };

  constructor(init?: Partial<TrieVariant>) {
    Object.assign(this, init);
  }
}

interface MergeSimilarSelectorsPluginOptions {
  pseudo?: string;
  unsafe?: boolean;
}

const reIsValue = regex('i')`
  ^ :
  ( - ( webkit | moz | ms ) - )?
  ( is | any | matches ) $
`;

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

function areNodeHeadersEqual(a: SelNode, b: SelNode): boolean {
  if (a.type !== b.type)
    return false;
  if (isSelPseudo(a))
    return a.value === b.value;
  if (!isSelContainer(a))
    return areNodesEqual(a, b);
  throw new Error("Should not be comparing those");
}

function areNodesCompatible(a: SelNode, b: SelNode, specA?: SelSpecificity, specB?: SelSpecificity): boolean {
  if (areNodeHeadersEqual(a, b))
    return true;
  if (a.type === b.type)
    return true;
  specA ??= getSelSpecificity(a);
  specB ??= getSelSpecificity(b);
  if (!compareSelSpecificity(specA, specB))
    return false;
  // TODO:> Check compat properly
  return a.type === b.type;
}

function printTrie(trie: TrieNode | TrieVariant): string {
  return JSON5.stringify(trie, {
    quote: null,
    space: "  ",
    replacer: (k, v) => {
      if (isSelNode(v))
        return k !== 'selector' ? printNodeHeadFull(v) : undefined;
      if (v instanceof TrieVariant)
        return printNodeHeadFull(v.node);
      if (k === 'type' || isArray(v) && v.length === 0)
        return undefined;
      return v;
    },
  });
}

function mergeByPrefix(node: SelNode, trie: TrieNode) {
  if (isSelRoot(node)) {
    trie.variants.push(new TrieVariant({ node }));
    node.each(sel => {
      mergeByPrefix(sel, trie);
    });
  } else if (isSelSelector(node)) {
    let currentTrie = trie;
    node.each(part => {
      let compatTrie = currentTrie.tries.find(t => t.variants.some(v => areNodesCompatible(v.node, part)));
      if (!compatTrie) {
        compatTrie = new TrieNode();
        currentTrie.tries.push(compatTrie);
      }
      if (compatTrie.variants.every(v => !areNodesEqual(v.node, part)))
        compatTrie.variants.push(new TrieVariant({ selector: node, node: part }));
      currentTrie = compatTrie;
      if (isSelContainer(part))
        mergeByPrefix(part, compatTrie);
    });
  } else if (isSelContainer(node)) {
    // TODO: Process container node
  } else if (isSelPseudo(node)) {
    // TODO: Pseudo: split :is, chain others
  } else {
    throw new Error("unexpected?");
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