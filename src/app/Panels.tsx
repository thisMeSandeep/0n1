import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";

const panelTransition = "transition-[width] duration-(--duration-panel) ease-standard";

/** Left panel (264px), collapsing to a 56px icon rail. Filled in S10. */
export function PalettePanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <aside
      aria-label="Components"
      className={cx(
        "flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface",
        panelTransition,
        open ? "w-66" : "w-14",
      )}
    >
      <div
        className={cx(
          "flex h-14 items-center",
          open ? "justify-between pr-3 pl-5" : "justify-center",
        )}
      >
        {open && <h2 className="text-sm font-medium text-fg-2">Components</h2>}
        <IconButton
          label={open ? "Collapse components panel" : "Expand components panel"}
          shortcut="["
          onClick={onToggle}
          aria-expanded={open}
        >
          <SidebarSimpleIcon />
        </IconButton>
      </div>
    </aside>
  );
}

type InspectorPanelProps = {
  open: boolean;
  docked: boolean;
  onToggle: () => void;
};

/**
 * Right panel (320px). Docked on wide screens; below 1440px it floats over
 * the canvas edge. Contextual views arrive in S12.
 */
export function InspectorPanel({ open, docked, onToggle }: InspectorPanelProps) {
  if (!open) return null;
  return (
    <aside
      aria-label="Inspector"
      className={cx(
        "flex w-80 shrink-0 flex-col border-l border-line bg-surface",
        !docked && "absolute top-0 right-0 bottom-0 z-10 shadow-raised",
      )}
    >
      <div className="flex h-14 items-center justify-between pr-3 pl-5">
        <h2 className="text-md font-semibold">System</h2>
        <IconButton label="Close inspector" shortcut="]" onClick={onToggle}>
          <SidebarSimpleIcon className="-scale-x-100" />
        </IconButton>
      </div>
      <p className="px-5 text-base text-fg-2">Select a component to see its settings.</p>
    </aside>
  );
}

/** Shown on the canvas edge while the inspector is closed. */
export function OpenInspectorButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      label="Open inspector"
      shortcut="]"
      variant="secondary"
      onClick={onClick}
      className="absolute top-3 right-3 z-10"
    >
      <SidebarSimpleIcon className="-scale-x-100" />
    </IconButton>
  );
}
