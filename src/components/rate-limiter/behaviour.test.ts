import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../../engine/testing.ts";

const roomy = { concurrency: 1024, workTime: 1, maxWaiting: 100_000 };

function limited(limiter: Record<string, unknown>, client: Record<string, unknown> = {}) {
  return runningSystem(
    {
      users: { type: "client", params: { rate: 1000, retries: 0, timeout: 5000, ...client } },
      limiter: { type: "rate-limiter", params: limiter },
      api: { type: "service", params: roomy },
    },
    [
      ["users", "limiter"],
      ["limiter", "api"],
    ],
    { window: wholeRun(20_000), eventBudget: Number.POSITIVE_INFINITY },
  );
}

describe("rate limiter", () => {
  it("lets through its limit, and turns the rest away at once", () => {
    const engine = limited({ limit: 300, burst: 30 });
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    expect(nodes.api?.arrivals).toBeGreaterThan(300 * 0.95);
    expect(nodes.api?.arrivals).toBeLessThan(300 * 1.05);
    expect(system.errorRate).toBeCloseTo(0.7, 1);
    // Turned away straight away: no waiting, nothing reached the service.
    expect(nodes.limiter?.drops).toBeCloseTo(700, -2);
    expect(nodes.limiter?.failures).toBeCloseTo(700, -2);
  });

  it("passes everything under its limit", () => {
    const engine = limited({ limit: 2000 });
    engine.runUntil(10_000);
    expect(engine.snapshot().system.errorRate).toBe(0);
  });

  it("per key, holds back only the busiest keys", () => {
    // A few keys get most of the traffic: they're the ones held back.
    const hot = limited(
      { limit: 5, burst: 5, scope: "key" },
      { keyPopularity: "hot", keys: 10_000 },
    );
    hot.runUntil(10_000);
    const hotErrors = hot.snapshot().system.errorRate;
    // Every key equally likely: no key comes near 5 a second.
    const even = limited(
      { limit: 5, burst: 5, scope: "key" },
      { keyPopularity: "uniform", keys: 10_000 },
    );
    even.runUntil(10_000);
    expect(hotErrors).toBeGreaterThan(0.1);
    expect(even.snapshot().system.errorRate).toBe(0);
  });

  it("follows a new limit while running", () => {
    const engine = limited({ limit: 200, burst: 20 });
    engine.runUntil(5000);
    engine.updateParams("limiter", { limit: 600 });
    const before = engine.snapshot().nodes.api?.totals.arrived ?? 0;
    engine.runUntil(10_000);
    const passed = (engine.snapshot().nodes.api?.totals.arrived ?? 0) - before;
    expect(passed / 5).toBeGreaterThan(600 * 0.9);
    expect(passed / 5).toBeLessThan(600 * 1.1);
  });
});
