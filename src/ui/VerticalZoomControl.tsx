import { useCallback, useRef, useState } from "react";
import { MAX_SCALE, MIN_SCALE } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import styles from "./VerticalZoomControl.module.scss";

const LOG_MIN = Math.log(MIN_SCALE);
const LOG_RANGE = Math.log(MAX_SCALE) - LOG_MIN;

function scaleToFraction(scale: number): number {
  return (Math.log(scale) - LOG_MIN) / LOG_RANGE;
}

function fractionToScale(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.exp(LOG_MIN + clamped * LOG_RANGE);
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="12" y1="6" x2="12" y2="18" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

export function VerticalZoomControl() {
  const scale = useAppState((s) => s.view.scale);
  const zoomIn = useAppState((s) => s.zoomIn);
  const zoomOut = useAppState((s) => s.zoomOut);
  const resetView = useAppState((s) => s.resetView);
  const zoomAtScreen = useAppState((s) => s.zoomAtScreen);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const percent = Math.round(scale * 100);
  const handleTopPercent = (1 - scaleToFraction(scale)) * 100;

  const applyFromClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const f = 1 - (clientY - rect.top) / rect.height;
      const target = fractionToScale(f);
      const current = useAppState.getState().view.scale;
      const factor = target / current;
      if (factor === 1) return;
      zoomAtScreen(window.innerWidth / 2, window.innerHeight / 2, factor);
    },
    [zoomAtScreen],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    applyFromClientY(e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    applyFromClientY(e.clientY);
  };

  const releaseCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      zoomIn();
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      zoomOut();
    } else if (e.key === "Home") {
      e.preventDefault();
      resetView();
    }
  };

  return (
    <div className={styles.dock} role="toolbar" aria-label="Zoom">
      <button
        type="button"
        className={styles.iconButton}
        onClick={zoomIn}
        disabled={scale >= MAX_SCALE - 1e-6}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <PlusIcon />
      </button>
      <div
        ref={trackRef}
        className={`${styles.track} ${dragging ? styles.dragging : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releaseCapture}
        onPointerCancel={releaseCapture}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label="Zoom level"
        aria-valuemin={Math.round(MIN_SCALE * 100)}
        aria-valuemax={Math.round(MAX_SCALE * 100)}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        tabIndex={0}
      >
        <div className={styles.trackLine} />
        <div
          className={styles.handle}
          style={{ top: `${handleTopPercent}%` }}
        />
      </div>
      <button
        type="button"
        className={styles.iconButton}
        onClick={zoomOut}
        disabled={scale <= MIN_SCALE + 1e-6}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <MinusIcon />
      </button>
      <div className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={styles.percentLabel}
        onClick={resetView}
        title="Reset zoom"
        aria-label={`Reset zoom (currently ${percent} percent)`}
      >
        {percent}%
      </button>
    </div>
  );
}
