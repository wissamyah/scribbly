import { useEffect } from "react";
import debounce from "lodash.debounce";
import {
  ARROWHEAD_STYLES,
  STROKE_STYLES,
  type ArrowheadStyle,
  type Binding,
  type ScribblyElement,
  type FillStyle,
  type Point,
  type StrokeStyle,
  type TextAlign,
  type VerticalAlign,
} from "../canvas/elements";
import { decryptJSON } from "../crypto/aead";
import { useAppState } from "../store/appState";
import { db } from "./instant";
import { dbWriteElements } from "./mutations";

type ElementRow = {
  id: string;
  roomId?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  points?: unknown;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  textAlign?: string;
  verticalAlign?: string;
  seed?: number;
  version?: number;
  isDeleted?: boolean;
  updatedAt?: number;
  bendPoint?: unknown;
  startBinding?: unknown;
  endBinding?: unknown;
  zIndex?: number;
  cornerRadius?: number;
  groupId?: string;
  isLocked?: boolean;
  frameId?: string;
  name?: string;
  startArrowhead?: string;
  endArrowhead?: string;
  containerId?: string;
  closed?: boolean;
  ciphertext?: string;
  iv?: string;
};

function parsePoint(value: unknown): Point | null {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [value[0], value[1]] as Point;
  }
  return null;
}

function parseBinding(value: unknown): Binding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { elementId?: unknown; focus?: unknown };
  if (typeof v.elementId !== "string") return null;
  const focus = parsePoint(v.focus);
  return { elementId: v.elementId, focus };
}

function parseStrokeStyle(value: unknown): StrokeStyle {
  if (typeof value !== "string") return "solid";
  return STROKE_STYLES.includes(value as StrokeStyle)
    ? (value as StrokeStyle)
    : "solid";
}

function parseArrowhead(value: unknown, fallback: ArrowheadStyle): ArrowheadStyle {
  if (typeof value !== "string") return fallback;
  return ARROWHEAD_STYLES.includes(value as ArrowheadStyle)
    ? (value as ArrowheadStyle)
    : fallback;
}

function rowToElement(row: ElementRow): ScribblyElement | null {
  if (!row.id || !row.roomId || !row.type) return null;
  const base = {
    id: row.id,
    roomId: row.roomId,
    x: row.x ?? 0,
    y: row.y ?? 0,
    width: row.width ?? 0,
    height: row.height ?? 0,
    angle: row.angle ?? 0,
    strokeColor: row.strokeColor ?? "#1e1e1e",
    backgroundColor: row.backgroundColor ?? "transparent",
    fillStyle: (row.fillStyle ?? "hachure") as FillStyle,
    strokeWidth: row.strokeWidth ?? 1,
    strokeStyle: parseStrokeStyle(row.strokeStyle),
    roughness: row.roughness ?? 1,
    opacity: row.opacity ?? 1,
    seed: row.seed ?? 0,
    version: row.version ?? 0,
    isDeleted: row.isDeleted ?? false,
    isLocked: row.isLocked ?? false,
    updatedAt: row.updatedAt ?? 0,
    zIndex: row.zIndex ?? 0,
    groupId: row.groupId ? row.groupId : null,
    frameId: row.frameId ? row.frameId : null,
  };
  const points = Array.isArray(row.points) ? (row.points as Point[]) : [];
  switch (row.type) {
    case "rectangle":
      return {
        ...base,
        type: "rectangle",
        cornerRadius: row.cornerRadius ?? 0,
      };
    case "ellipse":
      return { ...base, type: "ellipse" };
    case "line":
      return { ...base, type: "line", points, closed: row.closed ?? false };
    case "arrow":
      return {
        ...base,
        type: "arrow",
        points,
        bendPoint: parsePoint(row.bendPoint),
        startBinding: parseBinding(row.startBinding),
        endBinding: parseBinding(row.endBinding),
        startArrowhead: parseArrowhead(row.startArrowhead, "none"),
        endArrowhead: parseArrowhead(row.endArrowhead, "arrow"),
      };
    case "freedraw":
      return { ...base, type: "freedraw", points };
    case "text":
      return {
        ...base,
        type: "text",
        text: row.text ?? "",
        fontSize: row.fontSize ?? 20,
        fontFamily: row.fontFamily ?? "Virgil, 'Comic Sans MS', cursive",
        // Pre-fontColor rows fall back to the element's stroke color so
        // existing text keeps its prior appearance.
        fontColor: row.fontColor && row.fontColor.length > 0
          ? row.fontColor
          : base.strokeColor,
        textAlign: (row.textAlign ?? "left") as TextAlign,
        verticalAlign: (row.verticalAlign ?? "middle") as VerticalAlign,
        containerId: row.containerId ? row.containerId : null,
      };
    case "image":
      return {
        ...base,
        type: "image",
        dataUrl: row.text ?? "",
        cornerRadius: row.cornerRadius ?? 0,
      };
    case "frame":
      return {
        ...base,
        type: "frame",
        name: row.name && row.name.length > 0 ? row.name : null,
      };
    default:
      return null;
  }
}

const FLUSH_WAIT_MS = 300;
const FLUSH_MAX_WAIT_MS = 1000;

const flushDirty = debounce(
  () => {
    const state = useAppState.getState();
    if (state.dirtyIds.size === 0) return;
    // E2E room with no key in hand — defer rather than drop, since the
    // key is loading asynchronously and will arrive any moment.
    if (state.roomEncrypted && !state.roomKey) {
      window.setTimeout(() => flushDirty(), 100);
      return;
    }
    const dirtyElements = state.elements.filter((el) =>
      state.dirtyIds.has(el.id),
    );
    if (dirtyElements.length > 0) {
      void dbWriteElements(dirtyElements);
    }
    state.clearDirty();
  },
  FLUSH_WAIT_MS,
  { maxWait: FLUSH_MAX_WAIT_MS },
);

let flushSubscribed = false;
function ensureFlushSubscription(): void {
  if (flushSubscribed) return;
  flushSubscribed = true;
  let prevDirty = useAppState.getState().dirtyIds;
  useAppState.subscribe((state) => {
    if (state.dirtyIds !== prevDirty) {
      prevDirty = state.dirtyIds;
      if (state.dirtyIds.size > 0) flushDirty();
    }
  });
}

async function decryptRow(
  row: ElementRow,
  key: CryptoKey,
): Promise<ScribblyElement | null> {
  if (!row.ciphertext || !row.iv) return null;
  try {
    const decoded = await decryptJSON<ScribblyElement>(key, {
      ciphertext: row.ciphertext,
      iv: row.iv,
    });
    // The DB row carries the authoritative version/zIndex/isDeleted (they
    // stay plaintext for filtering and sorting). Overlay them on top of
    // the decrypted payload so a peer that hasn't seen our latest write
    // doesn't roll us back.
    return {
      ...decoded,
      id: row.id,
      roomId: row.roomId ?? decoded.roomId,
      version: row.version ?? decoded.version,
      updatedAt: row.updatedAt ?? decoded.updatedAt,
      zIndex: row.zIndex ?? decoded.zIndex,
      isDeleted: row.isDeleted ?? decoded.isDeleted,
    };
  } catch {
    return null;
  }
}

export function useElementsSync(roomId: string): { isLoading: boolean } {
  ensureFlushSubscription();
  const { data, isLoading } = db.useQuery({
    elements: { $: { where: { roomId, isDeleted: false } } },
  });
  const roomKey = useAppState((s) => s.roomKey);
  const roomEncrypted = useAppState((s) => s.roomEncrypted);

  useEffect(() => {
    if (!data?.elements) return;
    // Encrypted room and we haven't loaded the key yet — wait. Avoids
    // showing the empty plaintext shell of zeroed rows during the brief
    // moment between the query landing and the key import resolving.
    if (roomEncrypted && !roomKey) return;

    let cancelled = false;
    (async () => {
      const rows = data.elements as ElementRow[];
      const elements: ScribblyElement[] = [];
      if (roomKey) {
        const decoded = await Promise.all(
          rows.map((row) => decryptRow(row, roomKey)),
        );
        if (cancelled) return;
        for (const el of decoded) if (el) elements.push(el);
      } else {
        for (const row of rows) {
          // Mixed-mode safety: if we encounter ciphertext in a plaintext
          // room, skip rather than render a blank zeroed element.
          if (row.ciphertext) continue;
          const el = rowToElement(row);
          if (el) elements.push(el);
        }
      }
      if (cancelled) return;
      useAppState.getState().setElements(elements);
    })();

    return () => {
      cancelled = true;
    };
  }, [data, roomKey, roomEncrypted]);

  return { isLoading };
}
