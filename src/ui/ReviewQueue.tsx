import { useState } from "react";

import {
  approvePublication,
  deleteReport,
  rejectPublication,
  resolveReport,
} from "../libraries/gallery/moderation";
import type { GalleryLibrary } from "../libraries/gallery/types";
import {
  useReports,
  useReviewQueue,
} from "../libraries/gallery/useReviewQueue";
import { PromptDialog } from "./PromptDialog";
import styles from "./LibrarySidebar.module.scss";

type Props = {
  // isAdminEmail result. The perms layer is the real gate; this just drives
  // whether the queries run and the UI renders.
  enabled: boolean;
};

export function ReviewQueue({ enabled }: Props) {
  const { pending, isLoading } = useReviewQueue(enabled);
  const { reports } = useReports(enabled);
  const [rejectTarget, setRejectTarget] = useState<GalleryLibrary | null>(null);

  if (!enabled) {
    return <div className={styles.browseStatus}>Admins only.</div>;
  }

  return (
    <div className={styles.browse}>
      <div className={styles.sectionTitle}>
        Pending review ({pending.length})
      </div>
      {isLoading && <div className={styles.browseStatus}>Loading…</div>}
      {!isLoading && pending.length === 0 && (
        <div className={styles.browseStatus}>Nothing waiting for review.</div>
      )}
      {pending.length > 0 && (
        <div className={styles.browseList}>
          {pending.map((entry) => (
            <PendingCard
              key={entry.id}
              entry={entry}
              onApprove={() => approvePublication(entry.id)}
              onReject={() => setRejectTarget(entry)}
            />
          ))}
        </div>
      )}

      <div className={styles.divider} />

      <div className={styles.sectionTitle}>Reports ({reports.length})</div>
      {reports.length === 0 ? (
        <div className={styles.browseStatus}>No open reports.</div>
      ) : (
        <div className={styles.browseList}>
          {reports.map((r) => (
            <div key={r.id} className={styles.reportRow}>
              <div className={styles.reportReason}>{r.reason}</div>
              <div className={styles.reportMeta}>{r.librarySlug}</div>
              {r.detail && <div className={styles.reportDetail}>{r.detail}</div>}
              <div className={styles.reviewActions}>
                <button
                  type="button"
                  className={styles.cardLink}
                  onClick={() => resolveReport(r.id)}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  className={styles.cardLink}
                  onClick={() => deleteReport(r.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PromptDialog
        open={rejectTarget !== null}
        title={rejectTarget ? `Reject "${rejectTarget.name}"` : ""}
        message="The author sees this note. Explain what needs to change."
        label="Rejection reason"
        initialValue=""
        confirmLabel="Reject"
        onCancel={() => setRejectTarget(null)}
        onConfirm={(note) => {
          if (rejectTarget) rejectPublication(rejectTarget.id, note);
          setRejectTarget(null);
        }}
      />
    </div>
  );
}

type PendingCardProps = {
  entry: GalleryLibrary;
  onApprove: () => void;
  onReject: () => void;
};

function PendingCard({ entry, onApprove, onReject }: PendingCardProps) {
  // Collapsed by default — the admin expands to inspect every item's image
  // before approving. Previews live in the stored payload, so no extra fetch.
  const [showItems, setShowItems] = useState(false);
  const items = entry.payload.libraryItems;

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
          <span className={styles.cardLicense}>{entry.license}</span>
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
        {entry.tags.length > 0 && (
          <div className={styles.cardTags}>
            {entry.tags.map((t) => (
              <span key={t} className={styles.cardTag}>
                {t}
              </span>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <button
            type="button"
            className={styles.cardLink}
            onClick={() => setShowItems((v) => !v)}
            aria-expanded={showItems}
          >
            {showItems
              ? "Hide images"
              : `Review ${items.length} image${items.length === 1 ? "" : "s"}`}
          </button>
        )}
        {showItems && (
          <div className={styles.reviewItemsGrid}>
            {items.map((item) => (
              <div
                key={item.id}
                className={styles.reviewItemTile}
                title={item.name}
              >
                {item.preview ? (
                  <img src={item.preview} alt={item.name} loading="lazy" />
                ) : (
                  <span>{item.name}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={styles.reviewActions}>
          <button type="button" className={styles.approveBtn} onClick={onApprove}>
            Approve
          </button>
          <button type="button" className={styles.rejectBtn} onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
