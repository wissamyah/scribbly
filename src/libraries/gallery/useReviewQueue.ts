import { db } from "../../db/instant";
import type { GalleryLibrary, GalleryReport } from "./types";

// Admin-only: pending submissions awaiting review. `enabled` is the client
// isAdminEmail() check; the perms layer is the real gate, so a non-admin
// who forced this on would still receive nothing.
export function useReviewQueue(enabled: boolean): {
  pending: GalleryLibrary[];
  isLoading: boolean;
} {
  const { data, isLoading } = db.useQuery(
    enabled
      ? { galleryLibraries: { $: { where: { status: "pending" } } } }
      : null,
  );
  const rows = (data?.galleryLibraries ?? []) as GalleryLibrary[];
  const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  return { pending: sorted, isLoading: enabled ? isLoading : false };
}

// Admin-only: unresolved reports inbox.
export function useReports(enabled: boolean): {
  reports: GalleryReport[];
  isLoading: boolean;
} {
  const { data, isLoading } = db.useQuery(
    enabled
      ? { galleryReports: { $: { where: { resolved: false } } } }
      : null,
  );
  const rows = (data?.galleryReports ?? []) as GalleryReport[];
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  return { reports: sorted, isLoading: enabled ? isLoading : false };
}
