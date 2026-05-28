import { id } from "@instantdb/react";
import { db } from "../../db/instant";

export type ReportInput = {
  userId: string;
  librarySlug: string;
  reason: string;
  detail?: string;
};

// File an abuse report against a gallery library. Requires sign-in (perms
// gate create on auth.id != null); only admins can read/resolve reports.
export function reportLibrary(input: ReportInput): void {
  const reportId = id();
  const detail = input.detail?.trim();
  db.transact(
    db.tx.galleryReports[reportId]!.update({
      reporterId: input.userId,
      librarySlug: input.librarySlug,
      reason: input.reason,
      resolved: false,
      createdAt: Date.now(),
      ...(detail ? { detail } : {}),
    }),
  );
}
