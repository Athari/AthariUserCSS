import { promises as fs } from 'fs';
import postCss from 'postcss';
import safeParser from 'postcss-safe-parser';
import enquirer from 'enquirer';
import JSON5 from 'json5';
import { format as prettifyCode } from 'prettier';
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

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|tap-highlight|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;
const reAtRuleMediaDark = /prefers-color-scheme\s*:\s*dark/i;
const reAtRuleMediaNameAllowed = /container|media|scope|starting-style|supports/i;

const recolorPlugin = () => ({
  postcssPlugin: 'recolor',
  Once(css) {
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
          const colorDark = colorOkLch(node, 1, 0, 'calc(180 - h)');
          const colorCustomDark = colorOkLch(node, 1, 1, 1);
          const colorCustomAuto = `light-dark(${node}, ${colorCustomDark})`;
          const colorResult = colorDark;
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

const prettifyCss = (filepath, css) => prettifyCode(css, {
  filepath, printWidth: 999, tabWidth: 2,
});

const recolorCss = async (inputPath, outputPath) => {
  const inputCss = await fs.readFile(inputPath, 'utf-8');
  const result = await postCss([
    recolorPlugin,
  ]).process(inputCss, { from: inputPath, parser: safeParser });
  //const outputCss = result.css.replace(/    /g, "  ").replace(/^/mg, "  ");
  const outputCssPretty = await prettifyCss(outputPath, result.css);
  await fs.writeFile(outputPath, outputCssPretty, 'utf-8');
  console.log(`Transformed CSS written to ${outputPath}`);
};

const recolorSiteCss = async (siteName, site) => {
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
    await recolorCss(inputPath, outputPath);
  }
};

const validateRequired = (name) => (input) => input ? true : `Argument ${name} cannot be empty`;

const question = (type, a, name, message, opts, cfg) =>
  Object.assign(cfg ?? {}, {
    type, name, message,
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
program
  .name('recolor')
  .version(jsonPackage.version)
  .description(jsonPackage.description);
  program
  .command('recolor-css [inputPath] [outputPath]')
  .description("Recolor CSS file")
  .action(async (inputPath, outputPath) => {
    const a = { inputPath, outputPath };
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
    await recolorCss(a.inputPath, a.outputPath);
  });
program
  .command('recolor-site-css [siteName]')
  .description("Recolor all CSS files of a site defined in sites.json")
  .addOption()
  .action(async (siteName) => {
    const a = { siteName };
    if (!a.siteName?.length) {
      await enquirer.prompt([
        questionSelect(a, 'siteName', "Site to download CSS from:", {
          choices: Object.keys(jsonSites),
        }),
      ]);
    }
    await recolorSiteCss(a.siteName, jsonSites[a.siteName]);
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