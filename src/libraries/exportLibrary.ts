import {
  LIBRARY_FILE_EXT,
  LIBRARY_FILE_TYPE,
  LIBRARY_FILE_VERSION,
  LIBRARY_SOURCE_URL,
  type LibraryFile,
  type LibraryFileItem,
  type LibraryItem,
  type ScribblyLibrary,
} from "./types";

function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^a-z0-9\-_]+/gi, "-");
  return cleaned.length > 0 ? cleaned : "library";
}

export function buildLibraryFile(
  library: ScribblyLibrary,
  items: readonly LibraryItem[],
): LibraryFile {
  const fileItems: LibraryFileItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    elements: item.elements,
    preview: item.preview,
    createdAt: item.createdAt,
  }));
  return {
    type: LIBRARY_FILE_TYPE,
    version: LIBRARY_FILE_VERSION,
    source: library.source || LIBRARY_SOURCE_URL,
    libraryItems: fileItems,
  };
}

function triggerDownload(filename: string, body: string): void {
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke async — some browsers race the click handler.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadLibraryFile(
  library: ScribblyLibrary,
  items: readonly LibraryItem[],
): void {
  const file = buildLibraryFile(library, items);
  const json = JSON.stringify(file, null, 2);
  triggerDownload(
    `${sanitizeFilename(library.name)}${LIBRARY_FILE_EXT}`,
    json,
  );
}

// Same payload as downloadLibraryFile, but saved with a `.json` extension.
// GitHub's issue attachment uploader rejects unknown extensions like
// `.scribblylib`, so the submission flow uses this variant. Round-trip is
// safe: importLibrary parses any JSON text and the file's `type` field is
// what actually identifies it as a Scribbly library.
export function downloadLibraryFileAsJson(
  library: ScribblyLibrary,
  items: readonly LibraryItem[],
): void {
  const file = buildLibraryFile(library, items);
  const json = JSON.stringify(file, null, 2);
  triggerDownload(`${sanitizeFilename(library.name)}.scribblylib.json`, json);
}
