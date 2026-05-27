import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decryptJSON, encryptJSON } from "../crypto/aead";
import { db } from "../db/instant";
import { useAppState } from "../store/appState";

const ROOM_TYPE = "canvas";

export type CursorPosition = { x: number; y: number };

export type CollabPresence = {
  userId: string;
  name: string;
  color: string;
  cursor: CursorPosition | null;
  t: number;
};

// What lives on the wire — either the plaintext shape, or a sealed
// envelope when the room is end-to-end encrypted. In encrypted mode the
// whole presence object is sealed into a single `{ciphertext, iv}` pair,
// re-sealed on every publish so identity + cursor stay consistent.
type RawPresenceRow = Partial<CollabPresence> & {
  ciphertext?: string;
  iv?: string;
};

export type Peer = CollabPresence;

export function useCollabPresence(roomId: string): {
  peers: Peer[];
  publishCursor: (world: CursorPosition | null) => void;
} {
  const userId = useAppState((s) => s.userId);
  const userName = useAppState((s) => s.userName);
  const userColor = useAppState((s) => s.userColor);
  const roomKey = useAppState((s) => s.roomKey);

  const room = useMemo(() => db.room(ROOM_TYPE, roomId), [roomId]);

  // Local snapshot of what we're currently publishing. Cursor updates
  // mutate this in a ref to avoid re-rendering on every mouse move.
  const localRef = useRef<CollabPresence>({
    userId,
    name: userName,
    color: userColor,
    cursor: null,
    t: 0,
  });
  localRef.current.userId = userId;
  localRef.current.name = userName;
  localRef.current.color = userColor;

  // When encrypted, we maintain a sealed identity blob so useSyncPresence
  // has something stable to publish on identity change.
  const [sealedIdentity, setSealedIdentity] = useState<{
    ciphertext: string;
    iv: string;
  } | null>(null);

  useEffect(() => {
    if (!roomKey) {
      setSealedIdentity(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const sealed = await encryptJSON(roomKey, {
        userId,
        name: userName,
        color: userColor,
        cursor: null,
        t: 0,
      });
      if (cancelled) return;
      setSealedIdentity(sealed);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomKey, userId, userName, userColor]);

  room.useSyncPresence(
    roomKey
      ? {
          ciphertext: sealedIdentity?.ciphertext ?? "",
          iv: sealedIdentity?.iv ?? "",
        }
      : { userId, name: userName, color: userColor },
  );

  const presence = room.usePresence();

  // Throttle cursor publishes to 50ms, flushing immediately on leave.
  const lastSentRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  const publishRef = useRef(presence.publishPresence);
  publishRef.current = presence.publishPresence;
  const roomKeyRef = useRef(roomKey);
  roomKeyRef.current = roomKey;

  const flushCursor = async () => {
    pendingTimerRef.current = null;
    lastSentRef.current = Date.now();
    localRef.current.t = lastSentRef.current;
    const key = roomKeyRef.current;
    if (key) {
      const sealed = await encryptJSON(key, localRef.current);
      publishRef.current({ ciphertext: sealed.ciphertext, iv: sealed.iv });
    } else {
      publishRef.current({
        cursor: localRef.current.cursor,
        t: localRef.current.t,
      });
    }
  };

  const publishCursor = useCallback((world: CursorPosition | null) => {
    localRef.current.cursor = world;
    if (world === null) {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
      void flushCursor();
      return;
    }
    if (pendingTimerRef.current !== null) return;
    const elapsed = Date.now() - lastSentRef.current;
    const wait = Math.max(0, 50 - elapsed);
    pendingTimerRef.current = window.setTimeout(() => {
      void flushCursor();
    }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  const peers = useDecryptedPeers(presence.peers, userId, roomKey);

  return { peers, publishCursor };
}

function parseCursor(value: unknown): CursorPosition | null {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as CursorPosition).x === "number" &&
    typeof (value as CursorPosition).y === "number"
  ) {
    return {
      x: (value as CursorPosition).x,
      y: (value as CursorPosition).y,
    };
  }
  return null;
}

function shapePeer(merged: Partial<CollabPresence>): Peer | null {
  if (typeof merged.userId !== "string") return null;
  return {
    userId: merged.userId,
    name: typeof merged.name === "string" ? merged.name : "Guest",
    color: typeof merged.color === "string" ? merged.color : "#666666",
    cursor: parseCursor(merged.cursor),
    t: typeof merged.t === "number" ? merged.t : 0,
  };
}

function useDecryptedPeers(
  raw: Record<string, unknown> | undefined,
  selfId: string,
  roomKey: CryptoKey | null,
): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!raw) {
      setPeers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const out: Peer[] = [];
      for (const k of Object.keys(raw)) {
        const row = raw[k] as RawPresenceRow | undefined;
        if (!row) continue;
        if (roomKey && row.ciphertext && row.iv) {
          try {
            const decoded = await decryptJSON<Partial<CollabPresence>>(
              roomKey,
              { ciphertext: row.ciphertext, iv: row.iv },
            );
            const peer = shapePeer(decoded);
            if (peer && peer.userId !== selfId) out.push(peer);
          } catch {
            // Stale envelope or wrong key — drop this peer.
          }
        } else if (!roomKey && !row.ciphertext) {
          const peer = shapePeer(row);
          if (peer && peer.userId !== selfId) out.push(peer);
        }
      }
      if (cancelled) return;
      setPeers(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, selfId, roomKey]);

  return peers;
}
