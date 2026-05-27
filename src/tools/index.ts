import { createArrowTool } from "./ArrowTool";
import { createEllipseTool } from "./EllipseTool";
import { createEraserTool } from "./EraserTool";
import { createFrameTool } from "./FrameTool";
import { createFreeDrawTool } from "./FreeDrawTool";
import { createHandTool } from "./HandTool";
import { createLaserTool } from "./LaserTool";
import { createLineTool } from "./LineTool";
import { createRectangleTool } from "./RectangleTool";
import { createSelectionTool } from "./SelectionTool";
import { createTextTool } from "./TextTool";
import type { DrawingTool, ToolName } from "./types";

export type ToolRegistry = Record<ToolName, DrawingTool>;

export function createToolRegistry(): ToolRegistry {
  return {
    selection: createSelectionTool(),
    hand: createHandTool(),
    rectangle: createRectangleTool(),
    ellipse: createEllipseTool(),
    line: createLineTool(),
    arrow: createArrowTool(),
    freedraw: createFreeDrawTool(),
    text: createTextTool(),
    eraser: createEraserTool(),
    laser: createLaserTool(),
    frame: createFrameTool(),
  };
}

export type {
  DrawingTool,
  ToolContext,
  ToolName,
  TextDraft,
  ElementPatcher,
} from "./types";
