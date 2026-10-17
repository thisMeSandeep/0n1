import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cx } from "./cx.ts";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cx(
          "z-50 rounded-card border border-line bg-raised p-4 text-fg shadow-raised focus-visible:outline-none",
          "origin-(--radix-popover-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
