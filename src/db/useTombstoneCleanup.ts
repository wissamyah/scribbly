import { useEffect, useRef } from "react";
import { dbHardDeleteStaleTombstones } from "./mutations";

// Wait a bit after mount so cleanup doesn't compete with initial query
// hydration and first paint.
const CLEANUP_DELAY_MS = 5_000;

/**
 * Once per room mount, hard-delete soft-deleted element rows older than
 * the tombstone retention window. Runs in the background; failures are
 * swallowed (cleanup is best-effort and will be retried next session).
 */
export function useTombstoneCleanup(
  roomId: string,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const ranForRoom = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    if (!enabled) return;
    if (ranForRoom.current === roomId) return;
    ranForRoom.current = roomId;

    const timer = window.setTimeout(() => {
      void dbHardDeleteStaleTombstones(roomId).catch(() => {});
    }, CLEANUP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [roomId, enabled]);
}
