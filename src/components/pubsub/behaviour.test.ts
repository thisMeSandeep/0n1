import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../../engine/testing.ts";

/**
 * users → api → events, with two subscribers. Every request is a write, so
 * every request publishes one message.
 */
function fanOut(
  fast: Record<string, unknown>,
  slow: Record<string, unknown>,
  events: Record<string, unknown> = {},
  ms = 10_000,
) {
  return runningSystem(
    {
      users: { type: "client", params: { rate: 50, readShare: 0, timeout: 10_000 } },
      api: { type: "service", params: { concurrency: 64, workTime: 1 } },
      events: { type: "pubsub", params: events },
      fast: { type: "worker", params: { concurrency: 8, workTime: 10, ...fast } },
      slow: { type: "worker", params: { concurrency: 1, workTime: 10, ...slow } },
    },
    [
      ["users", "api"],
      ["api", "events"],
      ["events", "fast"],
      ["events", "slow"],
    ],
    { window: wholeRun(ms) },
  );
}

const backlogOf = (engine: ReturnType<typeof fanOut>, subscriber: string) =>
  engine.snapshot().nodes.events?.subscriptions?.find((s) => s.node === subscriber);

describe("pub/sub", () => {
  it("delivers every message to every subscriber", () => {
    const engine = fanOut({}, {});
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    const published = nodes.events?.totals.arrived ?? 0;
    expect(published).toBeGreaterThan(400);
    expect(system.errorRate).toBe(0);
    // Each subscriber got its own copy of (nearly) all of them; the last few are on their way.
    for (const subscriber of ["fast", "slow"]) {
      expect(nodes[subscriber]?.totals.completed).toBeGreaterThan(published - 5);
      expect(nodes[subscriber]?.totals.completed).toBeLessThanOrEqual(published);
    }
    // Deliveries count once per subscriber.
    expect(nodes.events?.totals.completed).toBeGreaterThan(2 * published - 10);
  });

  it("lets a slow subscriber fall behind without slowing the others", () => {
    // The slow worker can do 5 a second; 50 a second are published.
    const engine = fanOut({}, { workTime: 200 });
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    const published = nodes.events?.totals.arrived ?? 0;

    expect(backlogOf(engine, "slow")?.waiting).toBeGreaterThan(300);
    expect(backlogOf(engine, "slow")?.oldestAge).toBeGreaterThan(5000);
    // The fast subscriber keeps up, and publishers don't wait on either.
    expect(backlogOf(engine, "fast")?.waiting).toBeLessThan(5);
    expect(nodes.fast?.totals.completed).toBeGreaterThan(published - 5);
    expect(system.latency?.p99).toBeLessThan(30);
    // The node shows the whole backlog, and how full the fullest one is.
    expect(nodes.events?.waiting).toBe(backlogOf(engine, "slow")?.waiting);
    expect(nodes.events?.oldestJobAge).toBe(backlogOf(engine, "slow")?.oldestAge);
  });

  it("never hands a worker more than it has slots for", () => {
    const engine = fanOut({}, { workTime: 200 });
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    expect(nodes.slow?.inFlight).toBeLessThanOrEqual(1);
    expect(nodes.slow?.waiting).toBe(0); // the backlog stays in the subscription
  });

  it("loses messages for a subscriber whose backlog is full, and only for it", () => {
    const engine = fanOut({}, { workTime: 200 }, { capacity: 20 });
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    const published = nodes.events?.totals.arrived ?? 0;
    expect(backlogOf(engine, "slow")?.waiting).toBeLessThanOrEqual(20);
    // The slow worker only ever saw what fit: about 5 a second.
    expect(nodes.slow?.totals.arrived).toBeLessThan(60);
    expect(nodes.events?.totals.dropped).toBeGreaterThan(published - 80);
    expect(nodes.fast?.totals.completed).toBeGreaterThan(published - 5);
    expect(system.errorRate).toBe(0); // publishing still worked
  });

  it("sends a failed message again, up to 5 tries in all, unless told not to", () => {
    const tries = (redeliver: boolean) => {
      const engine = fanOut({}, { concurrency: 8, errorRate: 100 }, { redeliver });
      engine.runUntil(10_000);
      const { nodes } = engine.snapshot();
      return {
        perMessage: (nodes.slow?.totals.arrived ?? 0) / (nodes.events?.totals.arrived ?? 1),
        fast: nodes.fast?.totals.failed,
      };
    };
    // The last few messages are still on their way.
    expect(tries(true).perMessage).toBeCloseTo(5, 0);
    expect(tries(false).perMessage).toBeCloseTo(1, 1);
    expect(tries(true).fast).toBe(0); // the other subscriber doesn't notice
  });

  it("keeps a subscriber's messages while it's down, and delivers them when it's back", () => {
    const engine = fanOut({}, {}, {}, 12_000);
    engine.runUntil(2000);
    engine.takeDown("slow");
    engine.runUntil(6000);
    expect(backlogOf(engine, "slow")?.waiting).toBeGreaterThan(150);
    expect(backlogOf(engine, "fast")?.waiting).toBeLessThan(5);
    engine.bringBack("slow");
    engine.runUntil(12_000);
    expect(backlogOf(engine, "slow")?.waiting).toBeLessThan(5);
    const { nodes } = engine.snapshot();
    expect(nodes.slow?.totals.completed).toBeGreaterThan((nodes.events?.totals.arrived ?? 0) - 10);
  });

  it("hands messages to a subscribing queue at once, so the backlog is the queue's", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 50, readShare: 0, timeout: 10_000 } },
        api: { type: "service", params: { workTime: 1 } },
        events: { type: "pubsub" },
        jobs: { type: "queue" },
        work: { type: "worker", params: { concurrency: 1, workTime: 200 } },
      },
      [
        ["users", "api"],
        ["api", "events"],
        ["events", "jobs"],
        ["jobs", "work"],
      ],
    );
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    expect(nodes.events?.waiting).toBe(0);
    expect(nodes.jobs?.waiting).toBeGreaterThan(300);
  });

  it("only publishes writes", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 100, readShare: 80 } },
        api: { type: "service", params: { workTime: 1 } },
        events: { type: "pubsub" },
        work: { type: "worker" },
      },
      [
        ["users", "api"],
        ["api", "events"],
        ["events", "work"],
      ],
      { window: wholeRun(10_000) },
    );
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    const share = (nodes.events?.totals.arrived ?? 0) / (nodes.users?.totals.arrived ?? 1);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.25);
  });
});
