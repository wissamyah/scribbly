// Helpers for the LineTool's endpoint-snap + close-the-polygon feature.
//
// When a user draws several straight lines whose endpoints meet, the tool
// wants to detect the moment those segments form a closed loop and merge
// them into a single closed `LineElement` (which the renderer then fills).
//
// The graph model: nodes are unique endpoint positions (snapped to a small
// epsilon so floating-point noise doesn't split coincident points), edges
// are 2-point line elements connecting two nodes.

import type { LineElement, Point } from "../canvas/elements";

const NODE_EPSILON = 0.5;

export function nodeKey(p: { x: number; y: number }): string {
  // Round to NODE_EPSILON precision so endpoints within half a world unit
  // collapse to the same node. Snap-during-drawing already lands endpoints
  // exactly on existing nodes; this is the safety net.
  const r = (v: number) => Math.round(v / NODE_EPSILON);
  return `${r(p.x)}|${r(p.y)}`;
}

// Snap candidates the LineTool joins new line endpoints to:
//   - open lines contribute their first + last points (their two free ends)
//   - closed polygons contribute every vertex (each corner is a joinable
//     point — this is what lets the user build 3D shapes by extruding new
//     edges off an existing closed shape's corners).
//
// Closed-polygon vertices are reported with the polygon's own line id so
// cycle detection can still exclude them as graph edges (a closed polygon
// must not be broken apart by adding a new diagonal through one of its
// corners).
export function collectLineEndpoints(
  lines: readonly LineElement[],
): { x: number; y: number; lineId: string; end: "start" | "end" }[] {
  const out: { x: number; y: number; lineId: string; end: "start" | "end" }[] = [];
  for (const ln of lines) {
    if (ln.isDeleted) continue;
    if (ln.points.length < 2) continue;
    if (ln.closed) {
      for (const pt of ln.points) {
        out.push({ x: pt[0], y: pt[1], lineId: ln.id, end: "start" });
      }
      continue;
    }
    const a = ln.points[0]!;
    const b = ln.points[ln.points.length - 1]!;
    out.push({ x: a[0], y: a[1], lineId: ln.id, end: "start" });
    out.push({ x: b[0], y: b[1], lineId: ln.id, end: "end" });
  }
  return out;
}

// Returns the nearest endpoint within `maxDist` (world units), or null.
export function nearestEndpoint(
  cursor: { x: number; y: number },
  endpoints: readonly { x: number; y: number; lineId: string }[],
  maxDist: number,
  excludeLineId?: string,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const ep of endpoints) {
    if (excludeLineId && ep.lineId === excludeLineId) continue;
    const d = Math.hypot(ep.x - cursor.x, ep.y - cursor.y);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = { x: ep.x, y: ep.y };
    }
  }
  return best;
}

// Find a cycle connecting `startKey` back to itself through `endKey` (the
// two endpoints of the freshly placed line). Returns the ordered polygon
// vertex list, plus the open-line ids that should be CONSUMED by the merge
// (open lines in the cycle become redundant once a closed polygon owns
// them; closed-polygon perimeter segments stay shared and aren't returned).
//
// Two kinds of edges participate in the graph:
//   - **Open 2-point lines** the user has drawn. These are consumable —
//     when the cycle closes, they fold into the new polygon and get
//     deleted to avoid duplicate strokes.
//   - **Perimeter segments of existing closed polygons.** These are
//     traversable but shared — the original polygon must stay intact
//     because its other edges still depend on those vertices. This is
//     what lets a new face share a seam with an existing closed shape
//     (e.g. a pyramid's side face sharing the base triangle's edge).
//
// `excludeLineId` keeps the freshly placed line out of the graph — we want
// the *other* lines/edges to form a path from startKey → endKey, which the
// new line then closes.
export function findClosingCycle(
  startKey: string,
  endKey: string,
  lines: readonly LineElement[],
  newLinePoints: readonly Point[],
  excludeLineId: string,
): {
  vertices: Point[];
  consumedLineIds: string[];
  // Existing closed polygons whose perimeter edges were traversed by the
  // cycle. They stay in the scene (their edges are shared with the new
  // polygon) but the caller groups them with the new polygon so the whole
  // 3D construction moves together.
  sharedPolygonIds: string[];
} | null {
  if (startKey === endKey) return null;

  type EdgeKind = "open" | "shared";
  // Adjacency: nodeKey → list of edges.
  const adj = new Map<
    string,
    {
      neighborKey: string;
      lineId: string;
      neighborPoint: Point;
      kind: EdgeKind;
    }[]
  >();
  const addEdge = (
    aKey: string,
    bKey: string,
    aPt: Point,
    bPt: Point,
    lineId: string,
    kind: EdgeKind,
  ): void => {
    const list = adj.get(aKey) ?? [];
    list.push({ neighborKey: bKey, lineId, neighborPoint: bPt, kind });
    adj.set(aKey, list);
    const listB = adj.get(bKey) ?? [];
    listB.push({ neighborKey: aKey, lineId, neighborPoint: aPt, kind });
    adj.set(bKey, listB);
  };
  for (const ln of lines) {
    if (ln.isDeleted) continue;
    if (ln.id === excludeLineId) continue;
    if (ln.closed) {
      // Each consecutive pair of vertices becomes a shared perimeter edge,
      // including the wrap-around seam (last → first).
      for (let i = 0; i < ln.points.length; i++) {
        const a = ln.points[i]!;
        const b = ln.points[(i + 1) % ln.points.length]!;
        const aKey = nodeKey({ x: a[0], y: a[1] });
        const bKey = nodeKey({ x: b[0], y: b[1] });
        if (aKey === bKey) continue;
        addEdge(aKey, bKey, a, b, ln.id, "shared");
      }
      continue;
    }
    if (ln.points.length !== 2) continue;
    const a = ln.points[0]!;
    const b = ln.points[1]!;
    const aKey = nodeKey({ x: a[0], y: a[1] });
    const bKey = nodeKey({ x: b[0], y: b[1] });
    if (aKey === bKey) continue;
    addEdge(aKey, bKey, a, b, ln.id, "open");
  }

  // DFS from startKey to endKey, tracking the path. Each node may appear
  // only once. We stop on the first path found — that's the smallest cycle.
  const visited = new Set<string>([startKey]);
  type Frame = {
    key: string;
    pt: Point;
    lineId: string | null;
    kind: EdgeKind | null;
  };
  const path: Frame[] = [
    { key: startKey, pt: newLinePoints[0]!, lineId: null, kind: null },
  ];

  const dfs = (cur: string): boolean => {
    if (cur === endKey) return true;
    const neighbors = adj.get(cur) ?? [];
    for (const n of neighbors) {
      if (visited.has(n.neighborKey)) continue;
      visited.add(n.neighborKey);
      path.push({
        key: n.neighborKey,
        pt: n.neighborPoint,
        lineId: n.lineId,
        kind: n.kind,
      });
      if (dfs(n.neighborKey)) return true;
      path.pop();
      visited.delete(n.neighborKey);
    }
    return false;
  };

  if (!dfs(startKey)) return null;

  const vertices: Point[] = path.map((f) => f.pt);
  // Only open-line ids get consumed. Shared (closed-polygon) edges remain.
  // Dedupe in case a single open multi-segment line is traversed twice
  // (defensive — current LineTool only produces 2-point open lines).
  const consumedSet = new Set<string>();
  const sharedSet = new Set<string>();
  for (const f of path) {
    if (!f.lineId) continue;
    if (f.kind === "open") consumedSet.add(f.lineId);
    else if (f.kind === "shared") sharedSet.add(f.lineId);
  }
  if (vertices.length < 3) return null;
  return {
    vertices,
    consumedLineIds: Array.from(consumedSet),
    sharedPolygonIds: Array.from(sharedSet),
  };
}
