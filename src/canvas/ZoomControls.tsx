import { CornersOutIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useViewport } from "@xyflow/react";
import { IconButton } from "../ui/Button.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useViewActions } from "./useViewActions.ts";

export function ZoomControls() {
  const { zoom } = useViewport();
  const view = useViewActions();

  return (
    <div className="flex items-center gap-0.5 rounded-card border border-line bg-raised p-1">
      <IconButton label="Zoom out" size="sm" onClick={view.zoomOut}>
        <MinusIcon />
      </IconButton>
      <Tooltip content="Zoom to 100%" shortcut="1">
        <button
          type="button"
          onClick={view.zoomToActual}
          className="h-7 min-w-12 rounded-control px-1.5 text-xs text-fg-2 hover:bg-fg/6 hover:text-fg"
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <IconButton label="Zoom in" size="sm" onClick={view.zoomIn}>
        <PlusIcon />
      </IconButton>
      <IconButton label="Fit to view" shortcut="F" size="sm" onClick={view.fitView}>
        <CornersOutIcon />
      </IconButton>
    </div>
  );
}
