import { useId } from "react";
import { cx } from "./cx.ts";
import { FieldHint } from "./FieldHint.tsx";

type ChoiceFieldProps = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string | undefined;
  disabled?: boolean;
};

/**
 * Pick one of a few options. Native radios, so arrow keys move between them
 * and screen readers announce the group.
 */
export function ChoiceField({ label, value, options, onChange, hint, disabled }: ChoiceFieldProps) {
  const name = useId();
  const labelId = useId();
  return (
    <fieldset
      aria-labelledby={labelId}
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
    >
      <div className="mb-1 flex items-center gap-1">
        <span id={labelId} className="text-base text-fg">
          {label}
        </span>
        {hint && <FieldHint hint={hint} />}
      </div>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cx(
              // relative: the hidden input is placed here, inside the panel's scroll area.
              // Placed against the page instead, it sat below the bottom of a scrolled
              // panel, and focusing it scrolled the whole page to reach it.
              "relative flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-sm",
              "transition-colors duration-(--duration-fast) hover:bg-fg/5",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent",
              selected ? "text-fg" : "text-fg-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cx(
                "grid size-4 shrink-0 place-items-center rounded-pill border-2",
                selected ? "border-accent" : "border-line-strong",
              )}
            >
              {selected && <span className="size-1.5 rounded-pill bg-accent" />}
            </span>
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
