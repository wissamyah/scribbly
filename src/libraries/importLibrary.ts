import type { ScribblyElement } from "../canvas/elements";
import { addImportedItems, createLibrary } from "./mutations";
import {
  LIBRARY_FILE_TYPE,
  LIBRARY_FILE_VERSION,
  LIBRARY_SOURCE_URL,
  type LibraryFile,
  type LibraryFileItem,
} from "./types";

export class LibraryImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryImportError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFileItem(raw: unknown): LibraryFileItem {
  if (!isPlainObject(raw)) {
    throw new LibraryImportError("library item is not an object");
  }
  const name = typeof raw.name === "string" ? raw.name : "Untitled";
  const id = typeof raw.id === "string" ? raw.id : "";
  const preview = typeof raw.preview === "string" ? raw.preview : "";
  const createdAt =
    typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
  const elements = Array.isArray(raw.elements)
    ? (raw.elements as ScribblyElement[])
    : [];
  return { id, name, preview, createdAt, elements };
}

export function parseLibraryFile(text: string): LibraryFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LibraryImportError("file is not valid JSON");
  }
  if (!isPlainObject(parsed)) {
    throw new LibraryImportError("file root is not an object");
  }
  if (parsed.type !== LIBRARY_FILE_TYPE) {
    throw new LibraryImportError(
      `unsupported file type: expected "${LIBRARY_FILE_TYPE}"`,
    );
  }
  if (parsed.version !== LIBRARY_FILE_VERSION) {
    throw new LibraryImportError(
      `unsupported file version: expected ${LIBRARY_FILE_VERSION}`,
    );
  }
  const source = typeof parsed.source === "string" ? parsed.source : LIBRARY_SOURCE_URL;
  const itemsRaw = Array.isArray(parsed.libraryItems) ? parsed.libraryItems : [];
  const libraryItems = itemsRaw.map(parseFileItem);
  return {
    type: LIBRARY_FILE_TYPE,
    version: LIBRARY_FILE_VERSION,
    source,
    libraryItems,
  };
}

export type ImportLibraryInput = {
  ownerKey: string;
  // If supplied, items are appended to this existing library; otherwise a
  // new library is created using `defaultName`.
  targetLibraryId?: string;
  defaultName: string;
  // Marketplace provenance — set when installing from a registry entry.
  // Stored on the new library so the gallery can later surface an "Update
  // available" banner by comparing sourceVersion with the manifest entry.
  sourceSlug?: string;
  sourceVersion?: string;
};

export function importLibraryFromFile(
  file: LibraryFile,
  input: ImportLibraryInput,
): string {
  const libraryId =
    input.targetLibraryId ??
    createLibrary({
      ownerKey: input.ownerKey,
      name: input.defaultName,
      source: file.source,
      ...(input.sourceSlug ? { sourceSlug: input.sourceSlug } : {}),
      ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}),
    });
  addImportedItems(
    file.libraryItems.map((item) => ({
      libraryId,
      name: item.name,
      elements: item.elements,
      preview: item.preview,
      createdAt: item.createdAt,
    })),
  );
  return libraryId;
}

export async function readLibraryFile(file: File): Promise<LibraryFile> {
  const text = await file.text();
  return parseLibraryFile(text);
}
