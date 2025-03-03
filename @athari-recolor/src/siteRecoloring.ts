import fs from 'node:fs/promises';
import { basename } from 'node:path';
import postCss from 'postcss';
import cssSafeParser from 'postcss-safe-parser';
import cssNanoPlugin from 'cssnano';
import cssNanoPresetDefault from 'cssnano-preset-default';
import autoPrefixerPlugin from 'autoprefixer';
import mergeSelectorsPlugin from './mergeSelectorsPlugin.ts';
import derandomSelectorPlugin from './derandomSelectorsPlugin.ts';
import recolorPlugin from './recolorPlugin.ts';
import { prettifyCss } from './codeFormatting.ts';
import type { Site, SiteCss, SiteOptions } from './siteDownloading.ts';
import type { PostCssResult } from './domUtils.ts';
import { assertHasKeys, downloadText, getSiteDir, readTextFile, throwError } from './utils.ts';

interface RecolorOptions extends SiteOptions {
  header: string;
  combine: boolean;
}

async function runPostCss(inputPath: string, css: string, plugins: postCss.AcceptedPlugin[]): Promise<PostCssResult> {
  const result = await postCss(plugins).process(css, { from: inputPath, parser: cssSafeParser });
  for (const message of result.messages)
    console.log(`  ${message.plugin}: ${message.type} ${message.node?.toString().ellipsis(50)}`);
  return result;
}

export async function recolorCss(inputPath: string, outputPath: string, opts: Partial<RecolorOptions> = {}): Promise<void> {
  const inputCss = await readTextFile(inputPath) ?? throwError(`File '${inputPath}' not found`);
  let result = await runPostCss(inputPath, inputCss, [
    autoPrefixerPlugin({ add: false }),
    cssNanoPlugin({
      preset: [
        cssNanoPresetDefault({
          //discardComments: false,
        }),
      ],
    }),
  ]);

  result = await runPostCss(inputPath, result.css, [
    mergeSelectorsPlugin(opts?.mergeSelectors),
    derandomSelectorPlugin(opts?.derandomSelectors),
    recolorPlugin(opts?.recolor),
  ]);

  const outputCssPretty = await prettifyCss(outputPath, result.css);
  const outputCssUserstyle = (opts.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Transformed CSS written to ${outputPath}`);
}

async function prettifyOneSiteCss(site: Site, css: SiteCss): Promise<void> {
  assertHasKeys(css, 'path', 'text');
  const pathPretty = css.path.replace(/\.css$/i, ".pretty.css");
  const textPretty = await prettifyCss(css.path, css.text);
  await fs.writeFile(pathPretty, textPretty);
  css.text = textPretty;
  console.log(`Prettier CSS written to ${pathPretty}`);
}

async function downloadOneSiteCss(site: Site, css: SiteCss): Promise<void> {
  assertHasKeys(css, 'url');
  console.log(`Downloading CSS ${css.url}`);
  const cssText = await downloadText(css.url);
  if (cssText == null)
    return;

  css.text = cssText;
  css.path = `${site.dir}/${css.name}`;
  await fs.writeFile(css.path, css.text);
  console.log(`Original CSS written to ${css.path}`);
  await prettifyOneSiteCss(site, css);
}

async function readOneSiteCss(site: Site, css: SiteCss): Promise<void> {
  assertHasKeys(css, 'path');
  const cssText = await readTextFile(css.path);
  if (cssText == null)
    return;

  css.text = cssText;
  console.log(`Original CSS read from ${css.path}`);
  await prettifyOneSiteCss(site, css);
}

async function recolorOneSiteCss(site: Site, css: SiteCss, extraHeaderLines: string[]): Promise<void> {
  assertHasKeys(css, 'path');
  const outputPath = css.path.replace(/\.css$/i, ".out.css");
  const headerLines = [
    "generated",
    `formula: ${site.options.recolor?.colorFormula ?? 'dark'}`,
    `site: ${site.name}`,
    ...extraHeaderLines,
  ].map(s => ` * ${s}\n`).join("");
  await recolorCss(css.path, outputPath, {
    ...site.options,
    header: `/*\n${headerLines} */\n`,
  });
}

function getCssHeader({ name, path, url }: SiteCss): string[] {
  return [
    `name: ${name}`,
    !url && path ? `path: ${basename(path)}` : null,
    url ? `url: ${url}` : null,
  ].filter(s => s !== null);
}

export async function recolorSiteCss(site: Site): Promise<void> {
  const { options } = site;
  site.dir = await getSiteDir(site.name);

  for (const css of site.css.filter(c => c.url && !c.path && !c.text))
    await downloadOneSiteCss(site, css);
  for (const css of site.css.filter(c => c.path && !c.text))
    await readOneSiteCss(site, css);
  site.css = site.css.filter(c => c.text);

  if (options.combine) {
    const combinedPath = `${site.dir}/_.css`;
    const combinedText = site.css.map(c => c.text).join("\n");
    const css: SiteCss = { name: 'combined', path: combinedPath, text: combinedText };
    await fs.writeFile(combinedPath, combinedText);
    console.log(`Combined prettier CSS written to ${combinedPath}`);
    await recolorOneSiteCss(site, css, site.css.flatMap(getCssHeader));
  } else {
    for (const css of site.css)
      await recolorOneSiteCss(site, css, getCssHeader(css));
  }
}