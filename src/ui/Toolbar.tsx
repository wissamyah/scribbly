import { useRef, type ReactNode } from "react";
import { importImageFile } from "../canvas/imageImport";
import { useAppState } from "../store/appState";
import type { Shape3DVariant } from "../tools/shape3d/primitives";
import type { ToolName } from "../tools/types";
import { MoreToolsPopover, type OverflowTool } from "./MoreToolsPopover";
import styles from "./Toolbar.module.scss";

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M13.542 8.542H6.458a2.5 2.5 0 0 0-2.5 2.5v3.75a2.5 2.5 0 0 0 2.5 2.5h7.084a2.5 2.5 0 0 0 2.5-2.5v-3.75a2.5 2.5 0 0 0-2.5-2.5Z" />
    <path d="M10 13.958a1.042 1.042 0 1 0 0-2.083 1.042 1.042 0 0 0 0 2.083Z" />
    {locked ? (
      <path d="M6.667 8.333V5.417C6.667 3.806 8.159 2.5 10 2.5c1.841 0 3.333 1.306 3.333 2.917v2.916" />
    ) : (
      <path d="M6.667 8.333V5.417C6.667 3.806 8.159 2.5 10 2.5c1.841 0 3.333 1.306 3.333 2.917" />
    )}
  </svg>
);

const SelectionIcon = (
  <svg viewBox="0 0 22 22" aria-hidden="true">
    <path d="M6 6l4.153 11.793a0.365 .365 0 0 0 .331 .207a0.366 .366 0 0 0 .332 -.207l2.184 -4.793l4.787 -1.994a0.355 .355 0 0 0 .213 -.323a0.355 .355 0 0 0 -.213 -.323l-11.787 -4.36z" />
    <path d="M13.5 13.5l4.5 4.5" />
  </svg>
);
const HandIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
    <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
    <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
    <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
  </svg>
);
const RectangleIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);
const EllipseIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
  </svg>
);
const LineIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);
const ArrowIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <line x1="15" y1="16" x2="19" y2="12" />
    <line x1="15" y1="8" x2="19" y2="12" />
  </svg>
);
const FreeDrawIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      clipRule="evenodd"
      d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z"
    />
    <path d="m11.25 5.417 3.333 3.333" />
  </svg>
);
const TextIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <line x1="4" y1="20" x2="7" y2="20" />
    <line x1="14" y1="20" x2="21" y2="20" />
    <line x1="6.9" y1="15" x2="13.8" y2="15" />
    <line x1="10.2" y1="6.3" x2="16" y2="20" />
    <polyline points="5 20 11 4 13 4 20 20" />
  </svg>
);
const EraserIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
    <path d="M18 13.3l-6.3 -6.3" />
  </svg>
);
const FrameIcon = (
  // Bracket-style frame icon: four short corner marks suggesting a viewport.
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8V5h3" />
    <path d="M17 5h3v3" />
    <path d="M20 16v3h-3" />
    <path d="M7 19H4v-3" />
  </svg>
);
const LaserIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="rotate(90 10 10)"
    >
      <path
        clipRule="evenodd"
        d="m9.644 13.69 7.774-7.773a2.357 2.357 0 0 0-3.334-3.334l-7.773 7.774L8 12l1.643 1.69Z"
      />
      <path d="m13.25 3.417 3.333 3.333M10 10l2-2M5 15l3-3M2.156 17.894l1-1M5.453 19.029l-.144-1.407M2.377 11.887l.866 1.118M8.354 17.273l-1.194-.758M.953 14.652l1.408.13" />
    </g>
  </svg>
);
const CubeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8l8-4 8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4" />
    <path d="M20 8v8l-8 4" />
    <path d="M12 12v8" />
  </svg>
);
const CylinderIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="6" rx="7" ry="2.5" />
    <path d="M5 6v12" />
    <path d="M19 6v12" />
    <path d="M5 18a7 2.5 0 0 0 14 0" />
  </svg>
);
const ConeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l7 16" />
    <path d="M12 3l-7 16" />
    <ellipse cx="12" cy="19" rx="7" ry="2.5" />
  </svg>
);
const PyramidIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l-9 16" />
    <path d="M12 3l9 16" />
    <path d="M3 19h18" />
    <path d="M12 3l0 16" />
  </svg>
);

type Shape3DDef = {
  variant: Shape3DVariant;
  label: string;
  icon: ReactNode;
};

const SHAPE_3D_VARIANTS: Shape3DDef[] = [
  { variant: "cube", label: "3D Cube", icon: CubeIcon },
  { variant: "cylinder", label: "3D Cylinder", icon: CylinderIcon },
  { variant: "cone", label: "3D Cone", icon: ConeIcon },
  { variant: "pyramid", label: "3D Pyramid", icon: PyramidIcon },
];

const ImageIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M12.5 6.667h.01" />
    <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" />
    <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" />
    <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" />
  </svg>
);

type ToolDef = {
  name: ToolName;
  label: string;
  shortcut: string;
  icon: ReactNode;
};

const PRIMARY_TOOLS: ToolDef[] = [
  { name: "selection", label: "Select", shortcut: "1", icon: SelectionIcon },
  { name: "hand", label: "Hand", shortcut: "", icon: HandIcon },
  { name: "rectangle", label: "Rectangle", shortcut: "2", icon: RectangleIcon },
  { name: "ellipse", label: "Ellipse", shortcut: "3", icon: EllipseIcon },
  { name: "line", label: "Line", shortcut: "4", icon: LineIcon },
  { name: "arrow", label: "Arrow", shortcut: "5", icon: ArrowIcon },
  { name: "freedraw", label: "Draw", shortcut: "6", icon: FreeDrawIcon },
  { name: "text", label: "Text", shortcut: "T", icon: TextIcon },
  { name: "eraser", label: "Eraser", shortcut: "E", icon: EraserIcon },
];

const OVERFLOW_TOOLS: ToolDef[] = [
  { name: "frame", label: "Frame", shortcut: "F", icon: FrameIcon },
  { name: "laser", label: "Laser pointer", shortcut: "K", icon: LaserIcon },
];

const OVERFLOW_TOOL_NAMES = new Set<ToolName>(
  OVERFLOW_TOOLS.map((t) => t.name),
);

type ToolbarProps = { roomId: string };

export function Toolbar({ roomId }: ToolbarProps) {
  const activeTool = useAppState((s) => s.activeTool);
  const setActiveTool = useAppState((s) => s.setActiveTool);
  const shape3DVariant = useAppState((s) => s.shape3DVariant);
  const setShape3DVariant = useAppState((s) => s.setShape3DVariant);
  const viewMode = useAppState((s) => s.viewMode);
  const elements = useAppState((s) => s.elements);
  const selectedIds = useAppState((s) => s.selectedIds);
  const toggleLockSelection = useAppState((s) => s.toggleLockSelection);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectionLockState: "none" | "all" | "mixed" = (() => {
    if (selectedIds.length === 0) return "none";
    const set = new Set(selectedIds);
    let locked = 0;
    let total = 0;
    for (const el of elements) {
      if (el.isDeleted) continue;
      if (!set.has(el.id)) continue;
      total += 1;
      if (el.isLocked) locked += 1;
    }
    if (total === 0 || locked === 0) return "none";
    if (locked === total) return "all";
    return "mixed";
  })();
  const lockLabel =
    selectionLockState === "all"
      ? "Unlock selection"
      : selectionLockState === "mixed"
        ? "Lock all"
        : "Lock selection";

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importImageFile(file, { roomId });
    } catch (err) {
      console.error("Failed to load image", err);
    }
  };

  const overflowTools: OverflowTool[] = [
    ...OVERFLOW_TOOLS.map<OverflowTool>((tool) => ({
      name: tool.name,
      label: tool.label,
      shortcut: tool.shortcut,
      icon: tool.icon,
      active: activeTool === tool.name,
      disabled:
        viewMode &&
        tool.name !== "selection" &&
        tool.name !== "hand" &&
        tool.name !== "laser",
      onSelect: () => setActiveTool(tool.name),
    })),
    ...SHAPE_3D_VARIANTS.map<OverflowTool>((v) => ({
      name: `shape3d:${v.variant}`,
      label: v.label,
      shortcut: "",
      icon: v.icon,
      active: activeTool === "shape3d" && shape3DVariant === v.variant,
      disabled: viewMode,
      onSelect: () => {
        setShape3DVariant(v.variant);
        setActiveTool("shape3d");
      },
    })),
  ];

  return (
    <div className={styles.toolbar}>
      <span className={styles.wordmark}>Scribbly.</span>
      <div className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={`${styles.button} ${selectionLockState === "all" ? styles.active : ""}`}
        onClick={toggleLockSelection}
        title={lockLabel}
        aria-label={lockLabel}
        aria-pressed={selectionLockState === "all"}
        disabled={viewMode || selectedIds.length === 0}
      >
        <LockIcon locked={selectionLockState !== "none"} />
      </button>
      <div className={styles.divider} aria-hidden="true" />
      {PRIMARY_TOOLS.map((tool) => (
        <button
          key={tool.name}
          type="button"
          className={`${styles.button} ${activeTool === tool.name ? styles.active : ""}`}
          onClick={() => setActiveTool(tool.name)}
          title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
          aria-label={tool.label}
          disabled={
            viewMode &&
            tool.name !== "selection" &&
            tool.name !== "hand"
          }
        >
          {tool.icon}
          {tool.shortcut ? (
            <span className={styles.shortcut}>{tool.shortcut}</span>
          ) : null}
        </button>
      ))}
      <button
        type="button"
        className={styles.button}
        onClick={onPickImage}
        title="Insert image"
        aria-label="Insert image"
        disabled={viewMode}
      >
        {ImageIcon}
      </button>
      <MoreToolsPopover
        tools={overflowTools}
        triggerActive={
          OVERFLOW_TOOL_NAMES.has(activeTool) || activeTool === "shape3d"
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
}
