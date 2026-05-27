import type { ScribblyElement } from "../canvas/elements";
import { addLibraryItem } from "./mutations";
import { normalizeForLibrary } from "./normalize";
import { renderItemPreview } from "./preview";

export type SaveSelectionInput = {
  libraryId: string;
  name: string;
  elements: readonly ScribblyElement[];
};

/**
 * Normalize the selected elements (re-anchor to 0,0, strip per-room
 * provenance) and store them as a new item in the given library. Returns
 * the new item id.
 *
 * This is a one-shot user action triggered from the sidebar — no debounce.
 */
export function saveSelectionToLibrary(input: SaveSelectionInput): string {
  const elements = normalizeForLibrary(input.elements);
  const preview = renderItemPreview(elements);
  return addLibraryItem({
    libraryId: input.libraryId,
    name: input.name,
    elements,
    preview,
  });
}
