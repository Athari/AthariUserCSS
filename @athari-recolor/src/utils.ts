import fs from 'node:fs/promises';
import { AssertionError } from 'node:assert';
import { regex, pattern as re } from 'regex';
import JSON5 from 'json5';
import { ClassConstructor, instanceToPlain, plainToInstance } from 'class-transformer';
import enquirer from 'enquirer';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import NetscapeCookieStore from './toughCookieNetscapeStore.ts';

const downloadTimeout = 30000;

export type ObjectEntries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

export type Guard<T = unknown> = (x: unknown) => x is T;

export type GuardReturnType<T extends Guard> = T extends Guard<infer U> ? U : never;

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never;

export type Assigned<T> = T extends undefined | null ? never : T;

export type OneOrArray<T> = T | T[];

export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

export type ArrayIfNeeded<T> = T extends readonly (infer U)[] ? U[] : never;

export type RegExpPattern = ReturnType<typeof re>;

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
  choices?: string[] | undefined;
}

export function assertHasKeys<T, K extends keyof T>(o: T, ...keys: K[]): asserts o is T & { [P in K]-?: T[P] } {
  for (const key of keys)
    if (o[key] === null || o[key] === undefined)
      throw new AssertionError({
        message: `Property '${String(key)}' of '${String(o?.constructor?.name ?? typeof o)}' is null or undefined`,
      });
}

export function objectEntries<T>(o: Partial<T>): ObjectEntries<T> {
  return Object.entries(o) as ObjectEntries<T>;
}

export function objectKeys<T>(o: Partial<T>): (keyof T)[] {
  return Object.keys(o) as (keyof T)[];
}

export function objectValues<T>(o: Partial<T>): T[keyof T][] {
  return Object.values(o) as T[keyof T][];
}

export function toArrayIfNeeded<T>(v: OneOrArray<T>): T[] {
  return isArray(v) ? v : [ v ];
}

export function toAssignedArrayIfNeeded<T>(v: OneOrArray<T>): Assigned<T>[] {
  return toArrayIfNeeded(v).filter(isAssigned);
}

export function valuesOf<T>() {
  return <U extends T[]>(...values: readonly [...U]) => values;
}

export function isValueIn<K, U extends K>(value: K, values: readonly U[]): value is U {
  return values.includes(value as U);
}

export function isSome<TGuard extends Guard[]>(...guards: TGuard): Guard<GuardReturnType<TGuard[number]>> {
  return (x: unknown): x is GuardReturnType<TGuard[number]> => guards.some(g => g(x));
}

export function isAssigned<T>(v: T): v is Assigned<T> {
  return v !== undefined && v !== null;
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

export function regexp(pattern: string, flags?: string): RegExp {
  return regex(flags)`${re(pattern)}`;
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
  } catch (ex: unknown) {
    console.log(`Failed to read file "${path}"`);
    console.log(errorDetail(ex));
    return null;
  }
}

type WritableFileData = Parameters<typeof fs.writeFile>[1];

export async function writeTextFile(path: string, data: WritableFileData): Promise<boolean> {
  try {
    await fs.writeFile(path, data, 'utf-8');
    return true;
  } catch (ex: unknown) {
    console.log(`Failed to write file "${path}"`);
    console.log(errorDetail(ex));
    return false;
  }
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
  a: Record<string, unknown>,
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
  a: Record<string, unknown>,
  name: string,
  message: string,
  opts?: QuestionOptions
): EnquirerPrompt {
  return question('input', a, name, message, opts ?? {});
}

export function questionSelect(
  a: Record<string, unknown>,
  name: string,
  message: string,
  opts: QuestionOptions
): EnquirerPrompt {
  return question('select', a, name, message, opts ?? {}, {
    choices: opts.choices ?? [],
  });
}

export async function loadJson<T>(ctr: ClassConstructor<T>, path: string): Promise<T | null> {
  const pojo = JSON5.parse(await readTextFile(path) ?? "null");
  if (pojo == null)
    return null;
  return plainToInstance<T, object>(ctr, pojo) as T;
}

export async function saveJson<T>(instance: T, path: string): Promise<boolean> {
  const pojo = instanceToPlain<T>(instance);
  return await writeTextFile(path, JSON5.stringify(pojo, { space: "  " }));
}

const netscapeCookies = new NetscapeCookieStore('./cookies.txt', { alwaysWrite: false });
const memoryCookies = new MemoryCookieStore();
netscapeCookies.export(memoryCookies);
const fetchCookie = makeFetchCookie(fetch, new CookieJar(memoryCookies));

export async function downloadText(url: string, init: RequestInit = {}): Promise<string | null> {
  const response = await withTimeout(fetchCookie(url, Object.assign(init, {
    headers: {
      'accept': "*/*",
      // TODO: Accept gzip encoding
      //'accept-encoding': "gzip, deflate, br, zstd",
      'accept-language': "en-US,en",
      'cache-control': 'no-cache',
      'dnt': '1',
      'pragma': 'no-cache',
      'referer': url,
      'sec-ch-ua': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
      'sec-ch-ua-mobile': "?0",
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    },
  })), downloadTimeout);
  if (!response.ok) {
    console.error(`WARNING: Failed to download ${url}`);
    return null;
  }
  return await response.text();
}