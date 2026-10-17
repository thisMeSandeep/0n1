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

/**
 * A token bucket whose rate is read live: when the setting changes, it
 * starts a fresh bucket at the new rate. Optionally reports the rate as the
 * recorder's capacity, for utilization.
 */
export function liveTokenBucket(
  rate: () => number,
  recorder?: { setRateCapacity(perSecond: number): void },
) {
  let current = Number.NaN;
  let bucket = createTokenBucket(1);
  return {
    take(now: number, weight = 1): boolean {
      const value = rate();
      if (value !== current) {
        current = value;
        bucket = createTokenBucket(value);
        recorder?.setRateCapacity(value);
      }
      return bucket.take(now, weight);
    },
  };
}
