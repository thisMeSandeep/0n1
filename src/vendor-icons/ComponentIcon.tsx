import { registry } from "../components/index.ts";
import { CATEGORY_TINT, componentIcon } from "../ui/componentIcons.tsx";
import { cx } from "../ui/cx.ts";
import { findVendorIcon, vendorIconUrl } from "./catalog.ts";

/**
 * A component's icon: the vendor icon chosen for it, if any, otherwise 0n1's
 * own (duotone, in its category's tint). Size it with `className` (size-5…).
 */
export function ComponentIcon({
  type,
  icon,
  className,
}: {
  type: string;
  icon?: string | null | undefined;
  className?: string;
}) {
  const vendor = findVendorIcon(icon ?? undefined);
  if (vendor) {
    const image = (theme: "light" | "dark", shown?: string) => (
      <img
        src={vendorIconUrl(vendor, theme)}
        alt=""
        aria-hidden
        draggable={false}
        className={cx("shrink-0 object-contain", shown, className)}
      />
    );
    // Icons drawn for light and dark backgrounds: each shows in its own theme.
    return vendor.dark ? (
      <>
        {image("light", "dark:hidden")}
        {image("dark", "hidden dark:block")}
      </>
    ) : (
      image("light")
    );
  }
  const definition = registry.get(type);
  const Icon = componentIcon(definition?.icon ?? "");
  return (
    <Icon
      aria-hidden
      weight="duotone"
      className={cx("shrink-0", definition && CATEGORY_TINT[definition.category], className)}
    />
  );
}
