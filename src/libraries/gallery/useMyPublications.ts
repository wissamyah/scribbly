import { db } from "../../db/instant";
import type { GalleryLibrary } from "./types";

export type UseMyPublicationsResult = {
  publications: GalleryLibrary[];
  isLoading: boolean;
};

// The signed-in user's own gallery entries, any status (pending / published
// / rejected). View permission lets owners see their own non-published rows.
export function useMyPublications(
  userId: string | null,
): UseMyPublicationsResult {
  const { data, isLoading } = db.useQuery(
    userId
      ? { galleryLibraries: { $: { where: { ownerId: userId } } } }
      : null,
  );
  const rows = (data?.galleryLibraries ?? []) as GalleryLibrary[];
  const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  return { publications: sorted, isLoading: userId ? isLoading : false };
}
