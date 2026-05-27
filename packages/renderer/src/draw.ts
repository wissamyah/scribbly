import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Options as RoughOptions } from "roughjs/bin/core";

import { arrowMidpoint, arrowQuadraticControl } from "./math";
import { resolveFontColor, resolveStrokeColor, type Theme } from "./theme";
import type {
  ArrowElement,
  ArrowheadStyle,
  ElementPoint,
  EllipseElement,
  FrameElement,
  FreeDrawElement,
  ImageElement,
  LineElement,
  RectangleElement,
  ScribblyElement,
  TextElement,
} from "./types";

const ARROW_HEAD_LENGTH = 16;
const ARROW_HEAD_ANGLE = Math.PI / 6;

// ---------- Caches ----------

let cachedRoughCanvas: RoughCanvas | null = null;
let cachedFor: HTMLCanvasElement | null = null;

export function getRoughCanvas(canvas: HTMLCanvasElement): RoughCanvas {
  if (cachedRoughCanvas && cachedFor === canvas) return cachedRoughCanvas;
  cachedRoughCanvas = rough.canvas(canvas);
  cachedFor = canvas;
  return cachedRoughCanvas;
}

// Image cache for image-element rendering. Lives here because drawElement
// dispatches to drawImage, but is only meaningful in environments that have
// a global Image constructor (browsers). Server-side preview rendering
// skips image elements (the marketplace validator rejects them anyway).
const imageCache = new Map<
  string,
  { img: HTMLImageElement; ready: boolean }
>();

let imageReadyNotifier: (() => void) | null = null;

export function setImageReadyNotifier(fn: (() => void) | null): void {
  imageReadyNotifier = fn;
}

function getImage(dataUrl: string): HTMLImageElement | null {
  if (!dataUrl) return null;
  if (typeof Image === "undefined") return null;
  const hit = imageCache.get(dataUrl);
  if (hit) return hit.ready ? hit.img : null;
  const img = new Image();
  const entry = { img, ready: false };
  imageCache.set(dataUrl, entry);
  img.onload = () => {
    entry.ready = true;
    imageReadyNotifier?.();
  };
  img.onerror = () => {
    imageCache.delete(dataUrl);
  };
  img.src = dataUrl;
  return null;
}

// ---------- Rough.js option builders ----------

function strokeDashFor(
  style: string,
  strokeWidth: number,
): number[] | undefined {
  switch (style) {
    case "dashed":
      return [strokeWidth * 4, strokeWidth * 4];
    case "dotted":
      return [strokeWidth, strokeWidth * 2];
    default:
      return undefined;
  }
}

function strokeOptions(
  el: {
    seed: number;
    strokeColor: string;
    strokeWidth: number;
    strokeStyle: string;
    roughness: number;
  },
  theme: Theme,
): RoughOptions {
  const dash = strokeDashFor(el.strokeStyle, el.strokeWidth);
  const resolved =
    el.strokeColor === "transparent"
      ? "rgba(0,0,0,0)"
      : resolveStrokeColor(el.strokeColor, theme);
  const opts: RoughOptions = {
    seed: el.seed,
    stroke: resolved,
    strokeWidth: el.strokeWidth,
    roughness: el.roughness,
  };
  if (dash) {
    opts.strokeLineDash = dash;
    // Rough's double-stroke makes dashed/dotted noisy — disable it.
    opts.disableMultiStroke = true;
  }
  return opts;
}

function fillOptions(el: {
  backgroundColor: string;
  fillStyle: string;
}): Partial<RoughOptions> {
  if (el.backgroundColor === "transparent" || el.fillStyle === "none") {
    return {};
  }
  return { fill: el.backgroundColor, fillStyle: el.fillStyle };
}

// ---------- Per-type primitives ----------

export function drawRectangle(
  rc: RoughCanvas,
  el: RectangleElement,
  theme: Theme,
): void {
  const opts = { ...strokeOptions(el, theme), ...fillOptions(el) };
  const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
  if (r <= 0 || el.width <= 0 || el.height <= 0) {
    rc.rectangle(el.x, el.y, el.width, el.height, opts);
    return;
  }
  const { x, y, width: w, height: h } = el;
  const d =
    `M ${x + r} ${y} ` +
    `H ${x + w - r} ` +
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
    `V ${y + h - r} ` +
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
    `H ${x + r} ` +
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
    `V ${y + r} ` +
    `A ${r} ${r} 0 0 1 ${x + r} ${y} ` +
    `Z`;
  rc.path(d, opts);
}

export function drawEllipse(
  rc: RoughCanvas,
  el: EllipseElement,
  theme: Theme,
): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  rc.ellipse(cx, cy, el.width, el.height, {
    ...strokeOptions(el, theme),
    ...fillOptions(el),
  });
}

export function drawLine(
  rc: RoughCanvas,
  el: LineElement,
  theme: Theme,
): void {
  if (el.points.length < 2) return;
  const opts = strokeOptions(el, theme);
  for (let i = 0; i < el.points.length - 1; i++) {
    const a = el.points[i];
    const b = el.points[i + 1];
    if (!a || !b) continue;
    rc.line(a[0], a[1], b[0], b[1], opts);
  }
}

function drawArrowhead(
  rc: RoughCanvas,
  el: ArrowElement,
  tip: ElementPoint,
  tail: ElementPoint,
  style: ArrowheadStyle,
  opts: RoughOptions,
  theme: Theme,
): void {
  if (style === "none") return;
  const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
  const len = ARROW_HEAD_LENGTH;
  const fillOpts: RoughOptions = {
    ...opts,
    fill: resolveStrokeColor(el.strokeColor, theme),
    fillStyle: "solid",
  };
  switch (style) {
    case "arrow": {
      const x1 = tip[0] - len * Math.cos(angle - ARROW_HEAD_ANGLE);
      const y1 = tip[1] - len * Math.sin(angle - ARROW_HEAD_ANGLE);
      const x2 = tip[0] - len * Math.cos(angle + ARROW_HEAD_ANGLE);
      const y2 = tip[1] - len * Math.sin(angle + ARROW_HEAD_ANGLE);
      rc.line(tip[0], tip[1], x1, y1, opts);
      rc.line(tip[0], tip[1], x2, y2, opts);
      return;
    }
    case "triangle": {
      const x1 = tip[0] - len * Math.cos(angle - ARROW_HEAD_ANGLE);
      const y1 = tip[1] - len * Math.sin(angle - ARROW_HEAD_ANGLE);
      const x2 = tip[0] - len * Math.cos(angle + ARROW_HEAD_ANGLE);
      const y2 = tip[1] - len * Math.sin(angle + ARROW_HEAD_ANGLE);
      rc.polygon(
        [
          [tip[0], tip[1]],
          [x1, y1],
          [x2, y2],
        ],
        fillOpts,
      );
      return;
    }
    case "diamond": {
      // Tip → side → back → side, all along the arrow axis.
      const half = len * 0.5;
      const back = len;
      const bx = tip[0] - back * Math.cos(angle);
      const by = tip[1] - back * Math.sin(angle);
      const midX = tip[0] - (back / 2) * Math.cos(angle);
      const midY = tip[1] - (back / 2) * Math.sin(angle);
      const sx1 = midX + half * Math.cos(angle - Math.PI / 2);
      const sy1 = midY + half * Math.sin(angle - Math.PI / 2);
      const sx2 = midX + half * Math.cos(angle + Math.PI / 2);
      const sy2 = midY + half * Math.sin(angle + Math.PI / 2);
      rc.polygon(
        [
          [tip[0], tip[1]],
          [sx1, sy1],
          [bx, by],
          [sx2, sy2],
        ],
        fillOpts,
      );
      return;
    }
    case "dot": {
      const radius = len * 0.35;
      rc.circle(tip[0], tip[1], radius * 2, fillOpts);
      return;
    }
    case "bar": {
      const half = len * 0.55;
      const x1 = tip[0] + half * Math.cos(angle - Math.PI / 2);
      const y1 = tip[1] + half * Math.sin(angle - Math.PI / 2);
      const x2 = tip[0] + half * Math.cos(angle + Math.PI / 2);
      const y2 = tip[1] + half * Math.sin(angle + Math.PI / 2);
      rc.line(x1, y1, x2, y2, opts);
      return;
    }
  }
}

export function drawArrow(
  rc: RoughCanvas,
  el: ArrowElement,
  theme: Theme,
): void {
  if (el.points.length < 2) return;
  const opts = strokeOptions(el, theme);
  const start = el.points[0]!;
  const end = el.points[el.points.length - 1]!;
  let endTail: ElementPoint;
  let startTail: ElementPoint;
  if (el.bendPoint) {
    const ctrl = arrowQuadraticControl(start, el.bendPoint, end);
    rc.path(
      `M ${start[0]} ${start[1]} Q ${ctrl[0]} ${ctrl[1]} ${end[0]} ${end[1]}`,
      opts,
    );
    endTail = [ctrl[0], ctrl[1]];
    startTail = [ctrl[0], ctrl[1]];
  } else {
    rc.line(start[0], start[1], end[0], end[1], opts);
    endTail = start;
    startTail = end;
  }
  drawArrowhead(rc, el, end, endTail, el.endArrowhead, opts, theme);
  drawArrowhead(rc, el, start, startTail, el.startArrowhead, opts, theme);
}

export function drawFreeDraw(
  rc: RoughCanvas,
  el: FreeDrawElement,
  theme: Theme,
): void {
  if (el.points.length < 2) return;
  const opts: RoughOptions = {
    ...strokeOptions(el, theme),
    roughness: 0,
    disableMultiStroke: true,
  };
  const pts = el.points.map(([x, y]) => [x, y] as [number, number]);
  rc.curve(pts, opts);
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  theme: Theme,
): void {
  ctx.font = `${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = resolveFontColor(el.fontColor, theme);
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign as CanvasTextAlign;
  const lines = el.text.split("\n");
  const lineHeight = el.fontSize * 1.2;
  let anchorX = el.x;
  if (el.textAlign === "center") anchorX = el.x + el.width / 2;
  else if (el.textAlign === "right") anchorX = el.x + el.width;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    ctx.fillText(line, anchorX, el.y + i * lineHeight);
  }
}

const CONTAINER_TEXT_PADDING = 8;

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      out.push("");
      continue;
    }
    const words = rawLine.split(/(\s+)/);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width <= maxWidth || line.length === 0) {
        line = candidate;
      } else {
        out.push(line.replace(/\s+$/, ""));
        line = word.replace(/^\s+/, "");
      }
      if (ctx.measureText(line).width > maxWidth && line.length > 1) {
        // Single token exceeds width — hard-break by characters.
        let buf = "";
        for (const ch of line) {
          if (ctx.measureText(buf + ch).width > maxWidth && buf.length > 0) {
            out.push(buf);
            buf = ch;
          } else {
            buf += ch;
          }
        }
        line = buf;
      }
    }
    out.push(line);
  }
  return out;
}

export function drawContainerText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  container: ScribblyElement,
  theme: Theme,
): void {
  ctx.font = `${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = resolveFontColor(el.fontColor, theme);
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign as CanvasTextAlign;
  const maxWidth = Math.max(
    0,
    container.width - CONTAINER_TEXT_PADDING * 2,
  );
  const lines = wrapText(ctx, el.text, maxWidth);
  const lineHeight = el.fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  let anchorX: number;
  if (el.textAlign === "left") {
    anchorX = container.x + CONTAINER_TEXT_PADDING;
  } else if (el.textAlign === "right") {
    anchorX = container.x + container.width - CONTAINER_TEXT_PADDING;
  } else {
    anchorX = container.x + container.width / 2;
  }
  const valign = el.verticalAlign ?? "middle";
  const startY =
    valign === "top"
      ? container.y + CONTAINER_TEXT_PADDING
      : valign === "bottom"
        ? container.y + container.height - CONTAINER_TEXT_PADDING - totalHeight
        : container.y + (container.height - totalHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    ctx.fillText(line, anchorX, startY + i * lineHeight);
  }
}

const ARROW_LABEL_PADDING_X = 6;
const ARROW_LABEL_PADDING_Y = 2;

export function drawArrowText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  arrow: ArrowElement,
  theme: Theme,
  background: string | null,
): void {
  const mid = arrowMidpoint(arrow);
  if (!mid) return;
  ctx.font = `${el.fontSize}px ${el.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const lines = el.text.split("\n");
  const lineHeight = el.fontSize * 1.2;
  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }
  const boxW = maxWidth + ARROW_LABEL_PADDING_X * 2;
  const boxH = lines.length * lineHeight + ARROW_LABEL_PADDING_Y * 2;
  // Mask the arrow stroke behind the label so the text stays readable. Fall
  // back to a translucent plate when the canvas background isn't a solid
  // color we can match.
  if (background && background !== "transparent") {
    ctx.fillStyle = background;
  } else {
    ctx.fillStyle =
      theme === "dark" ? "rgba(18, 18, 18, 0.92)" : "rgba(255, 255, 255, 0.92)";
  }
  ctx.fillRect(mid[0] - boxW / 2, mid[1] - boxH / 2, boxW, boxH);
  ctx.fillStyle = resolveFontColor(el.fontColor, theme);
  const topY = mid[1] - (lines.length * lineHeight) / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    ctx.fillText(line, mid[0], topY + i * lineHeight);
  }
}

export function drawImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
): void {
  const img = getImage(el.dataUrl);
  const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
  if (img) {
    try {
      if (r > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.width, el.height, r);
        ctx.clip();
        ctx.drawImage(img, el.x, el.y, el.width, el.height);
        ctx.restore();
      } else {
        ctx.drawImage(img, el.x, el.y, el.width, el.height);
      }
      return;
    } catch {
      // fall through to placeholder
    }
  }
  ctx.save();
  ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
  ctx.strokeStyle = "rgba(100, 116, 139, 0.7)";
  ctx.lineWidth = 1;
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.width, el.height, r);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeRect(el.x, el.y, el.width, el.height);
  }
  ctx.restore();
}

const FRAME_OUTLINE_COLOR = "#bbbbbb";
const FRAME_NAME_COLOR = "#9ca3af";
const FRAME_CORNER_RADIUS = 8;
const FRAME_NAME_FONT_SIZE = 14;
const FRAME_NAME_OFFSET = 6;

export function frameDisplayName(
  el: FrameElement,
  elementsById?: Map<string, ScribblyElement>,
): string {
  if (el.name && el.name.length > 0) return el.name;
  if (!elementsById) return "Frame";
  // Stable placeholder: index among non-deleted frames sharing the same room,
  // sorted by zIndex (which mirrors visual stacking). Two clients viewing the
  // same scene see the same numbering.
  const frames: FrameElement[] = [];
  for (const other of elementsById.values()) {
    if (other.isDeleted) continue;
    if (other.type !== "frame") continue;
    if (other.roomId !== el.roomId) continue;
    frames.push(other);
  }
  frames.sort((a, b) =>
    a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.id < b.id ? -1 : 1,
  );
  const idx = frames.findIndex((f) => f.id === el.id);
  return `Frame ${idx >= 0 ? idx + 1 : "?"}`;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  el: FrameElement,
  elementsById?: Map<string, ScribblyElement>,
  hideName: boolean = false,
): void {
  ctx.save();
  ctx.strokeStyle = FRAME_OUTLINE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "transparent";
  // Clamp the corner radius so very small frames don't pinch.
  const r = Math.min(
    FRAME_CORNER_RADIUS,
    Math.max(0, Math.min(el.width, el.height) / 2),
  );
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, r);
  ctx.stroke();
  if (!hideName) {
    ctx.fillStyle = FRAME_NAME_COLOR;
    ctx.font = `${FRAME_NAME_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(
      frameDisplayName(el, elementsById),
      el.x,
      el.y - FRAME_NAME_OFFSET,
    );
  }
  ctx.restore();
}

// ---------- Dispatcher ----------

export function drawElement(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  el: ScribblyElement,
  opacityMultiplier: number = 1,
  elementsById?: Map<string, ScribblyElement>,
  theme: Theme = "light",
  editingFrameNameId: string | null = null,
  background: string | null = null,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity * opacityMultiplier;
  // Bound text inherits its container's rotation so it always sits with the
  // container. Arrow labels share this: the midpoint is computed in the
  // arrow's un-rotated frame, so applying the arrow's rotation around its
  // bbox center lands the label correctly on screen.
  let angle = el.angle;
  let pivotX = el.x + el.width / 2;
  let pivotY = el.y + el.height / 2;
  const boundContainer =
    el.type === "text" && el.containerId && elementsById
      ? elementsById.get(el.containerId)
      : null;
  const arrowContainer =
    boundContainer && boundContainer.type === "arrow" ? boundContainer : null;
  if (boundContainer && !boundContainer.isDeleted) {
    angle = boundContainer.angle;
    pivotX = boundContainer.x + boundContainer.width / 2;
    pivotY = boundContainer.y + boundContainer.height / 2;
  }
  if (angle) {
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    ctx.translate(-pivotX, -pivotY);
  }
  switch (el.type) {
    case "rectangle":
      drawRectangle(rc, el, theme);
      break;
    case "ellipse":
      drawEllipse(rc, el, theme);
      break;
    case "line":
      drawLine(rc, el, theme);
      break;
    case "arrow":
      drawArrow(rc, el, theme);
      break;
    case "freedraw":
      drawFreeDraw(rc, el, theme);
      break;
    case "text": {
      if (arrowContainer) {
        drawArrowText(ctx, el, arrowContainer, theme, background);
      } else if (boundContainer && !boundContainer.isDeleted) {
        drawContainerText(ctx, el, boundContainer, theme);
      } else {
        drawText(ctx, el, theme);
      }
      break;
    }
    case "image":
      drawImage(ctx, el);
      break;
    case "frame":
      drawFrame(ctx, el, elementsById, editingFrameNameId === el.id);
      break;
  }
  ctx.restore();
}
