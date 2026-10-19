import * as z from "zod/mini";

/*
 * A system's chaos timeline (S40): failures and surges planned at simulated
 * times. Stored in the system document as an optional `scenario`, so adding
 * it needed no schema version bump.
 */

export const EVENT_KINDS = ["down", "slow", "cut", "flush", "surge"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Biggest slowdown or surge. */
export const MAX_FACTOR = 100;
export const MAX_EVENTS = 100;

const id = z.string().check(z.minLength(1));
/** When it starts, in simulated ms from the start of the run. */
const at = z.number().check(z.minimum(0));
/** How long it lasts (ms). */
const duration = z.number().check(z.positive());
const factor = z.number().check(z.minimum(1.1), z.maximum(MAX_FACTOR));

export const scenarioEventSchema = z.discriminatedUnion("kind", [
  /** Take a component down; `duration: null` keeps it down for the rest of the run. */
  z.object({ kind: z.literal("down"), id, at, target: id, duration: z.nullable(duration) }),
  /** Everything the component does takes `factor` times longer. */
  z.object({ kind: z.literal("slow"), id, at, target: id, factor, duration }),
  /** Requests on a connection (by edge id) fail at once. */
  z.object({ kind: z.literal("cut"), id, at, target: id, duration }),
  /** Empty a cache. */
  z.object({ kind: z.literal("flush"), id, at, target: id }),
  /** Every client sends `factor` times as much. */
  z.object({ kind: z.literal("surge"), id, at, factor, duration }),
]);

export const scenarioSchema = z.object({
  events: z.array(scenarioEventSchema).check(z.maxLength(MAX_EVENTS)),
});

export type ScenarioEvent = z.infer<typeof scenarioEventSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
/** An event before it has an id. */
export type NewScenarioEvent = ScenarioEvent extends infer E
  ? E extends ScenarioEvent
    ? Omit<E, "id">
    : never
  : never;

export const EVENT_LABEL: Readonly<Record<EventKind, string>> = {
  down: "Take down",
  slow: "Slow down",
  cut: "Cut a connection",
  flush: "Flush a cache",
  surge: "Traffic surge",
};

/** When the event stops having an effect (ms), or null if it lasts to the end. */
export function eventEnd(event: ScenarioEvent): number | null {
  switch (event.kind) {
    case "flush":
      return event.at;
    case "down":
      return event.duration === null ? null : event.at + event.duration;
    default:
      return event.at + event.duration;
  }
}

/** The node or edge an event is about, if any. */
export function eventTarget(event: ScenarioEvent): { node: string } | { edge: string } | null {
  if (event.kind === "surge") return null;
  return event.kind === "cut" ? { edge: event.target } : { node: event.target };
}

const seconds = (ms: number) => {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s} s` : `${s.toFixed(1)} s`;
};

/** "Shortener API · 1 down for 20 s", "Traffic ×3 for 10 s", "Link cache flushed". */
export function describeEvent(event: ScenarioEvent, name: (target: string) => string): string {
  switch (event.kind) {
    case "down":
      return `${name(event.target)} down${event.duration === null ? "" : ` for ${seconds(event.duration)}`}`;
    case "slow":
      return `${name(event.target)} slowed ×${event.factor} for ${seconds(event.duration)}`;
    case "cut":
      return `${name(event.target)} cut for ${seconds(event.duration)}`;
    case "flush":
      return `${name(event.target)} flushed`;
    case "surge":
      return `Traffic ×${event.factor} for ${seconds(event.duration)}`;
  }
}
