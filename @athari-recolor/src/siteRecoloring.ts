import fs from 'node:fs/promises';
import { basename } from 'node:path';
import postCss from 'postcss';
import cssSafeParser from 'postcss-safe-parser';
import cssNanoPlugin from 'cssnano';
import cssNanoPresetDefault from 'cssnano-preset-default';
import autoPrefixerPlugin from 'autoprefixer';
import removerPlugin from './removerPlugin.ts';
import mergeSelectorsPlugin from './mergeSelectorsPlugin.ts';
import derandomSelectorPlugin from './derandomSelectorsPlugin.ts';
import recolorPlugin from './recolorPlugin.ts';
import { Site, SiteCss, SiteOptions } from './siteDownloading.ts';
import type { PostCssResult } from './domUtils.ts';
import { assertHasKeys, deepMerge, downloadText, getSiteDir, readTextFile, throwError } from './utils.ts';

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

export async function recolorCss(site: Site, inputPath: string, outputPath: string, opts: RecolorOptions): Promise<void> {
  const inputCss = await readTextFile(inputPath) ?? throwError(`File '${inputPath}' not found`);
  let result = await runPostCss(inputPath, inputCss, [
    autoPrefixerPlugin({ add: false }),
    removerPlugin(opts?.remove),
    cssNanoPlugin({
      preset: [
        cssNanoPresetDefault({
          //discardComments: false,
        }),
      ],
    }),
  ]);

  result = await runPostCss(inputPath, result.css, [
    mergeSelectorsPlugin(opts?.merge),
    derandomSelectorPlugin(opts?.derandom),
    recolorPlugin(opts?.recolor),
  ]);

  const outputCssPretty = await site.prettifyCode(outputPath, result.css, 'css');
  const outputCssUserstyle = (opts?.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Transformed CSS written to ${outputPath}`);
}

async function prettifyOneSiteCss(site: Site, css: SiteCss): Promise<void> {
  assertHasKeys(css, 'path', 'text');
  const pathPretty = css.path.replace(/\.css$/i, ".pretty.css");
  const textPretty = await site.prettifyCode(css.path, css.text, 'css');
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
  const options = deepMerge(null,
    {
      combine: true,
      refs: false,
    },
    // HACK: Why type assert needed?
    site.options as RecolorOptions,
    {
      header: `/*\n${headerLines} */\n`,
    });
  await recolorCss(site, css.path, outputPath, options);
}

function getCssHeader({ name, path, url, refs }: SiteCss, opts: SiteOptions): string[] {
  return [
    `name: ${name}`,
    //!url && path ? `path: ${basename(path)}` : null, // == name
    url ? `url: ${url}` : null,
    ...opts.refs ? [...refs.values()].map(r => `ref: ${r}`) : [],
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
    const css = new SiteCss({ name: 'combined', path: combinedPath, text: combinedText }, 'combined');
    await fs.writeFile(combinedPath, combinedText);
    console.log(`Combined prettier CSS written to ${combinedPath}`);
    await recolorOneSiteCss(site, css, site.css.flatMap(c => getCssHeader(c, site.options)));
  } else {
    for (const css of site.css)
      await recolorOneSiteCss(site, css, getCssHeader(css, site.options));
  }
}