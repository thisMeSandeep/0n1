import { createStore } from "zustand/vanilla";

/**
 * - saved / saving: autosave state for the top bar.
 * - error: the last save failed.
 * - unavailable: the browser won't let us store anything.
 * - null: not persisting (dev-only `?sample`), so show nothing.
 */
export type SaveStatus = "saved" | "saving" | "error" | "unavailable" | null;

/**
 * Lab UI state that several parts of the app reach for: overlays opened by
 * shortcuts, the minimap and the save status. Not undoable. Persisted in S16.
 */
export type UiState = {
  saveStatus: SaveStatus;
  setSaveStatus(status: SaveStatus): void;
  minimap: boolean;
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  /** Bumped to ask the palette to focus its search. */
  paletteSearchRequest: number;
  toggleMinimap(): void;
  setCommandPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  requestPaletteSearch(): void;
};

export function createUiStore() {
  return createStore<UiState>()((set) => ({
    saveStatus: null,
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    minimap: false,
    commandPaletteOpen: false,
    shortcutsOpen: false,
    paletteSearchRequest: 0,
    toggleMinimap: () => set((s) => ({ minimap: !s.minimap })),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    requestPaletteSearch: () => set((s) => ({ paletteSearchRequest: s.paletteSearchRequest + 1 })),
  }));
}
