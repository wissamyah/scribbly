import { useEffect } from "react";
import { useAppState } from "../store/appState";
import styles from "./SessionEndedScreen.module.scss";

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.542 8.542H6.458a2.5 2.5 0 0 0-2.5 2.5v3.75a2.5 2.5 0 0 0 2.5 2.5h7.084a2.5 2.5 0 0 0 2.5-2.5v-3.75a2.5 2.5 0 0 0-2.5-2.5Z" />
      <path d="M10 13.958a1.042 1.042 0 1 0 0-2.083 1.042 1.042 0 0 0 0 2.083Z" />
      <path d="M6.667 8.333V5.417C6.667 3.806 8.159 2.5 10 2.5c1.841 0 3.333 1.306 3.333 2.917v2.916" />
    </svg>
  );
}

/**
 * Rendered for peers (non-owners) when the room owner has stopped sharing.
 * The canvas tree is unmounted so element/presence subscriptions tear
 * down and nothing decrypted remains on screen. Elements are cleared from
 * memory on mount so refresh during a closed session shows the same page.
 */
export function SessionEndedScreen() {
  const setElements = useAppState((s) => s.setElements);
  const setSelectedIds = useAppState((s) => s.setSelectedIds);

  useEffect(() => {
    setElements([]);
    setSelectedIds([]);
  }, [setElements, setSelectedIds]);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          ■
        </div>
        <h1 className={styles.title}>Session ended</h1>
        <p className={styles.body}>
          The owner of this room has stopped the live session. You no
          longer have access to this canvas. If they resume sharing, this
          page will reconnect automatically.
        </p>
        <p className={styles.lockNote}>
          <LockIcon />
          <span>
            The room remains end-to-end encrypted — no plaintext was ever
            stored.
          </span>
        </p>
      </div>
    </div>
  );
}
