import {
  arrowCurveSamples,
  type ScribblyElement,
  type ShapeElement,
} from "./elements";
import { worldToScreen, type Point, type ViewTransform } from "./geometry";

export type BBox = { x: number; y: number; width: number; height: number };

export type HandleName =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotate";

export const HANDLE_SIZE = 8;
export const HANDLE_HIT_RADIUS = 8;
export const ROTATE_OFFSET = 24;
export const CONNECTION_SNAP_RADIUS_SCREEN = 16;
export const CONNECTION_SNAP_DOT_RADIUS = 4;
export const BEND_HANDLE_RADIUS = 5;
export const BEND_HIT_RADIUS = 10;
export const ENDPOINT_HANDLE_RADIUS = 5;
export const ENDPOINT_HIT_RADIUS = 10;
export const ENDPOINT_BINDING_HALO_RADIUS = 10;
export const SELECTION_PADDING_SCREEN = 6;
export const BINDING_GAP_WORLD = 8;

export function expandedBBox(bbox: BBox, view: ViewTransform): BBox {
  const pad = SELECTION_PADDING_SCREEN / view.scale;
  return {
    x: bbox.x - pad,
    y: bbox.y - pad,
    width: bbox.width + pad * 2,
    height: bbox.height + pad * 2,
  };
}

export function shapeCenter(shape: ShapeElement): Point {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

// Intersect the ray from the shape's center toward `toward` with the shape
// perimeter and offset outward by BINDING_GAP_WORLD. Used to dynamically
// place an arrow endpoint on the perimeter closest to the other endpoint.
export function perimeterPointToward(
  shape: ShapeElement,
  toward: Point,
): Point {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  // Transform `toward` into the shape's local (un-rotated) frame.
  let dx = toward.x - cx;
  let dy = toward.y - cy;
  if (shape.angle) {
    const c = Math.cos(-shape.angle);
    const s = Math.sin(-shape.angle);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    dx = rx;
    dy = ry;
  }
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    // Degenerate: pick a stable default (right of shape).
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  let t: number;
  if (shape.type === "ellipse") {
    if (hw <= 0 || hh <= 0) {
      t = 0;
    } else {
      const ex = dx / hw;
      const ey = dy / hh;
      const denom = Math.sqrt(ex * ex + ey * ey);
      t = denom > 1e-9 ? 1 / denom : 0;
    }
  } else {
    const tx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity;
    t = Math.min(tx, ty);
  }
  const r = t + BINDING_GAP_WORLD;
  let lx = dx * r;
  let ly = dy * r;
  if (shape.angle) {
    const c = Math.cos(shape.angle);
    const s = Math.sin(shape.angle);
    const wx = lx * c - ly * s;
    const wy = lx * s + ly * c;
    return { x: cx + wx, y: cy + wy };
  }
  return { x: cx + lx, y: cy + ly };
}

export function elementBBox(el: ScribblyElement): BBox {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export function unionBBox(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function selectionBBox(
  elements: readonly ScribblyElement[],
  selectedIds: readonly string[],
): BBox | null {
  const ids = new Set(selectedIds);
  const boxes: BBox[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (isBoundText(el)) continue;
    if (ids.has(el.id)) boxes.push(elementBBox(el));
  }
  return unionBBox(boxes);
}

export function rotatePoint(
  p: Point,
  cx: number,
  cy: number,
  angle: number,
): Point {
  if (angle === 0) return p;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function pointInRect(p: Point, b: BBox): boolean {
  return (
    p.x >= b.x &&
    p.x <= b.x + b.width &&
    p.y >= b.y &&
    p.y <= b.y + b.height
  );
}

function pointInEllipse(p: Point, b: BBox): boolean {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const rx = b.width / 2;
  const ry = b.height / 2;
  if (rx === 0 || ry === 0) return false;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function distToSegment(
  p: Point,
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a[0], p.y - a[1]);
  let t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

export function hitTestElement(
  world: Point,
  el: ScribblyElement,
  slop: number,
): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const p = el.angle ? rotatePoint(world, cx, cy, -el.angle) : world;
  const expanded: BBox = {
    x: el.x - slop,
    y: el.y - slop,
    width: el.width + slop * 2,
    height: el.height + slop * 2,
  };
  switch (el.type) {
    case "rectangle":
    case "text":
    case "image":
      return pointInRect(p, expanded);
    case "ellipse":
      return pointInEllipse(p, expanded);
    case "line":
    case "freedraw": {
      const threshold = el.strokeWidth / 2 + slop;
      for (let i = 0; i < el.points.length - 1; i++) {
        const a = el.points[i];
        const b = el.points[i + 1];
        if (!a || !b) continue;
        if (distToSegment(p, a, b) <= threshold) return true;
      }
      return false;
    }
    case "arrow": {
      const threshold = el.strokeWidth / 2 + slop;
      const samples = el.bendPoint ? arrowCurveSamples(el) : el.points;
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        if (!a || !b) continue;
        if (distToSegment(p, a, b) <= threshold) return true;
      }
      return false;
    }
    case "frame": {
      // Frame hits are border-only (clicks inside the body fall through to
      // children) PLUS the name label region above the top edge. The label
      // acts as the frame's drag handle since the body itself is transparent.
      const threshold = el.strokeWidth / 2 + slop;
      const x0 = el.x;
      const y0 = el.y;
      const x1 = el.x + el.width;
      const y1 = el.y + el.height;
      const edges: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
        [[x0, y0], [x1, y0]],
        [[x1, y0], [x1, y1]],
        [[x1, y1], [x0, y1]],
        [[x0, y1], [x0, y0]],
      ];
      for (const [a, b] of edges) {
        if (distToSegment(p, a, b) <= threshold) return true;
      }
      // Name label hit region: a band 20 world units tall sitting just above
      // the frame's top edge. Width approximates the rendered text width.
      const nameLen =
        el.name && el.name.length > 0 ? el.name.length : 8; // "Frame N"
      const nameW = Math.max(60, nameLen * 8);
      if (
        p.x >= x0 - slop &&
        p.x <= x0 + nameW + slop &&
        p.y >= y0 - 20 - slop &&
        p.y <= y0 - 2 + slop
      ) {
        return true;
      }
      return false;
    }
  }
}

// Text bound to a container is rendered by the container and should never be
// hit-testable on its own — clicking the area inside a container selects the
// container, and the double-click path resolves bound text by lookup.
function isBoundText(el: ScribblyElement): boolean {
  return el.type === "text" && el.containerId !== null;
}

export function pickElement(
  world: Point,
  elements: readonly ScribblyElement[],
  slop: number,
): ScribblyElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el || el.isDeleted) continue;
    if (isBoundText(el)) continue;
    if (hitTestElement(world, el, slop)) return el;
  }
  return null;
}

export function elementsInBox(
  elements: readonly ScribblyElement[],
  box: BBox,
): ScribblyElement[] {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const out: ScribblyElement[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (isBoundText(el)) continue;
    const er = el.x + el.width;
    const eb = el.y + el.height;
    if (el.x <= right && er >= box.x && el.y <= bottom && eb >= box.y) {
      out.push(el);
    }
  }
  return out;
}

export function handlePositions(
  bbox: BBox,
  view: ViewTransform,
  angle: number = 0,
): Record<HandleName, Point> {
  const pbox = expandedBBox(bbox, view);
  const cx = pbox.x + pbox.width / 2;
  const cy = pbox.y + pbox.height / 2;
  const right = pbox.x + pbox.width;
  const bottom = pbox.y + pbox.height;
  const rotateY = pbox.y - ROTATE_OFFSET / view.scale;
  const raw: Record<HandleName, Point> = {
    nw: { x: pbox.x, y: pbox.y },
    n: { x: cx, y: pbox.y },
    ne: { x: right, y: pbox.y },
    e: { x: right, y: cy },
    se: { x: right, y: bottom },
    s: { x: cx, y: bottom },
    sw: { x: pbox.x, y: bottom },
    w: { x: pbox.x, y: cy },
    rotate: { x: cx, y: rotateY },
  };
  if (!angle) return raw;
  const out = {} as Record<HandleName, Point>;
  for (const name of Object.keys(raw) as HandleName[]) {
    out[name] = rotatePoint(raw[name], cx, cy, angle);
  }
  return out;
}

export function pickHandle(
  world: Point,
  view: ViewTransform,
  bbox: BBox,
  angle: number,
  allowRotate: boolean,
): HandleName | null {
  const handles = handlePositions(bbox, view, angle);
  const screen = worldToScreen(view, world.x, world.y);
  const names: HandleName[] = ["nw", "ne", "se", "sw", "rotate"];
  for (const name of names) {
    if (name === "rotate" && !allowRotate) continue;
    const wp = handles[name];
    const sp = worldToScreen(view, wp.x, wp.y);
    if (
      Math.abs(screen.x - sp.x) <= HANDLE_HIT_RADIUS &&
      Math.abs(screen.y - sp.y) <= HANDLE_HIT_RADIUS
    ) {
      return name;
    }
  }
  return null;
}
