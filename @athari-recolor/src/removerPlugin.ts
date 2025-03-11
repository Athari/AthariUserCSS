import { DeepRequired } from 'utility-types';
import {
  CssRoot, CssRule,
  SelNodeTypes, SelNode, SelRoot, SelSelector,
  cssSelectorParser, declarePostCssPlugin,
} from './domUtils.ts';
import {
  AssignedArrayIfNeeded, OneOrArray, OptionalObject,
  isValueIn, isAssigned, objectEntries, objectValues, valuesOf, toAssignedArrayIfNeeded, regexp, assertNever,
} from './utils.ts';

type SelNodeNames = keyof SelNodeTypes;

const SelMatcherKeys = valuesOf<SelNodeNames>()('nesting', 'universal');
const SelNameMatcherKey = valuesOf<SelNodeNames>()('class', 'combinator', 'id', 'pseudo', 'tag');
const SelAttributeMatcherKeys = valuesOf<SelNodeNames>()('attribute');

interface SelNodeOptions {
  flags?: string | undefined;
}
interface SelNodeTester {
  type: SelNodeNames;
  test(node: SelNode): boolean;
}

interface SelMatcher<TMatch> { }
interface SelNameMatcher<TMatch> extends SelMatcher<TMatch> {
  name?: TMatch | undefined;
}
interface SelAttributeMatcher<TMatch> extends SelNameMatcher<TMatch> {
  value?: TMatch | undefined;
  operator?: TMatch | undefined;
}

type SelectorMatcher<TMatcher, TExtra, TKeys extends readonly SelNodeNames[], IsOptional extends boolean> =
  Partial<Pick<
    Record<
      SelNodeNames,
      OneOrArray<
        IsOptional extends true ?
          OptionalObject<TMatcher & TExtra> :
          TMatcher & TExtra>>,
    TKeys[number]>>;

type SelectorMatcherFull<TMatch, TExtra, IsOptional extends boolean> =
  SelectorMatcher<TExtra, SelMatcher<TMatch>, typeof SelMatcherKeys, IsOptional> &
  SelectorMatcher<TExtra, SelNameMatcher<TMatch>, typeof SelNameMatcherKey, IsOptional> &
  SelectorMatcher<TExtra, SelAttributeMatcher<TMatch>, typeof SelAttributeMatcherKeys, IsOptional>;

interface SelectorRemoverOptions extends SelectorMatcherFull<string, SelNodeOptions, true> { }
interface SelectorRemoverRunner extends SelectorMatcherFull<RegExp, SelNodeTester, false> { }

export interface RemoverPluginOptions {
  selector?: OptionalObject<SelectorRemoverOptions>;
}

type Options = DeepRequired<RemoverPluginOptions>;

function optionsToRunner(options: SelectorRemoverOptions): SelectorRemoverRunner {
  const runner: SelectorRemoverRunner = {};

  for (const [ type, matcher ] of objectEntries(options)) {
    const matchers = toAssignedArrayIfNeeded(matcher) /*as AllUnionFields<Assigned<ArrayElement<SelectorRemoverOptions[typeof type]>>>[]*/;
    if (isValueIn(type, SelMatcherKeys)) {
      runner[type] = (matchers as AssignedArrayIfNeeded<SelectorRemoverOptions[typeof type]>)
        .map(() => new class {
          type = type;
          test(node: SelNode): boolean {
            return node.type === type;
          }
        });
    } else if (isValueIn(type, SelNameMatcherKey)) {
      runner[type] = (matchers as AssignedArrayIfNeeded<SelectorRemoverOptions[typeof type]>)
        .map(({ flags, name }) => new class {
          type = type;
          name = regExpSafe(name, flags);
          test(node: SelNode): boolean {
            return node.type === type && testRegExpSafe(this.name, node.value);
          }
        });
    } else if (isValueIn(type, SelAttributeMatcherKeys)) {
      runner[type] = (matchers as AssignedArrayIfNeeded<SelectorRemoverOptions[typeof type]>)
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
      assertNever(type);
    }
  }
  return runner;

  function regExpSafe(pattern?: string, flags?: string): RegExp | undefined {
    return pattern != null ? regexp(pattern, flags ?? 'i') : undefined;
  }
  
  function testRegExpSafe(re?: RegExp, str?: string | null): boolean {
    return re != null && str != null && re.test(str);
  }
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
  selector: {
    attribute: [],
    class: [],
    combinator: [],
    id: [],
    nesting: [],
    pseudo: [],
    tag: [],
    universal: [],
  },
}, (opts: Options) => {
  const runner = optionsToRunner(opts.selector);

  return {
    OnceExit(css: CssRoot) {

      const matchedTypesCount: Partial<Record<SelNodeNames, number>> = {};
      css.walkRules((rule: CssRule) => {
        const root: SelRoot = cssSelectorParser().astSync(rule, { lossless: false });
        const testers = objectValues(runner).flat(1).filter(isAssigned);

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