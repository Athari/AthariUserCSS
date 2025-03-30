import assert from 'node:assert/strict';
import { DeepRequired } from 'utility-types';
import { PostCss, Css, Sel } from '../css/index.ts';
import { ArrayGenerator, Opt } from '../utils.ts';

// MARK: Types: Options

export interface StyleAttrPluginOptions {
  operator?: Opt<Sel.AttributeOperator>;
  insensitive?: Opt<boolean>;
}

type Options = DeepRequired<StyleAttrPluginOptions>;

// MARK: Process Attrs

function* processStyleAttr(rule: Css.Rule, selTag: Sel.Selector, opts: Options): ArrayGenerator<Css.Rule> {
  for (const declSel of rule.nodes) {
    assert(Css.isDecl(declSel));
    const declDecl = declSel.clone();
    declDecl.cleanRaws();
    declDecl.important = true;

    delete declSel.raws.important;
    delete declSel.raws.before;
    delete declSel.raws.value;
    const declSelStr = opts.insensitive ? declSel.toString().toLowerCase() : declSel.toString();

    const selStyle = Sel.attribute('style', opts.operator, declSelStr, opts.insensitive);

    yield new Css.Rule({
      selector: selStyle.toString(),
      nodes: [
        new Css.Comment({ text: `!ath! ${selTag.toString()}` }),
        declDecl,
      ],
    });
  }
}

function processObsoleteAttr(rule: Css.Rule, attr: Sel.Attribute, selTag: Sel.Selector, opts: Options): Css.Rule {
  rule.cleanRaws();
  const declSel = attr.clone();
  declSel.insensitive = opts.insensitive;
  if (opts.insensitive)
    declSel.value = declSel.value?.toLowerCase();

  return new Css.Rule({
    selector: declSel.toString(),
    nodes: [
      new Css.Comment({ text: `!ath! ${selTag.toString()}` }),
      ...rule.nodes,
    ],
  });
}

// MARK: Plugin

export default PostCss.declarePlugin<StyleAttrPluginOptions>('style-attr', {
  operator: '*=',
  insensitive: true,
}, (opts: Options) => {
  return {
    OnceExit(css: Css.Root): void {
      const newRules: Css.Node[] = [];

      css.walkRules((rule: Css.Rule): void => {
        const selTag: Sel.Selector = Sel.parseSelector(rule);
        assert(Sel.isAttribute(selTag.last));
        const selAttr = selTag.last;
        if (selAttr.attribute === 'style')
          newRules.push(...processStyleAttr(rule, selTag, opts));
        else
          newRules.push(processObsoleteAttr(rule, selAttr, selTag, opts))
        rule.remove();
      });

      css.append(...newRules);
    }
  };
});