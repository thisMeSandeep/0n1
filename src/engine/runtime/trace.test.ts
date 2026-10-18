import { describe, expect, it } from "vitest";
import { runningSystem } from "../testing.ts";
import { DEFAULT_NETWORK_LATENCY_MS, type Engine, TRACE_WINDOW_MS } from "./engine.ts";
import type { Span, TraceRecord } from "./trace.ts";

const NET = DEFAULT_NETWORK_LATENCY_MS;

/** Ask for a trace, run until it arrives (or `ms`), and return it. */
function traceOne(engine: Engine, ms = 10_000, client: string | null = null): TraceRecord {
  const traces: TraceRecord[] = [];
  engine.onTrace = (trace) => {
    if (trace.reason === "asked") traces.push(trace);
  };
  engine.traceNext(client);
  for (let t = engine.sim.now + 100; t <= ms && traces.length === 0; t += 100) engine.runUntil(t);
  const trace = traces[0];
  if (!trace) throw new Error("no trace");
  return trace;
}

const byNode = (trace: TraceRecord, node: string) => trace.spans.filter((s) => s.node === node);
const one = (trace: TraceRecord, node: string): Span => {
  const span = byNode(trace, node)[0];
  if (!span) throw new Error(`no span at ${node}`);
  return span;
};

describe("request tracing", () => {
  it("follows a request hop by hop, and the timings add up", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 50, readShare: 100, timeout: 5000 } },
        lb: { type: "load-balancer", params: { delay: 1 } },
        api: { type: "service", params: { concurrency: 64, workTime: 5 } },
        db: { type: "database", params: { connections: 64, readTime: 10 } },
      },
      [
        ["users", "lb"],
        ["lb", "api"],
        ["api", "db"],
      ],
    );
    const trace = traceOne(engine);
    expect(trace).toMatchObject({ reason: "asked", client: "users", kind: "read", outcome: "ok" });
    expect(trace.spans.map((s) => s.node)).toEqual(["users", "lb", "api", "db"]);

    const [root, lb, api, db] = [
      one(trace, "users"),
      one(trace, "lb"),
      one(trace, "api"),
      one(trace, "db"),
    ];
    // Each call is a child of the visit that made it.
    expect([lb.parent, api.parent, db.parent]).toEqual([root.id, lb.id, api.id]);
    for (const span of [lb, api, db]) {
      // The network each way, and work only after arriving.
      expect((span.arrivedAt ?? 0) - span.sentAt).toBeCloseTo(NET);
      expect((span.receivedAt ?? 0) - (span.repliedAt ?? 0)).toBeCloseTo(NET);
      expect(span.startedAt ?? 0).toBeGreaterThanOrEqual(span.arrivedAt ?? 0);
      expect(span.outcome).toBe("ok");
    }
    // The load balancer's 1 ms, then it passes the request on.
    expect(api.sentAt - (lb.arrivedAt ?? 0)).toBeCloseTo(1);
    // A child happens inside its parent's visit.
    expect(db.sentAt).toBeGreaterThanOrEqual(api.startedAt ?? 0);
    expect(db.receivedAt ?? 0).toBeLessThanOrEqual(api.repliedAt ?? 0);
    // The whole request is the client's span.
    expect(trace.finishedAt - trace.startedAt).toBeCloseTo((lb.receivedAt ?? 0) - lb.sentAt);
    expect(root.repliedAt).toBe(trace.finishedAt);
  });

  it("shows time spent waiting in line", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 600, readShare: 100, timeout: 60_000 } },
        api: { type: "service", params: { concurrency: 256, workTime: 1 } },
        db: { type: "database", params: { connections: 2, readTime: 5, maxWaiting: 10_000 } },
      },
      [
        ["users", "api"],
        ["api", "db"],
      ],
    );
    engine.runUntil(5000); // a long line has built up
    const db = one(traceOne(engine, 30_000), "db");
    expect((db.startedAt ?? 0) - (db.arrivedAt ?? 0)).toBeGreaterThan(100);
  });

  it("includes work done after a queue answered", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 20, readShare: 0, timeout: 5000 } },
        api: { type: "service", params: { workTime: 1 } },
        jobs: { type: "queue" },
        work: { type: "worker", params: { workTime: 300 } },
        db: { type: "database" },
      },
      [
        ["users", "api"],
        ["api", "jobs"],
        ["jobs", "work"],
        ["work", "db"],
      ],
    );
    const trace = traceOne(engine);
    const worker = one(trace, "work");
    expect(worker.parent).toBe(one(trace, "jobs").id);
    // The client had its answer before the worker finished the job.
    expect(worker.repliedAt ?? 0).toBeGreaterThan(trace.finishedAt);
    expect(one(trace, "db").outcome).toBe("ok");
  });

  it("records a timeout, and work that carried on after the client gave up", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 20, readShare: 100, timeout: 50, retries: 0 } },
        api: { type: "service", params: { workTime: 1 } },
        db: { type: "database", params: { readTime: 400 } },
      },
      [
        ["users", "api"],
        ["api", "db"],
      ],
    );
    const trace = traceOne(engine);
    expect(trace.outcome).toBe("timeout");
    expect(trace.finishedAt - trace.startedAt).toBeCloseTo(50);
    expect(one(trace, "db").repliedAt ?? 0).toBeGreaterThan(trace.finishedAt);
  });

  it("shows each retry as a further attempt", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 20, readShare: 100, timeout: 5000, retries: 2 } },
        api: { type: "service", params: { workTime: 1, errorRate: 100 } },
      },
      [["users", "api"]],
    );
    const trace = traceOne(engine);
    expect(trace.outcome).toBe("error");
    expect(byNode(trace, "api").map((s) => [s.attempt, s.outcome])).toEqual([
      [1, "error"],
      [2, "error"],
      [3, "error"],
    ]);
  });

  it("keeps the slowest request and a failed one from the background, while someone listens", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 200, readShare: 100, timeout: 5000 } },
        api: { type: "service", params: { workTime: 5, errorRate: 20 } },
      },
      [["users", "api"]],
    );
    const traces: TraceRecord[] = [];
    engine.onTrace = (trace) => traces.push(trace);
    engine.runUntil(TRACE_WINDOW_MS + 1);
    expect(traces.map((t) => t.reason).sort()).toEqual(["failed", "slow"]);
    expect(traces.find((t) => t.reason === "failed")?.outcome).toBe("error");
    engine.runUntil(TRACE_WINDOW_MS * 3 + 1);
    expect(traces).toHaveLength(6);
  });

  it("costs nothing when nobody listens: no background traces", () => {
    const quiet = runningSystem(
      { users: { type: "client", params: { rate: 200 } }, api: { type: "service" } },
      [["users", "api"]],
    );
    quiet.runUntil(TRACE_WINDOW_MS * 2 + 1);
    const listened = runningSystem(
      { users: { type: "client", params: { rate: 200 } }, api: { type: "service" } },
      [["users", "api"]],
    );
    listened.onTrace = () => {};
    listened.runUntil(TRACE_WINDOW_MS * 2 + 1);
    // Tracing only watches: the run itself is the same either way.
    expect(listened.snapshot()).toEqual(quiet.snapshot());
  });
});
