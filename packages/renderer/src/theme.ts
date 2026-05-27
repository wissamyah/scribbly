import { DEFAULT_FONT, DEFAULT_STYLE } from "./constants";

export type Theme = "light" | "dark";

// The "default" sentinels used by the element factories. These are the
// values stored on elements whose stroke/text color was never customized
// by the user — they identify a theme-neutral default rather than a
// concrete user choice.
export const DEFAULT_STROKE_LIGHT = DEFAULT_STYLE.strokeColor; // "#1e1e1e"
export const DEFAULT_FONT_LIGHT = DEFAULT_FONT.fontColor; // "#1e1e1e"

// Dark-mode equivalents. Mapped at render/preview time only — stored
// element values are not mutated when the user switches themes.
export const DEFAULT_STROKE_DARK = "#e3e3e3";
export const DEFAULT_FONT_DARK = "#e3e3e3";

// Map a stored stroke color into its theme-resolved display color. Only
// the light-mode default sentinel is remapped; explicit user colors pass
// through unchanged.
export function resolveStrokeColor(stored: string, theme: Theme): string {
  if (theme === "dark" && stored === DEFAULT_STROKE_LIGHT) {
    return DEFAULT_STROKE_DARK;
  }
  if (theme === "light" && stored === DEFAULT_STROKE_DARK) {
    return DEFAULT_STROKE_LIGHT;
  }
  return stored;
}

export function resolveFontColor(stored: string, theme: Theme): string {
  if (theme === "dark" && stored === DEFAULT_FONT_LIGHT) {
    return DEFAULT_FONT_DARK;
  }
  if (theme === "light" && stored === DEFAULT_FONT_DARK) {
    return DEFAULT_FONT_LIGHT;
  }
  return stored;
}
