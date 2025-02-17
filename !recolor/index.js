import { promises as fs } from 'fs';
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';
import { Command } from 'commander';
import inquirer from 'inquirer';
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
import packageJson from './package.json' with { type: 'json' };

const reColorFunction = /^rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color$/i;
const reColorPropSimple = /^(-moz-|-webkit-|-ms-|)(color|fill|stroke|(background|outline|text-decoration|text-emphasis|text-outline|accent|column-rule|caret|stop|flood|lighting)-color|border(-top|-right|-left|-bottom|(-block|-inline)(-start|-end)|)-color|scrollbar(-3dlight|-arrow|-base|-darkshadow|-face|-highlight|-shadow|-track|)-color|(box|text)-shadow|background-image)$/i;
const reColorPropSplit = /^(-moz-|-webkit-|-ms-|)(background|outline|text-decoration|column-rule|border(-top|-right|-left|-bottom))$/i;
const reColorPropComplexSplit = /^(-moz-|-webkit-|-ms-|)(border(-block|-inline|))$/i;

const recolorPlugin = () => ({
  postcssPlugin: 'recolor',
  Once(css) {
    css.walkDecls(decl => {
      const originalValue = decl.value;
      const tokens = tokenizeCssValue({ css: originalValue });

      let newDeclProp = '-';
      let newDeclValue = null;
      let isComplexValue = false;
      const newTokens = replaceCssComps(parseCssCompCommaList(tokens), (node) => {
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
          const colorComp = (c, b) => b ? `calc(${colorVar(c, 0)} + ${colorVar(c, 1)} * ${c})` : c;
          const colorOkLch = (orig, l, c, h) => `oklch(from ${orig.toString()} ${colorComp('l', l)} ${colorComp('c', c)} ${colorComp('h', h)})`;
          const colorDark = colorOkLch(node, 1, 0, 0);
          const colorCustomDark = colorOkLch(node, 1, 1, 1);
          const colorCustomAuto = `light-dark(${node}, ${colorCustomDark})`;
          const colorResult = colorCustomDark;
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

async function recolorCSS(inputPath, outputPath) {
  try {
    const inputCss = await fs.readFile(inputPath, 'utf8');
    const result = await postcss([
      recolorPlugin,
    ]).process(inputCss, { from: inputPath, parser: safeParser });
    const outputCss = result.css.replace(/    /g, "  ").replace(/^/mg, "  ");
    await fs.writeFile(outputPath, outputCss, 'utf8');
    console.log(`Transformed CSS written to ${outputPath}`);
  } catch (ex) {
    console.error(`Error processing CSS: ${ex.message}\n${ex.stack}`);
  }
}

const validateRequired = (input) => input ? true : "Argument is required";

const questionInput = (args, name, message) => ({
  type: 'input', name, default: args[name], message, validate: validateRequired,
});

const program = new Command();
program
  .name('recolor')
  .version(packageJson.version)
  .description(packageJson.description);
program
  .command('recolor-css [inputPath] [outputPath]')
  .description("Recolor CSS file")
  .action(async (inputPath, outputPath) => {
    let args = { inputPath, outputPath };
    if (!args.inputPath?.length) {
      args = await inquirer.prompt([
        questionInput(args, 'inputPath', "Path to input CSS file:"),
        questionInput(args, 'outputPath', "Path to output CSS file:"),
      ]);
    }
    if (!args.outputPath?.length) {
      args.outputPath = args.inputPath.replace(/\.css$/, '.out.css');
    }
    await recolorCSS(args.inputPath, args.outputPath);
  });
program
  .command('version')
  .description("Show version")
  .action(() => {
    console.log(packageJson.version);
  });

program.parse(process.argv);
if (!process.argv.slice(2).length)
  program.outputHelp();