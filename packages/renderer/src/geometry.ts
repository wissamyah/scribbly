export type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

export type Point = { x: number; y: number };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 30;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToWorld(
  view: ViewTransform,
  screenX: number,
  screenY: number,
): Point {
  return {
    x: (screenX - view.x) / view.scale,
    y: (screenY - view.y) / view.scale,
  };
}

export function worldToScreen(
  view: ViewTransform,
  worldX: number,
  worldY: number,
): Point {
  return {
    x: worldX * view.scale + view.x,
    y: worldY * view.scale + view.y,
  };
}

export function zoomAt(
  view: ViewTransform,
  screenX: number,
  screenY: number,
  factor: number,
): ViewTransform {
  const nextScale = clampScale(view.scale * factor);
  const actualFactor = nextScale / view.scale;
  return {
    scale: nextScale,
    x: screenX - (screenX - view.x) * actualFactor,
    y: screenY - (screenY - view.y) * actualFactor,
  };
}

// Fit a world-space bbox into a screen-space viewport with `pad` px margin.
export function fitToViewport(
  bbox: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  pad = 64,
): ViewTransform {
  if (bbox.width <= 0 || bbox.height <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };
  }
  const availW = Math.max(1, viewport.width - pad * 2);
  const availH = Math.max(1, viewport.height - pad * 2);
  const scale = clampScale(
    Math.min(availW / bbox.width, availH / bbox.height),
  );
  const x = viewport.width / 2 - (bbox.x + bbox.width / 2) * scale;
  const y = viewport.height / 2 - (bbox.y + bbox.height / 2) * scale;
  return { x, y, scale };
}
