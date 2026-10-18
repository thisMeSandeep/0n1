import { describe, expect, it } from "vitest";
import { averageShapeFactor, type ShapeSettings, shapeFactor } from "../components/client/shape.ts";
import { componentDefinitions, registry } from "../components/index.ts";
import { type NodeSpec, runningSystem, systemDocument } from "../engine/testing.ts";
import { formatData, formatMoney } from "./format.ts";
import { componentCost, machineSize, systemCost } from "./model.ts";
import { PRICES, SECONDS_PER_MONTH } from "./prices.ts";
import { estimateUsage } from "./usage.ts";

const MONTH = SECONDS_PER_MONTH;
/** A dollar amount, give or take floating point. */
const near = (dollars: number) => expect.closeTo(dollars, 6);
/** GB a month of 10 KB answers at `perSecond`. */
const answersGb = (perSecond: number) => (perSecond * MONTH * 10) / 1e6;

/** Users at `rate` (all reads unless said otherwise) → the components given, in a chain. */
function chain(rate: number, nodes: Record<string, NodeSpec>, users: Record<string, unknown> = {}) {
  const ids = Object.keys(nodes);
  return systemDocument(
    { users: { type: "client", params: { rate, readShare: 100, ...users } }, ...nodes },
    ["users", ...ids].slice(1).map((id, i) => [i === 0 ? "users" : (ids[i - 1] as string), id]),
  );
}

const costOf = (doc: ReturnType<typeof chain>, id: string) =>
  systemCost(doc, registry).components.find((c) => c.id === id)?.cost;

describe("each component's cost", () => {
  it("a service: a machine sized for its requests at once, and its answers to users", () => {
    const doc = chain(100, { api: { type: "service" } });
    expect(costOf(doc, "api")?.lines).toEqual([
      { label: "1 vCPU, for 16 requests at once", monthly: near(PRICES.computeVcpuMonth) },
      { label: "2.63 TB of answers to users", monthly: near(answersGb(100) * PRICES.egressPerGb) },
    ]);
    // Behind something else, its answers don't go to the internet itself.
    const behind = chain(100, { lb: { type: "load-balancer" }, api: { type: "service" } });
    expect(costOf(behind, "api")?.monthly).toBe(35);
  });

  it("machines come in sizes that double", () => {
    expect([0.1, 1, 1.5, 2, 3, 64, 65].map(machineSize)).toEqual([1, 1, 2, 2, 4, 64, 128]);
    const big = chain(1, { api: { type: "service", params: { concurrency: 100 } } });
    expect(costOf(big, "api")?.lines[0]).toEqual({
      label: "4 vCPUs, for 100 requests at once",
      monthly: near(4 * 35),
    });
  });

  it("a worker: a machine sized for its jobs at once", () => {
    const doc = chain(10, {
      api: { type: "service" },
      jobs: { type: "queue" },
      work: { type: "worker", params: { concurrency: 1 } },
    });
    expect(costOf(doc, "work")?.lines).toEqual([
      { label: "1 vCPU, for 1 job at once", monthly: near(35) },
    ]);
  });

  it("a load balancer: itself, what it processes, and answers to users", () => {
    const doc = chain(100, { lb: { type: "load-balancer" }, api: { type: "service" } });
    expect(costOf(doc, "lb")?.lines).toEqual([
      { label: "The load balancer itself", monthly: near(16) },
      { label: "2.63 TB processed", monthly: near(answersGb(100) * PRICES.loadBalancerPerGb) },
      { label: "2.63 TB of answers to users", monthly: near(answersGb(100) * PRICES.egressPerGb) },
    ]);
  });

  it("an API gateway: per request", () => {
    const doc = chain(100, { gw: { type: "api-gateway" }, api: { type: "service" } });
    expect(costOf(doc, "gw")?.lines[0]).toEqual({
      label: "263M requests a month",
      monthly: near(262.8),
    });
  });

  it("a rate limiter: its rule and what it inspects; only what it lets through costs further on", () => {
    const doc = chain(2000, {
      limiter: { type: "rate-limiter", params: { limit: 1000 } },
      gw: { type: "api-gateway" },
      api: { type: "service" },
    });
    const lines = costOf(doc, "limiter")?.lines ?? [];
    expect(lines.slice(0, 2)).toEqual([
      { label: "The rate-limiting rule", monthly: near(5) },
      { label: "5.26B requests inspected a month", monthly: near(2000 * MONTH * 0.6e-6) },
    ]);
    expect(costOf(doc, "gw")?.lines[0]?.monthly).toBeCloseTo(1000 * MONTH * 1e-6);
  });

  it("a circuit breaker costs nothing of its own", () => {
    const doc = chain(100, { breaker: { type: "circuit-breaker" }, api: { type: "service" } });
    expect(costOf(doc, "breaker")).toEqual({
      monthly: near(0),
      lines: [
        { label: "Runs inside your services, so it costs nothing of its own", monthly: near(0) },
      ],
    });
  });

  it("a CDN: requests, and data delivered at its origin's file size", () => {
    const doc = chain(100, {
      cdn: { type: "cdn", params: { hitRatio: 80 } },
      files: { type: "object-storage", params: { objectSize: 100 } },
    });
    const gb = (100 * MONTH * 100) / 1e6;
    expect(costOf(doc, "cdn")?.lines).toEqual([
      { label: "263M requests a month", monthly: near(262.8) },
      { label: "26.3 TB delivered to users", monthly: near(gb * PRICES.cdnPerGb) },
    ]);
    // Behind it, object storage stores the files and serves the misses: no internet transfer.
    expect(costOf(doc, "files")?.lines).toEqual([
      { label: "10 GB stored, 100k files", monthly: near(10 * PRICES.objectStorageGbMonth) },
      { label: "52.6M reads a month", monthly: near(20 * MONTH * 0.4e-6) },
      { label: "0 writes a month", monthly: near(0) },
    ]);
  });

  it("object storage writes cost more than reads", () => {
    const doc = chain(
      100,
      { api: { type: "service" }, files: { type: "object-storage" } },
      { readShare: 50 },
    );
    const lines = costOf(doc, "files")?.lines ?? [];
    expect(lines[1]?.monthly).toBeCloseTo(50 * MONTH * 0.4e-6);
    expect(lines[2]?.monthly).toBeCloseTo(50 * MONTH * 5e-6);
  });

  it("DNS: the zone and a trickle of lookups", () => {
    const doc = systemDocument(
      {
        users: { type: "client" },
        dns: { type: "dns", params: { ttl: 10 } },
        api: { type: "service" },
      },
      [
        ["users", "dns"],
        ["users", "api"],
      ],
    );
    // 100 groups of users, each looking up every 10 s.
    expect(costOf(doc, "dns")?.lines).toEqual([
      { label: "The hosted zone", monthly: near(0.5) },
      { label: "26.3M lookups a month", monthly: near(10 * MONTH * 0.4e-6) },
    ]);
  });

  it("databases and replicas: a managed machine for their connections, and storage", () => {
    const doc = chain(100, {
      api: { type: "service" },
      db: { type: "database" },
    });
    expect(costOf(doc, "db")?.lines).toEqual([
      { label: "2 vCPUs, for 50 connections", monthly: near(140) },
      { label: "20 GB of storage", monthly: near(20 * 0.12) },
    ]);
    // More data than the minimum: a row per distinct key.
    const big = chain(
      1,
      { api: { type: "service" }, db: { type: "read-replica" } },
      { keys: 100_000_000 },
    );
    expect(costOf(big, "db")?.lines[1]).toEqual({ label: "100 GB of storage", monthly: near(12) });
  });

  it("a sharded database: a machine and storage per shard", () => {
    const doc = chain(100, {
      api: { type: "service" },
      shards: { type: "sharded-database", params: { shards: 4, connections: 25 } },
    });
    expect(costOf(doc, "shards")?.lines).toEqual([
      { label: "4 × 1 vCPU, for 25 connections each", monthly: near(4 * 70) },
      { label: "4 × 20 GB of storage", monthly: near(4 * 20 * 0.12) },
    ]);
  });

  it("a search index: a search machine for its connections", () => {
    const doc = chain(100, { api: { type: "service" }, index: { type: "search-index" } });
    expect(costOf(doc, "index")?.lines).toEqual([
      { label: "2 vCPUs, for 32 connections", monthly: near(180) },
    ]);
  });

  it("a cache: memory for the keys it holds", () => {
    const small = chain(1, { api: { type: "service" }, cache: { type: "cache" } });
    expect(costOf(small, "cache")?.lines).toEqual([
      { label: "1 GB of memory, for 10.0k keys", monthly: near(17) },
    ]);
    const big = chain(1, {
      api: { type: "service" },
      cache: { type: "cache", params: { size: 3_000_000 } },
    });
    expect(costOf(big, "cache")?.lines[0]).toEqual({
      label: "4 GB of memory, for 3.00M keys",
      monthly: near(4 * 17),
    });
  });

  it("a queue: per job", () => {
    const doc = chain(
      100,
      { api: { type: "service" }, jobs: { type: "queue" }, work: { type: "worker" } },
      { readShare: 0 },
    );
    expect(costOf(doc, "jobs")?.lines).toEqual([
      { label: "263M jobs a month", monthly: near(262.8 * 1.2) },
    ]);
  });

  it("pub/sub: per message published, and per copy delivered", () => {
    const doc = systemDocument(
      {
        users: { type: "client", params: { rate: 100, readShare: 90 } },
        api: { type: "service" },
        events: { type: "pubsub" },
        a: { type: "worker" },
        b: { type: "worker" },
      },
      [
        ["users", "api"],
        ["api", "events"],
        ["events", "a"],
        ["events", "b"],
      ],
    );
    // Only writes are published: 10 a second, delivered twice.
    expect(costOf(doc, "events")?.lines).toEqual([
      { label: "26.3M messages published a month", monthly: near(10 * MONTH * 0.5e-6) },
      { label: "52.6M copies delivered a month", monthly: near(20 * MONTH * 0.5e-6) },
    ]);
    // Each subscriber gets every message, not a share.
    expect(estimateUsage(doc).get("a")?.requests).toBeCloseTo(10);
    expect(estimateUsage(doc).get("b")?.requests).toBeCloseTo(10);
  });

  it("clients are the users: not part of the bill", () => {
    const doc = chain(100, { api: { type: "service" } });
    expect(costOf(doc, "users")).toBeUndefined();
    const client = doc.nodes[0]!;
    expect(
      componentCost(
        client,
        { requests: 1, writeShare: 0, deliveries: 0, fromUsers: 0 },
        {
          keys: 0,
          cdnResponseKb: () => 10,
        },
      ),
    ).toBeNull();
  });

  it("every component in the palette has a cost model (or is a client)", () => {
    const priced = componentDefinitions.filter((d) => d.type !== "client");
    for (const definition of priced) {
      const doc = systemDocument({ x: { type: definition.type } }, []);
      expect(costOf(doc, "x"), definition.type).toBeDefined();
    }
  });
});

describe("the system's cost", () => {
  it("adds up its components, biggest first", () => {
    const doc = chain(100, {
      lb: { type: "load-balancer" },
      api: { type: "service" },
      db: { type: "database" },
    });
    const cost = systemCost(doc, registry);
    expect(cost.components.map((c) => c.id)).toEqual(["lb", "db", "api"]);
    expect(cost.total).toBeCloseTo(cost.components.reduce((sum, c) => sum + c.cost.monthly, 0));
    expect(cost.live).toBe(false);
  });

  it("follows the settings: another service, or a bigger one, costs more", () => {
    const doc = chain(100, { lb: { type: "load-balancer" }, api: { type: "service" } });
    const before = systemCost(doc, registry).total;
    doc.nodes[2]!.params.concurrency = 128;
    expect(systemCost(doc, registry).total - before).toBeCloseTo(3 * 35); // 1 → 4 vCPUs
  });

  it("fills in missing settings with their defaults, as the engine does", () => {
    const doc = chain(100, { api: { type: "service" } });
    doc.nodes[1]!.params = {};
    expect(costOf(doc, "api")?.lines[0]?.label).toBe("1 vCPU, for 16 requests at once");
  });

  it("uses what a run measures, once it has measured something", () => {
    const nodes = {
      users: { type: "client", params: { rate: 200, readShare: 100 } },
      gw: { type: "api-gateway" },
      api: { type: "service" },
    };
    const edges = [
      ["users", "gw"],
      ["gw", "api"],
    ] as const;
    const doc = systemDocument(nodes, edges);
    const engine = runningSystem(nodes, edges);
    engine.runUntil(500);
    expect(systemCost(doc, registry, engine.snapshot()).live).toBe(false); // too early to tell
    // Twice the traffic in the run (the Traffic control): twice the per-request cost.
    engine.setTrafficMultiplier(2);
    engine.runUntil(10_000);
    const cost = systemCost(doc, registry, engine.snapshot());
    expect(cost.live).toBe(true);
    const gateway = cost.components.find((c) => c.id === "gw")?.cost.lines[0]?.monthly ?? 0;
    const estimated = 200 * MONTH * 1e-6;
    expect(gateway / estimated).toBeGreaterThan(1.6);
    expect(gateway / estimated).toBeLessThan(2.4);
  });
});

describe("usage worked out from the clients' rates", () => {
  it("splits across what takes turns, and copies to what's called in sequence", () => {
    const doc = systemDocument(
      {
        users: { type: "client", params: { rate: 300, readShare: 100 } },
        lb: { type: "load-balancer" },
        a: { type: "service" },
        b: { type: "service" },
        c: { type: "service" },
        auth: { type: "service" },
      },
      [
        ["users", "lb"],
        ["lb", "a"],
        ["lb", "b"],
        ["lb", "c"],
        ["a", "auth"],
        ["b", "auth"],
        ["c", "auth"],
      ],
    );
    const usage = estimateUsage(doc);
    expect(usage.get("lb")?.requests).toBe(300);
    expect(usage.get("a")?.requests).toBe(100);
    expect(usage.get("auth")?.requests).toBe(300);
    expect(usage.get("lb")?.fromUsers).toBe(300);
    expect(usage.get("a")?.fromUsers).toBe(0);
  });

  it("follows reads, writes and searches to where they go", () => {
    const doc = systemDocument(
      {
        users: { type: "client", params: { rate: 100, readShare: 75, searchShare: 20 } },
        api: { type: "service" },
        cache: { type: "cache" },
        db: { type: "database" },
        index: { type: "search-index" },
        replica: { type: "read-replica" },
      },
      [
        ["users", "api"],
        ["api", "cache"],
        ["api", "db"],
        ["api", "index"],
        ["db", "replica"],
        ["db", "index"],
      ],
    );
    const usage = estimateUsage(doc);
    // 20 searches; of the other 80, 60 reads and 20 writes.
    expect(usage.get("cache")?.requests).toBeCloseTo(60);
    expect(usage.get("db")?.requests).toBeCloseTo(80); // reads (no replica for the API) and writes
    expect(usage.get("db")?.writeShare).toBeCloseTo(0.25);
    expect(usage.get("replica")?.requests).toBeCloseTo(20); // replicated writes
    expect(usage.get("index")?.requests).toBeCloseTo(40); // searches, and indexing writes
  });

  it("lets a CDN's hits stay at the CDN", () => {
    const doc = chain(100, {
      cdn: { type: "cdn", params: { hitRatio: 90 } },
      api: { type: "service" },
    });
    expect(estimateUsage(doc).get("api")?.requests).toBeCloseTo(10);
  });

  it("averages a traffic shape over a long run", () => {
    const shape = (patch: Partial<ShapeSettings>): ShapeSettings => ({
      shape: "steady",
      rampFrom: 10,
      rampTime: 60,
      spikeEvery: 30,
      spikeSize: 5,
      spikeLength: 5,
      dayLength: 120,
      nightShare: 20,
      ...patch,
    });
    for (const s of [shape({ shape: "spike" }), shape({ shape: "daily" })]) {
      let sum = 0;
      const seconds = 3600 * 10;
      for (let t = 0; t < seconds; t++) sum += shapeFactor(s, t + 0.5);
      expect(averageShapeFactor(s)).toBeCloseTo(sum / seconds, 2);
    }
    expect(averageShapeFactor(shape({ shape: "spike" }))).toBeCloseTo(1 + (4 * 5) / 30);
  });

  it("doesn't get stuck on a loop", () => {
    const doc = chain(100, { a: { type: "service" }, b: { type: "service" } });
    doc.edges.push({ id: "back", source: "b", target: "a" });
    expect(() => estimateUsage(doc)).not.toThrow();
  });
});

describe("formatting", () => {
  it("rounds money as an estimate deserves", () => {
    expect(
      [0, 0.4, 2.4, 70, 263.4, 999.4, 999.6, 1234, 12_345, 123_456, 1_234_567].map(formatMoney),
    ).toEqual(["$0", "<$1", "$2", "$70", "$263", "$999", "$1k", "$1.2k", "$12k", "$120k", "$1.2M"]);
  });

  it("shows data in MB, GB or TB", () => {
    expect([0.12, 26.3, 2628].map(formatData)).toEqual(["120 MB", "26.3 GB", "2.63 TB"]);
  });
});
