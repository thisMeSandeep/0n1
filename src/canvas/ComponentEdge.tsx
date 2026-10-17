import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import type { ComponentFlowEdge } from "./flow.ts";

/** A connection: a soft curve, 1.5px, neutral (UIUX §6). Live states arrive in S31. */
export const ComponentEdge = memo(function ComponentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps<ComponentFlowEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={16}
      style={{
        stroke: selected ? "var(--accent)" : "var(--edge)",
        strokeWidth: selected ? 2 : 1.5,
        transition: "stroke var(--duration-fast) ease-out",
      }}
    />
  );
});
