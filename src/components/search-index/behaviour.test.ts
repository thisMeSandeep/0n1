import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../../engine/testing.ts";

const window = wholeRun(10_000);
const roomy = { concurrency: 1024, workTime: 1, maxWaiting: 100_000 };

/** Users searching 30% of the time; with or without a search index. */
function system(withIndex: boolean, index: Record<string, unknown> = {}) {
  return runningSystem(
    {
      users: {
        type: "client",
        params: { rate: 200, searchShare: 30, readShare: 50, keys: 1000, timeout: 30_000 },
      },
      api: { type: "service", params: roomy },
      db: { type: "database", params: { connections: 20, searchTime: 250, maxWaiting: 10_000 } },
      ...(withIndex ? { index: { type: "search-index", params: index } } : {}),
    },
    withIndex
      ? [
          ["users", "api"],
          ["api", "db"],
          ["api", "index"],
          ["db", "index"],
        ]
      : [
          ["users", "api"],
          ["api", "db"],
        ],
    { window },
  );
}

describe("search index", () => {
  it("takes searches off the database, which would otherwise scan for each one", () => {
    // Without one: 60 searches a second × 250 ms is 15 of 20 connections, just for searching.
    const scanning = system(false);
    scanning.runUntil(10_000);
    const withIndex = system(true);
    withIndex.runUntil(10_000);
    const before = scanning.snapshot();
    const after = withIndex.snapshot();
    expect(before.nodes.db?.utilization).toBeGreaterThan(0.6);
    expect(after.nodes.db?.utilization).toBeLessThan(0.1);
    expect(after.nodes.index?.arrivals).toBeCloseTo(60, -1);
    // Searches are 30% of requests: with scans they dominate the average; with an index they don't.
    expect(after.system.latency?.mean ?? 0).toBeLessThan((before.system.latency?.mean ?? 0) / 3);
  });

  it("is only as fresh as its indexing delay", () => {
    const slow = system(true, { indexingDelay: 30_000 });
    slow.runUntil(10_000);
    const fast = system(true, { indexingDelay: 1 });
    fast.runUntil(10_000);
    expect(slow.snapshot().nodes.index?.staleReads).toBeGreaterThan(0.2);
    expect(fast.snapshot().nodes.index?.staleReads).toBeLessThan(0.01);
  });
});
