import assert from 'node:assert';
import JSON5 from 'json5';
import { regex } from 'regex';
import { Brand } from 'utility-types';
import {
  CssRoot, CssRule,
  Sel, SelNodeTypes, SelNode, SelContainer, SelRoot, SelSelector, SelPseudo,
  isSelAttribute, isSelCombinator, isSelContainer, isSelNode, isSelPseudo, isSelPseudoClass, isSelPseudoElement, isSelRoot, isSelSelector,
  cssSelectorParser, getSelSpecificity, compareSelSpecificity, areSelNodesEqual, areSelNodeHeadersEqual, cloneSelNode, cloneSelNodeHeader,
  declarePostCssPlugin,
} from './domUtils.ts';
import { isArray } from './utils.ts';

const defaultPrintHeadWidth = 40;
const defaultPrintCssWidth = 80;

type MergeSelectorsPseudo = 'is' | 'where';
type MergeSelectorsMode = 'safe' | 'expansive' | 'unsafe';
type MergeSelectorsModeInternal = MergeSelectorsMode | 'unsafe-linear';
type FormatTrieField = 'nextTries' | 'nextVariants';
type FormatTrieFields = FormatTrieField[];

export interface MergeSelectorsPluginOptions {
  pseudo: MergeSelectorsPseudo;
  mergeMode: MergeSelectorsMode;
}

class TrieNode {
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

function removeSelectorComments(root: SelRoot): void {
  root.walkComments(comment => {
    console.log(`comment "${comment.value}"`);
    comment.remove();
  });
}

function formatNodeHead(node: SelNode): string {
  if (node.value === undefined)
    return node.type;
  if (isSelCombinator(node))
    return `"${node.value}"`;
  if (isSelAttribute(node))
    return `${node.type} "${node.attribute}" ${node.operator}${node.insensitiveFlag} "${node.value}"`;
  return `${node.type} "${node.value}"`;
}

function formatNodeHeadFull(node: SelNode, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string {
  return formatNodeHead(node).padEnd(headWidth) + ` -> ${node.toString().ellipsis(cssWidth)}`;
}

function formatNode(root: SelNode, headWidth = defaultPrintHeadWidth, cssWidth = defaultPrintCssWidth): string {
  const indentStr = "  ";
  const printNodeProc = (node: SelNode, indent = ""): string => [
    `${indent}${formatNodeHeadFull(node, headWidth, cssWidth)}`,
    ...isSelContainer(node) ? node.nodes.map(n => printNodeProc(n, indent + indentStr)) : [],
  ].join("\n");
  return printNodeProc(root);
}

type SelNodeCompatTypes = 'spec' | 'value' | 'never';

const selNodeCompat: Record<keyof SelNodeTypes, SelNodeCompatTypes> = {
  string: 'never',
  selector: 'never',
  root: 'never',
  nesting: 'never',
  comment: 'never',
  combinator: 'value',
  pseudo: 'value',
  id: 'spec',
  class: 'spec',
  attribute: 'spec',
  tag: 'spec',
  universal: 'spec',
};

function areNodesCompatible(a: SelNode, b: SelNode, mergeMode: MergeSelectorsModeInternal): boolean {
  //const cmp = (() => {
    const [ aCompat, bCompat ] = [ selNodeCompat[a.type], selNodeCompat[b.type] ];
    if (aCompat === 'never' || bCompat === 'never')
      assert(false, `Unexpected selector node compat check: ${a} | ${b}`);
    const isMergeModeUnsafe = mergeMode === 'unsafe' || mergeMode === 'unsafe-linear';
    const [ aSpec, bSpec ] = [ getSelSpecificity(a), getSelSpecificity(b) ];
    const areSpecEqual = compareSelSpecificity(aSpec, bSpec) == 0;
    if (!areSpecEqual && !isMergeModeUnsafe)
      return false;
    if (aCompat === 'value' || bCompat === 'value')
      return aCompat === 'value' && bCompat === 'value' &&
        a.type === b.type &&
        (a.value === b.value || isSelPseudoElement(a) == isSelPseudoElement(b));
    if (aCompat === 'spec' && bCompat === 'spec')
      return areSpecEqual || isMergeModeUnsafe;
    assert(false, `Unexpected selector node compat type: ${aCompat} | ${bCompat}`);
  /*})();
  const formatSelSpecificity = (spec: SelSpecificity) => `(${spec.a}:${spec.b}:${spec.c})`;
  const formatCmp = (a: SelNode) => `${formatSelSpecificity(getSelSpecificity(a))} ${printNodeHead(a).ellipsis(30)}`.padEnd(40);
  return console.debug(`cmp: ${formatCmp(a)} ${cmp ? "==" : "!="} ${formatCmp(b)}`), cmp;*/
}

function formatTrie(trie: TrieNode | TrieVariant, fields: FormatTrieFields = [ 'nextTries', 'nextVariants' ]): string {
  const hasNextTries = fields.includes('nextTries');
  const hasNextVariants = fields.includes('nextVariants');

  //const tryFormatVariant = (v: unknown) => v instanceof TrieVariant ? printNodeHead(v.node) : "?";
  const tryFormatVariant = (v: unknown) => v instanceof TrieVariant ? `${v.node}` : "?";
  //const tryFormatNode = (n: unknown) => n instanceof TrieNode ? n.tries.map(t => t.variants.map(tryFormatVariant).join(" | ")).join(" || ") : "?";
  const tryFormatNodeVariants = (n: unknown) => n instanceof TrieNode ? n.variants.map(tryFormatVariant).join(" | ") : "?";
  return JSON5.stringify(trie, {
    quote: null,
    space: "  ",
    replacer: function(key: string, value: unknown): unknown | undefined {
      if (value == null || isArray(value) && value.length == 0 || value instanceof Set && value.size == 0)
        return undefined;
      if (isSelNode(value))
        return key !== 'selector' ? formatNodeHeadFull(value) : undefined;
      if (value instanceof TrieVariant && value.nextTries.size == 0 && value.nextVariants.size == 0)
        return formatNodeHeadFull(value.node);
      if (this instanceof TrieVariant) {
        if (key == 'nextTries' && hasNextTries)
          return [...value as Set<TrieNode>].map(tryFormatNodeVariants).join(" || ");
        if (key == 'nextVariants' && hasNextVariants)
          return [...value as Set<TrieVariant>].map(tryFormatVariant).join(" | ");
        return undefined;
      }
      if (key === 'type' || isArray(value) && value.length === 0)
        return undefined;
      return value;
    },
  });
}

function buildTrie(node: SelNode, trie: TrieNode, mergeMode: MergeSelectorsModeInternal): void {
  const isLinear = mergeMode === 'unsafe-linear';
  const areSelNodesEqualFn = isLinear ? areSelNodesEqual : areSelNodeHeadersEqual;

  const buildTrieChildren = (node: SelContainer, trie: TrieNode) =>
    node.each(child => buildTrie(child, trie, mergeMode));

  if (isSelRoot(node) || isSelPseudoClassIs(node) && !isLinear) {
    // Root/pseudo :is: merge selectors
    buildTrieChildren(node, trie);

  } else if (isSelSelector(node)) {
    // Selector: find compatible variants
    let currentTrie: TrieNode = trie;
    let prevVariant: TrieVariant | null = null;
    for (const part of node.nodes) {
      if (isSelPseudoClassIs(part) && !isLinear)
        buildTrie(part, currentTrie, mergeMode);
      else {
        let compatTrie = currentTrie.tries.find(t => t.variants.some(v => areNodesCompatible(v.node, part, mergeMode)));
        if (!compatTrie) {
          compatTrie = new TrieNode()
          currentTrie.tries.push(compatTrie);
        }
        prevVariant?.nextTries.add(compatTrie);
        currentTrie = compatTrie;

        let equalVariant = compatTrie.variants.find(v => areSelNodesEqualFn(v.node, part))
        if (!equalVariant) {
          equalVariant = new TrieVariant(part, node);
          compatTrie.variants.push(equalVariant);
        }
        prevVariant?.nextVariants.add(equalVariant);
        prevVariant = equalVariant;

        if (isSelPseudo(part))
          buildTrie(part, compatTrie, mergeMode);
        else if (isSelContainer(part))
          assert(false, `Non-is pseudo expected, got ${part.type} container`);
      }
    }

  } else if (isSelPseudo(node)) {
    // Pseudo with children: put into sub
    if (node.length > 0 && !isLinear) {
      trie.sub ??= new TrieNode();
      buildTrieChildren(node, trie.sub);
    }

  } else {
    assert(false, `Container expected, got ${node.type}`);
  }
}

function buildMergedNode(trieNode: TrieNode, pseudo: MergeSelectorsPseudo): Exclude<SelNode, SelSelector> {
  const nodes: SelNode[] = trieNode.variants.map(v => cloneSelNodeHeader(v.node));
  if (trieNode.sub) {
    const mergedSubSels = buildMergedSelectors(trieNode.sub, pseudo);
    for (const node of nodes)
      if (isSelContainer(node))
        for (const sel of mergedSubSels)
          node.append(sel as any);
  }
  if (nodes.length > 1)
    return Sel.pseudoClass(pseudo, nodes.map(node => Sel.selector([ node ])));
  assert(nodes[0] && !isSelSelector(nodes[0]));
  return nodes[0];
}

function buildMergedSelectors(trieNode: TrieNode, pseudo: MergeSelectorsPseudo): SelSelector[] {
  if (trieNode.variants.length == 0)
    return trieNode.tries.flatMap(trie => buildMergedSelectors(trie, pseudo));

  const mergedNode = buildMergedNode(trieNode, pseudo);
  if (trieNode.tries.length == 0)
    return [ Sel.selector([ mergedNode ]) ];

  const mergedSels = trieNode.tries.flatMap(trie => buildMergedSelectors(trie, pseudo));
  for (const mergedSel of mergedSels)
    mergedSel.prepend(cloneSelNode(mergedNode));
  return mergedSels;
}

function mergeSelectors(root: SelRoot, trieRoot: TrieNode, pseudo: MergeSelectorsPseudo): void {
  root.removeAll();
  for (const sel of buildMergedSelectors(trieRoot, pseudo))
    root.append(sel);
}

export default declarePostCssPlugin<MergeSelectorsPluginOptions>('merge-selectors', {
  pseudo: 'is',
  mergeMode: 'unsafe',
}, (opts) => ({
  OnceExit(css: CssRoot) {
    css.walkRules((rule: CssRule) => {
      if (rule.selectors.length <= 1)
        return;

      const root: SelRoot = cssSelectorParser().astSync(rule, { lossless: false });
      removeSelectorComments(root);
      //console.log("ORIGINAL:", formatNode(root));

      const trieRoot = new TrieNode();
      buildTrie(root, trieRoot, opts.mergeMode);
      //console.log("TRIE:", formatTrie(trieRoot));
      mergeSelectors(root, trieRoot, opts.pseudo);
      //console.log("MERGED:", formatNode(root));

      if (opts.mergeMode === 'unsafe') {
        const trieRootLinear = new TrieNode();
        buildTrie(root, trieRootLinear, 'unsafe-linear');
        console.log("TRIE-LINEAR:", formatTrie(trieRootLinear, []));
        //mergeSelectors(root, trieRoot, opts.pseudo);
        //console.log("MERGED-LINEAR:", formatTrie(trieRootLinear));
      }

      rule.selector = root.toString();
    });
  }
}));