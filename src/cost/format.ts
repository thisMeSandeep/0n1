import { formatCompact } from "../simulation/format.ts";

/**
 * Dollars, rounded as an estimate deserves: $0, <$1, $4, $263, $1.2k,
 * $12k, $1.2M. Two significant figures from a thousand up, so a live
 * estimate doesn't flicker in its last digits.
 */
export function formatMoney(dollars: number): string {
  if (!Number.isFinite(dollars) || dollars <= 0) return "$0";
  if (dollars < 1) return "<$1";
  if (dollars < 999.5) return `$${Math.round(dollars)}`;
  const [limit, suffix] = dollars >= 999_500 ? [1e6, "M"] : [1e3, "k"];
  return `$${Number((dollars / limit).toPrecision(2))}${suffix}`;
}

/** An amount of data, from GB: 120 MB, 26 GB, 2.6 TB. */
export function formatData(gb: number): string {
  if (gb < 1) return `${formatCompact(gb * 1000)} MB`;
  if (gb < 999.5) return `${formatCompact(gb)} GB`;
  return `${formatCompact(gb / 1000)} TB`;
}
