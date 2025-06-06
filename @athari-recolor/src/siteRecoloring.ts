import fs from 'node:fs/promises';
import paths from 'node:path';
import { regex } from 'regex';
import postCss from 'postcss';
import cssSafeParser from 'postcss-safe-parser';
import cssNanoPlugin from 'cssnano';
import cssNanoPresetDefault from 'cssnano-preset-default';
import autoPrefixerPlugin from 'autoprefixer';
import discardEmptyPlugin from 'postcss-discard-empty';
import { PluginKeys, Site, SiteCss, SiteOptions } from './siteDownloading.ts';
import * as plugins from './postCss/index.ts';
import { PostCss } from './css/index.ts';
import { getSiteDir } from './commonUtils.ts';
import { assertHasKeys, deepMerge, downloadText, inspectPretty, objectEntries, readTextFile, throwError } from './utils.ts';

// MARK: Types: Options

interface RecolorOptions extends SiteOptions {
  header: string;
  combine: boolean;
}

type PluginMap = {
  [K in PluginKeys]?: PostCss.PluginCreate<SiteOptions[K]>;
};

// MARK: PostCss

async function runPostCssAsync(inputPath: string, css: string, plugins: PostCss.AcceptedPlugin[]): Promise<string> {
  if (plugins.length === 0)
    return css;
  return processPostCssResult(await createPostCss(inputPath, css, plugins).async());
}

// HACK: Why bother with sync mode, you may ask? Because PostCSS is fucking undebuggable in async mode as debugger skips lines.
function runPostCssSync(inputPath: string, css: string, plugins: PostCss.AcceptedPlugin[]): string {
  if (plugins.length === 0)
    return css;
  return processPostCssResult(createPostCss(inputPath, css, plugins));
}

function createPostCss(inputPath: string, css: string, plugins: PostCss.AcceptedPlugin[]) {
  return postCss(plugins).process(css, { from: inputPath, parser: cssSafeParser });
}

function processPostCssResult(result: PostCss.Result | PostCss.LazyResult): string {
  const groupedMessages = result.messages
    .groupBy(m => m.plugin ?? "?")
    .select(gp => [
      gp.key,
      Object.fromEntries(gp
        .groupBy(m => m.type)
        .select(gt => [ gt.key, gt.count() ])
        .toArray())
    ])
    .toArray();
  if (groupedMessages.length > 0)
    console.log("PostCSS messages: ", inspectPretty(Object.fromEntries(groupedMessages)));

  for (const message of result.messages)
    if (message.type === 'warning')
      console.log(inspectPretty(message));

  return result.css;
};

function optionalPostCssPlugins(opts: SiteOptions, plugins: PluginMap): PostCss.Plugin[] {
  return objectEntries(plugins)
    .map(([ key, plugin ]) => (opts?.[key]?.enabled ?? true) ? plugin?.(opts?.[key]) : null)
    .filter(p => !!p);
}

export async function recolorCss(site: Site, inputPath: string, outputPath: string, opts: RecolorOptions): Promise<void> {
  const inputCss = await readTextFile(inputPath) ?? throwError(`File '${inputPath}' not found`);

  const runCompactCss = (css: string) => runPostCssAsync(inputPath, css, [
    autoPrefixerPlugin({ add: false }),
    ...optionalPostCssPlugins(opts, {
      derandom: plugins.regularTransformerPlugin,
      remove: plugins.regularTransformerPlugin,
      merge: plugins.mergeSelectorsPlugin,
    }),
    cssNanoPlugin({
      preset: [
        cssNanoPresetDefault({
          discardComments: false,
        }),
      ],
    }),
  ]);

  const runRefontCss = (css: string) => runPostCssSync(inputPath, css, [
    ...optionalPostCssPlugins(opts, {
      removeRefont: plugins.regularTransformerPlugin,
      refont: plugins.refontPlugin,
    }),
  ]);

  const runRecolorCss = (css: string) => runPostCssSync(inputPath, css, [
    ...optionalPostCssPlugins(opts, {
      removeRecolor: plugins.regularTransformerPlugin,
      recolor: plugins.recolorPlugin,
    }),
  ]);

  const runCleanCss = (css: string) => runPostCssSync(inputPath, css, [
    plugins.regularTransformerPlugin({
      css: {
        comment: {
          text: { find: regex('i')`^ \s* !ath!`, negate: true },
          operations: { operation: 'remove' },
        },
      },
    }),
    plugins.regularTransformerPlugin({
      css: {
        comment: {
          text: { find: regex('si')`^ \s* !ath! \s* (?<text> .* )` },
          operations: { operation: 'rename', replace: '$<text>' },
        },
      },
    }),
    plugins.finalSolutionPlugin(),
    discardEmptyPlugin(),
  ]);

  const compactCss = await runCompactCss(inputCss);
  const recoloredCss = runRecolorCss(compactCss);
  const refontedCss = runRefontCss(compactCss);
  const combinedCss = [
    opts.recolor?.enabled === true ? recoloredCss : null,
    opts.refont?.enabled === true ? refontedCss : null,
  ].filter(s => !!s).join("\n\n").replaceAll("\r", "").replaceAll("\n", "\r\n").replaceAll(" */", "*/");
  const resultCss = runCleanCss(combinedCss);

  const outputCssPretty = await site.prettifyCode(outputPath, resultCss, 'css');
  const outputCssUserstyle = (opts?.header + outputCssPretty).replace(/^/mg, "  ");
  await fs.writeFile(outputPath, outputCssUserstyle);
  console.log(`Recolored CSS written to ${outputPath}`);
}

// MARK: Download CSS

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

async function transformInlineSiteCss(site: Site, css: SiteCss, opts: SiteOptions): Promise<SiteCss> {
  assertHasKeys(css, 'text');
  css.path = `${site.dir}/${css.name}`;
  const origPath = css.path.replace(/\.css$/i, ".in.css");
  await fs.writeFile(origPath, css.text);
  console.log(`Style attributes CSS written to ${origPath}`);

  css.text = runPostCssSync(origPath, css.text, [
    ...optionalPostCssPlugins(opts, {
      styleAttr: plugins.styleAttrPlugin,
    })
  ]);

  await fs.writeFile(css.path, css.text);
  console.log(`Transformed style attributes CSS written to ${css.path}`);
  return css;
}

// MARK: Recolor Site

async function recolorOneSiteCss(site: Site, css: SiteCss, extraHeaderLines: string[]): Promise<void> {
  assertHasKeys(css, 'path');
  const outputPath = css.path.replace(/\.css$/i, ".out.css");
  const headerLines = [
    "generated",
    `formula: ${site.options.recolor?.formula ?? 'dark'}`,
    `site: ${site.name}`,
    ...extraHeaderLines,
  ].map(s => ` * ${s}\n`).join("");
  const options = deepMerge(null,
    {
      combine: true,
      refs: false,
    },
    site.options,
    {
      header: `/*\n${headerLines} */\n`,
    }) as RecolorOptions;
  await recolorCss(site, css.path, outputPath, options);
}

function getCssHeader({ name, path, url, refs }: SiteCss, opts: SiteOptions): string[] {
  const fileName = path ? paths.basename(path) : null;
  return [
    `name: ${name}`,
    !url && path && fileName !== name ? `path: ${fileName}` : null,
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
  if (site.inlineCss.text)
    site.addCss(await transformInlineSiteCss(site, site.inlineCss, site.options))
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