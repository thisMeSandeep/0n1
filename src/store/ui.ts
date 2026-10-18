import { createStore } from "zustand/vanilla";
import type { LayoutTier } from "../app/layout.ts";
import type { RestorePreview } from "../library/backup.ts";
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
 * groups, the minimap, overlays opened by shortcuts, the welcome card and
 * the save status.
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
  libraryOpen: boolean;
  /** What a picked backup file would restore, shown in RestoreDialog. */
  restore: RestorePreview | null;
  /** Bumped to ask the palette to focus its search. */
  paletteSearchRequest: number;
  /** The first-visit welcome card (UIUX §10). Closing it is remembered by preferences.ts. */
  welcomeOpen: boolean;
  setWelcomeOpen(open: boolean): void;
  imageExportOpen: boolean;
  setImageExportOpen(open: boolean): void;
  /** The chaos timeline strip under the canvas (S40). */
  timelineOpen: boolean;
  setTimelineOpen(open: boolean): void;
  toggleMinimap(): void;
  setCommandPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setLibraryOpen(open: boolean): void;
  setRestore(preview: RestorePreview | null): void;
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
    libraryOpen: false,
    restore: null,
    paletteSearchRequest: 0,
    welcomeOpen: false,
    setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
    imageExportOpen: false,
    setImageExportOpen: (imageExportOpen) => set({ imageExportOpen }),
    timelineOpen: false,
    setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
    toggleMinimap: () => set((s) => ({ minimap: !s.minimap })),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    setLibraryOpen: (open) => set({ libraryOpen: open }),
    setRestore: (restore) => set({ restore }),
    requestPaletteSearch: () => set((s) => ({ paletteSearchRequest: s.paletteSearchRequest + 1 })),
  }));
}
