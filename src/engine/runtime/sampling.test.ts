import { describe, expect, it } from "vitest";
import { Simulator } from "../core/simulator.ts";
import { NodeRecorder } from "../metrics/recorder.ts";
import { runningSystem, wholeRun } from "../testing.ts";
import { DEFAULT_EVENT_BUDGET } from "./engine.ts";
import { SamplingController } from "./sampling.ts";
import { QueueingServer, slotsFor } from "./server.ts";

describe("SamplingController", () => {
  it("doesn't sample when the budget is enough", () => {
    expect(new SamplingController(50_000, 1000, 10).weight).toBe(1);
    expect(new SamplingController(Number.POSITIVE_INFINITY, 1e6, 10).weight).toBe(1);
  });

  it("picks the smallest whole weight that fits the budget", () => {
    // 50,000 req/s × 10 events = 500,000 events/s against 50,000: weight 10.
    expect(new SamplingController(50_000, 50_000, 10).weight).toBe(10);
    expect(new SamplingController(50_000, 8_000, 10).weight).toBe(2);
  });

  it("learns what a request costs and follows rate changes", () => {
    const controller = new SamplingController(50_000, 20_000, 10);
    expect(controller.weight).toBe(4);
    for (let i = 0; i < 100; i++) controller.countRequest();
    controller.observe(100 * 30); // requests here cost 30 events each
    expect(controller.eventsPerRequest).toBeCloseTo(16, 0);
    expect(controller.weight).toBe(7);
    controller.setOfferedRate(1000);
    expect(controller.weight).toBe(1);
  });

  it("steps down only when the need has clearly dropped", () => {
    const controller = new SamplingController(10_000, 10_000, 10); // weight 10
    controller.setOfferedRate(8_000); // needs 8: within 25%, stays at 10
    expect(controller.weight).toBe(10);
    controller.setOfferedRate(5_000); // needs 5: steps down
    expect(controller.weight).toBe(5);
  });
});

describe("weighted requests at a server", () => {
  it("take one slot per real request, or what's free for proportionally longer", () => {
    expect(slotsFor(1, 16)).toEqual({ slots: 1, stretch: 1 });
    expect(slotsFor(8, 16)).toEqual({ slots: 8, stretch: 1 });
    expect(slotsFor(16, 4)).toEqual({ slots: 4, stretch: 4 });
    expect(slotsFor(12, 8)).toEqual({ slots: 8, stretch: 1.5 });
  });

  it("never leave slots idle while work waits (no lost capacity)", () => {
    const sim = new Simulator();
    const recorder = new NodeRecorder({ windowMs: 40_000, slots: 1 });
    const server = new QueueingServer(sim, recorder, {
      concurrency: 32,
      maxWaiting: 1_000_000,
      work: (_request, done, stretch) => sim.schedule(15 * stretch, () => done({ ok: true })),
    });
    // Weight 12 at 32 slots, at 90% of real capacity (32 / 15 ms ≈ 2133/s → 1920/s).
    for (let t = 0; t < 20_000; t += 12 / 1.92) {
      sim.at(t, () =>
        server.handle(
          { id: t, weight: 12, kind: "read", key: 0, createdAt: t, attempt: 1, path: [] },
          () => {},
        ),
      );
    }
    sim.runUntil(20_000);
    // Stable: the line doesn't grow without bound, and utilization matches the real load.
    expect(server.waiting).toBeLessThan(200);
    expect(recorder.snapshot(20_000).utilization).toBeCloseTo(0.9, 1);
  });

  it("use the same slot time as the real requests they stand for", () => {
    const sim = new Simulator();
    const recorder = new NodeRecorder({ windowMs: 20_000, slots: 1 });
    const server = new QueueingServer(sim, recorder, {
      concurrency: 8,
      maxWaiting: 1000,
      work: (_request, done, stretch) => sim.schedule(10 * stretch, () => done({ ok: true })),
    });
    // One request of weight 4 every 10 ms for 10 s = 400 real requests a second × 10 ms = 4 slots of 8.
    for (let t = 0; t < 10_000; t += 10) {
      sim.at(t, () =>
        server.handle(
          { id: t, weight: 4, kind: "read", key: 0, createdAt: t, attempt: 1, path: [] },
          () => {},
        ),
      );
    }
    sim.runUntil(10_000);
    const m = recorder.snapshot(10_000);
    expect(m.utilization).toBeCloseTo(0.5, 2);
    expect(m.throughput).toBeCloseTo(400, -1);
  });
});

describe("sampling in the engine", () => {
  const RUN = 12_000;
  /** 50,000 requests a second through a load balancer to 40 services and a cache-backed database. */
  const bigSystem = (eventBudget: number) => {
    const services = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [
        `api${i}`,
        { type: "service", params: { concurrency: 32, workTime: 15, maxWaiting: 5000 } },
      ]),
    );
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: {
            rate: 50_000,
            readShare: 90,
            keys: 100_000,
            keyPopularity: "hot",
            timeout: 2000,
            retries: 0,
          },
        },
        lb: { type: "load-balancer", params: { throughputLimit: 1_000_000 } },
        ...services,
        cache: { type: "cache", params: { size: 5000, concurrency: 1024, ttl: 30 } },
        db: {
          type: "database",
          params: { connections: 512, readTime: 4, writeTime: 8, maxWaiting: 50_000 },
        },
      },
      [
        ["users", "lb"],
        ...Object.keys(services).flatMap((id) => [
          ["lb", id] as [string, string],
          [id, "cache"] as [string, string],
          [id, "db"] as [string, string],
        ]),
      ],
      { eventBudget, window: { windowMs: 8000, slots: 8 }, seed: 7 },
    );
    engine.runUntil(RUN);
    const snapshot = engine.snapshot();
    const services40 = Object.keys(services).map((id) => snapshot.nodes[id]);
    return {
      snapshot,
      eventsPerSecond: engine.sim.eventsProcessed / (RUN / 1000),
      apiUtilization:
        services40.reduce((sum, n) => sum + (n?.utilization ?? 0), 0) / services40.length,
    };
  };

  it("keeps 50,000 req/s within the default event budget and matches an unsampled run", () => {
    const sampled = bigSystem(DEFAULT_EVENT_BUDGET);
    const reference = bigSystem(Number.POSITIVE_INFINITY);

    expect(sampled.snapshot.sampling.weight).toBeGreaterThan(1);
    expect(reference.snapshot.sampling.weight).toBe(1);
    // The sampled run stays within its budget; the reference uses about twice as much.
    expect(sampled.eventsPerSecond).toBeLessThan(DEFAULT_EVENT_BUDGET * 1.1);
    expect(reference.eventsPerSecond).toBeGreaterThan(sampled.eventsPerSecond * 1.5);

    const s = sampled.snapshot;
    const r = reference.snapshot;
    const close = (a: number, b: number, relative: number) =>
      expect(Math.abs(a - b) / Math.max(Math.abs(b), 1e-9)).toBeLessThan(relative);
    close(s.system.throughput, r.system.throughput, 0.03);
    close(s.system.goodput, r.system.goodput, 0.03);
    close(sampled.apiUtilization, reference.apiUtilization, 0.03);
    close(s.nodes.cache?.hitRatio ?? 0, r.nodes.cache?.hitRatio ?? 0, 0.05);
    close(s.nodes.db?.throughput ?? 0, r.nodes.db?.throughput ?? 0, 0.05);
    close(s.system.latency?.mean ?? 0, r.system.latency?.mean ?? 0, 0.05);
    close(s.system.latency?.p50 ?? 0, r.system.latency?.p50 ?? 0, 0.05);
    close(s.system.latency?.p99 ?? 0, r.system.latency?.p99 ?? 0, 0.1);
  }, 60_000);

  it("stays within a tight budget too, sampling harder", () => {
    const tight = bigSystem(50_000);
    expect(tight.snapshot.sampling.weight).toBeGreaterThanOrEqual(10);
    expect(tight.eventsPerSecond).toBeLessThan(50_000 * 1.1);
    // Throughput is still right even when latency is only approximate.
    expect(Math.abs(tight.snapshot.system.throughput - 50_000) / 50_000).toBeLessThan(0.03);
  }, 60_000);

  it("doesn't sample ordinary traffic", () => {
    const engine = runningSystem(
      { users: { type: "client", params: { rate: 500 } }, api: { type: "service" } },
      [["users", "api"]],
      { window: wholeRun(5000) },
    );
    engine.runUntil(5000);
    expect(engine.snapshot().sampling.weight).toBe(1);
  });
});
