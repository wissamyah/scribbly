export type ElementType =
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "freedraw"
  | "image"
  | "frame";

export type FillStyle = "hachure" | "cross-hatch" | "solid" | "none";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export type ElementPoint = readonly [number, number];

export type ArrowheadStyle =
  | "arrow"
  | "triangle"
  | "diamond"
  | "dot"
  | "bar"
  | "none";

export type StrokeStyle = "solid" | "dashed" | "dotted";

// `focus` is a normalized offset from the bound shape's center expressed in
// the shape's local (un-rotated) frame. (0,0) is the center; (±1, ±1) sit on
// the bbox edges. This lets an arrow endpoint be anchored anywhere around or
// inside the shape and follow it through translate/resize/rotate.
export type Binding = {
  elementId: string;
  focus: ElementPoint | null;
};

export type BaseElementFields = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  seed: number;
  version: number;
  isDeleted: boolean;
  isLocked: boolean;
  updatedAt: number;
  zIndex: number;
  groupId: string | null;
  // Foreign key to a FrameElement.id when this element is enrolled in a
  // frame. Cleared when the element is dragged out of the frame's bounds.
  frameId: string | null;
};

export type RectangleElement = BaseElementFields & {
  type: "rectangle";
  cornerRadius: number;
};
export type EllipseElement = BaseElementFields & { type: "ellipse" };
export type LineElement = BaseElementFields & {
  type: "line";
  points: ElementPoint[];
};
export type ArrowElement = BaseElementFields & {
  type: "arrow";
  points: ElementPoint[];
  bendPoint: ElementPoint | null;
  startBinding: Binding | null;
  endBinding: Binding | null;
  startArrowhead: ArrowheadStyle;
  endArrowhead: ArrowheadStyle;
};
export type FreeDrawElement = BaseElementFields & {
  type: "freedraw";
  points: ElementPoint[];
};
export type TextElement = BaseElementFields & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  textAlign: TextAlign;
  // Only honored when containerId is set — controls vertical placement of
  // the wrapped text inside the container's box.
  verticalAlign: VerticalAlign;
  // When set, the text element is positioned inside the bound shape and
  // rendered centered + word-wrapped to the container's width. Movement,
  // resize, and deletion of the container cascade to the bound text.
  containerId: string | null;
};
export type ImageElement = BaseElementFields & {
  type: "image";
  // base64 data URL — stored in the `text` row column to avoid schema changes.
  dataUrl: string;
  cornerRadius: number;
};
export type FrameElement = BaseElementFields & {
  type: "frame";
  // null = use placeholder "Frame N" computed at render time.
  name: string | null;
};

export type ScribblyElement =
  | RectangleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreeDrawElement
  | TextElement
  | ImageElement
  | FrameElement;

export type LinearElement = LineElement | ArrowElement;
export type ShapeElement = RectangleElement | EllipseElement | ImageElement;

export type BaseStyleFields = Pick<
  BaseElementFields,
  | "strokeColor"
  | "backgroundColor"
  | "fillStyle"
  | "strokeWidth"
  | "strokeStyle"
  | "roughness"
  | "opacity"
>;
