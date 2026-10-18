import { describe, expect, it } from "vitest";
import type { TraceRecord } from "../../engine/runtime/trace.ts";
import { runningSystem, wholeRun } from "../../engine/testing.ts";
import { RESOLVER_GROUPS } from "../client/resolver.ts";

/** users → api, with users looking up the address at `dns` (and a second one, if asked). */
function resolving(
  dns: Record<string, unknown>,
  users: Record<string, unknown> = {},
  { second = false, window = { windowMs: 2000, slots: 4 } } = {},
) {
  return runningSystem(
    {
      users: { type: "client", params: { rate: 200, timeout: 1000, ...users } },
      api: { type: "service", params: { concurrency: 64, workTime: 5 } },
      dns: { type: "dns", params: dns },
      ...(second ? { backup: { type: "dns", params: dns } } : {}),
    },
    [["users", "dns"], ...(second ? ([["users", "backup"]] as const) : []), ["users", "api"]],
    { window },
  );
}

describe("dns", () => {
  it("is looked up before sending, and its answers are cached for the TTL", () => {
    const engine = resolving({ ttl: 60 }, {}, { window: wholeRun(10_000) });
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    expect(system.errorRate).toBe(0);
    // Every request reaches the service; only a trickle of lookups reaches DNS:
    // the answers expiring in 10 s of a 60 s TTL.
    expect(nodes.api?.totals.arrived).toBeGreaterThan((nodes.users?.totals.arrived ?? 0) - 5);
    const lookups = nodes.dns?.totals.arrived ?? 0;
    expect(lookups).toBeGreaterThan(10);
    expect(lookups).toBeLessThan(25);
    expect(nodes.users?.dnsCached).toBeGreaterThan(0.95);
  });

  it("sends one lookup for everyone waiting on the same expired answer", () => {
    // A 1 s TTL at 2,000 requests a second: every group expires every second.
    const engine = resolving(
      { ttl: 1, lookupTime: 20 },
      { rate: 2000 },
      { window: wholeRun(10_000) },
    );
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    const lookups = nodes.dns?.totals.arrived ?? 0;
    expect(lookups).toBeGreaterThan(RESOLVER_GROUPS * 8);
    expect(lookups).toBeLessThanOrEqual(RESOLVER_GROUPS * 10);
  });

  it("adds its lookup time to the requests that wait for a lookup", () => {
    const p99 = (dns: boolean) => {
      const engine = runningSystem(
        {
          users: { type: "client", params: { rate: 200 } },
          api: { type: "service", params: { concurrency: 64, workTime: 5 } },
          dns: { type: "dns", params: { ttl: 1, lookupTime: 100 } },
        },
        dns
          ? [
              ["users", "dns"],
              ["users", "api"],
            ]
          : [["users", "api"]],
      );
      engine.runUntil(10_000);
      return engine.snapshot().system.latency?.p99 ?? 0;
    };
    expect(p99(false)).toBeLessThan(50);
    expect(p99(true)).toBeGreaterThan(100);
  });

  it("goes down without anyone noticing, until cached answers expire, and then everything fails", () => {
    const engine = resolving({ ttl: 20 });
    engine.runUntil(10_000);
    engine.takeDown("dns");
    const at = (time: number) => {
      engine.runUntil(time);
      const { system, nodes } = engine.snapshot();
      return { errors: system.errorRate, cached: nodes.users?.dnsCached ?? 0 };
    };
    // Just after: most users still have an answer.
    const early = at(12_000);
    expect(early.errors).toBeLessThan(0.15);
    expect(early.cached).toBeGreaterThan(0.85);
    // Half a TTL on: about half fail.
    const halfway = at(20_000);
    expect(halfway.errors).toBeGreaterThan(0.3);
    expect(halfway.errors).toBeLessThan(0.7);
    // A TTL on (and past the 2 s window): every answer has expired, and every request fails.
    const later = at(33_000);
    expect(later.cached).toBe(0);
    expect(later.errors).toBe(1);
    // It comes back, and so does everything else.
    engine.bringBack("dns");
    const back = at(40_000);
    expect(back.errors).toBe(0);
    expect(back.cached).toBe(1);
  });

  it("fails requests at the client when it can't answer", () => {
    const engine = resolving({ ttl: 1, errorRate: 100 });
    engine.runUntil(5000);
    const { nodes, system } = engine.snapshot();
    expect(system.errorRate).toBe(1);
    expect(nodes.api?.arrivals).toBe(0); // nothing knew where to go
    expect(nodes.dns?.failures).toBeGreaterThan(0); // the failures start at DNS
  });

  it("uses a second DNS when the first fails", () => {
    const engine = resolving({ ttl: 5 }, {}, { second: true });
    engine.runUntil(5000);
    engine.takeDown("dns");
    engine.runUntil(20_000);
    const { nodes, system } = engine.snapshot();
    expect(system.errorRate).toBe(0);
    expect(nodes.backup?.arrivals).toBeGreaterThan(0);
  });

  it("counts the lookup towards the client's timeout", () => {
    // The service answers in 5 ms, so only slow lookups make requests give up.
    const engine = resolving({ ttl: 1, lookupTime: 1000 }, { timeout: 200 });
    engine.runUntil(10_000);
    expect(engine.snapshot().system.errorRate).toBeGreaterThan(0.2);
  });

  it("shows the lookup in a traced request", () => {
    // So few requests that every one finds its answer expired.
    const engine = resolving({ ttl: 1 }, { rate: 5 });
    const traces: TraceRecord[] = [];
    engine.onTrace = (trace) => traces.push(trace);
    engine.runUntil(1000);
    engine.traceNext("users");
    engine.runUntil(5000);
    const asked = traces.find((t) => t.reason === "asked");
    expect(asked?.outcome).toBe("ok");
    const [lookup, call] = asked?.spans.slice(1) ?? [];
    expect(lookup).toMatchObject({ node: "dns", op: "resolve", outcome: "ok" });
    expect(call).toMatchObject({ node: "api", outcome: "ok" });
    expect(call?.sentAt).toBeGreaterThanOrEqual(lookup?.receivedAt ?? Number.POSITIVE_INFINITY);
  });
});
