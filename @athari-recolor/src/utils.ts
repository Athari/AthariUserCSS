import fs from 'node:fs/promises';
import { AssertionError } from 'node:assert';
import { regex, pattern as re, pattern } from 'regex';
import JSON5 from 'json5';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import enquirer from 'enquirer';
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
  is as htmlIs,
  compile as htmlSelectCompile,
} from 'css-select';
import {
  ComponentValue,
  parseComponentValue as parseCssComp,
} from '@csstools/css-parser-algorithms';
import {
  tokenize as tokenizeCss,
  stringify as stringifyCss,
} from '@csstools/css-tokenizer';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import NetscapeCookieStore from './toughCookieNetscapeStore.js';

const downloadTimeout = 30000;

export type RequiredKeys<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;

export type RegExpPattern = ReturnType<typeof pattern>;

//export type EnquirerPrompt = Parameters<enquirer['prompt']>[0];

type ExtractNoArraysNoFunctions<T> = T extends (infer U)[] ? ExtractNoArraysNoFunctions<U> : T extends (...args: any[]) => any ? never : T;
export type EnquirerPrompt = ExtractNoArraysNoFunctions<Parameters<enquirer['prompt']>[0]>;

export enum ColorFormula {
  Dark = 'dark',
  DarkFull = 'dark-full',
  DarkAuto = 'dark-auto',
  DarkFullAuto = 'dark-full-auto',
}

export interface QuestionOptions {
  initial?: () => string | undefined;
  choices?: string[];
}

export function assertHasKeys<T, K extends keyof T>(o: T, ...keys: K[]): asserts o is T & { [P in K]-?: T[P] } {
  for (const key of keys)
    if (o[key] === null || o[key] === undefined)
      throw new AssertionError({
        message: `Property '${String(key)}' of '${String(o?.constructor?.name ?? typeof o)}' is null or undefined`,
      });
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean' || v instanceof Boolean;
}

export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function isNumber(v: unknown): v is number {
  return (typeof v === 'number' || v instanceof Number) && !isNaN(v as number);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v) && isFinite(v);
}

export function isFunction(v: unknown): v is Function {
  return typeof v === 'function';
}

export function isObject(v: unknown): v is object {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === 'string' || v instanceof String;
}

export function isSymbol(v: unknown): v is symbol {
  return typeof v === 'symbol';
}

export function isUndefined(v: unknown): v is undefined {
  return v === undefined;
}

export function errorDetail(ex: Error | unknown): string {
  return ex instanceof Error ? `${ex.message}\n${ex.stack}` : `${ex}`;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | never> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, nay) =>
    timer = setTimeout(() => nay(new Error(`Timed out after ${ms} ms.`)), ms));
  try {
    return await Promise.race([ promise, timeout ]);
  } finally {
    if (timer != null)
      clearTimeout(timer);
  }
}

export function throwError(error: Error | string) : never {
  throw error instanceof Error ? error : new Error(error);
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (ex: any) {
    console.log(`Failed to read file "${path}"`);
    console.log(errorDetail(ex));
    return null;
  }
}

export function htmlQuerySelector<T extends HtmlElement>(node: HtmlNode, selector: string): T | null {
  return htmlSelectOne<HtmlNode, T>(selector, node);
}

export function htmlQuerySelectorAll<T extends HtmlElement>(node: HtmlNode, selector: string): T[] {
  return htmlSelectAll<HtmlNode, T>(selector, node);
}

export function htmlMatches<T extends HtmlElement>(node: T, selector: string): boolean {
  return htmlIs<HtmlNode, T>(node, selector);
}

export function htmlCompileQuery<T extends HtmlElement>(selector: string): ReturnType<typeof htmlSelectCompile<HtmlNode, T>> {
  return htmlSelectCompile<HtmlNode, T>(selector);
}

export function stringifyCssComp(node: ComponentValue): string {
  return stringifyCss(...node.tokens());
}

export function parseCssCompStr(css: string): ComponentValue {
  return parseCssComp(tokenizeCss({ css })) ?? throwError("Failed to parse CSS comp");
}

export async function getSiteDir(siteName: string): Promise<string> {
  const siteDir = `./sites/${siteName}`;
  await fs.mkdir(siteDir, { recursive: true });
  return await fs.realpath(siteDir);
}

export function validateRequired(name: string): (input: string) => true | string {
  return (input: string) => input ? true : `Argument ${name} cannot be empty`;
}

export function question(
  type: string,
  a: Record<string, string>,
  name: string,
  message: string,
  opts: QuestionOptions,
  cfg?: Partial<EnquirerPrompt>
): EnquirerPrompt {
  return Object.assign(cfg ?? {}, {
    type, name, message,
    skip: () => !!a[name],
    initial: () => a[name] ?? opts.initial?.(),
    result: (v: string) => a[name] = v,
    validate: validateRequired(name),
  });
}

export function questionInput(
  a: Record<string, any>,
  name: string,
  message: string,
  opts?: QuestionOptions
): EnquirerPrompt {
  return question('input', a, name, message, opts ?? {});
}

export function questionSelect(
  a: Record<string, any>,
  name: string,
  message: string,
  opts: QuestionOptions
): EnquirerPrompt {
  return question('select', a, name, message, opts ?? {}, {
    choices: opts.choices,
  });
}

export async function loadJson<T>(ctr: ClassConstructor<T>, path: string): Promise<T | null> {
  const pojo = JSON5.parse(await readTextFile(path) ?? "null");
  if (pojo == null)
    return null;
  return plainToInstance<T, object>(ctr, pojo) as T;
}

const netscapeCookies = new NetscapeCookieStore('./cookies.txt', { alwaysWrite: false });
const memoryCookies = new MemoryCookieStore();
netscapeCookies.export(memoryCookies);
const fetchCookie = makeFetchCookie(fetch, new CookieJar(memoryCookies));

export async function downloadText(url: string, init: RequestInit = {}): Promise<string | null> {
  const response = await withTimeout(fetchCookie(url, Object.assign(init, {
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