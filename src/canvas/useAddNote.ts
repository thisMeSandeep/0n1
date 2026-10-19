import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import type { Position } from "../model/document.ts";
import { designStore, selectionStore, uiStore } from "../store/index.ts";
import { NOTE_WIDTH } from "./NoteNode.tsx";
import { findFreeSpot, snap } from "./placement.ts";

/** Add a sticky note (M04), selected and ready to write in. Must be used inside the ReactFlowProvider. */
export function useAddNote() {
  const { screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi();

  const addAt = useCallback((position: Position) => {
    const id = designStore.getState().addNote({ x: snap(position.x), y: snap(position.y) });
    selectionStore.getState().select({ nodeIds: [id], edgeIds: [] });
    uiStore.getState().setEditingNote(id);
    return id;
  }, []);

  /** Its top-left corner at a point on screen, e.g. where the canvas was right-clicked. */
  const addNoteAt = useCallback(
    (screen: Position) => addAt(screenToFlowPosition(screen)),
    [addAt, screenToFlowPosition],
  );

  /** In the middle of the visible canvas, nudged so it doesn't cover something else. */
  const addNoteAtCentre = useCallback(() => {
    const rect = flowStore.getState().domNode?.getBoundingClientRect();
    const centre = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const { nodes, notes = [] } = designStore.getState().doc;
    const occupied = [...nodes, ...notes].map((n) => n.position);
    return addAt(findFreeSpot({ x: centre.x - NOTE_WIDTH / 2, y: centre.y - 40 }, occupied));
  }, [addAt, flowStore, screenToFlowPosition]);

  return { addNoteAt, addNoteAtCentre };
}
