import { worldToScreen } from "../canvas/geometry";
import type { Peer } from "../collab/usePresence";
import { useAppState } from "../store/appState";
import styles from "./PeersCursors.module.scss";

type Props = { peers: readonly Peer[] };

export function PeersCursors({ peers }: Props) {
  const view = useAppState((s) => s.view);
  if (peers.length === 0) return null;
  return (
    <div className={styles.layer} aria-hidden="true">
      {peers.map((peer) => {
        if (!peer.cursor) return null;
        const screen = worldToScreen(view, peer.cursor.x, peer.cursor.y);
        return (
          <div
            key={peer.userId}
            className={styles.cursor}
            style={{ transform: `translate(${screen.x}px, ${screen.y}px)` }}
          >
            <svg
              viewBox="0 0 24 24"
              className={styles.pointer}
              style={{ color: peer.color }}
            >
              <path
                d="M5 3 L19 12 L12 13 L9 21 Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className={styles.label}
              style={{ background: peer.color }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
