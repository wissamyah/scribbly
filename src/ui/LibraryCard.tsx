import { useMemo } from "react";

import type { GalleryLibrary } from "../libraries/gallery/types";
import styles from "./LibrarySidebar.module.scss";

export type InstallState =
  | { kind: "not-installed" }
  | { kind: "installed"; version: number }
  | { kind: "update-available"; installed: number; available: number };

type Props = {
  entry: GalleryLibrary;
  state: InstallState;
  onInstall: () => void;
  onReport: () => void;
};

export function LibraryCard({ entry, state, onInstall, onReport }: Props) {
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
        {entry.coverPreview ? (
          <img src={entry.coverPreview} alt={entry.name} loading="lazy" />
        ) : (
          <span>{entry.name}</span>
        )}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div className={styles.cardName}>{entry.name}</div>
          <span
            className={styles.cardLicense}
            title={`License: ${entry.license}`}
          >
            {entry.license}
          </span>
        </div>
        <div className={styles.cardDescription}>{entry.description}</div>
        <div className={styles.cardMeta}>
          <span>by {entry.authorHandle}</span>
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
          <button
            type="button"
            className={styles.cardLink}
            onClick={onReport}
            title="Report this library"
          >
            Report
          </button>
        </div>
      </div>
    </div>
  );
}
