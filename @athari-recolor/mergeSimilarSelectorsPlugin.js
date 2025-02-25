import JSON5 from 'json5';
import { regex, pattern as re } from 'regex'
import cssSelectorParser from 'postcss-selector-parser';
const {
  isAttribute: isSelAttribute,
  isCombinator: isSelCombinator,
  isContainer: isSelContainer,
  isNode: isSelNode,
  isPseudo: isSelPseudo,
  isRoot: isSelRoot,
  isSelector: isSelSelector,
} = cssSelectorParser;
import {
  selectorSpecificity as getCssSelSpecificity,
  compare as compareCssSelSpecificity,
} from '@csstools/selector-specificity'

export function mergeSimilarSelectorsPlugin(opts = {}) {
  opts = Object.assign({
    pseudo: ':is',
    unsafe: false,
  }, opts);

  const reIsValue = regex('i')`
    ^ :
    ( - ( webkit | moz | ms ) - )?
    ( is | any | matches ) $
  `;
  const defaultPrintHeadWidth = 40;
  const defaultPrintCssWidth = 80;

  const removeSelectorComments = (root) => {
    root.walkComments(comment => {
      console.log(`comment "${comment.value}"`);
      comment.remove();
    });
  };

  const printNodeHead = (node, headWidth = defaultPrintHeadWidth) => (
    node.value === undefined ? node.type :
    isSelCombinator(node) ? `"${node.value}"` :
    isSelAttribute(node) ? `${node.type} "${node.attribute}" ${node.operator}${node.insensitiveFlag} "${node.value}"` :
    `${node.type} "${node.value}"`
  ).padRight(headWidth);

  const printNodeHeadFull = (node, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth) =>
    printNodeHead(node, headWidth) + ` -> ${node.toString().ellipsis(cssWidth)}`;

  const printNode = (root, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth) => {
    const indentStr = "  ";
    const printNodeProc = (node, indent = "") => [
      `${indent}${printNodeHeadFull(node, headWidth, cssWidth)}`,
      ...isSelContainer(node) ? node.map(n => printNodeProc(n, indent + indentStr)) : [],
    ].join("\n");
    return printNodeProc(root);
  };

  const areNodesEqual = (a, b) => a.toString() == b.toString();

  const areNodeHeadersEqual = (a, b) => {
    if (a.type != b.type)
      return false;
    else if (isSelPseudo(a))
      return a.value == b.value;
    else if (!isSelContainer(a))
      return areNodesEqual(a, b);
    else
      throw new Error("Should not be comparing those");
  };

  const areNodesCompatible = (a, b, specA, specB) => {
    if (areNodeHeadersEqual(a, b))
      return true;
    if (a.type == b.type)
      return true;
    specA ??= getCssSelSpecificity(a);
    specB ??= getCssSelSpecificity(b);
    if (!compareCssSelSpecificity(specA, specB))
      return false;
    // TODO:> Check compat properly
    return a.type == b.type;
  };

  class TrieNode {
    /** @const {string} */
    type = 'trie'
    /** @type {TrieVariant[]} */
    variants = []
    /** @type {TrieNode[]} */
    tries = []
    /** @param {Partial<TrieNode>} init */
    constructor(init) { Object.assign(this, init) }
  }

  class TrieVariant {
    type = 'variant'
    /** @type {import('postcss-selector-parser').Selector} */
    selector
    /** @type {import('postcss-selector-parser').Node} */
    node
    /** @type {import('@csstools/selector-specificity').Specificity} */
    //specificity
    /** @param {Partial<TrieVariant>} init */
    constructor(init) { Object.assign(this, init) }
  }

  const printTrie = (trie) =>
    JSON5.stringify(trie, {
      quote: false,
      space: "  ",
      replacer: (k, v) => {
        if (isSelNode(v))
          return k != 'selector' ? printNodeHeadFull(v) : undefined;
        if (v instanceof TrieVariant)
          return printNodeHeadFull(v.node);
        if (k == 'type' || v instanceof Array && v.length == 0)
          return undefined;
        return v;
      },
    });

  /** @param {import('postcss-selector-parser').Root} root */
  const mergeSimilarSelectors = (root) => {
    const trieRoot = new TrieNode();

    /** 
     * @param {import('postcss-selector-parser').Node} node
     * @param {TrieNode} trie */
    const mergeByPrefix = (node, trie) => {
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
          if (compatTrie.variants.every(v => !areNodesEqual(v.node, part))) {
            compatTrie.variants.push(new TrieVariant({ selector: node, node: part }));
          }
          currentTrie = compatTrie;
          if (isSelContainer(part))
            mergeByPrefix(part, compatTrie);
        })
      } else if (isSelContainer(node)) {
        // TODO:> Process container node
      } else if (isSelPseudo(node)) {
        // TODO: Pseudo: split :is, chain others
      } else {
        throw new Error("unexpected?");
      }
    };
    mergeByPrefix(root, trieRoot);
    console.log(printTrie(trieRoot));
  };

  return {
    postcssPlugin: 'merge-similar-selectors',
    Rule(rule) {
      if (rule.selectors.length <= 1)
        return;
      cssSelectorParser((root) => {
        console.log(printTrie(new TrieVariant({ node: root })));
        removeSelectorComments(root);
        console.log(printNode(root));
        mergeSimilarSelectors(root);
      }).processSync(rule, { lossless: false });
    }
  };
}
mergeSimilarSelectorsPlugin.postcss = true;