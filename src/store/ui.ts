import { createStore } from "zustand/vanilla";
import type { LayoutTier } from "../app/layout.ts";
import type { Category } from "../model/component.ts";

/** Panel open state, remembered for the layout tier it was set at. */
export type PanelPrefs = { tier: LayoutTier; paletteOpen: boolean; inspectorOpen: boolean };

/**
 * - saved / saving: autosave state for the top bar.
 * - error: the last save failed.
 * - unavailable: the browser won't let us store anything.
 * - null: not persisting (dev-only `?sample`), so show nothing.
 */
export type SaveStatus = "saved" | "saving" | "error" | "unavailable" | null;

/**
 * Lab UI state that several parts of the app reach for: panels, palette
 * groups, the minimap, overlays opened by shortcuts and the save status.
 * Not undoable. Preferences are saved by storage/preferences.ts.
 */
export type UiState = {
  panels: PanelPrefs | null;
  setPanels(panels: PanelPrefs): void;
  collapsedGroups: readonly Category[];
  setGroupOpen(category: Category, open: boolean): void;
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
    panels: null,
    setPanels: (panels) => set({ panels }),
    collapsedGroups: [],
    setGroupOpen: (category, open) =>
      set((s) => ({
        collapsedGroups: open
          ? s.collapsedGroups.filter((c) => c !== category)
          : s.collapsedGroups.includes(category)
            ? s.collapsedGroups
            : [...s.collapsedGroups, category],
      })),
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
