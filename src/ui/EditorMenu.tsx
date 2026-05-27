import { useEffect, useRef, useState } from "react";
import {
  CANVAS_BACKGROUNDS,
  useAppState,
  type CanvasBackground,
} from "../store/appState";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./EditorMenu.module.scss";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 4.167V2.5M14.167 5.833l1.166-1.166M15.833 10H17.5M14.167 14.167l1.166 1.166M10 15.833V17.5M5.833 14.167l-1.166 1.166M5 10H3.333M5.833 5.833 4.667 4.667" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        clipRule="evenodd"
        d="M10 2.5h.328a6.25 6.25 0 0 0 6.6 10.372A7.5 7.5 0 1 1 10 2.493V2.5Z"
      />
    </svg>
  );
}

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
function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="12" y1="6" x2="12" y2="18" />
    </svg>
  );
}
function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}
function ResetZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V5h4" />
      <path d="M20 9V5h-4" />
      <path d="M4 15v4h4" />
      <path d="M20 15v4h-4" />
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
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="10" y1="4" x2="10" y2="20" />
      <line x1="14" y1="4" x2="14" y2="20" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}
function SelectAllIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.333 5.833h13.334M8.333 9.167v5M11.667 9.167v5M4.167 5.833l.833 10c0 .92.746 1.667 1.667 1.667h6.666c.92 0 1.667-.746 1.667-1.667l.833-10M7.5 5.833v-2.5c0-.46.373-.833.833-.833h3.334c.46 0 .833.373.833.833v2.5" />
    </svg>
  );
}
function BackgroundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 11l8 4 8-4" />
      <path d="M4 15l8 4 8-4" />
    </svg>
  );
}

type Shortcut = string[];

type MenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  shortcut?: Shortcut;
  disabled?: boolean;
  toggled?: boolean;
};

export function EditorMenu() {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const zoomIn = useAppState((s) => s.zoomIn);
  const zoomOut = useAppState((s) => s.zoomOut);
  const resetView = useAppState((s) => s.resetView);
  const zoomToFit = useAppState((s) => s.zoomToFit);
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
  const showGrid = useAppState((s) => s.showGrid);
  const setShowGrid = useAppState((s) => s.setShowGrid);
  const selectAll = useAppState((s) => s.selectAll);
  const clearCanvas = useAppState((s) => s.clearCanvas);
  const canvasBackground = useAppState((s) => s.canvasBackground);
  const setCanvasBackground = useAppState((s) => s.setCanvasBackground);
  const theme = useAppState((s) => s.theme);
  const toggleTheme = useAppState((s) => s.toggleTheme);

  const isCustomBg = !CANVAS_BACKGROUNDS.includes(canvasBackground);
  const [showHexInput, setShowHexInput] = useState(isCustomBg);
  const [hexInput, setHexInput] = useState(isCustomBg ? canvasBackground : "");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (drawerRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const items: MenuItem[] = [
    {
      key: "undo",
      label: "Undo",
      icon: <UndoIcon />,
      shortcut: [MOD, "Z"],
      onClick: () => {
        undo();
        close();
      },
      disabled: past.length === 0,
    },
    {
      key: "redo",
      label: "Redo",
      icon: <RedoIcon />,
      shortcut: [MOD, "Shift", "Z"],
      onClick: () => {
        redo();
        close();
      },
      disabled: future.length === 0,
    },
    {
      key: "zoomIn",
      label: "Zoom in",
      icon: <ZoomInIcon />,
      shortcut: [MOD, "+"],
      onClick: () => {
        zoomIn();
      },
    },
    {
      key: "zoomOut",
      label: "Zoom out",
      icon: <ZoomOutIcon />,
      shortcut: [MOD, "-"],
      onClick: () => {
        zoomOut();
      },
    },
    {
      key: "resetZoom",
      label: "Reset zoom",
      icon: <ResetZoomIcon />,
      shortcut: [MOD, "0"],
      onClick: () => {
        resetView();
        close();
      },
    },
    {
      key: "fit",
      label: "Zoom to fit all elements",
      icon: <FitIcon />,
      shortcut: ["Shift", "1"],
      onClick: () => {
        zoomToFit({ width: window.innerWidth, height: window.innerHeight });
        close();
      },
    },
    {
      key: "zen",
      label: "Zen mode",
      icon: <ZenIcon />,
      onClick: () => {
        setZenMode(!zenMode);
        close();
      },
      toggled: zenMode,
    },
    {
      key: "view",
      label: "View mode",
      icon: <ViewModeIcon />,
      onClick: () => {
        setViewMode(!viewMode);
        close();
      },
      toggled: viewMode,
    },
    {
      key: "snap",
      label: "Snap to objects",
      icon: <SnapIcon />,
      onClick: () => {
        setSnapToObjects(!snapToObjects);
      },
      toggled: snapToObjects,
    },
    {
      key: "grid",
      label: "Show grid",
      icon: <GridIcon />,
      onClick: () => {
        setShowGrid(!showGrid);
      },
      toggled: showGrid,
    },
    {
      key: "help",
      label: "Shortcuts & help",
      icon: <HelpIcon />,
      shortcut: ["?"],
      onClick: () => {
        close();
        // Synthesize the "?" keydown so ShortcutsOverlay toggles itself.
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "?", bubbles: true }),
        );
      },
    },
    {
      key: "selectAll",
      label: "Select all",
      icon: <SelectAllIcon />,
      shortcut: [MOD, "A"],
      onClick: () => {
        selectAll();
        close();
      },
    },
    {
      key: "clear",
      label: "Clear canvas",
      icon: <ClearIcon />,
      onClick: () => {
        setConfirmClearOpen(true);
        close();
      },
    },
  ];

  const isDark = theme === "dark";
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.active : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Editor menu"
        aria-label="Editor menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <HamburgerIcon />
      </button>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={isDark}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
      {open && (
        <div ref={drawerRef} className={styles.drawer} role="menu">
          <div className={styles.header}>Editor</div>
          <div className={styles.section}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.toggled ? styles.toggled : ""}`}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.shortcut && (
                  <span className={styles.shortcut}>
                    {item.shortcut.map((k) => (
                      <kbd key={k} className={styles.kbd}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                )}
                {item.toggled !== undefined && !item.shortcut && (
                  <span className={styles.toggle}>
                    {item.toggled ? "On" : "Off"}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className={styles.divider} />
          <div className={styles.subhead}>
            <BackgroundIcon />
            <span>Canvas background</span>
          </div>
          <div className={styles.swatches}>
            {CANVAS_BACKGROUNDS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.swatch} ${
                  canvasBackground === c ? styles.swatchActive : ""
                }`}
                onClick={() => {
                  setCanvasBackground(c as CanvasBackground);
                  setShowHexInput(false);
                }}
                aria-label={`Background ${c}`}
                style={{ background: c }}
              />
            ))}
            <button
              type="button"
              className={`${styles.swatch} ${styles.swatchCustom} ${
                isCustomBg ? styles.swatchActive : ""
              }`}
              onClick={() => setShowHexInput((v) => !v)}
              aria-label="Custom background color"
              aria-expanded={showHexInput}
            />
          </div>
          {showHexInput && (
            <div className={styles.hexInputWrap}>
              <input
                type="text"
                className={styles.hexInput}
                value={hexInput}
                placeholder="#RRGGBB"
                spellCheck={false}
                maxLength={7}
                onChange={(e) => {
                  const v = e.target.value;
                  setHexInput(v);
                  const normalized = v.startsWith("#") ? v : `#${v}`;
                  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
                    setCanvasBackground(normalized.toLowerCase());
                  }
                }}
                aria-label="Custom background hex code"
              />
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear the canvas?"
        message="This removes every element from the canvas. You can undo this action with ⌘Z."
        confirmLabel="Clear canvas"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          clearCanvas();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </>
  );
}
