import { useCallback, useEffect, useState } from "react";
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

/**
 * Panel state for the lab. Each layout tier has its own defaults; crossing a
 * breakpoint resets to them. `[` / `]` (see shortcuts.ts) toggle the panels.
 * Persisted in S16.
 */
export function useLabLayout(): LabLayout {
  const wide = useMediaQuery(TIER_QUERIES.wide);
  const medium = useMediaQuery(TIER_QUERIES.medium);
  const narrow = useMediaQuery(TIER_QUERIES.narrow);
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const tier = tierFor({ wide, medium, narrow });

  const [panels, setPanels] = useState<PanelState>(() => defaultPanels(tier));
  useEffect(() => setPanels(defaultPanels(tier)), [tier]);

  const togglePalette = useCallback(
    () => setPanels((p) => ({ ...p, paletteOpen: !p.paletteOpen })),
    [],
  );
  const toggleInspector = useCallback(
    () => setPanels((p) => ({ ...p, inspectorOpen: !p.inspectorOpen })),
    [],
  );
  const openInspector = useCallback(
    () => setPanels((p) => (p.inspectorOpen ? p : { ...p, inspectorOpen: true })),
    [],
  );

  return {
    ...panels,
    tier,
    needsDesktopNotice: tier === "small" || !finePointer,
    togglePalette,
    toggleInspector,
    openInspector,
  };
}
