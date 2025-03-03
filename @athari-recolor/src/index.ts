import 'reflect-metadata';
import './fuckUpPrototypes.ts';
import enquirer from 'enquirer';
import { Command, Option } from 'commander';
import { SitesConfig, downloadSiteHtml } from './siteDownloading.ts';
import { recolorCss, recolorSiteCss } from './siteRecoloring.ts';
import { ColorFormula, errorDetail, loadJson, questionInput, questionSelect, throwError } from './utils.ts';

class NpmPackage {
  version: string = "";
  description: string = "";
}

interface RecolorCssCommandOptions {
  colorFormula: ColorFormula;
  inputPath: string;
  outputPath: string;
}

interface RecolorSiteCssCommandOptions {
  colorFormula: ColorFormula;
  siteName: string;
}

const npmPackage: NpmPackage = await loadJson(NpmPackage, "./package.json") ?? throwError("Missing JSON package metadata");
const sites: SitesConfig = await loadJson(SitesConfig, "./sites.json") ?? throwError("Missing JSON site metadata");

const program = new Command();
const optionColorFormula = new Option('-c, --color-formula', "Color transform formula")
  .choices(Object.values(ColorFormula));

program
  .name('recolor')
  .version(npmPackage.version)
  .description(npmPackage.description);

program
  .command('recolor-css [inputPath] [outputPath]')
  .description("Recolor CSS file")
  .addOption(optionColorFormula)
  .action(async (inputPath: string, outputPath: string, o: Partial<RecolorCssCommandOptions>) => {
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
    await recolorCss(a.inputPath, a.outputPath, {
      recolor: { colorFormula: a.colorFormula ?? ColorFormula.Dark },
    });
  });

program
  .command('recolor-site-css [siteName]')
  .description("Recolor all CSS files of a site defined in sites.json")
  .addOption(optionColorFormula)
  .action(async (siteName: string, o: Partial<RecolorSiteCssCommandOptions>) => {
    const a = Object.assign(o, { siteName });
    if (!a.siteName?.length) {
      await enquirer.prompt([
        questionSelect(a, 'siteName', "Site to download CSS from:", {
          choices: sites.sites.map(s => s.name),
        }),
      ]);
    }
    const site = Object.assign(
      { options: {}, html: [], css: [] },
      sites.sites.find(s => s.name == a.siteName) ?? throwError(`Site '${a.siteName}' not found`));
    site.options.recolor ??= {};
    site.options.recolor.colorFormula ??= o.colorFormula as ColorFormula;
    if (!site.options.recolor.colorFormula) {
      await enquirer.prompt([
        questionSelect(site.options.recolor, optionColorFormula.attributeName(), optionColorFormula.description, {
          choices: optionColorFormula.argChoices,
        })
      ]);
    }
    console.log("Site config: ", a.siteName, site);
    await downloadSiteHtml(site);
    await recolorSiteCss(site);
  });

program
  .command('version')
  .description("Show version")
  .action(() => {
    console.log(npmPackage.version);
  });

try {
  if (process.argv[2] == undefined) {
    program.outputHelp();
    process.exit(1);
  }
  await program.parseAsync(process.argv);
} catch (ex: unknown) {
  console.error(`Error running command "${process.argv[2] ?? '<?>'}": ${errorDetail(ex)}`);
  process.exit(1);
}