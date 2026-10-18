import { ArrowLeftIcon, PathIcon } from "@phosphor-icons/react";
import type { TraceReason, TraceRecord } from "../engine/runtime/trace.ts";
import { InspectorHeader, InspectorSection } from "../inspector/InspectorHeader.tsx";
import { formatClock, formatDuration } from "../simulation/format.ts";
import { simulation } from "../simulation/index.ts";
import { useSimulation } from "../simulation/store.ts";
import { uiStore, useDesign, useUi } from "../store/index.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { tracedLinks, type WaterfallRow, waterfall } from "./waterfall.ts";

/*
 * Request tracing in the lab (S42): the list of traces in the system view,
 * the waterfall in the inspector, and the traced path lit up on the canvas.
 */

const REASON: Readonly<Record<TraceReason, string>> = {
  asked: "Traced",
  slow: "Slowest lately",
  failed: "Failed",
};

const OUTCOME: Readonly<Record<string, string>> = {
  ok: "answered",
  timeout: "timed out",
  rejected: "turned away",
  error: "failed",
  unavailable: "couldn't reach",
};

const ms = (value: number) => {
  const { value: v, unit } = formatDuration(value);
  return `${v} ${unit}`;
};

const open = (trace: TraceRecord | null) => uiStore.getState().setOpenTrace(trace);

/** Names for a trace's components; ones since deleted show as "a removed component". */
function useNames(): (id: string) => string {
  const nodes = useDesign((s) => s.doc.nodes);
  return (id) => nodes.find((n) => n.id === id)?.name ?? "a removed component";
}

/** "Trace a request", and the run's traces, newest first (system view). */
export function TracesSection() {
  const traces = useSimulation((s) => s.traces);
  const pending = useSimulation((s) => s.tracesPending);
  const name = useNames();
  return (
    <InspectorSection title="Traces">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => simulation.trace()}>
            <PathIcon />
            Trace a request
          </Button>
          {pending > 0 && (
            <span role="status" className="text-sm text-fg-2">
              Following the next request…
            </span>
          )}
        </div>
        {traces.length > 0 && (
          <ul aria-label="Traces" className="-mx-2 flex flex-col">
            {traces.map((trace) => (
              <li key={trace.id}>
                <button
                  type="button"
                  onClick={() => open(trace)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-left hover:bg-fg/6"
                >
                  <span className="min-w-0 truncate text-sm text-fg">
                    <span className={trace.outcome === "ok" ? "text-fg-2" : "text-fail"}>
                      {REASON[trace.reason]}
                    </span>{" "}
                    · {name(trace.client)} · {trace.kind} at {formatClock(trace.startedAt)}
                  </span>
                  <span
                    className={cx(
                      "shrink-0 text-sm",
                      trace.outcome === "ok" ? "text-fg-2" : "text-fail",
                    )}
                  >
                    {ms(trace.finishedAt - trace.startedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InspectorSection>
  );
}

/** One trace as a waterfall, in the inspector. */
export function TraceView({ trace, onClose }: { trace: TraceRecord; onClose: () => void }) {
  const name = useNames();
  const rows = waterfall(trace);
  const took = trace.finishedAt - trace.startedAt;
  return (
    <>
      <InspectorHeader
        icon={<PathIcon aria-hidden className="size-4.5 text-fg-2" />}
        title={<h2 className="px-1.5 text-md leading-7 font-semibold">Request trace</h2>}
        subtitle={`${name(trace.client)} · ${trace.kind} at ${formatClock(trace.startedAt)}`}
        actions={
          <IconButton label="Back to the system" onClick={() => open(null)}>
            <ArrowLeftIcon />
          </IconButton>
        }
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <p className="pt-4 text-base text-fg">
          {trace.outcome === "ok" ? "Answered" : `It ${OUTCOME[trace.outcome] ?? "failed"}`} after{" "}
          <span className="font-medium">{ms(took)}</span>
          {trace.outcome === "timeout" ? ": the client gave up." : "."}
        </p>
        <ol aria-label="Hops" className="mt-5 flex flex-col gap-1.5">
          {rows.map((row) => (
            <HopRow key={row.span.id} row={row} name={name(row.span.node)} />
          ))}
        </ol>
        <Legend />
      </div>
    </>
  );
}

function describe(row: WaterfallRow, name: string): string {
  const parts = [row.depth > 0 ? `${name} (${row.span.op})` : name];
  if (row.span.attempt > 1) parts.push(`try ${row.span.attempt}`);
  if (row.waited !== null && row.waited > 0.05) parts.push(`waited ${ms(row.waited)} in line`);
  if (row.worked !== null && row.worked > 0.05) parts.push(`busy ${ms(row.worked)}`);
  parts.push(
    row.unfinished
      ? "still working when the trace ended"
      : `${OUTCOME[row.span.outcome ?? "ok"] ?? "failed"} after ${ms(row.total)}`,
  );
  return parts.join(", ");
}

function HopRow({ row, name }: { row: WaterfallRow; name: string }) {
  const failed = row.span.outcome !== null && row.span.outcome !== "ok";
  const pct = (x: number) => `${Math.max(0, Math.min(1, x)) * 100}%`;
  const text = describe(row, name);
  return (
    <li aria-label={text}>
      <Tooltip content={text}>
        <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2" tabIndex={-1}>
          <span
            className="flex min-w-0 items-baseline gap-1 truncate text-sm text-fg"
            style={{ paddingLeft: `${row.depth * 0.6}rem` }}
          >
            <span className="truncate">{name}</span>
            {row.depth > 0 && <span className="shrink-0 text-xs text-fg-2">{row.span.op}</span>}
            {row.span.attempt > 1 && (
              <span className="shrink-0 text-xs text-fg-2">try {row.span.attempt}</span>
            )}
          </span>
          <span aria-hidden className="relative h-4">
            {/* The whole hop: from being sent to the answer getting back. */}
            <span
              className={cx(
                "absolute top-1/2 h-px -translate-y-1/2",
                row.unfinished ? "border-t border-dashed border-fg-3" : "bg-fg-3",
              )}
              style={{ left: pct(row.start), width: pct(row.end - row.start) }}
            />
            {row.waiting && (
              <span
                className="absolute top-0.5 h-3 rounded-kbd bg-[repeating-linear-gradient(135deg,var(--text-3)_0_2px,transparent_2px_5px)] opacity-70"
                style={{
                  left: pct(row.waiting.start),
                  width: `max(2px, ${pct(row.waiting.end - row.waiting.start)})`,
                }}
              />
            )}
            {row.working.map((part) => (
              <span
                key={part.start}
                className={cx("absolute top-0.5 h-3 rounded-kbd", failed ? "bg-fail" : "bg-fg-2")}
                style={{
                  left: pct(part.start),
                  width: `max(2px, ${pct(part.end - part.start)})`,
                }}
              />
            ))}
            {failed && row.working.length === 0 && (
              // Failed without doing any work of its own (refused, or cut): mark where.
              <span
                className="absolute top-0.5 h-3 w-0.5 rounded-kbd bg-fail"
                style={{ left: pct(row.end) }}
              />
            )}
          </span>
        </div>
      </Tooltip>
    </li>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Key"
      className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-4 text-xs text-fg-2"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-4 rounded-kbd bg-fg-2" /> Busy with it
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2.5 w-4 rounded-kbd bg-[repeating-linear-gradient(135deg,var(--text-3)_0_2px,transparent_2px_5px)]"
        />{" "}
        Waiting in line
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-px w-4 bg-fg-3" /> Network, or waiting on the next
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-4 rounded-kbd bg-fail" /> Failed
      </li>
    </ul>
  );
}

/** While a trace is open: true for components on its path, false for the rest; null otherwise. */
export function useTracedNode(id: string): boolean | null {
  return useUi((s) => (s.openTrace ? s.openTrace.spans.some((span) => span.node === id) : null));
}

/** The same for a connection. */
export function useTracedLink(source: string, target: string): boolean | null {
  return useUi((s) => (s.openTrace ? tracedLinks(s.openTrace).has(`${source}→${target}`) : null));
}
