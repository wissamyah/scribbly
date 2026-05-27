import type { PointerInfo } from "../hooks/usePointer";
import type { DrawingTool, ToolContext } from "./types";

export function createHandTool(): DrawingTool {
  let last: PointerInfo["screen"] | null = null;

  return {
    name: "hand",
    onPointerDown(info) {
      last = info.screen;
    },
    onPointerMove(info, ctx: ToolContext) {
      if (!last) return;
      const dx = info.screen.x - last.x;
      const dy = info.screen.y - last.y;
      last = info.screen;
      ctx.panBy(dx, dy);
    },
    onPointerUp() {
      last = null;
    },
    onCancel() {
      last = null;
    },
  };
}
