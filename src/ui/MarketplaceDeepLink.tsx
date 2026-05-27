// Mounts once at the app root. Reads ?addLibrary=<url> on first paint and
// either:
//   (a) trusted host → fetch the registry's manifest, look up the matching
//       entry by its `download` URL, push it into Zustand so LibrarySidebar
//       opens its Browse tab with the install dialog pre-filled.
//   (b) untrusted host → show a ConfirmDialog explaining the file hasn't
//       been reviewed; on confirm, fetch + import directly (no SHA check
//       since there's nothing to compare against).
// Either way, ?addLibrary= is stripped from the URL so reloads don't loop.

import { useEffect, useState } from "react";

import {
  clearAddLibraryParam,
  isTrustedDownloadUrl,
  readAddLibraryParam,
} from "../libraries/marketplace/deepLink";
import {
  importLibraryFromFile,
  LibraryImportError,
  parseLibraryFile,
} from "../libraries/importLibrary";
import { fetchManifest, ManifestFetchError } from "../libraries/marketplace/manifest";
import { useOwnerKey } from "../libraries/ownerKey";
import { useAppState } from "../store/appState";
import { ConfirmDialog } from "./ConfirmDialog";

type Pending =
  | { kind: "untrusted-prompt"; url: string }
  | { kind: "untrusted-installing"; url: string }
  | { kind: "error"; message: string };

export function MarketplaceDeepLink() {
  const ownerKey = useOwnerKey();
  const setLibrarySidebarOpen = useAppState((s) => s.setLibrarySidebarOpen);
  const setPendingMarketplaceEntry = useAppState(
    (s) => s.setPendingMarketplaceEntry,
  );
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const url = readAddLibraryParam();
    if (!url) return;
    clearAddLibraryParam();

    if (isTrustedDownloadUrl(url)) {
      void resolveTrusted(url);
    } else {
      setPending({ kind: "untrusted-prompt", url });
    }

    async function resolveTrusted(downloadUrl: string): Promise<void> {
      try {
        const manifest = await fetchManifest();
        const entry = manifest.libraries.find(
          (e) => e.download === downloadUrl,
        );
        if (!entry) {
          setPending({
            kind: "error",
            message: `No library in the registry matches ${downloadUrl}.`,
          });
          return;
        }
        setPendingMarketplaceEntry(entry);
        setLibrarySidebarOpen(true);
      } catch (e) {
        setPending({
          kind: "error",
          message:
            e instanceof ManifestFetchError
              ? `Could not load gallery: ${e.message}`
              : (e as Error).message,
        });
      }
    }
  }, [setLibrarySidebarOpen, setPendingMarketplaceEntry]);

  const confirmUntrusted = async (): Promise<void> => {
    if (!pending || pending.kind !== "untrusted-prompt") return;
    const { url } = pending;
    setPending({ kind: "untrusted-installing", url });
    try {
      const res = await fetch(url, { cache: "default" });
      if (!res.ok) {
        throw new Error(`download returned ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      const file = parseLibraryFile(text);
      importLibraryFromFile(file, {
        ownerKey,
        defaultName: deriveNameFromUrl(url),
      });
      setLibrarySidebarOpen(true);
      setPending(null);
    } catch (e) {
      setPending({
        kind: "error",
        message:
          e instanceof LibraryImportError
            ? `Import failed: ${e.message}`
            : `Install failed: ${(e as Error).message}`,
      });
    }
  };

  if (!pending) return null;

  if (pending.kind === "untrusted-prompt") {
    return (
      <ConfirmDialog
        open
        title="Install third-party library?"
        message={
          `This file is hosted on a domain Scribbly has not reviewed:\n\n${pending.url}\n\n` +
          "It has not been validated by the marketplace maintainers. Install only if you trust the source."
        }
        confirmLabel="Install anyway"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmUntrusted()}
      />
    );
  }

  if (pending.kind === "untrusted-installing") {
    return (
      <ConfirmDialog
        open
        title="Installing…"
        message={`Fetching ${pending.url}`}
        confirmLabel="OK"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      title="Install failed"
      message={pending.message}
      confirmLabel="Dismiss"
      onCancel={() => setPending(null)}
      onConfirm={() => setPending(null)}
    />
  );
}

function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").pop() ?? "library";
    return last.replace(/\.scribblylib$/i, "") || "Library";
  } catch {
    return "Library";
  }
}
