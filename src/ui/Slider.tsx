import * as RadixSlider from "@radix-ui/react-slider";
import type { KeyboardEvent } from "react";
import { cx } from "./cx.ts";
import { clamp, fromPosition, type NumericRange, stepValue, toPosition } from "./scale.ts";

/** Resolution of the underlying Radix slider; values are mapped onto it. */
const POSITIONS = 1000;

const STEP_KEYS: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
};

type SliderProps = NumericRange & {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name. */
  label: string;
  /** Spoken after the value, e.g. "ms". */
  unit?: string | undefined;
  disabled?: boolean;
  className?: string;
};

/**
 * A slider over a linear or log range. Radix handles pointer and focus;
 * keyboard stepping is ours so log ranges move by a constant factor and
 * every press changes the value.
 */
export function Slider({
  value,
  onChange,
  label,
  unit,
  disabled,
  className,
  ...range
}: SliderProps) {
  const current = clamp(value, range.min, range.max);
  const position = Math.round(toPosition(current, range) * POSITIONS);

  const commit = (next: number) => {
    if (next !== current) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? range.min : range.max);
      return;
    }
    const direction = STEP_KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    const large = event.shiftKey || event.key === "PageUp" || event.key === "PageDown";
    commit(stepValue(current, direction, range, large));
  };

  return (
    <RadixSlider.Root
      min={0}
      max={POSITIONS}
      step={1}
      value={[position]}
      onValueChange={([next]) =>
        next !== undefined && commit(fromPosition(next / POSITIONS, range))
      }
      onKeyDown={handleKeyDown}
      {...(disabled ? { disabled } : {})}
      className={cx(
        "relative flex h-6 w-full touch-none select-none items-center data-disabled:opacity-50",
        className,
      )}
    >
      <RadixSlider.Track className="relative h-0.5 grow overflow-hidden rounded-pill bg-line">
        <RadixSlider.Range className="absolute h-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={label}
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={current}
        aria-valuetext={unit ? `${current} ${unit}` : String(current)}
        className={cx(
          "block size-3.5 rounded-pill border-2 border-accent bg-raised",
          "transition-transform duration-(--duration-fast) ease-out hover:scale-110",
        )}
      />
    </RadixSlider.Root>
  );
}
