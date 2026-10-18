import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_BUDGET } from "../../engine/runtime/engine.ts";
import { runningSystem } from "../../engine/testing.ts";
import { maxShapeFactor, type ShapeSettings, shapeFactor } from "./shape.ts";

const settings = (patch: Partial<ShapeSettings>): ShapeSettings => ({
  shape: "steady",
  rampFrom: 10,
  rampTime: 60,
  spikeEvery: 30,
  spikeSize: 5,
  spikeLength: 5,
  dayLength: 120,
  nightShare: 20,
  ...patch,
});

describe("traffic shapes", () => {
  it("steady is always the full rate", () => {
    expect(shapeFactor(settings({}), 0)).toBe(1);
    expect(shapeFactor(settings({}), 999)).toBe(1);
  });

  it("ramp climbs from its start to the full rate, then holds", () => {
    const ramp = settings({ shape: "ramp", rampFrom: 10, rampTime: 60 });
    expect(shapeFactor(ramp, 0)).toBeCloseTo(0.1);
    expect(shapeFactor(ramp, 30)).toBeCloseTo(0.55);
    expect(shapeFactor(ramp, 60)).toBe(1);
    expect(shapeFactor(ramp, 600)).toBe(1);
  });

  it("spike starts calm, then jumps for a while every interval", () => {
    const spike = settings({ shape: "spike", spikeEvery: 30, spikeSize: 5, spikeLength: 5 });
    expect(shapeFactor(spike, 2)).toBe(1); // the run starts calm
    expect(shapeFactor(spike, 30)).toBe(5);
    expect(shapeFactor(spike, 34.9)).toBe(5);
    expect(shapeFactor(spike, 35)).toBe(1);
    expect(shapeFactor(spike, 62)).toBe(5);
    expect(maxShapeFactor(spike)).toBe(5);
  });

  it("daily starts at night and peaks halfway through the day", () => {
    const daily = settings({ shape: "daily", dayLength: 120, nightShare: 20 });
    expect(shapeFactor(daily, 0)).toBeCloseTo(0.2);
    expect(shapeFactor(daily, 60)).toBeCloseTo(1);
    expect(shapeFactor(daily, 30)).toBeCloseTo(0.6);
    expect(shapeFactor(daily, 120)).toBeCloseTo(0.2);
    expect(maxShapeFactor(daily)).toBe(1);
  });
});

/** A client sending to a service with room to spare; returns the engine. */
function system(client: Record<string, unknown>) {
  return runningSystem(
    {
      users: { type: "client", params: { retries: 0, timeout: 5000, ...client } },
      api: { type: "service", params: { concurrency: 1024, workTime: 1, maxWaiting: 100_000 } },
    },
    [["users", "api"]],
    { eventBudget: Number.POSITIVE_INFINITY },
  );
}

/** Requests the client sent by `ms`. */
function sentBy(engine: ReturnType<typeof system>, ms: number): number {
  engine.runUntil(ms);
  return engine.snapshot().nodes.users?.totals.arrived ?? 0;
}

describe("clients follow their traffic shape", () => {
  it("ramp: as many requests as the area under the ramp", () => {
    const engine = system({ rate: 1000, shape: "ramp", rampFrom: 10, rampTime: 20 });
    // 1000/s × (10% × 20 s + 90% × 20 s ÷ 2) = 11,000, then 1000 a second.
    const ramped = sentBy(engine, 20_000);
    expect(ramped).toBeGreaterThan(11_000 * 0.97);
    expect(ramped).toBeLessThan(11_000 * 1.03);
    const held = sentBy(engine, 30_000) - ramped;
    expect(held).toBeGreaterThan(10_000 * 0.97);
    expect(held).toBeLessThan(10_000 * 1.03);
  });

  it("spike: five times the rate while it lasts, then back", () => {
    const engine = system({
      rate: 200,
      shape: "spike",
      spikeEvery: 10,
      spikeSize: 5,
      spikeLength: 2,
    });
    const calm = sentBy(engine, 10_000);
    const spike = sentBy(engine, 12_000) - calm;
    const after = sentBy(engine, 20_000) - calm - spike;
    expect(calm).toBeGreaterThan(2000 * 0.9);
    expect(calm).toBeLessThan(2000 * 1.1);
    expect(spike).toBeGreaterThan(2000 * 0.9); // 2 s at 1000/s
    expect(spike).toBeLessThan(2000 * 1.1);
    expect(after).toBeGreaterThan(1600 * 0.9); // 8 s at 200/s
    expect(after).toBeLessThan(1600 * 1.1);
  });

  it("daily: quiet at night, busy at noon, and the right total over a day", () => {
    const engine = system({ rate: 500, shape: "daily", dayLength: 40, nightShare: 20 });
    const night = sentBy(engine, 2000); // 0–2 s: about 100/s
    const morning = sentBy(engine, 19_000);
    const noon = sentBy(engine, 21_000) - morning; // 19–21 s: about 500/s
    const day = sentBy(engine, 40_000); // 500 × 40 × (20% + 80% ÷ 2) = 12,000
    expect(night).toBeLessThan(300);
    expect(noon).toBeGreaterThan(900);
    expect(noon).toBeLessThan(1100);
    expect(day).toBeGreaterThan(12_000 * 0.97);
    expect(day).toBeLessThan(12_000 * 1.03);
  });

  it("sampling follows the shaped rate, so a spike doesn't blow the budget", () => {
    const engine = runningSystem(
      {
        users: {
          type: "client",
          params: {
            rate: 20_000,
            shape: "spike",
            spikeEvery: 10,
            spikeSize: 5,
            spikeLength: 5,
            timeout: 5000,
          },
        },
        api: { type: "service", params: { concurrency: 1024, workTime: 1, maxWaiting: 100_000 } },
      },
      [["users", "api"]],
    );
    engine.runUntil(9000);
    const calm = engine.snapshot().sampling.weight;
    // Mid-spike, give the weight one reconsideration to catch up, then count events.
    engine.runUntil(11_000);
    const before = engine.sim.eventsProcessed;
    engine.runUntil(14_000);
    const perSecond = (engine.sim.eventsProcessed - before) / 3;
    expect(engine.snapshot().sampling.weight).toBeGreaterThan(calm);
    expect(perSecond).toBeLessThan(DEFAULT_EVENT_BUDGET * 1.1);
  });
});
