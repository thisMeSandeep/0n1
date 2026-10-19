import { describe, expect, it } from "vitest";
import { componentDefinitions } from "../components/index.ts";
import {
  findVendorIcon,
  ICONS_FOR_TYPE,
  VENDOR_ICONS,
  VENDORS,
  vendorIconLabel,
  vendorIconUrl,
} from "./catalog.ts";

// Node's fs, typed by hand: the app's tsconfig leaves out Node's types on purpose.
const { existsSync }: { existsSync(path: URL): boolean } = await import(
  /* @vite-ignore */ "node:fs" as string
);
const PUBLIC = new URL("../../public/", import.meta.url);

describe("vendor icons", () => {
  it("offer every component a choice from every vendor", () => {
    for (const definition of componentDefinitions) {
      const vendors = new Set((ICONS_FOR_TYPE[definition.type] ?? []).map((i) => i.vendor));
      expect([...vendors].sort(), definition.type).toEqual(VENDORS.map((v) => v.id).sort());
    }
    // Nothing offered for a kind of component that doesn't exist.
    const types = new Set(componentDefinitions.map((d) => d.type));
    expect(Object.keys(ICONS_FOR_TYPE).filter((t) => !types.has(t))).toEqual([]);
  });

  it("each have a unique id, under their vendor", () => {
    const ids = VENDOR_ICONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const icon of VENDOR_ICONS) expect(icon.id.startsWith(`${icon.vendor}/`)).toBe(true);
  });

  it("each have their file, and a dark one when drawn for both backgrounds", () => {
    for (const icon of VENDOR_ICONS) {
      for (const theme of ["light", "dark"] as const) {
        const url = vendorIconUrl(icon, theme);
        expect(existsSync(new URL(url.slice(1), PUBLIC)), url).toBe(true);
      }
    }
    const users = findVendorIcon("aws/users");
    expect(users && vendorIconUrl(users, "dark")).toBe("/vendor-icons/aws/users-dark.svg");
    const rds = findVendorIcon("aws/rds");
    expect(rds && vendorIconUrl(rds, "dark")).toBe("/vendor-icons/aws/rds.svg");
  });

  it("each have a name that says whose they are, unique among a component's choices", () => {
    const label = (id: string) => {
      const icon = findVendorIcon(id);
      return icon && vendorIconLabel(icon);
    };
    expect([
      label("aws/users"),
      label("azure/users"),
      label("aws/rds"),
      label("gcp/compute"),
    ]).toEqual(["AWS Users", "Azure Users", "Amazon RDS", "Google Cloud Compute"]);
    for (const [type, icons] of Object.entries(ICONS_FOR_TYPE)) {
      const names = icons.map(vendorIconLabel);
      expect(new Set(names).size, type).toBe(names.length);
    }
  });

  it("forget icons that are gone: the component shows 0n1's", () => {
    expect(findVendorIcon("aws/teleporter")).toBeUndefined();
    expect(findVendorIcon(undefined)).toBeUndefined();
  });
});
