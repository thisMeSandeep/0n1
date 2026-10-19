import { createStore } from "zustand/vanilla";
import type { LayoutTier } from "../app/layout.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { RestorePreview } from "../library/backup.ts";
import type { Category } from "../model/component.ts";

/** Panel open state, remembered for the layout tier it was set at. */
export type TutorialProgress = {
  lesson: string;
  step: string;
  /** The system it builds in, and its name, to offer going back to it. */
  systemId: string;
  systemName: string;
};

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
  /** Bumped when a component is clicked: the inspector opens if it's closed. */
  inspectorRequest: number;
  /** A tutorial in progress (the guide, part 2): its lesson, step, and the system it builds in. */
  tutorial: TutorialProgress | null;
  setTutorial(tutorial: TutorialProgress | null): void;
  /** Lessons finished, by id. */
  tutorialsDone: readonly string[];
  markTutorialDone(lesson: string): void;
  /** The list of tutorials. */
  tutorialsOpen: boolean;
  setTutorialsOpen(open: boolean): void;
  /** The "Reading the numbers" guide, and the entry to show in it, if one was asked for. */
  guide: { open: boolean; entry: string | null };
  setGuideOpen(open: boolean, entry?: string | null): void;
  /** The sticky note (M04) whose text is being edited on the canvas, if any. */
  editingNote: string | null;
  setEditingNote(id: string | null): void;
  /** The first-visit welcome card (UIUX §10). Closing it is remembered by preferences.ts. */
  welcomeOpen: boolean;
  setWelcomeOpen(open: boolean): void;
  imageExportOpen: boolean;
  setImageExportOpen(open: boolean): void;
  /** The chaos timeline strip under the canvas (S40). */
  timelineOpen: boolean;
  setTimelineOpen(open: boolean): void;
  /** The request trace shown in the inspector and lit up on the canvas (S42). */
  openTrace: TraceRecord | null;
  setOpenTrace(trace: TraceRecord | null): void;
  toggleMinimap(): void;
  setCommandPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setLibraryOpen(open: boolean): void;
  setRestore(preview: RestorePreview | null): void;
  requestPaletteSearch(): void;
  requestInspector(): void;
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
    inspectorRequest: 0,
    tutorial: null,
    setTutorial: (tutorial) => set({ tutorial }),
    tutorialsDone: [],
    markTutorialDone: (lesson) =>
      set((s) =>
        s.tutorialsDone.includes(lesson) ? s : { tutorialsDone: [...s.tutorialsDone, lesson] },
      ),
    tutorialsOpen: false,
    setTutorialsOpen: (tutorialsOpen) => set({ tutorialsOpen }),
    guide: { open: false, entry: null },
    setGuideOpen: (open, entry = null) => set({ guide: { open, entry: open ? entry : null } }),
    editingNote: null,
    setEditingNote: (editingNote) => set({ editingNote }),
    welcomeOpen: false,
    setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
    imageExportOpen: false,
    setImageExportOpen: (imageExportOpen) => set({ imageExportOpen }),
    timelineOpen: false,
    setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
    openTrace: null,
    setOpenTrace: (openTrace) => set({ openTrace }),
    toggleMinimap: () => set((s) => ({ minimap: !s.minimap })),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    setLibraryOpen: (open) => set({ libraryOpen: open }),
    setRestore: (restore) => set({ restore }),
    requestPaletteSearch: () => set((s) => ({ paletteSearchRequest: s.paletteSearchRequest + 1 })),
    requestInspector: () => set((s) => ({ inspectorRequest: s.inspectorRequest + 1 })),
  }));
}
