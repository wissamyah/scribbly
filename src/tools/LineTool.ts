import { createLine, pickBaseStyle, pointsBounds } from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import { snapToAngle } from "./shiftConstraints";
import type { DrawingTool } from "./types";

const MIN_DRAG = 2;

export function createLineTool(): DrawingTool {
  let start: Point | null = null;

  return {
    name: "line",
    onPointerDown(info, ctx) {
      start = info.world;
      ctx.setDraft(
        createLine({
          roomId: ctx.roomId,
          ...pickBaseStyle(useAppState.getState().currentStyle),
          points: [
            [info.world.x, info.world.y],
            [info.world.x, info.world.y],
          ],
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "line") return;
      const end = info.shiftKey ? snapToAngle(start, info.world) : info.world;
      const points: [number, number][] = [
        [start.x, start.y],
        [end.x, end.y],
      ];
      ctx.setDraft({ ...draft, points, ...pointsBounds(points) });
    },
    onPointerUp(info, ctx) {
      if (!start) return;
      const end = info.shiftKey ? snapToAngle(start, info.world) : info.world;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      start = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "line") return;
      if (Math.hypot(dx, dy) < MIN_DRAG) return;
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
