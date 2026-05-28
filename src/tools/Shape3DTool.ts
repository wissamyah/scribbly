import { id } from "@instantdb/react";
import {
  createEllipse,
  createLine,
  createRectangle,
  pickBaseStyle,
  type ScribblyElement,
} from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState } from "../store/appState";
import { constrainBoxToSquare } from "./shiftConstraints";
import { shape3DGeometry } from "./shape3d/primitives";
import type { DrawingTool } from "./types";

const MIN_DRAG = 4;

export function createShape3DTool(): DrawingTool {
  let start: Point | null = null;

  return {
    name: "shape3d",
    onPointerDown(info, ctx) {
      start = info.world;
      const style = useAppState.getState().currentStyle;
      // Ghost preview rectangle while dragging. Outline-only so it doesn't
      // distract from the eventual primitive being framed.
      ctx.setDraft(
        createRectangle({
          roomId: ctx.roomId,
          ...pickBaseStyle(style),
          backgroundColor: "transparent",
          fillStyle: "none",
          x: info.world.x,
          y: info.world.y,
          width: 0,
          height: 0,
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "rectangle") return;
      const box = constrainBoxToSquare(start, info.world, info.shiftKey);
      ctx.setDraft({ ...draft, ...box });
    },
    onPointerUp(_info, ctx) {
      if (!start) return;
      start = null;
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "rectangle") return;
      if (draft.width < MIN_DRAG || draft.height < MIN_DRAG) return;

      const state = useAppState.getState();
      const variant = state.shape3DVariant;
      const style = state.currentStyle;
      const baseStyle = pickBaseStyle(style);

      const geometry = shape3DGeometry(variant, {
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
      });

      const groupId = id();
      const elements: ScribblyElement[] = [];

      // Faces first (back-to-front from the geometry generator), then caps
      // last so circular caps paint over the side body's outline.
      for (const face of geometry.faces) {
        const el = createLine({
          roomId: ctx.roomId,
          ...baseStyle,
          points: face.map(([px, py]) => [px, py]),
          closed: true,
        });
        elements.push({ ...el, groupId });
      }

      for (const ellipse of geometry.ellipses) {
        const el = createEllipse({
          roomId: ctx.roomId,
          ...baseStyle,
          x: ellipse.x,
          y: ellipse.y,
          width: ellipse.width,
          height: ellipse.height,
        });
        elements.push({ ...el, groupId });
      }

      if (elements.length === 0) return;
      ctx.addElements(elements);
      ctx.setSelectedIds(elements.map((el) => el.id));
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      start = null;
      ctx.setDraft(null);
    },
  };
}
