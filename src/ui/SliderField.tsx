import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { IconButton } from "./Button.tsx";
import { NumberField } from "./NumberField.tsx";
import { Slider } from "./Slider.tsx";
import type { NumericRange } from "./scale.ts";

type SliderFieldProps = NumericRange & {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  /** When set and the value differs, a reset button appears on hover or focus. */
  defaultValue?: number;
  disabled?: boolean;
};

/** Label, number field and slider bound to one value (UIUX §7, Settings). */
export function SliderField({
  label,
  value,
  onChange,
  unit,
  defaultValue,
  disabled = false,
  ...range
}: SliderFieldProps) {
  const id = useId();
  const changed = defaultValue !== undefined && value !== defaultValue;

  return (
    <div className="group flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-base text-fg">
          {label}
        </label>
        <div className="flex items-center gap-1">
          {changed && (
            <IconButton
              size="sm"
              label={`Reset to ${defaultValue}${unit ? ` ${unit}` : ""}`}
              onClick={() => onChange(defaultValue)}
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <ArrowCounterClockwiseIcon />
            </IconButton>
          )}
          <NumberField
            id={id}
            value={value}
            onChange={onChange}
            unit={unit}
            disabled={disabled}
            {...range}
          />
        </div>
      </div>
      <Slider
        label={label}
        unit={unit}
        value={value}
        onChange={onChange}
        disabled={disabled}
        {...range}
      />
    </div>
  );
}
