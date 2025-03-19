import assert from 'node:assert/strict';
import { DeepRequired } from 'utility-types';
import {
  CssRoot, CssRule, CssNode, CssComment,
  Sel, SelSelector, SelAttribute, SelAttributeOperator,
  isCssDecl, isSelAttribute,
  declarePostCssPlugin,
} from './domUtils.ts';
import { ArrayGenerator } from './utils.ts';

export interface StyleAttrPluginOptions {
  operator?: SelAttributeOperator | undefined;
  insensitive?: boolean | undefined;
}

type Options = DeepRequired<StyleAttrPluginOptions>;

function* processStyleAttr(rule: CssRule, selTag: SelSelector, opts: Options): ArrayGenerator<CssRule> {
  for (const declSel of rule.nodes) {
    assert(isCssDecl(declSel));
    const declDecl = declSel.clone();
    declDecl.cleanRaws();
    declDecl.important = true;

    delete declSel.raws.important;
    delete declSel.raws.before;
    delete declSel.raws.value;
    const declSelStr = opts.insensitive ? declSel.toString().toLowerCase() : declSel.toString();

    const selStyle = Sel.attribute('style', opts.operator, declSelStr, opts.insensitive);

    yield new CssRule({
      selector: selStyle.toString(),
      nodes: [
        new CssComment({ text: `!ath! ${selTag.toString()}` }),
        declDecl,
      ],
    });
  }
}

function processObsoleteAttr(rule: CssRule, attr: SelAttribute, selTag: SelSelector, opts: Options): CssRule {
  rule.cleanRaws();
  const declSel = attr.clone();
  declSel.insensitive = opts.insensitive;
  if (opts.insensitive)
    declSel.value = declSel.value?.toLowerCase();

  return new CssRule({
    selector: declSel.toString(),
    nodes: [
      new CssComment({ text: `!ath! ${selTag.toString()}` }),
      ...rule.nodes,
    ],
  });
}

export default declarePostCssPlugin<StyleAttrPluginOptions>('style-attr', {
  operator: '*=',
  insensitive: true,
}, (opts: Options) => {
  return {
    OnceExit(css: CssRoot): void {
      const newRules: CssNode[] = [];

      css.walkRules((rule: CssRule): void => {
        const selTag: SelSelector = Sel.parseSelector(rule);
        assert(isSelAttribute(selTag.last));
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