import { useEffect, useState } from "react";
import { REPORT_REASONS } from "../libraries/gallery/types";
import styles from "./ReportDialog.module.scss";

type Props = {
  open: boolean;
  libraryName: string;
  onCancel: () => void;
  onSubmit: (reason: string, detail: string) => void;
};

export function ReportDialog({ open, libraryName, onCancel, onSubmit }: Props) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason(REPORT_REASONS[0]);
    setDetail("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason, detail.trim());
        }}
      >
        <h2 id="report-title" className={styles.title}>
          Report “{libraryName}”
        </h2>
        <p className={styles.message}>
          Tell us what's wrong. A maintainer reviews every report.
        </p>

        <label className={styles.label} htmlFor="report-reason">
          Reason
        </label>
        <select
          id="report-reason"
          className={styles.select}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="report-detail">
          Details (optional)
        </label>
        <textarea
          id="report-detail"
          className={styles.textarea}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          placeholder="Anything that helps us understand the issue…"
        />

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className={styles.dangerButton}>
            Submit report
          </button>
        </div>
      </form>
    </div>
  );
}
