/**
 * Value ↔ slider position mapping, rounding and keyboard stepping for
 * numeric controls. Positions are always 0..1.
 */

export type Scale = "linear" | "log";

export type NumericRange = {
  min: number;
  max: number;
  scale?: Scale;
  /** Values snap to multiples of this. Without it, log values keep 3 significant figures. */
  step?: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertValid({ min, max, scale }: NumericRange): void {
  if (!(max > min)) throw new RangeError(`max (${max}) must be greater than min (${min})`);
  if (scale === "log" && min <= 0) throw new RangeError(`log scale needs min > 0 (got ${min})`);
}

function decimalsOf(step: number): number {
  const [mantissa = "", exponent = "0"] = step.toExponential().split("e");
  const mantissaDecimals = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, mantissaDecimals - Number(exponent));
}

export function roundValue(value: number, range: NumericRange): number {
  const { min, max, scale = "linear", step } = range;
  let rounded = value;
  if (step) {
    rounded = Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
  } else if (scale === "log") {
    rounded = Number(value.toPrecision(3));
  }
  return clamp(rounded, min, max);
}

export function toPosition(value: number, range: NumericRange): number {
  assertValid(range);
  const { min, max, scale = "linear" } = range;
  const v = clamp(value, min, max);
  if (scale === "log") return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return (v - min) / (max - min);
}

export function fromPosition(position: number, range: NumericRange): number {
  assertValid(range);
  const { min, max, scale = "linear" } = range;
  const p = clamp(position, 0, 1);
  const raw =
    scale === "log"
      ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min)))
      : min + p * (max - min);
  return roundValue(raw, range);
}

const LOG_FACTOR = 1.1;
const LOG_FACTOR_LARGE = 2;
const LINEAR_STEPS = 100;
const LARGE_MULTIPLIER = 10;

/**
 * The next value for a keyboard step. Linear ranges move by `step`
 * (or 1% of the range); log ranges move by a constant factor, so each press
 * feels the same at 1 ms and at 1 s. A step always changes the value unless
 * it is already at the limit.
 */
export function stepValue(
  value: number,
  direction: 1 | -1,
  range: NumericRange,
  large = false,
): number {
  assertValid(range);
  const { min, max, scale = "linear", step } = range;
  const current = clamp(value, min, max);

  let next: number;
  if (scale === "log") {
    const factor = large ? LOG_FACTOR_LARGE : LOG_FACTOR;
    next = direction > 0 ? current * factor : current / factor;
  } else {
    const base = step ?? (max - min) / LINEAR_STEPS;
    next = current + direction * base * (large ? LARGE_MULTIPLIER : 1);
  }

  let rounded = roundValue(next, range);
  if (rounded === current && step) rounded = roundValue(current + direction * step, range);
  return rounded;
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

/** Display a value for a number field: thousands separators, no trailing zeros. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Parse user input. Returns null when it isn't a finite number. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
