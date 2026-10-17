import { describe, expect, it } from "vitest";
import { exponential, lognormal, uniform } from "../core/distributions.ts";
import { createRng } from "../core/prng.ts";
import { LatencyHistogram, RELATIVE_ACCURACY } from "./histogram.ts";

const QUANTILES = [0.01, 0.1, 0.5, 0.9, 0.95, 0.99, 0.999];

function exactQuantile(sorted: number[], q: number): number {
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1] as number;
}

describe("LatencyHistogram", () => {
  const rng = createRng(1);
  it.each([
    ["lognormal service times", () => lognormal(rng, 20, 1.5)],
    ["exponential", () => exponential(rng, 5)],
    ["uniform 1–1000 ms", () => uniform(rng, 1, 1000)],
    ["sub-millisecond", () => uniform(rng, 0.01, 0.5)],
  ])("quantiles are within 2 percent of exact for %s", (_, sample) => {
    const values = Array.from({ length: 100_000 }, sample);
    const histogram = new LatencyHistogram();
    for (const v of values) histogram.record(v);
    const sorted = [...values].sort((a, b) => a - b);

    for (const q of QUANTILES) {
      const exact = exactQuantile(sorted, q);
      const approx = histogram.quantile(q) as number;
      expect(Math.abs(approx - exact) / exact).toBeLessThanOrEqual(0.02);
    }
    expect(RELATIVE_ACCURACY).toBeLessThanOrEqual(0.02);
  });

  it("tracks count, mean, min and max exactly", () => {
    const histogram = new LatencyHistogram();
    for (const v of [3, 1, 4, 1, 5]) histogram.record(v);
    expect(histogram.count).toBe(5);
    expect(histogram.mean).toBeCloseTo(2.8);
    expect(histogram.min).toBe(1);
    expect(histogram.max).toBe(5);
    expect(histogram.quantile(0)).toBe(1);
    expect(histogram.quantile(1)).toBe(5);
  });

  it("is empty-safe", () => {
    const histogram = new LatencyHistogram();
    expect(histogram.quantile(0.99)).toBeNull();
    expect(histogram.mean).toBeNull();
  });

  it("handles zero and tiny values", () => {
    const histogram = new LatencyHistogram();
    for (let i = 0; i < 99; i++) histogram.record(0);
    histogram.record(50);
    expect(histogram.quantile(0.5)).toBe(0);
    expect(histogram.quantile(1)).toBe(50);
  });

  it("weights count like repeated samples", () => {
    const weighted = new LatencyHistogram();
    const repeated = new LatencyHistogram();
    weighted.record(10, 9);
    weighted.record(100, 1);
    for (let i = 0; i < 9; i++) repeated.record(10);
    repeated.record(100);
    for (const q of QUANTILES) expect(weighted.quantile(q)).toBe(repeated.quantile(q));
    expect(weighted.mean).toBe(repeated.mean);
  });

  it("merging equals recording everything in one", () => {
    const rng2 = createRng(2);
    const a = new LatencyHistogram();
    const b = new LatencyHistogram();
    const all = new LatencyHistogram();
    for (let i = 0; i < 5000; i++) {
      const x = lognormal(rng2, 10, 1);
      (i % 2 ? a : b).record(x);
      all.record(x);
    }
    a.merge(b);
    for (const q of QUANTILES) expect(a.quantile(q)).toBe(all.quantile(q));
    expect(a.count).toBe(all.count);
  });

  it("ignores junk and resets", () => {
    const histogram = new LatencyHistogram();
    histogram.record(Number.NaN);
    histogram.record(10, 0);
    expect(histogram.count).toBe(0);
    histogram.record(10);
    histogram.reset();
    expect(histogram.count).toBe(0);
    expect(histogram.quantile(0.5)).toBeNull();
  });
});
