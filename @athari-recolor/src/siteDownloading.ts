import { AssertionError } from 'node:assert';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';
import { Exclude, Type } from 'class-transformer';
import {
  parseDocument as parseHtmlDocument,
} from 'htmlparser2';
import {
  textContent as htmlInnerText,
} from 'domutils';
import {
  Document as HtmlDocument,
  Node as HtmlNode,
  Element as HtmlElement,
  Text as HtmlText,
  isTag as isHtmlElement,
  isText as isHtmlText,
  hasChildren as hasHtmlChildren,
} from 'domhandler';
import { getSiteDir, readTextFile, downloadText, htmlQuerySelectorAll, htmlQuerySelector, ColorFormula, assertHasKeys, isString } from './utils.js';
import { prettifyHtml } from './codeFormatting.js';

export class SiteOptions {
  colorFormula: ColorFormula = ColorFormula.Dark;
  palette: boolean = true;
  combine: boolean = true;
}

export class SiteHtml {
  name: string = "";
  url?: string;
  path?: string;
  text?: string;
}

export class SiteCss {
  name: string = "";
  url?: string;
  path?: string;
  text?: string;
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
}

export class SitesConfig {
  @Type(() => Site)
  sites: Site[] = [];
}

function addSiteCss(site: Site, css: SiteCss): boolean {
  site.css ??= [];
  if (css.url && site.css.some(c => c.url === css.url))
    return false;
  site.css.push(css);
  return true;
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
  for (const elLinkCss of htmlQuerySelectorAll(doc, 'link[rel="stylesheet"]')) {
    const cssUrl = new URL(elLinkCss.attribs.href, html.url).toString();
    let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1] ?? '';
    cssName = cssName.replace(/[^\w\d\._-]/ig, "");
    if (!cssName.match(/\.css$/i))
      cssName += ".css";
    if (addSiteCss(site, { name: cssName, url: cssUrl }))
      console.log(`Found CSS link '${cssName}' ${cssUrl}`);
  }
}

async function parseEmbeddedCss(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  let iEmbedStyle = 1;
  for (const elStyle of htmlQuerySelectorAll(doc, 'style:is([type="text/css"], [type=""], :not([type]))')) {
    const cssText = htmlInnerText(elStyle).trim();
    const cssName = html.name.replace(/\.html$/i, `.embed${iEmbedStyle}.css`);
    const cssPath = `${site.dir}/${cssName}`;
    await fs.writeFile(cssPath, cssText);
    if (addSiteCss(site, { name: cssName, path: cssPath, text: cssText }))
      console.log(`Found embedded CSS '${cssName}'`);
    iEmbedStyle++;
  }
}

async function parseNextJSBuildManifest(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  const elBuildManifest = htmlQuerySelector(doc, 'script[src$="buildManifest.js" i]');
  if (!elBuildManifest)
    return;

  const manifestUrl = new URL(elBuildManifest.attribs.src, html.url).toString();
  console.log(`Found Next.js build manifest ${manifestUrl}`);

  const manifestCode = await downloadText(manifestUrl);
  if (!manifestCode)
    return;
  const manifestPath = `${site.dir}/buildManifest.js`;
  await fs.writeFile(manifestPath, manifestCode);

  const manifestCtx: { [key: string]: any; } = {};
  const initCode = `var self = globalThis;`;
  vm.runInNewContext(`${initCode}\n\n${manifestCode}`, manifestCtx, {
    filename: manifestUrl,
    timeout: 10000,
  });
  const manifest: Record<string, string[]> = manifestCtx.__BUILD_MANIFEST;
  if (!manifest)
    return;

  function nextJSRouteToPath(path: string): string {
    return path.substring(1)
      .replace(/\.+/g, '.').replace(/-+/g, '-')
      .replace(/[^a-z0-9\[\]\/#_+-]/ig, '').replace(/\//g, '--');
  }

  console.log(manifestCtx);
  const csss = Object.entries(manifest)
    .selectMany(([ route, chunkUrls ]) => route.startsWith("/")
      ? chunkUrls
        .where(u => /\.css$/i.test(u))
        .select((url, index) => ({
          name: `${nextJSRouteToPath(route)}-${index}.css`,
          url: new URL(`../../${url}`, manifestUrl).toString(),
        }))
      : [])
    .groupByWithSel(c => c.url, c => c.name)
    .select(g => ({
      url: g.key,
      name: g.orderBy(n => n.length, (a, b) => a - b).first(),
    }));
  for (const css of csss)
    if (addSiteCss(site, css))
      console.log(`Found Next.js CSS chunk '${css.name}' ${css.url}`);
}

interface WebpackMinifyCss extends Record<string, any> {
  miniCssF(index: number): string;
}

async function parseWebpackMiniCssChunks(site: Site, doc: HtmlDocument, html: SiteHtml): Promise<void> {
  const elWebpack = htmlQuerySelector(doc, 'script[src*="webpack" i][src$=".js" i]');
  if (!elWebpack)
    return;

  const webpackUrl = new URL(elWebpack.attribs.src, html.url).toString();
  console.log(`Found WebPack script ${webpackUrl}`);

  let webpackCode = await downloadText(webpackUrl);
  if (!webpackCode)
    return;
  // TODO: Find a proper pattern for webpack miniCss hook
  webpackCode = webpackCode.replace("h.nc=void 0", "self.webpack = h;");
  const webpackPath = `${site.dir}/webpack.js`;
  await fs.writeFile(webpackPath, webpackCode);

  const initCode = `var self = globalThis;`;
  const webpackCtx: Record<string, any> = {};
  vm.runInNewContext(`${initCode}\n\n${webpackCode}`, webpackCtx, {
    filename: webpackUrl,
    timeout: 10000,
  });
  const webpack: WebpackMinifyCss = webpackCtx.webpack;
  if (!webpack)
    return;

  console.log("webpack", webpack);
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
    if (addSiteCss(site, { name: cssName, url: cssUrl }))
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