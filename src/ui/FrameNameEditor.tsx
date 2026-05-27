import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { worldToScreen } from "../canvas/geometry";
import { useAppState } from "../store/appState";

const FONT_SIZE = 14;
const NAME_OFFSET = 6;

export function FrameNameEditor() {
  const frameId = useAppState((s) => s.frameNameDraft);
  const view = useAppState((s) => s.view);
  const elements = useAppState((s) => s.elements);
  const setFrameNameDraft = useAppState((s) => s.setFrameNameDraft);
  const updateElements = useAppState((s) => s.updateElements);
  const pushHistory = useAppState((s) => s.pushHistory);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  const frame = useMemo(() => {
    if (!frameId) return null;
    const el = elements.find((e) => e.id === frameId);
    return el && el.type === "frame" ? el : null;
  }, [frameId, elements]);

  useEffect(() => {
    if (!frame) return;
    setValue(frame.name ?? "");
  }, [frame]);

  useLayoutEffect(() => {
    if (!frame) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, [frame]);

  if (!frame) return null;

  const screen = worldToScreen(view, frame.x, frame.y);
  const scaledFontSize = FONT_SIZE * view.scale;

  const commit = () => {
    const next = value.trim();
    setFrameNameDraft(null);
    setValue("");
    const stored = frame.name ?? null;
    const nextStored = next.length > 0 ? next : null;
    if (stored === nextStored) return;
    pushHistory();
    updateElements([frame.id], (el) =>
      el.type === "frame" ? { ...el, name: nextStored } : el,
    );
  };

  const cancel = () => {
    setFrameNameDraft(null);
    setValue("");
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      placeholder="Frame name"
      style={{
        position: "fixed",
        left: `${screen.x}px`,
        // Anchor the input's baseline to the rendered label baseline so the
        // visual position is identical to the label when not editing.
        top: `${screen.y - NAME_OFFSET * view.scale - scaledFontSize}px`,
        fontSize: `${scaledFontSize}px`,
        lineHeight: 1.1,
        padding: "0 2px",
        margin: 0,
        border: "1px solid #6c75e6",
        borderRadius: 3,
        background: "var(--surface-1)",
        color: "var(--text-1)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        minWidth: `${80 * view.scale}px`,
        outline: "none",
        zIndex: 30,
      }}
    />
  );
}
