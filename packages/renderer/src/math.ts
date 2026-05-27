import type {
  ArrowElement,
  BaseStyleFields,
  ElementPoint,
  LinearElement,
  ScribblyElement,
  ShapeElement,
  TextElement,
} from "./types";

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Tight axis-aligned bounding box of a set of elements (uses each element's
// stored bbox; doesn't reconstruct from points). Used for library-item
// normalization and preview-canvas fitting.
export function elementsBounds(
  elements: readonly ScribblyElement[],
): Bounds {
  if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function pointsBounds(points: readonly ElementPoint[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function arrowPolyline(el: ArrowElement): ElementPoint[] {
  if (el.points.length < 2) return [...el.points];
  const start = el.points[0]!;
  const end = el.points[el.points.length - 1]!;
  return el.bendPoint ? [start, el.bendPoint, end] : [start, end];
}

// Quadratic Bezier control point such that B(0.5) equals the bend point.
// B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2 → P1 = 2*bend - 0.5*(start + end).
export function arrowQuadraticControl(
  start: ElementPoint,
  bend: ElementPoint,
  end: ElementPoint,
): ElementPoint {
  return [
    2 * bend[0] - 0.5 * (start[0] + end[0]),
    2 * bend[1] - 0.5 * (start[1] + end[1]),
  ] as ElementPoint;
}

const ARROW_CURVE_SAMPLE_COUNT = 24;

export function arrowCurveSamples(
  el: ArrowElement,
  segments = ARROW_CURVE_SAMPLE_COUNT,
): ElementPoint[] {
  if (el.points.length < 2) return [...el.points];
  const start = el.points[0]!;
  const end = el.points[el.points.length - 1]!;
  if (!el.bendPoint) return [start, end];
  const ctrl = arrowQuadraticControl(start, el.bendPoint, end);
  const out: ElementPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const omt = 1 - t;
    const x = omt * omt * start[0] + 2 * omt * t * ctrl[0] + t * t * end[0];
    const y = omt * omt * start[1] + 2 * omt * t * ctrl[1] + t * t * end[1];
    out.push([x, y] as ElementPoint);
  }
  return out;
}

export function arrowBounds(el: ArrowElement): Bounds {
  // Use a coarse sampling of the curve so the stored bbox tightly contains it.
  return pointsBounds(arrowCurveSamples(el, 12));
}

// Midpoint along the arrow's visible path. For a straight arrow this is the
// midpoint of start–end; for a bent one it's the quadratic curve's t=0.5
// position which — by construction in `arrowQuadraticControl` — equals the
// bend point exactly.
export function arrowMidpoint(el: ArrowElement): ElementPoint | null {
  if (el.points.length < 2) return null;
  const start = el.points[0]!;
  const end = el.points[el.points.length - 1]!;
  if (el.bendPoint) return el.bendPoint;
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as ElementPoint;
}

export function isLinear(el: ScribblyElement): el is LinearElement {
  return el.type === "line" || el.type === "arrow";
}

export function isShape(el: ScribblyElement): el is ShapeElement {
  return (
    el.type === "rectangle" ||
    el.type === "ellipse" ||
    el.type === "image"
  );
}

export function isTextContainer(el: ScribblyElement): el is ShapeElement {
  return el.type === "rectangle" || el.type === "ellipse";
}

export function findBoundTextElement(
  elements: readonly ScribblyElement[],
  containerId: string,
): TextElement | null {
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === "text" && el.containerId === containerId) return el;
  }
  return null;
}

export function translateElement(
  el: ScribblyElement,
  dx: number,
  dy: number,
): ScribblyElement {
  if (dx === 0 && dy === 0) return el;
  if (el.type === "arrow") {
    return {
      ...el,
      x: el.x + dx,
      y: el.y + dy,
      points: el.points.map(
        ([px, py]) => [px + dx, py + dy] as ElementPoint,
      ),
      bendPoint: el.bendPoint
        ? ([el.bendPoint[0] + dx, el.bendPoint[1] + dy] as ElementPoint)
        : null,
    };
  }
  if (el.type === "line" || el.type === "freedraw") {
    return {
      ...el,
      x: el.x + dx,
      y: el.y + dy,
      points: el.points.map(
        ([px, py]) => [px + dx, py + dy] as ElementPoint,
      ),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function pickBaseStyle<T extends BaseStyleFields>(
  s: T,
): BaseStyleFields {
  return {
    strokeColor: s.strokeColor,
    backgroundColor: s.backgroundColor,
    fillStyle: s.fillStyle,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    roughness: s.roughness,
    opacity: s.opacity,
  };
}
