import { registry } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument, type SystemDocument } from "../model/document.ts";

/**
 * The URL shortener from the mockup, for development (`?sample`) and
 * end-to-end tests: a fixed fixture they rely on. The URL shortener users
 * open is a blueprint (src/blueprints/catalog), and differs.
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

/**
 * A 30-component system for performance checks (`?sample=large`): two
 * clients, two load balancers, twelve services in four groups, each with
 * its own cache and database, and two queues feeding four workers.
 */
export function largeSampleSystem(): SystemDocument {
  const nodes: SystemDocument["nodes"] = [];
  const edges: SystemDocument["edges"] = [];
  const add = (id: string, type: string, name: string, x: number, y: number) =>
    nodes.push({
      id,
      type,
      name,
      position: { x, y },
      params: defaultParams(registry.require(type)),
    });
  const connect = (source: string, target: string) =>
    edges.push({ id: `${source}-${target}`, source, target });

  for (const i of [1, 2]) {
    add(`users-${i}`, "client", `Users ${i}`, 0, i * 300 - 150);
    add(`lb-${i}`, "load-balancer", `Load balancer ${i}`, 280, i * 300 - 150);
  }
  for (const i of [1, 2]) for (const j of [1, 2]) connect(`users-${i}`, `lb-${j}`);
  for (let g = 0; g < 4; g++) {
    add(`cache-${g}`, "cache", `Cache ${g + 1}`, 1400, g * 150);
    add(`db-${g}`, "database", `Database ${g + 1}`, 1660, g * 150);
    for (let k = 0; k < 3; k++) {
      const id = `api-${g * 3 + k}`;
      add(id, "service", `API ${g * 3 + k + 1}`, 560 + k * 260, g * 150);
      connect(`lb-${(g % 2) + 1}`, id);
      connect(id, `cache-${g}`);
      connect(id, `db-${g}`);
    }
  }
  for (const q of [0, 1]) {
    add(`queue-${q}`, "queue", `Queue ${q + 1}`, 560 + q * 520, 660);
    for (const k of [0, 1]) connect(`api-${q * 6 + k}`, `queue-${q}`);
    for (const w of [0, 1]) {
      const id = `worker-${q * 2 + w}`;
      add(id, "worker", `Worker ${q * 2 + w + 1}`, 820 + q * 520, 600 + w * 130);
      connect(`queue-${q}`, id);
      connect(id, `db-${q * 2 + w}`);
    }
  }
  return { ...createSystemDocument({ id: "sample-large", name: "Large system" }), nodes, edges };
}
