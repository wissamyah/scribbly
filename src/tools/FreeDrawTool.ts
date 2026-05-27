import { createFreeDraw, pickBaseStyle, pointsBounds } from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import { lockToAxis } from "./shiftConstraints";
import type { DrawingTool } from "./types";

const MIN_DIST_SQ = 1;

export function createFreeDrawTool(): DrawingTool {
  let drawing = false;
  let start: Point | null = null;

  return {
    name: "freedraw",
    onPointerDown(info, ctx) {
      drawing = true;
      start = info.world;
      ctx.setDraft(
        createFreeDraw({
          roomId: ctx.roomId,
          ...pickBaseStyle(useAppState.getState().currentStyle),
          points: [[info.world.x, info.world.y]],
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!drawing || !start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "freedraw") return;
      // Shift = uniform scale: new points snap to a single axis through start.
      // The stroke becomes a straight axis-aligned line until shift releases.
      const next = info.shiftKey ? lockToAxis(start, info.world) : info.world;
      const last = draft.points[draft.points.length - 1];
      if (last) {
        const dx = next.x - last[0];
        const dy = next.y - last[1];
        if (dx * dx + dy * dy < MIN_DIST_SQ) return;
      }
      const points: [number, number][] = [
        ...draft.points.map(([x, y]) => [x, y] as [number, number]),
        [next.x, next.y],
      ];
      ctx.setDraft({ ...draft, points, ...pointsBounds(points) });
    },
    onPointerUp(_info, ctx) {
      if (!drawing) return;
      drawing = false;
      start = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "freedraw") return;
      if (draft.points.length < 2) return;
      ctx.addElement(draft);
      ctx.setSelectedIds([draft.id]);
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      drawing = false;
      start = null;
      ctx.setDraft(null);
    },
  };
}
