import { cloneItemForInsert } from "./normalize";
import type { LibraryItem } from "./types";
import type { ScribblyElement } from "../canvas/elements";

export type InsertItemInput = {
  item: LibraryItem;
  roomId: string;
  drop: { x: number; y: number };
};

/**
 * Produce a fresh set of canvas elements (with new ids + seeds and
 * remapped bindings/groupIds) ready to be added to the current room.
 * Caller writes them via `addElements` + `dbWriteElements`.
 */
export function buildInsertElements(input: InsertItemInput): ScribblyElement[] {
  return cloneItemForInsert(input.item.elements, input.roomId, input.drop);
}
