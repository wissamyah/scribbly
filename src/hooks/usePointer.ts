import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { screenToWorld, type Point, type ViewTransform } from "../canvas/geometry";

export type PointerInfo = {
  screen: Point;
  world: Point;
  button: number;
  buttons: number;
  pointerId: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

export type PointerCallback = (
  info: PointerInfo,
  event: ReactPointerEvent<HTMLCanvasElement>,
) => void;

export type UsePointerOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  getView: () => ViewTransform;
  onDown?: PointerCallback;
  onMove?: PointerCallback;
  onUp?: PointerCallback;
  onCancel?: PointerCallback;
};

export type PointerHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
};

export function usePointer(opts: UsePointerOptions): PointerHandlers {
  const makeInfo = (e: ReactPointerEvent<HTMLCanvasElement>): PointerInfo => {
    const canvas = opts.canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const screenX = rect ? e.clientX - rect.left : e.clientX;
    const screenY = rect ? e.clientY - rect.top : e.clientY;
    const world = screenToWorld(opts.getView(), screenX, screenY);
    return {
      screen: { x: screenX, y: screenY },
      world,
      button: e.button,
      buttons: e.buttons,
      pointerId: e.pointerId,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
    };
  };

  const dispatch = (
    e: ReactPointerEvent<HTMLCanvasElement>,
    cb: PointerCallback | undefined,
  ) => {
    if (!cb) return;
    cb(makeInfo(e), e);
  };

  return {
    onPointerDown: (e) => dispatch(e, opts.onDown),
    onPointerMove: (e) => dispatch(e, opts.onMove),
    onPointerUp: (e) => dispatch(e, opts.onUp),
    onPointerCancel: (e) => dispatch(e, opts.onCancel ?? opts.onUp),
  };
}
