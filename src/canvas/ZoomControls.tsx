import { CornersOutIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { IconButton } from "../ui/Button.tsx";
import { usePrefersReducedMotion } from "../ui/hooks/useMediaQuery.ts";
import { Tooltip } from "../ui/Tooltip.tsx";

/** Matches --duration-zoom (UIUX §9); 0 with reduced motion. */
const ZOOM_MS = 280;
export const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 } as const;

export function ZoomControls() {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const duration = usePrefersReducedMotion() ? 0 : ZOOM_MS;

  return (
    <div className="flex items-center gap-0.5 rounded-card border border-line bg-raised p-1">
      <IconButton label="Zoom out" size="sm" onClick={() => zoomOut({ duration })}>
        <MinusIcon />
      </IconButton>
      <Tooltip content="Zoom to 100%" shortcut="1">
        <button
          type="button"
          onClick={() => zoomTo(1, { duration })}
          className="h-7 min-w-12 rounded-control px-1.5 text-xs text-fg-2 hover:bg-fg/6 hover:text-fg"
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <IconButton label="Zoom in" size="sm" onClick={() => zoomIn({ duration })}>
        <PlusIcon />
      </IconButton>
      <IconButton
        label="Fit to view"
        shortcut="F"
        size="sm"
        onClick={() => fitView({ ...FIT_VIEW_OPTIONS, duration })}
      >
        <CornersOutIcon />
      </IconButton>
    </div>
  );
}
