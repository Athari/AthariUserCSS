import fs from 'node:fs/promises';
import JSON5 from 'json5';
import monkeyutils from '@athari/monkeyutils'
const { withTimeout } = monkeyutils;
import {
  parseComponentValue as parseCssComp,
} from '@csstools/css-parser-algorithms';
import {
  tokenize as tokenizeCss,
  stringify as stringifyCss,
} from '@csstools/css-tokenizer';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import NetscapeCookieStore from './tough-cookie-netscape.js';

const downloadTimeout = 30000;

export function readTextFile(path) {
  return fs.readFile(path, 'utf-8');
}

export function stringifyNode(node) {
  return stringifyCss(...node.tokens());
}

export function parseCssCompStr(css) {
  return parseCssComp(tokenizeCss({ css }));
}

export async function getSiteDir(siteName) {
  const siteDir = `./sites/${siteName}`;
  fs.mkdir(siteDir, { recursive: true });
  return await fs.realpath(siteDir);
}

export function validateRequired(name) {
  return (input) => input ? true : `Argument ${name} cannot be empty`;
}

export function question(type, a, name, message, opts, cfg) {
  return Object.assign(cfg ?? {}, {
    type, name, message,
    skip: () => !!a[name],
    initial: () => a[name] ?? opts.initial?.(),
    result: v => a[name] = v,
    validate: validateRequired(name),
  });
}

export function questionInput(a, name, message, opts) {
  return question('input', a, name, message, opts ?? {});
}

export function questionSelect(a, name, message, opts) {
  return question('select', a, name, message, opts ?? {}, {
    choices: opts.choices,
  });
}

export async function loadJson(path) {
  return JSON5.parse(await readTextFile(path));
}

const netscapeCookies = new NetscapeCookieStore('./cookies.txt', { alwaysWrite: false });
const memoryCookies = new MemoryCookieStore();
netscapeCookies.export(memoryCookies);
const fetchCookie = makeFetchCookie(fetch, new CookieJar(memoryCookies));

export async function downloadText(url, init = {}) {
  const response =  await withTimeout(fetchCookie(url, Object.assign(init, {
    headers: {
      'accept': "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      // TODO: Accept gzip encoding
      //'accept-encoding': "gzip, deflate, br, zstd",
      'accept-language': "en-US,en",
      'user-agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    },
  })), downloadTimeout);
  if (!response.ok) {
    console.error(`WARNING: Failed to download ${url}`);
    return null;
  }
  return await response.text();
}