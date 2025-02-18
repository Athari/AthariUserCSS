import { promises as fs } from 'fs';
import postCss from 'postcss';
import safeParser from 'postcss-safe-parser';
import enquirer from 'enquirer';
import JSON5 from 'json5';
import { format as prettifyCode } from 'prettier';
import monkeyutils from '@athari/monkeyutils';
import {
  Command,
  Option as CommandOption,
} from 'commander';
import {
  color as parseCssColor,
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
} from '@csstools/css-tokenizer';
const { assignDeep, throwError } = monkeyutils;

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|tap-highlight|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;
const reAtRuleMediaDark = /prefers-color-scheme\s*:\s*dark/i;
const reAtRuleMediaNameAllowed = /container|media|scope|starting-style|supports/i;

const recolorPlugin = (opts = {}) => ({
  postcssPlugin: 'recolor',
  Once(css) {
    opts = Object.assign({ colorFormula: 'dark' }, opts);
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
          const colorData = parseCssColor(node);
          if (!colorData)
            return;
          const colorVarPrefix = '';
          const colorVar = (s, i) => `var(--${colorVarPrefix}${String.fromCharCode(s.charCodeAt(0) + i)})`;
          const colorComp = (c, b) => typeof b == 'string' ? b : b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
          const colorOkLch = (orig, l, c, h) => `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
          const colorAutoTheme = (orig, expr) => `light-dark(${orig.toString()}, ${expr})`;
          //const colorDark = colorOkLch(node, 1, 0, 'calc(180 - h)');
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
          if (reColorPropSimple.test(decl.prop) || decl.variable || isComplexValue) {
            //console.log(`simple: ${decl.prop} = ${node.toString()}`);
            newDeclProp = decl.prop;
            return parseCssComp(tokenizeCssValue({ css: colorResult }));
          } else if (reColorPropSplit.test(decl.prop)) {
            //console.log(`split: ${decl.prop} = ... ${node.toString()} ...`);
            newDeclProp = `${decl.prop}-color`;
            newDeclValue = colorResult;
          } else if (reColorPropComplexSplit.test(decl.prop)) {
            // TODO: Split complex values
            newDeclProp = decl.prop;
            return parseCssComp(tokenizeCssValue({ css: colorResult }));
          } else {
            console.log(`unknown: ${decl.prop} = ${decl.value}`);
          }
        }/* else if (isFunctionNode(node)) {
          console.log(`unknown function: ${decl.prop} = ${decl.value}`);
        }*/
      });
      if (newDeclProp != '-')
        decl.cloneBefore({ prop: newDeclProp, value: newDeclValue ?? stringifyCssComps(newTokens), important: decl.important });
      decl.remove();
    });
    const removeEmptyNodes = (node) => {
      if (!node.nodes)
        return;
      node.nodes = node.nodes.filter(child => {
        removeEmptyNodes(child);
        return child.nodes?.length > 0 || child.type === 'decl';
      });
    };
    removeEmptyNodes(css);
    css.cleanRaws();
  }
});
recolorPlugin.postcss = true;

const prettifyCss = async (filepath, css) => (await prettifyCode(css, {
  filepath, printWidth: 999, tabWidth: 2, endOfLine: 'cr',
})).trimEnd();

const recolorCss = async (inputPath, outputPath, opts) => {
  const inputCss = await fs.readFile(inputPath, 'utf-8');
  const result = await postCss([
    recolorPlugin(opts),
  ]).process(inputCss, { from: inputPath, parser: safeParser });
  const outputCssPretty = await prettifyCss(outputPath, result.css);
  const outputCssUserstyle = (opts.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle, 'utf-8');
  console.log(`Transformed CSS written to ${outputPath}`);
};

const recolorSiteCss = async (siteName, site, opts) => {
  for (const [ cssName, cssUrl ] of Object.entries(site)) {
    const siteDir = `./sites/${siteName}`;
    fs.mkdir(siteDir, { recursive: true });
    const inputPath = `${siteDir}/${cssName}`;
    const outputPath = inputPath.replace(/\.css$/i, ".out.css");
    console.log(`Downloading CSS ${cssUrl}`);
    const inputCss = await (await fetch(cssUrl, { signal: AbortSignal.timeout(10000) })).text();
    await fs.writeFile(inputPath, inputCss, 'utf-8');
    console.log(`Original CSS written to ${inputPath}`);
    const inputPathPretty = inputPath.replace(/\.css$/i, ".pretty.css");
    const inputCssPretty = await prettifyCss(inputPath, inputCss);
    await fs.writeFile(inputPathPretty, inputCssPretty, 'utf-8');
    console.log(`Prettier CSS written to ${inputPath}`);
    const headerLines = [
      "generated",
      `formula: ${opts.colorFormula ?? 'dark'}`,
      `site-name: ${siteName}`,
      `file-name: ${cssName}`,
      `url: ${cssUrl}`,
    ].map(s => ` * ${s}\n`).join("");
    await recolorCss(inputPath, outputPath, Object.assign(opts, {
      header: `/*\n${headerLines} */\n`,
    }));
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

const loadJson = async (path) => JSON5.parse(await fs.readFile(path, 'utf-8'));

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
            const autoOutputPath = a.inputPath.replace(/\.css$/, '.out.css');
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
    if (!(site.options.colorFormula ??= o.colorFormula)) {
      await enquirer.prompt([
        questionSelect(site.options, optionColorFormula.attributeName(), optionColorFormula.description, {
          choices: optionColorFormula.argChoices,
        })
      ]);
    }
    console.log("Site config: ", a.siteName, site);
    await recolorSiteCss(a.siteName, site.css, site.options);
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