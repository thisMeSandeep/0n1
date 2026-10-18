import { describe, expect, it } from "vitest";
import { compile } from "../../engine/compile.ts";
import { createRng } from "../../engine/core/prng.ts";
import { Simulator } from "../../engine/core/simulator.ts";
import { NodeRecorder, SystemRecorder } from "../../engine/metrics/recorder.ts";
import type { Behaviour, Reply, Request } from "../../engine/runtime/types.ts";
import { systemDocument } from "../../engine/testing.ts";
import { registry } from "../index.ts";
import { worker as workerBehaviour } from "../worker/behaviour.ts";
import { queue as queueBehaviour } from "./behaviour.ts";

/**
 * A queue feeding one worker, wired by hand so the test can play producer:
 * it adds jobs at a set rate for a while, then stops.
 */
function pipeline(
  workerParams: Record<string, unknown>,
  queueParams: Record<string, unknown> = {},
) {
  const doc = systemDocument(
    {
      users: { type: "client" },
      api: { type: "service" },
      jobs: { type: "queue", params: { enqueueTime: 1, ...queueParams } },
      work: { type: "worker", params: workerParams },
    },
    [
      ["users", "api"],
      ["api", "jobs"],
      ["jobs", "work"],
    ],
  );
  const model = compile(doc, registry).model!;
  const sim = new Simulator();
  const system = new SystemRecorder();
  const recorders = { jobs: new NodeRecorder(), work: new NodeRecorder() };
  const behaviours: Record<string, Behaviour> = {};
  const context = (id: "jobs" | "work") => ({
    sim,
    rng: createRng(1).fork(id),
    node: model.nodes.get(id)!,
    recorder: recorders[id],
    system,
    nextRequestId: () => 0,
    peer: (other: string) => model.nodes.get(other),
    sampling: { weight: () => 1, countRequest: () => {} },
    isUp: () => true,
    traffic: () => 1,
    tracing: { begin: () => undefined },
    send: (to: string, request: Request, reply: Reply) => {
      sim.schedule(0, () =>
        behaviours[to]?.handle(request, (outcome) => {
          sim.schedule(0, () => reply(outcome));
        }),
      );
    },
  });
  behaviours.jobs = queueBehaviour(context("jobs"));
  behaviours.work = workerBehaviour(context("work"));

  let id = 0;
  const produce = (perSecond: number, untilMs: number) => {
    const gap = 1000 / perSecond;
    for (let t = sim.now; t < untilMs; t += gap) {
      sim.at(t, () =>
        behaviours.jobs?.handle(
          { id: ++id, weight: 1, kind: "write", key: id, createdAt: sim.now, attempt: 1, path: [] },
          () => {},
        ),
      );
    }
  };
  const depthAt = (ms: number) => {
    sim.runUntil(ms);
    return recorders.jobs.snapshot(ms);
  };
  return { produce, depthAt, recorders };
}

describe("queue and worker", () => {
  it("builds a backlog while workers are too slow, then drains it once they catch up", () => {
    // The worker manages 4 jobs at a time × 1 per 20 ms ≈ 200/s on average; 400/s arrive for 10 s.
    const { produce, depthAt } = pipeline({ concurrency: 4, workTime: 20 });
    produce(400, 10_000);

    const at5 = depthAt(5_000).waiting;
    const at10 = depthAt(10_000).waiting;
    expect(at5).toBeGreaterThan(500);
    expect(at10).toBeGreaterThan(at5 + 500); // still growing
    const peak = depthAt(10_000);
    expect(peak.oldestJobAge ?? 0).toBeGreaterThan(4000);

    // Arrivals stop: the worker keeps going and the backlog drains.
    const later = depthAt(40_000);
    expect(later.waiting).toBe(0);
    expect(later.oldestJobAge).toBeNull();
    expect(later.totals.completed).toBe(4000);
  });

  it("never hands a worker more jobs than it has slots", () => {
    const { produce, depthAt, recorders } = pipeline({ concurrency: 3, workTime: 50 });
    produce(500, 2000);
    depthAt(1000);
    expect(recorders.work.snapshot(1000).waiting).toBe(0);
    expect(recorders.work.snapshot(1000).inFlight).toBeLessThanOrEqual(3);
  });

  it("rejects jobs once it's full", () => {
    const { produce, depthAt } = pipeline({ concurrency: 1, workTime: 100 }, { capacity: 50 });
    produce(500, 2000);
    const m = depthAt(2000);
    expect(m.waiting).toBeLessThanOrEqual(50);
    expect(m.totals.dropped).toBeGreaterThan(800);
  });

  it("retries failed jobs up to five times when redelivery is on", () => {
    const run = (redeliver: boolean) => {
      const { produce, depthAt } = pipeline(
        { concurrency: 50, workTime: 1, errorRate: 50 },
        { redeliver },
      );
      produce(200, 20_000);
      const m = depthAt(60_000);
      return m.totals.failed / m.totals.completed;
    };
    expect(Math.abs(run(false) - 0.5)).toBeLessThan(0.03);
    // Failing five tries in a row: 0.5⁵ ≈ 3%.
    expect(Math.abs(run(true) - 0.5 ** 5)).toBeLessThan(0.01);
  });
});
