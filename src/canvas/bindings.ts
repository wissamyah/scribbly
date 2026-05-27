import {
  isShape,
  type ArrowElement,
  type Binding,
  type ScribblyElement,
  type Point,
  type ShapeElement,
} from "./elements";
import type { Point as ScreenPoint, ViewTransform } from "./geometry";
import {
  CONNECTION_SNAP_RADIUS_SCREEN,
  hitTestElement,
  perimeterPointToward,
  shapeCenter,
} from "./hitTest";

export type BindingMatch = {
  shape: ShapeElement;
  // The exact world point chosen by the user. We do NOT project to the
  // perimeter — the endpoint stays wherever the pointer is.
  world: ScreenPoint;
  // Normalized offset from the shape's center in its local (un-rotated)
  // frame: fx = (localX - cx) / (width/2), fy = (localY - cy) / (height/2).
  // Used to follow the shape through translate/resize/rotate.
  focus: Point;
};

// Convert a world point into the shape-local normalized focus offset.
export function worldToFocus(shape: ShapeElement, world: ScreenPoint): Point {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  let dx = world.x - cx;
  let dy = world.y - cy;
  if (shape.angle) {
    const c = Math.cos(-shape.angle);
    const s = Math.sin(-shape.angle);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    dx = rx;
    dy = ry;
  }
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  const fx = hw > 1e-6 ? dx / hw : 0;
  const fy = hh > 1e-6 ? dy / hh : 0;
  return [fx, fy] as Point;
}

// Inverse of worldToFocus.
export function focusToWorld(shape: ShapeElement, focus: Point): ScreenPoint {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  let lx = focus[0] * (shape.width / 2);
  let ly = focus[1] * (shape.height / 2);
  if (shape.angle) {
    const c = Math.cos(shape.angle);
    const s = Math.sin(shape.angle);
    const wx = lx * c - ly * s;
    const wy = lx * s + ly * c;
    return { x: cx + wx, y: cy + wy };
  }
  return { x: cx + lx, y: cy + ly };
}

// Binding range: the pointer must be within the shape (or slop of its
// perimeter). The slop is intentionally generous so the user can drop just
// outside the shape and still bind.
const BINDING_SLOP_MULTIPLIER = 1.5;

// Find a shape suitable for binding under `world`. The returned `world` is
// the exact pointer position (NOT projected to perimeter), and `focus` is
// the normalized local offset, so subsequent shape changes follow it.
export function findBindingAt(
  world: ScreenPoint,
  elements: readonly ScribblyElement[],
  view: ViewTransform,
  _reference: ScreenPoint | null,
): BindingMatch | null {
  const slop =
    (CONNECTION_SNAP_RADIUS_SCREEN * BINDING_SLOP_MULTIPLIER) / view.scale;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el || el.isDeleted) continue;
    if (!isShape(el)) continue;
    if (!hitTestElement(world, el, slop)) continue;
    const focus = worldToFocus(el, world);
    return { shape: el, world, focus };
  }
  return null;
}

export function bindingTarget(
  binding: Binding | null,
  elementsById: Map<string, ScribblyElement>,
): ShapeElement | null {
  if (!binding) return null;
  const target = elementsById.get(binding.elementId);
  if (!target || target.isDeleted) return null;
  if (!isShape(target)) return null;
  return target;
}

export function arrowEndpointFromBinding(
  arrow: ArrowElement,
  which: "start" | "end",
  elementsById: Map<string, ScribblyElement>,
): Point | null {
  const binding = which === "start" ? arrow.startBinding : arrow.endBinding;
  const target = bindingTarget(binding, elementsById);
  if (!target || !binding) return null;
  if (binding.focus) {
    const w = focusToWorld(target, binding.focus);
    return [w.x, w.y] as Point;
  }
  // Legacy fallback: old bindings without a focus reproject onto the
  // perimeter facing the other endpoint or the other bound shape.
  const otherBinding = which === "start" ? arrow.endBinding : arrow.startBinding;
  const otherShape = bindingTarget(otherBinding, elementsById);
  let ref: ScreenPoint;
  if (otherShape) {
    ref = shapeCenter(otherShape);
  } else if (arrow.points.length >= 2) {
    const otherPoint =
      which === "start"
        ? arrow.points[arrow.points.length - 1]!
        : arrow.points[0]!;
    ref = { x: otherPoint[0], y: otherPoint[1] };
  } else {
    return null;
  }
  const w = perimeterPointToward(target, ref);
  return [w.x, w.y] as Point;
}

export function recomputeArrowPoints(
  arrow: ArrowElement,
  elementsById: Map<string, ScribblyElement>,
): { points: Point[]; changed: boolean } {
  if (arrow.points.length < 2) {
    return { points: arrow.points, changed: false };
  }
  const startBound = arrow.startBinding
    ? arrowEndpointFromBinding(arrow, "start", elementsById)
    : null;
  const endBound = arrow.endBinding
    ? arrowEndpointFromBinding(arrow, "end", elementsById)
    : null;
  if (!startBound && !endBound) {
    return { points: arrow.points, changed: false };
  }
  const start = arrow.points[0]!;
  const end = arrow.points[arrow.points.length - 1]!;
  const nextStart = startBound ?? start;
  const nextEnd = endBound ?? end;
  const changed =
    nextStart[0] !== start[0] ||
    nextStart[1] !== start[1] ||
    nextEnd[0] !== end[0] ||
    nextEnd[1] !== end[1];
  if (!changed) return { points: arrow.points, changed: false };
  return { points: [nextStart, nextEnd], changed: true };
}
