import { useStore } from "zustand";
import { registry } from "../components/index.ts";
import { createSystemDocument } from "../model/document.ts";
import { createDesignStore, type DesignState } from "./design.ts";
import { createSelectionStore, type SelectionState } from "./selection.ts";
import { createUiStore, type UiState } from "./ui.ts";

/*
 * App-wide store instances and hooks. Tests create their own stores with
 * createDesignStore / createSelectionStore instead of using these.
 */

export const designStore = createDesignStore({ registry, doc: createSystemDocument() });
export const selectionStore = createSelectionStore();
export const uiStore = createUiStore();

// Deleting or undoing can remove selected items; keep the selection honest.
designStore.subscribe((state, previous) => {
  if (state.doc !== previous.doc) selectionStore.getState().prune(state.doc);
});

export function useDesign<T>(selector: (state: DesignState) => T): T {
  return useStore(designStore, selector);
}

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(selectionStore, selector);
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}

/** Undo/redo state: `undo`, `redo`, `pastStates`, `futureStates`. */
export function useHistory<T>(
  selector: (state: ReturnType<typeof designStore.temporal.getState>) => T,
): T {
  return useStore(designStore.temporal, selector);
}
