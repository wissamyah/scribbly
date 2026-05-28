import { id } from "@instantdb/react";
import { db } from "../../db/instant";
import { buildLibraryFile } from "../exportLibrary";
import { renderItemPreview } from "../preview";
import type { LibraryItem, ScribblyLibrary } from "../types";
import { generateGallerySlug } from "./slug";
import type { PublishMeta } from "./types";

function coverFor(items: readonly LibraryItem[]): string {
  const first = items[0];
  if (!first) return "";
  return first.preview || renderItemPreview(first.elements);
}

export type PublishInput = {
  userId: string;
  library: ScribblyLibrary;
  items: readonly LibraryItem[];
  meta: PublishMeta;
};

// Submit a personal library to the gallery as a new `pending` entry, owned
// by the signed-in user. The full .scribblylib payload is embedded so
// install needs no extra fetch.
export function publishLibrary(input: PublishInput): string {
  const { userId, library, items, meta } = input;
  const galleryId = id();
  const now = Date.now();
  db.transact(
    db.tx.galleryLibraries[galleryId]!.update({
      ownerId: userId,
      slug: generateGallerySlug(meta.name),
      name: meta.name,
      description: meta.description,
      tags: meta.tags,
      license: meta.license,
      authorHandle: meta.authorHandle,
      itemCount: items.length,
      coverPreview: coverFor(items),
      payload: buildLibraryFile(library, items),
      status: "pending",
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return galleryId;
}

export type UpdateSubmissionMetaInput = {
  galleryId: string;
  currentVersion: number;
  meta: PublishMeta;
};

// Edit an existing submission's metadata (name/description/tags/license/
// author). The stored payload, cover, and itemCount are left untouched —
// editing metadata doesn't require the source personal library to be present
// on this device. Bumps the version and resets to `pending` for re-review.
// (To change the actual items, unpublish and resubmit from My libraries.)
export function updateSubmissionMeta(input: UpdateSubmissionMetaInput): void {
  const { galleryId, currentVersion, meta } = input;
  db.transact(
    db.tx.galleryLibraries[galleryId]!.update({
      name: meta.name,
      description: meta.description,
      tags: meta.tags,
      license: meta.license,
      authorHandle: meta.authorHandle,
      status: "pending",
      version: currentVersion + 1,
      updatedAt: Date.now(),
    }),
  );
}

// Remove a submission entirely (owner or admin). Used by "Unpublish".
export function unpublish(galleryId: string): void {
  db.transact(db.tx.galleryLibraries[galleryId]!.delete());
}
