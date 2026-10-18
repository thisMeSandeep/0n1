import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { count, isParamEnabled, paramSections } from "./sections.ts";

describe("paramSections", () => {
  it("groups params in Capacity, Behaviour, When things go wrong order", () => {
    const sections = paramSections(registry.require("database"));
    expect(sections.map((s) => s.title)).toEqual(["Capacity", "When things go wrong"]);
    expect(sections[0]?.params.map(([key]) => key)).toEqual([
      "connections",
      "readTime",
      "writeTime",
      "searchTime",
    ]);
    expect(sections[1]?.params.map(([key]) => key)).toEqual(["maxWaiting", "errorRate"]);
  });

  it("skips empty sections", () => {
    expect(paramSections(registry.require("cdn")).map((s) => s.section)).toEqual(["behaviour"]);
  });

  it("covers every param of every component exactly once", () => {
    for (const definition of registry.list()) {
      const keys = paramSections(definition).flatMap((s) => s.params.map(([key]) => key));
      expect(keys.sort()).toEqual(Object.keys(definition.params).sort());
    }
  });
});

describe("isParamEnabled", () => {
  const gateway = registry.require("api-gateway");
  const rateLimit = gateway.params.rateLimit!;

  it("follows its toggle", () => {
    expect(isParamEnabled(rateLimit, { rateLimiting: false })).toBe(false);
    expect(isParamEnabled(rateLimit, { rateLimiting: true })).toBe(true);
  });

  it("is always on without enabledBy", () => {
    expect(isParamEnabled(gateway.params.delay!, {})).toBe(true);
  });
});

describe("count", () => {
  it("pluralises", () => {
    expect(count(1, "component")).toBe("1 component");
    expect(count(0, "connection")).toBe("0 connections");
    expect(count(3, "component")).toBe("3 components");
  });
});
