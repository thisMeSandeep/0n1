import { describe, expect, it } from "vitest";
import { componentDefinitions } from "../components/index.ts";
import { filterComponents } from "./filter.ts";

const names = (query: string) =>
  filterComponents(componentDefinitions, query).map((d) => d.displayName);

describe("filterComponents", () => {
  it("returns everything for an empty query", () => {
    expect(filterComponents(componentDefinitions, "  ")).toBe(componentDefinitions);
  });

  it("matches names, case-insensitively", () => {
    expect(names("CACHE")).toEqual(["Cache"]);
    expect(names("load")).toContain("Load balancer");
  });

  it("matches keywords, so short names work", () => {
    expect(names("db")).toEqual(["Database", "Read replica"]);
    expect(names("lb")).toEqual(["Load balancer"]);
  });

  it("ranks name matches above description matches", () => {
    expect(names("queue")[0]).toBe("Queue");
    expect(names("queue")).toContain("Worker");
  });

  it("requires every word to match", () => {
    expect(names("read replica")).toEqual(["Read replica"]);
    expect(names("cache teleporter")).toEqual([]);
  });
});
