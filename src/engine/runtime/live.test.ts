import { describe, expect, it } from "vitest";
import { runningSystem } from "../testing.ts";

const window = { windowMs: 1000, slots: 5 };

describe("changing settings while running", () => {
  it("more slots relieve an overloaded service, without a reset", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 400, retries: 0, timeout: 60_000 } },
        api: { type: "service", params: { concurrency: 4, workTime: 20, maxWaiting: 100_000 } },
      },
      [["users", "api"]],
      { window },
    );
    engine.runUntil(5000);
    const before = engine.snapshot().nodes.api;
    expect(before?.utilization).toBeGreaterThan(0.99);
    expect(before?.waiting).toBeGreaterThan(500);

    engine.updateParams("api", { concurrency: 64 });
    engine.runUntil(10_000);
    const after = engine.snapshot().nodes.api;
    expect(after?.utilization).toBeLessThan(0.3);
    expect(after?.waiting).toBe(0);
  });

  it("a client's rate change takes effect right away", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 2000 } },
        api: { type: "service", params: { concurrency: 256, workTime: 1 } },
      },
      [["users", "api"]],
      { window },
    );
    const rate = () => engine.snapshot().nodes.api?.arrivals ?? 0;
    engine.runUntil(3000);
    expect(Math.abs(rate() - 2000) / 2000).toBeLessThan(0.08);
    engine.updateParams("users", { rate: 6000 });
    engine.runUntil(6000);
    expect(Math.abs(rate() - 6000) / 6000).toBeLessThan(0.08);
  });

  it("the traffic multiplier scales every client, and sampling follows", () => {
    const engine = runningSystem(
      {
        a: { type: "client", params: { rate: 100 } },
        b: { type: "client", params: { rate: 300 } },
        api: { type: "service", params: { concurrency: 1024, workTime: 1 } },
      },
      [
        ["a", "api"],
        ["b", "api"],
      ],
      { window, eventBudget: 50_000 },
    );
    engine.runUntil(3000);
    expect(engine.snapshot().nodes.api?.arrivals).toBeCloseTo(400, -2);
    expect(engine.sampling.weight).toBe(1);

    engine.setTrafficMultiplier(50); // 20,000 req/s: over this budget
    engine.runUntil(6000);
    expect(Math.abs((engine.snapshot().nodes.api?.arrivals ?? 0) - 20_000) / 20_000).toBeLessThan(
      0.05,
    );
    expect(engine.sampling.weight).toBeGreaterThan(1);
    expect(() => engine.setTrafficMultiplier(0)).toThrow(RangeError);
  });

  it("rejects invalid settings and leaves the old ones in place", () => {
    const engine = runningSystem(
      { users: { type: "client" }, api: { type: "service", params: { concurrency: 8 } } },
      [["users", "api"]],
    );
    expect(() => engine.updateParams("api", { concurrency: 0 })).toThrow(
      "Invalid settings for api",
    );
    expect(engine.model.nodes.get("api")?.params.concurrency).toBe(8);
    expect(() => engine.updateParams("ghost", {})).toThrow("Unknown component");
  });

  it("turning on a gateway's rate limit mid-run starts limiting", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 300, retries: 0 } },
        gw: { type: "api-gateway", params: { rateLimit: 50 } },
        api: { type: "service", params: { concurrency: 64, workTime: 1 } },
      },
      [
        ["users", "gw"],
        ["gw", "api"],
      ],
      { window },
    );
    engine.runUntil(3000);
    expect(engine.snapshot().system.errorRate).toBe(0);
    engine.updateParams("gw", { rateLimiting: true });
    engine.runUntil(6000);
    expect(engine.snapshot().nodes.api?.arrivals).toBeCloseTo(50, -1);
  });

  it("shrinking a cache lowers its hit ratio", () => {
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: { rate: 500, readShare: 100, keys: 1000, keyPopularity: "uniform" },
        },
        api: { type: "service", params: { concurrency: 128, workTime: 1 } },
        cache: { type: "cache", params: { size: 2000, ttl: 86_400 } },
        db: { type: "database", params: { connections: 128 } },
      },
      [
        ["users", "api"],
        ["api", "cache"],
        ["api", "db"],
      ],
      { window },
    );
    engine.runUntil(20_000);
    expect(engine.snapshot().nodes.cache?.hitRatio).toBeGreaterThan(0.95);
    engine.updateParams("cache", { size: 100 });
    engine.runUntil(30_000);
    expect(engine.snapshot().nodes.cache?.hitRatio ?? 1).toBeLessThan(0.15);
  });

  it("giving a worker more slots lets its queue drain", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 200, readShare: 0 } },
        api: { type: "service", params: { concurrency: 64, workTime: 1 } },
        jobs: { type: "queue" },
        work: { type: "worker", params: { concurrency: 2, workTime: 20 } },
      },
      [
        ["users", "api"],
        ["api", "jobs"],
        ["jobs", "work"],
      ],
      { window },
    );
    engine.runUntil(10_000);
    expect(engine.snapshot().nodes.jobs?.waiting).toBeGreaterThan(1000);
    engine.updateParams("work", { concurrency: 64 });
    engine.runUntil(20_000);
    expect(engine.snapshot().nodes.jobs?.waiting).toBeLessThan(10);
  });
});
