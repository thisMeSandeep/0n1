import { CheckIcon } from "@phosphor-icons/react";
import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx.ts";
import { Kbd } from "./Kbd.tsx";

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "end",
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cx(
          "z-50 min-w-52 rounded-card border border-line bg-raised p-1 text-fg shadow-raised focus-visible:outline-none",
          "origin-(--radix-dropdown-menu-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      />
    </RadixMenu.Portal>
  );
}

type MenuItemProps = ComponentProps<typeof RadixMenu.Item> & {
  icon?: ReactNode;
  shortcut?: string;
  tone?: "default" | "danger";
};

export function MenuItem({
  icon,
  shortcut,
  tone = "default",
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <RadixMenu.Item
      className={cx(
        "flex h-8 cursor-default select-none items-center gap-2.5 rounded-control px-2.5 text-base outline-none",
        "[&_svg]:size-4 [&_svg]:shrink-0 data-disabled:text-fg-3",
        tone === "danger"
          ? "text-fail data-highlighted:bg-fail-soft"
          : "data-highlighted:bg-fg/6 [&_svg]:text-fg-2",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </RadixMenu.Item>
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cx("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export const MenuRadioGroup = RadixMenu.RadioGroup;

/** One choice in a radio group, with a check when selected. */
export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof RadixMenu.RadioItem>) {
  return (
    <RadixMenu.RadioItem
      className={cx(
        "flex h-8 cursor-default select-none items-center gap-2.5 rounded-control px-2.5 text-base outline-none",
        "data-highlighted:bg-fg/6 data-disabled:text-fg-3",
        className,
      )}
      {...props}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        <RadixMenu.ItemIndicator>
          <CheckIcon aria-hidden className="size-4 text-accent" />
        </RadixMenu.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </RadixMenu.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof RadixMenu.Label>) {
  return (
    <RadixMenu.Label
      className={cx("px-2.5 pt-1.5 pb-1 text-xs font-medium text-fg-3", className)}
      {...props}
    />
  );
}
