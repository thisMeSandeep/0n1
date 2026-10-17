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
