/**
 * A token bucket that allows `ratePerSecond` on average, with short bursts
 * up to `burstMs` worth. A request is let through while there's any credit,
 * and may push the bucket into debt by its weight, so a sampled request
 * (weight above 1, S26) still uses its fair share.
 */
export function createTokenBucket(ratePerSecond: number, burstMs = 100) {
  const capacity = Math.max(1, (ratePerSecond * burstMs) / 1000);
  let tokens = capacity;
  let last = 0;
  return {
    /** Try to let a request through at `now` (ms). */
    take(now: number, weight = 1): boolean {
      tokens = Math.min(capacity, tokens + ((now - last) * ratePerSecond) / 1000);
      last = now;
      if (tokens <= 0) return false;
      tokens -= weight;
      return true;
    },
  };
}
