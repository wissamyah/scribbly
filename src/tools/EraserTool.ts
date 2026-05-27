import type { Point } from "../canvas/geometry";
import { hitTestElement } from "../canvas/hitTest";
import { useAppState } from "../store/appState";
import type { DrawingTool, ToolContext } from "./types";

const ERASER_RADIUS_SCREEN = 10;
const SAMPLE_SPACING_SCREEN = 4;

function eraseAlongSegment(
  prev: Point,
  next: Point,
  ctx: ToolContext,
  accumulator: Set<string>,
): void {
  const state = useAppState.getState();
  const view = state.view;
  const slop = ERASER_RADIUS_SCREEN / view.scale;
  const elements = state.elements;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const distScreen =
    Math.hypot(dx, dy) * view.scale;
  const steps = Math.max(1, Math.ceil(distScreen / SAMPLE_SPACING_SCREEN));
  let added = false;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: prev.x + dx * t, y: prev.y + dy * t };
    for (const el of elements) {
      if (el.isDeleted) continue;
      if (el.isLocked) continue;
      if (accumulator.has(el.id)) continue;
      if (hitTestElement(p, el, slop)) {
        accumulator.add(el.id);
        added = true;
      }
    }
  }
  if (added) {
    ctx.setSelectedIds([]);
    useAppState.getState().setPendingEraseIds(new Set(accumulator));
  }
}

export function createEraserTool(): DrawingTool {
  let last: Point | null = null;
  const pending = new Set<string>();

  return {
    name: "eraser",
    onPointerDown(info, ctx) {
      pending.clear();
      last = info.world;
      const s = useAppState.getState();
      s.setPendingEraseIds(new Set());
      s.clearEraserTrail();
      s.pushEraserTrailPoint(info.world.x, info.world.y);
      eraseAlongSegment(info.world, info.world, ctx, pending);
    },
    onPointerMove(info, ctx) {
      if (!last) return;
      eraseAlongSegment(last, info.world, ctx, pending);
      last = info.world;
      useAppState.getState().pushEraserTrailPoint(info.world.x, info.world.y);
    },
    onPointerUp(_info, _ctx) {
      const ids = [...pending];
      pending.clear();
      last = null;
      const s = useAppState.getState();
      s.setPendingEraseIds(new Set());
      s.clearEraserTrail();
      if (ids.length > 0) {
        s.deleteElements(ids);
      }
    },
    onCancel(_ctx) {
      pending.clear();
      last = null;
      const s = useAppState.getState();
      s.setPendingEraseIds(new Set());
      s.clearEraserTrail();
    },
  };
}
