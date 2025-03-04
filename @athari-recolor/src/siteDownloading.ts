import fs from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';
import { Exclude, Type } from 'class-transformer';
import { WritableKeys } from 'utility-types';
import type { MergeSelectorsPluginOptions } from './mergeSelectorsPlugin.ts';
import type { DerandomSelectorsPluginOptions } from './derandomSelectorsPlugin.ts';
import type { RecolorPluginOptions } from './recolorPlugin.ts';
import type { RemoverPluginOptions } from './removerPlugin.ts';
import { prettifyHtml } from './codeFormatting.ts';
import {
  HtmlDocument,
  parseHtmlDocument, htmlQuerySelectorAll, htmlQuerySelector, getHtmlAllInnerText,
} from './domUtils.ts';
import {
  assertHasKeys, downloadText, getSiteDir, isArray, isString, readTextFile,
} from './utils.ts';

export class SiteOptions {
  recolor?: Partial<RecolorPluginOptions> | undefined;
  derandomSelectors?: Partial<DerandomSelectorsPluginOptions> | undefined;
  mergeSelectors?: Partial<MergeSelectorsPluginOptions> | undefined;
  remove?: Partial<RemoverPluginOptions> | undefined;
  combine: boolean = true;
  refs: boolean = false;
}

export class SiteHtml {
  name: string = "";
  url?: string;
  path?: string;
  text?: string;

  readonly refs: Set<string> = new Set();

  constructor(opts?: Pick<SiteHtml, WritableKeys<SiteHtml>>, refs?: string[] | string) {
    Object.assign(this, opts);
    if (refs)
      for (const ref of isArray(refs) ? refs : [ refs ])
        this.refs.add(ref);
  }

  get asRef(): string {
    return `html (${[
      `name: ${this.name}`,
      this.url ? `url: ${this.url}` : null,
    ].filter(s => !!s).join(", ")})`;
  }
}

export class SiteCss {
  name: string = "";
  url?: string;
  path?: string;
  text?: string;

  readonly refs: Set<string> = new Set();

  constructor(opts?: Pick<SiteCss, WritableKeys<SiteCss>>, refs?: string[] | string) {
    Object.assign(this, opts);
    if (refs)
      for (const ref of isArray(refs) ? refs : [ refs ])
        this.refs.add(ref);
  }

  get asRef(): string {
    return `css (${[
      `name: ${this.name}`,
      this.url ? `url: ${this.url}` : null,
    ].filter(s => !!s).join(", ")})`;
  }
}

export class Site {
  name: string = "";

  @Type(() => SiteOptions)
  options: SiteOptions = new SiteOptions();

  @Type(() => SiteHtml)
  html: SiteHtml[] = [];

  @Type(() => SiteCss)
  css: SiteCss[] = [];

  @Exclude()
  dir: string = "";

  addCss(css: SiteCss): boolean {
    this.css ??= [];
  
    if (css.url) {
      const existingCss = this.css.find(c => c.url === css.url);
      if (existingCss) {
        for (const ref of css.refs)
          existingCss.refs.add(ref);
        return false;
      }
    }
  
    this.css.push(css);
    return true;
  }
}

export class SitesConfig {
  @Type(() => Site)
  sites: Site[] = [];
}

async function downloadOneSiteHtml(site: Site, html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'path', 'url');
  console.log(`Downloading HTML ${html.url}`);
  const htmlText = await downloadText(html.url);
  if (htmlText == null)
    return;

  html.text = htmlText;
  html.path = `${site.dir}/${html.name}`;
  await fs.writeFile(html.path, html.text);
  console.log(`HTML written to ${html.path}`);
  await prettifyOneSiteHtml(html);
}

async function readOneSiteHtml(_: Site, html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'path');
  const htmlText = await readTextFile(html.path);
  if (htmlText == null)
    return;

  html.text = htmlText;
  console.log(`Original HTML read from ${html.path}`);
  await prettifyOneSiteHtml(html);
}

async function prettifyOneSiteHtml(html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'path', 'text');
  const pathPretty = html.path.replace(/\.html$/i, ".pretty.html");
  const textPretty = await prettifyHtml(html.path, html.text);
  await fs.writeFile(pathPretty, textPretty);
  console.log(`Prettier HTML written to ${pathPretty}`);
}

async function parseLinkedCss(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  for (const elLinkCss of htmlQuerySelectorAll(doc, 'link[rel="stylesheet"][href]')) {
    const cssUrl = new URL(elLinkCss.attribs.href!, html.url).toString();
    let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1] ?? '';
    cssName = cssName.replace(/[^\w\d\._-]/ig, "");
    if (!cssName.match(/\.css$/i))
      cssName += ".css";
    if (site.addCss(new SiteCss({ name: cssName, url: cssUrl }, `[link] ${html.asRef}`)))
      console.log(`Found CSS link '${cssName}' ${cssUrl}`);
  }
}

async function parseEmbeddedCss(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  let iEmbedStyle = 1;
  for (const elStyle of htmlQuerySelectorAll(doc, 'style:is([type="text/css"], [type=""], :not([type]))')) {
    const cssText = getHtmlAllInnerText(elStyle).trim();
    const cssName = html.name.replace(/\.html$/i, `.embed${iEmbedStyle}.css`);
    const cssPath = `${site.dir}/${cssName}`;
    await fs.writeFile(cssPath, cssText);
    if (site.addCss(new SiteCss({ name: cssName, path: cssPath, text: cssText }, `[style] ${html.asRef}`)))
      console.log(`Found embedded CSS '${cssName}'`);
    iEmbedStyle++;
  }
}

async function parseNextJSBuildManifest(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  const elBuildManifest = htmlQuerySelector(doc, 'script[src$="buildManifest.js" i]');
  if (!elBuildManifest)
    return;

  const manifestUrl = new URL(elBuildManifest.attribs.src!, html.url).toString();
  console.log(`Found Next.js build manifest ${manifestUrl}`);

  const manifestCode = await downloadText(manifestUrl);
  if (!manifestCode)
    return;
  const manifestPath = `${site.dir}/buildManifest.js`;
  await fs.writeFile(manifestPath, manifestCode);

  const manifestCtx: { [key: string]: unknown; } = {};
  const initCode = `var self = globalThis;`;
  vm.runInNewContext(`${initCode}\n\n${manifestCode}`, manifestCtx, {
    filename: manifestUrl,
    timeout: 10000,
  });
  const manifest = manifestCtx.__BUILD_MANIFEST as Record<string, string[]>;
  if (!manifest)
    return;

  function nextJSRouteToPath(path: string): string {
    return path.substring(1)
      .replace(/\.+/g, '.').replace(/-+/g, '-')
      .replace(/[^a-z0-9\[\]\/#_+-]/ig, '').replace(/\//g, '--');
  }

  //console.log("manifest:", manifest);
  const csss = Object.entries(manifest)
    .selectMany(([ route, chunkUrls ]) => route.startsWith("/")
      ? [...chunkUrls]
        .where(u => /\.css$/i.test(u))
        .select((url, index) => ({
          name: `${nextJSRouteToPath(route)}-${index}.css`,
          url: new URL(`../../${url}`, manifestUrl).toString(),
          route,
        }))
      : [])
    .groupBy(c => c.url)
    .select(g => ({
      url: g.key,
      name: g.select(c => c.name).orderBy(n => n.length, (a, b) => a - b).first(),
      routes: g.select(c => c.route).toArray()
    }));
  for (const css of csss)
    if (site.addCss(new SiteCss(css, css.routes.map(r => `[nextjs] route (path: ${r}) ${html.asRef}`))))
      console.log(`Found Next.js CSS chunk '${css.name}' ${css.url}`);
}

interface WebpackMinifyCss extends Record<string, unknown> {
  miniCssF(index: number): string;
}

async function parseWebpackMiniCssChunks(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  const elWebpack = htmlQuerySelector(doc, 'script[src*="webpack" i][src$=".js" i]');
  if (!elWebpack)
    return;

  const webpackUrl = new URL(elWebpack.attribs.src!, html.url).toString();
  console.log(`Found WebPack script ${webpackUrl}`);

  let webpackCode = await downloadText(webpackUrl);
  if (!webpackCode)
    return;
  // TODO: Find a proper pattern for webpack miniCss hook
  webpackCode = webpackCode.replace("h.nc=void 0", "self.webpack = h;");
  const webpackPath = `${site.dir}/webpack.js`;
  await fs.writeFile(webpackPath, webpackCode);

  const initCode = `var self = globalThis;`;
  const webpackCtx: Record<string, unknown> = {};
  vm.runInNewContext(`${initCode}\n\n${webpackCode}`, webpackCtx, {
    filename: webpackUrl,
    timeout: 10000,
  });
  const webpack = webpackCtx.webpack as WebpackMinifyCss;
  if (!webpack)
    return;

  //console.log("webpack", webpack);
  const urlPrefix = Object.values(webpack).find(v => isString(v) && v.startsWith("https://")) as string;
  let emptyUrlCount = 0;
  for (let iChunk = 0; iChunk < 1_000_000; iChunk++) {
    const cssUrl = urlPrefix + webpack.miniCssF(iChunk);
    if (cssUrl.includes('undefined')) {
      emptyUrlCount++;
      if (emptyUrlCount > 100_000)
        return;
      continue;
    }
    emptyUrlCount = 0;
    const cssName = basename(cssUrl);
    if (site.addCss(new SiteCss({ name: cssName, url: cssUrl }, `[webpack] chunk (#${iChunk}) ${html.asRef}`)))
      console.log(`Found Next.js CSS chunk #${iChunk} '${cssName}' ${cssUrl}`);
  }
}

export async function downloadSiteHtml(site: Site): Promise<void> {
  site.dir = await getSiteDir(site.name);

  for (const html of site.html)
    html.path ??= `${site.dir}/${html.name}`;
  for (const html of site.html.filter(h => h.url && !h.path && !h.text))
    await downloadOneSiteHtml(site, html);
  for (const html of site.html.filter(h => h.path && !h.text))
    await readOneSiteHtml(site, html);

  for (const html of site.html.filter(c => c.text)) {
    assertHasKeys(html, 'text');
    const doc = parseHtmlDocument(html.text);
    await parseNextJSBuildManifest(site, doc, html);
    await parseWebpackMiniCssChunks(site, doc, html);
    await parseLinkedCss(site, doc, html);
    await parseEmbeddedCss(site, doc, html);
  }
}