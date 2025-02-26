import JSON5 from 'json5';
import { regex, pattern as re } from 'regex';
import {
  Comment as CssComment,
  Declaration as CssDecl,
  Rule as CssRule,
  Root as CssRoot,
  AtRule as CssAtRule,
  Container as CssContainer,
} from 'postcss';
import type {
  Root as SelRoot,
  Selector as SelSelector,
  Node as SelNode,
  Container as SelContainer,
  Pseudo as SelPseudo,
  Attribute as SelAttribute,
  Combinator as SelCombinator,
  String as SelString,
} from 'postcss-selector-parser';
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
  Specificity,
} from '@csstools/selector-specificity';
import { isArray } from './utils.js';

interface MergeSimilarSelectorsPluginOptions {
  pseudo?: string;
  unsafe?: boolean;
}

function mergeSimilarSelectorsPlugin(opts: MergeSimilarSelectorsPluginOptions = {}) {
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

  const removeSelectorComments = (root: SelRoot) => {
    root.walkComments(comment => {
      console.log(`comment "${comment.value}"`);
      comment.remove();
    });
  };

  const printNodeHead = (node: SelNode, headWidth = defaultPrintHeadWidth): string => (
    node.value === undefined ? node.type :
    isSelCombinator(node) ? `"${node.value}"` :
    isSelAttribute(node) ? `${node.type} "${node.attribute}" ${node.operator}${node.insensitiveFlag} "${node.value}"` :
    `${node.type} "${node.value}"`
  ).padEnd(headWidth);

  const printNodeHeadFull = (node: SelNode, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string =>
    printNodeHead(node, headWidth) + ` -> ${node.toString().ellipsis(cssWidth)}`;

  const printNode = (root: SelRoot, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string => {
    const indentStr = "  ";
    const printNodeProc = (node: SelNode, indent = ""): string => [
      `${indent}${printNodeHeadFull(node, headWidth, cssWidth)}`,
      ...isSelContainer(node) ? node.nodes.map(n => printNodeProc(n, indent + indentStr)) : [],
    ].join("\n");
    return printNodeProc(root);
  };

  const areNodesEqual = (a: SelNode, b: SelNode): boolean => a.toString() === b.toString();

  const areNodeHeadersEqual = (a: SelNode, b: SelNode): boolean => {
    if (a.type !== b.type)
      return false;
    if (isSelPseudo(a))
      return a.value === b.value;
    if (!isSelContainer(a))
      return areNodesEqual(a, b);
    throw new Error("Should not be comparing those");
  };

  const areNodesCompatible = (a: SelNode, b: SelNode, specA?: Specificity, specB?: Specificity): boolean => {
    if (areNodeHeadersEqual(a, b))
      return true;
    if (a.type === b.type)
      return true;
    specA ??= getCssSelSpecificity(a);
    specB ??= getCssSelSpecificity(b);
    if (!compareCssSelSpecificity(specA, specB))
      return false;
    // TODO:> Check compat properly
    return a.type === b.type;
  };

  class TrieNode {
    type: 'trie' = 'trie';
    variants: TrieVariant[] = [];
    tries: TrieNode[] = [];
    constructor(init?: Partial<TrieNode>) {
      Object.assign(this, init);
    }
  }

  class TrieVariant {
    static #EmptyNode: SelString = cssSelectorParser.string({ value: "empty" });
    type: 'variant' = 'variant';
    selector?: SelSelector;
    node: SelNode = TrieVariant.#EmptyNode;
    //specificity: Specificity = { a: 0, b: 0, c: 0 };
    constructor(init?: Partial<TrieVariant>) {
      Object.assign(this, init);
    }
  }

  const printTrie = (trie: TrieNode | TrieVariant): string =>
    JSON5.stringify(trie, {
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

  const mergeSimilarSelectors = (root: SelRoot) => {
    const trieRoot = new TrieNode();

    const mergeByPrefix = (node: SelNode, trie: TrieNode) => {
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
      }
      throw new Error("unexpected?");
    };
    mergeByPrefix(root, trieRoot);
    console.log(printTrie(trieRoot));
  };

  return {
    postcssPlugin: 'merge-similar-selectors',
    Rule(rule: CssRule) {
      if (rule.selectors.length <= 1)
        return;
      cssSelectorParser((root: SelRoot) => {
        console.log(printTrie(new TrieVariant({ node: root })));
        removeSelectorComments(root);
        console.log(printNode(root));
        mergeSimilarSelectors(root);
      }).processSync(rule, { lossless: false });
    }
  };
}
mergeSimilarSelectorsPlugin.postcss = true;

export default mergeSimilarSelectorsPlugin;