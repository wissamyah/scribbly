import { useAppState } from "../store/appState";
import type { DrawingTool } from "./types";

export function createLaserTool(): DrawingTool {
  return {
    name: "laser",
    onPointerDown(info, _ctx) {
      const s = useAppState.getState();
      s.clearLaserTrail();
      s.pushLaserTrailPoint(info.world.x, info.world.y);
    },
    onPointerMove(info, _ctx) {
      useAppState.getState().pushLaserTrailPoint(info.world.x, info.world.y);
    },
    onPointerUp(_info, _ctx) {
      // Intentionally do NOT clear — let the trail fade out over its
      // lifetime so the release feels like a comet tail dissipating.
    },
    onCancel(_ctx) {
      useAppState.getState().clearLaserTrail();
    },
  };
}
