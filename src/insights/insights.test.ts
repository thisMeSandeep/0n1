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

describe("resilience components", () => {
  const guarded = systemDocument(
    {
      users: { type: "client", name: "Users" },
      limiter: { type: "rate-limiter", name: "Limiter", params: { limit: 300 } },
      api: { type: "service", name: "API" },
      breaker: { type: "circuit-breaker", name: "Breaker", params: { coolDown: 5 } },
      payments: { type: "service", name: "Payments" },
    },
    [
      ["users", "limiter"],
      ["limiter", "api"],
      ["api", "breaker"],
      ["breaker", "payments"],
    ],
  );

  it("an open breaker is protecting its dependency, not failing", () => {
    const open = snapshot(20_000, {
      breaker: metrics({ breakerState: "open", failures: 90, drops: 90 }),
      api: metrics(),
    });
    expect(findInsights(open, guarded)).toEqual([
      expect.objectContaining({
        id: "breaker:breaker",
        severity: "warn",
        title: "Breaker is open.",
        detail: "It fails calls at once so Payments gets a break, and tries again after 5 s.",
      }),
    ]);
  });

  it("users getting errors (not timeouts) are told where they start", () => {
    const failing = snapshot(20_000, {
      users: metrics({ errorRate: 0.4, latency: { mean: 5, p50: 4, p95: 9, p99: 12 } }),
      breaker: metrics({ breakerState: "open", failures: 80, drops: 80 }),
    });
    expect(findInsights(failing, guarded)[0]).toMatchObject({
      id: "errors:users",
      title: "40% of requests from Users fail.",
      detail: "Most of them fail at Breaker.",
      nodeId: "breaker",
    });
  });

  it("a limiter turning traffic away is doing its job", () => {
    const limited = snapshot(20_000, { limiter: metrics({ failures: 40, drops: 40 }) });
    expect(findInsights(limited, guarded)[0]).toMatchObject({
      id: "limited:limiter",
      severity: "warn",
      title: "Limiter is turning away 40% of requests.",
      detail: "They're over its limit of 300/s.",
    });
  });
});

describe("data components", () => {
  it("a hot shard is named, with the fix that fits how keys are spread", () => {
    const sharded = (spread: string) =>
      systemDocument(
        {
          users: { type: "client", name: "Users" },
          api: { type: "service", name: "API" },
          db: { type: "sharded-database", name: "Orders DB", params: { spread } },
        },
        [
          ["users", "api"],
          ["api", "db"],
        ],
      );
    const hot = snapshot(20_000, {
      db: metrics({
        utilization: 0.98,
        waiting: 300,
        throughput: 600,
        shards: [0.98, 0.2, 0.25, 0.15],
      }),
    });
    const byRange = findInsights(hot, sharded("range"))[0];
    expect(byRange).toMatchObject({
      title: "Orders DB has a shard with no free connections.",
      fix: "Spread keys by hash, so the popular keys aren't all on one shard.",
    });
    expect(byRange?.detail).toContain("Shard 1 of 4 is 98% busy; the others average 20%.");
    expect(findInsights(hot, sharded("hash"))[0]?.fix).toBe(
      "A few very popular keys live on that shard. Put a cache in front of it.",
    );
    // Not overloaded yet, but heading there because of one shard.
    const warm = snapshot(20_000, {
      db: metrics({ utilization: 0.88, shards: [0.88, 0.1, 0.12, 0.05] }),
    });
    expect(findInsights(warm, sharded("range"))[0]).toMatchObject({
      id: "near:db",
      title: "Orders DB has a hot shard.",
      fix: "Spread keys by hash, so the popular keys aren't all on one shard.",
    });
  });

  it("a database scanning for searches is pointed at a search index", () => {
    const searching = systemDocument(
      {
        users: { type: "client", name: "Users", params: { searchShare: 30 } },
        api: { type: "service", name: "API" },
        db: { type: "database", name: "Products DB" },
      },
      [
        ["users", "api"],
        ["api", "db"],
      ],
    );
    const busy = snapshot(20_000, {
      db: metrics({ utilization: 1, waiting: 200, throughput: 80 }),
    });
    expect(findInsights(busy, searching)[0]?.fix).toMatch(
      /^Searches scan every row\. Add a search index/,
    );
  });

  it("stale search results are explained by the indexing delay", () => {
    const indexed = systemDocument(
      {
        users: { type: "client", name: "Users", params: { searchShare: 30 } },
        api: { type: "service", name: "API" },
        index: { type: "search-index", name: "Search", params: { indexingDelay: 5000 } },
      },
      [
        ["users", "api"],
        ["api", "index"],
      ],
    );
    const stale = snapshot(20_000, { index: metrics({ staleReads: 0.12 }) });
    expect(findInsights(stale, indexed)[0]).toMatchObject({
      title: "12% of searches on Search miss recent writes.",
      detail: "Writes take about 5 s to be indexed.",
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

  it("keeps one note per component when its situation changes", () => {
    const tracker = new InsightTracker();
    const overloaded = (time: number) =>
      snapshot(time, {
        users: metrics(),
        api: metrics(),
        db: metrics({ utilization: 0.95, waiting: 20 }),
      });
    for (let t = 10_000; t <= 13_000; t += 500) tracker.update(overloaded(t), doc);
    // Now merely close to its limit: the overloaded note lingers, but only one shows.
    const shown = tracker.update(busy(13_500), doc);
    expect(shown.filter((i) => i.nodeId === "db")).toHaveLength(1);
    expect(shown[0]?.id).toBe("overloaded:db"); // the new one hasn't held long enough yet
    for (let t = 14_000; t <= 16_000; t += 500) tracker.update(busy(t), doc);
    expect(ids(tracker.update(busy(16_500), doc))).toEqual(["near:db"]);
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

/** Run a document for `ms`, feeding every 250 ms snapshot to a tracker; `at` acts along the way. */
function watch(
  doc: SystemDocument,
  ms: number,
  at: (engine: Engine, time: number) => void = () => {},
): Insight[] {
  const { model } = compile(doc, registry);
  if (!model) throw new Error("didn't compile");
  const engine = new Engine(model);
  const tracker = new InsightTracker();
  let shown: Insight[] = [];
  for (let t = 250; t <= ms; t += 250) {
    at(engine, t);
    engine.runUntil(t);
    shown = tracker.update(engine.snapshot(), doc);
  }
  return shown;
}

describe("messaging and network components", () => {
  /** Every request a write, published to Events; Mailer can only keep up with a tenth of them. */
  const fanOut = (events: Record<string, unknown> = {}) =>
    systemDocument(
      {
        users: { type: "client", name: "Users", params: { rate: 50, readShare: 0 } },
        api: { type: "service", name: "API" },
        events: { type: "pubsub", name: "Events", params: events },
        search: { type: "worker", name: "Indexer", params: { concurrency: 8, workTime: 10 } },
        mail: { type: "worker", name: "Mailer", params: { concurrency: 1, workTime: 200 } },
      },
      [
        ["users", "api"],
        ["api", "events"],
        ["events", "search"],
        ["events", "mail"],
      ],
    );

  it("a slow subscriber is named as falling behind, and the others aren't held up", () => {
    const insights = watch(fanOut(), 20_000);
    expect(ids(insights)).toEqual(["backlog:events:mail"]);
    expect(insights[0]).toMatchObject({
      severity: "fail",
      nodeId: "mail",
      title: "Mailer is falling behind on Events.",
      fix: "Raise its Jobs at once, or subscribe a queue instead and put more workers behind it.",
    });
    expect(insights[0]?.detail).toMatch(
      /^\d+ messages are waiting for it, about \d+ more each second\. The other subscribers aren't held up\. The oldest has waited/,
    );
  });

  it("a subscriber whose backlog is full is told it's missing messages", () => {
    const insights = watch(fanOut({ capacity: 200 }), 20_000);
    expect(insights[0]).toMatchObject({
      id: "backlog:events:mail",
      title: "Mailer is missing messages from Events.",
    });
    expect(insights[0]?.detail).toContain("Its backlog of 200 is full");
  });

  const resolving = (backup = false) =>
    systemDocument(
      {
        users: { type: "client", name: "Users" },
        api: { type: "service", name: "API" },
        dns: { type: "dns", name: "DNS", params: { ttl: 20 } },
        ...(backup ? { backup: { type: "dns", name: "Backup DNS", params: { ttl: 20 } } } : {}),
      },
      [["users", "dns"], ...(backup ? ([["users", "backup"]] as const) : []), ["users", "api"]],
    );
  const outageAt = (time: number) => (engine: Engine, t: number) => {
    if (t === time) engine.takeDown("dns");
  };

  it("DNS down: users carry on while their answers last, then can't reach the system", () => {
    const early = watch(resolving(), 9000, outageAt(5000));
    expect(ids(early)).toEqual(["down:dns"]);
    expect(early[0]?.detail).toMatch(
      /^Users with a cached answer carry on, and the rest can't reach the system\. [5-9]\d% still have one; they all expire within 20 s\.$/,
    );
    expect(early[0]?.fix).toContain("A second DNS, or a longer Answer TTL");

    const later = watch(resolving(), 30_000, outageAt(5000));
    expect(ids(later)).toEqual(["down:dns", "errors:users"]);
    expect(later[0]?.detail).toBe(
      "Every cached answer has expired, so no one can reach the system.",
    );
    expect(later[1]).toMatchObject({
      nodeId: "dns",
      title: "100% of requests from Users fail.",
      detail: "Its users can't look up where to send them: DNS is down.",
    });
  });

  it("DNS down with a second one: a warning, since clients look there instead", () => {
    const insights = watch(resolving(true), 30_000, outageAt(5000));
    expect(insights).toEqual([
      expect.objectContaining({
        id: "down:dns",
        severity: "warn",
        detail: "Its clients look up addresses at Backup DNS instead.",
      }),
    ]);
  });
});
