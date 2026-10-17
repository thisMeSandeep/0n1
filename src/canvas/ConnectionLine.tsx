import { type ConnectionLineComponentProps, getBezierPath, getStraightPath } from "@xyflow/react";

/**
 * The line drawn while dragging a new connection: an accent curve while it
 * could land, a quiet dashed straight line over a component that can't take it.
 */
export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
  toNode,
}: ConnectionLineComponentProps) {
  // React Flow reports "invalid" only near a target's original handle dot. The
  // whole card is our drop zone, so being over any node that isn't valid counts.
  const invalid =
    connectionStatus === "invalid" || (toNode !== null && connectionStatus !== "valid");
  const [path] = invalid
    ? getStraightPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY })
    : getBezierPath({
        sourceX: fromX,
        sourceY: fromY,
        sourcePosition: fromPosition,
        targetX: toX,
        targetY: toY,
        targetPosition: toPosition,
      });
  return (
    <path
      d={path}
      fill="none"
      strokeLinecap="round"
      strokeWidth={invalid ? 1.5 : 2}
      strokeDasharray={invalid ? "4 5" : undefined}
      style={{ stroke: invalid ? "var(--text-3)" : "var(--accent)" }}
    />
  );
}
