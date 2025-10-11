import * as Kw from "./cssKeywords.ts";
import { isDefined, isNull, throwError } from '../utils.ts';

const kw = Kw.kw;

// MARK: Types

export type Angle = typeof kw.unit.angle[number];
export type Frequency = typeof kw.unit.frequency[number];
export type Percent = typeof kw.unit.percent[number];
export type Resolution = typeof kw.unit.resolution[number];
export type Time = typeof kw.unit.resolution[number];

export type AbsoluteLength = typeof kw.unit.length.absolute[number];
export type RelativeLength = typeof kw.unit.length.relative[number];
export type RelativeRootLength = typeof kw.unit.length.relativeRoot[number];
export type ContainerQueryLength = typeof kw.unit.length.containerQuery[number];
export type ViewportDefaultLength = typeof kw.unit.length.viewport.default[number];
export type ViewportSmallLength = typeof kw.unit.length.viewport.small[number];
export type ViewportLargeLength = typeof kw.unit.length.viewport.large[number];
export type ViewportDynamicLength = typeof kw.unit.length.viewport.dynamic[number];
export type ViewportLength = typeof kw.unit.length.viewport.all[number];
export type Length = typeof kw.unit.length.all[number];

export type Any = Angle | Frequency | Percent | Resolution | Time | Length;
export type AnyAbsolute = Angle | Frequency | Resolution | Time | AbsoluteLength;

// MARK: Guards

export const isAngle = (v: string | null | undefined) => Kw.equals(v, kw.unit.angle);
export const isFrequency = (v: string | null | undefined) => Kw.equals(v, kw.unit.frequency);
export const isPercent = (v: string | null | undefined) => Kw.equals(v, kw.unit.percent);
export const isResolution = (v: string | null | undefined) => Kw.equals(v, kw.unit.resolution);
export const isTime = (v: string | null | undefined) => Kw.equals(v, kw.unit.time);

export const isAbsoluteLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.absolute);
export const isRelativeLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.relative);
export const isRelativeRootLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.relativeRoot);
export const isContainerQueryLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.containerQuery);
export const isViewportDefaultLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.viewport.default);
export const isViewportSmallLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.viewport.small);
export const isViewportLargeLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.viewport.large);
export const isViewportDynamicLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.viewport.dynamic);
export const isViewportLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.viewport.all);
export const isLength = (v: string | null | undefined) => Kw.equals(v, kw.unit.length.all);

export const isAny = (v: string | null | undefined) => Kw.equals(v, kw.unit.all);
export const isAnyAbsolute = (v: string | null | undefined) => Kw.equals(v, kw.unit.allAbsolute);

export const isUnitless = (v: string | null | undefined) => v === null;

// MARK: Convert

const cssUnitMults = new class {
  readonly angle: Record<Angle, number> = {
    deg: 1,
    grad: 0.9,
    rad: 180 / Math.PI,
    turn: 360,
  } as const;
  readonly frequency: Record<Frequency, number> = {
    hz: 1,
    khz: 1000,
  } as const;
  readonly length: Record<AbsoluteLength, number> = {
    px: 1,
    cm: 96 / 2.54,
    mm: 96 / 2.54 / 10,
    q: 96 / 2.54 / 10 / 4,
    in: 96,
    pc: 96 / 6,
    pt: 96 / 72,
  } as const;
  readonly resolution: Record<Resolution, number> = {
    dpi: 96,
    dpcm: 96 / 2.54,
    dppx: 1,
    x: 1,
  } as const;
};

function convertAbsolute<U extends AnyAbsolute>(value: number, fromUnit: U | null, toUnit: U | null, mults: Record<U, number>): number {
  if (isNull(fromUnit) && isNull(toUnit) || value == 0)
    return value;
  if (isNull(fromUnit))
    throwError("Cannot convert from a unitless value");
  if (isNull(toUnit))
    throwError("Cannot convert to a unitless value");
  return value * getMult(fromUnit, "Source") / getMult(toUnit, "Target");

  function getMult(unit: U, msg: string) {
    const mult = mults[unit.toLowerCase() as U];
    return isDefined(mult) ? mult : throwError(`${msg} unit must be absolute, ${unit} provided`);
  }
}

export function convertAngle(value: number, fromUnit: Angle, toUnit: Angle): number {
  return convertAbsolute(value, fromUnit, toUnit, cssUnitMults.angle);
}

export function convertFrequency(value: number, fromUnit: Frequency, toUnit: Frequency): number {
  return convertAbsolute(value, fromUnit, toUnit, cssUnitMults.frequency);
}

export function convertLength(value: number, fromUnit: AbsoluteLength, toUnit: AbsoluteLength): number {
  return convertAbsolute(value, fromUnit, toUnit, cssUnitMults.length);
}

export function convertPercent(value: number, fromUnit: Percent | null, toUnit: Percent | null): number {
  return value * getMult(fromUnit) / getMult(toUnit);

  function getMult(unit: Percent | null) {
    return isNull(unit) ? 0.01 : 1;
  }
}

export function convertResolution(value: number, fromUnit: Resolution, toUnit: Resolution): number {
  return convertAbsolute(value, fromUnit, toUnit, cssUnitMults.resolution);
}