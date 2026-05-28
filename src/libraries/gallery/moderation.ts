import { db } from "../../db/instant";

// Admin actions. Enforced server-side by instant.perms.ts (only admins can
// set `status`/`publishedAt`); these helpers are just the transacts.

export function approvePublication(galleryId: string): void {
  const now = Date.now();
  db.transact(
    db.tx.galleryLibraries[galleryId]!.update({
      status: "published",
      publishedAt: now,
      updatedAt: now,
    }),
  );
}

export function rejectPublication(galleryId: string, note: string): void {
  db.transact(
    db.tx.galleryLibraries[galleryId]!.update({
      status: "rejected",
      rejectionNote: note,
      updatedAt: Date.now(),
    }),
  );
}

export function resolveReport(reportId: string): void {
  db.transact(db.tx.galleryReports[reportId]!.update({ resolved: true }));
}

export function deleteReport(reportId: string): void {
  db.transact(db.tx.galleryReports[reportId]!.delete());
}
