import { useMemo } from "react";

import {
  reportLibraryIssueUrl,
  viewSourceUrl,
} from "../libraries/marketplace/links";
import type { ManifestEntry } from "../libraries/marketplace/types";
import styles from "./LibrarySidebar.module.scss";

export type InstallState =
  | { kind: "not-installed" }
  | { kind: "installed"; version: string }
  | { kind: "update-available"; installed: string; available: string };

type Props = {
  entry: ManifestEntry;
  state: InstallState;
  onInstall: () => void;
};

export function LibraryCard({ entry, state, onInstall }: Props) {
  // Author URL is "https://github.com/<handle>" — only render the link
  // when the handle looks like a real GitHub login. First-party entries
  // (handle: "scribbly") fail this check until/unless a real org is set up.
  const author = entry.author.displayName ?? entry.author.handle;
  const tags = useMemo(() => entry.tags.slice(0, 3), [entry.tags]);

  const installLabel =
    state.kind === "not-installed"
      ? "Install"
      : state.kind === "installed"
        ? "Installed"
        : "Update";

  const banner =
    state.kind === "installed" ? (
      <span className={styles.installedBadge}>Installed v{state.version}</span>
    ) : state.kind === "update-available" ? (
      <span className={styles.updateBadge}>
        Update available: v{state.installed} → v{state.available}
      </span>
    ) : null;

  return (
    <div className={styles.card}>
      <div className={styles.cardThumb}>
        <img src={entry.preview} alt={entry.name} loading="lazy" />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div className={styles.cardName}>{entry.name}</div>
          <span className={styles.cardLicense} title={`License: ${entry.license}`}>
            {entry.license}
          </span>
        </div>
        <div className={styles.cardDescription}>{entry.description}</div>
        <div className={styles.cardMeta}>
          <span>by {author}</span>
          <span>·</span>
          <span>
            {entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>v{entry.version}</span>
        </div>
        {tags.length > 0 && (
          <div className={styles.cardTags}>
            {tags.map((t) => (
              <span key={t} className={styles.cardTag}>
                {t}
              </span>
            ))}
          </div>
        )}
        {banner}
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.installButton}
            onClick={onInstall}
            disabled={state.kind === "installed"}
          >
            {installLabel}
          </button>
          <a
            className={styles.cardLink}
            href={viewSourceUrl(entry)}
            target="_blank"
            rel="noopener noreferrer"
            title="View source on GitHub"
          >
            Source
          </a>
          <a
            className={styles.cardLink}
            href={reportLibraryIssueUrl(entry)}
            target="_blank"
            rel="noopener noreferrer"
            title="Report this library on GitHub"
          >
            Report
          </a>
        </div>
      </div>
    </div>
  );
}
