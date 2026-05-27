// Theme color resolution lives in @scribbly/renderer (shared with the
// marketplace registry). The app-only bits — canvas background sentinels
// and "is this the default color?" helpers used by the swatch grid — stay
// here.

import {
  DEFAULT_FONT_DARK,
  DEFAULT_FONT_LIGHT,
  DEFAULT_STROKE_DARK,
  DEFAULT_STROKE_LIGHT,
  type Theme,
} from "@scribbly/renderer";

export type { Theme } from "@scribbly/renderer";
export {
  DEFAULT_FONT_DARK,
  DEFAULT_FONT_LIGHT,
  DEFAULT_STROKE_DARK,
  DEFAULT_STROKE_LIGHT,
  resolveFontColor,
  resolveStrokeColor,
} from "@scribbly/renderer";

// Canvas background sentinels are app-side only — the renderer doesn't
// care about the surrounding chrome.
export const LIGHT_CANVAS_BG = "#fafafa";
export const DARK_CANVAS_BG = "#121212";

// Returns the canvas background to use when the user toggles theme.
// Preserves an explicit choice (anything that isn't the opposite theme's
// default sentinel) and only swaps the auto-default bg.
export function canvasBackgroundForTheme(
  current: string,
  nextTheme: Theme,
): string {
  if (nextTheme === "dark" && current === LIGHT_CANVAS_BG) return DARK_CANVAS_BG;
  if (nextTheme === "light" && current === DARK_CANVAS_BG) return LIGHT_CANVAS_BG;
  return current;
}

// True when `stored` is one of the theme-default sentinels (either side).
// Used by the PropertiesPanel swatch grid to mark "default" as active
// regardless of which theme created the element.
export function isDefaultStroke(stored: string): boolean {
  return stored === DEFAULT_STROKE_LIGHT || stored === DEFAULT_STROKE_DARK;
}

export function isDefaultFont(stored: string): boolean {
  return stored === DEFAULT_FONT_LIGHT || stored === DEFAULT_FONT_DARK;
}
