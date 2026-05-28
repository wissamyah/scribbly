// App-side factories. Pure types, constants, and element math now live in
// @scribbly/renderer (shared with the marketplace registry). This file
// re-exports them so existing app imports `from "./elements"` keep working,
// and adds the factories that depend on InstantDB's `id()` for entity ids.

import { id } from "@instantdb/react";
import {
  DEFAULT_FONT,
  DEFAULT_STYLE,
  type ArrowElement,
  type ArrowheadStyle,
  type BaseElementFields,
  type Binding,
  type ElementPoint,
  type EllipseElement,
  type FillStyle,
  type FrameElement,
  type FreeDrawElement,
  type ImageElement,
  type LineElement,
  type RectangleElement,
  type ScribblyElement,
  type StrokeStyle,
  type TextAlign,
  type TextElement,
  type VerticalAlign,
} from "@scribbly/renderer";
import { pointsBounds } from "@scribbly/renderer";

// ---------- Re-exports for the rest of the app ----------

export type {
  ArrowElement,
  ArrowheadStyle,
  BaseElementFields,
  BaseStyleFields,
  Binding,
  ElementType,
  EllipseElement,
  FillStyle,
  FrameElement,
  FreeDrawElement,
  ImageElement,
  LineElement,
  LinearElement,
  RectangleElement,
  ScribblyElement,
  ShapeElement,
  StrokeStyle,
  TextAlign,
  TextElement,
  VerticalAlign,
} from "@scribbly/renderer";

// App code historically named the tuple type `Point`. Surface the package's
// ElementPoint under that name so existing call sites keep compiling.
export type { ElementPoint as Point } from "@scribbly/renderer";

export {
  ARROWHEAD_STYLES,
  DEFAULT_FONT,
  DEFAULT_STYLE,
  STROKE_STYLES,
  arrowBounds,
  arrowCurveSamples,
  arrowMidpoint,
  arrowPolyline,
  arrowQuadraticControl,
  elementsBounds,
  findBoundTextElement,
  isLinear,
  isShape,
  isTextContainer,
  pickBaseStyle,
  pointsBounds,
  translateElement,
} from "@scribbly/renderer";

// ---------- App-only factories ----------

// Default world-unit radius applied when the user toggles a rectangle to
// "rounded". The renderer clamps this to min(w, h) / 2 at draw time.
export const DEFAULT_CORNER_RADIUS = 16;

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

type BaseFactoryInput = {
  roomId: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  opacity?: number;
  seed?: number;
};

function baseFields(
  input: BaseFactoryInput,
): Omit<BaseElementFields, "x" | "y" | "width" | "height"> {
  const now = Date.now();
  return {
    id: id(),
    roomId: input.roomId,
    angle: 0,
    strokeColor: input.strokeColor ?? DEFAULT_STYLE.strokeColor,
    backgroundColor: input.backgroundColor ?? DEFAULT_STYLE.backgroundColor,
    fillStyle: input.fillStyle ?? DEFAULT_STYLE.fillStyle,
    strokeWidth: input.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
    strokeStyle: input.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
    roughness: input.roughness ?? DEFAULT_STYLE.roughness,
    opacity: input.opacity ?? DEFAULT_STYLE.opacity,
    seed: input.seed ?? newSeed(),
    version: now,
    isDeleted: false,
    isLocked: false,
    updatedAt: now,
    zIndex: 0,
    groupId: null,
    frameId: null,
  };
}

export function createRectangle(
  input: BaseFactoryInput & {
    x: number;
    y: number;
    width: number;
    height: number;
    cornerRadius?: number;
  },
): RectangleElement {
  return {
    type: "rectangle",
    ...baseFields(input),
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    cornerRadius: input.cornerRadius ?? 0,
  };
}

export function createEllipse(
  input: BaseFactoryInput & {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): EllipseElement {
  return {
    type: "ellipse",
    ...baseFields(input),
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
  };
}

export function createLine(
  input: BaseFactoryInput & { points: ElementPoint[]; closed?: boolean },
): LineElement {
  const bounds = pointsBounds(input.points);
  return {
    type: "line",
    ...baseFields(input),
    ...bounds,
    points: input.points,
    closed: input.closed ?? false,
  };
}

export function createArrow(
  input: BaseFactoryInput & {
    points: ElementPoint[];
    bendPoint?: ElementPoint | null;
    startBinding?: Binding | null;
    endBinding?: Binding | null;
    startArrowhead?: ArrowheadStyle;
    endArrowhead?: ArrowheadStyle;
  },
): ArrowElement {
  const bounds = pointsBounds(input.points);
  return {
    type: "arrow",
    ...baseFields(input),
    ...bounds,
    points: input.points,
    bendPoint: input.bendPoint ?? null,
    startBinding: input.startBinding ?? null,
    endBinding: input.endBinding ?? null,
    startArrowhead: input.startArrowhead ?? "none",
    endArrowhead: input.endArrowhead ?? "arrow",
  };
}

export function createFreeDraw(
  input: BaseFactoryInput & { points: ElementPoint[] },
): FreeDrawElement {
  const bounds = pointsBounds(input.points);
  return {
    type: "freedraw",
    ...baseFields(input),
    ...bounds,
    points: input.points,
  };
}

export function createFrame(
  input: BaseFactoryInput & {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string | null;
  },
): FrameElement {
  return {
    type: "frame",
    ...baseFields(input),
    // Frames inherit a neutral visual identity; user style picker still
    // works but defaults to a grey, non-rough look.
    strokeColor: input.strokeColor ?? "#bbbbbb",
    backgroundColor: input.backgroundColor ?? "transparent",
    fillStyle: input.fillStyle ?? "none",
    roughness: input.roughness ?? 0,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    name: input.name ?? null,
  };
}

export function createImage(
  input: BaseFactoryInput & {
    x: number;
    y: number;
    width: number;
    height: number;
    dataUrl: string;
    cornerRadius?: number;
  },
): ImageElement {
  return {
    type: "image",
    ...baseFields(input),
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    dataUrl: input.dataUrl,
    cornerRadius: input.cornerRadius ?? 0,
  };
}

export function createText(
  input: BaseFactoryInput & {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fontSize?: number;
    fontFamily?: string;
    fontColor?: string;
    textAlign?: TextAlign;
    verticalAlign?: VerticalAlign;
    containerId?: string | null;
  },
): TextElement {
  return {
    type: "text",
    ...baseFields(input),
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    text: input.text,
    fontSize: input.fontSize ?? DEFAULT_FONT.fontSize,
    fontFamily: input.fontFamily ?? DEFAULT_FONT.fontFamily,
    fontColor: input.fontColor ?? DEFAULT_FONT.fontColor,
    textAlign: input.textAlign ?? DEFAULT_FONT.textAlign,
    verticalAlign: input.verticalAlign ?? DEFAULT_FONT.verticalAlign,
    containerId: input.containerId ?? null,
  };
}

export function duplicateElement(
  el: ScribblyElement,
  offsetX: number,
  offsetY: number,
): ScribblyElement {
  const now = Date.now();
  const base = {
    id: id(),
    seed: newSeed(),
    x: el.x + offsetX,
    y: el.y + offsetY,
    version: now,
    updatedAt: now,
  };
  if (el.type === "arrow") {
    return {
      ...el,
      ...base,
      points: el.points.map(
        ([px, py]) =>
          [px + offsetX, py + offsetY] as ElementPoint,
      ),
      bendPoint: el.bendPoint
        ? ([el.bendPoint[0] + offsetX, el.bendPoint[1] + offsetY] as ElementPoint)
        : null,
      startBinding: null,
      endBinding: null,
    };
  }
  if (el.type === "line" || el.type === "freedraw") {
    return {
      ...el,
      ...base,
      points: el.points.map(
        ([px, py]) =>
          [px + offsetX, py + offsetY] as ElementPoint,
      ),
    };
  }
  return { ...el, ...base };
}
