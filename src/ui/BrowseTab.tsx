import { useEffect, useMemo, useState } from "react";

import type { Session } from "../auth/useSession";
import { filterGallery, useGallery } from "../libraries/gallery/useGallery";
import { installFromGallery } from "../libraries/gallery/install";
import { reportLibrary } from "../libraries/gallery/report";
import type { GalleryLibrary } from "../libraries/gallery/types";
import type { ScribblyLibrary } from "../libraries/types";
import { LibraryCard, type InstallState } from "./LibraryCard";
import { PromptDialog } from "./PromptDialog";
import { ReportDialog } from "./ReportDialog";
import styles from "./LibrarySidebar.module.scss";

type Props = {
  ownerKey: string;
  session: Session;
  installedLibraries: readonly ScribblyLibrary[];
  // Called with the new library's id after a successful install so the
  // sidebar can switch tabs back and highlight what was just added.
  onInstalled: (libraryId: string) => void;
  // Opens the publish flow (parent gates sign-in).
  onSubmitClick: () => void;
  // Opens the shared sign-in dialog with a reason (used when reporting
  // while signed out).
  requireSignIn: (reason: string) => void;
  // Deep-link: open the install dialog for this slug once the gallery loads.
  initialSlug?: string | null;
  onInitialSlugConsumed?: () => void;
};

export function BrowseTab({
  ownerKey,
  session,
  installedLibraries,
  onInstalled,
  onSubmitClick,
  requireSignIn,
  initialSlug,
  onInitialSlugConsumed,
}: Props) {
  const { libraries, isLoading, error } = useGallery();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [license, setLicense] = useState<string>("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<GalleryLibrary | null>(
    null,
  );
  const [pendingReport, setPendingReport] = useState<GalleryLibrary | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Deep-link install: when the parent passed a slug, open the install
  // dialog for the matching entry once the gallery has loaded.
  useEffect(() => {
    if (!initialSlug || isLoading) return;
    const match = libraries.find((l) => l.slug === initialSlug);
    if (match) setPendingInstall(match);
    else setToast("That library link could not be found.");
    onInitialSlugConsumed?.();
  }, [initialSlug, isLoading, libraries, onInitialSlugConsumed]);

  // sourceSlug → highest installed (numeric) version, to decorate cards.
  const installedBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const lib of installedLibraries) {
      if (lib.sourceSlug && lib.sourceVersion) {
        const v = Number(lib.sourceVersion) || 0;
        const prior = map.get(lib.sourceSlug);
        if (prior === undefined || v > prior) map.set(lib.sourceSlug, v);
      }
    }
    return map;
  }, [installedLibraries]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const l of libraries) for (const t of l.tags) set.add(t);
    return [...set].sort();
  }, [libraries]);

  const allLicenses = useMemo(() => {
    const set = new Set<string>();
    for (const l of libraries) set.add(l.license);
    return [...set].sort();
  }, [libraries]);

  const visible = useMemo(
    () =>
      filterGallery(libraries, {
        search,
        tag: tag || undefined,
        license: license || undefined,
      }),
    [libraries, search, tag, license],
  );

  const stateFor = (entry: GalleryLibrary): InstallState => {
    const installed = installedBySlug.get(entry.slug);
    if (installed === undefined) return { kind: "not-installed" };
    if (entry.version > installed) {
      return { kind: "update-available", installed, available: entry.version };
    }
    return { kind: "installed", version: installed };
  };

  const runInstall = (entry: GalleryLibrary, displayName: string) => {
    setInstalling(entry.slug);
    try {
      const libId = installFromGallery({
        entry,
        ownerKey,
        userId: session.userId,
        displayName,
      });
      setToast(`Installed ${entry.name}`);
      onInstalled(libId);
    } catch (e) {
      setToast(`Install failed: ${(e as Error).message}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleReportClick = (entry: GalleryLibrary) => {
    if (!session.userId) {
      requireSignIn("Sign in to report a library.");
      return;
    }
    setPendingReport(entry);
  };

  const submitReport = (reason: string, detail: string) => {
    const target = pendingReport;
    setPendingReport(null);
    if (!target || !session.userId) return;
    try {
      reportLibrary({
        userId: session.userId,
        librarySlug: target.slug,
        reason,
        detail,
      });
      setToast("Report submitted — thank you");
    } catch (e) {
      setToast(`Could not submit report: ${(e as Error).message}`);
    }
  };

  return (
    <div className={styles.browse}>
      <div className={styles.browseSubmit}>
        <span>
          <strong>Built something good?</strong> Share it with everyone.
        </span>
        <button
          type="button"
          className={styles.browseSubmitLink}
          onClick={onSubmitClick}
        >
          Submit your own →
        </button>
      </div>

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
      </div>

      {isLoading && <div className={styles.browseStatus}>Loading gallery…</div>}
      {error && <div className={styles.browseStatus}>{error}</div>}
      {!isLoading && !error && visible.length === 0 && (
        <div className={styles.browseStatus}>
          {libraries.length === 0
            ? "No libraries published yet. Be the first to submit one!"
            : "No libraries match your filter."}
        </div>
      )}
      {!isLoading && !error && visible.length > 0 && (
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
              onReport={() => handleReportClick(entry)}
            />
          ))}
        </div>
      )}

      <PromptDialog
        open={pendingInstall !== null}
        title={pendingInstall ? `Install ${pendingInstall.name}` : ""}
        message={
          pendingInstall
            ? `${pendingInstall.itemCount} item${
                pendingInstall.itemCount === 1 ? "" : "s"
              } · v${pendingInstall.version} · ${pendingInstall.license}\nBy ${pendingInstall.authorHandle}`
            : undefined
        }
        label="Library name"
        initialValue={pendingInstall?.name ?? ""}
        confirmLabel="Install"
        onCancel={() => setPendingInstall(null)}
        onConfirm={(value) => {
          const target = pendingInstall;
          setPendingInstall(null);
          if (target) runInstall(target, value);
        }}
      />

      <ReportDialog
        open={pendingReport !== null}
        libraryName={pendingReport?.name ?? ""}
        onCancel={() => setPendingReport(null)}
        onSubmit={submitReport}
      />

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
