/**
 * Responsive lab layout rules (docs/UIUX.md §3).
 *
 * | Tier   | Width        | Palette          | Inspector                 |
 * |--------|--------------|------------------|---------------------------|
 * | wide   | ≥ 1440px     | open             | docked, open              |
 * | medium | 1280–1439px  | open             | overlays canvas, closed   |
 * | narrow | 1024–1279px  | icon rail        | overlays canvas, closed   |
 * | small  | < 1024px     | desktop notice (with "Continue anyway")      |
 */

export type LayoutTier = "wide" | "medium" | "narrow" | "small";

export const TIER_QUERIES = {
  wide: "(min-width: 1440px)",
  medium: "(min-width: 1280px)",
  narrow: "(min-width: 1024px)",
} as const;

/** Touch-only devices (no mouse or trackpad) get the desktop notice too. */
export const FINE_POINTER_QUERY = "(any-pointer: fine)";

export function tierFor(matches: { wide: boolean; medium: boolean; narrow: boolean }): LayoutTier {
  if (matches.wide) return "wide";
  if (matches.medium) return "medium";
  if (matches.narrow) return "narrow";
  return "small";
}

export type PanelState = {
  paletteOpen: boolean;
  inspectorOpen: boolean;
  /** Docked panels take space from the canvas; overlay panels float over its edge. */
  inspectorDocked: boolean;
};

export function defaultPanels(tier: LayoutTier): PanelState {
  switch (tier) {
    case "wide":
      return { paletteOpen: true, inspectorOpen: true, inspectorDocked: true };
    case "medium":
      return { paletteOpen: true, inspectorOpen: false, inspectorDocked: false };
    case "narrow":
    case "small":
      return { paletteOpen: false, inspectorOpen: false, inspectorDocked: false };
  }
}

/** True when a key press is meant for a text field, not a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return (target as Element).closest("input, textarea, select, [contenteditable='true']") !== null;
}
