import { describe, expect, it } from "vitest";
import { findBlueprint } from "../blueprints/catalog.ts";
import { blueprintDocument } from "../blueprints/format.ts";
import { registry } from "../components/index.ts";
import { compile } from "../engine/compile.ts";
import { type MetricsSnapshot, NO_FAULTS, type NodeMetrics } from "../engine/metrics/recorder.ts";
import { Engine } from "../engine/runtime/engine.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import { systemDocument } from "../engine/testing.ts";
import type { SystemDocument } from "../model/document.ts";
import { findInsights, type Insight } from "./rules.ts";
import { APPEAR_MS, InsightTracker, LINGER_MS } from "./tracker.ts";

const metrics = (patch: Partial<NodeMetrics> = {}): NodeMetrics => ({
  arrivals: 100,
  throughput: 100,
  errorRate: 0,
  drops: 0,
  failures: 0,
  latency: { mean: 10, p50: 8, p95: 20, p99: 42 },
  utilization: 0.3,
  inFlight: 3,
  waiting: 0,
  totals: { arrived: 0, completed: 0, failed: 0, dropped: 0 },
  ...patch,
});

const snapshot = (
  time: number,
  nodes: Record<string, NodeMetrics>,
  faults = NO_FAULTS,
): MetricsSnapshot => ({
  time,
  sampling: { weight: 1 },
  system: { goodput: 0, throughput: 0, errorRate: 0, latency: null },
  nodes,
  edges: {},
  faults,
});

const doc = systemDocument(
  {
    users: { type: "client", name: "Users", params: { timeout: 2000 } },
    api: { type: "service", name: "API" },
    db: { type: "database", name: "Links DB" },
  },
  [
    ["users", "api"],
    ["api", "db"],
  ],
);

const ids = (insights: readonly Insight[]) => insights.map((i) => i.id);

describe("insight rules", () => {
  it("say nothing when all is well", () => {
    const calm = snapshot(20_000, { users: metrics(), api: metrics(), db: metrics() });
    expect(findInsights(calm, doc)).toEqual([]);
  });

  it("name the real bottleneck, not the components waiting on it", () => {
    const melted = snapshot(20_000, {
      users: metrics({ errorRate: 0.9, latency: { mean: 2000, p50: 2000, p95: 2000, p99: 2000 } }),
      api: metrics({ utilization: 1, waiting: 500 }),
      db: metrics({ utilization: 1, waiting: 240, throughput: 775 }),
    });
    const insights = findInsights(melted, doc);
    expect(ids(insights)).toEqual(["overloaded:db", "timeouts:users"]);
    expect(insights[0]).toMatchObject({
      severity: "fail",
      nodeId: "db",
      title: "Links DB has no free connections.",
      detail: "240 requests are waiting, about 310 ms each.", // Little's law: 240 ÷ 775/s
      fix: "Add a cache, a read replica, or more connections.",
    });
    expect(insights[1]).toMatchObject({
      nodeId: "db",
      title: "Requests from Users are timing out.",
      detail: "90% give up after 2 s. The wait is in Links DB.",
    });
  });

  it("warn when something is close to its limit", () => {
    const busy = snapshot(20_000, {
      users: metrics(),
      api: metrics(),
      db: metrics({ utilization: 0.88 }),
    });
    expect(findInsights(busy, doc)[0]).toMatchObject({ id: "near:db", severity: "warn" });
  });

  it("tell turning requests away apart from failing them", () => {
    const full = snapshot(20_000, { api: metrics({ failures: 10, drops: 10 }) });
    expect(findInsights(full, doc)[0]).toMatchObject({
      title: "API is turning away 10% of requests.",
      detail: "Its line is full.",
    });
    const erroring = snapshot(20_000, { db: metrics({ failures: 20 }) });
    expect(findInsights(erroring, doc)[0]).toMatchObject({
      title: "Links DB fails 20% of requests.",
      detail: "That's its own error rate.",
    });
  });

  it("say when a component is down or a connection is cut", () => {
    const broken = snapshot(
      20_000,
      { api: metrics({ down: true }), db: metrics() },
      { ...NO_FAULTS, cut: ["api→db"] },
    );
    expect(ids(findInsights(broken, doc))).toEqual(["down:api", "cut:api->db"]);
  });

  it("explain a cache that barely helps, once it has warmed up", () => {
    const withCache: SystemDocument = systemDocument(
      {
        users: { type: "client", name: "Users", params: { keyPopularity: "uniform" } },
        api: { type: "service" },
        cache: { type: "cache", name: "Link cache" },
      },
      [
        ["users", "api"],
        ["api", "cache"],
      ],
    );
    const cold = snapshot(5000, { cache: metrics({ hitRatio: 0.05 }) });
    expect(findInsights(cold, withCache)).toEqual([]);
    const warm = snapshot(20_000, { cache: metrics({ hitRatio: 0.05 }) });
    expect(findInsights(warm, withCache)[0]).toMatchObject({
      title: "Link cache answers only 5% of lookups.",
      detail: "Every key is equally popular, so it can't keep the ones that matter.",
    });
  });
});

describe("the insight tracker", () => {
  const busy = (time: number) =>
    snapshot(time, { users: metrics(), api: metrics(), db: metrics({ utilization: 0.88 }) });
  const calm = (time: number) =>
    snapshot(time, { users: metrics(), api: metrics(), db: metrics() });

  it("shows an insight only once it has held for a while, and keeps it a while after", () => {
    const tracker = new InsightTracker();
    expect(tracker.update(busy(10_000), doc)).toEqual([]);
    expect(tracker.update(busy(10_000 + APPEAR_MS - 250), doc)).toEqual([]);
    expect(ids(tracker.update(busy(10_000 + APPEAR_MS), doc))).toEqual(["near:db"]);
    const cleared = 10_000 + APPEAR_MS + 250;
    expect(ids(tracker.update(calm(cleared), doc))).toEqual(["near:db"]); // lingers
    expect(tracker.update(calm(cleared + LINGER_MS + 250), doc)).toEqual([]);
  });

  it("starts over when time goes back", () => {
    const tracker = new InsightTracker();
    tracker.update(busy(10_000), doc);
    tracker.update(busy(13_000), doc);
    expect(tracker.update(busy(500), doc)).toEqual([]);
  });
});

/** Run a blueprint, feeding every 250 ms snapshot to a tracker; returns what it shows at the end. */
function story(
  id: string,
  { traffic, ms, change }: { traffic: number; ms: number; change?: (doc: SystemDocument) => void },
): Insight[] {
  const blueprint = findBlueprint(id);
  if (!blueprint) throw new Error(`No blueprint ${id}`);
  const doc = blueprintDocument(blueprint, registry, {
    id: "story",
    name: blueprint.title,
    now: 0,
  });
  change?.(doc);
  const { model } = compile(doc, registry);
  if (!model) throw new Error("didn't compile");
  const engine = new Engine(model);
  engine.setTrafficMultiplier(traffic);
  // The run's slowest recent request (S42), as the lab passes it on.
  let slow: TraceRecord | null = null;
  engine.onTrace = (trace) => {
    if (trace.reason === "slow") slow = trace;
  };
  const tracker = new InsightTracker();
  let shown: Insight[] = [];
  for (let t = 250; t <= ms; t += 250) {
    engine.runUntil(t);
    shown = tracker.update(engine.snapshot(), doc, slow);
  }
  return shown;
}

describe("where a slow request's time went", () => {
  it("names a component whose own work is slow, even when nothing is overloaded", () => {
    const doc = systemDocument(
      {
        users: { type: "client", name: "Users", params: { rate: 50, timeout: 10_000 } },
        api: { type: "service", name: "Report API", params: { concurrency: 256, workTime: 700 } },
      },
      [["users", "api"]],
    );
    const { model } = compile(doc, registry);
    if (!model) throw new Error("didn't compile");
    const engine = new Engine(model);
    let slow: TraceRecord | null = null;
    engine.onTrace = (trace) => {
      if (trace.reason === "slow") slow = trace;
    };
    const tracker = new InsightTracker();
    let shown: Insight[] = [];
    for (let t = 250; t <= 15_000; t += 250) {
      engine.runUntil(t);
      shown = tracker.update(engine.snapshot(), doc, slow);
    }
    expect(shown[0]).toMatchObject({
      id: "slow:api",
      severity: "warn",
      title: expect.stringMatching(/^Requests are slow: p99 is .* s\.$/),
      detail: expect.stringMatching(/was spent being worked on at Report API\.$/),
      fix: "That's its own work: a cache in front of it would let requests skip it.",
    });
  });
});

describe("each blueprint's break gets the insight you'd hope for", () => {
  it("URL shortener at 500%: the database is the bottleneck, and users time out because of it", () => {
    const insights = story("url-shortener", { traffic: 5, ms: 20_000 });
    expect(insights[0]).toMatchObject({
      id: "overloaded:db",
      title: "Links DB has no free connections.",
    });
    expect(insights.find((i) => i.id === "timeouts:users")?.detail).toContain(
      "The wait is in Links DB.",
    );
    // The services are waiting on the database: they're not blamed.
    expect(ids(insights)).not.toContain("overloaded:api-1");
    // Where a slow request's time went, told once, and put down to the database.
    expect(insights[0]?.detail).toMatch(
      /In a slow request just now, \d+% of its .* was spent waiting in line at Shortener API · [12], whose requests are all waiting on Links DB\./,
    );
    expect(insights.filter((i) => i.detail.includes("In a slow request"))).toHaveLength(1);
    expect(ids(insights).some((id) => id.startsWith("slow:"))).toBe(false);
  });

  it("URL shortener at 100%: nothing to say", () => {
    expect(story("url-shortener", { traffic: 1, ms: 20_000 })).toEqual([]);
  });

  it("Write-heavy system at 200%: the primary can't keep up with the writes", () => {
    const insights = story("write-heavy", { traffic: 2, ms: 20_000 });
    expect(insights[0]).toMatchObject({ id: "overloaded:primary", nodeId: "primary" });
    expect(ids(insights)).not.toContain("overloaded:replica");
    // Not "add a cache or a replica": that's exactly what doesn't help here.
    expect(insights[0]?.fix).toContain("Put a queue in front");
  });

  it("Job pipeline at 200%: the queue is falling behind", () => {
    const insights = story("job-pipeline", { traffic: 2, ms: 30_000 });
    const backlog = insights.find((i) => i.id === "backlog:queue");
    expect(backlog).toMatchObject({ severity: "fail", title: "Jobs queue is falling behind." });
    expect(backlog?.fix).toBe("Add a worker, or raise Jobs at once.");
    expect(backlog?.detail).toContain(
      "Resizer · 1 and Resizer · 2 are busy with every job they can take.",
    );
    // Told once, in the queue's note, rather than once per worker.
    expect(ids(insights)).not.toContain("overloaded:worker-1");
  });
});
