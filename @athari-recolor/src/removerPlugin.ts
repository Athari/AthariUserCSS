import { assert } from 'node:console';
import {
  CssRoot, CssRule,
  SelNodeTypes, SelNode, SelRoot, SelSelector,
  cssSelectorParser, declarePostCssPlugin,
} from './domUtils.ts';
import {
  ArrayIfNeeded, OneOrArray,
  isValueIn, objectEntries, objectValues, valuesOf, toAssignedArrayIfNeeded, regexp,
} from './utils.ts';

type SelNodeNames = keyof SelNodeTypes;

const SelMatcherKeys = valuesOf<SelNodeNames>()('nesting', 'universal');
const SelNameMatcherKey = valuesOf<SelNodeNames>()('class', 'combinator', 'id', 'pseudo', 'tag');
const SelAttributeMatcherKeys = valuesOf<SelNodeNames>()('attribute');

interface SelNodeOptions { flags?: string; }
interface SelNodeTester { type: SelNodeNames; test(node: SelNode): boolean; }

interface SelMatcher<TMatch> { }
interface SelNameMatcher<TMatch> extends SelMatcher<TMatch> { name?: TMatch; }
interface SelAttributeMatcher<TMatch> extends SelNameMatcher<TMatch> { value?: TMatch; operator?: TMatch; }

type SelectorMatcher<TMatcher, TExtra, TKeys extends SelNodeNames> = Partial<Pick<Record<SelNodeNames, OneOrArray<TMatcher & TExtra>>, TKeys>>;

type SelectorMatcherFull<TMatch, TExtra> =
  SelectorMatcher<TExtra, SelMatcher<TMatch>, typeof SelMatcherKeys[number]> &
  SelectorMatcher<TExtra, SelNameMatcher<TMatch>, typeof SelNameMatcherKey[number]> &
  SelectorMatcher<TExtra, SelAttributeMatcher<TMatch>, typeof SelAttributeMatcherKeys[number]>;

interface SelectorRemoverOptions extends SelectorMatcherFull<string | undefined, SelNodeOptions> { }
interface SelectorRemoverRunner extends SelectorMatcherFull<RegExp | undefined, SelNodeTester> { }

export interface RemoverPluginOptions {
  selector: SelectorRemoverOptions;
}

function regExpSafe(pattern?: string, flags?: string): RegExp | undefined {
  return pattern != null ? regexp(pattern, flags ?? 'i') : undefined;
}

function testRegExpSafe(re?: RegExp, str?: string | null): boolean {
  return re != null && str != null && re.test(str);
}

function optionsToRunner(options: SelectorRemoverOptions): SelectorRemoverRunner {
  const runner: SelectorRemoverRunner = {};

  for (const [ type, matcher ] of objectEntries(options)) {
    const matchers = toAssignedArrayIfNeeded(matcher);
    if (isValueIn(type, SelMatcherKeys)) {
      runner[type] = matchers
        .map(() => new class {
          type = type;
          test(node: SelNode): boolean {
            return node.type === type;
          }
        });
    } else if (isValueIn(type, SelNameMatcherKey)) {
      runner[type] = (matchers as ArrayIfNeeded<SelectorRemoverOptions[typeof type]>)
        .map(({ flags, name }) => new class {
          type = type;
          name = regExpSafe(name, flags);
          test(node: SelNode): boolean {
            return node.type === type && testRegExpSafe(this.name, node.value);
          }
        });
    } else if (isValueIn(type, SelAttributeMatcherKeys)) {
      runner[type] = (matchers as ArrayIfNeeded<SelectorRemoverOptions[typeof type]>)
        .map(({ flags, name, operator, value }) => new class {
          type = type;
          name = regExpSafe(name, flags);
          operator = regExpSafe(operator, flags);
          value = regExpSafe(value, flags);
          test(node: SelNode): boolean {
            return node.type === type &&
              testRegExpSafe(this.name, node.attribute) &&
              testRegExpSafe(this.operator, node.operator) &&
              testRegExpSafe(this.value, node.value);
          }
        });
    } else {
      const exhaustiveType: never = type;
      assert(false, `Unexpected selector node type: ${exhaustiveType}`);
    }
  }
  return runner;
}

function matchSelNodeTesters(sel: SelSelector, matchers: SelNodeTester[]): SelNodeNames | null {
  let matchedType: SelNodeNames | null = null;
  sel.walk((node: SelNode): boolean => {
    for (const matcher of matchers) {
      if (matcher.test(node)) {
        matchedType = matcher.type;
        return false;
      }
    }
    return true;
  });
  return matchedType;
}

export default declarePostCssPlugin<RemoverPluginOptions>('remover', {
  selector: {},
}, (opts: RemoverPluginOptions) => {
  const runner = optionsToRunner(opts.selector);

  return {
    OnceExit(css: CssRoot) {

      const matchedTypesCount: Partial<Record<SelNodeNames, number>> = {};
      css.walkRules((rule: CssRule) => {
        const root: SelRoot = cssSelectorParser().astSync(rule, { lossless: false });
        const testers = objectValues(runner).flat(1);

        for (const sel of root.nodes.toArray()) {
          const matchedType = matchSelNodeTesters(sel, testers);
          if (matchedType !== null) {
            matchedTypesCount[matchedType] = (matchedTypesCount[matchedType] ?? 0) + 1;
            sel.remove();
          }
        }

        if (root.length > 0)
          rule.selector = root.toString();
        else
          rule.remove();
      });

      console.log(`Removed ${objectValues(matchedTypesCount).sum()} selectors`, matchedTypesCount);
    }
  };
});