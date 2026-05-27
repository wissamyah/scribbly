import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  arrowMidpoint,
  createText,
  pickBaseStyle,
  type TextElement,
} from "../canvas/elements";
import { worldToScreen } from "../canvas/geometry";
import { measureText, measureWrappedHeight } from "../canvas/textMetrics";
import { useAppState } from "../store/appState";
import styles from "./TextEditor.module.scss";

type Props = { roomId: string };

const CONTAINER_PADDING = 8;

export function TextEditor({ roomId }: Props) {
  const draft = useAppState((s) => s.textDraft);
  const view = useAppState((s) => s.view);
  const style = useAppState((s) => s.currentStyle);
  const elements = useAppState((s) => s.elements);
  const setTextDraft = useAppState((s) => s.setTextDraft);
  const addElement = useAppState((s) => s.addElement);
  const updateElements = useAppState((s) => s.updateElements);
  const pushHistory = useAppState((s) => s.pushHistory);
  const setSelectedIds = useAppState((s) => s.setSelectedIds);
  const setActiveTool = useAppState((s) => s.setActiveTool);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  const editingEl = useMemo<TextElement | null>(() => {
    if (!draft?.editingId) return null;
    const el = elements.find((e) => e.id === draft.editingId);
    return el && el.type === "text" ? el : null;
  }, [draft?.editingId, elements]);

  const container = useMemo(() => {
    if (!draft?.containerId) return null;
    const el = elements.find((e) => e.id === draft.containerId);
    return el ?? null;
  }, [draft?.containerId, elements]);

  const arrowContainer =
    container && container.type === "arrow" ? container : null;
  // "Shape container" = the box-shaped containers that wrap and grow text
  // (rectangle, ellipse). Arrow labels float at a single anchor point and
  // never grow the arrow, so they skip the wrap/grow paths below.
  const shapeContainer =
    container && container.type !== "arrow" ? container : null;

  useEffect(() => {
    if (draft) setValue(editingEl?.text ?? "");
  }, [draft, editingEl]);

  useLayoutEffect(() => {
    if (!draft) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, [draft]);

  if (!draft) return null;

  const fontSize = editingEl?.fontSize ?? style.fontSize;
  const fontFamily = editingEl?.fontFamily ?? style.fontFamily;
  const textAlign = container
    ? (editingEl?.textAlign ?? "center")
    : (editingEl?.textAlign ?? style.textAlign);
  const verticalAlign = editingEl?.verticalAlign ?? style.verticalAlign;
  const fontColor = editingEl?.fontColor ?? style.fontColor;
  const opacity = editingEl?.opacity ?? style.opacity;

  // Arrow labels float at the arrow's midpoint and grow naturally with the
  // text; we follow the midpoint live so the editor tracks if the underlying
  // arrow shifts (e.g. binding reflow) while the user types.
  const arrowMid = arrowContainer ? arrowMidpoint(arrowContainer) : null;

  // Place the textarea inside the container at the chosen vertical-align
  // anchor so what the user types lines up with where the committed text
  // will render.
  const anchorWorldY = shapeContainer
    ? verticalAlign === "top"
      ? shapeContainer.y + CONTAINER_PADDING
      : verticalAlign === "bottom"
        ? shapeContainer.y + shapeContainer.height - CONTAINER_PADDING
        : shapeContainer.y + shapeContainer.height / 2
    : draft.worldY;
  const screen = arrowMid
    ? worldToScreen(view, arrowMid[0], arrowMid[1])
    : shapeContainer
      ? worldToScreen(view, shapeContainer.x + CONTAINER_PADDING, anchorWorldY)
      : worldToScreen(view, draft.worldX, draft.worldY);
  const transform = arrowContainer
    ? "translate(-50%, -50%)"
    : shapeContainer
      ? verticalAlign === "top"
        ? undefined
        : verticalAlign === "bottom"
          ? "translateY(-100%)"
          : "translateY(-50%)"
      : undefined;

  const scaledFontSize = fontSize * view.scale;
  const containerWidthScaled = shapeContainer
    ? (shapeContainer.width - CONTAINER_PADDING * 2) * view.scale
    : null;

  // Grow the container vertically so the wrapped text always fits. Never
  // shrink while the user is mid-edit — that would cause the shape to bounce
  // around as they delete and retype. Arrow labels don't resize their arrow.
  const growContainerIfNeeded = (text: string) => {
    if (!shapeContainer) return;
    const maxWidth = Math.max(0, shapeContainer.width - CONTAINER_PADDING * 2);
    const textHeight = measureWrappedHeight(
      text,
      fontSize,
      fontFamily,
      maxWidth,
    );
    const needed = textHeight + CONTAINER_PADDING * 2;
    if (needed <= shapeContainer.height + 0.5) return;
    updateElements([shapeContainer.id], (el) =>
      el.id === shapeContainer.id ? { ...el, height: needed } : el,
    );
  };

  const commit = () => {
    const text = value;
    setTextDraft(null);
    setValue("");

    if (editingEl) {
      if (text.trim().length === 0) {
        useAppState.getState().deleteElements([editingEl.id]);
        return;
      }
      const bounds = measureText(text, editingEl.fontSize, editingEl.fontFamily);
      pushHistory();
      // Ensure the shape container (if any) is tall enough for the final text.
      // Arrow labels never resize their arrow.
      if (shapeContainer) {
        const maxWidth = Math.max(
          0,
          shapeContainer.width - CONTAINER_PADDING * 2,
        );
        const textHeight = measureWrappedHeight(
          text,
          editingEl.fontSize,
          editingEl.fontFamily,
          maxWidth,
        );
        const needed = textHeight + CONTAINER_PADDING * 2;
        if (needed > shapeContainer.height + 0.5) {
          updateElements([shapeContainer.id], (el) =>
            el.id === shapeContainer.id ? { ...el, height: needed } : el,
          );
        }
      }
      updateElements([editingEl.id], (el) => {
        if (el.type !== "text") return el;
        if (arrowContainer && arrowMid) {
          // Keep the stored x,y on the arrow's midpoint so SelectionTool's
          // translate-on-move snapshot keeps the label coherent with the arrow.
          return {
            ...el,
            text,
            width: bounds.width,
            height: bounds.height,
            x: arrowMid[0] - bounds.width / 2,
            y: arrowMid[1] - bounds.height / 2,
          };
        }
        return {
          ...el,
          text,
          width: bounds.width,
          height: bounds.height,
        };
      });
      return;
    }

    if (text.trim().length === 0) return;
    const bounds = measureText(text, style.fontSize, style.fontFamily);
    pushHistory();
    let placement: { x: number; y: number };
    if (arrowContainer && arrowMid) {
      placement = {
        x: arrowMid[0] - bounds.width / 2,
        y: arrowMid[1] - bounds.height / 2,
      };
    } else if (shapeContainer) {
      placement = { x: shapeContainer.x, y: shapeContainer.y };
    } else {
      placement = { x: draft.worldX, y: draft.worldY };
    }
    if (shapeContainer) {
      const maxWidth = Math.max(
        0,
        shapeContainer.width - CONTAINER_PADDING * 2,
      );
      const textHeight = measureWrappedHeight(
        text,
        style.fontSize,
        style.fontFamily,
        maxWidth,
      );
      const needed = textHeight + CONTAINER_PADDING * 2;
      if (needed > shapeContainer.height + 0.5) {
        updateElements([shapeContainer.id], (el) =>
          el.id === shapeContainer.id ? { ...el, height: needed } : el,
        );
      }
    }
    const newText = createText({
      roomId,
      ...pickBaseStyle(style),
      x: placement.x,
      y: placement.y,
      width: bounds.width,
      height: bounds.height,
      text,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontColor: style.fontColor,
      textAlign: container ? "center" : style.textAlign,
      verticalAlign: style.verticalAlign,
      containerId: container ? container.id : null,
    });
    addElement(newText);
    setSelectedIds([container ? container.id : newText.id]);
    setActiveTool("selection");
  };

  const cancel = () => {
    setTextDraft(null);
    setValue("");
  };

  const autosize = (ta: HTMLTextAreaElement) => {
    if (containerWidthScaled !== null) {
      ta.style.width = `${containerWidthScaled}px`;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
      return;
    }
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    ta.style.width = "auto";
    ta.style.width = `${ta.scrollWidth + 1}px`;
  };

  return (
    <textarea
      ref={(node) => {
        textareaRef.current = node;
        if (node) autosize(node);
      }}
      className={styles.editor}
      rows={1}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        autosize(e.target);
        growContainerIfNeeded(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        } else if (e.key === "Enter" && !e.shiftKey && !shapeContainer) {
          e.preventDefault();
          commit();
        }
      }}
      style={{
        left: `${screen.x}px`,
        top: `${screen.y}px`,
        transform,
        fontSize: `${scaledFontSize}px`,
        fontFamily,
        color: fontColor,
        opacity,
        textAlign,
        whiteSpace: shapeContainer ? "pre-wrap" : "pre",
        wordBreak: shapeContainer ? "break-word" : "normal",
      }}
    />
  );
}
