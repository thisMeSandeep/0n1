import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../ui/hooks/useMediaQuery.ts";
import {
  defaultPanels,
  FINE_POINTER_QUERY,
  isTypingTarget,
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
};

/**
 * Panel state for the lab. Each layout tier has its own defaults; crossing a
 * breakpoint resets to them, and `[` / `]` toggle the panels within a tier.
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "[") togglePalette();
      else if (event.key === "]") toggleInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePalette, toggleInspector]);

  return {
    ...panels,
    tier,
    needsDesktopNotice: tier === "small" || !finePointer,
    togglePalette,
    toggleInspector,
  };
}
