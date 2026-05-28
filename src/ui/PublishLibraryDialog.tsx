import { useEffect, useMemo, useState } from "react";

import type { Session } from "../auth/useSession";
import {
  publishLibrary,
  updateSubmissionMeta,
} from "../libraries/gallery/publish";
import {
  LICENSES,
  TAG_VOCAB,
  type GalleryLibrary,
} from "../libraries/gallery/types";
import type { LibraryItem, ScribblyLibrary } from "../libraries/types";
import styles from "./PublishLibraryDialog.module.scss";

type Props = {
  open: boolean;
  // Source library + items, required only when creating a new submission
  // (from My libraries). In edit mode these may be null.
  library: ScribblyLibrary | null;
  items: readonly LibraryItem[];
  session: Session;
  // When set, edit this existing submission's metadata instead of creating.
  existing?: GalleryLibrary | null;
  onClose: () => void;
  onPublished: (message: string) => void;
};

const NAME_MAX = 60;
const DESC_MAX = 280;

function defaultHandle(email: string | null): string {
  if (!email) return "";
  return email.split("@")[0] ?? "";
}

export function PublishLibraryDialog({
  open,
  library,
  items,
  session,
  existing,
  onClose,
  onPublished,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [license, setLicense] = useState<string>(LICENSES[0]);
  const [authorHandle, setAuthorHandle] = useState("");
  const [busy, setBusy] = useState(false);

  // Seed the form whenever the dialog opens. Edits prefill from the existing
  // submission; new submissions prefill name from the source library.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? library?.name ?? "");
    setDescription(existing?.description ?? "");
    setTags(existing?.tags ?? []);
    setLicense(existing?.license ?? LICENSES[0]);
    setAuthorHandle(existing?.authorHandle ?? defaultHandle(session.email));
    setBusy(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, existing, library, session.email, onClose]);

  const isEdit = !!existing;
  const itemCount = isEdit ? (existing?.itemCount ?? 0) : items.length;

  const canSubmit = useMemo(() => {
    return (
      !busy &&
      itemCount > 0 &&
      name.trim().length > 0 &&
      description.trim().length > 0 &&
      tags.length > 0 &&
      authorHandle.trim().length > 0 &&
      session.userId !== null
    );
  }, [busy, itemCount, name, description, tags, authorHandle, session.userId]);

  if (!open) return null;
  // New submissions need a source library; edits work off the stored payload.
  if (!isEdit && !library) return null;

  const toggleTag = (t: string) => {
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !session.userId) return;
    setBusy(true);
    const meta = {
      name: name.trim(),
      description: description.trim(),
      tags,
      license,
      authorHandle: authorHandle.trim(),
    };
    try {
      if (existing) {
        updateSubmissionMeta({
          galleryId: existing.id,
          currentVersion: existing.version,
          meta,
        });
        onPublished("Submission updated — back in review");
      } else if (library) {
        publishLibrary({ userId: session.userId, library, items, meta });
        onPublished("Submitted for review");
      }
      onClose();
    } catch (err) {
      setBusy(false);
      onPublished(`Could not submit: ${(err as Error).message}`);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.header}>
          <h2 id="publish-title" className={styles.title}>
            {existing ? "Update submission" : "Submit to the gallery"}
          </h2>
          <p className={styles.subtitle}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · A maintainer
            reviews every submission before it goes live.
          </p>
        </div>

        <label className={styles.label} htmlFor="pub-name">
          Name <span className={styles.count}>{name.length}/{NAME_MAX}</span>
        </label>
        <input
          id="pub-name"
          className={styles.input}
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Server Rack Icons"
          spellCheck={false}
        />

        <label className={styles.label} htmlFor="pub-desc">
          Description{" "}
          <span className={styles.count}>
            {description.length}/{DESC_MAX}
          </span>
        </label>
        <textarea
          id="pub-desc"
          className={styles.textarea}
          value={description}
          maxLength={DESC_MAX}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's in this library and who is it for?"
        />

        <span className={styles.label}>Tags (pick at least one)</span>
        <div className={styles.tagGrid}>
          {TAG_VOCAB.map((t) => (
            <button
              type="button"
              key={t}
              className={`${styles.tagChip} ${
                tags.includes(t) ? styles.tagChipActive : ""
              }`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pub-license">
              License
            </label>
            <select
              id="pub-license"
              className={styles.select}
              value={license}
              onChange={(e) => setLicense(e.target.value)}
            >
              {LICENSES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pub-handle">
              Author handle
            </label>
            <input
              id="pub-handle"
              className={styles.input}
              value={authorHandle}
              maxLength={40}
              onChange={(e) => setAuthorHandle(e.target.value)}
              placeholder="your-name"
              spellCheck={false}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!canSubmit}
          >
            {busy
              ? "Submitting…"
              : existing
                ? "Resubmit for review"
                : "Submit for review"}
          </button>
        </div>
      </form>
    </div>
  );
}
