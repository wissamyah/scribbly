import { useEffect, useRef, useState } from "react";
import type { FrameElement } from "../canvas/elements";
import { useAppState } from "../store/appState";
import {
  copyFrameToClipboard,
  copySceneToClipboard,
  exportFramesAsPNG,
  exportFramesAsSVG,
  exportSceneAsPNG,
  exportSceneAsSVG,
} from "../utils/export";
import styles from "./ShareExport.module.scss";

type Feedback = { kind: "success" | "error"; message: string } | null;

const FEEDBACK_TIMEOUT_MS = 1800;

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v14" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 8h.01" />
      <path d="M12 20h-5a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v5" />
      <path d="M4 15l4 -4c.928 -.893 2.072 -.893 3 0l4 4" />
      <path d="M14 14l1 -1c.617 -.593 1.328 -.793 2.009 -.598" />
      <path d="M19 16v6" />
      <path d="M22 19l-3 3l-3 -3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.542 8.542H6.458a2.5 2.5 0 0 0-2.5 2.5v3.75a2.5 2.5 0 0 0 2.5 2.5h7.084a2.5 2.5 0 0 0 2.5-2.5v-3.75a2.5 2.5 0 0 0-2.5-2.5Z" />
      <path d="M10 13.958a1.042 1.042 0 1 0 0-2.083 1.042 1.042 0 0 0 0 2.083Z" />
      <path d="M6.667 8.333V5.417C6.667 3.806 8.159 2.5 10 2.5c1.841 0 3.333 1.306 3.333 2.917v2.916" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
    </svg>
  );
}

function useTransientFeedback(): [Feedback, (f: Feedback) => void] {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);
  const announce = (next: Feedback) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setFeedback(next);
    if (next) {
      timerRef.current = window.setTimeout(() => {
        setFeedback(null);
        timerRef.current = null;
      }, FEEDBACK_TIMEOUT_MS);
    }
  };
  return [feedback, announce];
}

type ShareExportProps = {
  roomId: string;
  sharingActive: boolean;
  isOwner: boolean;
};

export function ShareExport({ roomId, sharingActive, isOwner }: ShareExportProps) {
  const elements = useAppState((s) => s.elements);
  const selectedIds = useAppState((s) => s.selectedIds);
  const setLiveCollabOpen = useAppState((s) => s.setLiveCollabOpen);
  const roomEncrypted = useAppState((s) => s.roomEncrypted);
  const roomKey = useAppState((s) => s.roomKey);
  const isE2E = roomEncrypted && !!roomKey;
  const ownerPaused = isOwner && !sharingActive;
  const [feedback, announce] = useTransientFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      announce({ kind: "success", message: "Room link copied" });
    } catch {
      announce({ kind: "error", message: "Couldn't copy link" });
    }
  };

  const hasElements = elements.some((el) => !el.isDeleted);
  const selectedFrames: FrameElement[] = (() => {
    if (selectedIds.length === 0) return [];
    const set = new Set(selectedIds);
    const out: FrameElement[] = [];
    for (const el of elements) {
      if (el.isDeleted) continue;
      if (el.type !== "frame") continue;
      if (set.has(el.id)) out.push(el);
    }
    return out;
  })();
  const frameCount = selectedFrames.length;
  const framesNoun = frameCount === 1 ? "frame" : "frames";

  const downloadFramesPNG = async () => {
    setMenuOpen(false);
    if (frameCount === 0) return;
    const n = await exportFramesAsPNG(selectedFrames, elements);
    announce(
      n > 0
        ? { kind: "success", message: `Exported ${n} ${framesNoun} as PNG` }
        : { kind: "error", message: "Couldn't export frames" },
    );
  };

  const downloadFramesSVG = () => {
    setMenuOpen(false);
    if (frameCount === 0) return;
    const n = exportFramesAsSVG(selectedFrames, elements);
    announce(
      n > 0
        ? { kind: "success", message: `Exported ${n} ${framesNoun} as SVG` }
        : { kind: "error", message: "Couldn't export frames" },
    );
  };

  const copyFrameImage = async () => {
    setMenuOpen(false);
    if (frameCount !== 1) return;
    const ok = await copyFrameToClipboard(selectedFrames[0]!, elements);
    announce(
      ok
        ? { kind: "success", message: "Frame copied" }
        : { kind: "error", message: "Copy not supported here" },
    );
  };

  const downloadPNG = async () => {
    setMenuOpen(false);
    if (!hasElements) {
      announce({ kind: "error", message: "Nothing to export" });
      return;
    }
    await exportSceneAsPNG(elements);
    announce({ kind: "success", message: "PNG downloaded" });
  };

  const downloadSVG = () => {
    setMenuOpen(false);
    if (!hasElements) {
      announce({ kind: "error", message: "Nothing to export" });
      return;
    }
    exportSceneAsSVG(elements);
    announce({ kind: "success", message: "SVG downloaded" });
  };

  const copyImage = async () => {
    setMenuOpen(false);
    if (!hasElements) {
      announce({ kind: "error", message: "Nothing to copy" });
      return;
    }
    const ok = await copySceneToClipboard(elements);
    announce(
      ok
        ? { kind: "success", message: "Image copied" }
        : { kind: "error", message: "Copy not supported here" },
    );
  };

  return (
    <div className={styles.dock}>
      <div className={styles.cluster} ref={menuRef}>
        <div className={styles.exportWrap}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Export"
          >
            <ExportIcon />
            <span>Export</span>
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              {frameCount > 0 && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={downloadFramesPNG}
                  >
                    {frameCount === 1
                      ? "Export frame as PNG"
                      : `Export ${frameCount} frames as PNG`}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={downloadFramesSVG}
                  >
                    {frameCount === 1
                      ? "Export frame as SVG"
                      : `Export ${frameCount} frames as SVG`}
                  </button>
                  {frameCount === 1 && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={copyFrameImage}
                    >
                      Copy frame to clipboard
                    </button>
                  )}
                  <div
                    role="separator"
                    style={{
                      height: 1,
                      background: "var(--border-1)",
                      margin: "4px 0",
                    }}
                  />
                </>
              )}
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={downloadPNG}
              >
                Download as PNG
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={downloadSVG}
              >
                Download as SVG
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={copyImage}
              >
                Copy image to clipboard
              </button>
            </div>
          )}
        </div>
        <div className={styles.liveStack}>
          <button
            type="button"
            className={`${styles.button} ${ownerPaused ? styles.livePaused : ""}`}
            onClick={() => setLiveCollabOpen(true)}
            title={
              ownerPaused
                ? "Live session paused · click to manage"
                : isE2E
                  ? "Live collaboration · end-to-end encrypted"
                  : "Live collaboration"
            }
          >
            <PeopleIcon />
            <span className={styles.liveLabel}>
              {ownerPaused ? "Paused" : "Collaborate"}
            </span>
            <span
              className={`${styles.liveStatusDot} ${sharingActive ? styles.liveStatusDotOn : styles.liveStatusDotOff}`}
              aria-hidden="true"
            />
            {isE2E && (
              <span
                className={styles.liveLock}
                aria-label="End-to-end encrypted"
                title="End-to-end encrypted"
              >
                <LockIcon />
              </span>
            )}
          </button>
          <span className={styles.sessionId} title={`Session ID: ${roomId}`}>
            {roomId.slice(0, 8)}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={share}
          title="Copy room link"
        >
          <ShareIcon />
          <span>Share</span>
        </button>
      </div>
      <div
        className={`${styles.feedback} ${feedback ? styles.feedbackVisible : ""} ${feedback?.kind === "error" ? styles.error : ""}`}
        role="status"
        aria-live="polite"
      >
        {feedback && (
          <>
            <span className={styles.feedbackIcon} aria-hidden="true">
              {feedback.kind === "error" ? (
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M5 12l5 5 9-11" />
                </svg>
              )}
            </span>
            <span>{feedback.message}</span>
          </>
        )}
      </div>
    </div>
  );
}
