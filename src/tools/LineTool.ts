import { id } from "@instantdb/react";
import {
  createLine,
  pickBaseStyle,
  pointsBounds,
  type LineElement,
} from "../canvas/elements";
import type { Point } from "../canvas/geometry";
import { useAppState, type SnapGuide } from "../store/appState";
import { snapToAngle } from "./shiftConstraints";
import {
  collectLineEndpoints,
  findClosingCycle,
  nearestEndpoint,
  nodeKey,
} from "./linePolygon";
import type { DrawingTool } from "./types";

const MIN_DRAG = 2;

// 14px screen-space snap radius for joining a new line endpoint to an
// existing line endpoint. Tighter than the binding radius so it doesn't
// fight the selection-tool's connection feedback.
const ENDPOINT_SNAP_RADIUS_SCREEN = 14;

// Axis-alignment threshold: when the in-flight endpoint's X (or Y) is within
// this many screen pixels of an existing endpoint's X (or Y), snap to that
// coord and show a dashed guide. Looser than the direct-snap radius so the
// guide kicks in well before the user reaches the alignment.
const ALIGNMENT_THRESHOLD_SCREEN = 8;

// Picks the closest endpoint whose perpendicular coord aligns with `value`
// (within `maxDist`). Returns the matched axis line coord and the matching
// endpoint's perpendicular coord (used as the second guide marker anchor).
function nearestAxisAlignment(
  value: number,
  perpValue: number,
  endpoints: readonly { x: number; y: number }[],
  axis: "x" | "y",
  maxDist: number,
): { line: number; perp: number } | null {
  let best: { line: number; perp: number } | null = null;
  let bestAbs = Infinity;
  for (const ep of endpoints) {
    const epCoord = axis === "x" ? ep.x : ep.y;
    const epPerp = axis === "x" ? ep.y : ep.x;
    const abs = Math.abs(epCoord - value);
    if (abs <= maxDist && abs < bestAbs) {
      bestAbs = abs;
      // Skip degenerate matches where the candidate endpoint sits exactly
      // at the cursor (already snapped, no guide needed).
      if (abs === 0 && epPerp === perpValue) continue;
      best = { line: epCoord, perp: epPerp };
    }
  }
  return best;
}

export function createLineTool(): DrawingTool {
  let start: Point | null = null;

  return {
    name: "line",
    onPointerDown(info, ctx) {
      const view = ctx.getView();
      const elements = ctx.getElements();
      const lines = elements.filter(
        (el): el is LineElement => el.type === "line",
      );
      const endpoints = collectLineEndpoints(lines);
      const worldSnapRadius = ENDPOINT_SNAP_RADIUS_SCREEN / view.scale;
      const snapped =
        nearestEndpoint(info.world, endpoints, worldSnapRadius) ?? info.world;
      start = { x: snapped.x, y: snapped.y };
      useAppState.getState().setLineSnapTarget(
        snapped === info.world ? null : { x: snapped.x, y: snapped.y },
      );
      ctx.setDraft(
        createLine({
          roomId: ctx.roomId,
          ...pickBaseStyle(useAppState.getState().currentStyle),
          points: [
            [start.x, start.y],
            [start.x, start.y],
          ],
        }),
      );
    },
    onPointerMove(info, ctx) {
      if (!start) return;
      const draft = ctx.getDraft();
      if (!draft || draft.type !== "line") return;
      const view = ctx.getView();
      const elements = ctx.getElements();
      const lines = elements.filter(
        (el): el is LineElement => el.type === "line",
      );
      const endpoints = collectLineEndpoints(lines);
      const worldSnapRadius = ENDPOINT_SNAP_RADIUS_SCREEN / view.scale;
      const worldAlignThreshold = ALIGNMENT_THRESHOLD_SCREEN / view.scale;
      const constrained = info.shiftKey
        ? snapToAngle(start, info.world)
        : info.world;
      // Snap takes priority over Shift's angle constraint — joining a shape
      // is more valuable than holding the exact slope.
      const endpointSnap = nearestEndpoint(
        constrained,
        endpoints,
        worldSnapRadius,
      );

      // No endpoint snap → look for axis alignment with any existing endpoint.
      // This is what lets the user know "stop here to complete the rectangle":
      // when the cursor's Y matches an existing endpoint's Y (within a few
      // px), we snap onto that Y and draw a dashed red guide. Shift's angle
      // constraint already handles strict horizontal/vertical, so skip
      // alignment in that mode.
      let snapped: { x: number; y: number };
      const guides: SnapGuide[] = [];
      if (endpointSnap) {
        snapped = endpointSnap;
      } else if (info.shiftKey) {
        snapped = constrained;
      } else {
        const alignX = nearestAxisAlignment(
          constrained.x,
          constrained.y,
          endpoints,
          "x",
          worldAlignThreshold,
        );
        const alignY = nearestAxisAlignment(
          constrained.y,
          constrained.x,
          endpoints,
          "y",
          worldAlignThreshold,
        );
        snapped = {
          x: alignX ? alignX.line : constrained.x,
          y: alignY ? alignY.line : constrained.y,
        };
        if (alignX) {
          guides.push({
            axis: "x",
            line: alignX.line,
            a: snapped.y,
            b: alignX.perp,
          });
        }
        if (alignY) {
          guides.push({
            axis: "y",
            line: alignY.line,
            a: snapped.x,
            b: alignY.perp,
          });
        }
      }
      useAppState.getState().setLineSnapTarget(
        endpointSnap ? { x: snapped.x, y: snapped.y } : null,
      );
      useAppState.getState().setSnapGuides(guides);
      const points: [number, number][] = [
        [start.x, start.y],
        [snapped.x, snapped.y],
      ];
      ctx.setDraft({ ...draft, points, ...pointsBounds(points) });

      // Preview the polygon that would close if released here. When a full
      // cycle exists, we light up the polygon (fill + outline). Otherwise, if
      // the cursor is still snapped to an existing endpoint, we light up the
      // *open* lines touching either the start or the snap node so the user
      // can see what they're connecting to as the shape is built up.
      const startKey = nodeKey(start);
      const snappedKey = endpointSnap ? nodeKey(snapped) : null;
      let preview: {
        vertices: readonly [number, number][];
        edgeIds: readonly string[];
      } | null = null;
      if (snappedKey && startKey !== snappedKey) {
        const cycle = findClosingCycle(
          startKey,
          snappedKey,
          lines,
          points,
          draft.id,
        );
        if (cycle && cycle.vertices.length >= 3) {
          preview = {
            vertices: cycle.vertices.map(
              ([x, y]) => [x, y] as [number, number],
            ),
            edgeIds: [...cycle.consumedLineIds, ...cycle.sharedPolygonIds],
          };
        }
      }
      if (!preview && snappedKey) {
        // No full cycle yet — highlight open lines whose endpoint coincides
        // with the start or snap node. This is the in-progress chain.
        const touching = new Set<string>();
        for (const ln of lines) {
          if (ln.isDeleted) continue;
          if (ln.closed) continue;
          if (ln.points.length < 2) continue;
          const a = ln.points[0]!;
          const b = ln.points[ln.points.length - 1]!;
          const aK = nodeKey({ x: a[0], y: a[1] });
          const bK = nodeKey({ x: b[0], y: b[1] });
          if (
            aK === startKey ||
            bK === startKey ||
            aK === snappedKey ||
            bK === snappedKey
          ) {
            touching.add(ln.id);
          }
        }
        if (touching.size > 0) {
          preview = { vertices: [], edgeIds: Array.from(touching) };
        }
      }
      useAppState.getState().setPolygonPreview(preview);
    },
    onPointerUp(info, ctx) {
      if (!start) return;
      const view = ctx.getView();
      const elements = ctx.getElements();
      const lines = elements.filter(
        (el): el is LineElement => el.type === "line",
      );
      const endpoints = collectLineEndpoints(lines);
      const worldSnapRadius = ENDPOINT_SNAP_RADIUS_SCREEN / view.scale;
      const worldAlignThreshold = ALIGNMENT_THRESHOLD_SCREEN / view.scale;
      const constrained = info.shiftKey
        ? snapToAngle(start, info.world)
        : info.world;
      const endpointSnap = nearestEndpoint(
        constrained,
        endpoints,
        worldSnapRadius,
      );
      // Commit the same alignment the move handler showed, so releasing on a
      // guide actually lands on the aligned coord (not a few px off).
      let end: { x: number; y: number };
      if (endpointSnap) {
        end = endpointSnap;
      } else if (info.shiftKey) {
        end = constrained;
      } else {
        const alignX = nearestAxisAlignment(
          constrained.x,
          constrained.y,
          endpoints,
          "x",
          worldAlignThreshold,
        );
        const alignY = nearestAxisAlignment(
          constrained.y,
          constrained.x,
          endpoints,
          "y",
          worldAlignThreshold,
        );
        end = {
          x: alignX ? alignX.line : constrained.x,
          y: alignY ? alignY.line : constrained.y,
        };
      }
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const startPt = start;
      start = null;
      useAppState.getState().setLineSnapTarget(null);
      useAppState.getState().setPolygonPreview(null);
      useAppState.getState().setSnapGuides([]);
      const draft = ctx.getDraft();
      ctx.setDraft(null);
      if (!draft || draft.type !== "line") return;
      if (Math.hypot(dx, dy) < MIN_DRAG) return;

      const finalPoints: [number, number][] = [
        [startPt.x, startPt.y],
        [end.x, end.y],
      ];
      const newLine: LineElement = {
        ...draft,
        points: finalPoints,
        ...pointsBounds(finalPoints),
      };

      // Try to close a polygon: does the chain of existing lines, walking
      // from this line's start endpoint, reach the end endpoint via other
      // 2-point lines? If so, merge the whole cycle into one closed line.
      const startKey = nodeKey(startPt);
      const endKey = nodeKey(end);
      const cycle =
        startKey !== endKey
          ? findClosingCycle(
              startKey,
              endKey,
              lines,
              [
                [startPt.x, startPt.y],
                [end.x, end.y],
              ],
              newLine.id,
            )
          : null;

      if (cycle && cycle.vertices.length >= 3) {
        // Build the merged closed polygon. Vertices come from the DFS path
        // in traversal order; the new line implicitly closes from the last
        // vertex back to the first.
        const polyPoints: [number, number][] = cycle.vertices.map(
          ([x, y]) => [x, y] as [number, number],
        );
        const closed = createLine({
          roomId: ctx.roomId,
          ...pickBaseStyle(useAppState.getState().currentStyle),
          points: polyPoints,
          closed: true,
        });

        // Auto-group with any closed polygon whose perimeter we just shared.
        // This is how a 3D construction (multiple faces sharing edges) ends
        // up as one moveable unit. Reuse an existing groupId if a shared
        // polygon already belongs to a group; otherwise mint a fresh one.
        let groupId: string | null = null;
        if (cycle.sharedPolygonIds.length > 0) {
          const sharedById = new Map(
            elements
              .filter((el) => cycle.sharedPolygonIds.includes(el.id))
              .map((el) => [el.id, el] as const),
          );
          for (const el of sharedById.values()) {
            if (el.groupId) {
              groupId = el.groupId;
              break;
            }
          }
          if (!groupId) groupId = id();
          (closed as { groupId: string | null }).groupId = groupId;

          // Bring all shared polygons (and any open lines that touch a vertex
          // of the new polygon) into the same group so the whole construction
          // moves together. Lines whose endpoints don't touch the new polygon
          // are unrelated and stay independent.
          const newVertexKeys = new Set(
            cycle.vertices.map((v) => nodeKey({ x: v[0], y: v[1] })),
          );
          const groupTargetIds: string[] = [];
          for (const el of elements) {
            if (el.type !== "line") continue;
            if (el.isDeleted) continue;
            if (cycle.consumedLineIds.includes(el.id)) continue;
            if (el.groupId === groupId) continue;
            if (cycle.sharedPolygonIds.includes(el.id)) {
              groupTargetIds.push(el.id);
              continue;
            }
            if (el.closed) continue;
            // Open line: include if either endpoint coincides with a new
            // polygon vertex. These are typically the in-flight extrusion
            // edges of the same 3D shape.
            const a = el.points[0];
            const b = el.points[el.points.length - 1];
            if (!a || !b) continue;
            const aKey = nodeKey({ x: a[0], y: a[1] });
            const bKey = nodeKey({ x: b[0], y: b[1] });
            if (newVertexKeys.has(aKey) || newVertexKeys.has(bKey)) {
              groupTargetIds.push(el.id);
            }
          }
          if (groupTargetIds.length > 0) {
            const gid = groupId;
            ctx.updateElements(groupTargetIds, (el) =>
              el.groupId === gid ? el : { ...el, groupId: gid },
            );
          }
        }

        ctx.addElement(closed);
        if (cycle.consumedLineIds.length > 0) {
          ctx.deleteElements(cycle.consumedLineIds);
        }
        ctx.setSelectedIds([closed.id]);
      } else {
        ctx.addElement(newLine);
        ctx.setSelectedIds([newLine.id]);
      }
      ctx.setActiveTool("selection");
    },
    onCancel(ctx) {
      start = null;
      useAppState.getState().setLineSnapTarget(null);
      useAppState.getState().setPolygonPreview(null);
      useAppState.getState().setSnapGuides([]);
      ctx.setDraft(null);
    },
  };
}
