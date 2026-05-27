import { id } from "@instantdb/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newUserId, randomColor, randomName } from "../collab/identity";
import {
  clampScale,
  fitToViewport,
  type ViewTransform,
  zoomAt as zoomAtView,
} from "../canvas/geometry";
import {
  arrowBounds,
  DEFAULT_FONT,
  DEFAULT_STYLE,
  translateElement,
  type ArrowheadStyle,
  type ScribblyElement,
  type FillStyle,
  type StrokeStyle,
  type TextAlign,
  type VerticalAlign,
} from "../canvas/elements";
import type { BBox } from "../canvas/hitTest";
import { recomputeArrowPoints } from "../canvas/bindings";
import { dbSoftDeleteElements, dbWriteElements } from "../db/mutations";
import type { ElementPatcher, TextDraft, ToolName } from "../tools/types";
import {
  canvasBackgroundForTheme,
  DARK_CANVAS_BG,
  LIGHT_CANVAS_BG,
  type Theme,
} from "../utils/theme";

export type CurrentStyle = {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  cornerRadius: number;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  startArrowhead: ArrowheadStyle;
  endArrowhead: ArrowheadStyle;
};

const HISTORY_LIMIT = 50;

export type AlignMode =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom";

function sortByZ(elements: readonly ScribblyElement[]): ScribblyElement[] {
  return [...elements].sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
    return a.id < b.id ? -1 : 1;
  });
}

function maxZ(elements: readonly ScribblyElement[]): number {
  let max = 0;
  for (const el of elements) if (el.zIndex > max) max = el.zIndex;
  return max;
}

type AlignmentUnit = {
  elementIds: string[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

// An alignment unit is either a single ungrouped element or a whole group
// (all selected elements sharing a groupId), so groups translate as one rigid
// body during align/distribute instead of every member collapsing onto the
// same line independently.
function buildAlignmentUnits(
  targets: readonly ScribblyElement[],
): AlignmentUnit[] {
  const groups = new Map<string, AlignmentUnit>();
  const units: AlignmentUnit[] = [];
  for (const el of targets) {
    if (el.groupId) {
      const existing = groups.get(el.groupId);
      if (existing) {
        existing.elementIds.push(el.id);
        if (el.x < existing.minX) existing.minX = el.x;
        if (el.y < existing.minY) existing.minY = el.y;
        if (el.x + el.width > existing.maxX) existing.maxX = el.x + el.width;
        if (el.y + el.height > existing.maxY) existing.maxY = el.y + el.height;
      } else {
        const unit: AlignmentUnit = {
          elementIds: [el.id],
          minX: el.x,
          minY: el.y,
          maxX: el.x + el.width,
          maxY: el.y + el.height,
        };
        groups.set(el.groupId, unit);
        units.push(unit);
      }
    } else {
      units.push({
        elementIds: [el.id],
        minX: el.x,
        minY: el.y,
        maxX: el.x + el.width,
        maxY: el.y + el.height,
      });
    }
  }
  return units;
}

export type SnapGuide = {
  axis: "x" | "y";
  // Coord along the guide's axis (e.g. axis "x" → guide is the vertical
  // line at world x = `line`).
  line: number;
  // Two perpendicular-axis world coords used as marker anchors and as
  // the extent endpoints of the guide line.
  a: number;
  b: number;
};

export type CanvasBackground = string;

export type EraserTrailPoint = { x: number; y: number; t: number };

const ERASER_TRAIL_LIFETIME_MS = 60;
const ERASER_TRAIL_MAX_POINTS = 10;

export type LaserTrailPoint = { x: number; y: number; t: number };

export const LASER_TRAIL_LIFETIME_MS = 750;
const LASER_TRAIL_MAX_POINTS = 200;

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = [
  LIGHT_CANVAS_BG,
  "#ffffff",
  "#fef3c7",
  DARK_CANVAS_BG,
];

type AppState = {
  view: ViewTransform;
  setView: (next: ViewTransform) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAtScreen: (screenX: number, screenY: number, factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: (viewport: { width: number; height: number }) => void;
  resetView: () => void;

  zenMode: boolean;
  setZenMode: (v: boolean) => void;
  viewMode: boolean;
  setViewMode: (v: boolean) => void;
  snapToObjects: boolean;
  setSnapToObjects: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  canvasBackground: CanvasBackground;
  setCanvasBackground: (c: CanvasBackground) => void;

  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  selectAll: () => void;
  clearCanvas: () => void;

  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;

  elements: ScribblyElement[];
  setElements: (elements: ScribblyElement[]) => void;
  addElement: (el: ScribblyElement) => void;
  addElements: (els: readonly ScribblyElement[]) => void;
  updateElements: (ids: readonly string[], patcher: ElementPatcher) => void;
  deleteElements: (ids: readonly string[]) => void;

  dirtyIds: Set<string>;
  clearDirty: () => void;

  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;
  bringSelectionForward: () => void;
  sendSelectionBackward: () => void;

  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (axis: "h" | "v") => void;

  groupSelection: () => void;
  ungroupSelection: () => void;

  toggleLockSelection: () => void;

  draftElement: ScribblyElement | null;
  setDraft: (el: ScribblyElement | null) => void;

  textDraft: TextDraft | null;
  setTextDraft: (draft: TextDraft | null) => void;

  selectedIds: string[];
  setSelectedIds: (ids: readonly string[]) => void;

  selectionBox: BBox | null;
  setSelectionBox: (box: BBox | null) => void;

  hoveredShapeId: string | null;
  setHoveredShapeId: (id: string | null) => void;

  connectionTargetId: string | null;
  setConnectionTargetId: (id: string | null) => void;

  highlightedFrameId: string | null;
  setHighlightedFrameId: (id: string | null) => void;

  // Frame id whose name label is currently being edited via the inline
  // editor. Renderer hides that frame's label so the input doesn't stack on
  // top of the rendered text.
  frameNameDraft: string | null;
  setFrameNameDraft: (id: string | null) => void;

  pendingEraseIds: ReadonlySet<string>;
  setPendingEraseIds: (ids: ReadonlySet<string>) => void;

  eraserTrail: readonly EraserTrailPoint[];
  pushEraserTrailPoint: (x: number, y: number) => void;
  clearEraserTrail: () => void;

  laserTrail: readonly LaserTrailPoint[];
  pushLaserTrailPoint: (x: number, y: number) => void;
  clearLaserTrail: () => void;
  pruneLaserTrail: () => void;

  snapGuides: readonly SnapGuide[];
  setSnapGuides: (guides: readonly SnapGuide[]) => void;

  reconcileBindings: (changedShapeIds: readonly string[]) => void;

  currentStyle: CurrentStyle;
  setStyle: (patch: Partial<CurrentStyle>) => void;

  userId: string;
  userName: string;
  userColor: string;
  setUserName: (name: string) => void;
  setUserColor: (color: string) => void;

  liveCollabOpen: boolean;
  setLiveCollabOpen: (open: boolean) => void;

  librarySidebarOpen: boolean;
  setLibrarySidebarOpen: (open: boolean) => void;

  // Deep-link install: App.tsx sets this when ?addLibrary=<url> matches an
  // allowlisted manifest entry. LibrarySidebar picks it up, switches to
  // the Browse tab, and forwards it to BrowseTab so the install dialog
  // opens pre-filled. `unknown` so this file stays free of UI-type deps.
  pendingMarketplaceEntry: unknown | null;
  setPendingMarketplaceEntry: (entry: unknown | null) => void;
  clearPendingMarketplaceEntry: () => void;

  // End-to-end encryption: `roomKey` is the AES-GCM key derived from the
  // URL hash. `roomEncrypted` reflects the room's `encrypted` flag — when
  // true with a null key, the user opened the room without the hash key
  // and cannot read or write.
  roomKey: CryptoKey | null;
  roomEncrypted: boolean;
  setRoomKey: (key: CryptoKey | null) => void;
  setRoomEncrypted: (encrypted: boolean) => void;

  past: ScribblyElement[][];
  future: ScribblyElement[][];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
};

const INITIAL_STYLE: CurrentStyle = {
  strokeColor: DEFAULT_STYLE.strokeColor,
  backgroundColor: DEFAULT_STYLE.backgroundColor,
  fillStyle: DEFAULT_STYLE.fillStyle,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  strokeStyle: DEFAULT_STYLE.strokeStyle,
  roughness: DEFAULT_STYLE.roughness,
  opacity: DEFAULT_STYLE.opacity,
  cornerRadius: 0,
  fontSize: DEFAULT_FONT.fontSize,
  fontFamily: DEFAULT_FONT.fontFamily,
  fontColor: DEFAULT_FONT.fontColor,
  textAlign: DEFAULT_FONT.textAlign,
  verticalAlign: DEFAULT_FONT.verticalAlign,
  startArrowhead: "none",
  endArrowhead: "arrow",
};

const INITIAL_VIEW: ViewTransform = { x: 0, y: 0, scale: 1 };

function bumpAll(
  elements: readonly ScribblyElement[],
): ScribblyElement[] {
  const now = Date.now();
  return elements.map((el) => ({ ...el, version: now, updatedAt: now }));
}

export const useAppState = create<AppState>()(
  persist(
    (set, get) => ({
  view: INITIAL_VIEW,
  setView: (next) => set({ view: { ...next, scale: clampScale(next.scale) } }),
  panBy: (dx, dy) =>
    set((state) => ({
      view: { ...state.view, x: state.view.x + dx, y: state.view.y + dy },
    })),
  zoomAtScreen: (screenX, screenY, factor) =>
    set((state) => ({ view: zoomAtView(state.view, screenX, screenY, factor) })),
  zoomIn: () =>
    set((state) => ({
      view: zoomAtView(
        state.view,
        window.innerWidth / 2,
        window.innerHeight / 2,
        1.2,
      ),
    })),
  zoomOut: () =>
    set((state) => ({
      view: zoomAtView(
        state.view,
        window.innerWidth / 2,
        window.innerHeight / 2,
        1 / 1.2,
      ),
    })),
  zoomToFit: (viewport) => {
    const state = get();
    const live = state.elements.filter((el) => !el.isDeleted);
    if (live.length === 0) {
      set({ view: INITIAL_VIEW });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of live) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    set({
      view: fitToViewport(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        viewport,
      ),
    });
  },
  resetView: () => set({ view: INITIAL_VIEW }),

  zenMode: false,
  setZenMode: (v) => set({ zenMode: v }),
  viewMode: false,
  setViewMode: (v) =>
    set((state) => ({
      viewMode: v,
      activeTool: v ? "selection" : state.activeTool,
    })),
  // Snap-to-objects and the visible grid are mutually exclusive — enabling
  // one disables the other.
  snapToObjects: false,
  setSnapToObjects: (v) =>
    set((state) => ({
      snapToObjects: v,
      showGrid: v ? false : state.showGrid,
    })),
  showGrid: true,
  setShowGrid: (v) =>
    set((state) => ({
      showGrid: v,
      snapToObjects: v ? false : state.snapToObjects,
    })),
  canvasBackground: LIGHT_CANVAS_BG,
  setCanvasBackground: (c) => set({ canvasBackground: c }),

  theme: "light",
  setTheme: (t) =>
    set((state) => ({
      theme: t,
      // Auto-swap the canvas background only if the user is still on the
      // *other* theme's auto-default. Any explicit choice is preserved.
      canvasBackground: canvasBackgroundForTheme(state.canvasBackground, t),
    })),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "light" ? "dark" : "light";
      return {
        theme: next,
        canvasBackground: canvasBackgroundForTheme(state.canvasBackground, next),
      };
    }),

  selectAll: () => {
    const state = get();
    const ids = state.elements.filter((el) => !el.isDeleted).map((el) => el.id);
    set({ selectedIds: ids });
  },
  clearCanvas: () => {
    const state = get();
    const live = state.elements.filter((el) => !el.isDeleted);
    if (live.length === 0) return;
    state.pushHistory();
    state.deleteElements(live.map((el) => el.id));
  },

  activeTool: "selection",
  setActiveTool: (tool) => set({ activeTool: tool }),

  elements: [],
  setElements: (next) =>
    set((state) => {
      if (state.dirtyIds.size === 0) {
        return { elements: sortByZ(next) };
      }
      // Preserve elements with unflushed local changes; otherwise take DB.
      const dirtyLocal = new Map<string, ScribblyElement>();
      for (const el of state.elements) {
        if (state.dirtyIds.has(el.id)) dirtyLocal.set(el.id, el);
      }
      const merged: ScribblyElement[] = [];
      const seen = new Set<string>();
      for (const el of next) {
        const local = dirtyLocal.get(el.id);
        merged.push(local ?? el);
        seen.add(el.id);
      }
      for (const [id, el] of dirtyLocal) {
        if (!seen.has(id)) merged.push(el);
      }
      return { elements: sortByZ(merged) };
    }),
  addElement: (el) =>
    set((state) => {
      const dirty = new Set(state.dirtyIds);
      dirty.add(el.id);
      const next = { ...el, zIndex: maxZ(state.elements) + 1 };
      return { elements: [...state.elements, next], dirtyIds: dirty };
    }),
  addElements: (els) =>
    set((state) => {
      if (els.length === 0) return {};
      const dirty = new Set(state.dirtyIds);
      let nextZ = maxZ(state.elements);
      const stamped = els.map((el) => {
        nextZ += 1;
        dirty.add(el.id);
        return { ...el, zIndex: nextZ };
      });
      return { elements: [...state.elements, ...stamped], dirtyIds: dirty };
    }),
  updateElements: (ids, patcher) =>
    set((state) => {
      const target = new Set(ids);
      const dirty = new Set(state.dirtyIds);
      let changed = false;
      const nextElements = state.elements.map((el) => {
        if (!target.has(el.id)) return el;
        const nextEl = patcher(el);
        if (nextEl !== el) {
          dirty.add(el.id);
          changed = true;
        }
        return nextEl;
      });
      if (!changed) return {};
      return { elements: nextElements, dirtyIds: dirty };
    }),
  deleteElements: (ids) => {
    if (ids.length === 0) return;
    const state = get();
    const target = new Set(ids);
    // Cascade-delete bound text when its container is removed.
    for (const el of state.elements) {
      if (
        el.type === "text" &&
        el.containerId &&
        target.has(el.containerId)
      ) {
        target.add(el.id);
      }
    }
    const toDelete = state.elements.filter((el) => target.has(el.id));
    if (toDelete.length > 0) dbSoftDeleteElements(toDelete);
    const remainingDirty = new Set<string>();
    for (const id of state.dirtyIds) {
      if (!target.has(id)) remainingDirty.add(id);
    }
    set({
      elements: state.elements.filter((el) => !target.has(el.id)),
      selectedIds: state.selectedIds.filter((id) => !target.has(id)),
      dirtyIds: remainingDirty,
    });
  },

  dirtyIds: new Set<string>(),
  clearDirty: () => set({ dirtyIds: new Set<string>() }),

  bringSelectionToFront: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const targetIds = new Set(state.selectedIds);
    const sorted = sortByZ(state.elements);
    const others = sorted.filter((el) => !targetIds.has(el.id));
    const targets = sorted.filter((el) => targetIds.has(el.id));
    if (targets.length === 0) return;
    state.pushHistory();
    const now = Date.now();
    const dirty = new Set(state.dirtyIds);
    let z = 0;
    const next = [...others, ...targets].map((el) => {
      z += 1;
      if (el.zIndex === z) return el;
      dirty.add(el.id);
      return { ...el, zIndex: z, version: now, updatedAt: now };
    });
    set({ elements: sortByZ(next), dirtyIds: dirty });
  },

  sendSelectionToBack: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const targetIds = new Set(state.selectedIds);
    const sorted = sortByZ(state.elements);
    const others = sorted.filter((el) => !targetIds.has(el.id));
    const targets = sorted.filter((el) => targetIds.has(el.id));
    if (targets.length === 0) return;
    state.pushHistory();
    const now = Date.now();
    const dirty = new Set(state.dirtyIds);
    let z = 0;
    const next = [...targets, ...others].map((el) => {
      z += 1;
      if (el.zIndex === z) return el;
      dirty.add(el.id);
      return { ...el, zIndex: z, version: now, updatedAt: now };
    });
    set({ elements: sortByZ(next), dirtyIds: dirty });
  },

  bringSelectionForward: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const targetIds = new Set(state.selectedIds);
    const sorted = sortByZ(state.elements);
    // Walk from top to bottom; each selected element may swap with the
    // non-selected element immediately above it.
    const arr: ScribblyElement[] = [...sorted];
    let moved = false;
    for (let i = arr.length - 2; i >= 0; i--) {
      const cur = arr[i]!;
      const above = arr[i + 1]!;
      if (targetIds.has(cur.id) && !targetIds.has(above.id)) {
        arr[i] = above;
        arr[i + 1] = cur;
        moved = true;
      }
    }
    if (!moved) return;
    state.pushHistory();
    const now = Date.now();
    const dirty = new Set(state.dirtyIds);
    let z = 0;
    const next = arr.map((el) => {
      z += 1;
      if (el.zIndex === z) return el;
      dirty.add(el.id);
      return { ...el, zIndex: z, version: now, updatedAt: now };
    });
    set({ elements: sortByZ(next), dirtyIds: dirty });
  },

  sendSelectionBackward: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const targetIds = new Set(state.selectedIds);
    const sorted = sortByZ(state.elements);
    const arr: ScribblyElement[] = [...sorted];
    let moved = false;
    for (let i = 1; i < arr.length; i++) {
      const cur = arr[i]!;
      const below = arr[i - 1]!;
      if (targetIds.has(cur.id) && !targetIds.has(below.id)) {
        arr[i] = below;
        arr[i - 1] = cur;
        moved = true;
      }
    }
    if (!moved) return;
    state.pushHistory();
    const now = Date.now();
    const dirty = new Set(state.dirtyIds);
    let z = 0;
    const next = arr.map((el) => {
      z += 1;
      if (el.zIndex === z) return el;
      dirty.add(el.id);
      return { ...el, zIndex: z, version: now, updatedAt: now };
    });
    set({ elements: sortByZ(next), dirtyIds: dirty });
  },

  alignSelection: (mode) => {
    const state = get();
    if (state.selectedIds.length < 2) return;
    const targetIds = new Set(state.selectedIds);
    const targets = state.elements.filter((el) => targetIds.has(el.id));
    if (targets.length < 2) return;
    const units = buildAlignmentUnits(targets);
    if (units.length < 2) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const unit of units) {
      if (unit.minX < minX) minX = unit.minX;
      if (unit.minY < minY) minY = unit.minY;
      if (unit.maxX > maxX) maxX = unit.maxX;
      if (unit.maxY > maxY) maxY = unit.maxY;
    }
    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;
    const deltaByElement = new Map<string, { dx: number; dy: number }>();
    for (const unit of units) {
      let dx = 0;
      let dy = 0;
      switch (mode) {
        case "left":
          dx = minX - unit.minX;
          break;
        case "right":
          dx = maxX - unit.maxX;
          break;
        case "centerX":
          dx = bboxCenterX - (unit.minX + unit.maxX) / 2;
          break;
        case "top":
          dy = minY - unit.minY;
          break;
        case "bottom":
          dy = maxY - unit.maxY;
          break;
        case "centerY":
          dy = bboxCenterY - (unit.minY + unit.maxY) / 2;
          break;
      }
      if (dx === 0 && dy === 0) continue;
      for (const elId of unit.elementIds) {
        deltaByElement.set(elId, { dx, dy });
      }
    }
    if (deltaByElement.size === 0) return;
    state.pushHistory();
    const movedShapeIds: string[] = [];
    const ids = Array.from(deltaByElement.keys());
    state.updateElements(ids, (el) => {
      const d = deltaByElement.get(el.id);
      if (!d || (d.dx === 0 && d.dy === 0)) return el;
      movedShapeIds.push(el.id);
      return translateElement(el, d.dx, d.dy);
    });
    if (movedShapeIds.length > 0) state.reconcileBindings(movedShapeIds);
  },

  distributeSelection: (axis) => {
    const state = get();
    if (state.selectedIds.length < 3) return;
    const targetIds = new Set(state.selectedIds);
    const targets = state.elements.filter((el) => targetIds.has(el.id));
    if (targets.length < 3) return;
    const units = buildAlignmentUnits(targets);
    if (units.length < 3) return;
    const sorted = [...units].sort((a, b) => {
      const ac = axis === "h" ? (a.minX + a.maxX) / 2 : (a.minY + a.maxY) / 2;
      const bc = axis === "h" ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
      return ac - bc;
    });
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const firstCenter =
      axis === "h"
        ? (first.minX + first.maxX) / 2
        : (first.minY + first.maxY) / 2;
    const lastCenter =
      axis === "h"
        ? (last.minX + last.maxX) / 2
        : (last.minY + last.maxY) / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    if (!Number.isFinite(step)) return;
    const deltaByElement = new Map<string, { dx: number; dy: number }>();
    for (let i = 0; i < sorted.length; i++) {
      const unit = sorted[i]!;
      const curCenter =
        axis === "h"
          ? (unit.minX + unit.maxX) / 2
          : (unit.minY + unit.maxY) / 2;
      const delta = firstCenter + step * i - curCenter;
      if (delta === 0) continue;
      const dx = axis === "h" ? delta : 0;
      const dy = axis === "h" ? 0 : delta;
      for (const elId of unit.elementIds) {
        deltaByElement.set(elId, { dx, dy });
      }
    }
    if (deltaByElement.size === 0) return;
    state.pushHistory();
    const movedShapeIds: string[] = [];
    const ids = Array.from(deltaByElement.keys());
    state.updateElements(ids, (el) => {
      const d = deltaByElement.get(el.id);
      if (!d || (d.dx === 0 && d.dy === 0)) return el;
      movedShapeIds.push(el.id);
      return translateElement(el, d.dx, d.dy);
    });
    if (movedShapeIds.length > 0) state.reconcileBindings(movedShapeIds);
  },

  draftElement: null,
  setDraft: (el) => set({ draftElement: el }),

  textDraft: null,
  setTextDraft: (draft) => set({ textDraft: draft }),

  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: [...ids] }),

  selectionBox: null,
  setSelectionBox: (box) => set({ selectionBox: box }),

  hoveredShapeId: null,
  setHoveredShapeId: (id) =>
    set((state) =>
      state.hoveredShapeId === id ? {} : { hoveredShapeId: id },
    ),

  connectionTargetId: null,
  setConnectionTargetId: (id) =>
    set((state) =>
      state.connectionTargetId === id ? {} : { connectionTargetId: id },
    ),

  highlightedFrameId: null,
  setHighlightedFrameId: (id) =>
    set((state) =>
      state.highlightedFrameId === id ? {} : { highlightedFrameId: id },
    ),

  frameNameDraft: null,
  setFrameNameDraft: (id) =>
    set((state) =>
      state.frameNameDraft === id ? {} : { frameNameDraft: id },
    ),

  pendingEraseIds: new Set<string>(),
  setPendingEraseIds: (ids) => set({ pendingEraseIds: ids }),

  eraserTrail: [],
  pushEraserTrailPoint: (x, y) =>
    set((state) => {
      const now = Date.now();
      const cutoff = now - ERASER_TRAIL_LIFETIME_MS;
      const kept = state.eraserTrail.filter((p) => p.t >= cutoff);
      const next = [...kept, { x, y, t: now }];
      if (next.length > ERASER_TRAIL_MAX_POINTS) {
        next.splice(0, next.length - ERASER_TRAIL_MAX_POINTS);
      }
      return { eraserTrail: next };
    }),
  clearEraserTrail: () => set({ eraserTrail: [] }),

  laserTrail: [],
  pushLaserTrailPoint: (x, y) =>
    set((state) => {
      const now = Date.now();
      const cutoff = now - LASER_TRAIL_LIFETIME_MS;
      const kept = state.laserTrail.filter((p) => p.t >= cutoff);
      const next = [...kept, { x, y, t: now }];
      if (next.length > LASER_TRAIL_MAX_POINTS) {
        next.splice(0, next.length - LASER_TRAIL_MAX_POINTS);
      }
      return { laserTrail: next };
    }),
  clearLaserTrail: () => set({ laserTrail: [] }),
  pruneLaserTrail: () =>
    set((state) => {
      if (state.laserTrail.length === 0) return {};
      const cutoff = Date.now() - LASER_TRAIL_LIFETIME_MS;
      const kept = state.laserTrail.filter((p) => p.t >= cutoff);
      if (kept.length === state.laserTrail.length) return {};
      return { laserTrail: kept };
    }),

  snapGuides: [],
  setSnapGuides: (guides) => set({ snapGuides: guides }),

  reconcileBindings: (changedShapeIds) =>
    set((state) => {
      if (changedShapeIds.length === 0) return {};
      const changed = new Set(changedShapeIds);
      const elementsById = new Map(state.elements.map((el) => [el.id, el]));
      const dirty = new Set(state.dirtyIds);
      let mutated = false;
      const nextElements = state.elements.map((el) => {
        if (el.type !== "arrow") return el;
        const startId = el.startBinding?.elementId;
        const endId = el.endBinding?.elementId;
        const touched =
          (startId && changed.has(startId)) ||
          (endId && changed.has(endId));
        if (!touched) return el;
        const { points, changed: didChange } = recomputeArrowPoints(
          el,
          elementsById,
        );
        if (!didChange) return el;
        const bounds = arrowBounds({ ...el, points });
        mutated = true;
        dirty.add(el.id);
        return { ...el, points, ...bounds };
      });
      if (!mutated) return {};
      return { elements: nextElements, dirtyIds: dirty };
    }),

  groupSelection: () => {
    const state = get();
    if (state.selectedIds.length < 2) return;
    const groupId = id();
    state.pushHistory();
    state.updateElements(state.selectedIds, (el) =>
      el.groupId === groupId ? el : { ...el, groupId },
    );
  },

  ungroupSelection: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const targetGroupIds = new Set<string>();
    const selectedSet = new Set(state.selectedIds);
    for (const el of state.elements) {
      if (!selectedSet.has(el.id)) continue;
      if (el.groupId) targetGroupIds.add(el.groupId);
    }
    if (targetGroupIds.size === 0) return;
    const ids: string[] = [];
    for (const el of state.elements) {
      if (el.groupId && targetGroupIds.has(el.groupId)) ids.push(el.id);
    }
    if (ids.length === 0) return;
    state.pushHistory();
    state.updateElements(ids, (el) =>
      el.groupId === null ? el : { ...el, groupId: null },
    );
  },

  toggleLockSelection: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    const selectedSet = new Set(state.selectedIds);
    const targets = state.elements.filter((el) => selectedSet.has(el.id));
    if (targets.length === 0) return;
    // Mixed → lock everything. All-locked → unlock everything.
    // All-unlocked → lock everything.
    const allLocked = targets.every((el) => el.isLocked);
    const nextLocked = !allLocked;
    state.pushHistory();
    state.updateElements(state.selectedIds, (el) =>
      el.isLocked === nextLocked ? el : { ...el, isLocked: nextLocked },
    );
  },

  currentStyle: INITIAL_STYLE,
  setStyle: (patch) =>
    set((state) => ({ currentStyle: { ...state.currentStyle, ...patch } })),

  userId: newUserId(),
  userName: randomName(),
  userColor: randomColor(),
  setUserName: (name) => set({ userName: name }),
  setUserColor: (color) => set({ userColor: color }),

  liveCollabOpen: false,
  setLiveCollabOpen: (open) => set({ liveCollabOpen: open }),

  librarySidebarOpen: false,
  setLibrarySidebarOpen: (open) => set({ librarySidebarOpen: open }),

  pendingMarketplaceEntry: null,
  setPendingMarketplaceEntry: (entry) =>
    set({ pendingMarketplaceEntry: entry }),
  clearPendingMarketplaceEntry: () => set({ pendingMarketplaceEntry: null }),

  roomKey: null,
  roomEncrypted: false,
  setRoomKey: (key) => set({ roomKey: key }),
  setRoomEncrypted: (encrypted) => set({ roomEncrypted: encrypted }),

  past: [],
  future: [],
  pushHistory: () =>
    set((state) => {
      const last = state.past[state.past.length - 1];
      if (last === state.elements) return {};
      const past = [...state.past, state.elements];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, future: [] };
    }),
  undo: () => {
    const state = get();
    if (state.past.length === 0) return;
    const previous = state.past[state.past.length - 1]!;
    const bumped = bumpAll(previous);
    const targetIds = new Set(bumped.map((el) => el.id));
    const removed = state.elements.filter((el) => !targetIds.has(el.id));
    if (bumped.length > 0) dbWriteElements(bumped);
    if (removed.length > 0) dbSoftDeleteElements(removed);
    set({
      past: state.past.slice(0, -1),
      future: [state.elements, ...state.future],
      elements: bumped,
      selectedIds: state.selectedIds.filter((id) => targetIds.has(id)),
    });
  },
  redo: () => {
    const state = get();
    if (state.future.length === 0) return;
    const next = state.future[0]!;
    const bumped = bumpAll(next);
    const targetIds = new Set(bumped.map((el) => el.id));
    const removed = state.elements.filter((el) => !targetIds.has(el.id));
    if (bumped.length > 0) dbWriteElements(bumped);
    if (removed.length > 0) dbSoftDeleteElements(removed);
    set({
      past: [...state.past, state.elements],
      future: state.future.slice(1),
      elements: bumped,
      selectedIds: state.selectedIds.filter((id) => targetIds.has(id)),
    });
  },
    }),
    {
      name: "scribbly:ui",
      version: 3,
      migrate: (persisted, _version) => {
        const p = persisted as { currentStyle?: Partial<CurrentStyle> } | null;
        if (p?.currentStyle && p.currentStyle.fontColor === undefined) {
          p.currentStyle = {
            ...p.currentStyle,
            fontColor: DEFAULT_FONT.fontColor,
          };
        }
        if (p?.currentStyle && p.currentStyle.cornerRadius === undefined) {
          p.currentStyle = {
            ...p.currentStyle,
            cornerRadius: 0,
          };
        }
        if (p?.currentStyle && p.currentStyle.verticalAlign === undefined) {
          p.currentStyle = {
            ...p.currentStyle,
            verticalAlign: DEFAULT_FONT.verticalAlign,
          };
        }
        return p;
      },
      // Only persist user-facing UI toggles. Elements come from the DB,
      // selection/history/view-transform are ephemeral.
      partialize: (state) => ({
        zenMode: state.zenMode,
        viewMode: state.viewMode,
        snapToObjects: state.snapToObjects,
        showGrid: state.showGrid,
        canvasBackground: state.canvasBackground,
        currentStyle: state.currentStyle,
        userId: state.userId,
        userName: state.userName,
        userColor: state.userColor,
        theme: state.theme,
      }),
    },
  ),
);
