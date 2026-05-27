/**
 * High-level helper: render an array of normalized library-item elements
 * onto a canvas, fit into a target viewport. Used by the marketplace
 * registry to produce gallery-preview PNGs.
 *
 * No selection chrome, no overlays — just the elements themselves. The app
 * has its own renderScene that handles handles/laser/eraser/snap on top
 * of the same drawElement primitive.
 */

import { drawElement, getRoughCanvas } from "./draw";
import { fitToViewport } from "./geometry";
import { elementsBounds } from "./math";
import type { Theme } from "./theme";
import type { ScribblyElement } from "./types";

export type RenderItemOptions = {
  viewport: { width: number; height: number };
  padding?: number;
  background?: string | null;
  theme?: Theme;
  // Device pixel ratio. Caller has typically already set canvas.width =
  // viewport.width * dpr; we apply the dpr scale here so callers can pass
  // world-space viewport sizes.
  dpr?: number;
};

export function renderItemElements(
  canvas: HTMLCanvasElement,
  elements: readonly ScribblyElement[],
  options: RenderItemOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("renderItemElements: 2D context unavailable");

  const dpr = options.dpr ?? 1;
  const theme: Theme = options.theme ?? "light";
  const background = options.background ?? null;
  const padding = options.padding ?? 16;
  const { width, height } = options.viewport;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (background && background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const live = elements.filter((e) => !e.isDeleted);
  if (live.length > 0) {
    const bbox = elementsBounds(live);
    const view = fitToViewport(bbox, { width, height }, padding);
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    // Stable z-order: zIndex first, then id lexicographically to break ties.
    const sorted = [...live].sort((a, b) =>
      a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.id < b.id ? -1 : 1,
    );
    const elementsById = new Map(sorted.map((e) => [e.id, e]));
    const rc = getRoughCanvas(canvas);
    for (const el of sorted) {
      drawElement(rc, ctx, el, 1, elementsById, theme, null, background);
    }
  }

  ctx.restore();
}
