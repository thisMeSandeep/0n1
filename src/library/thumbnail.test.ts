import { describe, expect, it } from "vitest";
import { NODE_SIZE } from "../canvas/placement.ts";
import { layoutOfStored, type SystemLayout } from "../model/layout.ts";
import { THUMBNAIL, thumbnailGeometry } from "./thumbnail.ts";

const layout = (
  nodes: [id: string, x: number, y: number][],
  edges: [string, string][] = [],
): SystemLayout => ({
  nodes: nodes.map(([id, x, y]) => ({ id, type: "service", x, y })),
  edges: edges.map(([source, target]) => ({ source, target })),
});

/** The boxes' bounds: everything drawn must sit inside the frame's padding. */
function bounds(boxes: ReturnType<typeof thumbnailGeometry>["boxes"]) {
  return {
    left: Math.min(...boxes.map((b) => b.x)),
    top: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.x + b.width)),
    bottom: Math.max(...boxes.map((b) => b.y + b.height)),
  };
}

describe("system thumbnails", () => {
  it("draw nothing for an empty system", () => {
    expect(thumbnailGeometry(layout([]))).toEqual({ boxes: [], lines: [] });
  });

  it("fit a long chain inside the frame, centred, keeping the boxes' shape", () => {
    const chain = layout(
      [0, 1, 2, 3, 4, 5].map((i) => [`n${i}`, i * 272, 0]),
      [0, 1, 2, 3, 4].map((i) => [`n${i}`, `n${i + 1}`]),
    );
    const { boxes, lines } = thumbnailGeometry(chain);
    const b = bounds(boxes);
    expect(b.left).toBeCloseTo(THUMBNAIL.padding, 0);
    expect(b.right).toBeCloseTo(THUMBNAIL.width - THUMBNAIL.padding, 0);
    // Centred top to bottom.
    expect(b.top).toBeCloseTo(THUMBNAIL.height - b.bottom, 0);
    const box = boxes[0]!;
    expect(box.width / box.height).toBeCloseTo(NODE_SIZE.width / NODE_SIZE.height, 0);
    // A line from each box's right edge to the next one's left.
    expect(lines).toHaveLength(5);
    expect(lines[0]?.x1).toBeCloseTo(box.x + box.width, 0);
    expect(lines[0]?.x2).toBeCloseTo(boxes[1]!.x, 0);
    expect(lines[0]?.y1).toBeCloseTo(box.y + box.height / 2, 0);
  });

  it("fit a tall system by its height", () => {
    const tall = layout([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`n${i}`, 0, i * 150]));
    const b = bounds(thumbnailGeometry(tall).boxes);
    expect(b.top).toBeCloseTo(THUMBNAIL.padding, 0);
    expect(b.bottom).toBeCloseTo(THUMBNAIL.height - THUMBNAIL.padding, 0);
  });

  it("don't blow up a system of one component", () => {
    const [box] = thumbnailGeometry(layout([["only", 500, 300]])).boxes;
    expect(box?.width).toBeLessThan(THUMBNAIL.width / 2);
    // In the middle.
    expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBeCloseTo(THUMBNAIL.width / 2, 0);
    expect((box?.y ?? 0) + (box?.height ?? 0) / 2).toBeCloseTo(THUMBNAIL.height / 2, 0);
  });

  it("skip connections to components that aren't there", () => {
    const { lines } = thumbnailGeometry(layout([["a", 0, 0]], [["a", "gone"]]));
    expect(lines).toEqual([]);
  });
});

describe("reading a stored layout", () => {
  it("keeps what it can read and leaves out the rest", () => {
    expect(
      layoutOfStored({
        nodes: [
          { id: "a", type: "service", position: { x: 1, y: 2 } },
          { id: "b", type: "service" },
          "nonsense",
        ],
        edges: [{ source: "a", target: "b" }, { source: 3 }],
      }),
    ).toEqual({
      nodes: [{ id: "a", type: "service", x: 1, y: 2 }],
      edges: [{ source: "a", target: "b" }],
    });
    expect(layoutOfStored(null)).toEqual({ nodes: [], edges: [] });
    expect(layoutOfStored({ nodes: "no" })).toEqual({ nodes: [], edges: [] });
  });
});
