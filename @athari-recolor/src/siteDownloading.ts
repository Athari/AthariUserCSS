import fs from 'node:fs/promises';
import paths from 'node:path';
import vm from 'node:vm';
import { Exclude, Type } from 'class-transformer';
import { WritableKeys } from 'utility-types';
import { regex } from 'regex';
import { format as prettifyCode, Options as PrettierOptions } from 'prettier';
import { getSiteDir } from './commonUtils.ts';
import { Sel } from './css/index.ts';
import { Html } from './html/index.ts';
import {
  Assigned, Opt, OptObject,
  assertHasKeys, compare, deepMerge, downloadText, isArray, isString, logError, objectEntries, objectKeys, objectValues, readTextFile, throwError,
} from './utils.ts';

// MARK: Types: Options

export interface OptionalPlugin {
  enabled?: Opt<boolean>;
};

export type PluginOptions<T> = OptObject<T & OptionalPlugin>;

export type PluginKeys = Assigned<{
  [K in keyof SiteOptions]: SiteOptions[K] extends PluginOptions<any> ? K : never
}[keyof SiteOptions]>;

export class SiteOptions {
  recolor?: PluginOptions<import('./postCss/recolorPlugin.ts').RecolorPluginOptions>;
  derandom?: PluginOptions<import('./postCss/regularTransformerPlugin.ts').RegularTransformerPluginOptions>;
  merge?: PluginOptions<import('./postCss/mergeSelectorsPlugin.ts').MergeSelectorsPluginOptions>;
  remove?: PluginOptions<import('./postCss/regularTransformerPlugin.ts').RegularTransformerPluginOptions>;
  styleAttr?: PluginOptions<import('./postCss/styleAttrPlugin.ts').StyleAttrPluginOptions>;
  encoding?: Opt<string> = 'utf-8';
  combine?: Opt<boolean> = true;
  refs?: Opt<boolean> = false;
}

export class SiteFormat {
  default?: Opt<PrettierOptions>;
  html?: Opt<PrettierOptions>;
  css?: Opt<PrettierOptions>;
}

// MARK: Types: Links

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

// MARK: Types: Site

export class Site {
  name: string = "";

  @Type(() => SiteOptions)
  options: SiteOptions = new SiteOptions();

  @Type(() => SiteFormat)
  format: SiteFormat = new SiteFormat();

  @Type(() => SiteHtml)
  html: SiteHtml[] = [];

  @Type(() => SiteCss)
  css: SiteCss[] = [];

  @Type(() => SiteCss)
  inlineCss: SiteCss = new SiteCss({ name: "inline-style-attrs.css" });

  @Exclude()
  dir: string = "";

  async downloadText(url: string): Promise<string | null> {
    return await downloadText(url, { encoding: this.options.encoding });
  }

  hydrate(root: SitesConfig) {
    // HACK: When properly typed, these expressions murder performance, so fuck them
    this.options = (deepMerge as any)(null, new SiteOptions(), root.options.default, this.options) as SiteOptions;
    this.format = (deepMerge as any)(null, new SiteFormat(), root.format, this.format) as SiteFormat;
  }

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

  async #prettifyCodeSafe(filepath: string, source: string, options: PrettierOptions): Promise<string> {
    try {
      const pretty = await prettifyCode(source, { filepath, ...options });
      return pretty.trimEnd();
    } catch (ex: unknown) {
      logError(ex, `Failed to prettify ${filepath}, keeping formatting`);
      return source.trimEnd();
    }
  }

  async prettifyCode(filepath: string, source: string, lang: keyof SiteFormat): Promise<string> {
    const options = deepMerge(null, {} as PrettierOptions, this.format.default, this.format.css);
    return await this.#prettifyCodeSafe(filepath, source, options);
  }
}

// MARK: Types: Sites Config

export class SitesConfigOptions {
  @Type(() => SiteOptions)
  default: SiteOptions = new SiteOptions();
}

export class SitesConfig {
  @Type(() => SitesConfigOptions)
  options: SitesConfigOptions = new SitesConfigOptions();

  @Type(() => SiteFormat)
  format: SiteFormat = new SiteFormat();

  @Type(() => Site)
  sites: Site[] = [];

  @Exclude()
  default: Site = new Site();

  hydrate() {
    for (const site of this.sites)
      site.hydrate(this);
  }
}

// MARK: Download: HTML

async function downloadOneSiteHtml(site: Site, html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'url');
  console.log(`Downloading HTML ${html.url}`);
  const htmlText = await site.downloadText(html.url);
  if (htmlText == null)
    return;

  html.text = htmlText;
  html.path = `${site.dir}/${html.name}`;
  await fs.writeFile(html.path, html.text);
  console.log(`HTML written to ${html.path}`);
  await prettifyOneSiteHtml(site, html);
}

async function readOneSiteHtml(site: Site, html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'path');
  const htmlText = await readTextFile(html.path);
  if (htmlText == null)
    return;

  html.text = htmlText;
  console.log(`Original HTML read from ${html.path}`);
  await prettifyOneSiteHtml(site, html);
}

async function prettifyOneSiteHtml(site: Site, html: SiteHtml): Promise<void> {
  assertHasKeys(html, 'path', 'text');
  const pathPretty = html.path.replace(/\.html$/i, ".pretty.html");
  const textPretty = await site.prettifyCode(html.path, html.text, 'html');
  await fs.writeFile(pathPretty, textPretty);
  console.log(`Prettier HTML written to ${pathPretty}`);
}

// MARK: Download: CSS

async function parseLinkedCss(site: Site, doc: Html.Document, html: SiteHtml): Promise<void> {
  for (const elLinkCss of doc.querySelectorAll('link[rel="stylesheet"][href]')) {
    const cssUrl = new URL(elLinkCss.attribs.href!, html.url).toString();
    let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1] ?? '';
    cssName = cssName.replace(/[^\w\d\._-]/ig, "");
    if (!cssName.match(/\.css$/i))
      cssName += ".css";
    if (site.addCss(new SiteCss({ name: cssName, url: cssUrl }, `[link] ${html.asRef}`)))
      console.log(`Found CSS link '${cssName}' ${cssUrl}`);
  }
}

async function parseEmbeddedCss(site: Site, doc: Html.Document, html: SiteHtml): Promise<void> {
  let iEmbedStyle = 1;
  for (const elStyle of doc.querySelectorAll('style:is([type="text/css"], [type=""], :not([type]))')) {
    const cssText = elStyle.innerTextAll.trim();
    const cssName = html.name.replace(/\.html$/i, `.embed${iEmbedStyle}.css`);
    const cssPath = `${site.dir}/${cssName}`;
    await fs.writeFile(cssPath, cssText);
    if (site.addCss(new SiteCss({ name: cssName, path: cssPath, text: cssText }, `[style] ${html.asRef}`)))
      console.log(`Found embedded CSS '${cssName}'`);
    iEmbedStyle++;
  }
}

async function parseStyleAttributes(site: Site, doc: Html.Document, html: SiteHtml): Promise<void> {
  const skipSelAttrs = new Set([ 'id', 'class', 'style' ]);
  const obsoleteAttrs = { color: 'color', bgcolor: 'background-color', bordercolor: 'border-color' };
  const reIdent = regex('i')`
    ^
    [ a-z _ \- ]
    [ a-z 0-9 _ \- ]+
    $ `;

  const styleDecls: string[] = [];
  for (const el of doc.querySelectorAll('[style]')) {
    const attrStyle = el.attribs.style ?? throwError("missing style attribute");
    styleDecls.push(`${buildTagSelector(el)}[style] {\n  ${attrStyle}\n}`);
  }

  for (const el of doc.querySelectorAll(objectKeys(obsoleteAttrs).map(a => `[${a}]`).join(", "))) {
    for (const [ attrName, ruleName ] of objectEntries(obsoleteAttrs)) {
      const attrValue = el.attribs[attrName];
      if (!attrValue)
        continue;
      const sel = buildTagSelector(el);
      sel.first.append(Sel.attribute(attrName, '=', attrValue));
      styleDecls.push(`${sel} {\n  ${ruleName}: ${attrValue}\n}`);
    }
  }

  site.inlineCss.text ??= "";
  site.inlineCss.text += styleDecls.join("\n");
  site.inlineCss.refs.add(html.asRef);
  return;

  function buildTagSelector(el: Html.Element) {
    const sel = Sel.selector([ Sel.tag(el.tagName) ]);
    if (el.attribs.id)
      sel.append(Sel.id(el.attribs.id));
    if (el.attribs.class) {
      const classNames = el.attribs.class.split(/\s+/).map(s => s.trim()).filter(s => s.length > 0);
      sel.nodes.push(...classNames.map(cls => Sel.className(cls)));
    }
    for (const attr of el.attributes.filter(a => !skipSelAttrs.has(a.name) && !(a.name in obsoleteAttrs)))
      if (reIdent.test(attr.name))
        sel.append(Sel.attribute(attr.name, '=', attr.value));
    return Sel.root([ sel ]);
  }
}

// MARK: Download: Next.JS

async function parseNextJSBuildManifest(site: Site, doc: Html.Document, html: SiteHtml): Promise<void> {
  const elBuildManifest = doc.querySelector('script[src$="buildManifest.js" i]');
  if (!elBuildManifest)
    return;

  const manifestUrl = new URL(elBuildManifest.attribs.src!, html.url).toString();
  console.log(`Found Next.js build manifest ${manifestUrl}`);

  const manifestCode = await site.downloadText(manifestUrl);
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
  const csss = objectEntries(manifest)
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
      name: g.select(c => c.name).orderBy(n => n.length, compare).first(),
      routes: g.select(c => c.route).toArray()
    }));
  for (const css of csss)
    if (site.addCss(new SiteCss(css, css.routes.map(r => `[nextjs] route (path: ${r}) ${html.asRef}`))))
      console.log(`Found Next.js CSS chunk '${css.name}' ${css.url}`);
}

// MARK: Download: WebPack

interface WebpackMinifyCss extends Record<string, unknown> {
  miniCssF(index: number): string;
}

async function parseWebpackMiniCssChunks(site: Site, doc: Html.Document, html: SiteHtml): Promise<void> {
  const elWebpack = doc.querySelector('script[src*="webpack" i][src$=".js" i]');
  if (!elWebpack)
    return;

  const webpackUrl = new URL(elWebpack.attribs.src!, html.url).toString();
  console.log(`Found WebPack script ${webpackUrl}`);

  let webpackCode = await site.downloadText(webpackUrl);
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
  const urlPrefix = objectValues(webpack).filter(isString).find(v => v.startsWith("https://")) ?? "";
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
    const cssName = paths.basename(cssUrl);
    if (site.addCss(new SiteCss({ name: cssName, url: cssUrl }, `[webpack] chunk (#${iChunk}) ${html.asRef}`)))
      console.log(`Found Next.js CSS chunk #${iChunk} '${cssName}' ${cssUrl}`);
  }
}

// MARK: Download: Site

export async function downloadSiteHtml(site: Site): Promise<void> {
  site.dir = await getSiteDir(site.name);

  for (const html of site.html.filter(h => h.url && !h.path && !h.text))
    await downloadOneSiteHtml(site, html);
  for (const html of site.html.filter(h => h.path && !h.text))
    await readOneSiteHtml(site, html);

  for (const html of site.html.filter(c => c.text)) {
    assertHasKeys(html, 'text');
    const doc = Html.parseDocument(html.text);
    await parseLinkedCss(site, doc, html);
    await parseEmbeddedCss(site, doc, html);
    await parseStyleAttributes(site, doc, html);
    await parseNextJSBuildManifest(site, doc, html);
    await parseWebpackMiniCssChunks(site, doc, html);
  }
}