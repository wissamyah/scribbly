import { db } from "../../db/instant";
import type { GalleryLibrary } from "./types";

export type UseGalleryResult = {
  libraries: GalleryLibrary[];
  isLoading: boolean;
  error: string | null;
};

// Public gallery: published entries only (the view permission also filters
// server-side, so anonymous users never receive pending/rejected rows).
export function useGallery(): UseGalleryResult {
  const { data, isLoading, error } = db.useQuery({
    galleryLibraries: { $: { where: { status: "published" } } },
  });
  const rows = (data?.galleryLibraries ?? []) as GalleryLibrary[];
  const sorted = [...rows].sort(
    (a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt),
  );
  return {
    libraries: sorted,
    isLoading,
    error: error ? (error.message ?? "Could not load gallery") : null,
  };
}

export type GalleryFilter = {
  search?: string;
  license?: string;
  tag?: string;
};

export function filterGallery(
  entries: readonly GalleryLibrary[],
  f: GalleryFilter,
): GalleryLibrary[] {
  const search = f.search?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (f.license && e.license !== f.license) return false;
    if (f.tag && !e.tags.includes(f.tag)) return false;
    if (
      search &&
      !(
        e.name.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search) ||
        e.authorHandle.toLowerCase().includes(search) ||
        e.tags.some((t) => t.toLowerCase().includes(search))
      )
    ) {
      return false;
    }
    return true;
  });
}
