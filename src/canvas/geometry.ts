// Geometry math now lives in @scribbly/renderer (shared with the marketplace
// registry). Re-export so existing app imports `from "../canvas/geometry"`
// keep working.

export {
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  fitToViewport,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "@scribbly/renderer";
export type { Point, ViewTransform } from "@scribbly/renderer";
