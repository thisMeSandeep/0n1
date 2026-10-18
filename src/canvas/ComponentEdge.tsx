import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLive } from "../simulation/index.ts";
import type { EdgeLive, EdgeStatus } from "../simulation/live.ts";
import { useTracedLink } from "../tracing/TraceViews.tsx";
import { cx } from "../ui/cx.ts";
import { usePrefersReducedMotion } from "../ui/hooks/useMediaQuery.ts";
import type { ComponentFlowEdge } from "./flow.ts";
import { addTrack, type FlowTrack, placeDots, samplePath } from "./flowDots.ts";

/** How long the pointer rests on a connection before its label shows. */
const HOVER_DELAY_MS = 150;

const STROKE: Record<EdgeStatus, string> = {
  idle: "var(--edge)",
  healthy: "var(--edge)",
  warn: "var(--warn)",
  fail: "var(--fail)",
  down: "var(--edge)",
  cut: "var(--fail)",
};

/**
 * A connection (UIUX §6): a soft curve, neutral at rest. While running it
 * grows with throughput, turns amber or red when requests on it fail, goes
 * dashed when either end is down, and carries flow dots.
 */
export const ComponentEdge = memo(function ComponentEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps<ComponentFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const view = useLive((s) => s.edges[id]);
  // A request trace is open (S42): the connections it used light up.
  const traced = useTracedLink(source, target);
  const reducedMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  useEffect(() => {
    if (!hovered) {
      setLabelOpen(false);
      return;
    }
    const timer = setTimeout(() => setLabelOpen(true), HOVER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hovered]);

  const status = view?.status ?? "idle";
  const width = view?.width ?? 1.5;
  const tinted = status === "warn" || status === "fail" || status === "cut";

  return (
    <g
      data-edge-status={view ? status : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        style={{
          stroke: selected || traced ? "var(--accent)" : STROKE[status],
          strokeWidth: selected || traced ? Math.max(2, width) : width,
          strokeOpacity:
            traced === false
              ? 0.25
              : selected || traced
                ? 1
                : tinted
                  ? 0.55
                  : status === "down"
                    ? 0.6
                    : 1,
          // Down: a dead end. Cut (chaos timeline): broken right through.
          strokeDasharray: status === "down" ? "4 6" : status === "cut" ? "2 6" : undefined,
          strokeLinecap: "round",
          transition:
            "stroke var(--duration-fast) ease-out, stroke-width var(--duration-live) linear",
        }}
      />
      {view && view.dots > 0 && !reducedMotion && (
        <FlowDots path={path} count={view.dots} failing={status === "fail"} />
      )}
      {view && labelOpen && <EdgeLabel view={view} x={labelX} y={labelY} />}
    </g>
  );
});

/** Dots that travel along the connection while the system runs (see flowDots.ts). */
function FlowDots({ path, count, failing }: { path: string; count: number; failing: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const track = useRef<FlowTrack>({ offset: 0, points: new Float32Array(), length: 0, dots: [] });

  // Re-sample when the shape changes (a component moved), keeping the dots' place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect reads the new shape from the DOM.
  useLayoutEffect(() => {
    const element = pathRef.current;
    if (!element) return;
    Object.assign(track.current, samplePath(element));
    track.current.dots = dotsRef.current.slice(0, count).filter((d) => d !== null);
    placeDots(track.current);
  }, [path, count]);

  useEffect(() => addTrack(track.current), []);

  return (
    <g aria-hidden className="pointer-events-none">
      <path ref={pathRef} d={path} fill="none" stroke="none" />
      {Array.from({ length: count }, (_, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are interchangeable; the index is their slot.
          key={i}
          ref={(element) => {
            dotsRef.current[i] = element;
          }}
          r={2.6}
          className={cx(failing ? "fill-fail" : "fill-flow")}
        />
      ))}
    </g>
  );
}

/** "1.48k/s · p99 84 ms · 0.3% errors", at the middle of the connection. */
function EdgeLabel({ view, x, y }: { view: EdgeLive; x: number; y: number }) {
  return (
    <EdgeLabelRenderer>
      <div
        data-edge-label
        className={cx(
          "pointer-events-none absolute flex items-baseline gap-2 whitespace-nowrap rounded-control border border-line",
          "bg-raised px-2.5 py-1 text-sm text-fg shadow-raised animate-fade-in",
        )}
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      >
        {view.status === "cut" && <span className="font-medium text-fail">Cut</span>}
        <span>
          <span className="font-medium">{view.rate}</span>
          <span className="ml-0.5 text-xs text-fg-2">/s</span>
        </span>
        {view.latency && (
          <span className="text-fg-2">
            p99 <span className="font-medium text-fg">{view.latency.value}</span>
            <span className="ml-0.5 text-xs">{view.latency.unit}</span>
          </span>
        )}
        <span
          className={
            view.status === "fail" || view.status === "cut"
              ? "text-fail"
              : view.status === "warn"
                ? "text-warn"
                : "text-fg-2"
          }
        >
          {view.errors.value}
          {view.errors.unit} errors
        </span>
      </div>
    </EdgeLabelRenderer>
  );
}
