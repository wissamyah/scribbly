// Fetches libraries.json from the marketplace registry. One in-flight
// request at a time per session; results cached in memory for an hour and
// in sessionStorage so a reload while offline still shows the gallery.
//
// No external state library — Zustand is for canvas UI, and the manifest
// is read once per session for nearly every consumer (BrowseTab).

import type { ManifestEntry, ManifestV1 } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SESSION_KEY = "scribbly:marketplace:manifest";

type CacheEntry = { fetchedAt: number; manifest: ManifestV1 };
let memoryCache: CacheEntry | null = null;
let inflight: Promise<ManifestV1> | null = null;

export const DEFAULT_REGISTRY_URL =
  (import.meta.env["VITE_LIBRARY_REGISTRY_URL"] as string | undefined) ??
  "https://libraries.scribbly.app/libraries.json";

export class ManifestFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestFetchError";
  }
}

function readSessionCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed.manifest || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(entry: CacheEntry): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
  } catch {
    // Storage quota / disabled — non-fatal; in-memory cache still works.
  }
}

export async function fetchManifest(
  url: string = DEFAULT_REGISTRY_URL,
  options: { force?: boolean } = {},
): Promise<ManifestV1> {
  const now = Date.now();
  if (!options.force && memoryCache) {
    if (now - memoryCache.fetchedAt < CACHE_TTL_MS) return memoryCache.manifest;
  }
  if (!options.force && !memoryCache) {
    const session = readSessionCache();
    if (session && now - session.fetchedAt < CACHE_TTL_MS) {
      memoryCache = session;
      return session.manifest;
    }
  }
  if (inflight) return inflight;

  inflight = (async () => {
    let res: Response;
    try {
      res = await fetch(url, { cache: "default" });
    } catch (e) {
      // Offline fallback: serve a stale session-cached manifest if any.
      const stale = readSessionCache();
      if (stale) {
        memoryCache = stale;
        return stale.manifest;
      }
      throw new ManifestFetchError(
        `network error fetching manifest: ${(e as Error).message}`,
      );
    } finally {
      // Reset inflight after the network call, but keep it set while the
      // response body is parsed below (callers should still dedupe).
    }
    if (!res.ok) {
      throw new ManifestFetchError(
        `manifest fetch returned ${res.status} ${res.statusText}`,
      );
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw new ManifestFetchError(
        `manifest is not valid JSON: ${(e as Error).message}`,
      );
    }
    const manifest = validateManifest(json);
    const entry: CacheEntry = { fetchedAt: Date.now(), manifest };
    memoryCache = entry;
    writeSessionCache(entry);
    return manifest;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function validateManifest(value: unknown): ManifestV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { type?: unknown }).type !== "scribbly-libraries-manifest" ||
    (value as { version?: unknown }).version !== 1 ||
    !Array.isArray((value as { libraries?: unknown }).libraries)
  ) {
    throw new ManifestFetchError("manifest shape is not v1");
  }
  return value as ManifestV1;
}

// Sort + filter helpers used by BrowseTab.
export type ManifestFilter = {
  search?: string;
  license?: string;
  tag?: string;
  includeDeprecated?: boolean;
};

export function filterManifest(
  entries: readonly ManifestEntry[],
  f: ManifestFilter,
): ManifestEntry[] {
  const search = f.search?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (!f.includeDeprecated && e.deprecated) return false;
    if (f.license && e.license !== f.license) return false;
    if (f.tag && !e.tags.includes(f.tag)) return false;
    if (
      search &&
      !(
        e.name.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search) ||
        e.author.handle.toLowerCase().includes(search) ||
        e.tags.some((t) => t.toLowerCase().includes(search))
      )
    ) {
      return false;
    }
    return true;
  });
}
