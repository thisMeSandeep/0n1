import { describe, expect, it } from "vitest";
import { createRng, hashString } from "./prng.ts";

const take = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.nextUint32());
};

describe("createRng", () => {
  it("is deterministic for a seed and differs between seeds", () => {
    expect(take(42, 50)).toEqual(take(42, 50));
    expect(take(42, 50)).not.toEqual(take(43, 50));
  });

  it("produces floats in [0, 1) that look uniform", () => {
    const rng = createRng(7);
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]++;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n * 0.01);
  });

  it("forks independent, reproducible streams by label", () => {
    const a1 = createRng(1).fork("cache");
    const a2 = createRng(1).fork("cache");
    const b = createRng(1).fork("database");
    const seq = (r: ReturnType<typeof createRng>) =>
      Array.from({ length: 20 }, () => r.nextUint32());
    const first = seq(a1);
    expect(seq(a2)).toEqual(first);
    expect(seq(b)).not.toEqual(first);
  });

  it("forking doesn't consume the parent stream", () => {
    const plain = createRng(9);
    const forked = createRng(9);
    forked.fork("x");
    expect(forked.nextUint32()).toBe(plain.nextUint32());
  });
});

describe("hashString", () => {
  it("is stable and seed-dependent", () => {
    expect(hashString("api")).toBe(hashString("api"));
    expect(hashString("api")).not.toBe(hashString("apj"));
    expect(hashString("api", 1)).not.toBe(hashString("api", 2));
  });
});
