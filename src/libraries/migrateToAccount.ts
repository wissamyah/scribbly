import { db } from "../db/instant";
import type { ScribblyLibrary } from "./types";

// First-sign-in migration: claim the libraries created under the anonymous
// localStorage ownerKey into the signed-in account by stamping `userId` on
// them. After this they're queried by account and follow the user across
// devices.

const DISMISS_PREFIX = "scribbly:migrateDismissed:";

function dismissKey(userId: string): string {
  return `${DISMISS_PREFIX}${userId}`;
}

export function wasMigrationDismissed(userId: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissMigration(userId: string): void {
  try {
    window.localStorage.setItem(dismissKey(userId), "1");
  } catch {
    // Non-fatal — worst case we re-offer next session.
  }
}

// Reactively finds libraries owned by the local `ownerKey` that haven't yet
// been claimed by any account. Only runs when signed in.
export function useMigrationCandidates(
  ownerKey: string,
  userId: string | null,
): ScribblyLibrary[] {
  const { data } = db.useQuery(
    userId && ownerKey
      ? { libraries: { $: { where: { ownerKey } } } }
      : null,
  );
  const rows = (data?.libraries ?? []) as ScribblyLibrary[];
  return rows.filter((l) => !l.userId);
}

export function migrateLibrariesToAccount(
  libraries: readonly ScribblyLibrary[],
  userId: string,
): void {
  if (libraries.length === 0) return;
  const now = Date.now();
  db.transact(
    libraries.map((l) =>
      db.tx.libraries[l.id]!.update({ userId, updatedAt: now }),
    ),
  );
}
