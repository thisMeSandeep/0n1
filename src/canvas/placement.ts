import type { Position } from "../model/document.ts";

/** Where new components land on the canvas. */

/** MIME type for dragging a component type from the palette onto the canvas. */
export const COMPONENT_DRAG_TYPE = "application/x-0n1-component";

/**
 * Node size (UIUX §6), used for centring and overlap checks. The height is
 * the same idle and running: the numbers row and bar always take their space.
 */
export const NODE_SIZE = { width: 208, height: 101 } as const;
export const GRID = 8;

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/** Top-left position that centres a node on `point`, snapped to the grid. */
export function centredAt(point: Position): Position {
  return { x: snap(point.x - NODE_SIZE.width / 2), y: snap(point.y - NODE_SIZE.height / 2) };
}

/** Top-left position that puts a node's left edge (its input) at `point`, snapped. */
export function leftEdgeAt(point: Position): Position {
  return { x: snap(point.x), y: snap(point.y - NODE_SIZE.height / 2) };
}

const GAP = 16;
const STEP = 32;
const MAX_TRIES = 50;

function overlaps(a: Position, b: Position): boolean {
  return (
    Math.abs(a.x - b.x) < NODE_SIZE.width + GAP && Math.abs(a.y - b.y) < NODE_SIZE.height + GAP
  );
}

/**
 * The first spot at or after `desired`, stepping diagonally, that doesn't
 * overlap an existing node. Repeated clicks fan out instead of stacking.
 */
export function findFreeSpot(desired: Position, occupied: readonly Position[]): Position {
  let spot = desired;
  for (let i = 0; i < MAX_TRIES; i++) {
    if (!occupied.some((other) => overlaps(spot, other))) return spot;
    spot = { x: spot.x + STEP, y: spot.y + STEP };
  }
  return spot;
}
