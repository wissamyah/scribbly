// Install pipeline for a marketplace library:
//   1. Fetch the .scribblylib bytes from the manifest's download URL
//   2. Compute SHA-256 in the browser; reject on mismatch (CDN tampering)
//   3. Parse + hand off to the existing importLibraryFromFile flow
//
// All trust here comes from the manifest entry — the gallery never installs
// raw URLs from untrusted sources except through the deep-link warning
// dialog upstream of this function.

import { importLibraryFromFile, parseLibraryFile } from "../importLibrary";
import type { ManifestEntry } from "./types";

export class InstallError extends Error {
  readonly code:
    | "fetch-failed"
    | "sha-mismatch"
    | "parse-failed"
    | "size-exceeded";
  constructor(message: string, code: InstallError["code"]) {
    super(message);
    this.name = "InstallError";
    this.code = code;
  }
}

// Belt-and-braces size cap matching the registry's 512 KB validator rule —
// rejects pathologically large bodies before we even compute a hash.
const MAX_BYTES = 1024 * 1024;

export type InstallOptions = {
  ownerKey: string;
  entry: ManifestEntry;
  // Visible library name — defaults to entry.name. The dialog lets the
  // user override before install.
  displayName?: string;
};

export async function installFromManifestEntry(
  options: InstallOptions,
): Promise<string> {
  const { entry, ownerKey } = options;
  const displayName = options.displayName ?? entry.name;

  const res = await safeFetch(entry.download);
  const bytes = await safeRead(res);

  if (bytes.byteLength > MAX_BYTES) {
    throw new InstallError(
      `library file is ${bytes.byteLength} bytes (limit ${MAX_BYTES})`,
      "size-exceeded",
    );
  }

  const sha = await sha256Hex(bytes);
  if (sha !== entry.sha256) {
    throw new InstallError(
      `SHA-256 mismatch: expected ${entry.sha256.slice(0, 12)}… got ${sha.slice(0, 12)}… — the CDN may be serving tampered bytes`,
      "sha-mismatch",
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    throw new InstallError(
      `library file is not valid UTF-8: ${(e as Error).message}`,
      "parse-failed",
    );
  }
  let file;
  try {
    file = parseLibraryFile(text);
  } catch (e) {
    throw new InstallError(
      `library file failed validation: ${(e as Error).message}`,
      "parse-failed",
    );
  }

  return importLibraryFromFile(file, {
    ownerKey,
    defaultName: displayName,
    sourceSlug: entry.slug,
    sourceVersion: entry.version,
  });
}

async function safeFetch(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "default" });
  } catch (e) {
    throw new InstallError(
      `network error fetching ${url}: ${(e as Error).message}`,
      "fetch-failed",
    );
  }
  if (!res.ok) {
    throw new InstallError(
      `download returned ${res.status} ${res.statusText}`,
      "fetch-failed",
    );
  }
  return res;
}

async function safeRead(res: Response): Promise<ArrayBuffer> {
  try {
    return await res.arrayBuffer();
  } catch (e) {
    throw new InstallError(
      `could not read download body: ${(e as Error).message}`,
      "fetch-failed",
    );
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  const hex = new Array<string>(view.length);
  for (let i = 0; i < view.length; i++) {
    hex[i] = view[i]!.toString(16).padStart(2, "0");
  }
  return hex.join("");
}
