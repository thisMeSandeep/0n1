import { useState } from "react";
import { registry } from "../components/index.ts";
import { designStore } from "../store/index.ts";
import { cx } from "../ui/cx.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { ComponentIcon } from "./ComponentIcon.tsx";
import { ICONS_FOR_TYPE, VENDORS, vendorIconLabel } from "./catalog.ts";

/**
 * The icon beside a component's name in the inspector: click it to give the
 * component a vendor's icon (AWS, Azure, Google Cloud), or 0n1's own back.
 */
export function IconPicker({
  nodeId,
  type,
  icon,
}: {
  nodeId: string;
  type: string;
  icon: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const definition = registry.get(type);
  const choices = ICONS_FOR_TYPE[type] ?? [];
  const choose = (next: string | null) => {
    designStore.getState().setNodeIcon(nodeId, next);
    setOpen(false);
  };
  const option = (id: string | null, label: string, selected: boolean) => (
    <Tooltip key={id ?? "0n1"} content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={() => choose(id)}
        className={cx(
          "grid size-11 place-items-center rounded-control border transition-colors duration-(--duration-fast)",
          selected ? "border-accent bg-accent-soft" : "border-line hover:bg-fg/6",
        )}
      >
        <ComponentIcon type={type} icon={id} className="size-6" />
      </button>
    </Tooltip>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Change icon">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change icon"
            className="grid size-full place-items-center rounded-card transition-colors duration-(--duration-fast) hover:bg-fg/6"
          >
            <ComponentIcon type={type} icon={icon} className="size-5" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent aria-label="Icon" className="w-80">
        <div className="flex flex-col gap-4">
          <section aria-label="0n1" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-fg-2">0n1</h3>
            <div className="flex flex-wrap gap-2">
              {option(null, `0n1 ${definition?.displayName ?? ""}`.trim(), icon === undefined)}
            </div>
          </section>
          {VENDORS.map((vendor) => {
            const icons = choices.filter((c) => c.vendor === vendor.id);
            if (icons.length === 0) return null;
            return (
              <section key={vendor.id} aria-label={vendor.label} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-fg-2">{vendor.label}</h3>
                <div className="flex flex-wrap gap-2">
                  {icons.map((c) => option(c.id, vendorIconLabel(c), c.id === icon))}
                </div>
              </section>
            );
          })}
          <p className="text-xs text-fg-2">
            Vendor icons belong to their owners. 0n1 isn't affiliated with any of them.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
