import type { Point } from "../canvas/geometry";

export type BoxResult = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function constrainBoxToSquare(
  start: Point,
  current: Point,
  shift: boolean,
): BoxResult {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const w = Math.abs(dx);
  const h = Math.abs(dy);
  if (!shift) {
    return {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: w,
      height: h,
    };
  }
  const size = Math.max(w, h);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return {
    x: sx >= 0 ? start.x : start.x - size,
    y: sy >= 0 ? start.y : start.y - size,
    width: size,
    height: size,
  };
}

const QUARTER_PI = Math.PI / 4;

export function snapToAngle(start: Point, current: Point): Point {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return current;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / QUARTER_PI) * QUARTER_PI;
  return {
    x: start.x + Math.cos(snapped) * len,
    y: start.y + Math.sin(snapped) * len,
  };
}

export function lockToAxis(start: Point, current: Point): Point {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: current.x, y: start.y };
  }
  return { x: start.x, y: current.y };
}
