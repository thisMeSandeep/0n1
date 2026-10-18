import { describe, expect, it } from "vitest";
import { runningSystem } from "../../engine/testing.ts";

const window = { windowMs: 2000, slots: 4 };

/** users → api → breaker → backend, the dependency the breaker protects. */
function protectedBy(breaker: Record<string, unknown>, backend: Record<string, unknown>) {
  return runningSystem(
    {
      users: { type: "client", params: { rate: 200, retries: 0, timeout: 10_000 } },
      api: { type: "service", params: { concurrency: 1024, workTime: 1, maxWaiting: 100_000 } },
      breaker: { type: "circuit-breaker", params: breaker },
      backend: { type: "service", params: { concurrency: 64, workTime: 5, ...backend } },
    },
    [
      ["users", "api"],
      ["api", "breaker"],
      ["breaker", "backend"],
    ],
    { window },
  );
}

describe("circuit breaker", () => {
  it("stays closed while its dependency is healthy", () => {
    const engine = protectedBy({}, {});
    engine.runUntil(10_000);
    const { nodes, system } = engine.snapshot();
    expect(nodes.breaker?.breakerState).toBe("closed");
    expect(system.errorRate).toBe(0);
  });

  it("opens when its dependency fails, and stops calling it", () => {
    const engine = protectedBy({ coolDown: 60 }, { errorRate: 100 });
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    expect(nodes.breaker?.breakerState).toBe("open");
    // The dependency is left alone: almost nothing reaches it.
    expect(nodes.backend?.arrivals).toBeLessThan(5);
    // Callers fail fast instead of waiting.
    expect(nodes.api?.latency?.p99 ?? Number.POSITIVE_INFINITY).toBeLessThan(10);
  });

  it("trips on a dependency that's only slow, through its call timeout", () => {
    const engine = protectedBy({ timeout: 100, coolDown: 60 }, { workTime: 500 });
    engine.runUntil(10_000);
    expect(engine.snapshot().nodes.breaker?.breakerState).toBe("open");
  });

  it("tests the dependency after its cool-down, and closes once it's back", () => {
    const engine = protectedBy({ coolDown: 2, probes: 3 }, { errorRate: 100 });
    engine.runUntil(5000);
    expect(engine.snapshot().nodes.breaker?.breakerState).not.toBe("closed");
    engine.updateParams("backend", { errorRate: 0 }); // it recovers
    engine.runUntil(12_000);
    const after = engine.snapshot();
    expect(after.nodes.breaker?.breakerState).toBe("closed");
    expect(after.system.errorRate).toBe(0);
  });

  it("stops a retry storm spreading: callers fail fast, and the lines clear", () => {
    // Users retry 3 times on a 1 s timeout; the backend can do about 100 a second.
    const storm = (withBreaker: boolean) => {
      const nodes = {
        users: { type: "client", params: { rate: 300, retries: 3, timeout: 1000 } },
        api: { type: "service", params: { concurrency: 1024, workTime: 1, maxWaiting: 100_000 } },
        ...(withBreaker ? { breaker: { type: "circuit-breaker", params: { timeout: 1000 } } } : {}),
        backend: { type: "service", params: { concurrency: 10, workTime: 100, maxWaiting: 2000 } },
      };
      const edges: [string, string][] = withBreaker
        ? [
            ["users", "api"],
            ["api", "breaker"],
            ["breaker", "backend"],
          ]
        : [
            ["users", "api"],
            ["api", "backend"],
          ];
      const engine = runningSystem(nodes, edges, { window: { windowMs: 20_000, slots: 10 } });
      engine.runUntil(30_000);
      return engine.snapshot();
    };

    // Without one, the backend's trouble spreads up: every slot in the API is
    // stuck waiting, its line grows into the tens of thousands, and nobody
    // gets an answer, each after four tries of a second.
    const melted = storm(false);
    expect(melted.system.goodput).toBeLessThan(1);
    expect(melted.system.latency?.p50).toBeGreaterThan(3000);
    expect(melted.nodes.api?.waiting).toBeGreaterThan(10_000);

    // With one, callers are told at once, the lines clear, and some get through.
    const calm = storm(true);
    expect(calm.system.goodput).toBeGreaterThan(5);
    expect(calm.system.latency?.p50).toBeLessThan(100);
    expect(calm.nodes.api?.waiting).toBeLessThan(100);
    expect(calm.nodes.backend?.waiting).toBeLessThan(100);
  });
});
