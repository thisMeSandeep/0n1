import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../testing.ts";

const RUN = 60_000;
const quick = { workTime: 1, concurrency: 64, maxWaiting: 10_000 };
const arrived = (engine: ReturnType<typeof runningSystem>, id: string) =>
  engine.snapshot().nodes[id]?.totals.arrived ?? 0;

describe("load balancer", () => {
  it("round robin splits traffic evenly", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 300 } },
        lb: { type: "load-balancer", params: { strategy: "round-robin" } },
        a: { type: "service", params: quick },
        b: { type: "service", params: quick },
        c: { type: "service", params: quick },
      },
      [
        ["users", "lb"],
        ["lb", "a"],
        ["lb", "b"],
        ["lb", "c"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    const counts = ["a", "b", "c"].map((id) => arrived(engine, id));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((x, y) => x + y)).toBeGreaterThan(17_000);
  });

  it("least busy sends more to the faster target", () => {
    const share = (strategy: string) => {
      const engine = runningSystem(
        {
          users: { type: "client", params: { rate: 400, timeout: 60_000 } },
          lb: { type: "load-balancer", params: { strategy } },
          fast: { type: "service", params: { ...quick, workTime: 2 } },
          slow: { type: "service", params: { ...quick, workTime: 40 } },
        },
        [
          ["users", "lb"],
          ["lb", "fast"],
          ["lb", "slow"],
        ],
        { window: wholeRun(RUN) },
      );
      engine.runUntil(RUN);
      const fast = arrived(engine, "fast");
      return fast / (fast + arrived(engine, "slow"));
    };
    expect(Math.abs(share("round-robin") - 0.5)).toBeLessThan(0.01);
    expect(share("least-busy")).toBeGreaterThan(0.75);
  });

  it("adds its delay to every request", () => {
    const latency = (delay: number) => {
      const engine = runningSystem(
        {
          users: { type: "client", params: { rate: 50 } },
          lb: { type: "load-balancer", params: { delay } },
          api: { type: "service", params: { ...quick, workTime: 5 } },
        },
        [
          ["users", "lb"],
          ["lb", "api"],
        ],
        { window: wholeRun(RUN), seed: 3 },
      );
      engine.runUntil(RUN);
      return engine.snapshot().system.latency?.mean ?? 0;
    };
    // Same seed, so the same requests; only the few still in flight at the end differ.
    expect(latency(20) - latency(1)).toBeCloseTo(19, 1);
  });

  it("turns away traffic above its throughput limit, and reports utilization against it", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 600, retries: 0 } },
        lb: { type: "load-balancer", params: { throughputLimit: 200 } },
        api: { type: "service", params: quick },
      },
      [
        ["users", "lb"],
        ["lb", "api"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    const { nodes, system } = engine.snapshot();
    expect(Math.abs((nodes.api?.arrivals ?? 0) - 200) / 200).toBeLessThan(0.03);
    expect(Math.abs((nodes.lb?.drops ?? 0) - 400) / 400).toBeLessThan(0.03);
    expect(nodes.lb?.utilization).toBe(1);
    expect(Math.abs(system.goodput - 200) / 200).toBeLessThan(0.03);
  });
});

describe("API gateway", () => {
  const gatewaySystem = (gateway: Record<string, unknown>) => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 300, retries: 0 } },
        gw: { type: "api-gateway", params: gateway },
        api: { type: "service", params: quick },
      },
      [
        ["users", "gw"],
        ["gw", "api"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    return engine.snapshot();
  };

  it("passes everything through when rate limiting is off", () => {
    const { nodes, system } = gatewaySystem({ rateLimiting: false, rateLimit: 50 });
    expect(nodes.gw?.totals.dropped).toBe(0);
    expect(system.errorRate).toBe(0);
  });

  it("rejects requests above the rate limit, quickly, so they never reach the service", () => {
    const { nodes, system } = gatewaySystem({ rateLimiting: true, rateLimit: 50 });
    expect(Math.abs((nodes.api?.arrivals ?? 0) - 50) / 50).toBeLessThan(0.05);
    expect(Math.abs(system.errorRate - 250 / 300)).toBeLessThan(0.02);
    // Rejections take no work: half the responses come back almost at once.
    expect(system.latency?.p50).toBeLessThan(5);
  });
});

describe("service calling services", () => {
  it("calls each connected service in turn and waits for them", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 50 } },
        api: { type: "service", params: { ...quick, workTime: 10 } },
        auth: { type: "service", params: { ...quick, workTime: 20 } },
        profile: { type: "service", params: { ...quick, workTime: 30 } },
      },
      [
        ["users", "api"],
        ["api", "auth"],
        ["api", "profile"],
      ],
      { window: wholeRun(RUN), networkLatencyMs: 0 },
    );
    engine.runUntil(RUN);
    const { nodes } = engine.snapshot();
    // Equal, except for a request or two still in progress when the run stops.
    expect(arrived(engine, "api") - arrived(engine, "auth")).toBeLessThanOrEqual(2);
    expect(arrived(engine, "api") - arrived(engine, "profile")).toBeLessThanOrEqual(2);
    // The API's own latency covers its work plus both calls, one after the other.
    expect(Math.abs((nodes.api?.latency?.mean ?? 0) - 60) / 60).toBeLessThan(0.05);
  });

  it("fails when a call fails, and doesn't make the calls after it", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 50, retries: 0 } },
        api: { type: "service", params: quick },
        auth: { type: "service", params: { ...quick, errorRate: 100 } },
        profile: { type: "service", params: quick },
      },
      [
        ["users", "api"],
        ["api", "auth"],
        ["api", "profile"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    expect(engine.snapshot().system.errorRate).toBe(1);
    expect(arrived(engine, "profile")).toBe(0);
  });

  it("can reach other services through a load balancer", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 100 } },
        api: { type: "service", params: quick },
        lb: { type: "load-balancer" },
        b1: { type: "service", params: quick },
        b2: { type: "service", params: quick },
      },
      [
        ["users", "api"],
        ["api", "lb"],
        ["lb", "b1"],
        ["lb", "b2"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    expect(engine.snapshot().system.errorRate).toBe(0);
    const behind = arrived(engine, "b1") + arrived(engine, "b2");
    expect(arrived(engine, "api") - behind).toBeLessThanOrEqual(2);
  });

  it("holds its slot while waiting on what it calls, so a slow dependency fills it up", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 200, retries: 0, timeout: 60_000 } },
        api: { type: "service", params: { concurrency: 4, workTime: 1, maxWaiting: 10_000 } },
        slowDb: {
          type: "service",
          params: { concurrency: 1000, workTime: 50, maxWaiting: 10_000 },
        },
      },
      [
        ["users", "api"],
        ["api", "slowDb"],
      ],
      { window: wholeRun(10_000) },
    );
    engine.runUntil(10_000);
    // 200/s × ~51 ms per request ≈ 10 slots needed, only 4: the API is saturated.
    expect(engine.snapshot().nodes.api?.utilization).toBeGreaterThan(0.99);
  });
});
