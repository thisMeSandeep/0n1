import { CircleIcon, HourglassMediumIcon, PowerIcon, TriangleIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { useLive } from "../simulation/index.ts";
import type { NodeLive, NodeStatus } from "../simulation/live.ts";
import { TREND_POINTS } from "../simulation/live.ts";
import { cx } from "../ui/cx.ts";
import { Sparkline } from "../ui/Sparkline.tsx";

/*
 * The live parts of a component on the canvas (UIUX §6). Each reads only
 * its own component's view from the live store, so a component re-renders
 * only when its own numbers change.
 */

const STATUS_WORD: Record<NodeStatus, string> = {
  healthy: "",
  busy: "Busy",
  failing: "Overloaded",
  down: "Down",
};

/** ▲ when busy, ● when failing (status is never colour alone). */
function StatusFlag({ status }: { status: NodeStatus }) {
  if (status === "busy") {
    return <TriangleIcon aria-hidden weight="fill" className="size-2 text-warn" />;
  }
  if (status === "failing") {
    return <CircleIcon aria-hidden weight="fill" className="size-2 text-fail" />;
  }
  return null;
}

function Unit({ children }: { children: string | undefined }) {
  if (!children) return null;
  return <span className="ml-0.5 text-xs font-normal text-fg-2">{children}</span>;
}

/** Rate and the detail number, or "Down since 01:52". Reserves its height so the card doesn't jump. */
export function LiveNumbers({ view }: { view: NodeLive }) {
  if (view.status === "down") {
    return (
      <div className="mt-3.5 flex h-5.5 items-center gap-1.5 text-sm text-fg-2">
        <PowerIcon aria-hidden className="size-3.5" />
        {view.downSince ? `Down since ${view.downSince}` : "Down"}
      </div>
    );
  }
  const { detail } = view;
  return (
    <div className="mt-3.5 flex h-5.5 items-baseline justify-between gap-3 whitespace-nowrap">
      <span className="text-md font-medium">
        {view.rate}
        <Unit>/s</Unit>
      </span>
      <span className="flex items-baseline gap-1 text-sm text-fg-2">
        <span className="self-center">
          <StatusFlag status={view.status} />
        </span>
        {STATUS_WORD[view.status] && <span className="sr-only">{STATUS_WORD[view.status]},</span>}
        {detail.label}
        {detail.value !== undefined && (
          <span
            className={cx(
              "ml-0.5 text-base font-medium",
              view.status === "failing" ? "text-fail" : "text-fg",
            )}
          >
            {detail.value}
            <Unit>{detail.unit}</Unit>
          </span>
        )}
      </span>
    </div>
  );
}

/** Utilization, as a bar with no number. */
export function UtilizationBar({ view }: { view: NodeLive | undefined }) {
  const status = view?.status ?? "healthy";
  const fill = status === "failing" ? "bg-fail" : status === "busy" ? "bg-warn" : "bg-fg-3";
  return (
    <div aria-hidden className="mt-3 h-0.75 overflow-hidden rounded-pill bg-line">
      <div
        className={cx(
          "h-full rounded-pill transition-[width,background-color] duration-(--duration-live) ease-linear",
          fill,
        )}
        style={{ width: `${(view?.utilization ?? 0) * 100}%` }}
      />
    </div>
  );
}

/** "● 3.4% errors", on the card's top edge. */
export function ErrorBadge({ view }: { view: NodeLive }) {
  return (
    <span
      className={cx(
        "absolute -top-2.25 right-3 z-10 inline-flex h-4.5 items-center gap-1 rounded-pill border bg-raised px-1.75",
        "border-[color-mix(in_srgb,var(--fail)_50%,var(--line))] text-xs font-medium text-fail",
      )}
    >
      <CircleIcon aria-hidden weight="fill" className="size-1.75" />
      {view.errors.value}
      {view.errors.unit} errors
    </span>
  );
}

/** "Slowed ×4": the chaos timeline (S40) is slowing it down. Top left, opposite the error badge. */
export function SlowedBadge({ factor }: { factor: number }) {
  return (
    <span
      className={cx(
        "absolute -top-2.25 left-3 z-10 inline-flex h-4.5 items-center gap-1 rounded-pill border bg-raised px-1.75",
        "border-[color-mix(in_srgb,var(--warn)_50%,var(--line))] text-xs font-medium text-warn",
      )}
    >
      <HourglassMediumIcon aria-hidden weight="fill" className="size-2.5" />
      Slowed ×{factor}
    </span>
  );
}

/** Far out: one mark beside the name for whatever needs attention. */
export function StatusMark({ status }: { status: NodeStatus }) {
  if (status === "healthy") return null;
  return (
    <span className="flex shrink-0 items-center" title={STATUS_WORD[status]}>
      {status === "down" ? (
        <PowerIcon aria-hidden className="size-4 text-fg-2" />
      ) : (
        <StatusFlag status={status} />
      )}
      <span className="sr-only">{STATUS_WORD[status]}</span>
    </span>
  );
}

/** Recent values of the component's detail number. */
export const NodeTrend = memo(function NodeTrend({
  nodeId,
  className,
}: {
  nodeId: string;
  className?: string;
}) {
  const trend = useLive((s) => s.trends[nodeId]);
  if (!trend) return null;
  return (
    <Sparkline
      values={trend.values}
      capacity={TREND_POINTS}
      label={`${trend.label}, recent values`}
      className={className}
    />
  );
});

/** Shown under a component while the pointer rests on it: errors, waiting in line, a sparkline. */
export function NodeHoverCard({ nodeId }: { nodeId: string }) {
  const view = useLive((s) => s.nodes[nodeId]);
  const trendLabel = useLive((s) => s.trends[nodeId]?.label);
  if (!view) return null;
  return (
    <div
      data-hovercard
      className={cx(
        "pointer-events-none absolute top-full left-0 mt-2 w-full rounded-control border border-line bg-raised px-3 py-2.5",
        "shadow-raised animate-fade-in",
      )}
    >
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-fg-2">Errors</dt>
          <dd className={cx("font-medium", view.hasErrors ? "text-fail" : "text-fg")}>
            {view.errors.value}
            <Unit>{view.errors.unit}</Unit>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-2">Waiting in line</dt>
          <dd className="font-medium text-fg">{view.waiting}</dd>
        </div>
      </dl>
      <p className="mt-2.5 mb-1 text-xs text-fg-2">{trendLabel}, recent</p>
      <NodeTrend nodeId={nodeId} className="text-fg-2" />
    </div>
  );
}
