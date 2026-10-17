import type { ParamSpec, Params } from "../model/component.ts";
import { designStore } from "../store/index.ts";
import { ChoiceField } from "../ui/ChoiceField.tsx";
import { SliderField } from "../ui/SliderField.tsx";
import { SwitchField } from "../ui/Switch.tsx";
import { isParamEnabled } from "./sections.ts";

type ParamFieldProps = {
  spec: ParamSpec;
  value: unknown;
  /** All of the component's params, for `enabledBy`. */
  params: Params;
  onChange: (value: number | string | boolean) => void;
};

const { beginGesture, endGesture } = designStore.getState();

/** One setting, rendered from its spec (UIUX §7, Settings). */
export function ParamField({ spec, value, params, onChange }: ParamFieldProps) {
  const disabled = !isParamEnabled(spec, params);
  switch (spec.kind) {
    case "number":
      return (
        <SliderField
          label={spec.label}
          hint={spec.help}
          value={typeof value === "number" ? value : spec.default}
          onChange={onChange}
          min={spec.min}
          max={spec.max}
          {...(spec.step === undefined ? {} : { step: spec.step })}
          {...(spec.scale === undefined ? {} : { scale: spec.scale })}
          {...(spec.unit === undefined ? {} : { unit: spec.unit })}
          defaultValue={spec.default}
          disabled={disabled}
          // A slider drag is one undo step.
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
      );
    case "choice":
      return (
        <ChoiceField
          label={spec.label}
          hint={spec.help}
          value={typeof value === "string" ? value : spec.default}
          options={spec.options}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "toggle":
      return (
        <SwitchField
          label={spec.label}
          hint={spec.help}
          checked={typeof value === "boolean" ? value : spec.default}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}
