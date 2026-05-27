import type { ScribblyElement } from "../canvas/elements";
import { db } from "../db/instant";
import type { LibraryItem } from "./types";

export type UseLibraryItemsResult = {
  items: LibraryItem[];
  isLoading: boolean;
};

type RawLibraryItem = Omit<LibraryItem, "elements"> & { elements: unknown };

function coerceElements(raw: unknown): ScribblyElement[] {
  if (!Array.isArray(raw)) return [];
  return raw as ScribblyElement[];
}

export function useLibraryItems(libraryId: string | null): UseLibraryItemsResult {
  const { data, isLoading } = db.useQuery(
    libraryId
      ? { libraryItems: { $: { where: { libraryId } } } }
      : { libraryItems: { $: { where: { libraryId: "__never__" } } } },
  );
  const rows = (data?.libraryItems ?? []) as RawLibraryItem[];
  const items: LibraryItem[] = rows
    .map((r) => ({ ...r, elements: coerceElements(r.elements) }))
    .sort((a, b) => b.createdAt - a.createdAt);
  return { items, isLoading };
}
