import type { NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { alignBox, alignDrag, type Box, shiftDrag } from "./alignment.ts";
import { NODE_SIZE } from "./placement.ts";

const card = (x: number, y: number): Box => ({ x, y, ...NODE_SIZE });

describe("alignment guides", () => {
  it("snap a card that's nearly level with another, and show one line through their middles", () => {
    const { dx, dy, guides } = alignBox(card(400, 205), [card(0, 200)], 8);
    expect(dx).toBe(0); // nothing lines up across
    expect(dy).toBe(-5);
    expect(guides).toEqual([
      // One line, not three: same-size cards share their top, middle and bottom.
      {
        orientation: "horizontal",
        at: 200 + NODE_SIZE.height / 2,
        start: -16,
        end: 400 + NODE_SIZE.width + 16,
      },
    ]);
  });

  it("leave a card alone when nothing is within the threshold", () => {
    expect(alignBox(card(400, 220), [card(0, 200)], 8)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("take the nearest match when several are in reach", () => {
    // 6 from one card's row, 3 from the other's.
    const { dy } = alignBox(card(400, 206), [card(0, 200), card(800, 203)], 8);
    expect(dy).toBe(-3);
  });

  it("line up columns too, with a vertical line spanning every card in it", () => {
    const { dx, guides } = alignBox(card(102, 500), [card(100, 0), card(100, 250)], 8);
    expect(dx).toBe(-2);
    expect(guides).toEqual([
      {
        orientation: "vertical",
        at: 100 + NODE_SIZE.width / 2,
        start: -16,
        end: 500 + NODE_SIZE.height + 16,
      },
    ]);
  });

  it("line up a group by its edges when the sizes differ", () => {
    // Two cards side by side, dragged together: their left edge meets a card's left edge.
    const group: Box = {
      x: 103,
      y: 600,
      width: 2 * NODE_SIZE.width + 64,
      height: NODE_SIZE.height,
    };
    const { dx, guides } = alignBox(group, [card(100, 0)], 8);
    expect(dx).toBe(-3);
    expect(guides.map((g) => [g.orientation, g.at])).toEqual([["vertical", 100]]);
  });
});

describe("aligning a drag", () => {
  const nodes = [
    { id: "a", position: { x: 0, y: 200 } },
    { id: "b", position: { x: 400, y: 0 } },
    { id: "c", position: { x: 640, y: 0 } },
  ];
  const drag = (moves: [string, number, number][], dragging = true): NodeChange[] =>
    moves.map(([id, x, y]) => ({ type: "position", id, position: { x, y }, dragging }));

  it("moves every dragged component by the same shift", () => {
    const result = alignDrag(
      drag([
        ["b", 400, 196],
        ["c", 640, 196],
      ]),
      nodes,
      8,
    );
    expect(result.shift).toEqual({ x: 0, y: 4 });
    expect(result.changes).toEqual(
      drag([
        ["b", 400, 200],
        ["c", 640, 200],
      ]),
    );
    expect(result.guides).toHaveLength(1);
  });

  it("leaves changes that aren't a drag alone", () => {
    const select: NodeChange[] = [{ type: "select", id: "a", selected: true }];
    expect(alignDrag(select, nodes, 8)).toEqual({
      changes: select,
      shift: { x: 0, y: 0 },
      guides: [],
    });
    const drop = drag([["b", 400, 196]], false);
    expect(alignDrag(drop, nodes, 8).changes).toEqual(drop);
  });

  it("keeps the drop where the drag lined up", () => {
    // React Flow's drop repeats its own position, from before lining up.
    expect(shiftDrag(drag([["b", 400, 196]], false), { x: 0, y: 4 })).toEqual(
      drag([["b", 400, 200]], false),
    );
  });
});
