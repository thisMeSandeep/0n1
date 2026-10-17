import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../testing.ts";

const RUN = 30_000;

describe("async pipelines through the engine", () => {
  const pipeline = (worker: Record<string, unknown>, client: Record<string, unknown> = {}) => {
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: { rate: 200, readShare: 0, timeout: 60_000, retries: 0, ...client },
        },
        api: { type: "service", params: { workTime: 2, concurrency: 64, maxWaiting: 10_000 } },
        jobs: { type: "queue", params: { enqueueTime: 2 } },
        work: { type: "worker", params: worker },
        db: { type: "database", params: { connections: 64, maxWaiting: 10_000 } },
      },
      [
        ["users", "api"],
        ["api", "jobs"],
        ["jobs", "work"],
        ["work", "db"],
        ["api", "db"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    return engine.snapshot();
  };

  it("answers writes as soon as they're queued; the worker writes the database later", () => {
    const { nodes, system } = pipeline({ concurrency: 32, workTime: 100 });
    // Each request: 2 ms work + 2 ms to enqueue + network, nowhere near the 100 ms job.
    expect(system.latency?.p99 ?? Number.POSITIVE_INFINITY).toBeLessThan(40);
    expect(system.errorRate).toBe(0);
    const writes = nodes.users?.totals.arrived ?? 0;
    expect(Math.abs((nodes.work?.totals.arrived ?? 0) - writes)).toBeLessThan(writes * 0.02 + 50);
    // The service hands writes to the queue, not the database; only the worker writes it.
    expect(
      Math.abs((nodes.db?.totals.arrived ?? 0) - (nodes.work?.totals.completed ?? 0)),
    ).toBeLessThan(40);
  });

  it("reads still go straight to the database", () => {
    const { nodes } = pipeline({ concurrency: 32, workTime: 10 }, { readShare: 100 });
    expect(nodes.jobs?.totals.arrived).toBe(0);
    expect(nodes.db?.totals.arrived).toBeGreaterThan(5000);
  });

  it("with too few workers the queue backs up, but the system still answers fast", () => {
    const { nodes, system } = pipeline({ concurrency: 2, workTime: 50 });
    // 200 jobs/s arrive, 2 slots × 20/s = 40/s get done: the rest wait in the queue.
    expect(nodes.jobs?.waiting).toBeGreaterThan(3000);
    expect(nodes.jobs?.oldestJobAge ?? 0).toBeGreaterThan(10_000);
    expect(system.latency?.p50 ?? Number.POSITIVE_INFINITY).toBeLessThan(20);
  });

  it("spreads jobs over several workers by their free slots", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 300, readShare: 0, timeout: 60_000 } },
        api: { type: "service", params: { workTime: 1, concurrency: 64 } },
        jobs: { type: "queue" },
        big: { type: "worker", params: { concurrency: 30, workTime: 20 } },
        small: { type: "worker", params: { concurrency: 10, workTime: 20 } },
      },
      [
        ["users", "api"],
        ["api", "jobs"],
        ["jobs", "big"],
        ["jobs", "small"],
      ],
      { window: wholeRun(RUN) },
    );
    engine.runUntil(RUN);
    const { nodes } = engine.snapshot();
    expect(nodes.jobs?.waiting).toBeLessThan(50);
    expect(nodes.big?.totals.arrived).toBeGreaterThan(nodes.small?.totals.arrived ?? 0);
  });
});
