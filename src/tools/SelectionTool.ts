import { findBindingAt } from "../canvas/bindings";
import {
  arrowBounds,
  arrowPolyline,
  findBoundTextElement,
  isShape,
  translateElement,
  type ArrowElement,
  type ScribblyElement,
} from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { worldToScreen } from "../canvas/geometry";
import {
  type BBox,
  type HandleName,
  BEND_HIT_RADIUS,
  ENDPOINT_HIT_RADIUS,
  elementsInBox,
  pickElement,
  pickHandle,
  rotatePoint,
  selectionBBox,
} from "../canvas/hitTest";
import { useAppState, type SnapGuide } from "../store/appState";
import type { DrawingTool, ElementPatcher } from "./types";

const HIT_SLOP_SCREEN = 6;
const DRAG_THRESHOLD_SCREEN = 3;
const SNAP_THRESHOLD_SCREEN = 6;

// Mirror the values in `renderer.ts:drawLockBadge` so click hit-testing
// matches the rendered badge. Kept here to avoid pulling rendering details
// into the tool layer.
const LOCK_BADGE_SIZE = 16;
const LOCK_BADGE_PAD = 4;

function lockBadgeScreenRect(
  bbox: BBox,
  angle: number,
  view: { x: number; y: number; scale: number },
): { x: number; y: number; w: number; h: number } {
  const corner = { x: bbox.x + bbox.width, y: bbox.y };
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const rotated = angle
    ? (() => {
        const dx = corner.x - cx;
        const dy = corner.y - cy;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
      })()
    : corner;
  const s = worldToScreen(view, rotated.x, rotated.y);
  return {
    x: s.x + LOCK_BADGE_PAD,
    y: s.y - LOCK_BADGE_PAD - LOCK_BADGE_SIZE,
    w: LOCK_BADGE_SIZE,
    h: LOCK_BADGE_SIZE,
  };
}

type AxisMatch = {
  delta: number;
  abs: number;
  // World coord of the snap line on the snap axis.
  line: number;
  // Perpendicular-axis world coord of the dragged anchor (post-snap).
  draggedPerp: number;
  // Perpendicular-axis world coord of the static element anchor.
  staticPerp: number;
};

function snapMoveDelta(
  initial: Map<string, ScribblyElement>,
  dx: number,
  dy: number,
  others: readonly ScribblyElement[],
  scale: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const threshold = SNAP_THRESHOLD_SCREEN / scale;
  // Aggregate bbox of the dragged set in its original position.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of initial.values()) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  }
  if (!Number.isFinite(minX)) return { dx, dy, guides: [] };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dragMidYAtRest = cy;
  const dragMidXAtRest = cx;

  // Dragged anchors shifted by the candidate delta (left/center/right on x,
  // top/middle/bottom on y).
  const xCandidates = [minX + dx, cx + dx, maxX + dx];
  const yCandidates = [minY + dy, cy + dy, maxY + dy];

  let bestX: AxisMatch | null = null;
  let bestY: AxisMatch | null = null;

  for (const el of others) {
    const elLeft = el.x;
    const elCx = el.x + el.width / 2;
    const elRight = el.x + el.width;
    const elTop = el.y;
    const elCy = el.y + el.height / 2;
    const elBottom = el.y + el.height;
    const staticMidY = elCy;
    const staticMidX = elCx;

    for (const line of [elLeft, elCx, elRight]) {
      for (const cand of xCandidates) {
        const offset = line - cand;
        const abs = Math.abs(offset);
        if (abs <= threshold && (!bestX || abs < bestX.abs)) {
          bestX = {
            delta: offset,
            abs,
            line,
            draggedPerp: dragMidYAtRest + dy,
            staticPerp: staticMidY,
          };
        }
      }
    }
    for (const line of [elTop, elCy, elBottom]) {
      for (const cand of yCandidates) {
        const offset = line - cand;
        const abs = Math.abs(offset);
        if (abs <= threshold && (!bestY || abs < bestY.abs)) {
          bestY = {
            delta: offset,
            abs,
            line,
            draggedPerp: dragMidXAtRest + dx,
            staticPerp: staticMidX,
          };
        }
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (bestX) {
    // Once the X is snapped, the dragged Y is unchanged (or further snapped
    // by bestY). The marker perpendicular coords stay at the dragged
    // selection's vertical midpoint and the static element's vertical
    // midpoint — they're what got "aligned" visually.
    guides.push({
      axis: "x",
      line: bestX.line,
      a: bestX.draggedPerp,
      b: bestX.staticPerp,
    });
  }
  if (bestY) {
    guides.push({
      axis: "y",
      line: bestY.line,
      a: bestY.draggedPerp,
      b: bestY.staticPerp,
    });
  }

  return {
    dx: bestX ? dx + bestX.delta : dx,
    dy: bestY ? dy + bestY.delta : dy,
    guides,
  };
}

function expandToGroup(
  elements: readonly ScribblyElement[],
  ids: Iterable<string>,
): string[] {
  const idSet = new Set(ids);
  const groupIds = new Set<string>();
  for (const el of elements) {
    if (idSet.has(el.id) && el.groupId) groupIds.add(el.groupId);
  }
  if (groupIds.size === 0) return [...idSet];
  for (const el of elements) {
    if (el.groupId && groupIds.has(el.groupId)) idSet.add(el.id);
  }
  return [...idSet];
}

// Frames and their children are mutually exclusive in the selection — if a
// frame is selected, its children are dropped; if any of its children are
// selected, the parent frame is dropped. Prevents the "selecting both the
// parent and a contained shape" oddity while keeping single-shape clicks
// inside a frame behaving normally.
function pruneFrameRelations(
  elements: readonly ScribblyElement[],
  ids: readonly string[],
): string[] {
  if (ids.length === 0) return [];
  const elementsById = new Map(elements.map((el) => [el.id, el] as const));
  const set = new Set(ids);
  const selectedFrameIds = new Set<string>();
  const childFrameParents = new Set<string>();
  for (const id of ids) {
    const el = elementsById.get(id);
    if (!el) continue;
    if (el.type === "frame") selectedFrameIds.add(el.id);
    if (el.frameId) childFrameParents.add(el.frameId);
  }
  // Drop children whose parent frame is selected.
  for (const id of [...set]) {
    const el = elementsById.get(id);
    if (!el) continue;
    if (el.frameId && selectedFrameIds.has(el.frameId)) {
      set.delete(id);
    }
  }
  // Drop frames whose children are also in the selection — child wins.
  for (const id of [...set]) {
    const el = elementsById.get(id);
    if (!el || el.type !== "frame") continue;
    if (childFrameParents.has(el.id)) {
      // Only drop the frame if at least one selected child isn't itself
      // being dropped above (which it wouldn't be, since the frame is the
      // one losing the conflict here).
      let hasChildLeft = false;
      for (const otherId of set) {
        const child = elementsById.get(otherId);
        if (child && child.frameId === el.id) {
          hasChildLeft = true;
          break;
        }
      }
      if (hasChildLeft) set.delete(id);
    }
  }
  return [...set];
}

function selectionAngle(
  elements: readonly ScribblyElement[],
  selectedIds: readonly string[],
): number {
  if (selectedIds.length !== 1) return 0;
  const id = selectedIds[0];
  if (!id) return 0;
  return elements.find((e) => e.id === id)?.angle ?? 0;
}

function anchorLocal(handle: HandleName, oldB: BBox): Point {
  const right = oldB.x + oldB.width;
  const bottom = oldB.y + oldB.height;
  const cx = oldB.x + oldB.width / 2;
  const cy = oldB.y + oldB.height / 2;
  switch (handle) {
    case "nw":
      return { x: right, y: bottom };
    case "n":
      return { x: cx, y: bottom };
    case "ne":
      return { x: oldB.x, y: bottom };
    case "e":
      return { x: oldB.x, y: cy };
    case "se":
      return { x: oldB.x, y: oldB.y };
    case "s":
      return { x: cx, y: oldB.y };
    case "sw":
      return { x: right, y: oldB.y };
    case "w":
      return { x: right, y: cy };
    case "rotate":
      return { x: cx, y: cy };
  }
}

type Mode =
  | { kind: "idle" }
  | {
      kind: "pending-move";
      startWorld: Point;
      startScreen: Point;
      initial: Map<string, ScribblyElement>;
    }
  | {
      kind: "move";
      startWorld: Point;
      initial: Map<string, ScribblyElement>;
    }
  | {
      kind: "resize";
      handle: HandleName;
      startBox: BBox;
      initial: Map<string, ScribblyElement>;
      angle: number;
    }
  | {
      kind: "rotate";
      center: Point;
      grabAngle: number;
      targetId: string;
      startElementAngle: number;
    }
  | {
      kind: "box";
      startWorld: Point;
      baseSelection: Set<string>;
    }
  | {
      kind: "bend";
      arrowId: string;
    }
  | {
      kind: "endpoint";
      arrowId: string;
      endpoint: "start" | "end";
    };

function mapPoint(p: Point, oldB: BBox, newB: BBox): Point {
  const sx = oldB.width === 0 ? 1 : newB.width / oldB.width;
  const sy = oldB.height === 0 ? 1 : newB.height / oldB.height;
  return {
    x: newB.x + (p.x - oldB.x) * sx,
    y: newB.y + (p.y - oldB.y) * sy,
  };
}

function resizeElement(
  el: ScribblyElement,
  oldB: BBox,
  newB: BBox,
): ScribblyElement {
  const tl = mapPoint({ x: el.x, y: el.y }, oldB, newB);
  const br = mapPoint(
    { x: el.x + el.width, y: el.y + el.height },
    oldB,
    newB,
  );
  const nextX = Math.min(tl.x, br.x);
  const nextY = Math.min(tl.y, br.y);
  const nextW = Math.abs(br.x - tl.x);
  const nextH = Math.abs(br.y - tl.y);
  if (el.type === "arrow") {
    const nextPoints = el.points.map(([px, py]) => {
      const m = mapPoint({ x: px, y: py }, oldB, newB);
      return [m.x, m.y] as [number, number];
    });
    const nextBend = el.bendPoint
      ? (() => {
          const m = mapPoint(
            { x: el.bendPoint[0], y: el.bendPoint[1] },
            oldB,
            newB,
          );
          return [m.x, m.y] as [number, number];
        })()
      : null;
    return {
      ...el,
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
      points: nextPoints,
      bendPoint: nextBend,
    };
  }
  if (el.type === "line" || el.type === "freedraw") {
    return {
      ...el,
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
      points: el.points.map(([px, py]) => {
        const m = mapPoint({ x: px, y: py }, oldB, newB);
        return [m.x, m.y] as [number, number];
      }),
    };
  }
  return { ...el, x: nextX, y: nextY, width: nextW, height: nextH };
}

function resizedBBox(handle: HandleName, oldB: BBox, pointer: Point): BBox {
  const right = oldB.x + oldB.width;
  const bottom = oldB.y + oldB.height;
  let nx = oldB.x;
  let ny = oldB.y;
  let nr = right;
  let nb = bottom;
  switch (handle) {
    case "nw":
      nx = pointer.x;
      ny = pointer.y;
      break;
    case "n":
      ny = pointer.y;
      break;
    case "ne":
      nr = pointer.x;
      ny = pointer.y;
      break;
    case "e":
      nr = pointer.x;
      break;
    case "se":
      nr = pointer.x;
      nb = pointer.y;
      break;
    case "s":
      nb = pointer.y;
      break;
    case "sw":
      nx = pointer.x;
      nb = pointer.y;
      break;
    case "w":
      nx = pointer.x;
      break;
    case "rotate":
      return oldB;
  }
  return {
    x: Math.min(nx, nr),
    y: Math.min(ny, nb),
    width: Math.abs(nr - nx),
    height: Math.abs(nb - ny),
  };
}

// Constrain resize to preserve oldB's aspect ratio, anchored at the corner
// opposite to the dragged handle. Side handles fall back to unconstrained.
function aspectConstrainedBBox(
  handle: HandleName,
  oldB: BBox,
  pointer: Point,
): BBox | null {
  if (oldB.width === 0 || oldB.height === 0) return null;
  let anchorX: number;
  let anchorY: number;
  switch (handle) {
    case "nw":
      anchorX = oldB.x + oldB.width;
      anchorY = oldB.y + oldB.height;
      break;
    case "ne":
      anchorX = oldB.x;
      anchorY = oldB.y + oldB.height;
      break;
    case "se":
      anchorX = oldB.x;
      anchorY = oldB.y;
      break;
    case "sw":
      anchorX = oldB.x + oldB.width;
      anchorY = oldB.y;
      break;
    default:
      return null;
  }
  const rawW = pointer.x - anchorX;
  const rawH = pointer.y - anchorY;
  const scaleW = Math.abs(rawW) / oldB.width;
  const scaleH = Math.abs(rawH) / oldB.height;
  const scale = Math.max(scaleW, scaleH);
  const newW = scale * oldB.width;
  const newH = scale * oldB.height;
  const sx = rawW < 0 ? -1 : 1;
  const sy = rawH < 0 ? -1 : 1;
  const cornerX = anchorX + sx * newW;
  const cornerY = anchorY + sy * newH;
  return {
    x: Math.min(anchorX, cornerX),
    y: Math.min(anchorY, cornerY),
    width: Math.abs(cornerX - anchorX),
    height: Math.abs(cornerY - anchorY),
  };
}

function snapshot(
  elements: readonly ScribblyElement[],
  ids: readonly string[],
  options: { includeFrameChildren?: boolean } = {},
): Map<string, ScribblyElement> {
  const set = new Set(ids);
  // Bound text follows its container through move/resize/rotate — include it
  // in the snapshot so the same transform applies.
  for (const id of ids) {
    const text = findBoundTextElement(elements, id);
    if (text) set.add(text.id);
  }
  // Frame children follow their parent through MOVE only — resize must NOT
  // scale them: the frame container is what resizes, and membership is
  // recomputed against the new bounds rather than the children being
  // transformed.
  if (options.includeFrameChildren) {
    const selectedFrameIds = new Set<string>();
    for (const id of ids) {
      const el = elements.find((e) => e.id === id);
      if (el && el.type === "frame") selectedFrameIds.add(el.id);
    }
    if (selectedFrameIds.size > 0) {
      for (const el of elements) {
        if (el.isDeleted) continue;
        if (el.frameId && selectedFrameIds.has(el.frameId)) set.add(el.id);
      }
    }
  }
  const m = new Map<string, ScribblyElement>();
  for (const el of elements) {
    if (!set.has(el.id)) continue;
    // Locked elements can be selected (for the lock badge) but never move
    // or resize. Excluding them from the snapshot skips them in patchers.
    if (el.isLocked) continue;
    m.set(el.id, el);
  }
  return m;
}

export function createSelectionTool(): DrawingTool {
  let mode: Mode = { kind: "idle" };

  return {
    name: "selection",
    onPointerDown(info, ctx) {
      const elements = ctx.getElements();
      const selectedIds = ctx.getSelectedIds();
      const view = ctx.getView();
      const slop = HIT_SLOP_SCREEN / view.scale;

      // 0a. Lock badge hit? When the current selection is fully locked the
      // renderer draws a small padlock at the top-right corner. Clicking it
      // unlocks the selection without first having to pick another tool.
      if (selectedIds.length > 0) {
        const allLocked = selectedIds.every((id) => {
          const el = elements.find((e) => e.id === id);
          return el?.isLocked === true && !el.isDeleted;
        });
        if (allLocked) {
          const bbox = selectionBBox(elements, selectedIds);
          if (bbox) {
            const angle =
              selectedIds.length === 1
                ? (elements.find((e) => e.id === selectedIds[0])?.angle ?? 0)
                : 0;
            const r = lockBadgeScreenRect(bbox, angle, view);
            if (
              info.screen.x >= r.x &&
              info.screen.x <= r.x + r.w &&
              info.screen.y >= r.y &&
              info.screen.y <= r.y + r.h
            ) {
              useAppState.getState().toggleLockSelection();
              mode = { kind: "idle" };
              return;
            }
          }
        }
      }

      const onlySelected =
        selectedIds.length === 1
          ? elements.find((e) => e.id === selectedIds[0])
          : null;
      const onlyArrowSelected = onlySelected?.type === "arrow";

      // 0. arrow endpoint or bend handle?
      if (selectedIds.length === 1) {
        const only = onlySelected;
        // Locked arrows: skip endpoint/bend interactions entirely so the
        // lock badge is the only interactive affordance on the selection.
        if (only && only.isLocked) {
          // Fall through to "2. element?" which lets the user re-pick
          // (and the lock badge in the renderer handles unlock).
        } else if (only && only.type === "arrow" && only.points.length >= 2) {
          const sp = worldToScreen(view, info.world.x, info.world.y);
          // Endpoints take priority over the bend handle.
          const startPt = only.points[0]!;
          const endPt = only.points[only.points.length - 1]!;
          const sScreen = worldToScreen(view, startPt[0], startPt[1]);
          const eScreen = worldToScreen(view, endPt[0], endPt[1]);
          if (Math.hypot(sp.x - sScreen.x, sp.y - sScreen.y) <= ENDPOINT_HIT_RADIUS) {
            mode = { kind: "endpoint", arrowId: only.id, endpoint: "start" };
            return;
          }
          if (Math.hypot(sp.x - eScreen.x, sp.y - eScreen.y) <= ENDPOINT_HIT_RADIUS) {
            mode = { kind: "endpoint", arrowId: only.id, endpoint: "end" };
            return;
          }
          const polyline = arrowPolyline(only);
          const candidate = only.bendPoint ?? [
            (polyline[0]![0] + polyline[1]![0]) / 2,
            (polyline[0]![1] + polyline[1]![1]) / 2,
          ];
          const cwp = worldToScreen(view, candidate[0], candidate[1]);
          if (Math.hypot(sp.x - cwp.x, sp.y - cwp.y) <= BEND_HIT_RADIUS) {
            mode = { kind: "bend", arrowId: only.id };
            return;
          }
        }
      }

      // 1. handle? (single arrow selection has no resize/rotate handles)
      // Locked-only selection has no handles either — the lock badge is
      // the only interactive element drawn on the selection overlay.
      const allSelectedLocked =
        selectedIds.length > 0 &&
        selectedIds.every((id) => {
          const el = elements.find((e) => e.id === id);
          return el?.isLocked === true;
        });
      if (selectedIds.length > 0 && !onlyArrowSelected && !allSelectedLocked) {
        const bbox = selectionBBox(elements, selectedIds);
        if (bbox) {
          const allowRotate = selectedIds.length === 1;
          const angle = selectionAngle(elements, selectedIds);
          const handle = pickHandle(info.world, view, bbox, angle, allowRotate);
          if (handle === "rotate") {
            const id = selectedIds[0];
            const el = id
              ? elements.find((e) => e.id === id)
              : undefined;
            if (!el) {
              mode = { kind: "idle" };
              return;
            }
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            const grabAngle = Math.atan2(
              info.world.y - cy,
              info.world.x - cx,
            );
            mode = {
              kind: "rotate",
              center: { x: cx, y: cy },
              grabAngle,
              targetId: el.id,
              startElementAngle: el.angle,
            };
            return;
          }
          if (handle) {
            mode = {
              kind: "resize",
              handle,
              startBox: bbox,
              initial: snapshot(elements, selectedIds),
              angle,
            };
            return;
          }
        }
      }

      // 2. element?
      const hit = pickElement(info.world, elements, slop);
      if (hit) {
        // Clicking any group member acts as clicking the whole group.
        const hitGroupMates = hit.groupId
          ? elements
              .filter((e) => e.groupId === hit.groupId && !e.isDeleted)
              .map((e) => e.id)
          : [hit.id];
        if (info.shiftKey) {
          const next = new Set(selectedIds);
          const allInSelection = hitGroupMates.every((id) => next.has(id));
          if (allInSelection) {
            for (const id of hitGroupMates) next.delete(id);
          } else {
            for (const id of hitGroupMates) next.add(id);
          }
          ctx.setSelectedIds(pruneFrameRelations(elements, [...next]));
          mode = { kind: "idle" };
          return;
        }
        let nextSelected: readonly string[] = selectedIds;
        const alreadySelected = hitGroupMates.every((id) =>
          selectedIds.includes(id),
        );
        if (!alreadySelected) {
          nextSelected = pruneFrameRelations(elements, hitGroupMates);
          ctx.setSelectedIds(nextSelected);
        }
        mode = {
          kind: "pending-move",
          startWorld: info.world,
          startScreen: info.screen,
          initial: snapshot(elements, nextSelected, {
            includeFrameChildren: true,
          }),
        };
        return;
      }

      // 3. empty → selection box
      const baseSelection = info.shiftKey
        ? new Set(selectedIds)
        : new Set<string>();
      if (!info.shiftKey) ctx.setSelectedIds([]);
      mode = {
        kind: "box",
        startWorld: info.world,
        baseSelection,
      };
      ctx.setSelectionBox({
        x: info.world.x,
        y: info.world.y,
        width: 0,
        height: 0,
      });
    },

    onPointerMove(info, ctx) {
      if (mode.kind === "pending-move") {
        const ddx = info.screen.x - mode.startScreen.x;
        const ddy = info.screen.y - mode.startScreen.y;
        if (
          ddx * ddx + ddy * ddy <
          DRAG_THRESHOLD_SCREEN * DRAG_THRESHOLD_SCREEN
        ) {
          return;
        }
        mode = {
          kind: "move",
          startWorld: mode.startWorld,
          initial: mode.initial,
        };
      }
      switch (mode.kind) {
        case "idle":
          return;
        case "move": {
          const rawDx = info.world.x - mode.startWorld.x;
          const rawDy = info.world.y - mode.startWorld.y;
          let dx = rawDx;
          let dy = rawDy;

          const state = useAppState.getState();
          if (info.shiftKey) {
            // Illustrator-style axis lock: snap to 0°/45°/90° directions.
            // tan(22.5°) ≈ 0.414, tan(67.5°) ≈ 2.414
            const absX = Math.abs(rawDx);
            const absY = Math.abs(rawDy);
            if (absX > absY * 2.414) {
              dy = 0;
            } else if (absY > absX * 2.414) {
              dx = 0;
            } else {
              const mag = Math.min(absX, absY);
              dx = Math.sign(rawDx) * mag;
              dy = Math.sign(rawDy) * mag;
            }
            if (state.snapGuides.length > 0) state.setSnapGuides([]);
          } else if (state.snapToObjects) {
            const draggedIds = new Set(mode.initial.keys());
            const others = ctx
              .getElements()
              .filter((el) => !el.isDeleted && !draggedIds.has(el.id));
            const snapped = snapMoveDelta(
              mode.initial,
              rawDx,
              rawDy,
              others,
              ctx.getView().scale,
            );
            dx = snapped.dx;
            dy = snapped.dy;
            state.setSnapGuides(snapped.guides);
          } else if (state.snapGuides.length > 0) {
            state.setSnapGuides([]);
          }
          const initial = mode.initial;
          const patcher: ElementPatcher = (el) => {
            const init = initial.get(el.id);
            return init ? translateElement(init, dx, dy) : el;
          };
          const ids = [...initial.keys()];
          ctx.updateElements(ids, patcher);
          const shapeIds = ids.filter((id) => {
            const el = initial.get(id);
            return el ? isShape(el) : false;
          });
          if (shapeIds.length > 0) ctx.reconcileBindings(shapeIds);
          // Drag-into-frame highlight: only fires when the moving set contains
          // a non-frame element. We pick the topmost frame whose bbox contains
          // the centroid of the moving set (post-translation).
          const movingSet = new Set(initial.keys());
          const containsFrame = [...initial.values()].some(
            (el) => el.type === "frame",
          );
          if (!containsFrame) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const el of initial.values()) {
              const nx = el.x + dx;
              const ny = el.y + dy;
              if (nx < minX) minX = nx;
              if (ny < minY) minY = ny;
              if (nx + el.width > maxX) maxX = nx + el.width;
              if (ny + el.height > maxY) maxY = ny + el.height;
            }
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            // Pick the topmost frame containing the centroid; elements come
            // pre-sorted by zIndex so iterate from the end.
            const live = ctx.getElements();
            let candidate: string | null = null;
            for (let i = live.length - 1; i >= 0; i--) {
              const el = live[i];
              if (!el || el.isDeleted) continue;
              if (el.type !== "frame") continue;
              if (movingSet.has(el.id)) continue;
              if (
                cx >= el.x &&
                cx <= el.x + el.width &&
                cy >= el.y &&
                cy <= el.y + el.height
              ) {
                candidate = el.id;
                break;
              }
            }
            useAppState.getState().setHighlightedFrameId(candidate);
          }
          return;
        }
        case "resize": {
          const startBox = mode.startBox;
          const angle = mode.angle;
          const oldCx = startBox.x + startBox.width / 2;
          const oldCy = startBox.y + startBox.height / 2;
          // Pointer in element-local frame (un-rotated around old center)
          const pointerLocal = angle
            ? rotatePoint(info.world, oldCx, oldCy, -angle)
            : info.world;
          const constrained =
            info.shiftKey
              ? aspectConstrainedBBox(mode.handle, startBox, pointerLocal)
              : null;
          const newB =
            constrained ?? resizedBBox(mode.handle, startBox, pointerLocal);

          // Anchor preservation: the corner opposite the dragged handle
          // should stay at the same WORLD position after resize.
          let shiftX = 0;
          let shiftY = 0;
          if (angle) {
            const aLocal = anchorLocal(mode.handle, startBox);
            const aWorld = rotatePoint(aLocal, oldCx, oldCy, angle);
            const newCx = newB.x + newB.width / 2;
            const newCy = newB.y + newB.height / 2;
            // Position where the anchor lands after resize if we re-rotate
            // around the NEW center with the same angle.
            const dxLocal = aLocal.x - newCx;
            const dyLocal = aLocal.y - newCy;
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            const newCenterWorldX = aWorld.x - (dxLocal * c - dyLocal * s);
            const newCenterWorldY = aWorld.y - (dxLocal * s + dyLocal * c);
            shiftX = newCenterWorldX - newCx;
            shiftY = newCenterWorldY - newCy;
          }

          const initial = mode.initial;
          const patcher: ElementPatcher = (el) => {
            const init = initial.get(el.id);
            if (!init) return el;
            const resized = resizeElement(init, startBox, newB);
            return shiftX || shiftY
              ? translateElement(resized, shiftX, shiftY)
              : resized;
          };
          const ids = [...initial.keys()];
          ctx.updateElements(ids, patcher);
          const shapeIds = ids.filter((id) => {
            const el = initial.get(id);
            return el ? isShape(el) : false;
          });
          if (shapeIds.length > 0) ctx.reconcileBindings(shapeIds);
          return;
        }
        case "rotate": {
          const currentAngle = Math.atan2(
            info.world.y - mode.center.y,
            info.world.x - mode.center.x,
          );
          const delta = currentAngle - mode.grabAngle;
          const rawAngle = mode.startElementAngle + delta;
          const snap = Math.PI / 4;
          const nextAngle = info.shiftKey
            ? Math.round(rawAngle / snap) * snap
            : rawAngle;
          const targetId = mode.targetId;
          ctx.updateElements([targetId], (el) => ({ ...el, angle: nextAngle }));
          const rotated = ctx
            .getElements()
            .find((e) => e.id === targetId);
          if (rotated && isShape(rotated)) {
            ctx.reconcileBindings([targetId]);
          }
          return;
        }
        case "bend": {
          const arrowId = mode.arrowId;
          ctx.updateElements([arrowId], (el) => {
            if (el.type !== "arrow") return el;
            const bend = [info.world.x, info.world.y] as [number, number];
            const next: ArrowElement = { ...el, bendPoint: bend };
            return { ...next, ...arrowBounds(next) };
          });
          return;
        }
        case "endpoint": {
          const arrowId = mode.arrowId;
          const which = mode.endpoint;
          const view = ctx.getView();
          // Reference for snapping = the OTHER endpoint of the arrow (so the
          // snap point on the perimeter faces the rest of the arrow).
          const arrow = ctx
            .getElements()
            .find((e) => e.id === arrowId);
          const reference =
            arrow && arrow.type === "arrow" && arrow.points.length >= 2
              ? (() => {
                  const p =
                    which === "start"
                      ? arrow.points[arrow.points.length - 1]!
                      : arrow.points[0]!;
                  return { x: p[0], y: p[1] };
                })()
              : null;
          const match = findBindingAt(
            info.world,
            ctx.getElements(),
            view,
            reference,
          );
          useAppState
            .getState()
            .setConnectionTargetId(match ? match.shape.id : null);
          const target: [number, number] = match
            ? [match.world.x, match.world.y]
            : [info.world.x, info.world.y];
          const binding = match
            ? { elementId: match.shape.id, focus: match.focus }
            : null;
          ctx.updateElements([arrowId], (el) => {
            if (el.type !== "arrow") return el;
            if (el.points.length < 2) return el;
            const start = el.points[0]!;
            const end = el.points[el.points.length - 1]!;
            const nextPoints: [number, number][] =
              which === "start" ? [target, [end[0], end[1]]] : [[start[0], start[1]], target];
            const next: ArrowElement = {
              ...el,
              points: nextPoints,
              startBinding: which === "start" ? binding : el.startBinding,
              endBinding: which === "end" ? binding : el.endBinding,
            };
            return { ...next, ...arrowBounds(next) };
          });
          // Re-project the OPPOSITE bound endpoint (its perimeter point
          // depends on this end's new position).
          const updated = ctx
            .getElements()
            .find((e) => e.id === arrowId);
          if (updated && updated.type === "arrow") {
            const ids: string[] = [];
            if (updated.startBinding) ids.push(updated.startBinding.elementId);
            if (updated.endBinding) ids.push(updated.endBinding.elementId);
            if (ids.length > 0) ctx.reconcileBindings(ids);
          }
          return;
        }
        case "box": {
          const x = Math.min(mode.startWorld.x, info.world.x);
          const y = Math.min(mode.startWorld.y, info.world.y);
          ctx.setSelectionBox({
            x,
            y,
            width: Math.abs(info.world.x - mode.startWorld.x),
            height: Math.abs(info.world.y - mode.startWorld.y),
          });
          return;
        }
      }
    },

    onPointerUp(info, ctx) {
      if (useAppState.getState().snapGuides.length > 0) {
        useAppState.getState().setSnapGuides([]);
      }
      // Commit auto-attach: any non-frame element dropped inside a frame
      // gets its frameId updated; an element dragged out of its parent
      // frame's bounds is detached.
      if (mode.kind === "move") {
        const initial = mode.initial;
        const live = ctx.getElements();
        const targetFrameId =
          useAppState.getState().highlightedFrameId ?? null;
        useAppState.getState().setHighlightedFrameId(null);
        const toAttach: string[] = [];
        const toDetach: string[] = [];
        for (const [id, init] of initial) {
          if (init.type === "frame") continue;
          if (init.isLocked) continue;
          const current = live.find((e) => e.id === id);
          if (!current) continue;
          if (targetFrameId) {
            if (current.frameId !== targetFrameId) toAttach.push(id);
          } else if (current.frameId) {
            // Only detach when the element actually moved outside its parent
            // frame; if it's still inside, keep the membership.
            const parent = live.find((e) => e.id === current.frameId);
            if (parent && parent.type === "frame" && !parent.isDeleted) {
              const cx = current.x + current.width / 2;
              const cy = current.y + current.height / 2;
              const inside =
                cx >= parent.x &&
                cx <= parent.x + parent.width &&
                cy >= parent.y &&
                cy <= parent.y + parent.height;
              if (!inside) toDetach.push(id);
            } else {
              toDetach.push(id);
            }
          }
        }
        if (toAttach.length > 0) {
          ctx.updateElements(toAttach, (el) =>
            el.frameId === targetFrameId
              ? el
              : { ...el, frameId: targetFrameId },
          );
        }
        if (toDetach.length > 0) {
          ctx.updateElements(toDetach, (el) =>
            el.frameId === null ? el : { ...el, frameId: null },
          );
        }
      }
      if (mode.kind === "box") {
        const x = Math.min(mode.startWorld.x, info.world.x);
        const y = Math.min(mode.startWorld.y, info.world.y);
        const box: BBox = {
          x,
          y,
          width: Math.abs(info.world.x - mode.startWorld.x),
          height: Math.abs(info.world.y - mode.startWorld.y),
        };
        const elements = ctx.getElements();
        // Marquee skips locked elements AND frames — locked elements need
        // direct-click to surface the unlock affordance; frames are selected
        // by clicking their border or name label, never by sweep.
        const hits = elementsInBox(elements, box)
          .filter((e) => !e.isLocked && e.type !== "frame")
          .map((e) => e.id);
        const finalIds = new Set(mode.baseSelection);
        for (const id of hits) finalIds.add(id);
        ctx.setSelectedIds(
          pruneFrameRelations(elements, expandToGroup(elements, finalIds)),
        );
        ctx.setSelectionBox(null);
      }
      if (mode.kind === "endpoint") {
        useAppState.getState().setConnectionTargetId(null);
      }
      mode = { kind: "idle" };
    },

    onCancel(ctx) {
      ctx.setSelectionBox(null);
      useAppState.getState().setConnectionTargetId(null);
      useAppState.getState().setSnapGuides([]);
      useAppState.getState().setHighlightedFrameId(null);
      mode = { kind: "idle" };
    },
  };
}
