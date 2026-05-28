import { useEffect, useRef, useState } from "react";
import { db } from "../db/instant";
import styles from "./SignInDialog.module.scss";

type Props = {
  open: boolean;
  // Optional context line ("Sign in to submit your library to the gallery").
  reason?: string | null;
  onClose: () => void;
};

type Step = { kind: "email" } | { kind: "code"; email: string };

function errorMessage(err: unknown): string {
  const body = (err as { body?: { message?: string } })?.body;
  if (body?.message) return body.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export function SignInDialog({ open, reason, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset to a clean state whenever the dialog opens; bind Escape-to-close.
  useEffect(() => {
    if (!open) return;
    setStep({ kind: "email" });
    setEmail("");
    setCode("");
    setBusy(false);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, step.kind]);

  if (!open) return null;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await db.auth.sendMagicCode({ email: trimmed });
      setStep({ kind: "code", email: trimmed });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await db.auth.signInWithMagicCode({ email: step.email, code: trimmed });
      // useAuth state flips to signed-in across the app; close the modal.
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={step.kind === "email" ? sendCode : verifyCode}
      >
        <h2 id="signin-title" className={styles.title}>
          {step.kind === "email" ? "Sign in to Scribbly" : "Enter your code"}
        </h2>
        <p className={styles.message}>
          {step.kind === "email"
            ? (reason ??
              "Enter your email and we'll send you a one-time code. No password — we'll create your account if you don't have one.")
            : `We sent a 6-digit code to ${step.email}. Paste it below.`}
        </p>

        {step.kind === "email" ? (
          <input
            ref={inputRef}
            type="email"
            className={styles.input}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            spellCheck={false}
            required
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className={styles.input}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            spellCheck={false}
            required
          />
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {step.kind === "code" ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setStep({ kind: "email" });
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
          )}
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            {busy
              ? "Working…"
              : step.kind === "email"
                ? "Send code"
                : "Verify"}
          </button>
        </div>
      </form>
    </div>
  );
}
