// App canvas renderer. Per-element drawing primitives + the dispatcher
// live in @scribbly/renderer (shared with the marketplace registry). This
// file is the live-canvas orchestrator: layers selection chrome, snap
// guides, eraser/laser trails, binding halos, frame outlines, and the
// background grid on top of those primitives.

import {
  arrowPolyline,
  drawElement,
  getRoughCanvas,
  isShape,
  setImageReadyNotifier,
  worldToScreen,
  type ArrowElement,
  type ScribblyElement,
  type ShapeElement,
  type Theme,
  type ViewTransform,
} from "@scribbly/renderer";

import {
  LASER_TRAIL_LIFETIME_MS,
  type EraserTrailPoint,
  type LaserTrailPoint,
  type SnapGuide,
} from "../store/appState";
import {
  BEND_HANDLE_RADIUS,
  ENDPOINT_BINDING_HALO_RADIUS,
  ENDPOINT_HANDLE_RADIUS,
  expandedBBox,
  HANDLE_SIZE,
  type BBox,
  type HandleName,
  handlePositions,
  selectionBBox,
} from "./hitTest";

const GRID_SIZE = 50;
const GRID_COLOR_LIGHT = "#e5e5e5";
const GRID_COLOR_DARK = "#2a2a2a";
const HANDLE_FILL_LIGHT = "#ffffff";
const HANDLE_FILL_DARK = "#1f2937";
const SELECTION_COLOR = "rgba(60, 80, 220, 0.9)";
const SELECTION_FILL = "rgba(60, 80, 220, 0.08)";
const LOCKED_OUTLINE_COLOR = "#9ca3af";
const LOCK_BADGE_SIZE = 16;
const LOCK_BADGE_PAD = 4;
const BINDING_HIGHLIGHT_COLOR = "rgba(108, 117, 230, 0.9)";
const BINDING_HOVER_COLOR = "rgba(108, 117, 230, 0.45)";

const FRAME_OUTLINE_COLOR_HIGHLIGHT = "#6c75e6";
const FRAME_CORNER_RADIUS = 8;

// The image cache + ready-notifier lives inside @scribbly/renderer's draw
// module; re-export so the app's existing Canvas wiring keeps a single
// import surface.
export { setImageReadyNotifier };

export type RenderOptions = {
  selectedIds?: readonly string[];
  selectionBox?: BBox | null;
  drawGrid?: boolean;
  background?: string | null;
  dpr?: number;
  sceneWidth?: number;
  sceneHeight?: number;
  hoveredShapeId?: string | null;
  connectionTargetId?: string | null;
  pendingEraseIds?: ReadonlySet<string>;
  snapGuides?: readonly SnapGuide[];
  eraserTrail?: readonly EraserTrailPoint[];
  laserTrail?: readonly LaserTrailPoint[];
  // Set during a drag-into-frame interaction so the renderer can draw a
  // brighter outline around the candidate parent frame.
  highlightedFrameId?: string | null;
  // Frame currently being renamed via the inline editor — skip drawing its
  // baked-in name label so the input doesn't stack on top of it.
  editingFrameNameId?: string | null;
  // World position currently being snapped to by the in-flight line draft.
  // Drawn as a small ring so the user sees where the new line will join.
  lineSnapTarget?: { x: number; y: number } | null;
  // Polygon that would close if the user released the in-flight line at the
  // current snap target. `vertices` are world-space corners; `edgeIds` are
  // the existing lines whose segments form the closing chain — they're
  // illuminated so the user can plan the shape before committing.
  polygonPreview?: {
    vertices: readonly [number, number][];
    edgeIds: readonly string[];
  } | null;
  // Selected theme — switches default stroke/font colors and the grid color
  // without mutating stored element values. Defaults to "light" for callers
  // (like PNG/SVG export) that haven't opted in.
  theme?: Theme;
};

const ERASER_TRAIL_LIFETIME_MS = 60;

const ERASER_PREVIEW_OPACITY = 0.3;

export function renderScene(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  elements: readonly ScribblyElement[],
  options: RenderOptions = {},
): void {
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
  const sceneWidth = options.sceneWidth ?? canvas.clientWidth;
  const sceneHeight = options.sceneHeight ?? canvas.clientHeight;
  const theme: Theme = options.theme ?? "light";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const worldTransform = (): void => {
    ctx.setTransform(
      view.scale * dpr,
      0,
      0,
      view.scale * dpr,
      view.x * dpr,
      view.y * dpr,
    );
  };
  const screenTransform = (): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  worldTransform();
  if (options.drawGrid !== false) {
    drawGrid(ctx, view, sceneWidth, sceneHeight, theme);
  }

  const rc = getRoughCanvas(canvas);
  const pendingErase = options.pendingEraseIds ?? null;
  const elementsById = new Map<string, ScribblyElement>();
  for (const el of elements) elementsById.set(el.id, el);
  for (const el of elements) {
    if (el.isDeleted) continue;
    const dim = pendingErase ? pendingErase.has(el.id) : false;
    drawElement(
      rc,
      ctx,
      el,
      dim ? ERASER_PREVIEW_OPACITY : 1,
      elementsById,
      theme,
      options.editingFrameNameId ?? null,
      options.background ?? null,
    );
  }

  if (options.selectionBox) {
    drawSelectionBox(ctx, view, options.selectionBox);
  }

  // Highlight the candidate parent frame during a drag-into-frame gesture.
  if (options.highlightedFrameId) {
    const target = elementsById.get(options.highlightedFrameId);
    if (target && !target.isDeleted && target.type === "frame") {
      drawFrameHighlight(ctx, target);
    }
  }

  const selectedIds = options.selectedIds ?? [];
  const singleSelected =
    selectedIds.length === 1
      ? elements.find((e) => e.id === selectedIds[0])
      : null;
  const singleArrow = singleSelected?.type === "arrow" ? singleSelected : null;
  if (selectedIds.length > 0) {
    const bbox = selectionBBox(elements, selectedIds);
    if (bbox) {
      const angle =
        selectedIds.length === 1
          ? (elements.find((e) => e.id === selectedIds[0])?.angle ?? 0)
          : 0;
      // Locked selection state determines outline color (dashed grey) and
      // gates handles + the lock badge.
      let locked = 0;
      let total = 0;
      for (const id of selectedIds) {
        const el = elements.find((e) => e.id === id);
        if (!el || el.isDeleted) continue;
        total += 1;
        if (el.isLocked) locked += 1;
      }
      const allLocked = total > 0 && locked === total;
      if (!singleArrow) {
        drawSelectionOutline(ctx, view, bbox, angle, allLocked);
        screenTransform();
        if (!allLocked) {
          drawHandles(ctx, view, bbox, angle, selectedIds.length === 1, theme);
        } else {
          drawLockBadge(ctx, view, bbox, angle);
        }
        worldTransform();
      } else if (allLocked) {
        // Single locked arrow: still show the lock badge near its bbox.
        screenTransform();
        drawLockBadge(ctx, view, bbox, angle);
        worldTransform();
      }
    }
  }

  // Binding-target highlight: only shown when an arrow endpoint is actively
  // approaching the shape. The shape's own stroke is the visual cue for the
  // binding zone otherwise.
  worldTransform();
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (!isShape(el)) continue;
    if (options.connectionTargetId !== el.id) continue;
    drawBindingHighlight(ctx, view, el, true);
  }
  screenTransform();

  // Arrow midpoint bend handle and endpoint handles (single arrow selected).
  if (selectedIds.length === 1) {
    const only = elements.find((e) => e.id === selectedIds[0]);
    if (only && only.type === "arrow" && !only.isDeleted) {
      drawArrowEndpoints(ctx, view, only, theme);
      drawBendHandle(ctx, view, only, theme);
    }
  }

  const guides = options.snapGuides ?? [];
  if (guides.length > 0) {
    screenTransform();
    drawSnapGuides(ctx, view, guides);
  }

  const trail = options.eraserTrail ?? [];
  if (trail.length >= 2) {
    screenTransform();
    drawEraserTrail(ctx, view, trail);
  }

  const laser = options.laserTrail ?? [];
  if (laser.length >= 2) {
    screenTransform();
    drawLaserTrail(ctx, view, laser);
  }

  if (options.polygonPreview) {
    screenTransform();
    drawPolygonPreview(
      ctx,
      view,
      options.polygonPreview.vertices,
      options.polygonPreview.edgeIds,
      elementsById,
    );
  }

  if (options.lineSnapTarget) {
    screenTransform();
    drawLineSnapTarget(ctx, view, options.lineSnapTarget);
  }
  worldTransform();
}

const LINE_SNAP_RING_RADIUS = 7;
const LINE_SNAP_RING_COLOR = "#22c55e";

function drawLineSnapTarget(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  world: { x: number; y: number },
): void {
  const p = worldToScreen(view, world.x, world.y);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = LINE_SNAP_RING_COLOR;
  ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, LINE_SNAP_RING_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Illuminates the in-flight closure feedback:
//   - Full cycle reachable: faint green fill over the polygon that would
//     close, plus a thick green outline tracing its perimeter.
//   - No full cycle yet: stroke each individual open line connected to the
//     start or snap node, so the user can see the chain they're building
//     piece by piece before it forms a closed shape.
// Drawn in screen space so the highlight stays visually constant regardless
// of zoom.
function drawPolygonPreview(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  vertices: readonly [number, number][],
  edgeIds: readonly string[],
  elementsById: Map<string, ScribblyElement>,
): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = LINE_SNAP_RING_COLOR;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (vertices.length >= 3) {
    const screenPts = vertices.map(([x, y]) => worldToScreen(view, x, y));
    ctx.beginPath();
    ctx.moveTo(screenPts[0]!.x, screenPts[0]!.y);
    for (let i = 1; i < screenPts.length; i++) {
      ctx.lineTo(screenPts[i]!.x, screenPts[i]!.y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
    ctx.fill();
    ctx.stroke();
  } else {
    for (const edgeId of edgeIds) {
      const el = elementsById.get(edgeId);
      if (!el || el.isDeleted || el.type !== "line") continue;
      if (el.points.length < 2) continue;
      ctx.beginPath();
      const first = worldToScreen(view, el.points[0]![0], el.points[0]![1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < el.points.length; i++) {
        const p = worldToScreen(view, el.points[i]![0], el.points[i]![1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawLaserTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: readonly LaserTrailPoint[],
): void {
  const now = Date.now();
  // Collect live points into a single polyline. Drawing per-segment with a
  // round cap produces visible "beads" where caps overlap; a single path
  // strokes as one clean line. The trail shortens naturally as the oldest
  // points age past the lifetime cutoff.
  const live: { x: number; y: number }[] = [];
  for (const p of trail) {
    if (now - p.t >= LASER_TRAIL_LIFETIME_MS) continue;
    const s = worldToScreen(view, p.x, p.y);
    live.push(s);
  }
  if (live.length < 2) return;
  const newest = trail[trail.length - 1]!;
  const headLife = 1 - (now - newest.t) / LASER_TRAIL_LIFETIME_MS;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(220, 38, 38, ${Math.max(headLife, 0)})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(live[0]!.x, live[0]!.y);
  for (let i = 1; i < live.length; i++) {
    ctx.lineTo(live[i]!.x, live[i]!.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawEraserTrail(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  trail: readonly EraserTrailPoint[],
): void {
  const now = Date.now();
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    const age = now - b.t;
    if (age >= ERASER_TRAIL_LIFETIME_MS) continue;
    const lifeT = 1 - age / ERASER_TRAIL_LIFETIME_MS;
    const alpha = 0.5 * lifeT;
    const width = 4 + 8 * lifeT;
    const sa = worldToScreen(view, a.x, a.y);
    const sb = worldToScreen(view, b.x, b.y);
    ctx.strokeStyle = `rgba(120, 130, 150, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
  ctx.restore();
}

const SNAP_GUIDE_COLOR = "#ef4444";

function drawSnapGuides(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  guides: readonly SnapGuide[],
): void {
  ctx.save();
  ctx.strokeStyle = SNAP_GUIDE_COLOR;
  ctx.fillStyle = SNAP_GUIDE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const padScreen = 16;
  const markerSize = 4;
  for (const g of guides) {
    if (g.axis === "x") {
      const pA = worldToScreen(view, g.line, g.a);
      const pB = worldToScreen(view, g.line, g.b);
      const lineX = pA.x;
      const yMin = Math.min(pA.y, pB.y) - padScreen;
      const yMax = Math.max(pA.y, pB.y) + padScreen;
      ctx.beginPath();
      ctx.moveTo(lineX, yMin);
      ctx.lineTo(lineX, yMax);
      ctx.stroke();
      drawSnapMarker(ctx, pA.x, pA.y, markerSize);
      drawSnapMarker(ctx, pB.x, pB.y, markerSize);
    } else {
      const pA = worldToScreen(view, g.a, g.line);
      const pB = worldToScreen(view, g.b, g.line);
      const lineY = pA.y;
      const xMin = Math.min(pA.x, pB.x) - padScreen;
      const xMax = Math.max(pA.x, pB.x) + padScreen;
      ctx.beginPath();
      ctx.moveTo(xMin, lineY);
      ctx.lineTo(xMax, lineY);
      ctx.stroke();
      drawSnapMarker(ctx, pA.x, pA.y, markerSize);
      drawSnapMarker(ctx, pB.x, pB.y, markerSize);
    }
  }
  ctx.restore();
}

function drawSnapMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
  ctx.restore();
}

function drawBindingHighlight(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  shape: ShapeElement,
  isTargeted: boolean,
): void {
  ctx.save();
  if (shape.angle) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(shape.angle);
    ctx.translate(-cx, -cy);
  }
  const pad = 4 / view.scale;
  ctx.lineWidth = (isTargeted ? 2 : 1.5) / view.scale;
  ctx.strokeStyle = isTargeted ? BINDING_HIGHLIGHT_COLOR : BINDING_HOVER_COLOR;
  if (!isTargeted) ctx.setLineDash([4 / view.scale, 4 / view.scale]);
  const x = shape.x - pad;
  const y = shape.y - pad;
  const w = shape.width + pad * 2;
  const h = shape.height + pad * 2;
  if (shape.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
  }
  ctx.restore();
}

function arrowBendCandidateWorld(arrow: ArrowElement): {
  x: number;
  y: number;
} | null {
  const polyline = arrowPolyline(arrow);
  if (polyline.length < 2) return null;
  if (arrow.bendPoint) {
    return { x: arrow.bendPoint[0], y: arrow.bendPoint[1] };
  }
  const a = polyline[0]!;
  const b = polyline[1]!;
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
}

function drawBendHandle(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  arrow: ArrowElement,
  theme: Theme,
): void {
  const world = arrowBendCandidateWorld(arrow);
  if (!world) return;
  const screen = worldToScreen(view, world.x, world.y);
  ctx.save();
  ctx.fillStyle = SELECTION_COLOR;
  ctx.strokeStyle = theme === "dark" ? HANDLE_FILL_DARK : HANDLE_FILL_LIGHT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, BEND_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawArrowEndpoints(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  arrow: ArrowElement,
  theme: Theme,
): void {
  if (arrow.points.length < 2) return;
  const startPt = arrow.points[0]!;
  const endPt = arrow.points[arrow.points.length - 1]!;
  const endpoints: { world: [number, number]; bound: boolean }[] = [
    { world: [startPt[0], startPt[1]], bound: !!arrow.startBinding },
    { world: [endPt[0], endPt[1]], bound: !!arrow.endBinding },
  ];
  const fill = theme === "dark" ? HANDLE_FILL_DARK : HANDLE_FILL_LIGHT;
  ctx.save();
  for (const ep of endpoints) {
    const s = worldToScreen(view, ep.world[0], ep.world[1]);
    if (ep.bound) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, ENDPOINT_BINDING_HALO_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(108, 117, 230, 0.35)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, ENDPOINT_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Used during drag-into-frame to highlight the candidate parent.
function drawFrameHighlight(
  ctx: CanvasRenderingContext2D,
  el: ScribblyElement,
): void {
  if (el.type !== "frame") return;
  ctx.save();
  ctx.strokeStyle = FRAME_OUTLINE_COLOR_HIGHLIGHT;
  ctx.lineWidth = 2;
  const r = Math.min(
    FRAME_CORNER_RADIUS,
    Math.max(0, Math.min(el.width, el.height) / 2),
  );
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.stroke();
  ctx.restore();
}

function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  box: BBox,
): void {
  ctx.save();
  ctx.lineWidth = 1 / view.scale;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.fillStyle = SELECTION_FILL;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  bbox: BBox,
  angle: number,
  locked: boolean = false,
): void {
  ctx.save();
  if (angle) {
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);
  }
  const pbox = expandedBBox(bbox, view);
  ctx.lineWidth = 1 / view.scale;
  ctx.strokeStyle = locked ? LOCKED_OUTLINE_COLOR : SELECTION_COLOR;
  if (locked) ctx.setLineDash([6 / view.scale, 4 / view.scale]);
  ctx.strokeRect(pbox.x, pbox.y, pbox.width, pbox.height);
  ctx.restore();
}

// Small closed-padlock icon drawn at the top-right of the selection bbox in
// SCREEN coordinates. Caller must already have applied screenTransform().
function drawLockBadge(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  bbox: BBox,
  angle: number,
): void {
  // Use the un-rotated bbox top-right corner for placement so the badge
  // always lands in a predictable screen position.
  const corner = {
    x: bbox.x + bbox.width,
    y: bbox.y,
  };
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
  const x = s.x + LOCK_BADGE_PAD;
  const y = s.y - LOCK_BADGE_PAD - LOCK_BADGE_SIZE;
  ctx.save();
  // Background pill so the icon stays legible against any element color.
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.strokeStyle = LOCKED_OUTLINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, LOCK_BADGE_SIZE, LOCK_BADGE_SIZE, 3);
  ctx.fill();
  ctx.stroke();
  // Padlock glyph (~10px tall centered inside).
  const bodyX = x + 4;
  const bodyY = y + 7;
  const bodyW = LOCK_BADGE_SIZE - 8;
  const bodyH = LOCK_BADGE_SIZE - 9;
  ctx.fillStyle = "#374151";
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 1.5);
  ctx.fill();
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x + LOCK_BADGE_SIZE / 2, bodyY, 2.3, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  bbox: BBox,
  angle: number,
  allowRotate: boolean,
  theme: Theme,
): void {
  const handles = handlePositions(bbox, view, angle);
  ctx.save();
  ctx.fillStyle = theme === "dark" ? HANDLE_FILL_DARK : HANDLE_FILL_LIGHT;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  const names: HandleName[] = ["nw", "ne", "se", "sw"];
  const radius = 2;
  for (const name of names) {
    const w = handles[name];
    const s = worldToScreen(view, w.x, w.y);
    const x = s.x - HANDLE_SIZE / 2;
    const y = s.y - HANDLE_SIZE / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, HANDLE_SIZE, HANDLE_SIZE, radius);
    ctx.fill();
    ctx.stroke();
  }
  if (allowRotate) {
    const rotateWorld = handles.rotate;
    const rotateScreen = worldToScreen(view, rotateWorld.x, rotateWorld.y);
    ctx.beginPath();
    ctx.arc(rotateScreen.x, rotateScreen.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  screenW: number,
  screenH: number,
  theme: Theme,
): void {
  const worldLeft = -view.x / view.scale;
  const worldTop = -view.y / view.scale;
  const worldRight = (screenW - view.x) / view.scale;
  const worldBottom = (screenH - view.y) / view.scale;

  const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;

  ctx.strokeStyle = theme === "dark" ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  ctx.lineWidth = 1 / view.scale;
  ctx.beginPath();
  for (let x = startX; x <= worldRight; x += GRID_SIZE) {
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
  }
  for (let y = startY; y <= worldBottom; y += GRID_SIZE) {
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
  }
  ctx.stroke();
}
