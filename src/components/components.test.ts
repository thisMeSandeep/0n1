import { describe, expect, it } from "vitest";
import { canConnect, defaultParams, paramsSchema } from "../model/component.ts";
import { componentDefinitions, registry } from "./index.ts";

const def = (type: string) => registry.require(type);

describe("v1 components", () => {
  it("are the planned components, in palette order", () => {
    expect(componentDefinitions.map((d) => d.type)).toEqual([
      "client",
      "load-balancer",
      "api-gateway",
      "cdn",
      "dns",
      "rate-limiter",
      "circuit-breaker",
      "service",
      "worker",
      "database",
      "sharded-database",
      "cache",
      "read-replica",
      "search-index",
      "object-storage",
      "queue",
      "pubsub",
    ]);
    expect([...registry.byCategory()].map(([category, defs]) => [category, defs.length])).toEqual([
      ["traffic", 1],
      ["network", 6],
      ["compute", 2],
      ["data", 6],
      ["messaging", 2],
    ]);
  });

  describe.each(componentDefinitions.map((d) => [d.displayName, d] as const))("%s", (_, d) => {
    it("has defaults that satisfy its own parameter schema", () => {
      const schema = paramsSchema(d);
      expect(schema.parse({})).toEqual(defaultParams(d));
      expect(schema.parse(defaultParams(d))).toEqual(defaultParams(d));
    });

    it("has plain copy: one-sentence description and a modelling note", () => {
      expect(d.description).toMatch(/^[A-Z].*\.$/);
      expect(d.description.length).toBeLessThanOrEqual(100);
      expect(d.modelNote.length).toBeGreaterThan(d.description.length);
      for (const spec of Object.values(d.params)) {
        expect(spec.label.trim()).not.toBe("");
        if (spec.help) expect(spec.help).toMatch(/\.$/);
      }
    });

    it("can take part in a system", () => {
      const sends = d.connections.outgoing.length > 0;
      const receivedFrom = componentDefinitions.filter((other) =>
        other.connections.outgoing.includes(d.type),
      );
      expect(sends || receivedFrom.length > 0).toBe(true);
      if (d.connections.incoming) expect(receivedFrom.length).toBeGreaterThan(0);
    });
  });
});

describe("connection rules", () => {
  it.each([
    ["client", "load-balancer"],
    ["client", "cdn"],
    ["cdn", "load-balancer"],
    ["load-balancer", "service"],
    ["api-gateway", "service"],
    ["service", "cache"],
    ["service", "database"],
    ["service", "read-replica"],
    ["service", "queue"],
    ["database", "read-replica"],
    ["queue", "worker"],
    ["worker", "database"],
  ])("%s → %s is allowed", (source, target) => {
    expect(canConnect(def(source), def(target))).toEqual({ ok: true });
  });

  it.each([
    ["service", "client", "Client doesn't take requests."],
    ["database", "client", "Client doesn't take requests."],
    ["cache", "database", "Cache doesn't send requests to other components."],
    ["read-replica", "database", "Read replica doesn't send requests to other components."],
    ["client", "database", "Client can't send requests to a database."],
    ["client", "queue", "Client can't send requests to a queue."],
    ["queue", "service", "Queue can't send requests to a service."],
    ["service", "cdn", "Service can't send requests to a CDN."],
    ["load-balancer", "database", "Load balancer can't send requests to a database."],
  ])("%s → %s is refused", (source, target, reason) => {
    expect(canConnect(def(source), def(target))).toEqual({ ok: false, reason });
  });
});
