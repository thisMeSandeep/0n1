import { type KeyboardEvent, useState } from "react";
import { cx } from "./cx.ts";
import { formatNumber, type NumericRange, parseNumber, roundValue, stepValue } from "./scale.ts";

type NumberFieldProps = NumericRange & {
  value: number;
  onChange: (value: number) => void;
  unit?: string | undefined;
  id?: string;
  /** Accessible name when there is no visible <label>. */
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * A compact numeric input. Typing edits a draft that commits on Enter or
 * blur (clamped and rounded); Escape reverts; arrow keys step like the slider.
 * Inside a form, Enter only commits; it doesn't submit.
 */
export function NumberField({
  value,
  onChange,
  unit,
  id,
  "aria-label": ariaLabel,
  disabled,
  className,
  ...range
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseNumber(draft);
    setDraft(null);
    if (parsed === null) return;
    const next = roundValue(parsed, range);
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Enter commits this value; it doesn't also submit a surrounding form,
      // which would act before the new value has landed.
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft(null);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const base = (draft === null ? null : parseNumber(draft)) ?? value;
      setDraft(null);
      const next = stepValue(base, event.key === "ArrowUp" ? 1 : -1, range, event.shiftKey);
      if (next !== value) onChange(next);
    }
  };

  return (
    <div
      className={cx(
        "flex h-7 w-24 items-center gap-1 rounded-control border border-line-strong bg-raised px-2",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        disabled && "opacity-50",
        className,
      )}
    >
      <input
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? formatNumber(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 bg-transparent text-right text-sm text-fg outline-none"
      />
      {unit && (
        <span aria-hidden className="text-xs text-fg-2">
          {unit}
        </span>
      )}
    </div>
  );
}
