import { describe, expect, it } from "vitest";
import { exponential } from "../core/distributions.ts";
import { createRng } from "../core/prng.ts";
import { Simulator } from "../core/simulator.ts";
import { NodeRecorder } from "../metrics/recorder.ts";
import { QueueingServer } from "./server.ts";
import type { Request } from "./types.ts";

/**
 * Poisson arrivals (λ per ms) into a server with exponential service
 * (mean 1/μ ms) and `c` slots: an M/M/c queue. Returns the metrics over
 * the whole run, plus how many requests were rejected.
 */
function runQueue({
  lambda,
  mu,
  c,
  maxWaiting = Number.POSITIVE_INFINITY,
  durationMs,
  seed = 1,
}: {
  lambda: number;
  mu: number;
  c: number;
  maxWaiting?: number;
  durationMs: number;
  seed?: number;
}) {
  const sim = new Simulator();
  const rng = createRng(seed);
  const arrivals = rng.fork("arrivals");
  const service = rng.fork("service");
  const recorder = new NodeRecorder({ windowMs: durationMs * 2, slots: 1 });
  const server = new QueueingServer(sim, recorder, {
    concurrency: c,
    maxWaiting,
    work: (_request, done) => sim.schedule(exponential(service, 1 / mu), () => done({ ok: true })),
  });
  let id = 0;
  let rejected = 0;
  const arrive = () => {
    const request: Request = {
      id: ++id,
      weight: 1,
      kind: "read",
      key: 0,
      createdAt: sim.now,
      attempt: 1,
      path: [],
    };
    server.handle(request, (outcome) => {
      if (!outcome.ok) rejected++;
    });
    sim.schedule(exponential(arrivals, 1 / lambda), arrive);
  };
  sim.schedule(exponential(arrivals, 1 / lambda), arrive);
  sim.runUntil(durationMs);
  return { metrics: recorder.snapshot(durationMs), arrived: id, rejected };
}

/** Mean time in an M/M/c system, from the Erlang C formula. */
function erlangCMeanTime(lambda: number, mu: number, c: number): number {
  const a = lambda / mu;
  const rho = a / c;
  let sum = 0;
  let term = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) term *= a / k;
    sum += term;
  }
  const last = (term * a) / c / (1 - rho);
  const probabilityOfWaiting = last / (sum + last);
  return probabilityOfWaiting / (c * mu - lambda) + 1 / mu;
}

const within = (actual: number, expected: number, relative: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(relative);

describe("QueueingServer matches queueing theory", () => {
  it("M/M/1 at 50% load: utilization 0.5, mean time in system 1/(μ−λ) = 20 ms", () => {
    const { metrics } = runQueue({ lambda: 0.05, mu: 0.1, c: 1, durationMs: 400_000 });
    within(metrics.utilization, 0.5, 0.03);
    within(metrics.latency?.mean ?? 0, 20, 0.05);
  });

  it("M/M/1 at 80% load: mean time in system 50 ms", () => {
    const { metrics } = runQueue({ lambda: 0.08, mu: 0.1, c: 1, durationMs: 1_000_000, seed: 2 });
    within(metrics.utilization, 0.8, 0.03);
    within(metrics.latency?.mean ?? 0, 50, 0.08);
  });

  it("M/M/4 at 75% load matches Erlang C", () => {
    const { metrics } = runQueue({ lambda: 0.3, mu: 0.1, c: 4, durationMs: 300_000, seed: 3 });
    within(metrics.utilization, 0.75, 0.03);
    within(metrics.latency?.mean ?? 0, erlangCMeanTime(0.3, 0.1, 4), 0.05);
  });

  it("with no room to wait (M/M/1/1), half are turned away when λ = μ (Erlang B)", () => {
    const { arrived, rejected, metrics } = runQueue({
      lambda: 0.1,
      mu: 0.1,
      c: 1,
      maxWaiting: 0,
      durationMs: 200_000,
      seed: 4,
    });
    within(rejected / arrived, 0.5, 0.04);
    expect(metrics.totals.dropped).toBe(rejected);
  });

  it("serves in arrival order and reports what's waiting", () => {
    const sim = new Simulator();
    const recorder = new NodeRecorder();
    const order: number[] = [];
    const server = new QueueingServer(sim, recorder, {
      concurrency: 1,
      maxWaiting: 10,
      work: (_request, done) => sim.schedule(10, () => done({ ok: true })),
    });
    for (let id = 1; id <= 4; id++) {
      server.handle(
        { id, weight: 1, kind: "read", key: 0, createdAt: 0, attempt: 1, path: [] },
        () => order.push(id),
      );
    }
    expect(server.busy).toBe(1);
    expect(server.waiting).toBe(3);
    sim.runUntil(100);
    expect(order).toEqual([1, 2, 3, 4]);
    expect(server.waiting).toBe(0);
  });
});
