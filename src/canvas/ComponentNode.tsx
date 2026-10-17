import { LinkBreakIcon } from "@phosphor-icons/react";
import { Handle, type NodeProps, Position, useConnection, useStore } from "@xyflow/react";
import { memo, useEffect, useMemo, useState } from "react";
import { registry } from "../components/index.ts";
import { checkConnection } from "../model/connections.ts";
import { useLive } from "../simulation/index.ts";
import { designStore } from "../store/index.ts";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import type { ComponentFlowNode } from "./flow.ts";
import {
  ErrorBadge,
  LiveNumbers,
  NodeHoverCard,
  NodeTrend,
  StatusMark,
  UtilizationBar,
} from "./NodeLive.tsx";

/** Semantic zoom (UIUX §6): far out shows only icon, name and a status mark; close up adds a sparkline. */
export type ZoomLevel = "far" | "normal" | "near";
export const FAR_ZOOM = 0.5;
export const NEAR_ZOOM = 1.3;

export function zoomLevel(zoom: number): ZoomLevel {
  return zoom < FAR_ZOOM ? "far" : zoom > NEAR_ZOOM ? "near" : "normal";
}

/** How long the pointer rests on a component before its details show. */
const HOVER_DELAY_MS = 400;

/**
 * A component on the canvas (UIUX §6): icon and name; while running, its
 * rate, detail number (p99, hit ratio…), utilization bar and state.
 *
 * While a connection is being dragged, other components show whether they
 * can take it: valid targets get an accent ring, invalid ones fade and
 * explain why when the pointer is over them.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<ComponentFlowNode>) {
  const definition = registry.get(data.type);
  const Icon = componentIcon(definition?.icon ?? "");
  // The type, when the name doesn't already say it ("Links DB" · Database).
  const typeLabel =
    definition && definition.displayName !== data.name ? definition.displayName : null;

  const view = useLive((s) => s.nodes[id]);
  const started = useLive((s) => s.started);
  const zoom = useStore((s) => zoomLevel(s.transform[2]));
  const status = view?.status ?? "healthy";

  // Primitive selectors: re-render only when the drag starts, ends, or moves onto/off a node.
  const fromId = useConnection((c) => (c.inProgress ? c.fromNode.id : null));
  const overId = useConnection((c) => (c.inProgress ? (c.toNode?.id ?? null) : null));
  const isTargetCandidate = fromId !== null && fromId !== id;
  const check = useMemo(
    () =>
      isTargetCandidate ? checkConnection(designStore.getState().doc, registry, fromId, id) : null,
    [isTargetCandidate, fromId, id],
  );
  const hovered = overId === id;
  const details = useHoverDetails(started && !dragging && fromId === null);
  const ring =
    selected || (check?.ok && hovered)
      ? "outline-accent"
      : check?.ok
        ? "outline-accent/40"
        : "outline-transparent";

  return (
    <div className="relative" {...details.handlers}>
      <div
        data-card
        data-status={view ? status : undefined}
        className={cx(
          "w-52 rounded-card border bg-raised px-4 py-3.5 text-fg outline-2 outline-offset-2",
          "transition-[outline-color,opacity,border-color,filter] duration-(--duration-fast)",
          status === "down"
            ? "border-dashed border-line-strong opacity-60 grayscale"
            : status === "failing"
              ? "border-[color-mix(in_srgb,var(--fail)_55%,var(--line))]"
              : data.hint
                ? "border-dashed border-line-strong"
                : "border-line",
          ring,
          check && !check.ok && "opacity-45",
        )}
      >
        <Handle
          type="target"
          position={Position.Left}
          // During a connection drag the whole card accepts the drop, not just the edge dot.
          className={cx("handle handle-target", isTargetCandidate && "handle-target-active")}
        />
        <div className="flex items-center gap-2.5">
          <Icon
            aria-hidden
            weight="duotone"
            className={cx("size-5 shrink-0", definition && CATEGORY_TINT[definition.category])}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{data.name}</span>
          {zoom === "far" && <StatusMark status={status} />}
          {data.hint && (
            <Tooltip content={data.hint}>
              <button
                type="button"
                aria-label={data.hint}
                className="nodrag -mr-1 grid size-6 shrink-0 place-items-center rounded-control text-fg-3 hover:text-fg-2"
              >
                <LinkBreakIcon aria-hidden className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
        {zoom !== "far" && (
          <>
            {view ? (
              <LiveNumbers view={view} />
            ) : typeLabel ? (
              <p className="mt-3.5 flex h-5.5 items-center truncate text-sm text-fg-2">
                {typeLabel}
              </p>
            ) : (
              // Where the numbers will be, so starting a run doesn't resize the card.
              <div aria-hidden className="mt-3.5 h-5.5" />
            )}
            <UtilizationBar view={view} />
            {zoom === "near" && view && <NodeTrend nodeId={id} className="mt-3 text-fg-3" />}
          </>
        )}
        {definition && definition.connections.outgoing.length > 0 && (
          <Handle type="source" position={Position.Right} className="handle handle-source" />
        )}
      </div>
      {/* After the card, so it's read after the name. */}
      {view?.hasErrors && zoom !== "far" && <ErrorBadge view={view} />}
      {details.open && <NodeHoverCard nodeId={id} />}
      {/* Outside the card so it doesn't fade with it. */}
      {check && !check.ok && hovered && (
        <p
          role="status"
          className="absolute bottom-full left-0 mb-2 w-max max-w-64 rounded-control border border-line bg-raised px-2.5 py-1.5 text-sm text-fg shadow-raised"
        >
          {check.reason}
        </p>
      )}
    </div>
  );
});

/** Open after the pointer has rested a moment; closed whenever it isn't allowed. */
function useHoverDetails(allowed: boolean) {
  const [resting, setResting] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!resting || !allowed) {
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [resting, allowed]);
  return {
    open: open && allowed,
    handlers: {
      onPointerEnter: () => setResting(true),
      onPointerLeave: () => setResting(false),
    },
  };
}
