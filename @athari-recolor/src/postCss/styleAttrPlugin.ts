import assert from 'node:assert/strict';
import { PostCss, Css, Sel } from '../css/index.ts';
import { Kwh } from '../html/index.ts';
import { OptObject } from '../utils.ts';

const kwh = Kwh.kwh;

// MARK: Types: Options

interface Opts {
  commentPrefix: string,
  operator: Sel.AttributeOperator;
  insensitive: boolean;
}

const defaultOpts: Opts = {
  commentPrefix: "",
  operator: '*=',
  insensitive: true,
};

export type StyleAttrOptions = OptObject<Opts>;

// MARK: Process Attrs

function* processStyleAttr(rule: Css.Rule, selTag: Sel.Selector, opts: Opts): ArrayIterator<Css.Rule> {
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

    yield Css.rule({
      selector: selStyle.toString(),
      nodes: [
        Css.comment({ text: `!ath! ${selTag.toString()}` }),
        declDecl,
      ],
    });
  }
}

function processObsoleteAttr(rule: Css.Rule, attr: Sel.Attribute, selTag: Sel.Selector, opts: Opts): Css.Rule {
  rule.cleanRaws();
  const declSel = attr.clone();
  declSel.insensitive = opts.insensitive;
  if (opts.insensitive)
    declSel.value = declSel.value?.toLowerCase();

  return Css.rule({
    selector: declSel.toString(),
    nodes: [
      Css.comment({ text: `${opts.commentPrefix}${selTag.toString()}` }),
      ...rule.nodes,
    ],
  });
}

// MARK: Plugin

export default PostCss.declarePlugin<StyleAttrOptions>('style-attr', defaultOpts, (opts: Opts) => {
  return {
    OnceExit(css: Css.Root): void {
      const newRules: Css.Node[] = [];

      css.walkRules((rule: Css.Rule): void => {
        const selTag: Sel.Selector = Sel.parseSelector(rule);
        assert(Sel.isAttribute(selTag.last));
        const selAttr = selTag.last;
        if (Kwh.equals(selAttr.attribute, kwh.attr.style))
          newRules.push(...processStyleAttr(rule, selTag, opts));
        else
          newRules.push(processObsoleteAttr(rule, selAttr, selTag, opts))
        rule.remove();
      });

      css.append(...newRules);
    }
  };
});