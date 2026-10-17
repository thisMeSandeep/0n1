import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";
import { Kbd } from "./Kbd.tsx";

const OPEN_DELAY_MS = 400;
const SKIP_DELAY_MS = 300;

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={OPEN_DELAY_MS} skipDelayDuration={SKIP_DELAY_MS}>
      {children}
    </RadixTooltip.Provider>
  );
}

type TooltipProps = {
  content: ReactNode;
  shortcut?: string | undefined;
  side?: "top" | "right" | "bottom" | "left";
  /** A single element that accepts a ref, e.g. a button. */
  children: ReactElement;
};

export function Tooltip({ content, shortcut, side = "top", children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={
            "z-50 flex max-w-64 items-center gap-2 rounded-control border border-line bg-raised px-2 py-1 " +
            "text-sm text-fg shadow-raised origin-(--radix-tooltip-content-transform-origin) " +
            "data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in"
          }
        >
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
