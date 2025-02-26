import enquirer from 'enquirer';
import { initializeLinq } from 'linq-to-typescript'
import S from 'string';
import monkeyutils from '@athari/monkeyutils'
const { assignDeep, throwError } = monkeyutils;
import {
  Command,
  Option as CommandOption,
} from 'commander';
import { loadJson } from './utils.js';
import { downloadSiteHtml } from './siteDownloading.js';
import { recolorSiteCss } from './siteRecoloring.js';

initializeLinq();
S.extendPrototype();
String.prototype.ellipsis = function (maxLength) {
  return this.length > maxLength ? this.substring(0, maxLength - 3) + "..." : this;
};

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
      { options: {}, html: [], css: [] },
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