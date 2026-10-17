import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import { Engine } from "../engine/runtime/engine.ts";
import { defaultParams, type Params } from "../model/component.ts";
import type { SystemDocument } from "../model/document.ts";
import { findBlueprint } from "./catalog.ts";
import { blueprintDocument } from "./format.ts";

/*
 * Each shipped blueprint tells a story: it copes, it breaks, and its
 * suggested experiments fix it. These tests run those experiments on the
 * engine, so a change to a component's model can't quietly break a story.
 */

function blueprint(id: string): SystemDocument {
  const found = findBlueprint(id);
  if (!found) throw new Error(`No blueprint "${id}"`);
  return blueprintDocument(found, registry, { id: "story", name: found.title, now: 0 });
}

/** Add a component with default settings (plus any given), as dragging it in would. */
function add(doc: SystemDocument, id: string, type: string, params: Params = {}): void {
  doc.nodes.push({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    params: { ...defaultParams(registry.require(type)), ...params },
  });
}

function connect(doc: SystemDocument, source: string, target: string): void {
  doc.edges.push({ id: `${source}-${target}`, source, target });
}

function run(doc: SystemDocument, traffic = 1): Engine {
  const { model, errors } = compile(doc, registry);
  if (!model) throw new Error(errors.map((e) => e.message).join("\n"));
  const engine = new Engine(model);
  engine.setTrafficMultiplier(traffic);
  return engine;
}

function at(engine: Engine, ms: number): MetricsSnapshot {
  engine.runUntil(ms);
  return engine.snapshot();
}

const node = (snapshot: MetricsSnapshot, id: string) => {
  const metrics = snapshot.nodes[id];
  if (!metrics) throw new Error(`No metrics for ${id}`);
  return metrics;
};

describe("URL shortener: the database melts until you add a cache", () => {
  const withCache = () => {
    const doc = blueprint("url-shortener");
    add(doc, "cache", "cache");
    connect(doc, "api-1", "cache");
    connect(doc, "api-2", "cache");
    return doc;
  };

  it("copes at first, and at 300% the database is busy but keeps up", () => {
    const calm = at(run(blueprint("url-shortener")), 20_000);
    expect(calm.system.errorRate).toBe(0);
    expect(node(calm, "db").utilization).toBeLessThan(0.5);

    const busy = at(run(blueprint("url-shortener"), 3), 20_000);
    expect(busy.system.errorRate).toBe(0);
    expect(node(busy, "db").utilization).toBeGreaterThan(0.7);
    expect(busy.system.latency?.p99).toBeLessThan(200);
  });

  it("at 500% the database melts and every request times out", () => {
    const melted = at(run(blueprint("url-shortener"), 5), 20_000);
    expect(node(melted, "db").utilization).toBeGreaterThan(0.95);
    expect(melted.system.errorRate).toBeGreaterThan(0.9);
  });

  it("a cache with default settings fixes it", () => {
    const fixed = at(run(withCache(), 5), 20_000);
    expect(fixed.system.errorRate).toBeLessThan(0.001);
    expect(fixed.system.latency?.p99).toBeLessThan(100); // "around 50 ms"
    expect(node(fixed, "db").utilization).toBeLessThan(0.7);
    expect(node(fixed, "cache").hitRatio).toBeGreaterThan(0.5);
  });

  it("taking the cache down melts the database again", () => {
    const engine = run(withCache(), 5);
    at(engine, 10_000);
    engine.takeDown("cache");
    const melted = at(engine, 30_000);
    expect(node(melted, "db").utilization).toBeGreaterThan(0.95);
    expect(melted.system.errorRate).toBeGreaterThan(0.5);
  });

  it("with no popular links the cache can't save it", () => {
    const engine = run(withCache(), 5);
    engine.updateParams("users", { keyPopularity: "uniform" });
    const melted = at(engine, 20_000);
    expect(node(melted, "cache").hitRatio).toBeLessThan(0.2);
    expect(node(melted, "db").utilization).toBeGreaterThan(0.95);
  });
});

describe("Write-heavy system: a replica can't help, a queue can", () => {
  const withQueue = () => {
    const doc = blueprint("write-heavy");
    add(doc, "queue", "queue");
    add(doc, "worker", "worker", { concurrency: 7, workTime: 1 });
    connect(doc, "api-1", "queue");
    connect(doc, "api-2", "queue");
    connect(doc, "queue", "worker");
    connect(doc, "worker", "primary");
    return doc;
  };

  it("copes at first", () => {
    const calm = at(run(blueprint("write-heavy")), 20_000);
    expect(calm.system.errorRate).toBe(0);
    expect(node(calm, "primary").utilization).toBeLessThan(0.8);
  });

  it("at 200% the primary melts, while the replica is barely busy", () => {
    const melted = at(run(blueprint("write-heavy"), 2), 20_000);
    expect(node(melted, "primary").utilization).toBeGreaterThan(0.95);
    expect(node(melted, "replica").utilization).toBeLessThan(0.2);
    expect(melted.system.errorRate).toBeGreaterThan(0.9);
  });

  it("a queue absorbs the load: users are answered at once while the backlog grows, then it drains", () => {
    const engine = run(withQueue(), 2);
    const spike = at(engine, 20_000);
    expect(spike.system.errorRate).toBe(0);
    expect(spike.system.latency?.p99).toBeLessThan(100);
    expect(node(spike, "primary").utilization).toBeLessThan(0.9); // never more than 7 of 8 connections
    expect(node(spike, "queue").waiting).toBeGreaterThan(1000);

    engine.setTrafficMultiplier(1);
    const drained = at(engine, 80_000); // "in under a minute"
    expect(node(drained, "queue").waiting).toBeLessThan(50);
    expect(drained.system.errorRate).toBe(0);
  });
});

describe("Job pipeline: the backlog grows when workers fall behind", () => {
  it("keeps up at first", () => {
    const calm = at(run(blueprint("job-pipeline")), 30_000);
    expect(node(calm, "queue").waiting).toBeLessThan(10);
  });

  it("at 200% users still get quick answers, but the backlog keeps growing", () => {
    const engine = run(blueprint("job-pipeline"), 2);
    const early = node(at(engine, 15_000), "queue").waiting;
    const later = at(engine, 30_000);
    expect(early).toBeGreaterThan(100);
    expect(node(later, "queue").waiting).toBeGreaterThan(early * 1.4);
    expect(node(later, "queue").oldestJobAge).toBeGreaterThan(3000);
    expect(later.system.latency?.p99).toBeLessThan(100);
    expect(later.system.errorRate).toBe(0);
  });

  it("more jobs at once on each worker, while running, drains it", () => {
    const engine = run(blueprint("job-pipeline"), 2);
    expect(node(at(engine, 30_000), "queue").waiting).toBeGreaterThan(200);
    engine.updateParams("worker-1", { concurrency: 8 });
    engine.updateParams("worker-2", { concurrency: 8 });
    expect(node(at(engine, 50_000), "queue").waiting).toBeLessThan(20);
  });

  it("a third worker keeps the backlog near empty", () => {
    const doc = blueprint("job-pipeline");
    add(doc, "worker-3", "worker", { workTime: 200 });
    connect(doc, "queue", "worker-3");
    connect(doc, "worker-3", "db");
    const fixed = at(run(doc, 2), 30_000);
    expect(node(fixed, "queue").waiting).toBeLessThan(20);
  });
});
