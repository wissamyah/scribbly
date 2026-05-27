import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchManifest,
  filterManifest,
  ManifestFetchError,
} from "../libraries/marketplace/manifest";
import type {
  ManifestEntry,
  ManifestV1,
} from "../libraries/marketplace/types";
import {
  InstallError,
  installFromManifestEntry,
} from "../libraries/marketplace/installFromUrl";
import type { ScribblyLibrary } from "../libraries/types";
import { LibraryCard, type InstallState } from "./LibraryCard";
import { PromptDialog } from "./PromptDialog";
import styles from "./LibrarySidebar.module.scss";

type Props = {
  ownerKey: string;
  installedLibraries: readonly ScribblyLibrary[];
  // Called with the new library's id after a successful install so the
  // sidebar can switch tabs back and highlight what was just added.
  onInstalled: (libraryId: string) => void;
  initialEntry?: ManifestEntry | null;
  onInitialEntryConsumed?: () => void;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; manifest: ManifestV1 }
  | { kind: "error"; message: string };

export function BrowseTab({
  ownerKey,
  installedLibraries,
  onInstalled,
  initialEntry,
  onInitialEntryConsumed,
}: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [license, setLicense] = useState<string>("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<ManifestEntry | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { force?: boolean }) => {
    setState({ kind: "loading" });
    try {
      const manifest = await fetchManifest(undefined, opts);
      setState({ kind: "ready", manifest });
    } catch (e) {
      setState({
        kind: "error",
        message:
          e instanceof ManifestFetchError ? e.message : "Could not load gallery",
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Deep-link install: when the parent passed an entry, open the install
  // dialog as soon as the manifest is loaded (so the user sees the entry
  // we matched against, not just a slug from the URL).
  useEffect(() => {
    if (!initialEntry) return;
    if (state.kind !== "ready") return;
    setPendingInstall(initialEntry);
    onInitialEntryConsumed?.();
  }, [initialEntry, state, onInitialEntryConsumed]);

  // sourceSlug → installed-version lookup, used to decorate each card.
  const installedBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const lib of installedLibraries) {
      if (lib.sourceSlug && lib.sourceVersion) {
        // Keep the highest installed version if a user has multiple copies.
        const prior = map.get(lib.sourceSlug);
        if (!prior || compareSemver(lib.sourceVersion, prior) > 0) {
          map.set(lib.sourceSlug, lib.sourceVersion);
        }
      }
    }
    return map;
  }, [installedLibraries]);

  const allTags = useMemo(() => {
    if (state.kind !== "ready") return [] as string[];
    const set = new Set<string>();
    for (const l of state.manifest.libraries) for (const t of l.tags) set.add(t);
    return [...set].sort();
  }, [state]);

  const allLicenses = useMemo(() => {
    if (state.kind !== "ready") return [] as string[];
    const set = new Set<string>();
    for (const l of state.manifest.libraries) set.add(l.license);
    return [...set].sort();
  }, [state]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [] as ManifestEntry[];
    return filterManifest(state.manifest.libraries, {
      search,
      tag: tag || undefined,
      license: license || undefined,
    });
  }, [state, search, tag, license]);

  const stateFor = useCallback(
    (entry: ManifestEntry): InstallState => {
      const installed = installedBySlug.get(entry.slug);
      if (!installed) return { kind: "not-installed" };
      if (compareSemver(entry.version, installed) > 0) {
        return {
          kind: "update-available",
          installed,
          available: entry.version,
        };
      }
      return { kind: "installed", version: installed };
    },
    [installedBySlug],
  );

  const runInstall = async (entry: ManifestEntry, displayName: string) => {
    setInstalling(entry.slug);
    try {
      const libId = await installFromManifestEntry({
        ownerKey,
        entry,
        displayName,
      });
      setToast(`Installed ${entry.name}`);
      onInstalled(libId);
    } catch (e) {
      const msg =
        e instanceof InstallError
          ? `Install failed: ${e.message}`
          : `Install failed: ${(e as Error).message}`;
      setToast(msg);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className={styles.browse}>
      <div className={styles.browseControls}>
        <input
          type="search"
          placeholder="Search libraries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.browseSearch}
          aria-label="Search libraries"
        />
        <select
          className={styles.browseFilter}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={styles.browseFilter}
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          aria-label="Filter by license"
        >
          <option value="">Any license</option>
          {allLicenses.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => void reload({ force: true })}
          title="Refresh gallery"
          aria-label="Refresh gallery"
        >
          ↻
        </button>
      </div>

      {state.kind === "loading" && (
        <div className={styles.browseStatus}>Loading gallery…</div>
      )}
      {state.kind === "error" && (
        <div className={styles.browseStatus}>
          {state.message}
          <button
            type="button"
            className={styles.button}
            onClick={() => void reload({ force: true })}
            style={{ marginTop: 12 }}
          >
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && visible.length === 0 && (
        <div className={styles.browseStatus}>No libraries match your filter.</div>
      )}
      {state.kind === "ready" && visible.length > 0 && (
        <div className={styles.browseList}>
          {visible.map((entry) => (
            <LibraryCard
              key={entry.slug}
              entry={entry}
              state={stateFor(entry)}
              onInstall={() => {
                if (installing) return;
                setPendingInstall(entry);
              }}
            />
          ))}
        </div>
      )}

      <PromptDialog
        open={pendingInstall !== null}
        title={pendingInstall ? `Install ${pendingInstall.name}` : ""}
        message={
          pendingInstall
            ? `${pendingInstall.slug} · v${pendingInstall.version} · ${pendingInstall.license}\nFrom: ${pendingInstall.author.handle}`
            : undefined
        }
        label="Library name"
        initialValue={pendingInstall?.name ?? ""}
        confirmLabel="Install"
        onCancel={() => setPendingInstall(null)}
        onConfirm={(value) => {
          const target = pendingInstall;
          setPendingInstall(null);
          if (target) void runInstall(target, value);
        }}
      />

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((s) => Number(s) || 0);
  const pb = b.split(".").map((s) => Number(s) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
