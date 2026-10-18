import { CheckCircleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { formatClock, formatCompact, formatDuration, formatPercent } from "../simulation/format.ts";
import { useLive, useRunHistory } from "../simulation/index.ts";
import type { NodeLive, NodeStatus } from "../simulation/live.ts";
import { selectionStore, useDesign } from "../store/index.ts";
import { TimeChart } from "../ui/TimeChart.tsx";
import { InspectorSection } from "./InspectorHeader.tsx";
import { StatValue } from "./LiveSummary.tsx";

const ATTENTION: readonly NodeStatus[] = ["failing", "down", "busy"];

function attentionText(view: NodeLive): string {
  switch (view.status) {
    case "failing": {
      // Overloaded means full; a breaker or limiter failing calls on purpose isn't.
      const what =
        view.detail.label === "open" ? "Open" : view.utilization > 0.9 ? "Overloaded" : "Failing";
      return view.hasErrors ? `${what} · ${view.errors.value}% errors` : what;
    }
    case "down":
      return view.downSince ? `Down since ${view.downSince}` : "Down";
    case "busy":
      return "Busy";
    case "healthy":
      return "";
  }
}

/** Which components need attention, worst first; each one can be selected. */
export function HealthSummary() {
  const nodes = useLive((s) => s.nodes);
  const docNodes = useDesign((s) => s.doc.nodes);
  const needing = docNodes
    .filter((n) => nodes[n.id] && nodes[n.id]?.status !== "healthy")
    .sort(
      (a, b) =>
        ATTENTION.indexOf(nodes[a.id]?.status as NodeStatus) -
        ATTENTION.indexOf(nodes[b.id]?.status as NodeStatus),
    );

  return (
    <InspectorSection title="Health">
      {needing.length === 0 ? (
        <p className="flex items-center gap-2 text-base text-fg">
          <CheckCircleIcon aria-hidden className="size-4.5 text-fg-2" />
          All {docNodes.length} components are coping.
        </p>
      ) : (
        <ul aria-label="Needs attention" className="-mx-2 flex flex-col">
          {needing.map((node) => {
            const view = nodes[node.id] as NodeLive;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() =>
                    selectionStore.getState().select({ nodeIds: [node.id], edgeIds: [] })
                  }
                  className="flex w-full items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-left hover:bg-fg/6"
                >
                  <span className="truncate text-base text-fg">{node.name}</span>
                  <span
                    className={
                      view.status === "failing"
                        ? "shrink-0 text-sm text-fail"
                        : view.status === "busy"
                          ? "shrink-0 text-sm text-warn"
                          : "shrink-0 text-sm text-fg-2"
                    }
                  >
                    {attentionText(view)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </InspectorSection>
  );
}

/** Each client: what it sends and what its users get back. */
export function ClientTraffic() {
  const docNodes = useDesign((s) => s.doc.nodes);
  const clients = useMemo(() => docNodes.filter((n) => n.type === "client"), [docNodes]);
  const metrics = useLive((s) => s.snapshot?.nodes);
  if (clients.length === 0 || !metrics) return null;
  return (
    <InspectorSection title="Traffic">
      {clients.map((client) => {
        const m = metrics[client.id];
        if (!m) return null;
        return (
          <section key={client.id} aria-label={`Traffic from ${client.name}`}>
            <p className="mb-2 truncate text-sm text-fg">{client.name}</p>
            <div className="grid grid-cols-3 gap-3">
              <StatValue label="Sent" measure={{ value: formatCompact(m.arrivals), unit: "/s" }} />
              <StatValue label="p99" measure={m.latency ? formatDuration(m.latency.p99) : null} />
              <StatValue label="Errors" measure={formatPercent(m.errorRate)} />
            </div>
          </section>
        );
      })}
    </InspectorSection>
  );
}

const clock = (seconds: number) => formatClock(seconds * 1000);
const perSecond = (n: number) => `${formatCompact(n)}/s`;
const duration = (ms: number) => {
  const { value, unit } = formatDuration(ms);
  return `${value} ${unit}`;
};
const percent = (n: number) => `${formatCompact(n)}%`;

/** Throughput, p99 and errors over time, as users see them. Neutral lines: colour means status. */
export function SystemCharts() {
  const time = useRunHistory((s) => s.time);
  const throughput = useRunHistory((s) => s.throughput);
  const p99 = useRunHistory((s) => s.p99);
  const errors = useRunHistory((s) => s.errors);
  if (time.length === 0) return null;
  return (
    <InspectorSection title="Over time">
      <TimeChart
        title="Throughput"
        label="Throughput over time"
        time={time}
        values={throughput}
        color="--text-2"
        format={perSecond}
        formatTime={clock}
      />
      <TimeChart
        title="p99"
        label="p99 over time"
        time={time}
        values={p99}
        color="--text-2"
        format={duration}
        formatTime={clock}
      />
      <TimeChart
        title="Errors"
        label="Errors over time"
        time={time}
        values={errors}
        color="--text-2"
        format={percent}
        formatTime={clock}
      />
    </InspectorSection>
  );
}
