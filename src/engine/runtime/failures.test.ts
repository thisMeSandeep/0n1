import { describe, expect, it } from "vitest";
import { runningSystem } from "../testing.ts";

const window = { windowMs: 2000, slots: 4 };
const roomy = { concurrency: 64, maxWaiting: 10_000, workTime: 2 };

describe("taking components down", () => {
  const simple = () =>
    runningSystem(
      {
        users: { type: "client", params: { rate: 200, retries: 0, timeout: 5000 } },
        api: { type: "service", params: roomy },
      },
      [["users", "api"]],
      { window },
    );

  it("fails requests fast while a component is down, and recovers when it's back", () => {
    const engine = simple();
    engine.runUntil(5000);
    expect(engine.snapshot().system.errorRate).toBe(0);

    expect(engine.takeDown("api")).toBe(true);
    expect(engine.takeDown("api")).toBe(false);
    engine.runUntil(10_000);
    const down = engine.snapshot();
    expect(down.nodes.api?.down).toBe(true);
    expect(down.nodes.api?.downSince).toBe(5000);
    expect(down.system.errorRate).toBe(1);
    // A refused connection: one network round trip, not a timeout.
    expect(down.system.latency?.p99 ?? Number.POSITIVE_INFINITY).toBeLessThan(5);
    expect(down.nodes.api?.arrivals).toBe(0);

    expect(engine.bringBack("api")).toBe(true);
    expect(engine.bringBack("api")).toBe(false);
    engine.runUntil(15_000);
    const back = engine.snapshot();
    expect(back.nodes.api?.down).toBe(false);
    expect(back.nodes.api?.downSince).toBeNull();
    expect(back.system.errorRate).toBe(0);
  });

  it("fails what was in progress immediately, and never counts it again later", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 100, retries: 0, timeout: 60_000 } },
        slow: {
          type: "service",
          params: { concurrency: 1000, workTime: 3000, maxWaiting: 10_000 },
        },
      },
      [["users", "slow"]],
      { window: { windowMs: 60_000, slots: 1 } },
    );
    engine.runUntil(10_000);
    const before = engine.snapshot();
    const inFlight = before.nodes.slow?.inFlight ?? 0;
    expect(inFlight).toBeGreaterThan(200);
    const answeredBefore = before.nodes.users?.totals.completed ?? 0;

    engine.takeDown("slow");
    engine.runUntil(10_010); // a network round trip later
    const after = engine.snapshot();
    expect(after.nodes.slow?.inFlight).toBe(0);
    // Everything in progress came back as a failure, at once.
    expect(after.nodes.users?.totals.failed ?? 0).toBeGreaterThanOrEqual(inFlight);

    // Its old work would have finished by now; none of it may count.
    engine.runUntil(20_000);
    const later = engine.snapshot();
    const answered = (later.nodes.users?.totals.completed ?? 0) - answeredBefore;
    const sent =
      (later.nodes.users?.totals.arrived ?? 0) - (before.nodes.users?.totals.arrived ?? 0);
    expect(answered).toBeLessThanOrEqual(sent + inFlight);
    expect(later.nodes.slow?.totals.completed).toBe(before.nodes.slow?.totals.completed);
  });

  it("a load balancer with health checks routes around a down target", () => {
    const run = (healthChecks: boolean) => {
      const engine = runningSystem(
        {
          users: { type: "client", params: { rate: 300, retries: 0 } },
          lb: { type: "load-balancer", params: { healthChecks } },
          a: { type: "service", params: roomy },
          b: { type: "service", params: roomy },
        },
        [
          ["users", "lb"],
          ["lb", "a"],
          ["lb", "b"],
        ],
        { window },
      );
      engine.runUntil(3000);
      engine.takeDown("a");
      engine.runUntil(8000);
      return engine.snapshot();
    };
    const checked = run(true);
    expect(checked.system.errorRate).toBe(0);
    expect(checked.nodes.b?.arrivals).toBeGreaterThan(280);

    const unchecked = run(false);
    expect(Math.abs(unchecked.system.errorRate - 0.5)).toBeLessThan(0.05);
  });

  it("with every target down, the load balancer fails requests straight away", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 100, retries: 0 } },
        lb: { type: "load-balancer" },
        a: { type: "service", params: roomy },
      },
      [
        ["users", "lb"],
        ["lb", "a"],
      ],
      { window },
    );
    engine.takeDown("a");
    engine.runUntil(5000);
    const m = engine.snapshot();
    expect(m.system.errorRate).toBe(1);
    expect(m.nodes.a?.totals.arrived).toBe(0);
  });

  it("a down client stops sending; brought back, it sends again", () => {
    const engine = simple();
    engine.runUntil(3000);
    engine.takeDown("users");
    engine.runUntil(3100); // let the last replies land
    const events = engine.sim.eventsProcessed;
    engine.runUntil(8000);
    expect(engine.snapshot().nodes.api?.arrivals).toBe(0);
    expect(engine.snapshot().system.throughput).toBe(0);
    // It isn't quietly busy either: a down component costs (almost) no events.
    expect(engine.sim.eventsProcessed - events).toBeLessThan(20);
    engine.bringBack("users");
    engine.runUntil(12_000);
    expect(engine.snapshot().nodes.api?.arrivals).toBeGreaterThan(150);
  });

  it("a restarted cache comes back cold", () => {
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: { rate: 500, readShare: 100, keys: 1000, keyPopularity: "uniform" },
        },
        api: { type: "service", params: roomy },
        cache: { type: "cache", params: { size: 2000, ttl: 86_400 } },
        db: { type: "database", params: { connections: 128, maxWaiting: 10_000 } },
      },
      [
        ["users", "api"],
        ["api", "cache"],
        ["api", "db"],
      ],
      { window: { windowMs: 500, slots: 5 } },
    );
    engine.runUntil(20_000);
    expect(engine.snapshot().nodes.cache?.hitRatio).toBeGreaterThan(0.95);
    engine.takeDown("cache");
    engine.runUntil(21_000);
    // While it's down, every read falls through to the database.
    expect(engine.snapshot().nodes.db?.arrivals).toBeGreaterThan(450);
    engine.bringBack("cache");
    engine.runUntil(21_500);
    expect(engine.snapshot().nodes.cache?.hitRatio ?? 1).toBeLessThan(0.5);
  });

  it("a queue holds jobs while its worker is down, and drains when it's back", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 100, readShare: 0 } },
        api: { type: "service", params: roomy },
        jobs: { type: "queue", params: { redeliver: true } },
        work: { type: "worker", params: { concurrency: 20, workTime: 10 } },
      },
      [
        ["users", "api"],
        ["api", "jobs"],
        ["jobs", "work"],
      ],
      { window },
    );
    engine.runUntil(3000);
    engine.takeDown("work");
    engine.runUntil(13_000);
    const held = engine.snapshot().nodes.jobs;
    expect(held?.waiting).toBeGreaterThan(900);
    expect(held?.oldestJobAge ?? 0).toBeGreaterThan(9000);

    engine.bringBack("work");
    engine.runUntil(30_000);
    expect(engine.snapshot().nodes.jobs?.waiting).toBeLessThan(5);
  });

  it("stays deterministic with failures", () => {
    const run = () => {
      const engine = simple();
      engine.runUntil(2000);
      engine.takeDown("api");
      engine.runUntil(3000);
      engine.bringBack("api");
      engine.runUntil(6000);
      return engine.snapshot();
    };
    expect(run()).toEqual(run());
  });
});

describe("where failures start", () => {
  it("counts a failure only at the component it started at", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 400, retries: 0, timeout: 5000 } },
        lb: { type: "load-balancer" },
        api: { type: "service", params: roomy },
        db: { type: "database", params: { ...roomy, errorRate: 20 } },
      },
      [
        ["users", "lb"],
        ["lb", "api"],
        ["api", "db"],
      ],
      { window },
    );
    engine.runUntil(8000);
    const { nodes } = engine.snapshot();
    const share = (id: string) => (nodes[id]?.failures ?? 0) / (nodes[id]?.arrivals ?? 1);
    expect(share("db")).toBeCloseTo(0.2, 1);
    expect(nodes.api?.errorRate).toBeGreaterThan(0.1); // passed back through…
    expect(share("api")).toBe(0); // …but not started there
    expect(share("lb")).toBe(0);
  });

  it("counts requests a full line turns away at that component", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 2000, retries: 0, timeout: 5000 } },
        lb: { type: "load-balancer" },
        api: { type: "service", params: { concurrency: 4, maxWaiting: 10, workTime: 5 } },
      },
      [
        ["users", "lb"],
        ["lb", "api"],
      ],
      { window },
    );
    engine.runUntil(5000);
    const { nodes } = engine.snapshot();
    expect(nodes.api?.failures).toBeGreaterThan(500);
    expect(nodes.lb?.failures).toBe(0);
  });
});

describe("connections", () => {
  it("records traffic, failures and round trips on each connection", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 400, retries: 0, timeout: 5000 } },
        api: { type: "service", params: roomy },
        db: { type: "database", params: { ...roomy, errorRate: 20 } },
      },
      [
        ["users", "api"],
        ["api", "db"],
      ],
      { window },
    );
    engine.runUntil(8000);
    const { edges, nodes } = engine.snapshot();
    const toApi = edges["users→api"];
    const toDb = edges["api→db"];
    expect(toApi?.rate).toBeCloseTo(nodes.api?.arrivals ?? 0, -1);
    expect(toDb?.errorRate).toBeCloseTo(0.2, 1);
    expect(toApi?.errorRate).toBeCloseTo(0.2, 1); // the failures come back this way too
    // The round trip from the client includes the database call and two network hops each way.
    expect(toApi?.latency?.p50 ?? 0).toBeGreaterThan(
      toDb?.latency?.p50 ?? Number.POSITIVE_INFINITY,
    );
    expect(Object.keys(edges).sort()).toEqual(["api→db", "users→api"]);
  });

  it("counts requests to a component that's down as failures on the way to it", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 200, retries: 0, timeout: 5000 } },
        api: { type: "service", params: roomy },
      },
      [["users", "api"]],
      { window },
    );
    engine.takeDown("api");
    engine.runUntil(4000);
    expect(engine.snapshot().edges["users→api"]?.errorRate).toBe(1);
  });
});
