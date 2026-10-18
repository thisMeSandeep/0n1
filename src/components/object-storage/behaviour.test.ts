import { describe, expect, it } from "vitest";
import { runningSystem, wholeRun } from "../../engine/testing.ts";

const window = wholeRun(10_000);
const roomy = { concurrency: 1024, workTime: 1, maxWaiting: 100_000 };

function system(rate: number, files: Record<string, unknown>) {
  return runningSystem(
    {
      users: { type: "client", params: { rate, timeout: 30_000 } },
      api: { type: "service", params: roomy },
      files: { type: "object-storage", params: files },
    },
    [
      ["users", "api"],
      ["api", "files"],
    ],
    { window, eventBudget: Number.POSITIVE_INFINITY },
  );
}

describe("object storage", () => {
  it("takes the time to first byte, then the transfer, for each file", () => {
    // 1 MB at 10 MB/s is 100 ms on top of the 40 ms first byte.
    const engine = system(100, { firstByte: 40, objectSize: 1024, bandwidth: 10 });
    engine.runUntil(10_000);
    const mean = engine.snapshot().nodes.files?.latency?.mean ?? 0;
    expect(mean).toBeGreaterThan(140 * 0.9);
    expect(mean).toBeLessThan(140 * 1.1);
  });

  it("tells callers to slow down above its request limit", () => {
    const engine = system(1000, { requestLimit: 500 });
    engine.runUntil(10_000);
    const { nodes } = engine.snapshot();
    expect(nodes.files?.drops).toBeCloseTo(500, -2);
    expect(nodes.files?.throughput).toBeCloseTo(500, -2);
  });

  it("sits happily behind a CDN, which answers most requests at the edge", () => {
    const engine = runningSystem(
      {
        users: { type: "client", params: { rate: 1000, readShare: 100, timeout: 30_000 } },
        cdn: { type: "cdn", params: { hitRatio: 90 } },
        files: { type: "object-storage" },
      },
      [
        ["users", "cdn"],
        ["cdn", "files"],
      ],
      { window, eventBudget: Number.POSITIVE_INFINITY },
    );
    engine.runUntil(10_000);
    expect(engine.snapshot().nodes.files?.arrivals).toBeCloseTo(100, -1);
  });
});
