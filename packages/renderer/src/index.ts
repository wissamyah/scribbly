// Public API for @scribbly/renderer.
//
// Three groups:
//   - Pure data: types + constants + element math
//   - View math: screen↔world transforms
//   - Drawing: per-element primitives + a high-level renderItemElements driver
//
// The marketplace registry consumes the high-level driver. The Scribbly app
// re-exports types from here through its src/canvas/elements.ts (factories
// that need InstantDB ids live app-side) and calls drawElement from its own
// renderScene that layers selection/snap/laser overlays on top.

export * from "./types";
export * from "./constants";
export * from "./math";
export * from "./geometry";
export * from "./theme";
export * from "./draw";
export * from "./renderItem";
