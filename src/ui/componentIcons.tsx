import {
  CopyIcon,
  CubeIcon,
  DatabaseIcon,
  DesktopIcon,
  GearSixIcon,
  GitForkIcon,
  GlobeHemisphereWestIcon,
  type Icon,
  LightningIcon,
  QuestionIcon,
  ShieldCheckIcon,
  StackIcon,
} from "@phosphor-icons/react";
import type { Category } from "../model/component.ts";

/** Icon keys used in component definitions → Phosphor icons. */
export const COMPONENT_ICONS: Readonly<Record<string, Icon>> = {
  desktop: DesktopIcon,
  "git-fork": GitForkIcon,
  "shield-check": ShieldCheckIcon,
  "globe-hemisphere-west": GlobeHemisphereWestIcon,
  cube: CubeIcon,
  "gear-six": GearSixIcon,
  database: DatabaseIcon,
  lightning: LightningIcon,
  copy: CopyIcon,
  stack: StackIcon,
};

export function componentIcon(key: string): Icon {
  return COMPONENT_ICONS[key] ?? QuestionIcon;
}

/** Category tint for the duotone icon layer (UIUX §5). */
export const CATEGORY_TINT: Readonly<Record<Category, string>> = {
  traffic: "text-cat-traffic",
  network: "text-cat-network",
  compute: "text-cat-compute",
  data: "text-cat-data",
  messaging: "text-cat-messaging",
};
