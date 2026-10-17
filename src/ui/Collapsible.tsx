import { CaretDownIcon } from "@phosphor-icons/react";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";
import { cx } from "./cx.ts";

type CollapsibleSectionProps = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** A titled section that folds away, e.g. palette groups or inspector "Details". */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
  className,
}: CollapsibleSectionProps) {
  return (
    <RadixCollapsible.Root
      defaultOpen={defaultOpen}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
      className={className}
    >
      <RadixCollapsible.Trigger
        className={cx(
          "group flex h-7 w-full items-center justify-between gap-2 rounded-control px-1 text-left",
          "text-sm font-medium text-fg-2 transition-colors duration-(--duration-fast) hover:text-fg",
        )}
      >
        {title}
        <CaretDownIcon
          aria-hidden
          className="size-3.5 transition-transform duration-(--duration-panel) ease-standard group-data-[state=closed]:-rotate-90"
        />
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className="overflow-hidden data-[state=closed]:animate-collapse-close data-[state=open]:animate-collapse-open">
        <div className="pt-2">{children}</div>
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  );
}
