import type { ScribblyElement } from "../canvas/elements";
import type { BBox } from "../canvas/hitTest";
import type { ViewTransform } from "../canvas/geometry";
import type { PointerInfo } from "../hooks/usePointer";

export type ToolName =
  | "selection"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser"
  | "laser"
  | "frame";

export type TextDraft = {
  worldX: number;
  worldY: number;
  // When set, the text is bound to (and rendered centered inside) this shape.
  containerId?: string;
  // When set, the editor opens with this text element's current contents and
  // updates it on commit (instead of creating a new element).
  editingId?: string;
};

export type ElementPatcher = (el: ScribblyElement) => ScribblyElement;

export type ToolContext = {
  roomId: string;
  setDraft: (el: ScribblyElement | null) => void;
  getDraft: () => ScribblyElement | null;
  addElement: (el: ScribblyElement) => void;
  setActiveTool: (tool: ToolName) => void;
  setTextDraft: (draft: TextDraft | null) => void;

  getView: () => ViewTransform;
  getElements: () => readonly ScribblyElement[];
  updateElements: (ids: readonly string[], patcher: ElementPatcher) => void;
  getSelectedIds: () => readonly string[];
  setSelectedIds: (ids: readonly string[]) => void;
  setSelectionBox: (box: BBox | null) => void;
  reconcileBindings: (ids: readonly string[]) => void;
  panBy: (dx: number, dy: number) => void;
};

export type DrawingTool = {
  name: ToolName;
  onPointerDown(info: PointerInfo, ctx: ToolContext): void;
  onPointerMove(info: PointerInfo, ctx: ToolContext): void;
  onPointerUp(info: PointerInfo, ctx: ToolContext): void;
  onCancel(ctx: ToolContext): void;
};
