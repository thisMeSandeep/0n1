/** Simulated time as a clock: 00:46, 12:05, or 1:02:03 past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** "1×", "0.5×". */
export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/** "100%", "250%". */
export function formatTraffic(multiplier: number): string {
  return `${Math.round(multiplier * 100)}%`;
}

const trimZeros = (text: string) => (text.includes(".") ? text.replace(/\.?0+$/, "") : text);

const SUFFIXES: readonly [number, string][] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

/**
 * A live number with at most 3 significant figures (UIUX §8): 812, 84.3,
 * 2.05, 1.50k, 12.4M. Shortened numbers keep their trailing zeros so their
 * width holds steady as they change.
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const size = Math.abs(n);
  for (const [limit, suffix] of SUFFIXES) {
    // 999.6 rounds up to 1.00k, not 1000.
    if (size >= limit * 0.9995) return `${(n / limit).toPrecision(3)}${suffix}`;
  }
  if (size >= 99.95) return String(Math.round(n));
  return trimZeros(n.toPrecision(3));
}

/** A value and its unit, shown smaller beside it. */
export type Measure = { value: string; unit: string };

/** 0.52 ms, 84 ms, 1.38 s, 2.5 min. */
export function formatDuration(ms: number): Measure {
  if (ms < 999.5) return { value: formatCompact(ms), unit: "ms" };
  if (ms < 59_950) return { value: formatCompact(ms / 1000), unit: "s" };
  return { value: formatCompact(ms / 60_000), unit: "min" };
}

/** A share (0–1) as a percentage: 0.12%, 3.4%, 45%, 100%. */
export function formatPercent(share: number): Measure {
  const percent = share * 100;
  if (percent === 0) return { value: "0", unit: "%" };
  if (percent < 0.01) return { value: "<0.01", unit: "%" };
  if (percent < 1) return { value: trimZeros(percent.toPrecision(2)), unit: "%" };
  if (percent < 9.95) return { value: trimZeros(percent.toFixed(1)), unit: "%" };
  return { value: String(Math.round(percent)), unit: "%" };
}
