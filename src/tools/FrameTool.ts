import { createFrame } from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { constrainBoxToSquare } from "./shiftConstraints";
import type { DrawingTool } from "./types";

const MIN_DRAG = 8;

export function createFrameTool(): DrawingTool {
  let start: Point | null = null;

  return {
    name: "frame",
    onPointerDown(info, ctx) {
      start = info.world;
      ctx.setDraft(
        createFrame({
          roomId: ctx.roomId,
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
      if (!draft || draft.type !== "frame") return;
      const box = constrainBoxToSquare(start, info.world, info.shiftKey);
      ctx.setDraft({ ...draft, ...box });
    },
    onPointerUp(_info, ctx) {
      if (!start) return;
      start = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "frame") return;
      if (draft.width < MIN_DRAG || draft.height < MIN_DRAG) return;
      ctx.addElement(draft);
      // Adopt elements whose center already sits inside the new frame.
      const elements = ctx.getElements();
      const x0 = draft.x;
      const y0 = draft.y;
      const x1 = draft.x + draft.width;
      const y1 = draft.y + draft.height;
      const adoptIds: string[] = [];
      for (const el of elements) {
        if (el.isDeleted) continue;
        if (el.id === draft.id) continue;
        if (el.type === "frame") continue;
        if (el.frameId) continue;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          adoptIds.push(el.id);
        }
      }
      if (adoptIds.length > 0) {
        ctx.updateElements(adoptIds, (el) =>
          el.frameId === draft.id ? el : { ...el, frameId: draft.id },
        );
      }
      ctx.setSelectedIds([draft.id]);
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      start = null;
      ctx.setDraft(null);
    },
  };
}
