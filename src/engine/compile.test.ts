import { describe, expect, it } from "vitest";
import { componentDefinitions, registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";
import { compile } from "./compile.ts";

type Spec = { nodes: [id: string, type: string, name?: string][]; edges: [string, string][] };

function system({ nodes, edges }: Spec): SystemDocument {
  return {
    ...createSystemDocument({ id: "s", now: 0 }),
    nodes: nodes.map(([id, type, name]) => ({
      id,
      type,
      name: name ?? id,
      position: { x: 0, y: 0 },
      params: {},
    })),
    edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  };
}

const messages = (doc: SystemDocument) => {
  const result = compile(doc, registry);
  return {
    errors: result.errors.map((e) => e.message),
    warnings: result.warnings.map((w) => w.message),
  };
};

/** The mockup's URL shortener, plus a replica, an async job pipeline, a rate limiter and a circuit breaker. */
const full = system({
  nodes: [
    ["users", "client", "Users"],
    ["cdn", "cdn", "CDN"],
    ["limiter", "rate-limiter", "Rate limiter"],
    ["gw", "api-gateway", "Gateway"],
    ["lb", "load-balancer", "Load balancer"],
    ["api1", "service", "API 1"],
    ["api2", "service", "API 2"],
    ["cache", "cache", "Link cache"],
    ["db", "database", "Links DB"],
    ["replica", "read-replica", "Replica"],
    ["jobs", "queue", "Jobs"],
    ["worker", "worker", "Worker"],
    ["breaker", "circuit-breaker", "Breaker"],
  ],
  edges: [
    ["users", "cdn"],
    ["cdn", "limiter"],
    ["limiter", "gw"],
    ["gw", "lb"],
    ["lb", "api1"],
    ["lb", "api2"],
    ["api1", "cache"],
    ["api1", "db"],
    ["api1", "replica"],
    ["api2", "cache"],
    ["api2", "db"],
    ["api2", "jobs"],
    ["db", "replica"],
    ["jobs", "worker"],
    ["worker", "db"],
    ["worker", "breaker"],
    ["breaker", "api1"],
  ],
});

describe("compile", () => {
  it("compiles a system using every component, cleanly", () => {
    const types = new Set(full.nodes.map((n) => n.type));
    expect([...types].sort()).toEqual(componentDefinitions.map((d) => d.type).sort());

    const result = compile(full, registry);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.model?.clients).toEqual(["users"]);
    expect(result.model?.order).toEqual(full.nodes.map((n) => n.id));
  });

  it("fills in params and sorts connections into routes, in document order", () => {
    const model = compile(full, registry).model!;
    const api1 = model.nodes.get("api1")!;
    expect(api1.params).toEqual(defaultParams(registry.require("service")));
    expect(api1.routes).toEqual({
      forward: [],
      caches: ["cache"],
      databases: ["db"],
      replicas: ["replica"],
      queues: [],
      workers: [],
    });
    expect(model.nodes.get("lb")!.routes.forward).toEqual(["api1", "api2"]);
    expect(model.nodes.get("jobs")!.routes.workers).toEqual(["worker"]);
    expect(model.nodes.get("db")!.sources).toEqual(["api1", "api2", "worker"]);
  });

  describe("errors (the system can't run)", () => {
    it("needs a client", () => {
      expect(messages(system({ nodes: [], edges: [] })).errors).toEqual([
        "Add a Client to send traffic.",
      ]);
      expect(messages(system({ nodes: [["db", "database"]], edges: [] })).errors).toEqual([
        "Add a Client to send traffic into the system.",
      ]);
    });

    it("needs a client to be connected", () => {
      expect(messages(system({ nodes: [["u", "client", "Users"]], edges: [] })).errors).toEqual([
        "Users isn't connected to anything, so its requests have nowhere to go.",
      ]);
    });

    it("needs pass-through components to have targets", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["lb", "load-balancer", "Load balancer"],
        ],
        edges: [["u", "lb"]],
      });
      expect(messages(doc).errors).toEqual(["Load balancer has nothing to send requests to."]);
      expect(compile(doc, registry).model).toBeNull();
    });

    it("rejects unknown components and forbidden connections (e.g. from an old or edited file)", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["db", "database", "DB"],
          ["x", "teleporter", "Portal"],
        ],
        edges: [["u", "db"]],
      });
      expect(messages(doc).errors).toEqual(
        expect.arrayContaining([
          "Portal is an unknown kind of component (“teleporter”).",
          "Users → DB isn't allowed: Client can't send requests to a database.",
        ]),
      );
    });

    it("finds loops and names them", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["a", "service", "Orders"],
          ["b", "service", "Billing"],
        ],
        edges: [
          ["u", "a"],
          ["a", "b"],
          ["b", "a"],
        ],
      });
      expect(messages(doc).errors).toEqual([
        "Requests could go round in a loop forever: Orders → Billing → Orders.",
      ]);
    });
  });

  describe("warnings (it runs, but something won't work)", () => {
    it("flags components nothing reaches", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["s", "service", "API"],
          ["c", "cache", "Lonely cache"],
        ],
        edges: [["u", "s"]],
      });
      const result = compile(doc, registry);
      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => [w.message, w.nodeId])).toEqual([
        ["Nothing sends requests to Lonely cache, so it will sit idle.", "c"],
      ]);
    });

    it("flags a queue without workers, a replica without a database, and cache misses with nowhere to go", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["s", "service", "API"],
          ["c", "cache", "Cache"],
          ["r", "read-replica", "Replica"],
          ["q", "queue", "Jobs"],
        ],
        edges: [
          ["u", "s"],
          ["s", "c"],
          ["s", "r"],
          ["s", "q"],
        ],
      });
      const { errors, warnings } = messages(doc);
      expect(errors).toEqual([]);
      expect(warnings).toEqual(
        expect.arrayContaining([
          "No worker takes jobs from Jobs, so jobs will pile up.",
          "Replica isn't fed by a database, so it never sees new writes.",
          "API reads from replicas but has no database to write to, so writes will fail.",
        ]),
      );

      const cacheOnly = system({
        nodes: [
          ["u", "client", "Users"],
          ["s", "service", "API"],
          ["c", "cache", "Cache"],
        ],
        edges: [
          ["u", "s"],
          ["s", "c"],
        ],
      });
      expect(messages(cacheOnly).warnings).toEqual([
        "Cache misses at API have nowhere to go. Connect it to a database.",
      ]);
    });

    it("replaces invalid settings with defaults and says so", () => {
      const doc = system({
        nodes: [
          ["u", "client", "Users"],
          ["s", "service", "API"],
        ],
        edges: [["u", "s"]],
      });
      doc.nodes[1]!.params = { concurrency: -5, workTime: 40 };
      const result = compile(doc, registry);
      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => w.message)).toEqual([
        "API: “Requests at once” had an invalid value, so the default is used.",
      ]);
      expect(result.model?.nodes.get("s")?.params).toMatchObject({ concurrency: 16, workTime: 40 });
    });
  });
});
