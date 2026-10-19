import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { designStore } from "../store/index.ts";
import { tidyLayout } from "./tidy.ts";
import { useViewActions } from "./useViewActions.ts";

/** Frames to wait for the canvas to take the new positions before fitting anyway. */
const FIT_WAIT_FRAMES = 10;

/** Tidy the open system's layout (M06), as one undo step, then fit it in view. Inside the ReactFlowProvider. */
export function useTidyLayout() {
  const { fitView } = useViewActions();
  const { getNode } = useReactFlow();
  return useCallback(() => {
    const design = designStore.getState();
    const positions = tidyLayout(design.doc.nodes, design.doc.edges);
    design.moveNodes([...positions].map(([id, position]) => ({ id, position })));
    // The canvas takes the new positions a render or two later; fit once it has them.
    const [id, target] = [...positions][0] ?? [];
    let frames = 0;
    const fitWhenPlaced = () => {
      const placed = id && target ? getNode(id)?.position : undefined;
      const ready = !placed || (placed.x === target?.x && placed.y === target?.y);
      if (ready || ++frames >= FIT_WAIT_FRAMES) fitView();
      else requestAnimationFrame(fitWhenPlaced);
    };
    requestAnimationFrame(fitWhenPlaced);
  }, [fitView, getNode]);
}
