import { z } from "zod";
import { CATEGORIES } from "../model/component.ts";
import type { createUiStore } from "../store/ui.ts";
import type { ThemePreference } from "../ui/theme/theme.ts";
import type { SettingsRepository } from "./settings.ts";

/*
 * User preferences: theme, panels, palette groups and the minimap, stored in
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

export type Preferences = {
  theme: ThemePreference;
  minimap: boolean;
  collapsedGroups: z.infer<typeof groupsSchema>;
  panels: z.infer<typeof panelsSchema> | null;
};

/** Stored values are validated; anything unexpected falls back to the default. */
export async function loadPreferences(settings: SettingsRepository): Promise<Preferences> {
  const [theme, minimap, groups, panels] = await Promise.all([
    settings.get("theme"),
    settings.get("minimap"),
    settings.get("collapsedGroups"),
    settings.get("panels"),
  ]);
  return {
    theme: themeSchema.catch("system").parse(theme),
    minimap: z.boolean().catch(false).parse(minimap),
    collapsedGroups: groupsSchema.catch([]).parse(groups),
    panels: panelsSchema
      .nullable()
      .catch(null)
      .parse(panels ?? null),
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
  });
  return ui.subscribe((state, previous) => {
    if (state.minimap !== previous.minimap) void settings.set("minimap", state.minimap);
    if (state.collapsedGroups !== previous.collapsedGroups) {
      void settings.set("collapsedGroups", [...state.collapsedGroups]);
    }
    if (state.panels !== previous.panels && state.panels) {
      void settings.set("panels", state.panels);
    }
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
