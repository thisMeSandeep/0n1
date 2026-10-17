const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const date = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dateWithYear = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", "3 days ago", "Mar 3", "Mar 3, 2024". */
export function formatEdited(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day");
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? date : dateWithYear).format(timestamp);
}
