import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { registry } from "../components/index.ts";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import type { ComponentFlowNode } from "./flow.ts";

/**
 * A component on the canvas (UIUX §6). Static for now: icon, name and type.
 * Live numbers and the utilization bar fill in from S30.
 */
export const ComponentNode = memo(function ComponentNode({
  data,
  selected,
}: NodeProps<ComponentFlowNode>) {
  const definition = registry.get(data.type);
  const Icon = componentIcon(definition?.icon ?? "");
  const typeLabel =
    definition && definition.displayName !== data.name ? definition.displayName : null;

  return (
    <div
      className={cx(
        "w-52 rounded-card border border-line bg-raised px-4 py-3.5 text-fg",
        "transition-[outline-color] duration-(--duration-fast)",
        selected ? "outline-2 outline-offset-2 outline-accent" : "outline-transparent",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="handle" />
      <div className="flex items-center gap-2.5">
        <Icon
          aria-hidden
          weight="duotone"
          className={cx("size-5 shrink-0", definition && CATEGORY_TINT[definition.category])}
        />
        <span className="truncate font-medium">{data.name}</span>
      </div>
      {typeLabel && <p className="mt-1 pl-7.5 text-sm text-fg-2">{typeLabel}</p>}
      <div aria-hidden className="mt-3.5 h-0.75 rounded-pill bg-line" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="handle" />
    </div>
  );
});
