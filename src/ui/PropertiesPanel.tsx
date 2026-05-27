import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import oc from "open-color";
import {
  DEFAULT_CORNER_RADIUS,
  type ArrowheadStyle,
  type ScribblyElement,
  type FillStyle,
  type StrokeStyle,
  type TextAlign,
  type TextElement,
  type VerticalAlign,
} from "../canvas/elements";
import { measureText } from "../canvas/textMetrics";
import { useAppState, type CurrentStyle } from "../store/appState";
import { resolveFontColor, resolveStrokeColor } from "../utils/theme";
import styles from "./PropertiesPanel.module.scss";

const HUES = [
  oc.red,
  oc.pink,
  oc.grape,
  oc.violet,
  oc.indigo,
  oc.blue,
  oc.cyan,
  oc.teal,
  oc.green,
  oc.lime,
  oc.yellow,
  oc.orange,
] as const;

const STROKE_COLORS: readonly string[] = [
  "transparent",
  "#1e1e1e",
  ...HUES.map((hue) => hue[8] ?? hue[hue.length - 1] ?? "#000000"),
];

const FILL_COLORS: readonly string[] = [
  "transparent",
  ...HUES.map((hue) => hue[2] ?? hue[0] ?? "#ffffff"),
];

// Font color swatches: opaque only (transparent text is unreadable). Keep
// the same hue ordering as Stroke so the palette feels familiar.
const FONT_COLORS: readonly string[] = [
  "#1e1e1e",
  "#ffffff",
  ...HUES.map((hue) => hue[8] ?? hue[hue.length - 1] ?? "#000000"),
];

const FILL_STYLES: { value: FillStyle; label: string }[] = [
  { value: "hachure", label: "Hachure" },
  { value: "cross-hatch", label: "Cross-hatch" },
  { value: "solid", label: "Solid" },
  { value: "none", label: "None" },
];

const STROKE_WIDTHS: { value: number; label: string }[] = [
  { value: 1, label: "Thin" },
  { value: 2, label: "Bold" },
  { value: 4, label: "Extra-bold" },
];

const STROKE_STYLES_UI: { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const ROUGHNESSES: { value: number; label: string }[] = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
  { value: 2, label: "Cartoonist" },
];

const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: "Virgil, 'Comic Sans MS', cursive", label: "Hand" },
  { value: "system-ui, -apple-system, sans-serif", label: "Normal" },
  { value: "ui-monospace, 'SF Mono', monospace", label: "Code" },
  { value: "Georgia, 'Times New Roman', serif", label: "Serif" },
  { value: "'Brush Script MT', 'Lucida Handwriting', cursive", label: "Script" },
  { value: "Impact, 'Arial Black', sans-serif", label: "Heavy" },
  { value: "'Courier New', Courier, monospace", label: "Typewriter" },
  { value: "Helvetica, Arial, sans-serif", label: "Sans" },
];

const FONT_SIZES: { value: number; label: string }[] = [
  { value: 16, label: "S" },
  { value: 20, label: "M" },
  { value: 28, label: "L" },
  { value: 36, label: "XL" },
];

const TEXT_ALIGNS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "L" },
  { value: "center", label: "C" },
  { value: "right", label: "R" },
];

const VERTICAL_ALIGNS: { value: VerticalAlign; label: string }[] = [
  { value: "top", label: "T" },
  { value: "middle", label: "M" },
  { value: "bottom", label: "B" },
];

const ARROWHEADS: { value: ArrowheadStyle; label: string }[] = [
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "dot", label: "Dot" },
  { value: "bar", label: "Bar" },
  { value: "none", label: "None" },
];

type StyleKey = keyof CurrentStyle;

function readField<K extends StyleKey>(
  selected: readonly ScribblyElement[],
  fallback: CurrentStyle,
  key: K,
): CurrentStyle[K] {
  const first = selected[0];
  if (!first) return fallback[key];
  const v = (first as unknown as Record<string, unknown>)[key];
  if (v === undefined) return fallback[key];
  return v as CurrentStyle[K];
}

function selectionIncludesText(selected: readonly ScribblyElement[]): boolean {
  return selected.some((el) => el.type === "text");
}

function selectionIncludesArrow(selected: readonly ScribblyElement[]): boolean {
  return selected.some((el) => el.type === "arrow");
}

export function PropertiesPanel() {
  const activeTool = useAppState((s) => s.activeTool);
  const elements = useAppState((s) => s.elements);
  const selectedIds = useAppState((s) => s.selectedIds);
  const currentStyle = useAppState((s) => s.currentStyle);
  const theme = useAppState((s) => s.theme);
  const setStyle = useAppState((s) => s.setStyle);
  const updateElements = useAppState((s) => s.updateElements);
  const pushHistory = useAppState((s) => s.pushHistory);
  const textDraft = useAppState((s) => s.textDraft);
  const bringToFront = useAppState((s) => s.bringSelectionToFront);
  const sendToBack = useAppState((s) => s.sendSelectionToBack);
  const bringForward = useAppState((s) => s.bringSelectionForward);
  const sendBackward = useAppState((s) => s.sendSelectionBackward);
  const alignSelection = useAppState((s) => s.alignSelection);
  const distributeSelection = useAppState((s) => s.distributeSelection);
  const groupSelection = useAppState((s) => s.groupSelection);
  const ungroupSelection = useAppState((s) => s.ungroupSelection);

  const selectedElements = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const set = new Set(selectedIds);
    return elements.filter((el) => set.has(el.id));
  }, [elements, selectedIds]);

  // When the inline text editor is open in edit-mode, route font changes to
  // that text element directly — the canvas selection may be its container.
  const editingTextEl = useMemo<TextElement | null>(() => {
    if (!textDraft?.editingId) return null;
    const el = elements.find((e) => e.id === textDraft.editingId);
    return el && el.type === "text" ? el : null;
  }, [textDraft?.editingId, elements]);

  // Text elements targeted by font-only style changes: selected text plus
  // text bound to any selected shape. Selecting a rectangle/ellipse with a
  // text inside it lets the user change the text's font properties without
  // having to click the text itself.
  const textTargets = useMemo<TextElement[]>(() => {
    if (selectedElements.length === 0) return [];
    const direct: TextElement[] = [];
    const containerIds = new Set<string>();
    for (const el of selectedElements) {
      if (el.type === "text") direct.push(el);
      else if (el.type === "rectangle" || el.type === "ellipse") {
        containerIds.add(el.id);
      }
    }
    if (containerIds.size === 0) return direct;
    const seen = new Set(direct.map((t) => t.id));
    const bound: TextElement[] = [];
    for (const el of elements) {
      if (el.isDeleted) continue;
      if (el.type !== "text") continue;
      if (!el.containerId || !containerIds.has(el.containerId)) continue;
      if (seen.has(el.id)) continue;
      bound.push(el);
      seen.add(el.id);
    }
    return [...direct, ...bound];
  }, [elements, selectedElements]);

  const hasSelection = selectedElements.length > 0;
  const visible =
    hasSelection || (activeTool !== "selection") || textDraft !== null;
  const librarySidebarOpen = useAppState((s) => s.librarySidebarOpen);

  // The library sidebar and properties panel both anchor to the top-right
  // corner. Hiding properties when the sidebar is open keeps the
  // surface uncluttered without moving either component.
  if (!visible || librarySidebarOpen) return null;

  const apply = <K extends StyleKey>(key: K, value: CurrentStyle[K]) => {
    setStyle({ [key]: value } as Partial<CurrentStyle>);
    const isTextOnly =
      key === "fontSize" ||
      key === "fontFamily" ||
      key === "fontColor" ||
      key === "textAlign" ||
      key === "verticalAlign";
    const isArrowOnly = key === "startArrowhead" || key === "endArrowhead";
    const remeasure = key === "fontSize" || key === "fontFamily";

    // Priority: an active text edit. Apply font/style changes to the edited
    // text element regardless of what's selected on the canvas.
    if (editingTextEl) {
      pushHistory();
      updateElements([editingTextEl.id], (el) => {
        if (el.type !== "text") return el;
        const next = { ...el, [key]: value } as TextElement;
        if (remeasure) {
          const bounds = measureText(next.text, next.fontSize, next.fontFamily);
          return { ...next, width: bounds.width, height: bounds.height };
        }
        return next;
      });
      return;
    }

    if (!hasSelection) return;
    const targets = isTextOnly
      ? textTargets
      : isArrowOnly
        ? selectedElements.filter((el) => el.type === "arrow")
        : selectedElements;
    if (targets.length === 0) return;
    pushHistory();
    updateElements(
      targets.map((el) => el.id),
      (el) => {
        const next = { ...el, [key]: value } as ScribblyElement;
        if (remeasure && next.type === "text") {
          const bounds = measureText(next.text, next.fontSize, next.fontFamily);
          return { ...next, width: bounds.width, height: bounds.height };
        }
        return next;
      },
    );
  };

  const isTextOnlyKey = (key: StyleKey): boolean =>
    key === "fontSize" ||
    key === "fontFamily" ||
    key === "fontColor" ||
    key === "textAlign" ||
    key === "verticalAlign";

  const cur = <K extends StyleKey>(key: K): CurrentStyle[K] => {
    // While editing text inline, prefer the editing element's own values for
    // font controls so the panel reflects what the editor is showing.
    if (editingTextEl) {
      const v = (editingTextEl as unknown as Record<string, unknown>)[key];
      if (v !== undefined) return v as CurrentStyle[K];
    }
    // For text-only keys, prefer the bound text inside a selected shape over
    // the shape's own fields (shapes don't define fontColor/fontSize/etc.).
    if (isTextOnlyKey(key) && textTargets.length > 0) {
      return readField(textTargets, currentStyle, key);
    }
    return hasSelection
      ? readField(selectedElements, currentStyle, key)
      : currentStyle[key];
  };

  const showFontControls =
    selectionIncludesText(selectedElements) ||
    textTargets.length > 0 ||
    activeTool === "text" ||
    textDraft !== null;
  // Vertical-align only applies to text bound to a container.
  const showVerticalAlign =
    (editingTextEl?.containerId != null) ||
    textTargets.some((t) => t.containerId != null) ||
    selectedElements.some(
      (el) =>
        (el.type === "rectangle" || el.type === "ellipse") &&
        elements.some(
          (t) => t.type === "text" && t.containerId === el.id && !t.isDeleted,
        ),
    );
  const showArrowheadControls =
    selectionIncludesArrow(selectedElements) || activeTool === "arrow";
  // Shape controls (background/fillStyle/strokeWidth/roughness) make sense for
  // any element except plain text. Hide them when the only context is text.
  const selectionIsAllText =
    hasSelection && selectedElements.every((el) => el.type === "text");
  const showShapeControls = hasSelection
    ? !selectionIsAllText
    : activeTool !== "text" && textDraft === null;

  const currentStroke = cur("strokeColor") as string;
  const currentBackground = cur("backgroundColor") as string;
  const currentFillStyle = cur("fillStyle") as FillStyle;
  const currentStrokeWidth = cur("strokeWidth") as number;
  const currentStrokeStyle = cur("strokeStyle") as StrokeStyle;
  const currentRoughness = cur("roughness") as number;
  const currentOpacity = cur("opacity") as number;
  const currentFontSize = cur("fontSize") as number;
  const currentFontFamily = cur("fontFamily") as string;
  const currentFontColor = cur("fontColor") as string;
  const currentTextAlign = cur("textAlign") as TextAlign;
  const currentVerticalAlign = cur("verticalAlign") as VerticalAlign;
  const currentStartArrowhead = cur("startArrowhead") as ArrowheadStyle;
  const currentEndArrowhead = cur("endArrowhead") as ArrowheadStyle;

  const sharedGroupId = (() => {
    if (selectedElements.length < 2) return null;
    const first = selectedElements[0]!.groupId;
    if (!first) return null;
    for (const el of selectedElements) {
      if (el.groupId !== first) return null;
    }
    return first;
  })();
  const showGroup = selectedElements.length >= 2;

  const roundableSelection = hasSelection
    ? selectedElements.filter(
        (el) => el.type === "rectangle" || el.type === "image",
      )
    : [];
  const showCornerRadius = hasSelection
    ? roundableSelection.length > 0 &&
      roundableSelection.length === selectedElements.length
    : activeTool === "rectangle";
  const firstRoundable = roundableSelection[0];
  const currentRounded = hasSelection
    ? firstRoundable &&
      (firstRoundable.type === "rectangle" || firstRoundable.type === "image")
      ? firstRoundable.cornerRadius > 0
      : false
    : currentStyle.cornerRadius > 0;

  const setCornerRadius = (rounded: boolean) => {
    const cornerRadius = rounded ? DEFAULT_CORNER_RADIUS : 0;
    setStyle({ cornerRadius });
    if (roundableSelection.length === 0) return;
    pushHistory();
    updateElements(
      roundableSelection.map((el) => el.id),
      (el) =>
        el.type === "rectangle" || el.type === "image"
          ? { ...el, cornerRadius }
          : el,
    );
  };

  return (
    <aside
      className={styles.panel}
      aria-label="Element properties"
      onMouseDown={(e) => {
        // While the inline text editor is open, clicking a panel button would
        // blur the textarea (firing commit and closing the editor). Suppress
        // focus shift for non-input controls so the editor stays open.
        if (!textDraft) return;
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const tag = t.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          e.preventDefault();
        }
      }}
    >
      {showShapeControls && (
        <Section label="Stroke">
          <Swatches
            colors={STROKE_COLORS}
            value={currentStroke}
            onChange={(c) => apply("strokeColor", c)}
            displayResolve={(c) => resolveStrokeColor(c, theme)}
          />
        </Section>
      )}

      {showShapeControls && (
        <>
          <Section label="Background">
            <Swatches
              colors={FILL_COLORS}
              value={currentBackground}
              onChange={(c) => apply("backgroundColor", c)}
            />
          </Section>

          <Section label="Fill style">
            <ButtonRow>
              {FILL_STYLES.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  className={`${styles.chip} ${currentFillStyle === s.value ? styles.active : ""}`}
                  onClick={() => apply("fillStyle", s.value)}
                  title={s.label}
                  aria-pressed={currentFillStyle === s.value}
                >
                  <FillStyleIcon style={s.value} />
                </button>
              ))}
            </ButtonRow>
          </Section>

          <Section label="Stroke width">
            <ButtonRow>
              {STROKE_WIDTHS.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  className={`${styles.chip} ${currentStrokeWidth === s.value ? styles.active : ""}`}
                  onClick={() => apply("strokeWidth", s.value)}
                  title={s.label}
                  aria-pressed={currentStrokeWidth === s.value}
                >
                  <StrokeWidthIcon width={s.value} />
                </button>
              ))}
            </ButtonRow>
          </Section>

          <Section label="Stroke style">
            <ButtonRow>
              {STROKE_STYLES_UI.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  className={`${styles.chip} ${currentStrokeStyle === s.value ? styles.active : ""}`}
                  onClick={() => apply("strokeStyle", s.value)}
                  title={s.label}
                  aria-pressed={currentStrokeStyle === s.value}
                >
                  <StrokeStyleIcon style={s.value} />
                </button>
              ))}
            </ButtonRow>
          </Section>

          <Section label="Roughness">
            <ButtonRow>
              {ROUGHNESSES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  className={`${styles.chip} ${currentRoughness === r.value ? styles.active : ""}`}
                  onClick={() => apply("roughness", r.value)}
                  title={r.label}
                  aria-pressed={currentRoughness === r.value}
                >
                  <RoughnessIcon level={r.value} />
                </button>
              ))}
            </ButtonRow>
          </Section>

          {showCornerRadius && (
            <Section label="Edges">
              <ButtonRow>
                <button
                  type="button"
                  className={`${styles.chip} ${!currentRounded ? styles.active : ""}`}
                  onClick={() => setCornerRadius(false)}
                  title="Sharp"
                  aria-pressed={!currentRounded}
                >
                  <EdgeIcon rounded={false} />
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${currentRounded ? styles.active : ""}`}
                  onClick={() => setCornerRadius(true)}
                  title="Rounded"
                  aria-pressed={currentRounded}
                >
                  <EdgeIcon rounded={true} />
                </button>
              </ButtonRow>
            </Section>
          )}
        </>
      )}

      <Section label={`Opacity ${Math.round(currentOpacity * 100)}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(currentOpacity * 100)}
          onChange={(e) =>
            apply("opacity", Number(e.target.value) / 100)
          }
          className={styles.slider}
          aria-label="Opacity"
        />
      </Section>

      {showArrowheadControls && (
        <Section label="Arrowheads">
          <div className={styles.dropdownRow}>
            <ArrowheadDropdown
              position="start"
              value={currentStartArrowhead}
              onChange={(v) => apply("startArrowhead", v)}
            />
            <ArrowheadDropdown
              position="end"
              value={currentEndArrowhead}
              onChange={(v) => apply("endArrowhead", v)}
            />
          </div>
        </Section>
      )}

      {showFontControls && (
        <>
          <Section label="Font color">
            <Swatches
              colors={FONT_COLORS}
              value={currentFontColor}
              onChange={(c) => apply("fontColor", c)}
              displayResolve={(c) => resolveFontColor(c, theme)}
            />
          </Section>

          <Section label="Font">
            <ButtonRow>
              {FONT_FAMILIES.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={`${styles.chip} ${styles.fontChip} ${currentFontFamily === f.value ? styles.active : ""}`}
                  onClick={() => apply("fontFamily", f.value)}
                  style={{ fontFamily: f.value }}
                  title={f.label}
                  aria-pressed={currentFontFamily === f.value}
                >
                  {f.label}
                </button>
              ))}
            </ButtonRow>
          </Section>

          <Section label="Font size">
            <ButtonRow>
              {FONT_SIZES.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  className={`${styles.chip} ${currentFontSize === s.value ? styles.active : ""}`}
                  onClick={() => apply("fontSize", s.value)}
                  title={`${s.label} (${s.value}px)`}
                  aria-pressed={currentFontSize === s.value}
                >
                  {s.label}
                </button>
              ))}
            </ButtonRow>
          </Section>

          <Section label="Text align">
            <ButtonRow>
              {TEXT_ALIGNS.map((a) => (
                <button
                  type="button"
                  key={a.value}
                  className={`${styles.chip} ${currentTextAlign === a.value ? styles.active : ""}`}
                  onClick={() => apply("textAlign", a.value)}
                  title={a.value}
                  aria-pressed={currentTextAlign === a.value}
                  aria-label={`Text align ${a.value}`}
                >
                  <TextAlignIcon mode={a.value} />
                </button>
              ))}
            </ButtonRow>
          </Section>

          {showVerticalAlign && (
            <Section label="Vertical align">
              <ButtonRow>
                {VERTICAL_ALIGNS.map((a) => (
                  <button
                    type="button"
                    key={a.value}
                    className={`${styles.chip} ${currentVerticalAlign === a.value ? styles.active : ""}`}
                    onClick={() => apply("verticalAlign", a.value)}
                    title={a.value}
                    aria-pressed={currentVerticalAlign === a.value}
                    aria-label={`Vertical align ${a.value}`}
                  >
                    <VerticalAlignIcon mode={a.value} />
                  </button>
                ))}
              </ButtonRow>
            </Section>
          )}
        </>
      )}

      {selectedElements.length === 1 && selectedElements[0]?.type === "frame" && (
        <Section label="Frame name">
          <FrameNameField
            value={selectedElements[0].name ?? ""}
            onCommit={(next) => {
              const trimmed = next.trim();
              const stored = trimmed.length > 0 ? trimmed : null;
              if ((selectedElements[0] as { name: string | null }).name === stored) {
                return;
              }
              pushHistory();
              updateElements([selectedElements[0]!.id], (el) =>
                el.type === "frame" ? { ...el, name: stored } : el,
              );
            }}
          />
        </Section>
      )}


      {hasSelection && (
        <Section label="Layers">
          <ButtonRow>
            <button
              type="button"
              className={styles.chip}
              onClick={sendToBack}
              title="Send to back"
              aria-label="Send to back"
            >
              <LayerIcon op="sendToBack" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={sendBackward}
              title="Send backward"
              aria-label="Send backward"
            >
              <LayerIcon op="sendBackward" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={bringForward}
              title="Bring forward"
              aria-label="Bring forward"
            >
              <LayerIcon op="bringForward" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={bringToFront}
              title="Bring to front"
              aria-label="Bring to front"
            >
              <LayerIcon op="bringToFront" />
            </button>
          </ButtonRow>
        </Section>
      )}

      {showGroup && (
        <Section label={sharedGroupId ? "Group" : "Group"}>
          <ButtonRow>
            <button
              type="button"
              className={styles.chip}
              onClick={sharedGroupId ? ungroupSelection : groupSelection}
              title={sharedGroupId ? "Ungroup" : "Group"}
              aria-label={sharedGroupId ? "Ungroup" : "Group"}
            >
              <GroupIcon ungroup={!!sharedGroupId} />
              <span style={{ marginLeft: 6 }}>
                {sharedGroupId ? "Ungroup" : "Group"}
              </span>
            </button>
          </ButtonRow>
        </Section>
      )}

      {selectedElements.length >= 2 && (
        <Section label="Align">
          <ButtonRow>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("left")}
              title="Align left"
              aria-label="Align left"
            >
              <AlignIcon mode="left" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("centerX")}
              title="Align center"
              aria-label="Align center horizontally"
            >
              <AlignIcon mode="centerX" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("right")}
              title="Align right"
              aria-label="Align right"
            >
              <AlignIcon mode="right" />
            </button>
          </ButtonRow>
          <ButtonRow>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("top")}
              title="Align top"
              aria-label="Align top"
            >
              <AlignIcon mode="top" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("centerY")}
              title="Align middle"
              aria-label="Align center vertically"
            >
              <AlignIcon mode="centerY" />
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => alignSelection("bottom")}
              title="Align bottom"
              aria-label="Align bottom"
            >
              <AlignIcon mode="bottom" />
            </button>
          </ButtonRow>
          {selectedElements.length >= 3 && (
            <ButtonRow>
              <button
                type="button"
                className={styles.chip}
                onClick={() => distributeSelection("h")}
                title="Distribute horizontally"
                aria-label="Distribute horizontally"
              >
                <DistributeIcon axis="h" />
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => distributeSelection("v")}
                title="Distribute vertically"
                aria-label="Distribute vertically"
              >
                <DistributeIcon axis="v" />
              </button>
            </ButtonRow>
          )}
        </Section>
      )}
    </aside>
  );
}

type SectionProps = { label: string; children: React.ReactNode };

function Section({ label, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.label}>{label}</div>
      {children}
    </div>
  );
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

type SwatchesProps = {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
  // Maps a stored swatch value to the color shown in the preview tile.
  // Lets the "default" sentinel (#1e1e1e) display its theme-resolved
  // counterpart so the picker reflects what the canvas will actually draw.
  displayResolve?: (stored: string) => string;
};

function Swatches({ colors, value, onChange, displayResolve }: SwatchesProps) {
  return (
    <>
      <div className={styles.swatches}>
        {colors.map((c) => {
          const display = displayResolve ? displayResolve(c) : c;
          return (
            <button
              type="button"
              key={c}
              className={`${styles.swatch} ${value === c ? styles.active : ""}`}
              onClick={() => onChange(c)}
              aria-label={c}
              aria-pressed={value === c}
              title={c}
            >
              {c === "transparent" ? (
                <TransparentSwatch />
              ) : (
                <span
                  className={styles.swatchFill}
                  style={{ background: display }}
                />
              )}
            </button>
          );
        })}
      </div>
      <CustomColorPicker value={value} onChange={onChange} />
    </>
  );
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function CustomColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  // The native color input can't represent "transparent", so show #000000 in
  // that case but don't push the change until the user actually picks.
  const safeColor = HEX_REGEX.test(value) ? value : "#000000";
  const [draft, setDraft] = useState(value);

  // Keep the hex field in sync when the canonical value changes from
  // outside (e.g. user clicked a preset swatch).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitDraft = () => {
    if (draft === value) return;
    if (HEX_REGEX.test(draft)) {
      onChange(draft.toLowerCase());
    } else {
      // Reset to the canonical value on invalid input.
      setDraft(value);
    }
  };

  return (
    <div className={styles.customRow}>
      <label
        className={styles.customSwatch}
        title="Pick a custom color"
        aria-label="Pick a custom color"
      >
        <span
          className={styles.customSwatchFill}
          style={{ background: HEX_REGEX.test(value) ? value : undefined }}
        />
        <input
          type="color"
          className={styles.customColorInput}
          value={safeColor}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
      </label>
      <span className={styles.hexPrefix} aria-hidden="true">#</span>
      <input
        type="text"
        className={styles.hexInput}
        value={draft.startsWith("#") ? draft.slice(1) : draft}
        spellCheck={false}
        maxLength={6}
        onChange={(e) => setDraft(`#${e.target.value.trim()}`)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Custom color hex"
        placeholder="000000"
      />
    </div>
  );
}

function TransparentSwatch() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.swatchFill}>
      <rect x="0" y="0" width="20" height="20" fill="#fff" />
      <line x1="0" y1="20" x2="20" y2="0" stroke="#dc2626" strokeWidth="2" />
    </svg>
  );
}

function FillStyleIcon({ style }: { style: FillStyle }) {
  switch (style) {
    case "hachure":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="16" height="16" rx="2" />
          <path d="M2 8L8 2M2 14L14 2M4 18L18 4M10 18L18 10" />
        </svg>
      );
    case "cross-hatch":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="16" height="16" rx="2" />
          <path d="M2 8L8 2M2 14L14 2M4 18L18 4M10 18L18 10" />
          <path d="M2 6L14 18M2 12L8 18M6 2L18 14M12 2L18 8" />
        </svg>
      );
    case "solid":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="16" height="16" rx="2" fill="currentColor" />
        </svg>
      );
    case "none":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="16" height="16" rx="2" />
        </svg>
      );
  }
}

function StrokeWidthIcon({ width }: { width: number }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <line x1="3" y1="10" x2="17" y2="10" strokeWidth={width * 1.2} />
    </svg>
  );
}

function StrokeStyleIcon({ style }: { style: StrokeStyle }) {
  const dash =
    style === "dashed" ? "4 3" : style === "dotted" ? "1.5 3" : undefined;
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <line
        x1="3"
        y1="10"
        x2="17"
        y2="10"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

function EdgeIcon({ rounded }: { rounded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx={rounded ? 4 : 0} ry={rounded ? 4 : 0} />
    </svg>
  );
}

type ArrowheadDropdownProps = {
  position: "start" | "end";
  value: ArrowheadStyle;
  onChange: (next: ArrowheadStyle) => void;
};

function ArrowheadDropdown({ position, value, onChange }: ArrowheadDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = position === "start" ? "Start" : "End";

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    };
    reposition();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div className={styles.dropdownWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.chip} ${styles.dropdownTrigger}`}
        onClick={() => setOpen((o) => !o)}
        title={`${label} arrowhead`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} arrowhead: ${value}`}
      >
        <ArrowheadIcon style={value} position={position} />
        <svg viewBox="0 0 8 8" aria-hidden="true" className={styles.caret}>
          <path d="M1.5 3L4 5.5L6.5 3" />
        </svg>
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.dropdownMenu}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {ARROWHEADS.map((a) => (
              <button
                type="button"
                key={a.value}
                role="menuitemradio"
                aria-checked={value === a.value}
                className={`${styles.dropdownItem} ${value === a.value ? styles.active : ""}`}
                onClick={() => {
                  onChange(a.value);
                  setOpen(false);
                }}
              >
                <ArrowheadIcon style={a.value} position={position} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ArrowheadIcon({
  style,
  position,
}: {
  style: ArrowheadStyle;
  position: "start" | "end";
}) {
  // 20x20 viewBox. Shaft runs horizontally. "end" head sits at right tip;
  // "start" head sits at left tip. We mirror by flipping the head geometry.
  const isEnd = position === "end";
  const tipX = isEnd ? 17 : 3;
  const shaftA = isEnd ? 3 : 17;
  const shaftB = isEnd ? 14 : 6;
  // Direction sign: from tail toward tip.
  const dir = isEnd ? 1 : -1;
  const sideLen = 4;
  const head = (() => {
    switch (style) {
      case "none":
        return null;
      case "arrow": {
        const x1 = tipX - dir * sideLen;
        const x2 = tipX - dir * sideLen;
        return (
          <>
            <line x1={tipX} y1="10" x2={x1} y2="6" />
            <line x1={tipX} y1="10" x2={x2} y2="14" />
          </>
        );
      }
      case "triangle": {
        const back = tipX - dir * sideLen;
        return (
          <polygon
            points={`${tipX},10 ${back},6 ${back},14`}
            fill="currentColor"
          />
        );
      }
      case "diamond": {
        const back = tipX - dir * sideLen * 1.4;
        const mid = tipX - dir * sideLen * 0.7;
        return (
          <polygon
            points={`${tipX},10 ${mid},6.5 ${back},10 ${mid},13.5`}
            fill="currentColor"
          />
        );
      }
      case "dot": {
        return <circle cx={tipX} cy="10" r="2.6" fill="currentColor" />;
      }
      case "bar": {
        return <line x1={tipX} y1="6" x2={tipX} y2="14" />;
      }
    }
  })();
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <line x1={shaftA} y1="10" x2={shaftB} y2="10" />
      {head}
    </svg>
  );
}

function RoughnessIcon({ level }: { level: number }) {
  if (level === 0) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 14L9 6L13 12L17 5" />
      </svg>
    );
  }
  if (level === 1) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 14C5 13 7 9 9 6C10 9 11 12 13 12C15 11 16 7 17 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 15C4 12 5 17 7 13C8 9 8 14 10 8C11 11 11 6 13 12C14 14 15 8 17 6" />
    </svg>
  );
}

type LayerOp = "sendToBack" | "sendBackward" | "bringForward" | "bringToFront";

function LayerIcon({ op }: { op: LayerOp }) {
  // Arrow + (optional) bar. Down-with-bar = send to back, plain down = send
  // backward, plain up = bring forward, up-with-bar = bring to front.
  const arrowDown = (
    <path
      d="M10 4V15M5.5 10.5L10 15L14.5 10.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
  const arrowUp = (
    <path
      d="M10 16V5M5.5 9.5L10 5L14.5 9.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
  const barBottom = (
    <line
      x1="3"
      y1="18"
      x2="17"
      y2="18"
      strokeLinecap="round"
    />
  );
  const barTop = (
    <line
      x1="3"
      y1="2"
      x2="17"
      y2="2"
      strokeLinecap="round"
    />
  );
  switch (op) {
    case "sendToBack":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {arrowDown}
          {barBottom}
        </svg>
      );
    case "sendBackward":
      return <svg viewBox="0 0 20 20" aria-hidden="true">{arrowDown}</svg>;
    case "bringForward":
      return <svg viewBox="0 0 20 20" aria-hidden="true">{arrowUp}</svg>;
    case "bringToFront":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {arrowUp}
          {barTop}
        </svg>
      );
  }
}

type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

function AlignIcon({ mode }: { mode: AlignMode }) {
  switch (mode) {
    case "left":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="3" y1="2" x2="3" y2="18" />
          <rect x="3" y="5" width="9" height="3" />
          <rect x="3" y="12" width="13" height="3" />
        </svg>
      );
    case "centerX":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="10" y1="2" x2="10" y2="18" />
          <rect x="5.5" y="5" width="9" height="3" />
          <rect x="3.5" y="12" width="13" height="3" />
        </svg>
      );
    case "right":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="17" y1="2" x2="17" y2="18" />
          <rect x="8" y="5" width="9" height="3" />
          <rect x="4" y="12" width="13" height="3" />
        </svg>
      );
    case "top":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="2" y1="3" x2="18" y2="3" />
          <rect x="5" y="3" width="3" height="9" />
          <rect x="12" y="3" width="3" height="13" />
        </svg>
      );
    case "centerY":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="2" y1="10" x2="18" y2="10" />
          <rect x="5" y="5.5" width="3" height="9" />
          <rect x="12" y="3.5" width="3" height="13" />
        </svg>
      );
    case "bottom":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="2" y1="17" x2="18" y2="17" />
          <rect x="5" y="8" width="3" height="9" />
          <rect x="12" y="4" width="3" height="13" />
        </svg>
      );
  }
}

function TextAlignIcon({ mode }: { mode: TextAlign }) {
  // Four horizontal lines representing wrapped text, anchored to the left,
  // center, or right edge of the icon.
  const rows =
    mode === "left"
      ? [
          { x: 3, w: 14 },
          { x: 3, w: 10 },
          { x: 3, w: 14 },
          { x: 3, w: 8 },
        ]
      : mode === "right"
        ? [
            { x: 3, w: 14 },
            { x: 7, w: 10 },
            { x: 3, w: 14 },
            { x: 9, w: 8 },
          ]
        : [
            { x: 3, w: 14 },
            { x: 5, w: 10 },
            { x: 3, w: 14 },
            { x: 6, w: 8 },
          ];
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {rows.map((r, i) => (
        <line
          key={i}
          x1={r.x}
          x2={r.x + r.w}
          y1={4 + i * 4}
          y2={4 + i * 4}
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function VerticalAlignIcon({ mode }: { mode: VerticalAlign }) {
  // A bounding box with three horizontal text lines anchored to the top,
  // middle, or bottom of the box.
  const startY = mode === "top" ? 5 : mode === "bottom" ? 11 : 8;
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="15"
        height="15"
        rx="1.5"
        fill="none"
        opacity="0.5"
      />
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1="5"
          x2={i === 1 ? 13 : 15}
          y1={startY + i * 2}
          y2={startY + i * 2}
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function FrameNameField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      type="text"
      value={draft}
      placeholder="Frame name"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 8px",
        font: "inherit",
        fontSize: 13,
        border: "1px solid var(--border-1)",
        borderRadius: 6,
        background: "var(--surface-1)",
        color: "var(--text-1)",
        outline: "none",
        minWidth: 0,
      }}
    />
  );
}

function GroupIcon({ ungroup }: { ungroup: boolean }) {
  if (ungroup) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" />
        <rect x="11" y="11" width="6" height="6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="2" width="16" height="16" strokeDasharray="2 2" fill="none" />
      <rect x="4" y="4" width="5" height="5" />
      <rect x="11" y="11" width="5" height="5" />
    </svg>
  );
}

function DistributeIcon({ axis }: { axis: "h" | "v" }) {
  if (axis === "h") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2" y="6" width="3" height="8" />
        <rect x="8.5" y="6" width="3" height="8" />
        <rect x="15" y="6" width="3" height="8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="6" y="2" width="8" height="3" />
      <rect x="6" y="8.5" width="8" height="3" />
      <rect x="6" y="15" width="8" height="3" />
    </svg>
  );
}
