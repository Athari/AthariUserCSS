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

export type Intersect<T extends any[]> = T extends [infer First, ...infer Rest] ? First & Intersect<Rest>  : {};

export type Guard<T = unknown> = (x: unknown) => x is T;

export type GuardReturnType<T extends Guard> = T extends Guard<infer U> ? U : never;

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never;

export type Assigned<T> = T extends undefined | null ? never : T;

export type NotUndefined<T> = T extends undefined ? never : T;

export type NotNull<T> = T extends null ? never : T;

export type ObjectRecord<T> = Record<keyof T, T[keyof T]>;

export type OneOrArray<T> = T | T[];

export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

export type ArrayIfNeeded<T> = T extends readonly (infer U)[] ? U[] : never;

export type AssignedArrayIfNeeded<T> = T extends readonly (infer U)[] ? Assigned<U>[] : never;

export type ArrayGenerator<T> = Generator<T, void, unknown>;

export type KeyOfAny<T> = T extends any ? keyof T : never;

export type OptionalObject<T> = { [P in keyof T]?: T[P] | undefined } | undefined;

export type OptionalArray<T> = Array<T | undefined> | undefined;

export type OptionalPrimitive<T> = T | undefined;

export type RegExpPattern = ReturnType<typeof re>;

type ExtractNoArraysNoFunctions<T> = T extends (infer U)[] ? ExtractNoArraysNoFunctions<U> : T extends (...args: any[]) => any ? never : T;
export type EnquirerPrompt = ExtractNoArraysNoFunctions<Parameters<enquirer['prompt']>[0]>;

export enum ColorFormula {
  Dark = 'dark',
  DarkFull = 'dark-full',
  DarkAuto = 'dark-auto',
  DarkFullAuto = 'dark-full-auto',
}

export function assertNever(...values: never[]): never {
  throw new AssertionError({ message: `never expected, got ${values.join(", ")}` });
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

export function toArrayIfNeeded<T>(v: OneOrArray<T> | undefined): T[] {
  return isNotAssigned(v) ? [] : isArray(v) ? v : [ v ];
}

export function toAssignedArrayIfNeeded<T>(v: OneOrArray<T> | undefined): Assigned<T>[] {
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

export function isNotAssigned(v: unknown): v is undefined | null {
  return v === undefined && v === null;
}

export function isNull(v: unknown): v is null {
  return v === null;
}

export function isNotNull<T>(v: T): v is NotNull<T> {
  return v !== null;
}

export function isDefined<T>(v: T): v is NotUndefined<T> {
  return v !== undefined;
}

export function isUndefined(v: unknown): v is undefined {
  return v === undefined;
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

export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

export function isWeakMap(value: unknown): value is WeakMap<WeakKey, unknown> {
  return value instanceof WeakMap;
}

export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

export function isWeakSet(value: unknown): value is WeakSet<WeakKey> {
  return value instanceof WeakSet;
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

export interface QuestionOptions {
  initial?: () => string | undefined;
  choices?: string[] | undefined;
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
  const obj = plainToInstance<T, object>(ctr, pojo) as T & Record<string, any>;
  if (isFunction(obj?.hydrate))
    obj.hydrate();
  return obj;
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
      'accept-encoding': "gzip, deflate, br, zstd",
      'accept-language': "en-US,en",
      'cache-control': 'no-cache',
      'dnt': '1',
      'pragma': 'no-cache',
      'referer': new URL(url).origin,
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
    console.error(`WARNING: Failed to download ${url} (${response.status} ${response.statusText})`);
    return null;
  }
  return await response.text();
}

type DeepMergeValue = 'skip' | 'merge';
type DeepMergeArrays = 'replace' | 'concat';

interface DeepMergeOptions {
  /** Whether to copy undefined property values (or map values) to the target or skip the properties. */
  undefinedProps?: DeepMergeValue;
  /** Whether to copy null property values (or map values) to the target or skip the properties. */
  nullProps?: DeepMergeValue;
  /** Whether to copy undefined array elements to the target or skip the values. */
  undefinedValues?: DeepMergeValue;
  /** Whether to copy null array elements to the target or skip the values. */
  nullValues?: DeepMergeValue;
  /** Whether to concatenate or replace arrays and sets. */
  arrays?: DeepMergeArrays;
}

const deepMergeOptionsDefaults = {
  undefinedProps: 'skip' as const,
  nullProps: 'merge' as const,
  undefinedValues: 'merge' as const,
  nullValues: 'merge' as const,
  arrays: 'concat' as const,
} as Required<DeepMergeOptions>;

const isArrayOrSet = isSome(isArray, isSet);
const isObjectOrMap = isSome(isObject, isMap);
const isAlways = (_: unknown) => true;

type MergeValueChecker = (v: unknown) => boolean;

type AssignedOption<T, O extends T | null | undefined, D extends Required<T>, K extends keyof D> =
  K extends keyof O ?
    O[K] extends undefined ?
      D[K] :
    O[K] extends null ?
      D[K] :
      Assigned<O[K]> :
    D[K];
type AssignedOptions<T, O extends T | null | undefined, D extends Required<T>> =
  O extends undefined ?
    D :
  O extends null ?
    D :
    { [K in keyof D]: AssignedOption<T, O, D, K> };

type DeepMergeOptionsAssigned<O extends DeepMergeOptions> =
  AssignedOptions<DeepMergeOptions, O, typeof deepMergeOptionsDefaults>;
type DM_Defined<V, OU extends DeepMergeValue, ON extends DeepMergeValue> =
  V extends undefined ?
    (OU extends 'merge' ? V : never) :
  V extends null ?
    (ON extends 'merge' ? V : never) :
    V;
type DM_DefinedProp<V, O extends DeepMergeOptions> =
  DM_Defined<V,
    DeepMergeOptionsAssigned<O>['undefinedProps'],
    DeepMergeOptionsAssigned<O>['nullProps']>;
type DM_DefinedValue<V, O extends DeepMergeOptions> =
  DM_Defined<V,
    DeepMergeOptionsAssigned<O>['undefinedValues'],
    DeepMergeOptionsAssigned<O>['nullValues']>;
type DM_ArrayConcat<T extends any[], S, O extends DeepMergeOptions> =
  S extends any[] ?
    Array<DM_DefinedValue<T[number] | S[number], O>> :
    Array<DM_DefinedValue<T[number] | S, O>>; /*S*/
type DM_ArrayReplace<T extends any[], S, O extends DeepMergeOptions> =
  S extends any[] ?
    Array<DM_DefinedValue<S[number], O>> :
    Array<DM_DefinedValue<S, O>>;
type DM_Array<T extends any[], S, O extends DeepMergeOptions> =
  DeepMergeOptionsAssigned<O>['arrays'] extends 'replace' ?
    DM_ArrayReplace<T, S, O> :
    DM_ArrayConcat<T, S, O>;
type DM_ObjectValuesSource<T extends object, S extends object, K extends keyof S, O extends DeepMergeOptions> =
  K extends keyof T ?
    DM_DefinedProp<S[K], O> extends never ?
      T[K] :
      DM_Proc<T[K], DM_DefinedProp<S[K], O>, O> :
    DM_DefinedProp<S[K], O>;
type DM_ObjectValuesTarget<T extends object, K, O extends DeepMergeOptions> =
  K extends keyof T ?
    T[K] :
    never;
type DM_ObjectValues<T extends object, S extends object, K extends KeyOfAny<T | S>, O extends DeepMergeOptions> =
  K extends keyof S ?
    DM_ObjectValuesSource<T, S, K, O> :
    DM_ObjectValuesTarget<T, K, O>;
type DM_ObjectKeys<T extends object, S extends object, K extends KeyOfAny<T | S>, O extends DeepMergeOptions> =
  DM_ObjectValues<T, S, K, O> extends never ?
    never :
    K;
type DM_Object<T extends object, S, O extends DeepMergeOptions> =
  S extends object ?
    { [K in KeyOfAny<T | S> as DM_ObjectKeys<T, S, K, O>]: DM_ObjectValues<T, S, K, O> } :
    S;
type DM_Proc<T, S, O extends DeepMergeOptions> =
  T extends any[] ?
    DM_Array<T, S, O> :
  T extends object ?
    DM_Object<T, S, O> :
    S;
type DeepMerge<T, TSources extends unknown[], O extends DeepMergeOptions> =
  TSources extends [infer S, ...infer Rest] ?
    S extends undefined ?
      DeepMerge<T, Rest, O> :
    S extends null ?
      DeepMerge<T, Rest, O> :
      DeepMerge<DM_Proc<T, S, O>, Rest, O> :
    T;

export function deepMerge<T, TSources extends unknown[], O extends DeepMergeOptions>(
  options: O | null | undefined, target: T, ...sources: TSources
): DeepMerge<T, TSources, O> {
  const opts = objectKeys(deepMergeOptionsDefaults).reduce(
    (o, prop) => (o[prop] = options?.[prop] ?? deepMergeOptionsDefaults[prop], o),
    {} as ObjectRecord<DeepMergeOptions>) as Required<DeepMergeOptions>;

  const checkArrayValue = getValueChecker(opts.undefinedValues == 'merge', opts.nullValues == 'merge');
  const checkObjectValue = getValueChecker(opts.undefinedProps == 'merge', opts.nullProps == 'merge');

  return sources.filter(isAssigned).reduce(deepMergeProc, target) as DeepMerge<T, TSources, O>;

  function deepMergeProc(targetVal: unknown, sourceVal: unknown): unknown {
    if (isArrayOrSet(targetVal)) {
      const sourceItems = isArrayOrSet(sourceVal) ? sourceVal : [ sourceVal ]; // make merging primitives into array optional?
      if (opts.arrays === 'concat') {
        const addToTargetArray = getArrayAdder(targetVal);
        for (const v of sourceItems)
          addToTargetArray(v);
        return targetVal;
      } else if (opts.arrays === 'replace') {
        const [ targetIsArray, sourceIsArray ] = [ isArray(targetVal), isArray(sourceItems) ];
        if (targetIsArray === sourceIsArray)
          return sourceItems;
        if (!targetIsArray)
          return new Set(sourceItems);
        if (targetIsArray)
          return [...sourceItems];
        assertNever(targetIsArray, sourceIsArray as never);
      } else {
        assertNever(opts.arrays);
      }
    } else if (isObjectOrMap(targetVal)) {
      if (!isObjectOrMap(sourceVal))
        return sourceVal;
      const getTargetObjectProp = getObjectGetter(targetVal);
      const setTargetObjectProp = getObjectSetter(targetVal);
      for (const [ k, v ] of iterateObject(sourceVal))
        setTargetObjectProp(k, deepMergeProc(getTargetObjectProp(k), v));
      return targetVal;
    } else {
      return sourceVal; // primitive
    }
  }

  function getValueChecker(mergeUndefined: boolean, mergeNull: boolean): MergeValueChecker {
    if (!mergeUndefined && !mergeNull)
      return isAssigned;
    if (!mergeUndefined)
      return isDefined;
    if (!mergeNull)
      return isNotNull;
    if (mergeUndefined || mergeNull)
      return isAlways;
    assertNever(mergeUndefined, mergeNull);
  }

  function getArrayAdder(a: unknown[] | Set<unknown>): (v: unknown) => void {
    if (isSet(a))
      return v => checkArrayValue(v) && a.add(v);
    if (isArray(a))
      return v => checkArrayValue(v) && a.push(v);
    assertNever(a);
  }

  function getObjectGetter(o: object | Map<unknown, unknown>): (k: unknown) => unknown {
    if (isMap(o))
      return k => o.get(k);
    if (isObject(o))
      return k => Reflect.get(o, toPropertyKey(k));
    assertNever(o);
  }

  function getObjectSetter(o: object | Map<unknown, unknown>): (k: unknown, v: unknown) => void {
    if (isMap(o))
      return (k, v) => checkObjectValue(v) && o.set(k, v);
    if (isObject(o))
      return (k, v) => checkObjectValue(v) && Reflect.set(o, toPropertyKey(k), v);
    assertNever(o);
  }

  function* iterateObject(o: object | Map<unknown, unknown>): ArrayGenerator<[unknown, unknown]> {
    if (isMap(o))
      return yield* o.entries();
    if (isObject(o))
      return yield* Object.entries(o);
    assertNever(o);
  }

  function toPropertyKey(k: unknown): PropertyKey {
    return isString(k) || isNumber(k) || isSymbol(k) ? k : String(k);
  }
}