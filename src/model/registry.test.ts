import { describe, expect, it } from "vitest";
import type { ComponentDefinition } from "./component.ts";
import { testClient, testDatabase, testDefinitions, testService } from "./fixtures.ts";
import { createRegistry, validateDefinition } from "./registry.ts";

describe("createRegistry", () => {
  const registry = createRegistry(testDefinitions);

  it("looks definitions up by type", () => {
    expect(registry.get("service")).toBe(testService);
    expect(registry.get("nope")).toBeUndefined();
    expect(registry.require("database")).toBe(testDatabase);
    expect(() => registry.require("nope")).toThrow('Unknown component type "nope"');
  });

  it("lists definitions and groups them by category in palette order", () => {
    expect(registry.list()).toEqual(testDefinitions);
    expect([...registry.byCategory().keys()]).toEqual([
      "traffic",
      "network",
      "compute",
      "data",
      "messaging",
    ]);
    expect(registry.byCategory().get("compute")).toEqual([testService]);
    expect(registry.byCategory().get("network")).toEqual([]);
  });

  it("rejects duplicate types and unknown outgoing types", () => {
    expect(() => createRegistry([testService, testService])).toThrow(
      'Duplicate component type "service"',
    );
    expect(() => createRegistry([testClient])).toThrow('unknown outgoing type "service"');
  });
});

describe("validateDefinition", () => {
  const withParam = (param: unknown): ComponentDefinition =>
    ({ ...testDatabase, params: { p: param } }) as ComponentDefinition;
  const number = { kind: "number", label: "P", section: "capacity", default: 5, min: 1, max: 10 };

  it("accepts the fixtures", () => {
    for (const definition of testDefinitions)
      expect(() => validateDefinition(definition)).not.toThrow();
  });

  it("requires kebab-case types and non-empty copy", () => {
    expect(() => validateDefinition({ ...testDatabase, type: "LoadBalancer" })).toThrow(
      "kebab-case",
    );
    expect(() => validateDefinition({ ...testDatabase, modelNote: " " })).toThrow(
      "modelNote is empty",
    );
  });

  it("checks number ranges, log scales and defaults", () => {
    expect(() => validateDefinition(withParam({ ...number, max: 1 }))).toThrow(
      "max must be greater",
    );
    expect(() => validateDefinition(withParam({ ...number, min: 0, scale: "log" }))).toThrow(
      "log scale needs min > 0",
    );
    expect(() => validateDefinition(withParam({ ...number, default: 50 }))).toThrow(
      "default 50 is outside 1–10",
    );
  });

  it("checks that enabledBy points at a toggle", () => {
    const toggle = { kind: "toggle", label: "On", section: "behaviour", default: false };
    const valid = { ...testDatabase, params: { on: toggle, p: { ...number, enabledBy: "on" } } };
    expect(() => validateDefinition(valid as ComponentDefinition)).not.toThrow();
    expect(() => validateDefinition(withParam({ ...number, enabledBy: "missing" }))).toThrow(
      'enabledBy "missing" is not a toggle',
    );
  });

  it("checks that a choice default is one of its options", () => {
    const choice = {
      kind: "choice",
      label: "C",
      section: "behaviour",
      default: "z",
      options: [{ value: "a", label: "A" }],
    };
    expect(() => validateDefinition(withParam(choice))).toThrow(
      'default "z" is not one of the options',
    );
  });
});
