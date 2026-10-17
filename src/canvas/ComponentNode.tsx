import { LinkBreakIcon } from "@phosphor-icons/react";
import { Handle, type NodeProps, Position, useConnection } from "@xyflow/react";
import { memo, useMemo } from "react";
import { registry } from "../components/index.ts";
import { checkConnection } from "../model/connections.ts";
import { designStore } from "../store/index.ts";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import type { ComponentFlowNode } from "./flow.ts";

/**
 * A component on the canvas (UIUX §6). Static for now: icon, name and type.
 * Live numbers and the utilization bar fill in from S30.
 *
 * While a connection is being dragged, other components show whether they
 * can take it: valid targets get an accent ring, invalid ones fade and
 * explain why when the pointer is over them.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
  selected,
}: NodeProps<ComponentFlowNode>) {
  const definition = registry.get(data.type);
  const Icon = componentIcon(definition?.icon ?? "");
  const typeLabel =
    definition && definition.displayName !== data.name ? definition.displayName : null;

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
  const ring =
    selected || (check?.ok && hovered)
      ? "outline-accent"
      : check?.ok
        ? "outline-accent/40"
        : "outline-transparent";

  return (
    <div className="relative">
      <div
        data-card
        className={cx(
          "w-52 rounded-card border bg-raised px-4 py-3.5 text-fg outline-2 outline-offset-2",
          "transition-[outline-color,opacity] duration-(--duration-fast)",
          data.hint ? "border-dashed border-line-strong" : "border-line",
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
        {typeLabel && <p className="mt-1 pl-7.5 text-sm text-fg-2">{typeLabel}</p>}
        <div aria-hidden className="mt-3.5 h-0.75 rounded-pill bg-line" />
        {definition && definition.connections.outgoing.length > 0 && (
          <Handle type="source" position={Position.Right} className="handle handle-source" />
        )}
      </div>
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
