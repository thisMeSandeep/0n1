import { useCallback, useEffect } from "react";
import { uiStore, useUi } from "../store/index.ts";
import type { PanelPrefs } from "../store/ui.ts";
import { useMediaQuery } from "../ui/hooks/useMediaQuery.ts";
import {
  defaultPanels,
  FINE_POINTER_QUERY,
  type LayoutTier,
  type PanelState,
  TIER_QUERIES,
  tierFor,
} from "./layout.ts";

export type LabLayout = PanelState & {
  tier: LayoutTier;
  /** Phones, tablets and small windows get the desktop notice. */
  needsDesktopNotice: boolean;
  togglePalette: () => void;
  toggleInspector: () => void;
  openInspector: () => void;
};

function panelsFor(tier: LayoutTier, stored: PanelPrefs | null): PanelPrefs {
  if (stored?.tier === tier) return stored;
  const { paletteOpen, inspectorOpen } = defaultPanels(tier);
  return { tier, paletteOpen, inspectorOpen };
}

/**
 * Panel state for the lab, kept in the UI store (and so remembered across
 * reloads). Each layout tier has its own defaults; crossing a breakpoint
 * resets to them. `[` / `]` (see shortcuts.ts) toggle the panels.
 */
export function useLabLayout(): LabLayout {
  const wide = useMediaQuery(TIER_QUERIES.wide);
  const medium = useMediaQuery(TIER_QUERIES.medium);
  const narrow = useMediaQuery(TIER_QUERIES.narrow);
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const tier = tierFor({ wide, medium, narrow });

  const panels = panelsFor(
    tier,
    useUi((s) => s.panels),
  );
  useEffect(() => {
    const ui = uiStore.getState();
    if (ui.panels?.tier !== tier) ui.setPanels(panelsFor(tier, null));
  }, [tier]);

  const update = useCallback(
    (patch: (current: PanelPrefs) => Partial<PanelPrefs>) => {
      const ui = uiStore.getState();
      const current = panelsFor(tier, ui.panels);
      ui.setPanels({ ...current, ...patch(current) });
    },
    [tier],
  );
  const togglePalette = useCallback(
    () => update((p) => ({ paletteOpen: !p.paletteOpen })),
    [update],
  );
  const toggleInspector = useCallback(
    () => update((p) => ({ inspectorOpen: !p.inspectorOpen })),
    [update],
  );
  const openInspector = useCallback(() => update(() => ({ inspectorOpen: true })), [update]);

  return {
    paletteOpen: panels.paletteOpen,
    inspectorOpen: panels.inspectorOpen,
    inspectorDocked: defaultPanels(tier).inspectorDocked,
    tier,
    needsDesktopNotice: tier === "small" || !finePointer,
    togglePalette,
    toggleInspector,
    openInspector,
  };
}
