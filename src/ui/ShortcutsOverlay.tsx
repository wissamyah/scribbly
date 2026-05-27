import { Fragment, useEffect, useState } from "react";
import styles from "./ShortcutsOverlay.module.scss";

type Shortcut = { label: string; keys: string[] };
type Section = { title: string; entries: Shortcut[] };

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const SECTIONS: Section[] = [
  {
    title: "Tools",
    entries: [
      { label: "Selection", keys: ["1"] },
      { label: "Rectangle", keys: ["2"] },
      { label: "Ellipse", keys: ["3"] },
      { label: "Line", keys: ["4"] },
      { label: "Arrow", keys: ["5"] },
      { label: "Free draw", keys: ["6"] },
      { label: "Text", keys: ["T"] },
      { label: "Eraser", keys: ["E"] },
    ],
  },
  {
    title: "Edit",
    entries: [
      { label: "Undo", keys: [MOD, "Z"] },
      { label: "Redo", keys: [MOD, "Shift", "Z"] },
      { label: "Select all", keys: [MOD, "A"] },
      { label: "Duplicate selection", keys: [MOD, "D"] },
      { label: "Delete", keys: ["Delete"] },
    ],
  },
  {
    title: "View",
    entries: [
      { label: "Pan canvas", keys: ["Space", "Drag"] },
      { label: "Zoom", keys: [MOD, "Scroll"] },
    ],
  },
  {
    title: "Other",
    entries: [
      { label: "Cancel / clear", keys: ["Esc"] },
      { label: "Toggle this overlay", keys: ["?"] },
    ],
  },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inEditable) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open ? (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className={styles.panel}>
            <div className={styles.header}>
              <h2 className={styles.title}>Keyboard shortcuts</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <p className={styles.sectionTitle}>{section.title}</p>
                <dl className={styles.list}>
                  {section.entries.map((entry) => (
                    <Fragment key={entry.label}>
                      <dt className={styles.label}>{entry.label}</dt>
                      <dd className={styles.keys}>
                        {entry.keys.map((k, i) => (
                          <span key={i} className={styles.key}>
                            {k}
                          </span>
                        ))}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
