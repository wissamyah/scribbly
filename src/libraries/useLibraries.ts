import { db } from "../db/instant";
import type { ScribblyLibrary } from "./types";

export type UseLibrariesResult = {
  libraries: ScribblyLibrary[];
  isLoading: boolean;
};

// Personal libraries. When signed in, they're scoped to the account
// (`userId`) so they follow the user across devices; otherwise they fall
// back to the anonymous localStorage `ownerKey`.
export function useLibraries(
  ownerKey: string,
  userId: string | null = null,
): UseLibrariesResult {
  const { data, isLoading } = db.useQuery(
    userId
      ? { libraries: { $: { where: { userId } } } }
      : ownerKey
        ? { libraries: { $: { where: { ownerKey } } } }
        : { libraries: { $: { where: { ownerKey: "__never__" } } } },
  );
  const rows = (data?.libraries ?? []) as ScribblyLibrary[];
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  return { libraries: sorted, isLoading };
}
