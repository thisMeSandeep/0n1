import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { usePrefersReducedMotion } from "../ui/hooks/useMediaQuery.ts";

/** Matches --duration-zoom (UIUX §9); 0 with reduced motion. */
const ZOOM_MS = 280;
export const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 } as const;

/** Zoom and fit, animated the same way everywhere they're triggered. */
export function useViewActions() {
  const flow = useReactFlow();
  const duration = usePrefersReducedMotion() ? 0 : ZOOM_MS;

  return {
    zoomIn: useCallback(() => flow.zoomIn({ duration }), [flow, duration]),
    zoomOut: useCallback(() => flow.zoomOut({ duration }), [flow, duration]),
    zoomToActual: useCallback(() => flow.zoomTo(1, { duration }), [flow, duration]),
    fitView: useCallback(() => flow.fitView({ ...FIT_VIEW_OPTIONS, duration }), [flow, duration]),
  };
}
