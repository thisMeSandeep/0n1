import { describe, expect, it } from "vitest";
import { RateCounter, TimeWeightedGauge, WindowedHistogram } from "./windows.ts";

const window = { windowMs: 1000, slots: 10 };

describe("RateCounter", () => {
  it("reports a steady rate at any moment, across slot boundaries", () => {
    const counter = new RateCounter(window);
    // 200 events per second, one every 5 ms, read at awkward moments as time passes.
    const checkpoints = [1000, 1234.5, 2001, 3333, 4999];
    for (let t = 0; t < 5000; t += 5) {
      counter.add(t);
      const now = checkpoints[0];
      if (now !== undefined && t + 5 > now) {
        checkpoints.shift();
        expect(counter.rate(now)).toBeGreaterThan(195);
        expect(counter.rate(now)).toBeLessThan(205);
      }
    }
    expect(checkpoints).toEqual([]);
  });

  it("is right at the very start of a run, before a full window has passed", () => {
    const counter = new RateCounter(window);
    for (let t = 0; t < 300; t += 5) counter.add(t);
    expect(counter.rate(300)).toBeCloseTo(200, -1);
  });

  it("forgets events once they leave the window, but keeps the total", () => {
    const counter = new RateCounter(window);
    for (let t = 0; t < 1000; t += 10) counter.add(t);
    expect(counter.sum(999)).toBe(100);
    expect(counter.sum(2500)).toBe(0);
    expect(counter.rate(2500)).toBe(0);
    expect(counter.total).toBe(100);
  });

  it("drops a burst as it ages out, slot by slot", () => {
    const counter = new RateCounter(window);
    counter.add(50, 30);
    expect(counter.sum(950)).toBe(30);
    expect(counter.sum(1099)).toBe(0); // the burst's slot (0–100 ms) has left the window
  });

  it("counts weights", () => {
    const counter = new RateCounter(window);
    counter.add(100, 10);
    counter.add(200, 2.5);
    expect(counter.sum(500)).toBe(12.5);
  });
});

describe("TimeWeightedGauge", () => {
  it("averages a value over time", () => {
    const gauge = new TimeWeightedGauge(window);
    // Busy (1) for the first half of each 100 ms, idle (0) for the second.
    for (let t = 0; t < 2000; t += 100) {
      gauge.set(t, 1);
      gauge.set(t + 50, 0);
    }
    expect(gauge.average(2000)).toBeCloseTo(0.5, 2);
  });

  it("reflects only the window", () => {
    const gauge = new TimeWeightedGauge(window);
    gauge.set(0, 8);
    gauge.set(1000, 2);
    expect(gauge.average(2000)).toBeCloseTo(2, 5);
  });

  it("holds the current value through long idle gaps cheaply", () => {
    const gauge = new TimeWeightedGauge(window);
    gauge.set(0, 3);
    expect(gauge.average(10_000_000)).toBeCloseTo(3, 5);
  });
});

describe("WindowedHistogram", () => {
  it("keeps percentiles for the recent window only", () => {
    const histogram = new WindowedHistogram(window);
    for (let t = 0; t < 1000; t += 10) histogram.record(t, 500); // a slow first second
    expect(histogram.merged(999).quantile(0.5)).toBeGreaterThan(490);
    for (let t = 1000; t < 2000; t += 10) histogram.record(t, 5); // then fast
    expect(histogram.merged(1999).quantile(0.99)).toBeLessThan(6);
  });
});
