import fs from 'node:fs/promises';
import { basename } from 'node:path';
import cssNanoPlugin from 'cssnano';
import cssNanoPresetDeault from 'cssnano-preset-default';
import postCss from 'postcss';
import cssSafeParser from 'postcss-safe-parser';
import autoPrefixerPlugin from 'autoprefixer';
import { getSiteDir, readTextFile } from './utils.js';
import { prettifyCss } from './codeFormatting.js';
import { mergeSimilarSelectorsPlugin } from './mergeSimilarSelectorsPlugin.js';
import { derandomSelectorPlugin } from './derandomSelectorPlugin.js';
import { recolorPlugin } from './recolorPlugin.js';

export async function recolorCss(inputPath, outputPath, opts) {
  const runPostCss = async (css, plugins) => {
    const result = await postCss(plugins).process(css, { from: inputPath, parser: cssSafeParser });
    for (const message of result.messages)
      //console.log(message);
      console.log(`  ${message.plugin}: ${message.type} ${message.node?.toString()}`);
    return result;
  };
  const inputCss = await readTextFile(inputPath);
  let result = await runPostCss(inputCss, [
    autoPrefixerPlugin({ add: false }),
    cssNanoPlugin({
      preset: [
        cssNanoPresetDeault({
          //discardComments: false,
        }),
      ],
    }),
  ]);
  // TODO: Split plugin options
  result = await runPostCss(result.css, [
    mergeSimilarSelectorsPlugin(opts),
    derandomSelectorPlugin(opts),
    recolorPlugin(opts),
  ]);

  const outputCssPretty = await prettifyCss(outputPath, result.css);
  const outputCssUserstyle = (opts.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Transformed CSS written to ${outputPath}`);
}

export async function recolorSiteCss(siteName, site) {
  const { options } = site;
  const siteDir = await getSiteDir(siteName);

  const prettifyOneSiteCss = async (css) => {
    const pathPretty = css.path.replace(/\.css$/i, ".pretty.css");
    const textPretty = await prettifyCss(css.path, css.text);
    await fs.writeFile(pathPretty, textPretty);
    css.text = textPretty;
    console.log(`Prettier CSS written to ${pathPretty}`);
  };

  const downloadOneSiteCss = async (css) => {
    css.path = `${siteDir}/${css.name}`;
    console.log(`Downloading CSS ${css.url}`);
    css.text = await downloadText(css.url, 'text');
    if (!css.text) {
      delete css.path;
      return;
    }
    await fs.writeFile(css.path, css.text);
    console.log(`Original CSS written to ${css.path}`);
    await prettifyOneSiteCss(css);
  };

  const readOneSiteCss = async (css) => {
    css.text = await readTextFile(css.path);
    console.log(`Original CSS read from ${css.path}`);
    await prettifyOneSiteCss(css);
  };

  const recolorOneSiteCss = async (css, extraHeaderLines) => {
    const outputPath = css.path.replace(/\.css$/i, ".out.css");
    const headerLines = [
      "generated",
      `formula: ${options.colorFormula ?? 'dark'}`,
      `site: ${siteName}`,
      ...extraHeaderLines,
    ].map(s => ` * ${s}\n`).join("");
    await recolorCss(css.path, outputPath, Object.assign(options, {
      header: `/*\n${headerLines} */\n`,
    }));
  };

  const getCssHeader = ({ name, path, url }) => [
    `name: ${name}`,
    !url && path ? `path: ${basename(path)}` : null,
    url ? `url: ${url}` : null,
  ].filter(s => s);

  for (const css of site.css.filter(c => c.url && !c.path && !c.text))
    await downloadOneSiteCss(css);
  for (const css of site.css.filter(c => c.path && !c.text))
    await readOneSiteCss(css);
  site.css = site.css.filter(c => c.text);

  if (options.combine) {
    const combinedCss = {
      path: `${siteDir}/_.css`,
      text: site.css.map(c => c.text).join("\n"),
    };
    await fs.writeFile(combinedCss.path, combinedCss.text);
    console.log(`Combined prettier CSS written to ${combinedCss.path}`);
    await recolorOneSiteCss(combinedCss, site.css.flatMap(getCssHeader));
  }
  else {
    for (const css of site.css)
      await recolorOneSiteCss(css, getCssHeader(css));
  }
}