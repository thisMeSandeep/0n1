import { useId } from "react";
import { cx } from "./cx.ts";
import { FieldHint } from "./FieldHint.tsx";

type SwitchFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string | undefined;
  disabled?: boolean;
};

/** A labelled on/off switch. */
export function SwitchField({ label, checked, onChange, hint, disabled }: SwitchFieldProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className="text-base text-fg">
          {label}
        </label>
        {hint && <FieldHint hint={hint} />}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-5 w-8.5 shrink-0 rounded-pill transition-colors duration-(--duration-fast) ease-out",
          "disabled:opacity-50",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "absolute top-0.5 left-0.5 size-4 rounded-pill bg-raised shadow-raised",
            "transition-transform duration-(--duration-fast) ease-out",
            checked && "translate-x-3.5",
          )}
        />
      </button>
    </div>
  );
}
