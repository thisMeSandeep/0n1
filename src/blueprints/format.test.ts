import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import {
  type Blueprint,
  BlueprintError,
  blueprintDocument,
  compareBlueprints,
  parseBlueprint,
} from "./format.ts";

const valid = (): Blueprint => ({
  format: "0n1-blueprint",
  version: 1,
  id: "tiny",
  title: "Tiny",
  summary: "A client and a service.",
  description: "The smallest system that runs.",
  experiments: ["Press Space."],
  system: {
    schemaVersion: 1,
    nodes: [
      {
        id: "users",
        type: "client",
        name: "Users",
        position: { x: 0, y: 0 },
        params: { rate: 50 },
      },
      { id: "api", type: "service", name: "API", position: { x: 300, y: 0 }, params: {} },
    ],
    edges: [{ id: "e", source: "users", target: "api" }],
  },
});

const broken = (change: (b: Blueprint) => void) => {
  const blueprint = valid();
  change(blueprint);
  return () => parseBlueprint(blueprint, registry);
};

describe("blueprint files", () => {
  it("accept a valid blueprint", () => {
    expect(parseBlueprint(valid(), registry).id).toBe("tiny");
  });

  it("explain what's wrong with an invalid one", () => {
    expect(broken((b) => ((b as { format: string }).format = "nope"))).toThrow(BlueprintError);
    expect(broken((b) => (b.id = "Tiny Thing"))).toThrow(/kebab-case.*at id/);
    expect(broken((b) => (b.experiments = []))).toThrow(/experiments/);
    expect(
      broken((b) => {
        (b.system.nodes[1] as { type: string }).type = "mainframe";
      }),
    ).toThrow(/API: unknown component type "mainframe"/);
    expect(
      broken((b) => {
        (b.system.nodes[0] as { params: Record<string, unknown> }).params = { rate: -5 };
      }),
    ).toThrow(/Users: .*rate/);
    expect(
      broken((b) => b.system.edges.push({ id: "e2", source: "users", target: "nobody" })),
    ).toThrow(/Unknown node "nobody"/);
    expect(broken((b) => (b.system.schemaVersion = 99))).toThrow(/newer version of 0n1/);
    expect(
      broken((b) => {
        b.system.nodes = [];
        b.system.edges = [];
      }),
    ).toThrow(/no components/);
  });
});

describe("a system made from a blueprint", () => {
  it("gets its own id and name, remembers its blueprint, and fills in default settings", () => {
    const doc = blueprintDocument(valid(), registry, { id: "new", name: "Tiny 2", now: 42 });
    expect(doc).toMatchObject({
      id: "new",
      name: "Tiny 2",
      blueprint: { id: "tiny" },
      meta: { createdAt: 42, updatedAt: 42 },
    });
    expect(doc.nodes[0]?.params).toEqual({
      ...defaultParams(registry.require("client")),
      rate: 50,
    });
    expect(doc.nodes[1]?.params).toEqual(defaultParams(registry.require("service")));
  });

  it("is a deep copy: changing it never changes the blueprint", () => {
    const blueprint = valid();
    const before = structuredClone(blueprint);
    const doc = blueprintDocument(blueprint, registry, { id: "new", name: "Tiny", now: 0 });
    (doc.nodes[0] as { position: { x: number } }).position.x = 999;
    (doc.nodes[0]?.params as Record<string, unknown>).rate = 1;
    doc.edges.pop();
    expect(blueprint).toEqual(before);
  });
});

describe("blueprint order", () => {
  it("sorts by order, then title", () => {
    const named = (title: string, order?: number) => ({ ...valid(), title, order });
    const sorted = [named("B"), named("A"), named("Z", 1), named("C", 2)].sort(compareBlueprints);
    expect(sorted.map((b) => b.title)).toEqual(["Z", "C", "A", "B"]);
  });
});
