import { describe, expect, it } from "vitest";
import { registry } from "../../components/index.ts";
import type { NewScenarioEvent } from "../../model/scenario.ts";
import { compile } from "../compile.ts";
import { edgeKey } from "../metrics/recorder.ts";
import { systemDocument } from "../testing.ts";
import { Engine } from "./engine.ts";

const window = { windowMs: 1000, slots: 4 };
const roomy = { concurrency: 64, maxWaiting: 10_000, workTime: 5 };

const nodes = {
  users: { type: "client", params: { rate: 300, retries: 0, timeout: 5000 } },
  api: { type: "service", params: roomy },
  cache: { type: "cache", params: { size: 100_000 } },
  db: { type: "database", params: { connections: 64, readTime: 5 } },
} as const;
const edges = [
  ["users", "api"],
  ["api", "cache"],
  ["api", "db"],
] as const;

/** The test system with a chaos timeline; returns the engine and compile warnings. */
function withTimeline(events: NewScenarioEvent[]) {
  const doc = {
    ...systemDocument(nodes, edges),
    scenario: { events: events.map((event, i) => ({ ...event, id: `e${i}` })) },
  };
  const { model, warnings } = compile(doc, registry);
  if (!model) throw new Error("didn't compile");
  return { engine: new Engine(model, { window }), warnings: warnings.map((w) => w.message) };
}

describe("the chaos timeline", () => {
  it("takes a component down on time, and brings it back", () => {
    const { engine } = withTimeline([{ kind: "down", at: 2000, target: "api", duration: 3000 }]);
    engine.runUntil(1900);
    expect(engine.snapshot().nodes.api?.down).toBe(false);
    engine.runUntil(3000);
    expect(engine.snapshot().nodes.api?.down).toBe(true);
    expect(engine.snapshot().nodes.api?.downSince).toBe(2000);
    engine.runUntil(5100);
    expect(engine.snapshot().nodes.api?.down).toBe(false);
  });

  it("keeps a component down to the end when there's no duration", () => {
    const { engine } = withTimeline([{ kind: "down", at: 1000, target: "db", duration: null }]);
    engine.runUntil(60_000);
    expect(engine.snapshot().nodes.db?.down).toBe(true);
  });

  it("slows a component down: its work takes that many times longer, for a while", () => {
    const { engine } = withTimeline([
      { kind: "slow", at: 5000, target: "db", factor: 5, duration: 5000 },
    ]);
    // Uncached reads: a fresh key each time, so every one reaches the database.
    engine.updateParams("users", { keyPopularity: "uniform", keys: 10_000_000 });
    engine.runUntil(4900);
    const before = engine.snapshot().nodes.db?.latency?.p50 ?? 0;
    engine.runUntil(9900);
    const slowed = engine.snapshot();
    expect(slowed.faults.slowed).toEqual({ db: 5 });
    expect(slowed.nodes.db?.latency?.p50 ?? 0).toBeGreaterThan(before * 3.5);
    engine.runUntil(15_000);
    const after = engine.snapshot();
    expect(after.faults.slowed).toEqual({});
    expect(after.nodes.db?.latency?.p50 ?? 0).toBeLessThan(before * 1.5);
  });

  it("cuts a connection: requests on it fail at once, and no component is blamed", () => {
    const { engine } = withTimeline([
      { kind: "cut", at: 2000, target: "users->api", duration: 2000 },
    ]);
    engine.runUntil(3900);
    const cut = engine.snapshot();
    expect(cut.faults.cut).toEqual([edgeKey("users", "api")]);
    expect(cut.edges[edgeKey("users", "api")]?.errorRate).toBeGreaterThan(0.9);
    expect(cut.system.latency?.p99 ?? Number.POSITIVE_INFINITY).toBeLessThan(5); // fails fast
    expect(cut.nodes.api?.failures).toBe(0);
    engine.runUntil(6000);
    const healed = engine.snapshot();
    expect(healed.faults.cut).toEqual([]);
    expect(healed.system.errorRate).toBe(0);
  });

  it("flushes a cache: it starts cold again", () => {
    const { engine } = withTimeline([{ kind: "flush", at: 10_000, target: "cache" }]);
    engine.runUntil(10_000);
    const warm = engine.snapshot().nodes.cache?.hitRatio ?? 0;
    engine.runUntil(10_500);
    const cold = engine.snapshot().nodes.cache?.hitRatio ?? 1;
    expect(warm).toBeGreaterThan(0.5);
    expect(cold).toBeLessThan(warm * 0.6);
  });

  it("surges traffic for a while", () => {
    const { engine } = withTimeline([{ kind: "surge", at: 3000, factor: 3, duration: 3000 }]);
    engine.runUntil(2900);
    const calm = engine.snapshot().nodes.users?.arrivals ?? 0;
    engine.runUntil(5900);
    const surge = engine.snapshot();
    expect(surge.faults.surge).toBe(3);
    expect(surge.nodes.users?.arrivals ?? 0).toBeGreaterThan(calm * 2.5);
    engine.runUntil(8000);
    expect(engine.snapshot().faults.surge).toBe(1);
  });

  it("replays the same way every run", () => {
    const events: NewScenarioEvent[] = [
      { kind: "down", at: 1000, target: "api", duration: 1000 },
      { kind: "surge", at: 2500, factor: 2, duration: 2000 },
      { kind: "slow", at: 3000, target: "db", factor: 3, duration: 1000 },
    ];
    const run = () => {
      const { engine } = withTimeline(events);
      engine.runUntil(6000);
      return engine.snapshot();
    };
    expect(run()).toEqual(run());
  });

  it("leaves out events that don't fit, with a warning", () => {
    const { warnings, engine } = withTimeline([
      { kind: "flush", at: 1000, target: "db" },
      { kind: "slow", at: 1000, target: "users", factor: 2, duration: 1000 },
    ]);
    expect(warnings).toEqual([
      "Only caches can be flushed, so the flush of db is left out.",
      "users is a client: slow down a component instead.",
    ]);
    engine.runUntil(2000);
    expect(engine.snapshot().faults.slowed).toEqual({});
  });
});
