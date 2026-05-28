import { useEffect, useMemo, useRef } from "react";
import { usePointer, type PointerInfo } from "../hooks/usePointer";
import { useAppState } from "../store/appState";
import { createToolRegistry } from "../tools";
import type { ToolContext, ToolName } from "../tools/types";
import {
  arrowMidpoint,
  duplicateElement,
  findBoundTextElement,
  isTextContainer,
  type ScribblyElement,
} from "./elements";
import {
  type BBox,
  type HandleName,
  pickElement,
  pickHandle,
  selectionBBox,
} from "./hitTest";
import { arrowPolyline, isShape } from "./elements";
import { screenToWorld, worldToScreen } from "./geometry";
import {
  BEND_HIT_RADIUS,
  ENDPOINT_HIT_RADIUS,
} from "./hitTest";
import { renderScene, setImageReadyNotifier } from "./renderer";
import { importImageFile } from "./imageImport";
import styles from "./Canvas.module.scss";

type Props = {
  roomId: string;
  publishCursor?: (world: { x: number; y: number } | null) => void;
};

type PanState =
  | { active: false }
  | {
      active: true;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    };

const TOOL_HOTKEYS: Record<string, ToolName> = {
  "1": "selection",
  "2": "rectangle",
  "3": "ellipse",
  "4": "line",
  "5": "arrow",
  "6": "freedraw",
  t: "text",
  T: "text",
  e: "eraser",
  E: "eraser",
  k: "laser",
  K: "laser",
  f: "frame",
  F: "frame",
};

const HIT_SLOP_SCREEN = 6;

const ERASER_CURSOR_LIGHT =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><circle cx='11' cy='11' r='9.5' fill='rgba(255,255,255,0.55)' stroke='%231f2937' stroke-width='1.2'/></svg>\") 11 11, auto";

const ERASER_CURSOR_DARK =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><circle cx='11' cy='11' r='9.5' fill='rgba(31,41,55,0.55)' stroke='%23e5e7eb' stroke-width='1.2'/></svg>\") 11 11, auto";

const LASER_CURSOR_LIGHT =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'><circle cx='7' cy='7' r='3.5' fill='%23dc2626' stroke='%23ffffff' stroke-width='1.5'/></svg>\") 7 7, crosshair";

const LASER_CURSOR_DARK =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'><circle cx='7' cy='7' r='3.5' fill='%23ef4444' stroke='%231f2937' stroke-width='1.5'/></svg>\") 7 7, crosshair";

function eraserCursor(): string {
  return useAppState.getState().theme === "dark"
    ? ERASER_CURSOR_DARK
    : ERASER_CURSOR_LIGHT;
}

function laserCursor(): string {
  return useAppState.getState().theme === "dark"
    ? LASER_CURSOR_DARK
    : LASER_CURSOR_LIGHT;
}

function handleResizeCursor(handle: HandleName, angle: number): string {
  if (handle === "rotate") return "grab";
  const baseDeg: Record<Exclude<HandleName, "rotate">, number> = {
    e: 0,
    w: 0,
    ne: 45,
    sw: 45,
    n: 90,
    s: 90,
    nw: 135,
    se: 135,
  };
  const totalDeg = (baseDeg[handle] + (angle * 180) / Math.PI + 360) % 180;
  if (totalDeg < 22.5 || totalDeg >= 157.5) return "ew-resize";
  if (totalDeg < 67.5) return "nesw-resize";
  if (totalDeg < 112.5) return "ns-resize";
  return "nwse-resize";
}

function computeHoverCursor(world: PointerInfo["world"]): string {
  const state = useAppState.getState();
  const tool = state.activeTool;
  if (tool === "hand") return "grab";
  if (tool === "eraser") return eraserCursor();
  if (tool === "laser") return laserCursor();
  if (tool !== "selection") return "crosshair";

  const view = state.view;
  const elements = state.elements;
  const selectedIds = state.selectedIds;

  const onlySelected =
    selectedIds.length === 1
      ? elements.find((e) => e.id === selectedIds[0])
      : null;
  const onlyArrow =
    onlySelected && onlySelected.type === "arrow" ? onlySelected : null;

  if (onlyArrow && onlyArrow.points.length >= 2) {
    const sp = worldToScreen(view, world.x, world.y);
    const startPt = onlyArrow.points[0]!;
    const endPt = onlyArrow.points[onlyArrow.points.length - 1]!;
    const ss = worldToScreen(view, startPt[0], startPt[1]);
    const es = worldToScreen(view, endPt[0], endPt[1]);
    if (
      Math.hypot(sp.x - ss.x, sp.y - ss.y) <= ENDPOINT_HIT_RADIUS ||
      Math.hypot(sp.x - es.x, sp.y - es.y) <= ENDPOINT_HIT_RADIUS
    ) {
      return "grab";
    }
    const polyline = arrowPolyline(onlyArrow);
    if (polyline.length >= 2) {
      const candidate = onlyArrow.bendPoint ?? [
        (polyline[0]![0] + polyline[1]![0]) / 2,
        (polyline[0]![1] + polyline[1]![1]) / 2,
      ];
      const cs = worldToScreen(view, candidate[0], candidate[1]);
      if (Math.hypot(sp.x - cs.x, sp.y - cs.y) <= BEND_HIT_RADIUS) {
        return "grab";
      }
    }
  } else if (selectedIds.length > 0) {
    const bbox = selectionBBox(elements, selectedIds);
    if (bbox) {
      const angle =
        selectedIds.length === 1
          ? (elements.find((e) => e.id === selectedIds[0])?.angle ?? 0)
          : 0;
      const handle = pickHandle(
        world,
        view,
        bbox,
        angle,
        selectedIds.length === 1,
      );
      if (handle) return handleResizeCursor(handle, angle);
    }
  }

  const slop = HIT_SLOP_SCREEN / view.scale;
  if (pickElement(world, elements, slop)) return "move";

  return "default";
}

export function Canvas({ roomId, publishCursor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef<PanState>({ active: false });
  const drawingRef = useRef(false);
  const spaceDownRef = useRef(false);
  // Last pointer info captured during an active drag. Lets us re-run the
  // active tool's move handler when shift toggles without a mouse move.
  const lastPointerRef = useRef<PointerInfo | null>(null);

  const tools = useMemo(() => createToolRegistry(), []);
  const toolCtx = useMemo<ToolContext>(
    () => ({
      roomId,
      setDraft: (el) => useAppState.getState().setDraft(el),
      getDraft: () => useAppState.getState().draftElement,
      addElement: (el) => useAppState.getState().addElement(el),
      addElements: (els) => useAppState.getState().addElements(els),
      setActiveTool: (tool) => useAppState.getState().setActiveTool(tool),
      setTextDraft: (draft) => useAppState.getState().setTextDraft(draft),
      getView: () => useAppState.getState().view,
      getElements: () => useAppState.getState().elements,
      updateElements: (ids, patcher) =>
        useAppState.getState().updateElements(ids, patcher),
      deleteElements: (ids) => useAppState.getState().deleteElements(ids),
      getSelectedIds: () => useAppState.getState().selectedIds,
      setSelectedIds: (ids) => useAppState.getState().setSelectedIds(ids),
      setSelectionBox: (box) => useAppState.getState().setSelectionBox(box),
      reconcileBindings: (ids) =>
        useAppState.getState().reconcileBindings(ids),
      panBy: (dx, dy) => useAppState.getState().panBy(dx, dy),
    }),
    [roomId],
  );

  const setCursor = (value: string) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = value;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let dirty = true;
    let sceneElements: ScribblyElement[] = [];
    let selectedIds: readonly string[] = [];
    let selectionBox: BBox | null = null;
    let hoveredShapeId: string | null = null;
    let connectionTargetId: string | null = null;
    let highlightedFrameId: string | null = null;
    let editingFrameNameId: string | null = null;
    let pendingEraseIds: ReadonlySet<string> = new Set();
    let snapGuides: readonly import("../store/appState").SnapGuide[] = [];
    let eraserTrail: readonly import("../store/appState").EraserTrailPoint[] =
      [];
    let laserTrail: readonly import("../store/appState").LaserTrailPoint[] = [];
    let lineSnapTarget: { x: number; y: number } | null = null;
    let polygonPreview: {
      vertices: readonly [number, number][];
      edgeIds: readonly string[];
    } | null = null;

    const syncScene = () => {
      const s = useAppState.getState();
      // Hide the element currently being edited so the inline editor isn't
      // stacked on top of its own rendered copy.
      const editingId = s.textDraft?.editingId ?? null;
      const base = editingId
        ? s.elements.filter((el) => el.id !== editingId)
        : s.elements;
      sceneElements = s.draftElement ? [...base, s.draftElement] : base;
      selectedIds = s.selectedIds;
      selectionBox = s.selectionBox;
      hoveredShapeId = s.hoveredShapeId;
      connectionTargetId = s.connectionTargetId;
      highlightedFrameId = s.highlightedFrameId;
      editingFrameNameId = s.frameNameDraft;
      pendingEraseIds = s.pendingEraseIds;
      snapGuides = s.snapGuides;
      eraserTrail = s.eraserTrail;
      laserTrail = s.laserTrail;
      lineSnapTarget = s.lineSnapTarget;
      polygonPreview = s.polygonPreview;
      dirty = true;
    };
    syncScene();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      dirty = true;
    };

    const render = () => {
      if (dirty) {
        const s = useAppState.getState();
        renderScene(
          canvas,
          ctx,
          s.view,
          sceneElements,
          {
            selectedIds,
            selectionBox,
            hoveredShapeId,
            connectionTargetId,
            pendingEraseIds,
            background: s.canvasBackground,
            drawGrid: s.showGrid,
            snapGuides,
            eraserTrail,
            laserTrail,
            theme: s.theme,
            highlightedFrameId,
            editingFrameNameId,
            lineSnapTarget,
            polygonPreview,
          },
        );
        dirty = false;
      }
      // Keep repainting while the eraser trail is animating so old points
      // fade out smoothly even when the pointer is stationary.
      if (eraserTrail.length > 0) dirty = true;
      // Laser trail keeps fading after pointer-up, so we have to drive the
      // animation ourselves and proactively prune stale points (the tool
      // doesn't clear on release like the eraser does).
      if (laserTrail.length > 0) {
        useAppState.getState().pruneLaserTrail();
        dirty = true;
      }
      rafId = requestAnimationFrame(render);
    };

    setImageReadyNotifier(() => {
      dirty = true;
    });
    const unsubscribe = useAppState.subscribe(syncScene);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      unsubscribe();
      setImageReadyNotifier(null);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.code === "Space" && !spaceDownRef.current && !inEditable) {
        spaceDownRef.current = true;
        setCursor("grab");
        e.preventDefault();
        return;
      }

      // While drawing, toggling Shift should immediately update the constraint
      // even with a stationary mouse — re-fire move with the cached pointer.
      if (
        (e.key === "Shift" || e.shiftKey) &&
        drawingRef.current &&
        lastPointerRef.current &&
        !lastPointerRef.current.shiftKey
      ) {
        const synthetic: PointerInfo = {
          ...lastPointerRef.current,
          shiftKey: true,
        };
        lastPointerRef.current = synthetic;
        const tool = tools[useAppState.getState().activeTool];
        tool.onPointerMove(synthetic, toolCtx);
      }

      if (inEditable) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const state = useAppState.getState();
        // Skip locked elements — they have to be unlocked first.
        const lockedById = new Map(
          state.elements.map((el) => [el.id, el.isLocked] as const),
        );
        const ids = state.selectedIds.filter((id) => !lockedById.get(id));
        if (ids.length > 0) {
          e.preventDefault();
          state.pushHistory();
          state.deleteElements(ids);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        const state = useAppState.getState();
        // Priority: cancel in-flight draft → clear selection → switch to selection tool.
        if (state.draftElement || state.textDraft || drawingRef.current) {
          const tool = tools[state.activeTool];
          tool.onCancel(toolCtx);
          state.setDraft(null);
          state.setTextDraft(null);
          drawingRef.current = false;
          return;
        }
        if (state.selectionBox) {
          state.setSelectionBox(null);
          return;
        }
        if (state.selectedIds.length > 0) {
          state.setSelectedIds([]);
          return;
        }
        if (state.activeTool !== "selection") {
          state.setActiveTool("selection");
        }
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        useAppState.getState().zoomIn();
        return;
      }
      if (isMod && e.key === "-") {
        e.preventDefault();
        useAppState.getState().zoomOut();
        return;
      }
      if (isMod && e.key === "0") {
        e.preventDefault();
        useAppState.getState().resetView();
        return;
      }
      if (e.shiftKey && e.key === "1" && !isMod) {
        e.preventDefault();
        useAppState
          .getState()
          .zoomToFit({ width: window.innerWidth, height: window.innerHeight });
        return;
      }
      if (isMod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        const state = useAppState.getState();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (isMod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        useAppState.getState().redo();
        return;
      }
      if (isMod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const state = useAppState.getState();
        const allIds = state.elements
          .filter((el) => !el.isDeleted && !el.isLocked)
          .map((el) => el.id);
        state.setSelectedIds(allIds);
        return;
      }
      if (isMod && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        const state = useAppState.getState();
        if (state.selectedIds.length === 0) return;
        if (e.shiftKey) state.ungroupSelection();
        else state.groupSelection();
        return;
      }
      if (isMod && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        const state = useAppState.getState();
        if (state.selectedIds.length === 0) return;
        state.toggleLockSelection();
        return;
      }
      if (isMod && e.key === "]") {
        e.preventDefault();
        const state = useAppState.getState();
        if (state.selectedIds.length === 0) return;
        if (e.shiftKey) state.bringSelectionToFront();
        else state.bringSelectionForward();
        return;
      }
      if (isMod && e.key === "[") {
        e.preventDefault();
        const state = useAppState.getState();
        if (state.selectedIds.length === 0) return;
        if (e.shiftKey) state.sendSelectionToBack();
        else state.sendSelectionBackward();
        return;
      }
      if (isMod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const state = useAppState.getState();
        const targets = new Set(state.selectedIds);
        if (targets.size === 0) return;
        const source = state.elements.filter(
          (el) => targets.has(el.id) && !el.isDeleted,
        );
        if (source.length === 0) return;
        const view = state.view;
        const offset = 16 / view.scale;
        const dups = source.map((el) => duplicateElement(el, offset, offset));
        state.pushHistory();
        state.addElements(dups);
        state.setSelectedIds(dups.map((el) => el.id));
        return;
      }

      const hotkey = TOOL_HOTKEYS[e.key];
      if (hotkey) {
        const s = useAppState.getState();
        if (
          s.viewMode &&
          hotkey !== "selection" &&
          hotkey !== "hand" &&
          hotkey !== "laser"
        ) {
          return;
        }
        s.setActiveTool(hotkey);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        setCursor("default");
      }
      if (
        e.key === "Shift" &&
        drawingRef.current &&
        lastPointerRef.current &&
        lastPointerRef.current.shiftKey
      ) {
        const synthetic: PointerInfo = {
          ...lastPointerRef.current,
          shiftKey: false,
        };
        lastPointerRef.current = synthetic;
        const tool = tools[useAppState.getState().activeTool];
        tool.onPointerMove(synthetic, toolCtx);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (useAppState.getState().viewMode) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          importImageFile(file, { roomId }).catch((err) =>
            console.error("Failed to paste image", err),
          );
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [roomId]);

  useEffect(() => {
    let prevTool = useAppState.getState().activeTool;
    return useAppState.subscribe((state) => {
      if (state.activeTool === prevTool) return;
      prevTool = state.activeTool;
      if (drawingRef.current || panRef.current.active) return;
      if (state.activeTool === "hand") setCursor("grab");
      else if (state.activeTool === "eraser") setCursor(eraserCursor());
      else if (state.activeTool === "laser") setCursor(laserCursor());
      else if (state.activeTool === "selection") setCursor("default");
      else setCursor("crosshair");
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        useAppState.getState().zoomAtScreen(screenX, screenY, factor);
      } else {
        useAppState.getState().panBy(-e.deltaX, -e.deltaY);
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const handleDown = (info: PointerInfo) => {
    const isMiddle = info.button === 1;
    const isSpacePan = info.button === 0 && spaceDownRef.current;
    if (isMiddle || isSpacePan) {
      const canvas = canvasRef.current;
      canvas?.setPointerCapture(info.pointerId);
      const { view } = useAppState.getState();
      panRef.current = {
        active: true,
        startX: info.screen.x,
        startY: info.screen.y,
        originX: view.x,
        originY: view.y,
      };
      setCursor("grabbing");
      return;
    }
    if (info.button !== 0) return;

    const state = useAppState.getState();
    const activeTool = state.activeTool;
    // In view mode only selection/hand interactions are allowed.
    if (
      state.viewMode &&
      activeTool !== "selection" &&
      activeTool !== "hand" &&
      activeTool !== "laser"
    ) {
      return;
    }
    const canvas = canvasRef.current;
    canvas?.setPointerCapture(info.pointerId);
    drawingRef.current = true;
    if (activeTool === "hand") {
      setCursor("grabbing");
    } else if (activeTool !== "laser") {
      // Snapshot pre-mutation state so this gesture is undoable. Dedup on
      // pushHistory means clicks that don't mutate won't bloat the stack.
      // The laser tool produces no mutations, so skip the snapshot.
      state.pushHistory();
    }
    const tool = tools[activeTool];
    tool.onPointerDown(info, toolCtx);
  };

  const handleMove = (info: PointerInfo) => {
    publishCursor?.({ x: info.world.x, y: info.world.y });
    const pan = panRef.current;
    if (pan.active) {
      const dx = info.screen.x - pan.startX;
      const dy = info.screen.y - pan.startY;
      const { view } = useAppState.getState();
      useAppState.getState().setView({
        x: pan.originX + dx,
        y: pan.originY + dy,
        scale: view.scale,
      });
      return;
    }
    if (drawingRef.current) {
      lastPointerRef.current = info;
      const tool = tools[useAppState.getState().activeTool];
      tool.onPointerMove(info, toolCtx);
      return;
    }
    if (spaceDownRef.current) return;
    updateHoveredShape(info.world);
    setCursor(computeHoverCursor(info.world));
  };

  const updateHoveredShape = (world: PointerInfo["world"]) => {
    const state = useAppState.getState();
    const slop = HIT_SLOP_SCREEN / state.view.scale;
    const hit = pickElement(world, state.elements, slop);
    const id = hit && isShape(hit) ? hit.id : null;
    state.setHoveredShapeId(id);
  };

  const handleUp = (info: PointerInfo) => {
    const canvas = canvasRef.current;
    if (panRef.current.active) {
      canvas?.releasePointerCapture(info.pointerId);
      panRef.current = { active: false };
      setCursor(spaceDownRef.current ? "grab" : computeHoverCursor(info.world));
      return;
    }
    if (!drawingRef.current) return;
    canvas?.releasePointerCapture(info.pointerId);
    drawingRef.current = false;
    lastPointerRef.current = null;
    const tool = tools[useAppState.getState().activeTool];
    tool.onPointerUp(info, toolCtx);
    setCursor(computeHoverCursor(info.world));
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const state = useAppState.getState();
    if (state.viewMode) return;
    const world = screenToWorld(state.view, screenX, screenY);
    const slop = HIT_SLOP_SCREEN / state.view.scale;
    const hit = pickElement(world, state.elements, slop);

    // 0. Double-clicked a frame (its border or name label) → edit the name.
    if (hit && hit.type === "frame") {
      state.setActiveTool("selection");
      state.setSelectedIds([hit.id]);
      state.setFrameNameDraft(hit.id);
      return;
    }

    // 1. Double-clicked an existing text → edit it directly.
    if (hit && hit.type === "text") {
      const containerId = hit.containerId ?? undefined;
      state.setActiveTool("selection");
      state.setSelectedIds(containerId ? [containerId] : [hit.id]);
      state.setTextDraft({
        worldX: hit.x,
        worldY: hit.y,
        editingId: hit.id,
        ...(containerId ? { containerId } : {}),
      });
      return;
    }

    // 2a. Double-clicked an arrow → edit (or create) its bound midpoint label.
    if (hit && hit.type === "arrow") {
      const existing = findBoundTextElement(state.elements, hit.id);
      state.setActiveTool("selection");
      state.setSelectedIds([hit.id]);
      const mid = arrowMidpoint(hit);
      if (existing) {
        state.setTextDraft({
          worldX: existing.x,
          worldY: existing.y,
          editingId: existing.id,
          containerId: hit.id,
        });
      } else if (mid) {
        state.setTextDraft({
          worldX: mid[0],
          worldY: mid[1],
          containerId: hit.id,
        });
      }
      return;
    }

    // 2. Double-clicked a container shape → edit (or create) its bound text.
    if (hit && isTextContainer(hit)) {
      const existing = findBoundTextElement(state.elements, hit.id);
      state.setActiveTool("selection");
      state.setSelectedIds([hit.id]);
      if (existing) {
        state.setTextDraft({
          worldX: existing.x,
          worldY: existing.y,
          editingId: existing.id,
          containerId: hit.id,
        });
      } else {
        state.setTextDraft({
          worldX: hit.x + hit.width / 2,
          worldY: hit.y + hit.height / 2,
          containerId: hit.id,
        });
      }
      return;
    }

    // 3. Empty canvas → free-floating text.
    state.setActiveTool("selection");
    state.setTextDraft({ worldX: world.x, worldY: world.y });
  };

  const handleCancel = (info: PointerInfo) => {
    const canvas = canvasRef.current;
    if (panRef.current.active) {
      canvas?.releasePointerCapture(info.pointerId);
      panRef.current = { active: false };
      setCursor(spaceDownRef.current ? "grab" : "default");
      return;
    }
    if (!drawingRef.current) return;
    canvas?.releasePointerCapture(info.pointerId);
    drawingRef.current = false;
    lastPointerRef.current = null;
    const tool = tools[useAppState.getState().activeTool];
    tool.onCancel(toolCtx);
    setCursor("default");
  };

  const handlers = usePointer({
    canvasRef,
    getView: () => useAppState.getState().view,
    onDown: handleDown,
    onMove: handleMove,
    onUp: handleUp,
    onCancel: handleCancel,
  });

  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (useAppState.getState().viewMode) return;
    const types = e.dataTransfer?.types;
    if (!types || !Array.from(types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (useAppState.getState().viewMode) return;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const imageFile = Array.from(files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!imageFile) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const screenX = rect ? e.clientX - rect.left : e.clientX;
    const screenY = rect ? e.clientY - rect.top : e.clientY;
    const world = screenToWorld(
      useAppState.getState().view,
      screenX,
      screenY,
    );
    importImageFile(imageFile, { roomId, centerWorld: world }).catch((err) =>
      console.error("Failed to drop image", err),
    );
  };

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      {...handlers}
      onDoubleClick={handleDoubleClick}
      onPointerLeave={() => {
        useAppState.getState().setHoveredShapeId(null);
        useAppState.getState().setConnectionTargetId(null);
        publishCursor?.(null);
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
