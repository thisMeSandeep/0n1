import { describe, expect, it } from "vitest";
import { type NodeSpec, runningSystem, wholeRun } from "../testing.ts";

const RUN = 60_000;
const roomy = { concurrency: 256, maxWaiting: 100_000 };
const fast = { ...roomy, workTime: 1 };

/** Client → API → (cache) + database, run for a minute; the snapshot at the end. */
function cacheAside(
  client: Record<string, unknown>,
  cache: Record<string, unknown> | null,
  extra: Record<string, NodeSpec> = {},
) {
  const nodes: Record<string, NodeSpec> = {
    users: { type: "client", params: { timeout: 60_000, ...client } },
    api: { type: "service", params: fast },
    db: {
      type: "database",
      params: { connections: 256, maxWaiting: 100_000, readTime: 2, writeTime: 4 },
    },
    ...extra,
  };
  const edges: [string, string][] = [
    ["users", "api"],
    ["api", "db"],
  ];
  if (cache) {
    nodes.cache = { type: "cache", params: { concurrency: 256, ttl: 86_400, ...cache } };
    edges.push(["api", "cache"]);
  }
  const engine = runningSystem(nodes, edges);
  engine.runUntil(RUN);
  return engine.snapshot();
}

const within = (actual: number | null | undefined, expected: number, absolute: number) =>
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(absolute);

describe("cache", () => {
  it("with uniform keys, an LRU holding 10% of them hits about 10% of the time", () => {
    const m = cacheAside(
      { rate: 500, readShare: 100, keys: 1000, keyPopularity: "uniform" },
      { size: 100 },
    );
    within(m.nodes.cache?.hitRatio, 0.1, 0.02);
  });

  it("hits almost always once everything fits", () => {
    const m = cacheAside(
      { rate: 500, readShare: 100, keys: 500, keyPopularity: "uniform" },
      { size: 1000 },
    );
    expect(m.nodes.cache?.hitRatio).toBeGreaterThan(0.97);
  });

  it("hot keys give a far higher hit ratio than uniform keys at the same size", () => {
    const ratio = (keyPopularity: string) =>
      cacheAside({ rate: 500, readShare: 100, keys: 100_000, keyPopularity }, { size: 1000 }).nodes
        .cache?.hitRatio ?? 0;
    const hot = ratio("hot");
    const uniform = ratio("uniform");
    expect(hot).toBeGreaterThan(0.4);
    expect(uniform).toBeLessThan(0.02);
  });

  it("is cache-aside: only misses reach the database, and each miss is stored", () => {
    const m = cacheAside(
      { rate: 500, readShare: 100, keys: 2000, keyPopularity: "uniform" },
      { size: 500 },
    );
    const reads = m.nodes.api?.arrivals ?? 0;
    const missRatio = 1 - (m.nodes.cache?.hitRatio ?? 0);
    within((m.nodes.db?.arrivals ?? 0) / reads, missRatio, 0.03);
    // Every read asks the cache; every miss also stores the result there.
    within((m.nodes.cache?.arrivals ?? 0) / reads, 1 + missRatio, 0.03);
  });

  it("a short TTL lowers the hit ratio", () => {
    const ratio = (ttl: number) =>
      cacheAside(
        { rate: 100, readShare: 100, keys: 1000, keyPopularity: "uniform" },
        { size: 1000, ttl },
      ).nodes.cache?.hitRatio ?? 0;
    expect(ratio(86_400)).toBeGreaterThan(0.9);
    expect(ratio(2)).toBeLessThan(0.3);
  });

  it("writes invalidate keys, so a write-heavy mix hits less", () => {
    const run = (readShare: number) =>
      cacheAside({ rate: 500, readShare, keys: 500, keyPopularity: "hot" }, { size: 1000 });
    const readOnly = run(100);
    const mixed = run(50);
    expect(mixed.nodes.cache?.hitRatio ?? 1).toBeLessThan(
      (readOnly.nodes.cache?.hitRatio ?? 0) - 0.1,
    );
  });
});

describe("database", () => {
  it("takes its read time for reads and its write time for writes", () => {
    const latency = (readShare: number) =>
      cacheAside({ rate: 20, readShare, keys: 100 }, null).nodes.db?.latency?.mean ?? 0;
    within(latency(100), 2, 0.3);
    within(latency(0), 4, 0.5);
  });

  it("queues when all connections are busy", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 500, timeout: 60_000, retries: 0 } },
        api: { type: "service", params: fast },
        db: {
          type: "database",
          params: { connections: 2, readTime: 5, writeTime: 5, maxWaiting: 100_000 },
        },
      },
      [
        ["users", "api"],
        ["api", "db"],
      ],
    );
    engine.runUntil(10_000);
    // Needs 500/s × 5 ms = 2.5 connections; only 2: it saturates and the line grows.
    const db = engine.snapshot().nodes.db;
    expect(db?.utilization).toBeGreaterThan(0.99);
    expect(db?.waiting).toBeGreaterThan(100);
  });

  it("spreads keys across several databases (sharding)", () => {
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: { rate: 400, readShare: 0, keys: 10_000, keyPopularity: "uniform" },
        },
        api: { type: "service", params: fast },
        db1: { type: "database", params: roomy },
        db2: { type: "database", params: roomy },
      },
      [
        ["users", "api"],
        ["api", "db1"],
        ["api", "db2"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    const { nodes } = engine.snapshot();
    const share =
      (nodes.db1?.totals.arrived ?? 0) /
      ((nodes.db1?.totals.arrived ?? 0) + (nodes.db2?.totals.arrived ?? 0));
    within(share, 0.5, 0.02);
  });
});

describe("read replica", () => {
  const replicated = (client: Record<string, unknown>, replicationLag = 100) => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { timeout: 60_000, ...client } },
        api: { type: "service", params: fast },
        db: { type: "database", params: roomy },
        replica: { type: "read-replica", params: { ...roomy, replicationLag } },
      },
      [
        ["users", "api"],
        ["api", "db"],
        ["api", "replica"],
        ["db", "replica"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    return engine.snapshot().nodes;
  };

  it("takes the reads; writes skip it and go to the database", () => {
    const nodes = replicated({ rate: 300, readShare: 70 });
    const total = nodes.api?.totals.arrived ?? 0;
    within((nodes.replica?.totals.arrived ?? 0) / total, 0.7, 0.02);
    within((nodes.db?.totals.arrived ?? 0) / total, 0.3, 0.02);
  });

  it("serves stale reads while writes are still on their way", () => {
    const nodes = replicated({ rate: 300, readShare: 50, keys: 50, keyPopularity: "hot" }, 2000);
    expect(nodes.replica?.staleReads).toBeGreaterThan(0.3);
  });

  it("is never stale when there are no writes", () => {
    expect(replicated({ rate: 300, readShare: 100 }).replica?.staleReads).toBe(0);
  });
});

describe("CDN", () => {
  const throughCdn = (client: Record<string, unknown>) => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { timeout: 60_000, ...client } },
        cdn: { type: "cdn", params: { hitRatio: 80, edgeTime: 15 } },
        api: { type: "service", params: { ...roomy, workTime: 50 } },
      },
      [
        ["users", "cdn"],
        ["cdn", "api"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    return engine.snapshot();
  };

  it("answers its hit ratio of reads at the edge and sends the rest to the origin", () => {
    const { nodes, system } = throughCdn({ rate: 300, readShare: 100 });
    within(nodes.cdn?.hitRatio, 0.8, 0.02);
    within((nodes.api?.totals.arrived ?? 0) / (nodes.cdn?.totals.arrived ?? 1), 0.2, 0.02);
    // Most answers come from the edge, fast.
    expect(system.latency?.p50 ?? 0).toBeLessThan(30);
  });

  it("sends every write to the origin", () => {
    const { nodes } = throughCdn({ rate: 300, readShare: 0 });
    expect(nodes.api?.totals.arrived).toBeCloseTo(nodes.cdn?.totals.arrived ?? 0, -1);
  });
});
