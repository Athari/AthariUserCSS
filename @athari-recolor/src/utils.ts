import fs from 'node:fs/promises';
import { AssertionError } from 'node:assert/strict';
import { InspectOptions, InspectOptionsStylized, CustomInspectFunction, inspect } from 'node:util';
import { isDate } from 'node:util/types';
import { regex, pattern as re, InterpolatedValue as RegExpValue } from 'regex';
import JSON5 from 'json5';
import { ClassConstructor, instanceToPlain, plainToInstance } from 'class-transformer';
import enquirer from 'enquirer';
import supportsColor from 'supports-color';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import { isPrimitive, Primitive } from 'utility-types';
import NetscapeCookieStore from './http/toughCookieNetscapeStore.ts';

// MARK: Constants

const downloadTimeout = 30000;

// MARK: Types

export type ObjectEntries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

export type ObjectAssignedEntries<T> = {
  [K in keyof T]-?: [K, Assigned<T[K]>];
}[keyof T][];

export type ObjectFromEntries<T extends ReadonlyArray<readonly [PropertyKey, any]>> = {
  [K in T[number][0]]: Extract<T[number], readonly [K, any]>[1];
};

export type ObjectInvert<T extends Record<PropertyKey, PropertyKey>> = {
  [K in keyof T as T[K]]: K;
};

export type LiteralUnion<T extends U, U = string> = T | (U & { _?: never | undefined });

export type MostSpecific<A, B> = A extends B ? A : B extends A ? B : never;

export type Intersect<T extends any[]> = T extends [infer First, ...infer Rest] ? First & Intersect<Rest> : {};

export type GuardAny<T = unknown> = (x: any) => x is T;

export type Guard<A, T> = (a: A) => a is Extract<T, A>;

export type GuardParam<G> = G extends Guard<infer A, any> ? A : never;

export type GuardReturnType<G> = G extends Guard<any, infer T> ? T : never;

export type SubUnion<T, U extends T> = T extends U ? T : never;

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never;

export type Assigned<T> = T extends undefined ? never : T extends null ? never : T;

export type NotUndefined<T> = T extends undefined ? never : T;

export type NotNull<T> = T extends null ? never : T;

export type ObjectRecord<T> = Record<keyof T, T[keyof T]>;

export type OneOrArray<T> = Array<T> | T;

export type ArrayElement<T> = T extends ReadonlyArray<infer U> ? U : never;

export type ArrayIfNeeded<T> = T extends ReadonlyArray<infer U> ? Array<U> : never;

export type AssignedArrayIfNeeded<T> = T extends ReadonlyArray<infer U> ? Array<Assigned<U>> : never;

export type ArrayGenerator<T> = Generator<T, void, unknown>;

export type KeyOfAny<T> = T extends any ? keyof T : never;

export type ValueOf<T> = T[keyof T];

export type ValueOfAny<T> = T extends any ? T[keyof T] : never;

export type Opt<T> = T | undefined;

export type OptObject<T> = { [K in keyof T]?: T[K] | undefined } | undefined;

export type OptArray<T> = Array<T | undefined> | undefined;

export type OptOneOrArray<T> = Array<T | undefined> | T | undefined;

type ExtractNoArraysNoFunctions<T> = T extends Array<infer U> ? ExtractNoArraysNoFunctions<U> : T extends (...args: any[]) => any ? never : T;
export type EnquirerPrompt = ExtractNoArraysNoFunctions<Parameters<enquirer['prompt']>[0]>;

export type RegExpPattern = ReturnType<typeof re>;

// MARK: Raw strings

export class RawsTemplate<T> {
  #raws: string[][] = [ [] ];
  #values: T[] = [];

  get raw(): string[] {
    return this.#raws.map(r => r.join(""));
  }

  get values(): ReadonlyArray<T> {
    return this.#values;
  }

  appendRaw(raw: string): void {
    this.#raws[this.#raws.length - 1]!.push(raw);
  }

  appendValue(value: T): void {
    this.#values.push(value);
    this.#raws.push([]);
  }

  format<R>(fn: (template: { raw: string[] }, ...values: T[]) => R): R {
    return fn({ raw: this.raw }, ...this.values);
  }
}

export class RegExpTemplate extends RawsTemplate<RegExpValue> {
  #flags?: string;

  constructor(flags?: string) {
    super();
    Object.assign(this, { flags });
  }

  appendRawEscaped(raw: string): void {
    this.appendRaw(escapeRegExp(raw));
  }

  formatRegExp(): RegExp {
    return this.format<RegExp>(this.#flags ? regex(this.#flags) : regex);
  }
}

export function escapeRegExp(s: string) {
  return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}

// MARK: Counter

export class Counter<T> extends Object {
  #counts = new Map<T, number>();

  get size(): number { return this.#counts.size }

  get total(): number { return [...this.#counts.values()].sum() }

  increment(key: T): void {
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
  }

  getCounts(): Record<string, number> {
    return this.#counts.entries().reduce(
      (o, [key, n]) => (o[String(key)] = n, o),
      <Record<string, number>>{});
  }

  override toString(): string {
    return objectEntries(this.getCounts()).join(", ");
  }
}

// MARK: Asserts

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

// MARK: Objects

export function objectFromEntries<T extends ReadonlyArray<readonly [PropertyKey, any]>>(entries: T): ObjectFromEntries<T> {
  return Object.fromEntries(entries) as ObjectFromEntries<T>;
}

export function objectInvert<T extends Record<keyof T, keyof any>>(o: T) {
  return Object.fromEntries(Object.entries(o).map(([v, k]) => [ String(k), v ])) as ObjectInvert<T>;
}

export function objectEntries<T>(o: T) {
  return Object.entries(o as {}) as ObjectEntries<T>;
}

export function objectAssignedEntries<T>(o: T) {
  return Object.entries(o as {}).filter(e => isAssigned(e[1])) as ObjectAssignedEntries<T>;
}

export function objectKeys<T>(o: T) {
  return Object.keys(o as {}) as (keyof T)[];
}

export function objectValues<T>(o: T) {
  return Object.values(o as {}) as T[keyof T][];
}

export function objectAssignedValues<T>(o: T) {
  return Object.values(o as {}).filter(isAssigned) as Array<Assigned<T[keyof T]>>;
}

// MARK: Arrays

export function toArrayIfNeeded<T>(v: undefined | null): typeof v
export function toArrayIfNeeded<T>(v: T[] | T): T[]
export function toArrayIfNeeded<T>(v: T[] | T | undefined | null): T[] | undefined | null {
  return isNullish(v) || isArray(v) ? v : [ v ];
}

export function toAssignedArrayIfNeeded<T>(v: Assigned<T>[] | Assigned<T> | undefined | null): Assigned<T>[]
export function toAssignedArrayIfNeeded<T>(v: T[] | T | undefined | null): Assigned<T>[]
export function toAssignedArrayIfNeeded<T>(v: T[] | T | undefined | null): Assigned<T>[] {
  return isNullish(v) ? [] : (isArray(v) ? v : [ v ]).filter(isAssigned);
}

export function valuesOf<T>() {
  return <U extends T[]>(...values: readonly [...U]) => values;
}

// MARK: Guards

export function isValueIn<K, U extends K>(value: K, values: readonly U[]): value is U {
  return values.includes(value as U);
}

//export function isSome<T, G extends Guard<T>[]>(...guards: G): Guard<GuardReturnType<G[number]>>;
//export function isSome<A, T extends A, G extends GuardT<A, T>[]>(...guards: G): GuardT<A, GuardReturnTypeT<A, T, G[number]>>;
export function isSome<T, G extends GuardAny<T>[]>(...guards: G): GuardAny<GuardReturnType<G[number]>> {
  return (x: unknown): x is GuardReturnType<G[number]> => guards.some(g => g(x));
}

export function isAssigned<T>(v: T): v is Assigned<T> {
  return v !== undefined && v !== null;
}

export function isNullish(v: unknown): v is undefined | null {
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

// MARK: Compare

export function compare<T>(a: T, b: T): number {
  if (isNumber(a) && isNumber(b)) {
    const an = isNaN(a), bn = isNaN(b);
    return an ? (bn ? 0 : 1) : bn ? -1 : a - b;
  }
  if (isDate(a) && isDate(b))
    return a.getTime() - b.getTime();
  if (isString(a) && isString(b))
    return a.localeCompare(b);
  if (isBoolean(a) && isBoolean(b))
    return a === b ? 0 : a ? 1 : -1;
  if (a < b)
    return -1;
  if (a > b)
    return 1;
  return 0;
}

type OptRetFn<T> = () => Opt<T>;
type OptMapFn<T> = (v: Opt<T>) => Opt<T>;
type OptRetMap<T> = [ OptRetFn<T>, Opt<OptMapFn<T>> ];

export function fallback<T, R = T>(...fnrs: (OptRetFn<T> | OptRetMap<T>)[]): Opt<T> {
  for (const fnr of fnrs) {
    const [ fn, ret ]: [ OptRetFn<T>, Opt<OptMapFn<T>> ] = isArray(fnr) ? fnr : [ fnr, void 0 ];
    const result = fn();
    if (isDefined(result))
      return ret?.(result) ?? undefined;
  }
  return;
}

// MARK: Errors

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

export function logError(ex: unknown, message: string | null) {
  if (message)
    console.error(message);
  console.error(inspectPretty(errorDetail(ex)));
}

// MARK: File

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (ex: unknown) {
    logError(ex, `Failed to read file "${path}"`);
    return null;
  }
}

type WritableFileData = Parameters<typeof fs.writeFile>[1];

export async function writeTextFile(path: string, data: WritableFileData): Promise<boolean> {
  try {
    await fs.writeFile(path, data, 'utf-8');
    return true;
  } catch (ex: unknown) {
    logError(ex, `Failed to write file "${path}"`);
    return false;
  }
}

// MARK: Enquirer

export function validateRequired(name: string): (input: string) => true | string {
  return (input: string) => input ? true : `Argument ${name} cannot be empty`;
}

export interface QuestionOptions {
  initial?: () => Opt<string>;
  choices?: Opt<string[]>;
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

// MARK: JSON

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

// MARK: HTTP

const netscapeCookies = new NetscapeCookieStore('./cookies.txt', { alwaysWrite: false });
const memoryCookies = new MemoryCookieStore();
netscapeCookies.export(memoryCookies);
const fetchCookie = makeFetchCookie(fetch, new CookieJar(memoryCookies));

export interface DownloadInit extends RequestInit {
  encoding?: Opt<string>;
}

export async function downloadText(url: string, init: DownloadInit = {}): Promise<string | null> {
  const response = await withTimeout(fetchCookie(url, Object.assign(init, {
    headers: {
      'accept': "*/*",
      //'accept-encoding': "gzip, deflate, br, zstd",
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
  const getText = async () => [ 'utf8', 'utf-8' ].includes(init.encoding ?? 'utf-8')
    ? await response.text()
    : new TextDecoder(init.encoding).decode(await response.arrayBuffer());
  return await getText();
}

// MARK: Deep merge: Types

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

type IfAssigned<T, TAssigned, TNotAssigned> =
  undefined extends T ?
    TNotAssigned :
  null extends T ?
    TNotAssigned :
    TAssigned;
type IfDefined<T, TDefined, TUndefined> =
  undefined extends T ?
    TUndefined :
    TDefined;
type IfUndefinedOrNull<T, TUndefined, TNull, TAssigned> =
  undefined extends T ?
    TUndefined :
  null extends T ?
    TNull :
    TAssigned;
type ToWithUndefined<T> =
  T extends undefined ? T : T | undefined;

type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
type UndefinedOnPartialObject<T> = // based on UndefinedOnPartialDeep
  T extends Primitive | void | Date | RegExp | Function ?
    T :
  T extends Map<infer K, infer V> ?
    Map<K, V | undefined> :
  T extends ReadonlyMap<infer K, infer V> ?
    ReadonlyMap<K, V | undefined> :
  T extends Record<any, any> ? {
    [K in keyof T]:
      IsOptional<T, K> extends true ?
        ToWithUndefined<T[K]> :
        T[K] } :
  T;

type AssignedOption<T, O extends T | null | undefined, D extends Required<T>, K extends keyof D> =
  K extends keyof O ?
    IfAssigned<O[K],
      Assigned<O[K]>,
      D[K]> :
    D[K];
type AssignedOptions<T, O extends T | null | undefined, D extends Required<T>> =
  IfAssigned<O,
    { [K in keyof D]: AssignedOption<T, O, D, K> },
    D>;
type DM_Opt<O extends DeepMergeOptions> =
  AssignedOptions<DeepMergeOptions, O, typeof deepMergeOptionsDefaults>;

type DM_Defined<V, OUndefined extends DeepMergeValue, ONull extends DeepMergeValue> =
  IfUndefinedOrNull<V,
    OUndefined extends 'merge' ? V : never,
    ONull extends 'merge' ? V : never,
    V>;
type DM_Prop<V, O extends DeepMergeOptions> =
  DM_Defined<V,
    DM_Opt<O>['undefinedProps'],
    DM_Opt<O>['nullProps']>;
type DM_Value<V, O extends DeepMergeOptions> =
  DM_Defined<V,
    DM_Opt<O>['undefinedValues'],
    DM_Opt<O>['nullValues']>;
type DM_ArrayConcat<T extends any[], S, O extends DeepMergeOptions> =
  S extends any[] ?
    DM_Value<T[number] | S[number], O>[] :
    DM_Value<T[number] | S, O>[]; /*S*/
type DM_ArrayReplace<T extends any[], S, O extends DeepMergeOptions> =
  S extends any[] ?
    DM_Value<S[number], O>[] :
    DM_Value<S, O>[];
type DM_Array<T extends any[], S, O extends DeepMergeOptions> =
  DM_Opt<O>['arrays'] extends 'replace' ?
    DM_ArrayReplace<T, S, O> :
    DM_ArrayConcat<T, S, O>;
type DM_ObjectValuesSource<T extends object, S extends object, K extends keyof S, O extends DeepMergeOptions> =
  K extends keyof T ?
    DM_Prop<S[K], O> extends never ?
      T[K] :
      DM_Proc<T[K], DM_Prop<S[K], O>, O> :
    DM_Prop<S[K], O>;
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
    UndefinedOnPartialObject<{
      [K in KeyOfAny<T | S> as DM_ObjectKeys<T, S, K, O>]: DM_ObjectValues<T, S, K, O>
    }> :
    S;
type DM_Proc<T, S, O extends DeepMergeOptions> =
  T extends any[] ?
    DM_Array<T, S, O> :
  T extends object ?
    DM_Object<T, S, O> :
    S;
type DeepMerge<T, TSources extends unknown[], O extends DeepMergeOptions> =
  TSources extends [infer S, ...infer Rest] ?
    IfAssigned<S,
      DeepMerge<DM_Proc<T, S, O>, Rest, O>,
      DeepMerge<T, Rest, O>> :
    T;

// MARK: Deep merge: Fn

export function deepMerge<T, TSources extends unknown[], O extends DeepMergeOptions>(
  options: O | null | undefined, target: T, ...sources: TSources
): DeepMerge<T, TSources, O> {
  type UnknownObject = object | Map<unknown, unknown>;
  type UnknownArray = unknown[] | Set<unknown>;
  type ValueChecker = (v: unknown) => boolean;

  const opts = objectKeys(deepMergeOptionsDefaults).reduce(
    (o, prop) => (o[prop] = options?.[prop] ?? deepMergeOptionsDefaults[prop], o),
    {} as ObjectRecord<DeepMergeOptions>) as Required<DeepMergeOptions>;

  const checkArrayValue = getValueChecker(opts.undefinedValues == 'merge', opts.nullValues == 'merge');
  const checkObjectValue = getValueChecker(opts.undefinedProps == 'merge', opts.nullProps == 'merge');

  return sources.filter(isAssigned).reduce(deepMergeProc, target) as DeepMerge<T, TSources, O>;

  function deepMergeProc(targetVal: unknown, sourceVal: unknown): unknown {
    if (isArrayOrSet(targetVal)) {
      // TODO: Make merging primitives into array optional
      if (opts.arrays === 'concat') {
        const addToTargetArray = getArrayAdder(targetVal);
        const sourceIt = iterateClonedArray(isArrayOrSet(sourceVal) ? sourceVal : [ sourceVal ]);
        for (const v of sourceIt)
          addToTargetArray(v);
        return targetVal;
      } else if (opts.arrays === 'replace') {
        return cloneArrayAs(sourceVal, targetVal);
      } else {
        assertNever(opts.arrays);
      }
    } else if (isObjectOrMap(targetVal)) {
      if (isArrayOrSet(sourceVal))
        return cloneArrayAs(sourceVal, sourceVal);
      if (!isObjectOrMap(sourceVal))
        return isPrimitive(sourceVal) ? sourceVal : throwError(`unexpected sourceVal type ${typeof sourceVal}`);
      const getTargetObjectProp = getObjectGetter(targetVal);
      const setTargetObjectProp = getObjectSetter(targetVal);
      for (const [ k, v ] of iterateObject(sourceVal))
        setTargetObjectProp(k, deepMergeProc(getTargetObjectProp(k), v));
      return targetVal;
    } else {
      return structuredClone(sourceVal);
    }
  }

  function cloneArrayAs(a: unknown, as: UnknownArray) {
    const it = iterateClonedArray(isArrayOrSet(a) ? a : [ a ]);
    return isArray(as) ? [...it] : new Set(it);
  }

  function getValueChecker(mergeUndefined: boolean, mergeNull: boolean): ValueChecker {
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

  function getArrayAdder(a: UnknownArray): (v: unknown) => void {
    if (isSet(a))
      return v => checkArrayValue(v) && a.add(v);
    if (isArray(a))
      return v => checkArrayValue(v) && a.push(v);
    assertNever(a);
  }

  function getObjectGetter(o: UnknownObject): (k: unknown) => unknown {
    if (isMap(o))
      return k => o.get(k);
    if (isObject(o))
      return k => Reflect.get(o, toPropertyKey(k));
    assertNever(o);
  }

  function getObjectSetter(o: UnknownObject): (k: unknown, v: unknown) => void {
    if (isMap(o))
      return (k, v) => checkObjectValue(v) && o.set(k, v);
    if (isObject(o))
      return (k, v) => checkObjectValue(v) && Reflect.set(o, toPropertyKey(k), v);
    assertNever(o);
  }

  function* iterateClonedArray(a: UnknownArray): ArrayGenerator<unknown> {
    for (const v of a)
      yield structuredClone(v);
  }

  function* iterateObject(o: UnknownObject): ArrayGenerator<[unknown, unknown]> {
    if (isMap(o))
      return yield* o.entries();
    if (isObject(o))
      return yield* objectEntries(o);
    assertNever(o);
  }

  function toPropertyKey(k: unknown): PropertyKey {
    return isString(k) || isNumber(k) || isSymbol(k) ? k : String(k);
  }
}

// MARK: Inspect

export function configureInspect() {
  inspect.defaultOptions = {
    ...inspect.defaultOptions,
    colors: supportsColor.stdout && supportsColor.stdout.hasBasic,
    numericSeparator: true,
  };
  const updateBreakLength = () => {
    const lineLength = process.stdout.columns || 80;
    inspect.defaultOptions.breakLength = lineLength;
    inspect.defaultOptions.maxStringLength = lineLength * 2;
  };
  updateBreakLength();
  process.stdout.addListener('resize', updateBreakLength);
}

export function inspectPretty(o: any, opts?: InspectOptions) {
  return inspect(o, { ...opts });
}

type InspectColor = { [0]: number; [1]: number };
type InspectColorKey =
  | 'reset'
  | 'bold' | 'dim' | 'italic' | 'underline' | 'blink' | 'inverse' | 'hidden' | 'strikethrough' | 'doubleunderline' | 'framed' | 'overlined'
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'gray' | 'redBright' | 'greenBright' | 'yellowBright' | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright'
  | 'bgBlack' | 'bgRed' | 'bgGreen' | 'bgYellow' | 'bgBlue' | 'bgMagenta' | 'bgCyan' | 'bgWhite'
  | 'bgGray' | 'bgRedBright' | 'bgGreenBright' | 'bgYellowBright' | 'bgBlueBright' | 'bgMagentaBright' | 'bgCyanBright' | 'bgWhiteBright';

// TODO: Play around with this bs later
function makeInspectPretty() {
  Object.assign(Object.prototype, {
    [inspect.custom]: function (this: unknown, depth: number, opts: InspectOptionsStylized, ins: CustomInspectFunction): string {
      const colors = inspect.colors as unknown as Record<InspectColorKey, InspectColor>;
      const format = (str: string, ...color: InspectColorKey[]) =>
        opts.colors ? color.reduce((s, c) => `\x1B[${colors[c][0]}m${s}\x1B[${colors[c][1]}m`, str) : str;

      const className = format(`${this?.constructor.name ?? '<Null>'}`, 'whiteBright', 'bold');
      if (depth < 0)
        return className;
      const items = Array.isArray(this) || Symbol.iterator in <{}>this
        ? [ ...<[]>this ]
        : /*{ ...<{}>this }*/Object.entries(<{}>this);
      return `${className} { ${inspect(items, { ...opts, depth: (opts.depth ?? 0) - 1 })} }`;
    }
  });
}