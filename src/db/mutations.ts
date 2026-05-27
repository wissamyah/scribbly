import type { ScribblyElement } from "../canvas/elements";
import { encryptJSON } from "../crypto/aead";
import { useAppState } from "../store/appState";
import { db } from "./instant";

type ElementRow = {
  roomId: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  points: unknown;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  textAlign: string;
  verticalAlign: string;
  seed: number;
  version: number;
  isDeleted: boolean;
  updatedAt: number;
  bendPoint: unknown;
  startBinding: unknown;
  endBinding: unknown;
  zIndex: number;
  cornerRadius: number;
  groupId: string;
  isLocked: boolean;
  frameId: string;
  name: string;
  startArrowhead: string;
  endArrowhead: string;
  containerId: string;
  ciphertext: string;
  iv: string;
};

const EMPTY_SEMANTIC_FIELDS = {
  type: "",
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  strokeColor: "",
  backgroundColor: "",
  fillStyle: "",
  strokeWidth: 0,
  strokeStyle: "",
  roughness: 0,
  opacity: 0,
  points: [],
  text: "",
  fontSize: 0,
  fontFamily: "",
  fontColor: "",
  textAlign: "",
  verticalAlign: "",
  seed: 0,
  bendPoint: null,
  startBinding: null,
  endBinding: null,
  cornerRadius: 0,
  groupId: "",
  isLocked: false,
  frameId: "",
  name: "",
  startArrowhead: "",
  endArrowhead: "",
  containerId: "",
} as const;

function plainElementToRow(el: ScribblyElement): ElementRow {
  const isText = el.type === "text";
  const isArrow = el.type === "arrow";
  const isRect = el.type === "rectangle";
  const isImage = el.type === "image";
  const hasPoints =
    el.type === "line" || el.type === "arrow" || el.type === "freedraw";
  const textValue = isText ? el.text : isImage ? el.dataUrl : "";
  return {
    roomId: el.roomId,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    angle: el.angle,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    fillStyle: el.fillStyle,
    strokeWidth: el.strokeWidth,
    strokeStyle: el.strokeStyle,
    roughness: el.roughness,
    opacity: el.opacity,
    points: hasPoints ? el.points : [],
    text: textValue,
    fontSize: isText ? el.fontSize : 0,
    fontFamily: isText ? el.fontFamily : "",
    fontColor: isText ? el.fontColor : "",
    textAlign: isText ? el.textAlign : "left",
    verticalAlign: isText ? el.verticalAlign : "",
    seed: el.seed,
    version: el.version,
    isDeleted: el.isDeleted,
    updatedAt: el.updatedAt,
    bendPoint: isArrow ? el.bendPoint : null,
    startBinding: isArrow ? el.startBinding : null,
    endBinding: isArrow ? el.endBinding : null,
    zIndex: el.zIndex,
    cornerRadius: isRect || isImage ? el.cornerRadius : 0,
    groupId: el.groupId ?? "",
    isLocked: el.isLocked,
    frameId: el.frameId ?? "",
    name: el.type === "frame" ? (el.name ?? "") : "",
    startArrowhead: isArrow ? el.startArrowhead : "none",
    endArrowhead: isArrow ? el.endArrowhead : "none",
    containerId: isText ? (el.containerId ?? "") : "",
    ciphertext: "",
    iv: "",
  };
}

async function encryptedElementToRow(
  el: ScribblyElement,
  key: CryptoKey,
): Promise<ElementRow> {
  const sealed = await encryptJSON(key, el);
  return {
    ...EMPTY_SEMANTIC_FIELDS,
    roomId: el.roomId,
    version: el.version,
    isDeleted: el.isDeleted,
    updatedAt: el.updatedAt,
    zIndex: el.zIndex,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
  };
}

export async function dbWriteElements(
  elements: readonly ScribblyElement[],
): Promise<void> {
  if (elements.length === 0) return;
  const { roomKey, roomEncrypted } = useAppState.getState();

  // E2E room with no key in hand → we can't safely write (would corrupt
  // the room with plaintext writes mixed into ciphertext). Drop silently.
  if (roomEncrypted && !roomKey) return;

  const rows: ElementRow[] = roomKey
    ? await Promise.all(
        elements.map((el) => encryptedElementToRow(el, roomKey)),
      )
    : elements.map(plainElementToRow);

  const txs = rows.map((row, i) =>
    db.tx.elements[elements[i]!.id]!.update(row),
  );
  db.transact(txs);
}

export async function dbSoftDeleteElements(
  elements: readonly ScribblyElement[],
): Promise<void> {
  if (elements.length === 0) return;
  const now = Date.now();
  const tombstones = elements.map((el) => ({
    ...el,
    isDeleted: true,
    version: now,
    updatedAt: now,
  }));
  await dbWriteElements(tombstones);
}

// Soft-deleted rows are kept for a while so concurrent peers receive the
// tombstone and can't accidentally resurrect the element. After this
// retention window passes, the row is no longer load-bearing and can be
// permanently removed. 24h is well past any realistic peer round-trip and
// keeps DB usage low (image rows can be megabytes each).
export const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

const HARD_DELETE_CHUNK = 200;

export async function dbHardDeleteStaleTombstones(
  roomId: string,
  retentionMs: number = TOMBSTONE_RETENTION_MS,
): Promise<number> {
  const cutoff = Date.now() - retentionMs;
  const result = await db.queryOnce({
    elements: { $: { where: { roomId, isDeleted: true } } },
  });
  const rows = (result.data?.elements ?? []) as Array<{
    id: string;
    updatedAt?: number;
  }>;
  const staleIds = rows
    .filter((r) => typeof r.updatedAt === "number" && r.updatedAt < cutoff)
    .map((r) => r.id);
  if (staleIds.length === 0) return 0;

  for (let i = 0; i < staleIds.length; i += HARD_DELETE_CHUNK) {
    const chunk = staleIds.slice(i, i + HARD_DELETE_CHUNK);
    await db.transact(chunk.map((id) => db.tx.elements[id]!.delete()));
  }
  return staleIds.length;
}
