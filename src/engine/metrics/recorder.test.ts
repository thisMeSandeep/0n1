import { describe, expect, it } from "vitest";
import { NodeRecorder, SystemRecorder } from "./recorder.ts";

const window = { windowMs: 1000, slots: 10 };

describe("NodeRecorder", () => {
  it("summarizes arrivals, completions, errors, drops, latency and utilization", () => {
    const node = new NodeRecorder(window);
    // 100 requests over one second: 90 succeed in 10 ms, 10 fail in 100 ms, 5 dropped.
    for (let i = 0; i < 100; i++) {
      const t = i * 10;
      node.arrive(t);
      node.complete(t + 5, i < 90 ? 10 : 100, i < 90);
    }
    for (let i = 0; i < 5; i++) node.drop(500 + i);
    node.setBusy(0, 2, 4);
    node.setWaiting(3);

    // At 999 ms the 1 s window still covers the first slot.
    const m = node.snapshot(999);
    expect(m.arrivals).toBeCloseTo(100, 0);
    expect(m.throughput).toBeCloseTo(100, 0);
    expect(m.errorRate).toBeCloseTo(0.1, 5);
    expect(m.drops).toBeCloseTo(5, 0);
    expect(m.latency?.p50).toBeCloseTo(10, 0);
    expect(m.latency?.p99).toBeCloseTo(100, -1);
    expect(m.utilization).toBeCloseTo(0.5, 5);
    expect(m).toMatchObject({ inFlight: 2, waiting: 3 });
    expect(m.totals).toEqual({ arrived: 100, completed: 100, failed: 10, dropped: 5 });
  });

  it("reports no latency when nothing has finished", () => {
    expect(new NodeRecorder(window).snapshot(500).latency).toBeNull();
  });
});

describe("SystemRecorder", () => {
  it("separates goodput from throughput", () => {
    const system = new SystemRecorder(window);
    for (let i = 0; i < 100; i++) system.respond(i * 10, 20, i % 4 !== 0);
    const m = system.snapshot(999);
    expect(m.throughput).toBeCloseTo(100, 0);
    expect(m.goodput).toBeCloseTo(75, 0);
    expect(m.errorRate).toBeCloseTo(0.25, 5);
    expect(m.latency?.p50).toBeCloseTo(20, 0);
  });
});
