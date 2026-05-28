// Deep-link to a single gallery library: ?library=<slug>. Opens the Library
// sidebar's Browse tab and pre-fills the install dialog for that entry.
// Replaces the old ?addLibrary=<cdn-url> handler — no more external URLs or
// trusted-host allowlist, since every gallery library lives in our own DB.

export function readLibraryParam(search = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const slug = params.get("library");
  const trimmed = slug?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

// Strip ?library= from the URL without a reload so a refresh doesn't
// re-trigger the install dialog.
export function clearLibraryParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("library")) return;
  url.searchParams.delete("library");
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
}
