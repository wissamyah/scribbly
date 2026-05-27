// Allowlist of hosts whose .scribblylib files we install without a
// third-party warning. The marketplace's canonical CDN gets a free pass;
// anything else routes through a "you sure?" dialog. Configurable via
// VITE_LIBRARY_TRUSTED_HOSTS — comma-separated, no scheme.

export const TRUSTED_HOSTS = parseTrustedHosts(
  (import.meta.env["VITE_LIBRARY_TRUSTED_HOSTS"] as string | undefined) ??
    "libraries.scribbly.app",
);

function parseTrustedHosts(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function isTrustedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return TRUSTED_HOSTS.includes(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

// Read ?addLibrary=<url> from window.location.search. Returns null if no
// param is set or the value isn't a parseable URL.
export function readAddLibraryParam(search = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("addLibrary");
  if (!raw) return null;
  try {
    // Throws if not a valid absolute URL.
    new URL(raw);
    return raw;
  } catch {
    return null;
  }
}

// Strip ?addLibrary= from the URL without a reload. Avoids re-triggering
// the deep-link handler on subsequent re-renders (and stops the user from
// accidentally re-installing on F5).
export function clearAddLibraryParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("addLibrary")) return;
  url.searchParams.delete("addLibrary");
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
}
