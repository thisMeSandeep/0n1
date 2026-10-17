import { describe, expect, it } from "vitest";
import { exponential } from "./distributions.ts";
import { createRng } from "./prng.ts";
import { Simulator } from "./simulator.ts";

/**
 * A toy model: two sources fire at random intervals from their own forked
 * streams, and each firing sometimes schedules a follow-up. Returns the log.
 */
function runToy(seed: number, until: number, chunk?: number) {
  const sim = new Simulator();
  const rng = createRng(seed);
  const log: string[] = [];
  for (const name of ["web", "jobs"]) {
    const stream = rng.fork(name);
    const fire = () => {
      log.push(`${sim.now.toFixed(6)} ${name}`);
      if (stream.next() < 0.3)
        sim.schedule(exponential(stream, 2), () => log.push(`${sim.now.toFixed(6)} ${name}-done`));
      sim.schedule(exponential(stream, 10), fire);
    };
    sim.schedule(exponential(stream, 10), fire);
  }
  if (chunk) {
    for (let t = chunk; t < until; t += chunk) sim.runUntil(t);
  }
  sim.runUntil(until);
  return { log, sim };
}

describe("Simulator", () => {
  it("gives an identical event sequence for the same seed", () => {
    const a = runToy(42, 5000).log;
    expect(a.length).toBeGreaterThan(500);
    expect(runToy(42, 5000).log).toEqual(a);
    expect(runToy(43, 5000).log).not.toEqual(a);
  });

  it("gives the same result whether run in one go or in small chunks", () => {
    expect(runToy(7, 3000, 16.7).log).toEqual(runToy(7, 3000).log);
  });

  it("advances the clock to each event and to the runUntil target", () => {
    const sim = new Simulator();
    const seen: number[] = [];
    sim.schedule(10, () => seen.push(sim.now));
    sim.schedule(5, () => seen.push(sim.now));
    expect(sim.nextEventTime()).toBe(5);

    expect(sim.runUntil(7)).toBe(1);
    expect(sim.now).toBe(7);
    expect(sim.step()).toBe(true);
    expect(seen).toEqual([5, 10]);
    expect(sim.step()).toBe(false);
    expect(sim.eventsProcessed).toBe(2);
  });

  it("runs events scheduled during runUntil if they fall inside it", () => {
    const sim = new Simulator();
    const seen: number[] = [];
    sim.schedule(1, () => {
      seen.push(sim.now);
      sim.schedule(1, () => seen.push(sim.now));
      sim.schedule(100, () => seen.push(sim.now));
    });
    sim.runUntil(10);
    expect(seen).toEqual([1, 2]);
    expect(sim.pendingEvents).toBe(1);
  });

  it("supports cancelling (e.g. a timeout that didn't happen)", () => {
    const sim = new Simulator();
    let fired = false;
    const timeout = sim.schedule(50, () => {
      fired = true;
    });
    sim.schedule(10, () => sim.cancel(timeout));
    sim.runUntil(100);
    expect(fired).toBe(false);
  });

  it("refuses to schedule into the past", () => {
    const sim = new Simulator();
    sim.runUntil(10);
    expect(() => sim.schedule(-1, () => {})).toThrow(RangeError);
    expect(() => sim.at(5, () => {})).toThrow(RangeError);
    expect(() => sim.schedule(Number.NaN, () => {})).toThrow(RangeError);
  });
});
