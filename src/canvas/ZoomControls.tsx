import { CornersOutIcon, MinusIcon, PlusIcon, TreeStructureIcon } from "@phosphor-icons/react";
import { useViewport } from "@xyflow/react";
import { shortcutKeys } from "../app/shortcuts.ts";
import { IconButton } from "../ui/Button.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { useTidyLayout } from "./useTidyLayout.ts";
import { useViewActions } from "./useViewActions.ts";

export function ZoomControls() {
  const { zoom } = useViewport();
  const view = useViewActions();
  const tidy = useTidyLayout();

  return (
    <div className="flex items-center gap-0.5 rounded-card border border-line bg-raised p-1">
      <IconButton label="Zoom out" size="sm" onClick={view.zoomOut}>
        <MinusIcon />
      </IconButton>
      <Tooltip content="Zoom to 100%" shortcut={shortcutKeys("zoomToActual")}>
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
      <IconButton
        label="Fit to view"
        shortcut={shortcutKeys("fitView")}
        size="sm"
        onClick={view.fitView}
      >
        <CornersOutIcon />
      </IconButton>
      <IconButton
        label="Tidy layout"
        shortcut={shortcutKeys("tidyLayout")}
        size="sm"
        onClick={tidy}
      >
        <TreeStructureIcon />
      </IconButton>
    </div>
  );
}
