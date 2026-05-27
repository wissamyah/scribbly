import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./MoreToolsPopover.module.scss";
import toolbarStyles from "./Toolbar.module.scss";

export type OverflowTool = {
  name: string;
  label: string;
  shortcut: string;
  icon: ReactNode;
  disabled?: boolean;
  active: boolean;
  onSelect: () => void;
};

type Props = {
  tools: readonly OverflowTool[];
  triggerActive: boolean;
};

const MoreIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l-4 7h8z" />
    <circle cx="17" cy="17" r="3" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
  </svg>
);

export function MoreToolsPopover({ tools, triggerActive }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${toolbarStyles.button} ${triggerActive ? toolbarStyles.active : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More tools"
        title="More tools"
      >
        {MoreIcon}
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className={styles.popover}
          role="menu"
          aria-label="More tools"
        >
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              role="menuitem"
              className={`${styles.item} ${tool.active ? styles.itemActive : ""}`}
              disabled={tool.disabled}
              onClick={() => {
                tool.onSelect();
                close();
              }}
            >
              <span className={styles.itemIcon}>{tool.icon}</span>
              <span className={styles.itemLabel}>{tool.label}</span>
              {tool.shortcut ? (
                <span className={styles.itemShortcut}>{tool.shortcut}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
