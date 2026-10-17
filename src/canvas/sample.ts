import { registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";

/**
 * The URL shortener from the mockup, for development (`?sample`) and
 * end-to-end tests. Real blueprints arrive in S33.
 */
export function sampleSystem(): SystemDocument {
  const node = (id: string, type: string, name: string, x: number, y: number) => ({
    id,
    type,
    name,
    position: { x, y },
    params: defaultParams(registry.require(type)),
  });
  const edge = (source: string, target: string) => ({
    id: `${source}-${target}`,
    source,
    target,
  });

  return {
    ...createSystemDocument({ id: "sample", name: "URL shortener" }),
    nodes: [
      node("users", "client", "Users", 56, 328),
      node("lb", "load-balancer", "Load balancer", 328, 328),
      node("api-1", "service", "Shortener API · 1", 600, 192),
      node("api-2", "service", "Shortener API · 2", 600, 472),
      node("cache", "cache", "Link cache", 872, 112),
      node("db", "database", "Links DB", 872, 392),
    ],
    edges: [
      edge("users", "lb"),
      edge("lb", "api-1"),
      edge("lb", "api-2"),
      edge("api-1", "cache"),
      edge("api-1", "db"),
      edge("api-2", "cache"),
      edge("api-2", "db"),
    ],
  };
}
