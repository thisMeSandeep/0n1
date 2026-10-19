import { describe, expect, it } from "vitest";
import type { NodeMetrics } from "../engine/metrics/recorder.ts";
import { detailRows, summaryStats } from "../inspector/LiveSummary.tsx";
import type { NodeLive } from "../simulation/live.ts";
import { CONCEPTS, explainLabel, GLOSSARY, GLOSSARY_GROUPS, GLOSSARY_IDS } from "./glossary.ts";

/** Every optional number filled in, so every row and stat shows up. */
const everything: NodeMetrics = {
  arrivals: 100,
  throughput: 100,
  errorRate: 0,
  failures: 0,
  drops: 0,
  latency: { mean: 10, p50: 8, p95: 20, p99: 42 },
  utilization: 0.3,
  hitRatio: 0.8,
  staleReads: 0.01,
  oldestJobAge: 300,
  shards: [0.2, 0.4],
  breakerState: "closed",
  subscriptions: [{ node: "mail", waiting: 3, oldestAge: 100 }],
  dnsCached: 0.9,
  inFlight: 3,
  waiting: 0,
  totals: { arrived: 0, completed: 0, failed: 0, dropped: 0 },
};

describe("the glossary", () => {
  it("has one entry per id, each in a known group, with something to say", () => {
    expect(GLOSSARY.map((e) => e.id).sort()).toEqual([...GLOSSARY_IDS].sort());
    for (const entry of GLOSSARY) {
      expect(GLOSSARY_GROUPS).toContain(entry.group);
      expect(entry.what.length, entry.id).toBeGreaterThan(20);
      expect(entry.why.length, entry.id).toBeGreaterThan(20);
    }
    // Every group is used.
    expect(new Set(GLOSSARY.map((e) => e.group)).size).toBe(GLOSSARY_GROUPS.length);
    expect(CONCEPTS.length).toBeGreaterThan(0);
  });

  it("explains every number the inspector shows", () => {
    const view = { status: "healthy" } as NodeLive;
    const labels = [
      ...(["p99", "hit", "waiting", "state", "sent"] as const).flatMap((detail) =>
        summaryStats(everything, view, detail).map((s) => s.label),
      ),
      ...detailRows(everything, (id) => id).map(([label]) => label),
    ];
    expect(labels.filter((label) => explainLabel(label) === undefined)).toEqual([]);
  });
});
