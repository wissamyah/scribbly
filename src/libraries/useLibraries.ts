import { db } from "../db/instant";
import type { ScribblyLibrary } from "./types";

export type UseLibrariesResult = {
  libraries: ScribblyLibrary[];
  isLoading: boolean;
};

export function useLibraries(ownerKey: string): UseLibrariesResult {
  const { data, isLoading } = db.useQuery(
    ownerKey
      ? { libraries: { $: { where: { ownerKey } } } }
      : { libraries: { $: { where: { ownerKey: "__never__" } } } },
  );
  const rows = (data?.libraries ?? []) as ScribblyLibrary[];
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  return { libraries: sorted, isLoading };
}
