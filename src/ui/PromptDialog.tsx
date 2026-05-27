import { useEffect, useRef, useState } from "react";
import styles from "./PromptDialog.module.scss";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptDialog({
  open,
  title,
  message,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onConfirm(trimmed);
  };

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="prompt-title" className={styles.title}>
          {title}
        </h2>
        {message && <p className={styles.message}>{message}</p>}
        {label && (
          <label className={styles.label} htmlFor="prompt-input">
            {label}
          </label>
        )}
        <input
          id="prompt-input"
          ref={inputRef}
          type="text"
          className={styles.input}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
