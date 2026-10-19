import type { Position } from "../model/document.ts";
import { GRID, NODE_SIZE, snap } from "./placement.ts";

/*
 * Tidy layout (M06): arrange components in columns, the way requests flow.
 * A simple layered layout:
 * 1. Columns: each component sits one column right of the furthest thing
 *    that sends it requests, so clients come first and data comes last.
 *    (A loop, which wouldn't run anyway, is broken where it closes.)
 * 2. Order: each column starts in its current top-to-bottom order, then a
 *    few sweeps move each component towards the average row of what it's
 *    connected to (the barycentre heuristic), which uncrosses most lines.
 * 3. Place: columns evenly spaced and centred on one line, on the grid,
 *    starting where the system already is, so it tidies in place.
 */

/** From one column's left edge to the next's (the blueprints' spacing). */
export const COLUMN_STEP = NODE_SIZE.width + 64;
/**
 * From one row's top to the next's. A multiple of two grid steps, so half
 * a step is on the grid too and a fan-out stays exactly centred.
 */
export const ROW_STEP = Math.ceil((NODE_SIZE.height + 48) / (2 * GRID)) * 2 * GRID;
const SWEEPS = 4;

type Item = { id: string; position: Position };
type Link = { source: string; target: string };

/** New positions for every component, by id. */
export function tidyLayout(nodes: readonly Item[], edges: readonly Link[]): Map<string, Position> {
  const result = new Map<string, Position>();
  if (nodes.length === 0) return result;
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
  );
  const after = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of links) after.get(e.source)?.push(e.target);

  // Break loops: drop connections that lead back to something still being visited.
  const forward: Link[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string) => {
    state.set(id, "visiting");
    for (const next of after.get(id) ?? []) {
      if (state.get(next) === "visiting") continue;
      forward.push({ source: id, target: next });
      if (!state.has(next)) visit(next);
    }
    state.set(id, "done");
  };
  // Sources first (usually the clients), then whatever's left, in document order.
  const hasInput = new Set(links.map((e) => e.target));
  for (const n of nodes) if (!hasInput.has(n.id) && !state.has(n.id)) visit(n.id);
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);

  // 1. Columns: the longest path from a source.
  const before = new Map(nodes.map((n) => [n.id, [] as string[]]));
  const next = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of forward) {
    before.get(e.target)?.push(e.source);
    next.get(e.source)?.push(e.target);
  }
  const column = new Map<string, number>();
  const columnOf = (id: string): number => {
    const known = column.get(id);
    if (known !== undefined) return known;
    const c = Math.max(-1, ...(before.get(id) ?? []).map(columnOf)) + 1;
    column.set(id, c);
    return c;
  };
  for (const n of nodes) columnOf(n.id);

  // 2. Order within each column: as they are now, then towards what they connect to.
  const byPosition = [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  // Every column has something in it: each one's components are fed by the one before.
  const columns: string[][] = Array.from({ length: Math.max(...column.values()) + 1 }, () => []);
  for (const n of byPosition) columns[column.get(n.id) as number]?.push(n.id);
  /** Each component's row in its column, centred on 0 so columns of any height compare. */
  const rank = new Map<string, number>();
  const rankColumn = (col: readonly string[]) => {
    for (const [i, id] of col.entries()) rank.set(id, i - (col.length - 1) / 2);
  };
  for (const col of columns) rankColumn(col);
  const sweep = (order: number[], neighbours: Map<string, string[]>) => {
    for (const c of order) {
      const col = columns[c] as string[];
      const weight = (id: string) => {
        const linked = (neighbours.get(id) ?? []).map((n) => rank.get(n) ?? 0);
        // Nothing to go by: stay where it is.
        return linked.length > 0
          ? linked.reduce((a, b) => a + b, 0) / linked.length
          : (rank.get(id) ?? 0);
      };
      const weights = new Map(col.map((id) => [id, weight(id)]));
      // A stable sort, so ties keep the current order.
      col.sort((a, b) => (weights.get(a) as number) - (weights.get(b) as number));
      rankColumn(col);
    }
  };
  const indices = columns.map((_, i) => i);
  for (let i = 0; i < SWEEPS; i++) {
    sweep(indices.slice(1), before); // left to right, by what sends to them
    sweep([...indices].reverse().slice(1), next); // right to left, by what they send to
  }

  // 3. Place, starting at the current top-left, centred on the current middle.
  const left = Math.min(...nodes.map((n) => n.position.x));
  const top = Math.min(...nodes.map((n) => n.position.y));
  const bottom = Math.max(...nodes.map((n) => n.position.y)) + NODE_SIZE.height;
  const tallest = Math.max(...columns.map((col) => col.length));
  // Keep the middle, but don't let the tallest column start above the current top.
  const middle = Math.max(
    (top + bottom) / 2,
    top + ((tallest - 1) * ROW_STEP + NODE_SIZE.height) / 2,
  );
  for (const [c, col] of columns.entries()) {
    for (const [i, id] of col.entries()) {
      const y = middle - NODE_SIZE.height / 2 + (i - (col.length - 1) / 2) * ROW_STEP;
      result.set(id, { x: snap(left + c * COLUMN_STEP), y: snap(y) });
    }
  }
  return result;
}
