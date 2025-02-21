import { promises as fs } from 'fs';
import postCss, { Comment, Declaration, Rule } from 'postcss';
import safeParser from 'postcss-safe-parser';
import enquirer from 'enquirer';
import JSON5 from 'json5';
import { format as prettifyCode } from 'prettier';
import { initializeLinq } from 'linq-to-typescript'
import cssColorsNames from 'color-name';
import monkeyutils from '@athari/monkeyutils';
import {
  Command,
  Option as CommandOption,
} from 'commander';
import {
  color as parseCssColor,
  serializeRGB as serializeRgb,
  serializeOKLCH as serializeOkLch,
  serializeP3,
  colorDataFitsRGB_Gamut as colorDataFitsRgbGamut,
  ColorNotation,
} from '@csstools/css-color-parser';
import {
  isFunctionNode, isTokenNode,
  parseCommaSeparatedListOfComponentValues as parseCssCompCommaList,
  parseComponentValue as parseCssComp,
  replaceComponentValues as replaceCssComps,
  stringify as stringifyCssComps,
} from '@csstools/css-parser-algorithms';
import {
  isTokenHash, isTokenIdent,
  tokenize as tokenizeCssValue,
  stringify as stringifyCssValue,
} from '@csstools/css-tokenizer';
import {
  parseDocument as parseHtmlDocument,
} from 'htmlparser2';
import {
  Document as HtmlDocument,
  Node as HtmlNode,
  Element as HtmlElement,
  Text as HtmlText,
  isTag as isHtmlElement,
  isText as isHtmlText,
  hasChildren as hasHtmlChildren,
} from 'domhandler';
import {
  selectOne as htmlSelectOne,
  selectAll as htmlSelectAll,
} from 'css-select';
import cssNano from 'cssnano';

const { assignDeep, throwError, download, withTimeout } = monkeyutils;
initializeLinq();

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|tap-highlight|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;
const reAtRuleMediaDark = /prefers-color-scheme\s*:\s*dark/i;
const reAtRuleMediaNameAllowed = /container|media|scope|starting-style|supports/i;

const recolorPlugin = (opts = {}) => ({
  postcssPlugin: 'recolor',
  Once(css) {
    // TODO: Disable palette gen by default
    opts = Object.assign({ colorFormula: 'dark', palette: true }, opts);

    const palette = {
      uniqueColors: {},
      colors: [],
    };
    const paletteVarPrefix = 'c';

    const stringifyNode = node => stringifyCssValue(...node.tokens());
    const parseCssCompStr = css => parseCssComp(tokenizeCssValue({ css }));
    const roundStrNumbers = s => s.replace(/(\d+\.\d+|\d+\.|\.\d+)/g,
      (_, d) => (+d).toFixed(2).replace(/(\.\d*)0+$/, "$1").replace(/\.0+$/, ""));

    const identifiableColorNotations = new Set([ ColorNotation.HEX, ColorNotation.RGB, ColorNotation.HSL, ColorNotation.HWB ]);
    const cssColorMap = Object.fromEntries(Object.entries(cssColorsNames).map(([ name, [ r, g, b ] ]) => [ `${r}|${g}|${b}`, name ]));
    const getIdentColorName = color => {
      const [ r, g, b ] = color.channels;
      if (r == 0 && g == 0 && b == 0 && color.alpha == 0)
        return 'transparent';
      if (color.alpha !== 1 || !identifiableColorNotations.has(color.colorNotation))
        return null;
      return cssColorMap[`${255 * r}|${255 * g}|${255 * b}`] ?? null;
    };

    css.walkAtRules(rule => {
      //console.log(`rule: ${rule.name} = ${rule.params}`);
      // TODO: Support animating colors with @keyframes
      if (
        rule.name == 'media' && reAtRuleMediaDark.test(rule.params) ||
        !reAtRuleMediaNameAllowed.test(rule.name)
      ) {
        rule.remove();
      }
    });

    css.walkDecls(decl => {
      let newDeclProp = '-';
      let newDeclValue = null;
      let isComplexValue = false;
      const newTokens = replaceCssComps(parseCssCompCommaList(tokenizeCssValue({ css: decl.value })), (node) => {
        isComplexValue ||= isFunctionNode(node) && !reColorFunction.test(node.getName());
        if (
          isFunctionNode(node) && reColorFunction.test(node.getName()) ||
          isTokenNode(node) && (isTokenHash(node.value) || isTokenIdent(node.value))
        ) {
          // TODO: Deal with color parser producing component value in color alpha property, plus other SyntaxFlag values
          const colorData = parseCssColor(node);
          if (!colorData) {
            isComplexValue = true;
            return;
          }

          let strNode = stringifyNode(node);
          const [ colorRgbStr, colorOkLchStr ] = [ serializeRgb(colorData), serializeP3(colorData) ];
          let colorUniqueKey = `${colorRgbStr}/${colorOkLchStr}`;
          const colorIdent = getIdentColorName(colorData);
          if (isTokenNode(node))
            strNode = strNode.toLowerCase();
          let paletteColor = palette.uniqueColors[colorUniqueKey];
          if (paletteColor === undefined) {
            const paletteVarName = colorIdent ?? roundStrNumbers(strNode)
              .replace(/\./ig, "_").replace(/[^\w\d-]/ig, "-").replace(/-+/g, "-").replace(/^-?(.*?)-?$/, "$1")
              .toLowerCase();
            paletteColor = {
              colorData,
              colorRgb: roundStrNumbers(stringifyNode(colorDataFitsRgbGamut(colorData) ? colorRgbStr : colorOkLchStr)),
              colorOkLch: roundStrNumbers(stringifyNode(serializeOkLch(colorData))),
              colorStr: colorIdent ?? strNode,
              expr: "",
              count: 0,
              name: `--${paletteVarPrefix}-${paletteVarName}`,
            };
            palette.colors.push(paletteColor);
            palette.uniqueColors[colorUniqueKey] = paletteColor;
          }
          paletteColor.count++;
          const paletteResult = `var(${paletteColor.name})`;

          const colorVarPrefix = '';
          const colorVar = (s, i) => `var(--${colorVarPrefix}${String.fromCharCode(s.charCodeAt(0) + i)})`;
          const colorComp = (c, b) => typeof b == 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
          const colorOkLch = (orig, l, c, h) => `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
          const colorAutoTheme = (orig, expr) => `light-dark(${orig.toString()}, ${expr})`;
          const colorDark = colorOkLch(node, 1, 0, 0);
          const colorDarkAuto = colorAutoTheme(node, colorDark);
          const colorDarkFull = colorOkLch(node, 1, 1, 1);
          const colorDarkFullAuto = colorAutoTheme(node, colorDarkFull);
          const colorResult = {
            'dark': colorDark,
            'dark-full': colorDarkFull,
            'dark-auto': colorDarkAuto,
            'dark-full-auto': colorDarkFullAuto,
          }[opts.colorFormula] ?? colorDark;
          paletteColor.expr = colorResult;
          const cssResult = opts.palette ? paletteResult : colorResult;

          if (reColorPropSimple.test(decl.prop) || decl.variable || isComplexValue) {
            //console.log(`simple: ${decl.prop} = ${node.toString()}`);
            newDeclProp = decl.prop;
            return parseCssCompStr(cssResult);
          } else if (reColorPropSplit.test(decl.prop)) {
            //console.log(`split: ${decl.prop} = ... ${node.toString()} ...`);
            newDeclProp = `${decl.prop}-color`;
            newDeclValue = cssResult;
          } else if (reColorPropComplexSplit.test(decl.prop)) {
            // TODO: Split complex values like border(-width|-style|-color)
            newDeclProp = decl.prop;
            return parseCssCompStr(cssResult);
          } else {
            console.log(`unknown: ${decl.prop} = ${decl.value}`);
          }
        }
      });
      if (newDeclProp != '-')
        decl.cloneBefore({ prop: newDeclProp, value: newDeclValue ?? stringifyCssComps(newTokens), important: decl.important });
      decl.remove();
    });

    css.cleanRaws();

    const removeEmptyNodes = (node) => {
      if (!node.nodes)
        return;
      node.nodes = node.nodes.filter(child => {
        removeEmptyNodes(child);
        return child.nodes?.length > 0 || child.type === 'decl';
      });
    };
    removeEmptyNodes(css);

    if (opts.palette) {
      css.prepend(
        new Rule({
          selector: ':root',
          nodes: palette.colors
            .orderBy(c => c.count, (a, b) => b - a)
            .thenBy(c => c.colorRgb, (a, b) => a.localeCompare(b))
            .selectMany(c => [
              new Comment({ text: `color ${c.colorStr} n=${c.count} ${c.colorRgb} ${c.colorOkLch}` }),
              new Declaration({ prop: c.name, value: c.expr }),
            ])
            .toArray(),
        })
      );
    }
  }
});
recolorPlugin.postcss = true;

const basePrettierOptions = {
  tabWidth: 2, endOfLine: 'cr',
  htmlWhitespaceSensitivity: 'ignore',
  trailingComma: 'all', bracketSpacing: true, semi: true,
};

const prettifyCss = async (filepath, css) => (await prettifyCode(css,
  Object.assign(basePrettierOptions, { filepath, printWidth: 999 }))
).trimEnd();

const prettifyHtml = async (filepath, css) => (await prettifyCode(css,
  Object.assign(basePrettierOptions, { filepath, printWidth: 160 }))
).trimEnd();

const downloadSiteHtml = async (siteName, site) => {
  const siteDir = `./sites/${siteName}`;
  site.css ??= {};
  fs.mkdir(siteDir, { recursive: true });

  for (const [ htmlName, htmlUrl ] of Object.entries(site.html)) {
    const htmlPath = `${siteDir}/${htmlName}`;
    console.log(`Downloading HTML ${htmlUrl}`);

    const htmlText = await download(htmlUrl, 'text');
    await fs.writeFile(htmlPath, htmlText);
    console.log(`HTML written to ${siteDir}`);

    const htmlPathPretty = htmlPath.replace(/\.html$/i, ".pretty.html");
    const htmlTextPretty = await prettifyHtml(htmlPath, htmlText);
    await fs.writeFile(htmlPathPretty, htmlTextPretty);
    console.log(`Prettier HTML written to ${htmlPathPretty}`);

    const doc = parseHtmlDocument(htmlText);
    for (const linkCss of htmlSelectAll('link[rel="stylesheet"]', doc)) {
      if (!isHtmlElement(linkCss))
        continue;
      const cssUrl = linkCss.attribs.href;
      let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1];
      cssName = cssName.replace(/[^\w\d\._-]/ig, "");
      if (!cssName.match(/\.css$/i))
        cssName += ".css";
      console.log(`Found CSS link '${cssName}' ${cssUrl}`);
      site.css[cssName] = cssUrl;
    }
  }
};

const recolorCss = async (inputPath, outputPath, opts) => {
  const inputCss = await fs.readFile(inputPath);
  const result = await postCss([
    recolorPlugin(opts),
  ]).process(inputCss, { from: inputPath, parser: safeParser });

  const outputCssPretty = await prettifyCss(outputPath, result.css);
  const outputCssUserstyle = (opts.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Transformed CSS written to ${outputPath}`);
};

const recolorSiteCss = async (siteName, { css, options }) => {
  const siteDir = `./sites/${siteName}`;
  fs.mkdir(siteDir, { recursive: true });

  const downloadOneSiteCss = async (cssName, cssUrl) => {
    const inputPath = `${siteDir}/${cssName}`;
    console.log(`Downloading CSS ${cssUrl}`);

    const inputCss = await withTimeout(download(cssUrl, 'text'), 10000);
    await fs.writeFile(inputPath, inputCss);
    console.log(`Original CSS written to ${inputPath}`);

    const inputPathPretty = inputPath.replace(/\.css$/i, ".pretty.css");
    const inputCssPretty = await prettifyCss(inputPath, inputCss);
    await fs.writeFile(inputPathPretty, inputCssPretty);
    console.log(`Prettier CSS written to ${inputPathPretty}`);

    return { css: inputCssPretty, path: inputPath };
  };

  const recolorOneSiteCss = async (inputPath, extraHeaderLines) => {
    const outputPath = inputPath.replace(/\.css$/i, ".out.css");
    const headerLines = [
      "generated",
      `formula: ${options.colorFormula ?? 'dark'}`,
      `site-name: ${siteName}`,
      ...extraHeaderLines,
    ].map(s => ` * ${s}\n`).join("");
    await recolorCss(inputPath, outputPath, Object.assign(options, {
      header: `/*\n${headerLines} */\n`,
    }));
  };

  if (options.combine) {
    const allCss = [];
    for (const [ cssName, cssUrl ] of Object.entries(css))
      allCss.push({ cssName, cssUrl, ...await downloadOneSiteCss(cssName, cssUrl) });

    const allCssStr = allCss.map(c => c.css).join("\n");
    const allInputPath = `${siteDir}/_.css`;
    await fs.writeFile(allInputPath, allCssStr);
    console.log(`Combined prettier CSS written to ${allInputPath}`);

    await recolorOneSiteCss(allInputPath, allCss.flatMap(c => [
      `file-name: ${c.cssName}`,
      `url: ${c.cssUrl}`,
    ]));
  }
  else {
    for (const [ cssName, cssUrl ] of Object.entries(css)) {
      const { path } = await downloadOneSiteCss(cssName, cssUrl);
      await recolorOneSiteCss(path, [
        `file-name: ${cssName}`,
        `url: ${cssUrl}`,
      ]);
    }
  }
};

const validateRequired = (name) => (input) => input ? true : `Argument ${name} cannot be empty`;

const question = (type, a, name, message, opts, cfg) =>
  Object.assign(cfg ?? {}, {
    type, name, message,
    skip: () => !!a[name],
    initial: () => a[name] ?? opts.initial?.(),
    result: v => a[name] = v,
    validate: validateRequired(name),
  });

const questionInput = (a, name, message, opts) =>
  question('input', a, name, message, opts ?? {});

const questionSelect = (a, name, message, opts) =>
  question('select', a, name, message, opts ?? {}, {
    choices: opts.choices,
  });

const loadJson = async (path) => JSON5.parse(await fs.readFile(path));

const jsonPackage = await loadJson("./package.json");
const jsonSites = await loadJson("./sites.json");

const program = new Command();
const optionColorFormula = new CommandOption('-c, --color-formula', "Color transform formula")
  .choices([ 'dark', 'dark-full', 'dark-auto', 'dark-full-auto' ]);

program
  .name('recolor')
  .version(jsonPackage.version)
  .description(jsonPackage.description);

program
  .command('recolor-css [inputPath] [outputPath]')
  .description("Recolor CSS file")
  .addOption(optionColorFormula)
  .action(async (inputPath, outputPath, o) => {
    const a = Object.assign(o, { inputPath, outputPath });
    if (!a.inputPath?.length) {
      await enquirer.prompt([
        questionInput(a, 'inputPath', "Path to input CSS file:"),
        questionInput(a, 'outputPath', "Path to output CSS file:", {
          initial() {
            const autoOutputPath = a.inputPath.replace(/\.css$/i, '.out.css');
            return a.inputPath != autoOutputPath ? autoOutputPath : undefined;
          }
        }),
      ]);
    }
    await recolorCss(a.inputPath, a.outputPath, { ...a });
  });

program
  .command('recolor-site-css [siteName]')
  .description("Recolor all CSS files of a site defined in sites.json")
  .addOption(optionColorFormula)
  .action(async (siteName, o) => {
    const a = Object.assign(o, { siteName });
    if (!a.siteName?.length) {
      await enquirer.prompt([
        questionSelect(a, 'siteName', "Site to download CSS from:", {
          choices: Object.keys(jsonSites),
        }),
      ]);
    }
    const site = assignDeep(
      { options: {}, html: {}, css: {} },
      jsonSites[a.siteName] ?? throwError(`Site ${a.siteName} not found`));
    site.options.colorFormula ??= o.colorFormula;
    site.options.palette ??= o.palette;
    site.options.combine ??= o.combine;
    if (!site.options.colorFormula) {
      await enquirer.prompt([
        questionSelect(site.options, optionColorFormula.attributeName(), optionColorFormula.description, {
          choices: optionColorFormula.argChoices,
        })
      ]);
    }
    console.log("Site config: ", a.siteName, site);
    await downloadSiteHtml(a.siteName, site);
    await recolorSiteCss(a.siteName, site);
  });

program
  .command('version')
  .description("Show version")
  .action(() => {
    console.log(jsonPackage.version);
  });

try {
  if (process.argv[2] == undefined) {
    program.outputHelp();
    process.exit(1);
  }
  await program.parseAsync(process.argv);
} catch (ex) {
  console.error(`Error running command "${process.argv[2] ?? '<?>'}": ${ex.message}\n${ex.stack}`);
  process.exit(1);
}