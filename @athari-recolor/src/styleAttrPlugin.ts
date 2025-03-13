import assert from 'node:assert';
import { DeepRequired } from 'utility-types';
import {
  CssRoot, CssRule, CssNode, CssComment,
  Sel, SelRoot, SelAttribute, SelAttributeOperator,
  isCssDecl, isSelAttribute,
  declarePostCssPlugin,
} from './domUtils.ts';
import { ArrayGenerator } from './utils.ts';

export interface StyleAttrPluginOptions {
  operator?: SelAttributeOperator | undefined;
  insensitive?: boolean | undefined;
}

type Options = DeepRequired<StyleAttrPluginOptions>;

function* processStyleAttr(rule: CssRule, selRootTag: SelRoot, opts: Options): ArrayGenerator<CssRule> {
  for (const declSel of rule.nodes) {
    assert(isCssDecl(declSel));
    const declDecl = declSel.clone();
    declDecl.cleanRaws();
    declDecl.important = true;

    delete declSel.raws.important;
    delete declSel.raws.before;
    delete declSel.raws.value;
    const declSelStr = opts.insensitive ? declSel.toString().toLowerCase() : declSel.toString();

    const selRootStyle = Sel.root([
      Sel.selector([
        Sel.attribute('style', opts.operator, declSelStr, opts.insensitive),
      ]),
    ]);

    yield new CssRule({
      selector: selRootStyle.toString(),
      nodes: [
        new CssComment({ text: `!ath! ${selRootTag.toString()}` }),
        declDecl,
      ],
    });
  }
}

function processObsoleteAttr(rule: CssRule, attr: SelAttribute, selRootTag: SelRoot, opts: Options): CssRule {
  rule.cleanRaws();
  const declSel = attr.clone();
  declSel.insensitive = opts.insensitive;
  if (opts.insensitive)
    declSel.value = declSel.value?.toLowerCase();

  const selRootStyle = Sel.root([ Sel.selector([ declSel ]) ]);

  return new CssRule({
    selector: selRootStyle.toString(),
    nodes: [
      new CssComment({ text: `!ath! ${selRootTag.toString()}` }),
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
        const selRootTag: SelRoot = Sel.parseRoot(rule);
        assert(isSelAttribute(selRootTag.first.last));
        const selAttr = selRootTag.first.last;
        if (selAttr.attribute === 'style')
          newRules.push(...processStyleAttr(rule, selRootTag, opts));
        else
          newRules.push(processObsoleteAttr(rule, selAttr, selRootTag, opts))
        rule.remove();
      });

      css.append(...newRules);
    }
  };
});