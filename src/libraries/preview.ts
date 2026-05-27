import type { ScribblyElement } from "../canvas/elements";
import { fitToViewport } from "../canvas/geometry";
import { renderScene } from "../canvas/renderer";
import { elementsBounds } from "./normalize";

const PREVIEW_SIZE = 160;
const PREVIEW_PADDING = 12;

/**
 * Render the given elements to an offscreen canvas and return a PNG data
 * URL suitable for sidebar thumbnails. Elements are assumed to be in
 * library-normalized coordinates (top-left near 0,0); we still fit-to-
 * viewport to handle arbitrary input.
 */
export function renderItemPreview(
  elements: readonly ScribblyElement[],
  size: number = PREVIEW_SIZE,
): string {
  if (elements.length === 0) return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const bounds = elementsBounds(elements);
  const view = fitToViewport(
    bounds,
    { width: size, height: size },
    PREVIEW_PADDING,
  );

  renderScene(canvas, ctx, view, elements, {
    dpr: 1,
    sceneWidth: size,
    sceneHeight: size,
    drawGrid: false,
    background: "#ffffff",
    theme: "light",
  });

  return canvas.toDataURL("image/png");
}
