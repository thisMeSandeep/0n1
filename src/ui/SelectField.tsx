import { CaretDownIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { cx } from "./cx.ts";

type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown instead of options when there are none to pick. */
  empty?: string;
};

/** A labelled native select: keyboard, screen readers and long lists come for free. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  empty,
}: SelectFieldProps) {
  const id = useId();
  const none = options.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base text-fg">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={none ? "" : value}
          disabled={disabled || none}
          onChange={(event) => onChange(event.target.value)}
          className={cx(
            "h-8 w-full appearance-none rounded-control border border-line-strong bg-raised pr-8 pl-2.5 text-base text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:text-fg-3",
          )}
        >
          {none ? (
            <option value="">{empty ?? "Nothing to choose"}</option>
          ) : (
            options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
        </select>
        <CaretDownIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fg-2"
        />
      </div>
    </div>
  );
}
