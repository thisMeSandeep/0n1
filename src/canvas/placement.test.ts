import { describe, expect, it } from "vitest";
import { centredAt, findFreeSpot, NODE_SIZE, snap } from "./placement.ts";

describe("snap", () => {
  it("rounds to the 8px grid", () => {
    expect(snap(0)).toBe(0);
    expect(snap(3)).toBe(0);
    expect(snap(5)).toBe(8);
    expect(snap(-13)).toBe(-16);
  });
});

describe("centredAt", () => {
  it("centres the node on the point, snapped", () => {
    expect(centredAt({ x: 500, y: 300 })).toEqual({
      x: snap(500 - NODE_SIZE.width / 2),
      y: snap(300 - NODE_SIZE.height / 2),
    });
  });
});

describe("findFreeSpot", () => {
  it("keeps the desired spot when it's free", () => {
    expect(findFreeSpot({ x: 0, y: 0 }, [{ x: 600, y: 600 }])).toEqual({ x: 0, y: 0 });
  });

  it("steps diagonally past overlapping nodes", () => {
    const first = findFreeSpot({ x: 0, y: 0 }, [{ x: 0, y: 0 }]);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBe(first.y);

    const second = findFreeSpot({ x: 0, y: 0 }, [{ x: 0, y: 0 }, first]);
    expect(second.x).toBeGreaterThan(first.x);
  });
});
