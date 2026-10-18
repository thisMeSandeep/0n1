import {
  CopyIcon,
  CubeIcon,
  DatabaseIcon,
  DesktopIcon,
  GaugeIcon,
  GearSixIcon,
  GitForkIcon,
  GlobeHemisphereWestIcon,
  type Icon,
  LightningIcon,
  PlugsConnectedIcon,
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
  gauge: GaugeIcon,
  "plugs-connected": PlugsConnectedIcon,
};

export function componentIcon(key: string): Icon {
  return COMPONENT_ICONS[key] ?? QuestionIcon;
}

export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  traffic: "Traffic",
  network: "Network",
  compute: "Compute",
  data: "Data",
  messaging: "Messaging",
};

/** Category tint for the duotone icon layer (UIUX §5). */
export const CATEGORY_TINT: Readonly<Record<Category, string>> = {
  traffic: "text-cat-traffic",
  network: "text-cat-network",
  compute: "text-cat-compute",
  data: "text-cat-data",
  messaging: "text-cat-messaging",
};
