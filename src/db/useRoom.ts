import { useCallback, useEffect, useState } from "react";
import { id } from "@instantdb/react";
import { nanoid } from "nanoid";
import { exportKeyB64, generateRoomKey, importKeyB64 } from "../crypto/keys";
import { useAppState } from "../store/appState";
import { db } from "./instant";

const HASH_KEY_PARAM = "k";

function readHashParams(): URLSearchParams {
  // The leading "#" is part of `location.hash`. URLSearchParams parses
  // "k=abc&foo=bar" the same way it does for search strings.
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function writeHashKey(b64Key: string): void {
  const params = readHashParams();
  params.set(HASH_KEY_PARAM, b64Key);
  const next = `#${params.toString()}`;
  // Use replaceState so the key change doesn't pollute browser history.
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${next}`);
}

function getOrCreateSlugFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get("room");
  if (existing) return existing;

  const fresh = nanoid(10);
  const url = new URL(window.location.href);
  url.searchParams.set("room", fresh);
  window.history.replaceState({}, "", url.toString());
  return fresh;
}

export type RoomState = {
  roomId: string;
  roomSlug: string;
  isLoading: boolean;
  // Local userId of the room creator. Undefined for legacy rooms.
  ownerUserId: string | null;
  // Whether the owner is currently sharing this room. Defaults to true
  // for legacy rooms without an owner.
  sharingActive: boolean;
  // True when the local user is the owner (and can toggle sharing).
  isOwner: boolean;
  // Owner-only: flip the room's sharing flag. Throws (logs) for non-owners.
  setSharingActive: (active: boolean) => void;
};

/**
 * Resolves the room from the URL (`?room=<slug>`) and the optional room
 * key from the URL hash (`#k=<base64url>`). When a new room is created,
 * a fresh AES-GCM key is generated and written to the hash, the room row
 * is marked `encrypted: true`, and `ownerUserId` is set to the local
 * userId so only the creator can toggle sharing.
 */
export function useRoom(): RoomState {
  const [roomSlug] = useState(getOrCreateSlugFromUrl);
  const [candidateId] = useState(() => id());
  const setRoomKey = useAppState((s) => s.setRoomKey);
  const setEncrypted = useAppState((s) => s.setRoomEncrypted);
  const localUserId = useAppState((s) => s.userId);

  const { data, isLoading } = db.useQuery({
    rooms: { $: { where: { slug: roomSlug } } },
  });

  const existing = data?.rooms?.[0] as
    | {
        id: string;
        encrypted?: boolean;
        ownerUserId?: string;
        sharingActive?: boolean;
      }
    | undefined;
  const roomId = existing?.id ?? candidateId;
  const ownerUserId = existing?.ownerUserId ?? null;
  // Legacy rooms (no flag set) default to active. Only an explicit `false`
  // from the owner cuts peers off.
  const sharingActive = existing?.sharingActive !== false;
  const isOwner = ownerUserId !== null && ownerUserId === localUserId;

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    (async () => {
      const hashKey = readHashParams().get(HASH_KEY_PARAM);

      if (existing) {
        // Honor the existing room's encrypted flag. The hash key only
        // matters if the room is actually encrypted.
        if (existing.encrypted) {
          if (!hashKey) {
            setRoomKey(null);
            setEncrypted(true);
            return;
          }
          const key = await importKeyB64(hashKey);
          if (cancelled) return;
          setRoomKey(key);
          setEncrypted(true);
        } else {
          setRoomKey(null);
          setEncrypted(false);
        }
        return;
      }

      // New room: encrypt by default, generating a fresh key and writing
      // it to the URL hash so the room is shareable.
      let key: CryptoKey;
      if (hashKey) {
        key = await importKeyB64(hashKey);
      } else {
        key = await generateRoomKey();
        const b64 = await exportKeyB64(key);
        writeHashKey(b64);
      }
      if (cancelled) return;
      setRoomKey(key);
      setEncrypted(true);

      // The creator becomes the owner and starts with sharing active.
      // Without auth, the owner is identified by the locally-stored
      // userId; clearing localStorage forfeits ownership of this room.
      db.transact(
        db.tx.rooms[candidateId]!.update({
          slug: roomSlug,
          name: "Untitled",
          createdAt: Date.now(),
          encrypted: true,
          ownerUserId: localUserId,
          sharingActive: true,
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    existing,
    candidateId,
    roomSlug,
    setRoomKey,
    setEncrypted,
    localUserId,
  ]);

  const setSharingActive = useCallback(
    (active: boolean) => {
      if (!isOwner) return;
      db.transact(db.tx.rooms[roomId]!.update({ sharingActive: active }));
    },
    [isOwner, roomId],
  );

  return {
    roomId,
    roomSlug,
    isLoading,
    ownerUserId,
    sharingActive,
    isOwner,
    setSharingActive,
  };
}
