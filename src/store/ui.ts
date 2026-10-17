import { createStore } from "zustand/vanilla";

/**
 * Lab UI state that several parts of the app reach for: overlays opened by
 * shortcuts and the minimap. Not undoable. Persisted in S16.
 */
export type UiState = {
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
