import { findBindingAt } from "../canvas/bindings";
import {
  arrowBounds,
  createArrow,
  pickBaseStyle,
  type Binding,
} from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import { snapToAngle } from "./shiftConstraints";
import type { DrawingTool } from "./types";

const MIN_DRAG = 2;

type Resolved = {
  world: Point;
  binding: Binding | null;
  targetId: string | null;
};

function resolvePointer(
  worldPoint: Point,
  shiftKey: boolean,
  start: Point | null,
  reference: Point | null,
): Resolved {
  const state = useAppState.getState();
  const view = state.view;
  const elements = state.elements;
  const match = findBindingAt(worldPoint, elements, view, reference);
  if (match) {
    return {
      world: match.world,
      binding: { elementId: match.shape.id, focus: match.focus },
      targetId: match.shape.id,
    };
  }
  const constrained = shiftKey && start ? snapToAngle(start, worldPoint) : worldPoint;
  return { world: constrained, binding: null, targetId: null };
}

export function createArrowTool(): DrawingTool {
  let start: Point | null = null;
  let startBinding: Binding | null = null;

  return {
    name: "arrow",
    onPointerDown(info, ctx) {
      const resolved = resolvePointer(info.world, false, null, null);
      start = resolved.world;
      startBinding = resolved.binding;
      useAppState.getState().setConnectionTargetId(null);
      const style = useAppState.getState().currentStyle;
      ctx.setDraft(
        createArrow({
          roomId: ctx.roomId,
          ...pickBaseStyle(style),
          points: [
            [start.x, start.y],
            [start.x, start.y],
          ],
          startBinding,
          endBinding: null,
          startArrowhead: style.startArrowhead,
          endArrowhead: style.endArrowhead,
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "arrow") return;
      const resolved = resolvePointer(info.world, info.shiftKey, start, start);
      useAppState.getState().setConnectionTargetId(resolved.targetId);
      const points: [number, number][] = [
        [start.x, start.y],
        [resolved.world.x, resolved.world.y],
      ];
      const next = {
        ...draft,
        points,
        endBinding: resolved.binding,
      };
      ctx.setDraft({ ...next, ...arrowBounds(next) });
    },
    onPointerUp(info, ctx) {
      const startPt = start;
      if (!startPt) return;
      const resolved = resolvePointer(info.world, info.shiftKey, startPt, startPt);
      const dx = resolved.world.x - startPt.x;
      const dy = resolved.world.y - startPt.y;
      start = null;
      startBinding = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      useAppState.getState().setConnectionTargetId(null);
      if (!draft || draft.type !== "arrow") return;
      if (Math.hypot(dx, dy) < MIN_DRAG) return;
      const finalPoints: [number, number][] = [
        [startPt.x, startPt.y],
        [resolved.world.x, resolved.world.y],
      ];
      const finalArrow = {
        ...draft,
        points: finalPoints,
        endBinding: resolved.binding,
      };
      ctx.addElement({ ...finalArrow, ...arrowBounds(finalArrow) });
      ctx.setSelectedIds([draft.id]);
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      start = null;
      startBinding = null;
      useAppState.getState().setConnectionTargetId(null);
      ctx.setDraft(null);
    },
  };
}
