import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Command as Cmdk } from "cmdk";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx.ts";
import { Kbd } from "./Kbd.tsx";
import { scoreCommand } from "./text.ts";

/*
 * Styled cmdk parts, shared by quick add and the ⌘K command palette.
 * cmdk handles the combobox semantics and arrow-key navigation.
 */

export function Command({ className, ...props }: ComponentProps<typeof Cmdk>) {
  return (
    <Cmdk
      loop
      filter={scoreCommand}
      className={cx("flex flex-col text-fg", className)}
      {...props}
    />
  );
}

export function CommandInput({ className, ...props }: ComponentProps<typeof Cmdk.Input>) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      <MagnifyingGlassIcon aria-hidden className="size-4 shrink-0 text-fg-3" />
      <Cmdk.Input
        className={cx(
          "h-full w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-3",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof Cmdk.List>) {
  return (
    <Cmdk.List
      className={cx("max-h-80 scroll-py-1 overflow-y-auto overscroll-contain p-1", className)}
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof Cmdk.Group>) {
  return (
    <Cmdk.Group
      className={cx(
        "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1",
        "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

type CommandItemProps = ComponentProps<typeof Cmdk.Item> & {
  icon?: ReactNode;
  shortcut?: string;
};

export function CommandItem({ icon, shortcut, className, children, ...props }: CommandItemProps) {
  return (
    <Cmdk.Item
      className={cx(
        "flex h-9 cursor-default select-none items-center gap-2.5 rounded-control px-2.5 text-base",
        "data-[selected=true]:bg-fg/6 data-[disabled=true]:text-fg-3 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Cmdk.Item>
  );
}

export function CommandEmpty({ children }: { children: ReactNode }) {
  return <Cmdk.Empty className="px-3 py-6 text-center text-sm text-fg-2">{children}</Cmdk.Empty>;
}
