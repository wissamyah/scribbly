export type Shape3DVariant = "cube" | "cylinder" | "cone" | "pyramid";

export type Face = readonly (readonly [number, number])[];

export type EllipseRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Shape3DGeometry = {
  // Closed polygons rendered as `closed: true` LineElements so they pick up
  // the user's fill style. Listed back-to-front so the front-most face paints
  // last and visually occludes earlier faces.
  faces: readonly Face[];
  // Drawn after `faces` so the caps overlay the side body's outline cleanly.
  ellipses: readonly EllipseRect[];
};

type Box = { x: number; y: number; width: number; height: number };

// Depth share of the bounding box used as the isometric receding axis on the
// cube. Big enough to read as "3D" at small sizes, small enough that the
// front face still dominates.
const CUBE_DEPTH_RATIO = 0.28;

// Ellipse half-height for cylinder/cone caps, relative to the bbox width.
// Floored so very small shapes still look like rounded caps rather than slits.
function capHalfHeight(width: number): number {
  return Math.max(width * 0.12, 4);
}

function cubeGeometry(box: Box): Shape3DGeometry {
  const { x, y, width: w, height: h } = box;
  const depth = Math.min(w, h) * CUBE_DEPTH_RATIO;
  const frontW = w - depth;
  const fbl: [number, number] = [x, y + h];
  const fbr: [number, number] = [x + frontW, y + h];
  const ftl: [number, number] = [x, y + depth];
  const ftr: [number, number] = [x + frontW, y + depth];
  const bbr: [number, number] = [x + w, y + h - depth];
  const btl: [number, number] = [x + depth, y];
  const btr: [number, number] = [x + w, y];
  return {
    faces: [
      // Top face (back-most in paint order)
      [btl, btr, ftr, ftl],
      // Right face
      [ftr, btr, bbr, fbr],
      // Front face (front-most)
      [ftl, ftr, fbr, fbl],
    ],
    ellipses: [],
  };
}

function pyramidGeometry(box: Box): Shape3DGeometry {
  const { x, y, width: w, height: h } = box;
  // Diamond base sits in the bottom 30% of the bbox; apex centred at the top.
  const baseMidY = y + h * 0.85;
  const left: [number, number] = [x, baseMidY];
  const right: [number, number] = [x + w, baseMidY];
  const front: [number, number] = [x + w / 2, y + h];
  const apex: [number, number] = [x + w / 2, y];
  return {
    faces: [
      [apex, left, front],
      [apex, front, right],
    ],
    ellipses: [],
  };
}

function cylinderGeometry(box: Box): Shape3DGeometry {
  const { x, y, width: w, height: h } = box;
  const ry = capHalfHeight(w);
  const topCenterY = y + ry;
  const bottomCenterY = y + h - ry;
  return {
    faces: [
      [
        [x, topCenterY],
        [x + w, topCenterY],
        [x + w, bottomCenterY],
        [x, bottomCenterY],
      ],
    ],
    ellipses: [
      { x, y, width: w, height: 2 * ry },
      { x, y: y + h - 2 * ry, width: w, height: 2 * ry },
    ],
  };
}

function coneGeometry(box: Box): Shape3DGeometry {
  const { x, y, width: w, height: h } = box;
  const ry = capHalfHeight(w);
  const baseCenterY = y + h - ry;
  const apex: [number, number] = [x + w / 2, y];
  return {
    faces: [[apex, [x, baseCenterY], [x + w, baseCenterY]]],
    ellipses: [{ x, y: y + h - 2 * ry, width: w, height: 2 * ry }],
  };
}

export function shape3DGeometry(
  variant: Shape3DVariant,
  box: Box,
): Shape3DGeometry {
  switch (variant) {
    case "cube":
      return cubeGeometry(box);
    case "pyramid":
      return pyramidGeometry(box);
    case "cylinder":
      return cylinderGeometry(box);
    case "cone":
      return coneGeometry(box);
  }
}
