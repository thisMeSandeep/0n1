import { describe, expect, it } from "vitest";
import { GRID, NODE_SIZE } from "./placement.ts";
import { COLUMN_STEP, ROW_STEP, tidyLayout } from "./tidy.ts";

const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });
const link = (source: string, target: string) => ({ source, target });
/** Each component's column and row, counted from the layout's top-left. */
function grid(positions: Map<string, { x: number; y: number }>) {
  const left = Math.min(...[...positions.values()].map((p) => p.x));
  return Object.fromEntries(
    [...positions].map(([id, p]) => [id, { column: (p.x - left) / COLUMN_STEP, y: p.y }]),
  );
}

describe("tidy layout", () => {
  it("has nothing to do for an empty system", () => {
    expect(tidyLayout([], []).size).toBe(0);
  });

  it("lays a chain out left to right, in line, starting where it was", () => {
    const nodes = [at("db", 40, 900), at("users", 300, 100), at("api", 0, 500), at("lb", 800, 0)];
    const edges = [link("users", "lb"), link("lb", "api"), link("api", "db")];
    const placed = tidyLayout(nodes, edges);
    const g = grid(placed);
    expect([g.users, g.lb, g.api, g.db].map((p) => p?.column)).toEqual([0, 1, 2, 3]);
    expect(new Set([g.users, g.lb, g.api, g.db].map((p) => p?.y)).size).toBe(1);
    expect(placed.get("users")?.x).toBe(0); // the old left edge
    for (const p of placed.values()) {
      expect(p.x % GRID).toBe(0);
      expect(p.y % GRID).toBe(0);
    }
  });

  it("stacks a fan-out in one column, centred on what feeds it", () => {
    const nodes = [at("lb", 0, 0), at("a", 300, 0), at("b", 300, 200), at("db", 600, 100)];
    const edges = [link("lb", "a"), link("lb", "b"), link("a", "db"), link("b", "db")];
    const g = grid(tidyLayout(nodes, edges));
    expect([g.lb?.column, g.a?.column, g.b?.column, g.db?.column]).toEqual([0, 1, 1, 2]);
    expect((g.b?.y ?? 0) - (g.a?.y ?? 0)).toBe(ROW_STEP);
    expect(((g.a?.y ?? 0) + (g.b?.y ?? 0)) / 2).toBe(g.lb?.y);
    expect(g.db?.y).toBe(g.lb?.y);
  });

  it("puts each component one column after the furthest thing feeding it", () => {
    // users → api → db, and users → db directly: db still comes after api.
    const nodes = [at("users", 0, 0), at("api", 0, 200), at("db", 0, 400)];
    const edges = [link("users", "api"), link("api", "db"), link("users", "db")];
    const g = grid(tidyLayout(nodes, edges));
    expect([g.users?.column, g.api?.column, g.db?.column]).toEqual([0, 1, 2]);
  });

  it("keeps the current order when nothing says otherwise", () => {
    const nodes = [at("top", 0, 0), at("middle", 500, 300), at("bottom", 100, 900)];
    const g = grid(tidyLayout(nodes, []));
    expect((g.top?.y ?? 0) < (g.middle?.y ?? 0) && (g.middle?.y ?? 0) < (g.bottom?.y ?? 0)).toBe(
      true,
    );
  });

  it("uncrosses lines: each service moves level with what calls it", () => {
    // a (top) calls y, b (bottom) calls x, but x starts above y.
    const nodes = [at("a", 0, 0), at("b", 0, 300), at("x", 300, 0), at("y", 300, 300)];
    const edges = [link("a", "y"), link("b", "x")];
    const g = grid(tidyLayout(nodes, edges));
    expect(g.y?.y).toBe(g.a?.y);
    expect(g.x?.y).toBe(g.b?.y);
  });

  it("copes with a loop, and with components on their own", () => {
    const nodes = [at("a", 0, 0), at("b", 300, 0), at("alone", 900, 900)];
    const placed = tidyLayout(nodes, [link("a", "b"), link("b", "a")]);
    const g = grid(placed);
    expect([g.a?.column, g.b?.column, g.alone?.column]).toEqual([0, 1, 0]);
    expect(placed.size).toBe(3);
  });

  it("never lets a tall column start above the old top", () => {
    const nodes = [at("lb", 0, 0), ...[1, 2, 3, 4, 5].map((i) => at(`s${i}`, 300, 0))];
    const placed = tidyLayout(
      nodes,
      [1, 2, 3, 4, 5].map((i) => link("lb", `s${i}`)),
    );
    expect(Math.min(...[...placed.values()].map((p) => p.y))).toBeGreaterThanOrEqual(0);
    expect(NODE_SIZE.height).toBeLessThan(ROW_STEP);
  });
});
