import { describe, expect, it } from "vitest";
import { createTokenBucket } from "./tokenBucket.ts";

const accepted = (
  bucket: ReturnType<typeof createTokenBucket>,
  perMs: number,
  ms: number,
  weight = 1,
) => {
  let count = 0;
  for (let i = 0; i < perMs * ms; i++) if (bucket.take(i / perMs, weight)) count += weight;
  return count;
};

describe("createTokenBucket", () => {
  it("lets through the configured rate on average", () => {
    // 1 request per ms (1000/s) offered for 10 s against a 200/s limit.
    expect(Math.abs(accepted(createTokenBucket(200), 1, 10_000) - 2000)).toBeLessThan(30);
  });

  it("lets everything through below the limit", () => {
    expect(accepted(createTokenBucket(2000), 1, 10_000)).toBe(10_000);
  });

  it("allows a short burst, then holds the rate", () => {
    const bucket = createTokenBucket(100, 100); // capacity 10
    let burst = 0;
    while (bucket.take(0)) burst++;
    expect(burst).toBe(10);
  });

  it("charges sampled requests their full weight", () => {
    // Weight 10 at 100 per ms offered: still about 200/s through.
    expect(Math.abs(accepted(createTokenBucket(200), 0.1, 10_000, 10) - 2000)).toBeLessThan(60);
  });
});
