import { z } from "zod";
import { CATEGORIES } from "../model/component.ts";
import type { createUiStore } from "../store/ui.ts";
import type { ThemePreference } from "../ui/theme/theme.ts";
import type { SettingsRepository } from "./settings.ts";

/*
 * User preferences: theme, panels, palette groups, the minimap and whether
 * the welcome card has been seen, stored in
 * IndexedDB (the settings table).
 *
 * The theme is also mirrored into localStorage, so the inline script in
 * index.html can apply it before first paint (IndexedDB can't be read that
 * early). localStorage writes are synchronous, so the mirror is always up to
 * date, while an IndexedDB write can be cut short by a quick reload. On
 * startup the mirror wins when it exists, and IndexedDB is brought in line.
 */

export const THEME_MIRROR_KEY = "0n1:theme";

const themeSchema = z.enum(["system", "light", "dark"]);
const panelsSchema = z.object({
  tier: z.enum(["wide", "medium", "narrow", "small"]),
  paletteOpen: z.boolean(),
  inspectorOpen: z.boolean(),
});

const groupsSchema = z.array(z.enum(CATEGORIES));
const tutorialSchema = z.object({ lesson: z.string(), step: z.string(), systemId: z.string() });

export type Preferences = {
  theme: ThemePreference;
  minimap: boolean;
  collapsedGroups: z.infer<typeof groupsSchema>;
  panels: z.infer<typeof panelsSchema> | null;
  welcomeSeen: boolean;
  timelineOpen: boolean;
  /** A tutorial in progress, to pick up where it was left. */
  tutorial: z.infer<typeof tutorialSchema> | null;
};

/** Stored values are validated; anything unexpected falls back to the default. */
export async function loadPreferences(settings: SettingsRepository): Promise<Preferences> {
  const [theme, minimap, groups, panels, welcomeSeen, timelineOpen, tutorial] = await Promise.all([
    settings.get("theme"),
    settings.get("minimap"),
    settings.get("collapsedGroups"),
    settings.get("panels"),
    settings.get("welcomeSeen"),
    settings.get("timelineOpen"),
    settings.get("tutorial"),
  ]);
  return {
    theme: themeSchema.catch("system").parse(theme),
    minimap: z.boolean().catch(false).parse(minimap),
    collapsedGroups: groupsSchema.catch([]).parse(groups),
    panels: panelsSchema
      .nullable()
      .catch(null)
      .parse(panels ?? null),
    welcomeSeen: z.boolean().catch(false).parse(welcomeSeen),
    timelineOpen: z.boolean().catch(false).parse(timelineOpen),
    tutorial: tutorialSchema
      .nullable()
      .catch(null)
      .parse(tutorial ?? null),
  };
}

type UiStore = ReturnType<typeof createUiStore>;

/** Put loaded preferences into the UI store, then save whenever they change. */
export function bindPreferences(
  ui: UiStore,
  settings: SettingsRepository,
  prefs: Omit<Preferences, "theme">,
): () => void {
  ui.setState({
    minimap: prefs.minimap,
    collapsedGroups: prefs.collapsedGroups,
    panels: prefs.panels,
    // A first visit opens the welcome card.
    welcomeOpen: !prefs.welcomeSeen,
    timelineOpen: prefs.timelineOpen,
    tutorial: prefs.tutorial,
  });
  return ui.subscribe((state, previous) => {
    if (state.minimap !== previous.minimap) void settings.set("minimap", state.minimap);
    if (state.timelineOpen !== previous.timelineOpen) {
      void settings.set("timelineOpen", state.timelineOpen);
    }
    if (state.collapsedGroups !== previous.collapsedGroups) {
      void settings.set("collapsedGroups", [...state.collapsedGroups]);
    }
    if (state.tutorial !== previous.tutorial) void settings.set("tutorial", state.tutorial);
    if (state.panels !== previous.panels && state.panels) {
      void settings.set("panels", state.panels);
    }
    // Closed once means seen for good; reopening it from the menu doesn't undo that.
    if (previous.welcomeOpen && !state.welcomeOpen) void settings.set("welcomeSeen", true);
  });
}

/** The mirrored theme, or null if there isn't a valid one. */
export function readThemeMirror(): ThemePreference | null {
  try {
    const result = themeSchema.safeParse(localStorage.getItem(THEME_MIRROR_KEY));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeThemeMirror(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}
