import { useEffect, useState } from "react";
import { downloadLibraryFileAsJson } from "../libraries/exportLibrary";
import {
  submissionGuideUrl,
  submitLibraryIssueUrl,
} from "../libraries/marketplace/links";
import type { LibraryItem, ScribblyLibrary } from "../libraries/types";
import styles from "./SubmitLibraryDialog.module.scss";

type Props = {
  open: boolean;
  library: ScribblyLibrary | null;
  items: readonly LibraryItem[];
  onClose: () => void;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4L10 14M18 14v6H4V6h6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v12M6 11l6 6 6-6M4 21h16" />
    </svg>
  );
}

export function SubmitLibraryDialog({ open, library, items, onClose }: Props) {
  // Step progression is purely local UI state — once the user closes the
  // dialog we don't remember it; submitting is a one-shot guided flow.
  const [exported, setExported] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!open) {
      setExported(false);
      setOpened(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !library) return null;

  const itemCount = items.length;
  const canSubmit = itemCount > 0;

  const handleExport = () => {
    if (!canSubmit) return;
    downloadLibraryFileAsJson(library, items);
    setExported(true);
  };

  const handleOpenIssue = () => {
    const url = submitLibraryIssueUrl({
      name: library.name,
      itemCount,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="submit-title" className={styles.title}>
            Submit “{library.name}” to the gallery
          </h2>
          <p className={styles.subtitle}>
            Two steps — fill the structured form on GitHub, attach your
            file. A bot opens a pull request automatically and a maintainer
            merges it. No coding required.
          </p>
        </div>

        <div className={styles.steps}>
          <Step
            number={1}
            done={exported}
            title="Download your library file"
            hint={
              canSubmit
                ? `Saves <name>.scribblylib.json (${itemCount} item${
                    itemCount === 1 ? "" : "s"
                  }) to your downloads. We use .json so GitHub accepts the attachment — Scribbly still imports it fine.`
                : "Add at least one item to your library before submitting."
            }
            action={
              <button
                type="button"
                className={styles.stepAction}
                onClick={handleExport}
                disabled={!canSubmit}
              >
                <DownloadIcon />
                {exported ? "Re-download" : "Download .scribblylib.json"}
              </button>
            }
          />

          <Step
            number={2}
            done={opened}
            title="Open the submission form on GitHub"
            hint="A structured form opens — name and slug are pre-filled. Pick a license from the dropdown, check the tags that fit, write a 1–2 sentence description, and drag your downloaded .scribblylib.json into the Library file box. Submit. A bot opens a pull request, a maintainer merges. You'll get a notification when it goes live."
            action={
              <button
                type="button"
                className={styles.stepAction}
                onClick={handleOpenIssue}
                disabled={!exported}
              >
                <ExternalIcon />
                {opened ? "Reopen form" : "Open submission form"}
              </button>
            }
          />
        </div>

        <div className={styles.guideLink}>
          New to this?{" "}
          <a
            href={submissionGuideUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the submission guide →
          </a>
        </div>

        <div className={styles.actions}>
          <span />
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type StepProps = {
  number: number;
  done: boolean;
  title: string;
  hint: string;
  action?: React.ReactNode;
};

function Step({ number, done, title, hint, action }: StepProps) {
  return (
    <div className={`${styles.step} ${done ? styles.done : ""}`}>
      <div className={styles.bullet}>{done ? <CheckIcon /> : number}</div>
      <div className={styles.stepBody}>
        <div className={styles.stepTitle}>{title}</div>
        <div className={styles.stepHint}>{hint}</div>
        {action}
      </div>
    </div>
  );
}
