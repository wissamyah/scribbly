import { id } from "@instantdb/react";
import type { ScribblyElement } from "../canvas/elements";
import { db } from "../db/instant";
import { LIBRARY_SOURCE_URL } from "./types";

export type CreateLibraryInput = {
  ownerKey: string;
  // Auth uid when a signed-in user creates/installs the library. Stored so
  // the library follows the account across devices (queried by userId).
  userId?: string;
  name: string;
  isPublic?: boolean;
  source?: string;
  // Gallery provenance. Set when this library was installed from the
  // gallery; the "Update available" banner compares sourceVersion against
  // the gallery entry. Leave undefined for locally-authored libraries.
  sourceSlug?: string;
  sourceVersion?: string;
};

export function createLibrary(input: CreateLibraryInput): string {
  const libId = id();
  const now = Date.now();
  const payload: {
    ownerKey: string;
    userId?: string;
    name: string;
    isPublic: boolean;
    source: string;
    createdAt: number;
    updatedAt: number;
    sourceSlug?: string;
    sourceVersion?: string;
  } = {
    ownerKey: input.ownerKey,
    name: input.name,
    isPublic: input.isPublic ?? false,
    source: input.source ?? LIBRARY_SOURCE_URL,
    createdAt: now,
    updatedAt: now,
  };
  if (input.userId) payload.userId = input.userId;
  if (input.sourceSlug) payload.sourceSlug = input.sourceSlug;
  if (input.sourceVersion) payload.sourceVersion = input.sourceVersion;
  db.transact(db.tx.libraries[libId]!.update(payload));
  return libId;
}

export function renameLibrary(libraryId: string, name: string): void {
  db.transact(
    db.tx.libraries[libraryId]!.update({ name, updatedAt: Date.now() }),
  );
}

export function deleteLibrary(libraryId: string, itemIds: readonly string[]): void {
  const txs = [
    ...itemIds.map((iid) => db.tx.libraryItems[iid]!.delete()),
    db.tx.libraries[libraryId]!.delete(),
  ];
  db.transact(txs);
}

export type AddLibraryItemInput = {
  libraryId: string;
  name: string;
  elements: ScribblyElement[];
  preview: string;
};

export function addLibraryItem(input: AddLibraryItemInput): string {
  const itemId = id();
  const now = Date.now();
  db.transact([
    db.tx.libraryItems[itemId]!.update({
      libraryId: input.libraryId,
      name: input.name,
      elements: input.elements,
      preview: input.preview,
      createdAt: now,
    }),
    db.tx.libraries[input.libraryId]!.update({ updatedAt: now }),
  ]);
  return itemId;
}

export function renameLibraryItem(itemId: string, name: string): void {
  db.transact(db.tx.libraryItems[itemId]!.update({ name }));
}

export function deleteLibraryItem(itemId: string): void {
  db.transact(db.tx.libraryItems[itemId]!.delete());
}

export type AddImportedItemInput = {
  libraryId: string;
  name: string;
  elements: ScribblyElement[];
  preview: string;
  createdAt: number;
};

export function addImportedItems(
  inputs: readonly AddImportedItemInput[],
): void {
  if (inputs.length === 0) return;
  const now = Date.now();
  const itemTxs = inputs.map((input) =>
    db.tx.libraryItems[id()]!.update({
      libraryId: input.libraryId,
      name: input.name,
      elements: input.elements,
      preview: input.preview,
      createdAt: input.createdAt,
    }),
  );
  const libIds = Array.from(new Set(inputs.map((i) => i.libraryId)));
  const libTxs = libIds.map((lid) =>
    db.tx.libraries[lid]!.update({ updatedAt: now }),
  );
  db.transact([...itemTxs, ...libTxs]);
}
