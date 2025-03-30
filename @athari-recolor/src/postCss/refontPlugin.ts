import { DeepRequired } from 'utility-types';
import { PostCss, Css, Kw, Cu, Cv, CvFont } from '../css/index.ts';
import { ArrayGenerator, Opt, isDefined } from '../utils.ts';

const kw = Kw.kw;

interface RefontPluginOptions{
  mode?: Opt<TransformMode>;
  granularity?: Opt<Granularity>;
  rootFontSize: number;
  rootFontUnit: Cu.AbsoluteLength;
}

type TransformMode = 'append' | 'replace' | 'override';
type Granularity = 'decl' | 'rule';

type Options = DeepRequired<RefontPluginOptions>;

function* generateRefontDecls(font: CvFont.Font, createDeclFn: (prop: string, value: string) => Css.Decl): ArrayGenerator<Css.Decl> {
  const size = font?.size;
  if (isDefined(size)) {
    if (Cv.isNumericUnit(size, Cu.isAbsoluteLength)) {
      Cv.convertLength(size, 'px');
      yield createDeclFn(kw.prop.font.size, `calc()`);
    }
  }
  const lineHeight = font?.lineHeight;
  if (isDefined(lineHeight)) {}
}

export default PostCss.declarePlugin<RefontPluginOptions>('refont', {
  mode: 'replace',
  granularity: 'decl',
  rootFontSize: 16,
  rootFontUnit: 'px',
}, opts => {
  const fontParser = new CvFont.Parser();
  return {
    RuleExit(rule: Css.Rule) {
      fontParser.parseRule(rule);
    },
    AtRuleExit: {
      [kw.atRule.fontFace]: (atRule: Css.AtRule) => {
        fontParser.parseFontFaceAtRule(atRule);
      }
    },
    OnceExit(root: Css.Root) {
      root.walkDecls((decl: Css.Decl) => {
        if (!Kw.equals(decl.prop, kw.prop.font.all))
          return;
        const font = fontParser.parseDecl(decl);
        if (!font)
          return;
        const newDecls = generateRefontDecls(font, (prop, value) =>
          decl.clone({ prop, value, important: decl.important })
        ).toArray();
      });
    },
  };
})