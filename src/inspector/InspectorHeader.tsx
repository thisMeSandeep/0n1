import { SidebarSimpleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "../ui/Button.tsx";

type InspectorHeaderProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
};

export function InspectorHeader({ icon, title, subtitle, actions, onClose }: InspectorHeaderProps) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-5 pt-3.5 pb-2">
      {icon && (
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-card border border-line bg-raised">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        {title}
        {subtitle && <p className="truncate px-1.5 text-sm text-fg-2">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {actions}
        <IconButton label="Close inspector" shortcut="]" onClick={onClose}>
          <SidebarSimpleIcon className="-scale-x-100" />
        </IconButton>
      </div>
    </div>
  );
}

/** A titled group of settings or facts, separated by space rather than boxes. */
export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-6">
      <h3 className="mb-3 text-sm font-medium text-fg-2">{title}</h3>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}
