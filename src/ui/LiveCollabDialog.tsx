import { useEffect, useMemo, useRef, useState } from "react";
import type { Peer } from "../collab/usePresence";
import { useAppState } from "../store/appState";
import styles from "./LiveCollabDialog.module.scss";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5l4 4M4 20l4.5-1 11-11-3-3-11 11L4 20z" />
    </svg>
  );
}

type Props = {
  peers: readonly Peer[];
  isOwner: boolean;
  sharingActive: boolean;
  setSharingActive: (active: boolean) => void;
};

const STACK_LIMIT = 4;

export function LiveCollabDialog({
  peers,
  isOwner,
  sharingActive,
  setSharingActive,
}: Props) {
  const open = useAppState((s) => s.liveCollabOpen);
  const setOpen = useAppState((s) => s.setLiveCollabOpen);
  const userName = useAppState((s) => s.userName);
  const userColor = useAppState((s) => s.userColor);
  const setUserName = useAppState((s) => s.setUserName);
  const roomEncrypted = useAppState((s) => s.roomEncrypted);
  const roomKey = useAppState((s) => s.roomKey);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setEditingName(false);
    }
  }, [open]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const everyone = useMemo(
    () => [
      { id: "self", name: userName, color: userColor, you: true },
      ...peers.map((p) => ({
        id: p.userId,
        name: p.name,
        color: p.color,
        you: false,
      })),
    ],
    [peers, userName, userColor],
  );

  if (!open) return null;

  const link = window.location.href;
  const e2e = roomEncrypted && !!roomKey;
  const missingKey = roomEncrypted && !roomKey;
  const canInvite = sharingActive && !missingKey;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      inputRef.current?.select();
    }
  };

  const visibleStack = everyone.slice(0, STACK_LIMIT);
  const overflow = Math.max(0, everyone.length - STACK_LIMIT);

  const statusLabel = sharingActive
    ? "Live session"
    : isOwner
      ? "Session paused"
      : "Session ended";

  const description = sharingActive
    ? "Share the invite link to draw on this canvas with others in real time."
    : isOwner
      ? "While paused, only you can edit. Resume to let people reconnect with the same link."
      : "The owner has stopped sharing this canvas.";

  const subStatus = sharingActive
    ? `${everyone.length} ${everyone.length === 1 ? "person" : "people"} · ${e2e ? "end-to-end encrypted" : roomEncrypted ? "missing key" : "not encrypted"}`
    : isOwner
      ? "Resume to let people reconnect"
      : "The owner stopped sharing";

  return (
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Live collaboration"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className={styles.hero}>
          <span
            className={`${styles.heroDot} ${sharingActive ? styles.heroDotLive : styles.heroDotOff}`}
            aria-hidden="true"
          />
          <h2 className={styles.heroTitle}>{statusLabel}</h2>
          <p className={styles.heroDescription}>{description}</p>
          {sharingActive && <p className={styles.heroMeta}>{subStatus}</p>}
        </div>

        {missingKey && (
          <div className={styles.alert}>
            The room key isn't in this URL. Ask whoever shared the link to
            send the full address.
          </div>
        )}

        {!roomEncrypted && !missingKey && (
          <div className={styles.note}>
            This room is not encrypted. Start a new canvas for E2E
            protection.
          </div>
        )}

        {canInvite ? (
          <button
            type="button"
            className={`${styles.invite} ${copied ? styles.inviteDone : ""}`}
            onClick={copyLink}
          >
            <span className={styles.inviteIcon} aria-hidden="true">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </span>
            <span className={styles.inviteLabel}>
              {copied ? "Link copied" : "Copy invite link"}
            </span>
            <span className={styles.inviteHint}>
              {copied ? "Share it privately" : "Anyone with the link can edit"}
            </span>
          </button>
        ) : isOwner && !sharingActive ? (
          <button
            type="button"
            className={styles.resume}
            onClick={() => setSharingActive(true)}
          >
            Resume session
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="text"
          readOnly
          value={link}
          className={styles.srOnlyInput}
          tabIndex={-1}
          aria-hidden="true"
        />

        {everyone.length > 1 && sharingActive && (
          <div className={styles.peopleRow}>
            <div className={styles.stack} aria-label="People in room">
              {visibleStack.map((p) => (
                <span
                  key={p.id}
                  className={styles.stackAvatar}
                  style={{ background: p.color }}
                  title={p.you ? `${p.name} (you)` : p.name}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {overflow > 0 && (
                <span className={`${styles.stackAvatar} ${styles.stackMore}`}>
                  +{overflow}
                </span>
              )}
            </div>
            <span className={styles.peopleLabel}>
              {everyone.length === 2
                ? "You and 1 other"
                : `You and ${everyone.length - 1} others`}
            </span>
          </div>
        )}

        <div className={styles.identity}>
          <span
            className={styles.identityAvatar}
            style={{ background: userColor }}
            aria-hidden="true"
          >
            {userName.slice(0, 1).toUpperCase()}
          </span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape")
                  setEditingName(false);
              }}
              className={styles.identityInput}
              maxLength={40}
              aria-label="Your name"
            />
          ) : (
            <button
              type="button"
              className={styles.identityButton}
              onClick={() => setEditingName(true)}
            >
              <span className={styles.identityName}>{userName}</span>
              <span className={styles.identityTag}>
                {isOwner ? "owner" : "you"}
              </span>
              <span className={styles.identityEdit} aria-hidden="true">
                <PencilIcon />
              </span>
            </button>
          )}
        </div>

        {isOwner && sharingActive && (
          <button
            type="button"
            className={styles.endLink}
            onClick={() => setSharingActive(false)}
          >
            End session
          </button>
        )}
      </div>
    </div>
  );
}
