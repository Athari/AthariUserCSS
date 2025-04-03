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
  commentPrefix: string,

  level: Granularity;
  important: boolean | null;
  precision: number;
  fallbacks: boolean;
  prettyVars: boolean;

  rootSize: number;
  rootUnit: Cu.AbsoluteLength;

  sizeToRem: boolean;
  sizeVars: boolean;
  sizeVarMin: Opt<string>;
  sizeVarMax: Opt<string>;
  sizeVarOffset: Opt<string>;
  sizeVarPrefix: string;

  lineHeightToRem: boolean;
  lineHeightVars: boolean;
  lineHeightVarMin: Opt<string>;
  lineHeightVarMax: Opt<string>;
  lineHeightVarOffset: Opt<string>;
  lineHeightVarMult: Opt<string>;
  lineHeightVarPrefix: string;

  familyVars: boolean;
  familyVarPrefix: string;
  familyVarLength: number;
}

const defaultOpts: Opts = {
  removeOriginal: true,
  removeUnrelated: false,
  removeUnsupported: false,
  commentPrefix: '',

  level: 'decl',
  important: null,
  precision: 2,
  fallbacks: true,
  prettyVars: false,

  rootSize: 16,
  rootUnit: 'px',

  sizeToRem: true,
  sizeVars: true,
  sizeVarMin: 'sf',
  sizeVarMax: 'st',
  sizeVarOffset: 'so',
  sizeVarPrefix: 's-',

  lineHeightToRem: true,
  lineHeightVars: true,
  lineHeightVarMin: 'lf',
  lineHeightVarMax: 'lt',
  lineHeightVarMult: 'lm',
  lineHeightVarOffset: 'lk',
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
  isResizeEnabled: boolean;
  areVarsEnabled: boolean;
  varMin: Opt<string>;
  varMax: Opt<string>;
  varMult: Opt<string>;
  varOffset: Opt<string>;
  varPrefix: string;
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
  #result: PostCss.Result;
  #rootSize: Cv.Numeric<Cu.AbsoluteLength>;
  #vars = new Map<string, VarEntry>();

  constructor(opts: Opts, result: PostCss.Result) {
    this.#rootSize = Cv.numeric(opts.rootSize, opts.rootUnit);
    this.#opts = opts;
    this.#sizeOpts = { defaultFontSize: Cv.convertLengthStrict(this.#rootSize, 'px').value };
    this.#result = result;
  }

  *buildVars(): ArrayIterator<Css.NodeBase> {
    const self = this;
    yield Css.comment({ text: `${this.#opts.commentPrefix}generated fonts` })
    yield Css.rule({
      selector: ':root',
      nodes: [...function* () {
        yield Css.decl({
          prop: kw.prop.font.size,
          value: Cv.stringify(self.#rootSize),
        });
        yield* [...self.#vars.values()]
          .orderBy(v => v.kind, compare)
          .thenByDescending(v => v.count, compare)
          .thenBy(v => v.prop, compare)
          .selectMany(({ prop, value, kind, count }) => [
            Css.comment({ text: `${self.#opts.commentPrefix}${kind} n=${count}` }),
            Css.decl({ prop, value }),
          ]);
      }()],
    });
  }

  *generateDecls(font: CvFont.Font, createDeclFn: CreateDeclFn): ArrayIterator<Css.Decl> {
    const sizeDecl = this.#generateNumericDecl(font.size, createDeclFn, {
      prop: 'font-size',
      isResizeEnabled: this.#opts.sizeToRem,
      areVarsEnabled: this.#opts.sizeVars,
      varMin: this.#opts.sizeVarMin,
      varMax: this.#opts.sizeVarMax,
      varMult: undefined,
      varOffset: this.#opts.sizeVarOffset,
      varPrefix: this.#opts.sizeVarPrefix,
    });
    if (isDefined(sizeDecl))
      yield sizeDecl;

    const lineHeightDecl = this.#generateNumericDecl(font.lineHeight, createDeclFn, {
      prop: 'line-height',
      isResizeEnabled: this.#opts.lineHeightToRem,
      areVarsEnabled: this.#opts.lineHeightVars,
      varMin: this.#opts.lineHeightVarMin,
      varMax: this.#opts.lineHeightVarMax,
      varMult: this.#opts.lineHeightVarMult,
      varOffset: this.#opts.lineHeightVarOffset,
      varPrefix: this.#opts.lineHeightVarPrefix,
    });
    if (isDefined(lineHeightDecl))
      yield lineHeightDecl;

    const familyDecl = this.#generateFamilyDecl(font.family, createDeclFn);
    if (isDefined(familyDecl))
      yield familyDecl;
  }

  #generateNumericDecl(cv: Opt<Cv.AnyValue>, createDeclFn: CreateDeclFn, opts: NumericPropOptions): Opt<Css.Decl> {
    if (!opts.isResizeEnabled || !isDefined(cv))
      return;

    const cvNum = this.#getActualValue(cv);
    if (!isDefined(cvNum))
      return;

    const expr = this.buildNumericExpr(cvNum, opts);
    if (opts.areVarsEnabled) {
      delete cvNum.raws;
      const valueStr = Cv.stringify(cvNum);
      const varIdent = this.#opts.prettyVars
        ? `--${opts.varPrefix}${this.#formatIdent(valueStr)}`
        : Kw.encodeIdent(`--${opts.varPrefix}${valueStr}`);
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
      this.#opts.fallbacks ? `var(--${opts[k]}, ${fallback})` : `var(--${opts[k]})`;

    let expr = (Cv.convertLengthStrict(cvNum, this.#opts.rootUnit).value / this.#opts.rootSize).toFixed(2);
    expr = `${expr}rem`;

    // linear
    if (isDefined(opts.varMult))
      expr = `${ref('varMult', '1')} * ${expr}`;
    if (isDefined(opts.varOffset))
      expr = `${ref('varOffset', '0px')} + ${expr}`;
    if (isDefined(opts.varMult) || isDefined(opts.varOffset))
      expr = `calc(${expr})`;

    // clamp
    if (isDefined(opts.varMin) || isDefined(opts.varMax)) {
      const refMin = ref('varMin', /*'-infinity'*/'0px');
      const refMax = ref('varMax', /*'infinity'*/'1e9px');
      if (isDefined(opts.varMin) && isDefined(opts.varMax))
        expr = `clamp(${refMin}, ${expr}, ${refMax})`;
      else if (isDefined(opts.varMin))
        expr = `max(${refMin}, ${expr})`;
      else if (isDefined(opts.varMax))
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
      switch (opts.level) {
        case 'decl':
          root.walkDecls(decl => processDecl(decl, refonter, opts));
          break;
        case 'rule':
          root.walkRules(rule => processRule(rule, refonter, opts));
          break;
      }
      root.prepend(...refonter.buildVars());
      root.cleanRaws();
    },
  } satisfies PostCss.Processors;
});