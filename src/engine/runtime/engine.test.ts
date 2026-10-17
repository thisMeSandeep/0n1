import { describe, expect, it } from "vitest";
import { registry } from "../../components/index.ts";
import { WORK_TIME_CV } from "../../components/service/behaviour.ts";
import { defaultParams } from "../../model/component.ts";
import { createSystemDocument } from "../../model/document.ts";
import { compile } from "../compile.ts";
import { Engine, type EngineOptions } from "./engine.ts";

const RUN_MS = 300_000;
const WHOLE_RUN = { windowMs: RUN_MS * 2, slots: 1 };

/** Client → Service, with the given settings. */
function build(
  client: Record<string, unknown>,
  service: Record<string, unknown>,
  options: EngineOptions = {},
) {
  const doc = {
    ...createSystemDocument({ id: "s", now: 0 }),
    nodes: [
      {
        id: "users",
        type: "client",
        name: "Users",
        position: { x: 0, y: 0 },
        params: { ...defaultParams(registry.require("client")), ...client },
      },
      {
        id: "api",
        type: "service",
        name: "API",
        position: { x: 0, y: 0 },
        params: { ...defaultParams(registry.require("service")), ...service },
      },
    ],
    edges: [{ id: "e", source: "users", target: "api" }],
  };
  const { model, errors } = compile(doc, registry);
  if (!model) throw new Error(errors.map((e) => e.message).join("; "));
  return new Engine(model, { window: WHOLE_RUN, ...options });
}

describe("Engine: client → service", () => {
  it("matches M/G/1 theory: utilization λ·E[S], mean latency from Pollaczek–Khinchine", () => {
    const engine = build(
      { rate: 50, timeout: 60_000, retries: 0 },
      { concurrency: 1, workTime: 10, maxWaiting: 100_000, errorRate: 0 },
      { networkLatencyMs: 0.5 },
    );
    engine.runUntil(RUN_MS);
    const { nodes, system } = engine.snapshot();

    // λ = 0.05/ms, E[S] = 10 ms, E[S²] = (1 + cv²)·E[S]².
    const lambda = 0.05;
    const meanS = 10;
    const rho = lambda * meanS;
    const waiting = (lambda * (1 + WORK_TIME_CV ** 2) * meanS ** 2) / (2 * (1 - rho));
    const atService = meanS + waiting;

    expect(Math.abs((nodes.api?.utilization ?? 0) - rho)).toBeLessThan(0.02);
    expect(Math.abs((nodes.api?.latency?.mean ?? 0) - atService) / atService).toBeLessThan(0.06);
    // End to end adds one network hop each way.
    const endToEnd = system.latency?.mean ?? 0;
    expect(Math.abs(endToEnd - (atService + 1)) / atService).toBeLessThan(0.06);
    expect(system.errorRate).toBe(0);
    expect(Math.abs(system.throughput - 50) / 50).toBeLessThan(0.05);
  });

  it("times out slow requests, retries them, and ignores late replies", () => {
    // Work takes about a second; the client gives up after 20 ms and retries twice.
    const engine = build(
      { rate: 20, timeout: 20, retries: 2 },
      { concurrency: 1000, workTime: 1000, maxWaiting: 100_000, errorRate: 0 },
    );
    engine.runUntil(60_000);
    const { nodes, system } = engine.snapshot();
    const sent = nodes.users?.totals.arrived ?? 0;

    // Every request makes three attempts, and the service still does all that work.
    expect((nodes.api?.totals.arrived ?? 0) / sent).toBeGreaterThan(2.95);
    expect(system.errorRate).toBeGreaterThan(0.99);
    // Each request is answered once (late replies don't count again), after ~3 × 20 ms.
    expect(nodes.users?.totals.completed).toBeLessThanOrEqual(sent);
    expect(Math.abs((system.latency?.mean ?? 0) - 60)).toBeLessThan(2);
  });

  it("retries recover from random errors", () => {
    // Half of all attempts fail; with 3 retries, 1 − 0.5⁴ = 93.75% succeed.
    const engine = build(
      { rate: 200, timeout: 10_000, retries: 3 },
      { concurrency: 64, workTime: 1, maxWaiting: 100_000, errorRate: 50 },
    );
    engine.runUntil(RUN_MS);
    const { nodes, system } = engine.snapshot();
    expect(Math.abs(1 - system.errorRate - 0.9375)).toBeLessThan(0.01);
    // Expected attempts per request: 1 + 0.5 + 0.25 + 0.125 = 1.875.
    const ratio = (nodes.api?.totals.arrived ?? 0) / (nodes.users?.totals.arrived ?? 1);
    expect(Math.abs(ratio - 1.875)).toBeLessThan(0.02);
  });

  it("turns requests away when the line is full", () => {
    const engine = build(
      { rate: 500, timeout: 10_000, retries: 0 },
      { concurrency: 1, workTime: 10, maxWaiting: 5, errorRate: 0 },
    );
    engine.runUntil(30_000);
    const { nodes, system } = engine.snapshot();
    expect(nodes.api?.totals.dropped).toBeGreaterThan(0);
    expect(nodes.api?.waiting).toBeLessThanOrEqual(5);
    expect(system.errorRate).toBeGreaterThan(0.5);
    // Rejections come back quickly instead of timing out.
    expect(system.latency?.p50 ?? Number.POSITIVE_INFINITY).toBeLessThan(100);
  });

  it("adds network delay on every hop", () => {
    const run = (networkLatencyMs: number) => {
      const engine = build(
        { rate: 10, timeout: 60_000, retries: 0 },
        { concurrency: 100, workTime: 5, maxWaiting: 1000, errorRate: 0 },
        { networkLatencyMs, seed: 9 },
      );
      engine.runUntil(RUN_MS);
      return engine.snapshot().system.latency?.mean ?? 0;
    };
    // Same seed, so the same work: the difference is exactly two hops of 5 ms.
    expect(run(5) - run(0)).toBeCloseTo(10, 6);
  });

  it("is deterministic for a seed", () => {
    const run = (seed: number) => {
      const engine = build({ rate: 100 }, { concurrency: 2, workTime: 15 }, { seed });
      engine.runUntil(20_000);
      return engine.snapshot();
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it("refuses components it can't simulate yet", () => {
    const doc = {
      ...createSystemDocument({ id: "s", now: 0 }),
      nodes: [
        { id: "u", type: "client", name: "Users", position: { x: 0, y: 0 }, params: {} },
        { id: "q", type: "cdn", name: "Edge", position: { x: 0, y: 0 }, params: {} },
        { id: "a", type: "service", name: "API", position: { x: 0, y: 0 }, params: {} },
      ],
      edges: [
        { id: "1", source: "u", target: "q" },
        { id: "2", source: "q", target: "a" },
      ],
    };
    const { model } = compile(doc, registry);
    expect(() => new Engine(model!)).toThrow("Edge: CDN isn't simulated yet.");
  });
});
