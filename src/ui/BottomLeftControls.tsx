import { useAppState } from "../store/appState";
import styles from "./BottomLeftControls.module.scss";

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 0 1 0 10h-2" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 14l4-4-4-4" />
      <path d="M19 10h-9a5 5 0 0 0 0 10h2" />
    </svg>
  );
}

function ZenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 16c2 0 5-2 7-2s5 2 7 2" />
      <path d="M5 12c2 0 5-2 7-2s5 2 7 2" />
      <circle cx="12" cy="7" r="2" />
    </svg>
  );
}

function ViewModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SnapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="6" y1="4" x2="9" y2="4" />
      <line x1="15" y1="4" x2="18" y2="4" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

export function BottomLeftControls() {
  const undo = useAppState((s) => s.undo);
  const redo = useAppState((s) => s.redo);
  const past = useAppState((s) => s.past);
  const future = useAppState((s) => s.future);
  const zenMode = useAppState((s) => s.zenMode);
  const setZenMode = useAppState((s) => s.setZenMode);
  const viewMode = useAppState((s) => s.viewMode);
  const setViewMode = useAppState((s) => s.setViewMode);
  const snapToObjects = useAppState((s) => s.snapToObjects);
  const setSnapToObjects = useAppState((s) => s.setSnapToObjects);

  const activeModes: {
    key: string;
    label: string;
    icon: React.ReactNode;
    off: () => void;
  }[] = [];
  if (zenMode) {
    activeModes.push({
      key: "zen",
      label: "Zen mode",
      icon: <ZenIcon />,
      off: () => setZenMode(false),
    });
  }
  if (viewMode) {
    activeModes.push({
      key: "view",
      label: "View mode",
      icon: <ViewModeIcon />,
      off: () => setViewMode(false),
    });
  }
  if (snapToObjects) {
    activeModes.push({
      key: "snap",
      label: "Snap to objects",
      icon: <SnapIcon />,
      off: () => setSnapToObjects(false),
    });
  }

  return (
    <div className={styles.dock} role="toolbar" aria-label="Canvas controls">
      <div className={styles.group}>
        <button
          type="button"
          className={styles.button}
          onClick={undo}
          disabled={past.length === 0}
          title="Undo"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={redo}
          disabled={future.length === 0}
          title="Redo"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
      </div>
      {activeModes.length > 0 && (
        <div className={styles.group}>
          {activeModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className={`${styles.button} ${styles.modeChip}`}
              onClick={mode.off}
              title={`Turn off ${mode.label}`}
              aria-label={`Turn off ${mode.label}`}
            >
              {mode.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
