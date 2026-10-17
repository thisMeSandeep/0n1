import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx.ts";
import { Tooltip } from "./Tooltip.tsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control " +
  "transition-colors duration-(--duration-fast) ease-out disabled:pointer-events-none disabled:text-fg-3";

const variants: Record<Variant, string> = {
  primary: "bg-accent-soft font-medium text-accent hover:bg-accent/16 active:bg-accent/22",
  secondary: "border border-line bg-raised font-medium text-fg hover:bg-fg/4 active:bg-fg/8",
  ghost: "text-fg-2 hover:bg-fg/6 hover:text-fg active:bg-fg/10",
  danger: "font-medium text-fail hover:bg-fail-soft active:bg-fail/16",
};

const sizes: Record<Size, string> = {
  md: "h-8 px-3 text-base [&_svg]:size-4",
  sm: "h-7 px-2 text-sm [&_svg]:size-3.5",
};

const iconSizes: Record<Size, string> = {
  md: "size-8 [&_svg]:size-4",
  sm: "size-7 [&_svg]:size-3.5",
};

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  /** Keyboard shortcut shown in the tooltip, e.g. "Space". */
  shortcut?: string;
  tooltip?: boolean;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function IconButton({
  label,
  shortcut,
  tooltip = true,
  variant = "ghost",
  size = "md",
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cx(base, variants[variant], iconSizes[size], className)}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  );
}
