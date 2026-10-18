import { describe, expect, it } from "vitest";
import { systemDocument } from "../engine/testing.ts";
import type { ScenarioEvent } from "../model/scenario.ts";
import { defaultEvent, isActive, lanes, targetOptions, ticks, timelineSpan } from "./timeline.ts";

const doc = systemDocument(
  {
    users: { type: "client", name: "Users" },
    api: { type: "service", name: "API" },
    cache: { type: "cache", name: "Cache" },
  },
  [
    ["users", "api"],
    ["api", "cache"],
  ],
);

const down = (id: string, at: number, duration: number | null): ScenarioEvent => ({
  kind: "down",
  id,
  at,
  target: "api",
  duration,
});

describe("the timeline strip", () => {
  it("spans at least a minute, every event, and the clock", () => {
    expect(timelineSpan([], 0)).toBe(60_000);
    expect(timelineSpan([down("a", 100_000, 30_000)], 0)).toBe(150_000);
    expect(timelineSpan([], 200_000)).toBe(240_000);
  });

  it("puts a few round ticks along it", () => {
    expect(ticks(60_000)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000]);
    expect(ticks(300_000).length).toBeLessThanOrEqual(9);
  });

  it("stacks overlapping events into lanes", () => {
    const placed = lanes([
      down("a", 0, 20_000),
      down("b", 10_000, 5000),
      down("c", 25_000, 5000),
      down("d", 12_000, null),
    ]);
    expect(placed.get("a")).toBe(0);
    expect(placed.get("b")).toBe(1);
    expect(placed.get("d")).toBe(2);
    expect(placed.get("c")).toBe(0); // a has finished
  });

  it("offers only what an event can act on", () => {
    expect(targetOptions(doc, "slow").map((o) => o.label)).toEqual(["API", "Cache"]);
    expect(targetOptions(doc, "flush").map((o) => o.label)).toEqual(["Cache"]);
    expect(targetOptions(doc, "cut").map((o) => o.label)).toEqual(["Users → API", "API → Cache"]);
    expect(targetOptions(doc, "surge")).toEqual([]);
  });

  it("starts a new event just ahead of the clock, keeping what still fits when the kind changes", () => {
    expect(defaultEvent(doc, "down", 0)).toEqual({
      kind: "down",
      at: 10_000,
      target: "users",
      duration: 20_000,
    });
    expect(defaultEvent(doc, "down", 23_000)?.at).toBe(30_000);
    const slow = defaultEvent(doc, "slow", 0, {
      kind: "down",
      at: 5000,
      target: "api",
      duration: 8000,
    });
    expect(slow).toEqual({ kind: "slow", at: 5000, target: "api", factor: 3, duration: 8000 });
    const noCaches = systemDocument({ users: { type: "client" } }, []);
    expect(defaultEvent(noCaches, "flush", 0)).toBeNull();
  });

  it("knows when an event is happening", () => {
    expect(isActive(down("a", 10_000, 5000), 12_000)).toBe(true);
    expect(isActive(down("a", 10_000, 5000), 15_000)).toBe(false);
    expect(isActive(down("a", 10_000, null), 999_000)).toBe(true);
  });
});
