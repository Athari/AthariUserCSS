import { regex } from 'regex';
import { PostCss, Css, Kw, Cu, Cv, CvFont } from '../css/index.ts';
import { Opt, OptObject, compare, deepMerge, isArray, isDefined, logError } from '../utils.ts';

// MARK: Consts

const debug = false as boolean;

const kw = Kw.kw;
const kwpf = kw.prop.font;
const kwRefontable = [ kwpf.shorthand, kwpf.size, kwpf.lineHeight, kwpf.family ] as const;

const re = new class {
  readonly nonIdent = regex('gi')` [^ a-z 0-9 _ \- ] `;
  readonly multiDash = regex('gi')` - {2,} `;
  readonly quoteMarks = regex('gi')` ['"] `;
};

const fontStringifier = createFontParser();

// MARK: Options

interface Opts {
  removeOriginal: boolean;
  removeUnrelated: boolean;
  removeUnsupported: boolean;
  includeLegacy: boolean;
  includeLegacyDelta: boolean;
  extraRootSelectors: string[];
  commentPrefix: string;

  level: Granularity;
  important: boolean | null;
  precision: number;
  fallbacks: boolean;
  prettyVars: boolean;

  rootSize: number;
  rootUnit: Cu.AbsoluteLength;

  sizeToRem: boolean;
  sizeCombine: boolean;
  sizeVarMin: Opt<string>;
  sizeVarMax: Opt<string>;
  sizeVarOffset: Opt<string>;
  sizeVarMult: Opt<string>;
  sizeVarPrefix: Opt<string>;

  lineHeightToRem: boolean;
  lineHeightCombine: boolean;
  lineHeightVarMin: Opt<string>;
  lineHeightVarMax: Opt<string>;
  lineHeightVarOffset: Opt<string>;
  lineHeightVarMult: Opt<string>;
  lineHeightVarPrefix: Opt<string>;

  familyVars: boolean;
  familyVarPrefix: string;
  familyVarLength: number;
}

const defaultOpts: Opts = {
  removeOriginal: true,
  removeUnrelated: false,
  removeUnsupported: false,
  includeLegacy: false,
  includeLegacyDelta: false,
  extraRootSelectors: [],
  commentPrefix: '',

  level: 'decl',
  important: null,
  precision: 2,
  fallbacks: true,
  prettyVars: false,

  rootSize: 16,
  rootUnit: 'px',

  sizeToRem: true,
  sizeCombine: true,
  sizeVarMin: 's0',
  sizeVarMax: 's1',
  sizeVarMult: 'sa',
  sizeVarOffset: 'sb',
  sizeVarPrefix: 's-',

  lineHeightToRem: true,
  lineHeightCombine: true,
  lineHeightVarMin: 'l0',
  lineHeightVarMax: 'l1',
  lineHeightVarMult: 'la',
  lineHeightVarOffset: 'lb',
  lineHeightVarPrefix: 'l-',

  familyVars: true,
  familyVarPrefix: 'f-',
  familyVarLength: 20,
};

export type Granularity = 'decl' | 'rule';

export type RefontOptions = OptObject<Opts>;

type KwRefontable = typeof kwRefontable[number];

interface NumericPropOptions {
  prop: KwRefontable,
  propToRem: boolean;
  propCombine: boolean;
  propMin: Opt<string>;
  propMax: Opt<string>;
  propMult: Opt<string>;
  propOffset: Opt<string>;
  propPrefix: Opt<string>;
}

interface VarEntry {
  prop: string;
  value: string;
  kind: string;
  count: number;
}

interface CreateDeclFn { (prop: KwRefontable, value: string): Css.Decl }

// MARK: Refonter

class Refonter {
  #opts: Opts;
  #sizeOpts: CvFont.SizeOptions;
  #fontSizeOpts: NumericPropOptions;
  #lineHeightSizeOpts: NumericPropOptions;
  #result: PostCss.Result;
  #rootSize: Cv.Numeric<Cu.AbsoluteLength>;
  #vars = new Map<string, VarEntry>();

  constructor(opts: Opts, result: PostCss.Result) {
    this.#rootSize = Cv.numeric(opts.rootSize, opts.rootUnit);
    this.#opts = opts;
    this.#sizeOpts = { defaultFontSize: Cv.convertLengthStrict(this.#rootSize, 'px').value };
    this.#fontSizeOpts = this.#toNumericOpts('font-size', 'size');
    this.#lineHeightSizeOpts = this.#toNumericOpts('line-height', 'lineHeight');
    this.#result = result;
  }

  *buildVars(): ArrayIterator<Css.NodeBase> {
    const self = this;
    yield Css.comment({ text: `${this.#opts.commentPrefix}generated fonts` });
    yield Css.rule({
      selector: ':root',
      nodes: [
        Css.decl({
          prop: kw.prop.font.size,
          value: Cv.stringify(self.#rootSize),
        }),
      ],
    });
    yield Css.rule({
      selectors: [ ':root', 'body', ...this.#opts.extraRootSelectors ],
      nodes: [...self.#vars.values()]
        .orderBy(v => v.kind, compare)
        .thenByDescending(v => v.count, compare)
        .thenBy(v => v.prop, compare)
        .selectMany(({ prop, value, kind, count }) => [
          Css.comment({ text: `${self.#opts.commentPrefix}${kind} n=${count}` }),
          Css.decl({ prop, value }),
        ])
        .toArray(),
    });
  }

  *buildLegacy(): ArrayIterator<Css.NodeBase> {
    if (!this.#opts.includeLegacy && !this.#opts.includeLegacyDelta)
      return;

    if (this.#opts.includeLegacy) {
      yield Css.comment({ text: `${this.#opts.commentPrefix}generated legacy fonts` });
      for (const legacyFontSize of [ 1, 2, 3, 4, 5, 6, 7 ] as const) {
        const fontSize = CvFont.getPixelSizeForFontTag(legacyFontSize, this.#sizeOpts);
        const expr = this.buildNumericExpr(Cv.numeric(fontSize, 'px'), this.#fontSizeOpts);
        yield createLegacyRule(legacyFontSize, expr);
      }
    }

    // TODO: Clamp legacy delta font sizes
    if (this.#opts.includeLegacyDelta) {
      const deltaMult = 1.1;
      for (const [ signChar, sign ] of [ [ '-', -1 ], [ '+', 1 ] ] as const) {
        for (const legacyFontSizeDelta of [ 1, 2, 3, 4, 5 ] as const) {
          const expr = `${Math.pow(deltaMult, legacyFontSizeDelta * sign).toFixed(this.#opts.precision)}em`;
          yield createLegacyRule(`${signChar}${legacyFontSizeDelta}`, expr);
        }
      }
    }

    function createLegacyRule(legacyFontSize: string | number, value: string) {
      return Css.rule({
        selector: `font[size="${legacyFontSize}"]`,
        nodes: [
          Css.decl({ prop: kw.prop.font.size, value, important: true }),
        ],
      });
    }
  }

  *generateDecls(font: CvFont.Font, createDeclFn: CreateDeclFn): ArrayIterator<Css.Decl> {
    const sizeDecl = this.#generateNumericDecl(font.size, createDeclFn, this.#fontSizeOpts);
    if (isDefined(sizeDecl))
      yield sizeDecl;

    const lineHeightDecl = this.#generateNumericDecl(font.lineHeight, createDeclFn, this.#lineHeightSizeOpts);
    if (isDefined(lineHeightDecl))
      yield lineHeightDecl;

    const familyDecl = this.#generateFamilyDecl(font.family, createDeclFn);
    if (isDefined(familyDecl))
      yield familyDecl;
  }

  #generateNumericDecl(cv: Opt<Cv.AnyValue>, createDeclFn: CreateDeclFn, opts: NumericPropOptions): Opt<Css.Decl> {
    if (!opts.propToRem || !isDefined(cv))
      return;

    const cvNum = this.#getActualValue(cv);
    if (!isDefined(cvNum))
      return;

    const expr = this.buildNumericExpr(cvNum, opts);
    if (opts.propCombine) {
      delete cvNum.raws;
      const valueStr = Cv.stringify(cvNum);
      const varIdent = this.#opts.prettyVars
        ? `--${opts.propPrefix}${this.#formatIdent(valueStr)}`
        : Kw.encodeIdent(`--${opts.propPrefix}${valueStr}`);
      const varName = this.#setVar({
        prop: varIdent,
        value: expr,
        kind: opts.prop,
      });
      return createDeclFn(opts.prop, `var(${varName})`);
    } else {
      return createDeclFn(opts.prop, expr);
    }
  }

  private buildNumericExpr(cvNum: Cv.Numeric<Cu.AbsoluteLength>, opts: NumericPropOptions) {
    const ref = (k: keyof NumericPropOptions, fallback: string) =>
      this.#opts.fallbacks ? `var(--${opts[k]},${fallback})` : `var(--${opts[k]})`;

    let expr = (Cv.convertLengthStrict(cvNum, this.#opts.rootUnit).value / this.#opts.rootSize).toFixed(2);
    expr = `${expr}rem`;

    // linear
    if (isDefined(opts.propMult))
      expr += ` * ${ref('propMult', '1')}`;
    if (isDefined(opts.propOffset))
      expr += ` + ${ref('propOffset', '0px')}`;
    if (isDefined(opts.propMult) || isDefined(opts.propOffset))
      expr = `calc(${expr})`;

    // clamp
    if (isDefined(opts.propMin) || isDefined(opts.propMax)) {
      const refMin = ref('propMin', '0px');
      const refMax = ref('propMax', '1e9px');
      if (isDefined(opts.propMin) && isDefined(opts.propMax))
        expr = `clamp(${refMin}, ${expr}, ${refMax})`;
      else if (isDefined(opts.propMin))
        expr = `max(${refMin}, ${expr})`;
      else if (isDefined(opts.propMax))
        expr = `min(${refMax}, ${expr})`;
    }

    return expr;
  }

  #generateFamilyDecl(families: Opt<CvFont.Families>, createDeclFn: CreateDeclFn): Opt<Css.Decl> {
    if (!this.#opts.familyVars || !isArray(families))
      return;

    families.forEach(f => delete f.raws);
    const valueStr = fontStringifier.stringifyDeclValue(families, kw.prop.font.family);
    const varIdent = this.#formatIdent(valueStr, this.#opts.familyVarLength);
    const varName = this.#setVar({
      prop: `--${this.#opts.familyVarPrefix}${varIdent}`,
      value: valueStr,
      kind: 'font-family',
    });
    return createDeclFn(kw.prop.font.family, `var(${varName})`);
  }

  #toNumericOpts(prop: KwRefontable, name: 'size' | 'lineHeight'): NumericPropOptions {
    return {
      ...([ 'ToRem', 'Combine' ] as const).reduce(
        (a, k) => (a[`prop${k}`] = this.#opts[`${name}${k}`], a),  <NumericPropOptions>{}),
      ...([ 'Min', 'Max', 'Mult', 'Offset', 'Prefix' ] as const).reduce(
        (a, k) => (a[`prop${k}`] = this.#opts[`${name}Var${k}`], a),  <NumericPropOptions>{}),
      prop,
    };
  }

  #getActualValue(cv: Cv.AnyValue): Opt<Cv.Numeric<Cu.AbsoluteLength>> {
    if (Cv.isNumericUnit(cv, Cu.isAbsoluteLength))
      return cv;
    if (Cv.isKeywordName(cv, kw.font.size.absolute)) {
      const pixelSize = CvFont.getPixelSizeForKeyword(cv.name, this.#sizeOpts);
      if (isDefined(pixelSize))
        return Cv.numeric(pixelSize, 'px');
    }
    return;
  }

  #setVar({ prop, value, kind }:
    { prop: string, value: string, kind: string }
  ) {
    const entry = this.#vars.get(prop);
    if (isDefined(entry)) {
      if (Kw.equals(entry.value, value)) {
        entry.count++;
        return prop;
      }
      this.#result.warn(`Duplicate generated variable name: ${prop}`, { word: prop });
      let dedupName: string, i = 2;
      do {
        dedupName = `${prop}${i++}`;
      } while (this.#vars.has(dedupName));
      prop = dedupName;
    }
    this.#vars.set(prop, { prop, value, kind, count: 1 });
    return prop;
  }

  #formatIdent(s: string, maxLength: number = +Infinity): string {
    return s.toLowerCase()
      .replace(re.quoteMarks, "").replace(re.nonIdent, "-").replace(re.multiDash, "-")
      .substring(0, maxLength).stripRight("-");
  }
}

// MARK: Utils

function processDecl(decl: Css.Decl, refonter: Refonter, opts: Opts) {
  if (!Kw.equals(decl.prop, kwRefontable)) {
    if (opts.removeUnrelated)
      decl.remove();
    return;
  }

  const font = createFontParser().parseDeclValue(decl);
  const [ prop, value ] = font?.props.entries().toArray()[0] ?? [];
  if (!isDefined(font) || !isDefined(prop) || !isDefined(value)) {
    if (opts.removeUnsupported)
      decl.remove();
    return;
  }

  const newDecls = [...refonter.generateDecls(font, (prop, value) =>
    Css.decl({ prop, value, important: opts.important ?? decl.important })
  )];
  decl.before(newDecls);
  if (opts.removeOriginal)
    decl.remove();

  debugDump('decl prop', decl.prop, [ prop, ":", value ], 'DeclValue');
  debugDump('decl font', decl.prop, [ font ], 'Font');
}

function processAtRule(rule: Css.AtRule, refonter: Refonter, opts: Opts) {
  if (opts.removeUnrelated && Kw.equals(rule.name, kw.atRule.fontFace))
    rule.remove();
}

function processRule(rule: Css.Rule, refonter: Refonter, opts: Opts) {
  const font = createFontParser().parseRule(rule);
  if (!isDefined(font)) {
    if (opts.removeUnrelated)
      removeDecls(rule, n => opts.removeUnsupported || !Kw.equals(n.prop, kwRefontable));
    return;
  }

  // TODO: Store state of !important when parsing font props from decl
  const newDecls = [...refonter.generateDecls(font, (prop, value) =>
    Css.decl({ prop, value, important: opts.important ?? false })
  )];
  if (opts.removeUnrelated)
    removeDecls(rule, n => !Kw.equals(n.prop, kwRefontable));
  if (opts.removeOriginal) {
    const replacedProps = [ ...newDecls.map(d => d.prop), kwpf.shorthand ];
    removeDecls(rule, n => Kw.equals(n.prop, replacedProps));
  }
  rule.append(newDecls);

  debugDump('rule', rule.selector, [ font ], 'Font');
}

function createFontParser(): CvFont.Parser {
  return new CvFont.Parser({
    strict: false,
    parseError: (ex, ct) => logError(ex, `Failed to parse font on token ${ct ?? '<unknown>'}`),
  });
}

function removeDecls(cont: Css.Container, predicateFn?: Opt<(node: Css.Decl) => boolean>) {
  cont.each((node) => {
    if (Css.isDecl(node) && (predicateFn?.(node) ?? true))
      node.remove();
  });
}

function debugDump(name: string, owner: unknown, a: unknown[], kind: 'DeclValue' | 'Font') {
  if (!debug)
    return;
  const header = (type: string) => [ `${name} p ${type}`, owner, "=" ];
  const args = kind === 'DeclValue' ? [ a.at(-1), a[0] ] : [ a[0] ];
  console.log(...header('obj'), ...a);
  console.log(...header('tok'), [ ...(<any>fontStringifier[`tokenize${kind}`])(...args) ]);
  console.log(...header('str'), (<any>fontStringifier[`stringify${kind}`])(...args));
}

// MARK: Plugin

export default PostCss.declarePluginOpt<RefontOptions>('refont', defaultOpts, (options, result) => {
  const opts = deepMerge(null, structuredClone(defaultOpts), options) as Opts;
  const refonter = new Refonter(opts, result);
  return {
    OnceExit(root: Css.Root) {
      root.walkAtRules(rule => processAtRule(rule, refonter, opts));
      switch (opts.level) {
        case 'decl':
          root.walkDecls(decl => processDecl(decl, refonter, opts));
          break;
        case 'rule':
          root.walkRules(rule => processRule(rule, refonter, opts));
          break;
      }
      root.prepend(...refonter.buildLegacy());
      root.prepend(...refonter.buildVars());
      root.cleanRaws();
    },
  } satisfies PostCss.Processors;
});