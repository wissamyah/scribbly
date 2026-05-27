import type { DrawingTool } from "./types";

/**
 * Text is committed asynchronously: pointerup opens an inline editor (handled
 * by the TextEditor overlay). The element is created when the editor commits.
 */
export function createTextTool(): DrawingTool {
  return {
    name: "text",
    onPointerDown() {},
    onPointerMove() {},
    onPointerUp(info, ctx) {
      ctx.setTextDraft({ worldX: info.world.x, worldY: info.world.y });
    },
    onCancel(ctx) {
      ctx.setTextDraft(null);
    },
  };
}
