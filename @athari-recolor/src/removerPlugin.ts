import {
  CssRoot, CssRule,
  SelNodeTypes, SelNode, SelRoot,
  cssSelectorParser, declarePostCssPlugin,
} from './domUtils.ts';
import { isArray, objectEntries, objectValues, regexp } from './utils.ts';

type OneOrArray<T> = T | T[];
type ArrayValue<T> = T extends readonly (infer U)[] ? U : never;
type ArrayIfNeeded<T> = ArrayValue<T>[];

function toArrayIfNeeded<T>(o: OneOrArray<T>): Array<T> {
  return o == null ? [] : isArray(o) ? o : [ o ];
}

type SelNodeNames = keyof SelNodeTypes;

interface SelNodeOptions { flags?: string; }
interface SelNodeTester { test(node: SelNode): boolean; }

interface SelMatcher<TMatch> { type: SelNodeNames; }
interface SelNameMatcher<TMatch> extends SelMatcher<TMatch> { name?: TMatch; }
interface SelAttributeMatcher<TMatch> extends SelNameMatcher<TMatch> { value?: TMatch; operator?: TMatch; }

type SelectorMatcher<TMatcher, TExtra, TKeys extends SelNodeNames> = Partial<Pick<Record<SelNodeNames, OneOrArray<TMatcher & TExtra>>, TKeys>>;

type SelectorMatcherFull<TMatch, TExtra> =
  SelectorMatcher<TExtra, SelMatcher<TMatch>, 'nesting' | 'universal'> &
  SelectorMatcher<TExtra, SelNameMatcher<TMatch>, 'class' | 'combinator' | 'id' | 'pseudo' | 'tag'> &
  SelectorMatcher<TExtra, SelAttributeMatcher<TMatch>, 'attribute'>;

interface SelectorRemoverOptions extends SelectorMatcherFull<string | undefined, SelNodeOptions> { }
interface SelectorRemoverRunner extends SelectorMatcherFull<RegExp | undefined, SelNodeTester> { }

export interface RemoverPluginOptions {
  selector: SelectorRemoverOptions;
}

function regExpSafe(pattern?: string, flags?: string): RegExp | undefined {
  return pattern != null ? regexp(pattern, flags) : undefined;
}

function testRegExpSafe(re?: RegExp, str?: string | null): boolean {
  return re != null && str != null && re.test(str);
}

function optionsToRunner(options: SelectorRemoverOptions): SelectorRemoverRunner {
  const runner: SelectorRemoverRunner = {};

  for (const [ type, matcher ] of objectEntries(options)) {
    const matchers = toArrayIfNeeded(matcher);
    // type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never;
    // (optionMatchers as UnionToIntersection<typeof optionMatchers[0]>[]).map(o => {
    //   const q = objectEntries(o).flatMap(([k, v]) => {
    //     switch (k) {
    //       case 'flags':
    //         return [];
    //       case 'type':
    //         return [[ k, v ]];
    //       default:
    //         return [[ k, v !== null ? regexp(v, o.flags) : null ]];
    //     }
    //   });
    // });
    switch (type) {
      case 'class':
      case 'id':
      case 'tag':
      case 'combinator':
      case 'pseudo': {
        runner[type] = (matchers as ArrayIfNeeded<SelectorRemoverOptions[typeof type]>)!
          .map(({ flags, name }) => new class {
            type = type;
            name = regExpSafe(name, flags);
            test(node: SelNode): boolean {
              return node.type === type && testRegExpSafe(this.name, node.value);
            }
          });
        break;
      }
      case 'attribute': {
        runner[type] = (matchers as ArrayIfNeeded<SelectorRemoverOptions[typeof type]>)!
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
        break;
      }
      case 'nesting':
      case 'universal': {
        runner[type] = (matchers as ArrayIfNeeded<SelectorRemoverOptions[typeof type]>)!
          .map(() => new class {
            type = type;
            test(node: SelNode): boolean {
              return node.type === type;
            }
          });
        break;
      }
      default: {
        throw new Error(`Unhandled key: ${type}`);
      }
    }
  }
  return runner;
}

export default declarePostCssPlugin<RemoverPluginOptions>('remover', {
  selector: {},
}, (opts: RemoverPluginOptions) => {
  const runner = optionsToRunner(opts.selector);

  return {
    OnceExit(css: CssRoot) {

      css.walkRules((rule: CssRule) => {
        const matchers = objectValues(runner).flat(1);
        //console.log("MATCHERS:", matchers);
        const root: SelRoot = cssSelectorParser().astSync(rule, { lossless: false });

        for (const sel of root.nodes.toArray()) {
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
          if (matchedType !== null) {
            //console.log(`Matched ${matchedType} within selector ${sel.toString()}, removing`);
            sel.remove();
          }
        }

        if (root.length > 0)
          rule.selector = root.toString();
        else
          rule.remove();
      });
    }
  };
});