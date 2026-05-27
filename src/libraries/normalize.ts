import { id } from "@instantdb/react";
import { elementsBounds } from "@scribbly/renderer";
import type { Point, ScribblyElement } from "../canvas/elements";

export { elementsBounds };
export type { Bounds as ElementsBounds } from "@scribbly/renderer";

function shiftPoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map(([px, py]) => [px + dx, py + dy] as Point);
}

function shiftPoint(p: Point, dx: number, dy: number): Point {
  return [p[0] + dx, p[1] + dy] as Point;
}

function offsetElement(
  el: ScribblyElement,
  dx: number,
  dy: number,
): ScribblyElement {
  const base = { ...el, x: el.x + dx, y: el.y + dy };
  if (el.type === "arrow") {
    return {
      ...base,
      type: "arrow",
      points: shiftPoints(el.points, dx, dy),
      bendPoint: el.bendPoint ? shiftPoint(el.bendPoint, dx, dy) : null,
    } as ScribblyElement;
  }
  if (el.type === "line" || el.type === "freedraw") {
    return {
      ...base,
      points: shiftPoints(el.points, dx, dy),
    } as ScribblyElement;
  }
  return base;
}

/**
 * Strip per-room provenance from a set of selected elements and re-anchor
 * the group to (0, 0). Returns a self-contained snapshot suitable for
 * storing as a library item.
 *
 * Element ids and group ids are preserved here so that later inserts can
 * re-map them via a single id table; the public insert flow assigns fresh
 * ids + seeds before writing back.
 */
export function normalizeForLibrary(
  elements: readonly ScribblyElement[],
): ScribblyElement[] {
  if (elements.length === 0) return [];
  const bounds = elementsBounds(elements);
  const dx = -bounds.x;
  const dy = -bounds.y;
  return elements.map((el) => {
    const shifted = offsetElement(el, dx, dy);
    return {
      ...shifted,
      roomId: "",
      frameId: null,
      version: 0,
      updatedAt: 0,
      isDeleted: false,
    };
  });
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Produce a fresh copy of `elements` ready to be inserted into a room:
 * - new id per element (remapped through `idMap` so cross-element refs survive)
 * - new groupId per source group (so two drops produce distinct groups)
 * - new seed (different roughness jitter on each drop)
 * - offset to `drop` (world coords), measured from the item's top-left
 * - rebind arrow start/end bindings through `idMap` when the bound element
 *   is part of the same item; otherwise the binding is dropped
 * - roomId stamped to the current room
 */
export function cloneItemForInsert(
  elements: readonly ScribblyElement[],
  roomId: string,
  drop: { x: number; y: number },
): ScribblyElement[] {
  if (elements.length === 0) return [];

  const bounds = elementsBounds(elements);
  const dx = drop.x - bounds.x;
  const dy = drop.y - bounds.y;

  const idMap = new Map<string, string>();
  for (const el of elements) idMap.set(el.id, id());

  const groupMap = new Map<string, string>();
  for (const el of elements) {
    if (el.groupId && !groupMap.has(el.groupId)) {
      groupMap.set(el.groupId, id());
    }
  }

  const now = Date.now();
  return elements.map((src) => {
    const shifted = offsetElement(src, dx, dy);
    const remapped: ScribblyElement = {
      ...shifted,
      id: idMap.get(src.id)!,
      roomId,
      seed: newSeed(),
      groupId: src.groupId ? (groupMap.get(src.groupId) ?? null) : null,
      frameId: null,
      version: now,
      updatedAt: now,
      isDeleted: false,
    };
    if (remapped.type === "arrow") {
      const start = remapped.startBinding;
      const end = remapped.endBinding;
      return {
        ...remapped,
        startBinding:
          start && idMap.has(start.elementId)
            ? { ...start, elementId: idMap.get(start.elementId)! }
            : null,
        endBinding:
          end && idMap.has(end.elementId)
            ? { ...end, elementId: idMap.get(end.elementId)! }
            : null,
      };
    }
    if (remapped.type === "text" && remapped.containerId) {
      const newContainerId = idMap.get(remapped.containerId);
      return {
        ...remapped,
        containerId: newContainerId ?? null,
      };
    }
    return remapped;
  });
}
