import { Kw, kw } from "./cssKeywords.ts";

export namespace Cu {

  // MARK: Types

  export type Angle = typeof kw.unit.angle[number];

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

  export type Percent = typeof kw.unit.percent[number];

  // MARK: Utils

  export const isLengthAbsolute = (v: string) => Kw.equals(v, kw.unit.length.absolute);
}