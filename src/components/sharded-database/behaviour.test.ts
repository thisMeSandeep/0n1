import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../../engine/testing.ts";

const window = wholeRun(10_000);
const roomy = { concurrency: 1024, workTime: 1, maxWaiting: 100_000 };

function system(rate: number, client: Record<string, unknown>, db: Record<string, unknown>) {
  return runningSystem(
    {
      users: { type: "client", params: { rate, readShare: 100, timeout: 10_000, ...client } },
      api: { type: "service", params: roomy },
      db: { type: "sharded-database", params: { connections: 10, readTime: 10, ...db } },
    },
    [
      ["users", "api"],
      ["api", "db"],
    ],
    { window, eventBudget: Number.POSITIVE_INFINITY },
  );
}

describe("sharded database", () => {
  it("spreads keys evenly by hash, so four shards take four times the load", () => {
    // 2,400 reads a second: 2.4 shards' worth at 10 connections × 10 ms.
    const four = system(2400, { keyPopularity: "uniform" }, { shards: 4 });
    four.runUntil(10_000);
    const shards = four.snapshot().nodes.db?.shards ?? [];
    expect(shards).toHaveLength(4);
    expect(Math.max(...shards) / Math.min(...shards)).toBeLessThan(1.3);
    expect(four.snapshot().system.errorRate).toBe(0);

    const one = system(2400, { keyPopularity: "uniform" }, { shards: 1 });
    one.runUntil(10_000);
    expect(one.snapshot().nodes.db?.utilization).toBeGreaterThan(0.95); // swamped
  });

  it("by range, puts the popular keys together on one hot shard", () => {
    const popular = { keyPopularity: "hot", keys: 100_000 };
    const byRange = system(1500, popular, { shards: 4, spread: "range", keyRange: 100_000 });
    byRange.runUntil(10_000);
    const [first, ...rest] = byRange.snapshot().nodes.db?.shards ?? [];
    expect(first).toBeGreaterThan(0.9);
    expect(Math.max(...rest)).toBeLessThan(0.3);
    // The component is as busy as its busiest shard.
    expect(byRange.snapshot().nodes.db?.utilization).toBeCloseTo(first ?? 0, 1);

    const byHash = system(1500, popular, { shards: 4, spread: "hash" });
    byHash.runUntil(10_000);
    expect(Math.max(...(byHash.snapshot().nodes.db?.shards ?? []))).toBeLessThan(0.7);
  });

  it("sends writes on to replicas and search indexes, like a database", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 200, readShare: 0, timeout: 10_000 } },
        api: { type: "service", params: roomy },
        db: { type: "sharded-database" },
        replica: { type: "read-replica" },
      },
      [
        ["users", "api"],
        ["api", "db"],
        ["db", "replica"],
      ],
      { window },
    );
    engine.runUntil(5000);
    expect(engine.snapshot().edges["db→replica"]?.rate).toBeCloseTo(200, -1);
  });
});
