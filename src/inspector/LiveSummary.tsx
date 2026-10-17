import type { NodeMetrics } from "../engine/metrics/recorder.ts";
import type { LiveDetail } from "../model/component.ts";
import {
  formatCompact,
  formatDuration,
  formatPercent,
  type Measure,
} from "../simulation/format.ts";
import { useLive } from "../simulation/index.ts";
import {
  type Level,
  levelOf,
  type NodeLive,
  SYSTEM_ERRORS_FAIL,
  SYSTEM_ERRORS_WARN,
  SYSTEM_P99_FAIL_MS,
  SYSTEM_P99_WARN_MS,
  TREND_POINTS,
} from "../simulation/live.ts";
import { CollapsibleSection } from "../ui/Collapsible.tsx";
import { cx } from "../ui/cx.ts";
import { LEVEL_TEXT, LevelMark } from "../ui/LevelMark.tsx";
import { Sparkline } from "../ui/Sparkline.tsx";

export type Stat = { label: string; measure: Measure | null; level?: Level };

/** One number with its label, unit, and level. */
export function StatValue({ label, measure, level = "ok" }: Stat) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-fg-2">{label}</div>
      <div className={cx("flex items-baseline gap-1.5 text-md font-medium", LEVEL_TEXT[level])}>
        <LevelMark level={level} className="self-center" />
        <span data-stat={label}>
          {measure?.value ?? "—"}
          {measure?.unit && (
            <span className="ml-0.5 text-xs font-normal text-fg-2">{measure.unit}</span>
          )}
        </span>
      </div>
    </div>
  );
}

const rate = (perSecond: number): Measure => ({ value: formatCompact(perSecond), unit: "/s" });
const latency = (m: NodeMetrics, quantile: "p50" | "p95" | "p99") =>
  m.latency ? formatDuration(m.latency[quantile]) : null;

/** The three numbers that matter most for a kind of component (UIUX §7). */
export function summaryStats(m: NodeMetrics, view: NodeLive, detail: LiveDetail): Stat[] {
  const failing: Level = view.status === "failing" ? "fail" : "ok";
  const busy: Level = view.status === "failing" ? "fail" : view.status === "busy" ? "warn" : "ok";
  const busyStat = (label: string): Stat => ({
    label,
    measure: formatPercent(m.utilization),
    level: busy,
  });
  switch (detail) {
    case "sent": {
      const p99 = m.latency?.p99;
      return [
        { label: "Sent", measure: rate(m.arrivals) },
        {
          label: "p99",
          measure: latency(m, "p99"),
          level: p99 === undefined ? "ok" : levelOf(p99, SYSTEM_P99_WARN_MS, SYSTEM_P99_FAIL_MS),
        },
        {
          label: "Errors",
          measure: formatPercent(m.errorRate),
          level: levelOf(m.errorRate, SYSTEM_ERRORS_WARN, SYSTEM_ERRORS_FAIL),
        },
      ];
    }
    case "hit":
      return [
        { label: "Throughput", measure: rate(m.throughput) },
        { label: "Hit ratio", measure: m.hitRatio == null ? null : formatPercent(m.hitRatio) },
        busyStat("Busy"),
      ];
    case "waiting":
      return [
        { label: "Throughput", measure: rate(m.throughput) },
        { label: "Waiting", measure: { value: formatCompact(m.waiting), unit: "" } },
        busyStat("Full"),
      ];
    case "p99":
      return [
        { label: "Throughput", measure: rate(m.throughput) },
        { label: "p99", measure: latency(m, "p99"), level: failing },
        busyStat("Busy"),
      ];
  }
}

/**
 * Sticky at the top of the component view while a run is loaded (UIUX §7):
 * three numbers and a sparkline, so every settings change shows its effect.
 */
export function LiveSummary({ nodeId, detail }: { nodeId: string; detail: LiveDetail }) {
  const view = useLive((s) => s.nodes[nodeId]);
  const metrics = useLive((s) => s.snapshot?.nodes[nodeId]);
  const trend = useLive((s) => s.trends[nodeId]);
  if (!view || !metrics) return null;

  if (view.status === "down") {
    return (
      <section aria-label="Live summary" className="mx-5 border-b border-line pt-2 pb-4">
        <p className="text-base text-fg-2">
          {view.downSince ? `Down since ${view.downSince}.` : "Down."} Bring it back from the ⋯ menu
          or press K.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Live summary" className="mx-5 border-b border-line pt-2 pb-4">
      <div className="grid grid-cols-3 gap-3">
        {summaryStats(metrics, view, detail).map((stat) => (
          <StatValue key={stat.label} {...stat} />
        ))}
      </div>
      {trend && (
        <div className="mt-3">
          <Sparkline
            values={trend.values}
            capacity={TREND_POINTS}
            label={`${trend.label}, recent values`}
            className={cx("h-9", view.status === "failing" ? "text-fail" : "text-fg-2")}
          />
        </div>
      )}
    </section>
  );
}

/** Every number for a component, as of the last update (UIUX §7, Details). */
export function detailRows(m: NodeMetrics): [string, string][] {
  const show = (measure: Measure | null) =>
    measure ? `${measure.value}${measure.unit === "" ? "" : ` ${measure.unit}`}` : "—";
  const perSecond = (n: number) => `${formatCompact(n)}/s`;
  const rows: [string, string][] = [
    ["In flight", formatCompact(m.inFlight)],
    ["Waiting in line", formatCompact(m.waiting)],
    ["Arriving", perSecond(m.arrivals)],
    ["Finishing", perSecond(m.throughput)],
    ["Turned away", perSecond(m.drops)],
    ["Busy", show(formatPercent(m.utilization))],
    ["p50", show(latency(m, "p50"))],
    ["p95", show(latency(m, "p95"))],
    ["p99", show(latency(m, "p99"))],
    ["Failed responses", show(formatPercent(m.errorRate))],
    ["Failed here", show(formatPercent(m.arrivals > 0 ? Math.min(1, m.failures / m.arrivals) : 0))],
  ];
  if (m.hitRatio !== undefined) {
    rows.push(["Hit ratio", show(m.hitRatio === null ? null : formatPercent(m.hitRatio))]);
  }
  if (m.staleReads !== undefined) {
    rows.push(["Stale reads", show(m.staleReads === null ? null : formatPercent(m.staleReads))]);
  }
  if (m.oldestJobAge !== undefined) {
    rows.push([
      "Oldest job",
      show(m.oldestJobAge === null ? null : formatDuration(m.oldestJobAge)),
    ]);
  }
  rows.push(
    ["Total arrived", formatCompact(m.totals.arrived)],
    ["Total finished", formatCompact(m.totals.completed)],
    ["Total failed", formatCompact(m.totals.failed)],
    ["Total turned away", formatCompact(m.totals.dropped)],
  );
  return rows;
}

/** The full metric list, collapsed by default. */
export function ComponentDetails({ nodeId }: { nodeId: string }) {
  const metrics = useLive((s) => s.snapshot?.nodes[nodeId]);
  if (!metrics) return null;
  return (
    <section className="pt-6">
      <CollapsibleSection title="Details" defaultOpen={false}>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          {detailRows(metrics).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-fg-2">{label}</dt>
              <dd className="text-right text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleSection>
    </section>
  );
}
