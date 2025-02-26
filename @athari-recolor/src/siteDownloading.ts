import fs from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';
import monkeyutils from '@athari/monkeyutils'
const { isString } = monkeyutils;
import {
  parseDocument as parseHtmlDocument,
} from 'htmlparser2';
import {
  Document as HtmlDocument,
  Node as HtmlNode,
  Element as HtmlElement,
  Text as HtmlText,
  isTag as isHtmlElement,
  isText as isHtmlText,
  hasChildren as hasHtmlChildren,
} from 'domhandler';
import {
  selectOne as htmlSelectOne,
  selectAll as htmlSelectAll,
} from 'css-select';
import {
  textContent as htmlInnerText,
} from 'domutils';
import { getSiteDir, readTextFile } from './utils.js';
import { prettifyHtml } from './codeFormatting.js';

export async function downloadSiteHtml(siteName, site) {
  const siteDir = await getSiteDir(siteName);

  const addSiteCss = (css) => {
    site.css ??= [];
    // TODO: Specify CSS source for debugging
    if (css.url && site.css.some(c => c.url == css.url))
      return false;
    site.css.push(css);
    return true;
  };

  const prettifyOneSiteHtml = async (html) => {
    const pathPretty = html.path.replace(/\.html$/i, ".pretty.html");
    const textPretty = await prettifyHtml(html.path, html.text);
    await fs.writeFile(pathPretty, textPretty);
    console.log(`Prettier HTML written to ${pathPretty}`);
  };

  const downloadOneSiteHtml = async (html) => {
    html.path = `${siteDir}/${html.name}`;
    console.log(`Downloading HTML ${html.url}`);
    html.text = await downloadText(html.url);
    if (!html.text) {
      delete html.path;
      return;
    }
    await fs.writeFile(html.path, html.text);
    console.log(`HTML written to ${html.path}`);
    await prettifyOneSiteHtml(html);
  };

  const readOneSiteHtml = async (html) => {
    html.text = await readTextFile(html.path);
    console.log(`Original HTML read from ${html.path}`);
    await prettifyOneSiteHtml(html);
  };

  const parseLinkedCss = async (doc, html) => {
    for (const elLinkCss of htmlSelectAll('link[rel="stylesheet"]', doc)) {
      if (!isHtmlElement(elLinkCss))
        continue;
      const cssUrl = new URL(elLinkCss.attribs.href, html.url).toString();
      let cssName = cssUrl.match(/.*\/([^#]+)/)?.[1];
      cssName = cssName.replace(/[^\w\d\._-]/ig, "");
      if (!cssName.match(/\.css$/i))
        cssName += ".css";
      if (addSiteCss({ name: cssName, url: cssUrl }))
        console.log(`Found CSS link '${cssName}' ${cssUrl}`);
    }
  };

  const parseEmbeddedCss = async (doc, html) => {
    let iEmbedStyle = 1;
    for (const elStyle of htmlSelectAll('style:is([type="text/css"], [type=""], :not([type]))', doc)) {
      if (!isHtmlElement(elStyle))
        continue;
      const cssText = htmlInnerText(elStyle).trim();
      const cssName = html.name.replace(/\.html$/i, `.embed${iEmbedStyle}.css`);
      const cssPath = `${siteDir}/${cssName}`;
      await fs.writeFile(cssPath, cssText);
      if (addSiteCss({ name: cssName, path: cssPath, text: cssText }))
        console.log(`Found embedded CSS '${cssName}'`);
      iEmbedStyle++;
    }
  };

  const parseNextJSBuildManifest = async (doc, html) => {
    let elBuildManifest = htmlSelectOne('script[src$="buildManifest.js" i]', doc);
    if (!elBuildManifest || !isHtmlElement(elBuildManifest))
      return;

    const manifestUrl = new URL(elBuildManifest.attribs.src, html.url).toString();
    console.log(`Found Next.js build manifest ${manifestUrl}`);

    const manifestCode = await downloadText(manifestUrl);
    if (!manifestCode)
      return;
    const manifestPath = `${siteDir}/buildManifest.js`;
    await fs.writeFile(manifestPath, manifestCode);

    const manifestCtx = { };
    const initCode = `var self = globalThis;`;
    vm.runInNewContext(`${initCode}\n\n${manifestCode}`, manifestCtx, {
      filename: manifestUrl,
      timeout: 10000,
    });
    const manifest = manifestCtx.__BUILD_MANIFEST;
    if (!manifest)
      return;

    const nextJSRouteToPath = (path) => path.substring(1)
      .replace(/\.+/g, '.').replace(/-+/g, '-')
      .replace(/[^a-z0-9\[\]\/#_+-]/ig, '').replace(/\//g, '--');

    console.log(manifestCtx);
    const csss = Object.entries(manifest)
      .flatMap(([ route, chunkUrls ]) =>
        route.startsWith("/")
          ? chunkUrls
            .filter(u => u.match(/\.css$/i))
            .map((url, index) => ({
              name: `${nextJSRouteToPath(route)}-${index}.css`,
              url: new URL(`../../${url}`, manifestUrl).toString(),
            }))
          : [])
      .groupBy(c => c.url, c => c.name, (url, names) => ({
        url,
        name: names.orderBy(n => n.length, (a, b) => a - b).first(),
      }))
      .selectMany(c => c)
      .toArray();
    for (const css of csss)
      if (addSiteCss(css))
        console.log(`Found Next.js CSS chunk '${css.name}' ${css.url}`);
  };

  const parseWebpackMiniCssChunks = async (doc, html) => {
    const elWebpack = htmlSelectOne('script[src*="webpack" i][src$=".js" i]', doc);
    if (!elWebpack || !isHtmlElement(elWebpack))
      return;

    const webpackUrl = new URL(elWebpack.attribs.src, html.url).toString();
    console.log(`Found WebPack script ${webpackUrl}`);

    let webpackCode = await downloadText(webpackUrl);
    if (!webpackCode)
      return;
    // TODO: Find a proper pattern for webpack miniCss hook
    webpackCode = webpackCode.replace("h.nc=void 0", "self.webpack = h;");
    const webpackPath = `${siteDir}/webpack.js`;
    await fs.writeFile(webpackPath, webpackCode);

    const initCode = `var self = globalThis;`;
    const webpackCtx = { };
    vm.runInNewContext(`${initCode}\n\n${webpackCode}`, webpackCtx, {
      filename: webpackUrl,
      timeout: 10000,
    });
    const webpack = webpackCtx.webpack;
    if (!webpack)
      return;

    console.log("webpack", webpack);
    const urlPrefix = Object.values(webpack).filter(v => isString(v) && v.startsWith("https://"))[0];
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
      if (addSiteCss({ name: cssName, url: cssUrl }))
        console.log(`Found Next.js CSS chunk #${iChunk} '${cssName}' ${cssUrl}`);
    }
  };

  for (const html of site.html.filter(h => h.url && !h.path && !h.text))
    await downloadOneSiteHtml(html);
  for (const html of site.html.filter(h => h.path && !h.text))
    await readOneSiteHtml(html);
  site.html = site.html.filter(c => c.text);

  for (const html of site.html) {
    const doc = parseHtmlDocument(html.text);
    await parseNextJSBuildManifest(doc, html);
    await parseWebpackMiniCssChunks(doc, html);
    await parseLinkedCss(doc, html);
    await parseEmbeddedCss(doc, html);
  }
}