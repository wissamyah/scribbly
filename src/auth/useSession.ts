import { db } from "../db/instant";

// Thin wrapper over db.useAuth(). Auth here powers the gallery only — the
// canvas/rooms stay no-auth. `userId` is the InstantDB auth uid, distinct
// from appState.userId (which is the local collab-presence id for cursors).
export type Session = {
  isLoading: boolean;
  userId: string | null;
  email: string | null;
};

export function useSession(): Session {
  const { isLoading, user } = db.useAuth();
  return {
    isLoading,
    userId: user?.id ?? null,
    email: user?.email ?? null,
  };
}
