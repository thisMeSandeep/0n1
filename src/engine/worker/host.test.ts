import { describe, expect, it } from "vitest";
import { systemDocument } from "../testing.ts";
import { SimulationHost, type Timers } from "./host.ts";
import type { SimulationEvent } from "./protocol.ts";

/** A wall clock and interval timer the test moves by hand. */
function fakeTimers() {
  let now = 0;
  const intervals = new Set<{ ms: number; next: number; tick: () => void }>();
  const timers: Timers = {
    now: () => now,
    every(ms, tick) {
      const entry = { ms, next: now + ms, tick };
      intervals.add(entry);
      return () => intervals.delete(entry);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...intervals].sort((a, b) => a.next - b.next)[0];
      if (!due || due.next > end) break;
      now = due.next;
      due.next += due.ms;
      due.tick();
    }
    now = end;
  };
  return { timers, advance, active: () => intervals.size };
}

const doc = systemDocument(
  {
    users: { type: "client", params: { rate: 200, retries: 0 } },
    api: { type: "service", params: { concurrency: 32, workTime: 5 } },
  },
  [["users", "api"]],
);

function setup() {
  const events: SimulationEvent[] = [];
  const clock = fakeTimers();
  const host = new SimulationHost((event) => events.push(event), clock.timers);
  const snapshots = () => events.filter((e) => e.type === "snapshot");
  const last = () => {
    const s = snapshots().at(-1);
    if (s?.type !== "snapshot") throw new Error("no snapshot yet");
    return s;
  };
  return { host, events, clock, snapshots, last };
}

describe("SimulationHost", () => {
  it("loads a system, reporting compile results and a first snapshot at time 0", () => {
    const { host, events, last } = setup();
    host.handle({ type: "load", doc });
    expect(events[0]).toMatchObject({ type: "loaded", ok: true, errors: [] });
    expect(last()).toMatchObject({ running: false, speed: 1, traffic: 1 });
    expect(last().snapshot.time).toBe(0);
  });

  it("reports why a system can't run, and doesn't run it", () => {
    const { host, events, clock } = setup();
    host.handle({ type: "load", doc: systemDocument({ api: { type: "service" } }, []) });
    expect(events[0]).toMatchObject({ type: "loaded", ok: false });
    expect(events[0]?.type === "loaded" && events[0].errors[0]?.message).toMatch(/Add a Client/);
    host.handle({ type: "play" });
    clock.advance(1000);
    expect(events.some((e) => e.type === "snapshot")).toBe(false);
  });

  it("plays in step with the wall clock, about 10 snapshots a second, and pauses", () => {
    const { host, clock, snapshots, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "play" });
    const before = snapshots().length;
    clock.advance(1000);
    expect(snapshots().length - before).toBeGreaterThanOrEqual(9);
    expect(snapshots().length - before).toBeLessThanOrEqual(11);
    expect(last().running).toBe(true);

    host.handle({ type: "pause" }); // a fresh snapshot
    const paused = last().snapshot.time;
    expect(Math.abs(paused - 1000)).toBeLessThan(20);
    clock.advance(1000);
    expect(last().snapshot.time).toBe(paused);
    expect(last().running).toBe(false);
    expect(clock.active()).toBe(0); // no timer left running while paused
  });

  it("runs faster at a higher speed", () => {
    const { host, clock, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "setSpeed", speed: 5 });
    host.handle({ type: "play" });
    clock.advance(1000);
    host.handle({ type: "pause" }); // a fresh snapshot
    expect(Math.abs(last().snapshot.time - 5000)).toBeLessThan(100);
    expect(last().speed).toBe(5);
  });

  it("doesn't leap ahead after the tab was throttled", () => {
    const events: SimulationEvent[] = [];
    let now = 0;
    let tick = () => {};
    const host = new SimulationHost((e) => events.push(e), {
      now: () => now,
      every: (_ms, t) => {
        tick = t;
        return () => {};
      },
    });
    host.handle({ type: "load", doc });
    host.handle({ type: "play" });
    // A background tab: the next tick arrives 30 s late. At most 250 ms is simulated.
    now = 30_000;
    tick();
    host.handle({ type: "pause" });
    const last = events.at(-1);
    expect(last?.type === "snapshot" && last.snapshot.time).toBe(250);
  });

  it("steps by a set amount of simulated time and stays paused", () => {
    const { host, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "step", ms: 500 });
    expect(last().snapshot.time).toBe(500);
    host.handle({ type: "step", ms: 500 });
    expect(last().snapshot.time).toBe(1000);
    expect(last().running).toBe(false);
  });

  it("resets to time 0, keeping settings changed while running", () => {
    const { host, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "updateParams", nodeId: "users", params: { rate: 800 } });
    host.handle({ type: "step", ms: 3000 });
    host.handle({ type: "reset" });
    expect(last().snapshot.time).toBe(0);
    host.handle({ type: "step", ms: 3000 });
    expect(last().snapshot.nodes.api?.arrivals).toBeCloseTo(800, -2);
  });

  it("applies traffic changes", () => {
    const { host, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "setTraffic", multiplier: 2 });
    host.handle({ type: "step", ms: 4000 });
    expect(last().traffic).toBe(2);
    expect(last().snapshot.nodes.api?.arrivals).toBeCloseTo(400, -2);
  });

  it("takes components down and brings them back", () => {
    const { host, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "takeDown", nodeId: "api" });
    expect(last().snapshot.nodes.api?.down).toBe(true);
    host.handle({ type: "step", ms: 2000 });
    expect(last().snapshot.system.errorRate).toBe(1);
    host.handle({ type: "bringBack", nodeId: "api" });
    expect(last().snapshot.nodes.api?.down).toBe(false);
  });

  it("reports a bad command without stopping", () => {
    const { host, events, last } = setup();
    host.handle({ type: "load", doc });
    host.handle({ type: "updateParams", nodeId: "api", params: { concurrency: -1 } });
    expect(events.at(-1)).toEqual({ type: "error", message: "Invalid settings for api" });
    host.handle({ type: "step", ms: 1000 });
    expect(last().snapshot.time).toBe(1000);
  });

  it("is deterministic: the same commands give the same snapshots", () => {
    const run = () => {
      const { host, last } = setup();
      host.handle({ type: "load", doc, seed: 9 });
      host.handle({ type: "step", ms: 5000 });
      return last().snapshot;
    };
    expect(run()).toEqual(run());
  });
});
