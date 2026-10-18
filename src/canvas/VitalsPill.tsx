import { formatMoney } from "../cost/format.ts";
import { useSystemCost } from "../cost/useCost.ts";
import { useLive } from "../simulation/index.ts";
import type { Level } from "../simulation/live.ts";
import { cx } from "../ui/cx.ts";
import { LEVEL_TEXT, LevelMark } from "../ui/LevelMark.tsx";

/**
 * The system's health at a glance, floating at the bottom of the canvas
 * (UIUX §3): throughput, p99 and errors as users see them. A number turns
 * amber or red only past its threshold. Then the estimated monthly cost
 * (S44), shown even before a run, from the clients' rates.
 */
export function VitalsPill() {
  const system = useLive((s) => s.system);
  const cost = useSystemCost();
  return (
    <section
      aria-label="System vitals"
      className="flex items-center rounded-pill border border-line bg-raised px-2 py-2.5 shadow-raised"
    >
      <Vital label="throughput" value={system?.throughput} unit="/s" />
      <Vital
        label="p99"
        value={system ? (system.p99?.value ?? "—") : undefined}
        unit={system?.p99?.unit}
        level={system?.p99Level}
      />
      <Vital
        label="errors"
        value={system?.errors.value}
        unit={system?.errors.unit ?? "%"}
        level={system?.errorsLevel}
      />
      <Vital
        label="est. cost"
        value={formatMoney(cost.total)}
        unit="/mo"
        title={
          cost.live
            ? "Estimated monthly cost at typical cloud list prices, from the traffic in this run"
            : "Estimated monthly cost at typical cloud list prices, from the clients' rates"
        }
      />
    </section>
  );
}

function Vital({
  label,
  value,
  unit,
  level = "ok",
  title,
}: {
  label: string;
  value: string | undefined;
  unit: string | undefined;
  level?: Level | undefined;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex items-baseline gap-2 border-line px-4 whitespace-nowrap not-first:border-l"
    >
      <span className="flex items-baseline gap-1.5">
        <LevelMark level={level} className="self-center" />
        <span
          data-vital={label}
          className={cx(
            "text-lg font-medium",
            value === undefined ? "text-fg-3" : LEVEL_TEXT[level],
          )}
        >
          {value ?? "—"}
          {value !== undefined && unit && (
            <span className="ml-0.5 text-xs font-normal text-fg-2">{unit}</span>
          )}
        </span>
      </span>
      <span className="text-xs text-fg-2">{label}</span>
    </div>
  );
}
