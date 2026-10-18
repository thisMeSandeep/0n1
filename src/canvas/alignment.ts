import type { NodeChange } from "@xyflow/react";
import { NODE_SIZE } from "./placement.ts";

/*
 * Alignment guides while dragging (M02). When the components being dragged
 * line up with another one (left edges, centres or right edges; tops,
 * middles or bottoms), a guide shows it, and within a few pixels they snap
 * into line. Plain functions over boxes, so the matching is testable.
 */

/** How close (in screen pixels) counts as lined up, and snaps. */
export const ALIGN_THRESHOLD_PX = 6;
/** How far a guide runs past the components it joins (flow units). */
const OVERHANG = 16;
/** Coordinates this close are the same line (flow units). */
const SAME = 0.5;

export type Box = { x: number; y: number; width: number; height: number };

/** A line on the canvas: vertical at x = `at` from y = `start` to `end`, or horizontal. */
export type Guide = {
  orientation: "vertical" | "horizontal";
  at: number;
  start: number;
  end: number;
};

type Axis = "x" | "y";

/** Anchor indices, middle first. */
const MIDDLE_FIRST = [1, 0, 2] as const;

/** Start, middle and end of a box along an axis. */
function anchors(box: Box, axis: Axis): [number, number, number] {
  const start = axis === "x" ? box.x : box.y;
  const size = axis === "x" ? box.width : box.height;
  return [start, start + size / 2, start + size];
}

/** The smallest shift (within `threshold`) that lines up an anchor with the same anchor of another box. */
function nearestShift(moving: Box, others: readonly Box[], axis: Axis, threshold: number): number {
  const mine = anchors(moving, axis);
  let best: number | null = null;
  for (const other of others) {
    const theirs = anchors(other, axis);
    for (let k = 0; k < 3; k++) {
      const shift = (theirs[k] as number) - (mine[k] as number);
      if (Math.abs(shift) <= threshold && (best === null || Math.abs(shift) < Math.abs(best))) {
        best = shift;
      }
    }
  }
  return best ?? 0;
}

/** The guides for a box where it is: every line it shares with another box. */
function guidesFor(moving: Box, others: readonly Box[], axis: Axis): Guide[] {
  const across: Axis = axis === "x" ? "y" : "x";
  const span = (box: Box) => {
    const [start, , end] = anchors(box, across);
    return [start, end] as const;
  };
  const lines = new Map<number, [number, number]>();
  const mine = anchors(moving, axis);
  for (const other of others) {
    const theirs = anchors(other, axis);
    // One line per neighbour: boxes the same size share all three when lined
    // up, so the middle is drawn if it matches, otherwise the edge that does.
    const k = MIDDLE_FIRST.find(
      (i) => Math.abs((theirs[i] as number) - (mine[i] as number)) <= SAME,
    );
    if (k === undefined) continue;
    const at = mine[k] as number;
    const [a0, a1] = span(moving);
    const [b0, b1] = span(other);
    const [s, e] = lines.get(at) ?? [a0, a1];
    lines.set(at, [Math.min(s, b0), Math.max(e, b1)]);
  }
  return [...lines].map(([at, [start, end]]) => ({
    orientation: axis === "x" ? "vertical" : "horizontal",
    at,
    start: start - OVERHANG,
    end: end + OVERHANG,
  }));
}

/** Where to move `moving` so it lines up with `others`, and the guides that then show. */
export function alignBox(
  moving: Box,
  others: readonly Box[],
  threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
  const dx = nearestShift(moving, others, "x", threshold);
  const dy = nearestShift(moving, others, "y", threshold);
  const aligned = { ...moving, x: moving.x + dx, y: moving.y + dy };
  return {
    dx,
    dy,
    guides: [...guidesFor(aligned, others, "x"), ...guidesFor(aligned, others, "y")],
  };
}

type Placed = {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
};

const boxOf = (node: Placed, position = node.position): Box => ({
  x: position.x,
  y: position.y,
  width: node.measured?.width ?? NODE_SIZE.width,
  height: node.measured?.height ?? NODE_SIZE.height,
});

/**
 * Line up a drag's position changes: the components being dragged move as
 * one box, against every other component. Returns the changes to apply,
 * the shift made, and the guides to show. Changes without a drag in them
 * come back as they were.
 */
export function alignDrag<C extends NodeChange>(
  changes: readonly C[],
  nodes: readonly Placed[],
  threshold: number,
): { changes: C[]; shift: { x: number; y: number }; guides: Guide[] } {
  const moving = new Map<string, { x: number; y: number }>();
  for (const change of changes) {
    if (change.type === "position" && change.dragging && change.position) {
      moving.set(change.id, change.position);
    }
  }
  if (moving.size === 0) return { changes: [...changes], shift: { x: 0, y: 0 }, guides: [] };

  const boxes = nodes.flatMap((n) => {
    const position = moving.get(n.id);
    return position ? [boxOf(n, position)] : [];
  });
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const group: Box = {
    x: left,
    y: top,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - top,
  };
  const others = nodes.filter((n) => !moving.has(n.id)).map((n) => boxOf(n));
  const { dx, dy, guides } = alignBox(group, others, threshold);
  return { changes: shiftDrag(changes, { x: dx, y: dy }), shift: { x: dx, y: dy }, guides };
}

/** Move every dragged component's position change by `shift`. */
export function shiftDrag<C extends NodeChange>(
  changes: readonly C[],
  shift: { x: number; y: number },
): C[] {
  if (shift.x === 0 && shift.y === 0) return [...changes];
  return changes.map((change) =>
    change.type === "position" && change.position
      ? { ...change, position: { x: change.position.x + shift.x, y: change.position.y + shift.y } }
      : change,
  );
}
