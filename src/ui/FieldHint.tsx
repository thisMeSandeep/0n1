import { InfoIcon } from "@phosphor-icons/react";
import { Tooltip } from "./Tooltip.tsx";

/** A small info icon that explains a setting, keeping the form uncluttered. */
export function FieldHint({ hint }: { hint: string }) {
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        aria-label={hint}
        className="grid size-5 shrink-0 place-items-center rounded-control text-fg-3 hover:text-fg-2"
      >
        <InfoIcon aria-hidden className="size-3.5" />
      </button>
    </Tooltip>
  );
}
