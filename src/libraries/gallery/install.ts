import { importLibraryFromFile } from "../importLibrary";
import type { GalleryLibrary } from "./types";

export type InstallInput = {
  entry: GalleryLibrary;
  // Where the installed copy lands: under the signed-in account (userId) or
  // the anonymous ownerKey. Both are passed; importLibraryFromFile prefers
  // userId when present.
  ownerKey: string;
  userId: string | null;
  // Visible name for the installed library; defaults to the entry name.
  displayName?: string;
};

// Install a gallery library into the user's personal libraries. The full
// payload already lives in the entry, so this is a pure DB clone — no
// network fetch, no SHA verification. `sourceSlug`/`sourceVersion` are
// stored so the Browse tab can later show an "Update available" badge.
export function installFromGallery(input: InstallInput): string {
  const { entry, ownerKey, userId } = input;
  return importLibraryFromFile(entry.payload, {
    ownerKey,
    userId: userId ?? undefined,
    defaultName: input.displayName ?? entry.name,
    sourceSlug: entry.slug,
    sourceVersion: String(entry.version),
  });
}
