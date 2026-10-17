import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import type { Position } from "../model/document.ts";
import { designStore, selectionStore } from "../store/index.ts";
import { centredAt, findFreeSpot } from "./placement.ts";

/**
 * Add components to the canvas and select them. Must be used inside the
 * lab's ReactFlowProvider.
 */
export function useAddComponent() {
  const { screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi();

  const addAt = useCallback((type: string, position: Position) => {
    const id = designStore.getState().addNode(type, position);
    selectionStore.getState().select({ nodeIds: [id], edgeIds: [] });
    return id;
  }, []);

  /** In the middle of the visible canvas, nudged so it doesn't cover another component. */
  const addAtCentre = useCallback(
    (type: string) => {
      const rect = flowStore.getState().domNode?.getBoundingClientRect();
      const centre = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      const occupied = designStore.getState().doc.nodes.map((n) => n.position);
      return addAt(type, findFreeSpot(centredAt(centre), occupied));
    },
    [addAt, flowStore, screenToFlowPosition],
  );

  /** Exactly where it was dropped (screen coordinates). */
  const addAtScreenPoint = useCallback(
    (type: string, point: Position) => addAt(type, centredAt(screenToFlowPosition(point))),
    [addAt, screenToFlowPosition],
  );

  return { addAtCentre, addAtScreenPoint };
}
