// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { addTrack, advance, DOT_SPEED, type FlowTrack, placeDots, trackCount } from "./flowDots.ts";

/** A straight path from (0, 0) to (100, 0), sampled every 2px like samplePath does. */
function straightTrack(dots: number): FlowTrack {
  const count = 51;
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) points[i * 2] = i * 2;
  const circles = Array.from({ length: dots }, () =>
    document.createElementNS("http://www.w3.org/2000/svg", "circle"),
  );
  return { offset: 0, points, length: 100, dots: circles };
}

const xs = (track: FlowTrack) => track.dots.map((d) => Number(d.getAttribute("cx")));

const removers: (() => void)[] = [];
afterEach(() => {
  for (const remove of removers.splice(0)) remove();
});

describe("flow dots", () => {
  it("spaces dots evenly along the path", () => {
    const track = straightTrack(4);
    placeDots(track);
    expect(xs(track)).toEqual([0, 26, 50, 76]); // 25 and 75 land on the 2px samples
  });

  it("moves them along at a steady speed, wrapping round", () => {
    const track = straightTrack(4);
    removers.push(addTrack(track));
    advance((10 / DOT_SPEED) * 1000); // 10px
    expect(xs(track)).toEqual([10, 36, 60, 86]); // 35 and 85 round to the 2px samples
    advance((20 / DOT_SPEED) * 1000); // 30px in all: past the spacing of 25
    expect(track.offset).toBeCloseTo(5);
    expect(xs(track)[0]).toBe(6);
  });

  it("stops moving a connection once it's gone", () => {
    const track = straightTrack(2);
    const remove = addTrack(track);
    const before = trackCount();
    remove();
    expect(trackCount()).toBe(before - 1);
    advance(1000);
    expect(track.offset).toBe(0);
  });
});
