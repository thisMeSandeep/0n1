import type { ComponentProps } from "react";
import { cx } from "./cx.ts";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cx(
        "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-kbd border border-line px-1 align-middle",
        "font-mono text-[0.6875rem] font-medium leading-none text-fg-3",
        className,
      )}
      {...props}
    />
  );
}
