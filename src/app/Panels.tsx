import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { IconButton } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";

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
