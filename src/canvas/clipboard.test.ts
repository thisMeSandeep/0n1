import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { systemDocument } from "../engine/testing.ts";
import {
  CLIPBOARD_FORMAT,
  clipboardText,
  PASTE_OFFSET,
  pasteShift,
  readClipboard,
} from "./clipboard.ts";

const doc = systemDocument(
  {
    users: { type: "client", name: "Users", params: { rate: 50 } },
    api: { type: "service", name: "API" },
    db: { type: "database", name: "DB" },
  },
  [
    ["users", "api"],
    ["api", "db"],
  ],
);

describe("the clipboard", () => {
  it("carries the selected components and only the connections among them", () => {
    const text = clipboardText(doc, ["api", "db"]);
    const read = readClipboard(text ?? "", registry);
    expect(read?.nodes.map((n) => n.name)).toEqual(["API", "DB"]);
    expect(read?.edges).toEqual([{ source: "api", target: "db" }]);
    expect(read?.nodes[0]).toEqual(doc.nodes[1]); // settings and all
  });

  it("has nothing to copy without a selection", () => {
    expect(clipboardText(doc, [])).toBeNull();
    expect(clipboardText(doc, ["gone"])).toBeNull();
  });

  it("ignores anything that isn't 0n1's", () => {
    for (const text of [
      "hello",
      "{}",
      "[1,2]",
      `{"format":"${CLIPBOARD_FORMAT}"}`,
      `${CLIPBOARD_FORMAT} {`,
    ]) {
      expect(readClipboard(text, registry)).toBeNull();
    }
  });

  it("leaves out components this version doesn't know, and refuses copies from a newer 0n1", () => {
    const raw = JSON.parse(clipboardText(doc, ["users", "api"]) ?? "");
    raw.nodes[0].type = "teleporter";
    const read = readClipboard(JSON.stringify(raw), registry);
    expect(read?.nodes.map((n) => n.name)).toEqual(["API"]);
    expect(read?.edges).toEqual([]);
    raw.schemaVersion = 99;
    expect(readClipboard(JSON.stringify(raw), registry)).toBeNull();
  });
});

describe("where a paste lands", () => {
  const at = (x: number, y: number) => ({ position: { x, y } });
  const view = { x: 0, y: 0, width: 1000, height: 800 };

  it("in place, when the spot is free and in view (a cut, then paste)", () => {
    expect(pasteShift([at(100, 100)], [at(400, 100)], view)).toEqual({ x: 0, y: 0 });
  });

  it("a step down and right of copies already there, further each time", () => {
    expect(pasteShift([at(100, 100)], [at(100, 100)], view)).toEqual({
      x: PASTE_OFFSET,
      y: PASTE_OFFSET,
    });
    expect(
      pasteShift([at(100, 100)], [at(100, 100), at(100 + PASTE_OFFSET, 100 + PASTE_OFFSET)], view),
    ).toEqual({ x: 2 * PASTE_OFFSET, y: 2 * PASTE_OFFSET });
  });

  it("in the middle of the view when its own spot is out of sight", () => {
    const shift = pasteShift([at(5000, 5000), at(5300, 5000)], [], view);
    // The pair (from x 5000 to 5508) is centred in the view, on the grid.
    const left = 5000 + shift.x;
    const right = 5300 + 208 + shift.x;
    expect((left + right) / 2).toBeCloseTo(500, -1);
    expect(Math.abs(shift.x % 8)).toBe(0);
  });
});
