import type {
  ArrowheadStyle,
  FillStyle,
  StrokeStyle,
  TextAlign,
  VerticalAlign,
} from "./types";

export const ARROWHEAD_STYLES: readonly ArrowheadStyle[] = [
  "arrow",
  "triangle",
  "diamond",
  "dot",
  "bar",
  "none",
];

export const STROKE_STYLES: readonly StrokeStyle[] = [
  "solid",
  "dashed",
  "dotted",
];

export const DEFAULT_STYLE = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure" as FillStyle,
  strokeWidth: 2,
  strokeStyle: "solid" as StrokeStyle,
  roughness: 1,
  opacity: 1,
};

export const DEFAULT_FONT = {
  fontSize: 20,
  fontFamily: "Virgil, 'Comic Sans MS', cursive",
  fontColor: "#1e1e1e",
  textAlign: "left" as TextAlign,
  verticalAlign: "middle" as VerticalAlign,
};
