/*
 * Traffic shapes (S39): how a client's rate changes over simulated time.
 * Each shape is a factor on the client's "Requests per second":
 * - steady: always 1;
 * - ramp: from `rampFrom`% up to 1 over `rampTime` seconds, then 1;
 * - spike: 1, but every `spikeEvery` seconds it jumps to `spikeSize` for
 *   `spikeLength` seconds (the first spike comes after one interval, so a
 *   run starts calm);
 * - daily: a compressed day of `dayLength` seconds, starting at night
 *   (`nightShare`%) and peaking at 1 halfway through.
 */

export type TrafficShape = "steady" | "ramp" | "spike" | "daily";

export type ShapeSettings = {
  shape: TrafficShape;
  rampFrom: number;
  rampTime: number;
  spikeEvery: number;
  spikeSize: number;
  spikeLength: number;
  dayLength: number;
  nightShare: number;
};

/** The rate factor at `seconds` into the run. */
export function shapeFactor(s: ShapeSettings, seconds: number): number {
  const t = Math.max(0, seconds);
  switch (s.shape) {
    case "steady":
      return 1;
    case "ramp": {
      const from = s.rampFrom / 100;
      return t >= s.rampTime ? 1 : from + ((1 - from) * t) / s.rampTime;
    }
    case "spike": {
      // Spikes are never longer than the gap between them.
      const length = Math.min(s.spikeLength, s.spikeEvery);
      return t >= s.spikeEvery && t % s.spikeEvery < length ? s.spikeSize : 1;
    }
    case "daily": {
      const night = s.nightShare / 100;
      return night + ((1 - night) * (1 - Math.cos((2 * Math.PI * t) / s.dayLength))) / 2;
    }
  }
}

/** The largest factor the shape ever reaches: the ceiling for drawing arrivals. */
export function maxShapeFactor(s: ShapeSettings): number {
  return s.shape === "spike" ? Math.max(1, s.spikeSize) : 1;
}

/** A sensible stretch of time to preview the shape over (seconds). */
export function previewSeconds(s: ShapeSettings): number {
  switch (s.shape) {
    case "steady":
      return 120;
    case "ramp":
      return s.rampTime * 1.5;
    case "spike":
      return s.spikeEvery * 3.5;
    case "daily":
      return s.dayLength * 2;
  }
}
