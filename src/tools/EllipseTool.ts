import { createEllipse, pickBaseStyle } from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import { constrainBoxToSquare } from "./shiftConstraints";
import type { DrawingTool } from "./types";

const MIN_DRAG = 2;

export function createEllipseTool(): DrawingTool {
  let start: Point | null = null;

  return {
    name: "ellipse",
    onPointerDown(info, ctx) {
      start = info.world;
      ctx.setDraft(
        createEllipse({
          roomId: ctx.roomId,
          ...pickBaseStyle(useAppState.getState().currentStyle),
          x: info.world.x,
          y: info.world.y,
          width: 0,
          height: 0,
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "ellipse") return;
      const box = constrainBoxToSquare(start, info.world, info.shiftKey);
      ctx.setDraft({ ...draft, ...box });
    },
    onPointerUp(_info, ctx) {
      if (!start) return;
      start = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "ellipse") return;
      if (draft.width < MIN_DRAG || draft.height < MIN_DRAG) return;
      ctx.addElement(draft);
      ctx.setSelectedIds([draft.id]);
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      start = null;
      ctx.setDraft(null);
    },
  };
}
