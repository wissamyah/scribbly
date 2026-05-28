import { useState } from "react";

import type { Session } from "../auth/useSession";
import { unpublish } from "../libraries/gallery/publish";
import type { GalleryLibrary } from "../libraries/gallery/types";
import { useMyPublications } from "../libraries/gallery/useMyPublications";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./LibrarySidebar.module.scss";

type Props = {
  session: Session;
  // Open the publish dialog in edit mode for this submission.
  onEdit: (entry: GalleryLibrary) => void;
};

function statusClass(status: GalleryLibrary["status"]): string {
  switch (status) {
    case "published":
      return styles.statusPublished!;
    case "rejected":
      return styles.statusRejected!;
    default:
      return styles.statusPending!;
  }
}

export function MySubmissions({ session, onEdit }: Props) {
  const { publications, isLoading } = useMyPublications(session.userId);
  const [confirmTarget, setConfirmTarget] = useState<GalleryLibrary | null>(
    null,
  );

  if (!session.userId) {
    return (
      <div className={styles.browseStatus}>
        Sign in to manage your submissions.
      </div>
    );
  }
  if (isLoading) {
    return <div className={styles.browseStatus}>Loading your submissions…</div>;
  }
  if (publications.length === 0) {
    return (
      <div className={styles.browseStatus}>
        You haven't submitted any libraries yet. Open a library in “My
        libraries” and choose “Submit to gallery”.
      </div>
    );
  }

  return (
    <div className={styles.browseList}>
      {publications.map((entry) => (
        <div key={entry.id} className={styles.card}>
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
                className={`${styles.statusBadge} ${statusClass(entry.status)}`}
              >
                {entry.status}
              </span>
            </div>
            <div className={styles.cardMeta}>
              <span>
                {entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>v{entry.version}</span>
            </div>
            {entry.status === "rejected" && entry.rejectionNote && (
              <div className={styles.rejectionNote}>
                Rejected: {entry.rejectionNote}
              </div>
            )}
            <div className={styles.cardActions}>
              <button
                type="button"
                className={styles.installButton}
                onClick={() => onEdit(entry)}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.cardLink}
                onClick={() => setConfirmTarget(entry)}
              >
                Unpublish
              </button>
            </div>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Unpublish submission"
        message={
          confirmTarget
            ? `Remove "${confirmTarget.name}" from the gallery? This can't be undone — you'd need to resubmit.`
            : ""
        }
        confirmLabel="Unpublish"
        tone="danger"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) unpublish(confirmTarget.id);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}
