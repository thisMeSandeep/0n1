import type { SystemDocument } from "../model/document.ts";
import {
  type EventKind,
  eventEnd,
  type NewScenarioEvent,
  type ScenarioEvent,
} from "../model/scenario.ts";

/*
 * Layout and defaults for the chaos timeline strip (S40). Times in ms.
 */

/** The strip always shows at least this much time. */
export const MIN_SPAN_MS = 60_000;
/** Room after the last event, and ahead of the clock. */
const MARGIN_MS = 15_000;
const TICK_STEPS_S = [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
const MAX_TICKS = 8;
export const MAX_LANES = 4;

/** How much time the strip covers: every event, the clock, and a little room. */
export function timelineSpan(events: readonly ScenarioEvent[], now: number): number {
  const last = events.reduce((end, event) => Math.max(end, eventEnd(event) ?? event.at), 0);
  const needed = Math.max(MIN_SPAN_MS, last + MARGIN_MS, now + MARGIN_MS);
  const step = tickStep(needed);
  return Math.ceil(needed / step) * step;
}

/** The tick spacing (ms) that gives at most MAX_TICKS ticks. */
export function tickStep(span: number): number {
  const seconds = TICK_STEPS_S.find((s) => span / (s * 1000) <= MAX_TICKS) ?? 3600;
  return seconds * 1000;
}

export function ticks(span: number): number[] {
  const step = tickStep(span);
  return Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
}

/**
 * Stack events into lanes so overlapping ones don't cover each other. An
 * event that lasts to the end of the run fills its lane from then on.
 */
export function lanes(events: readonly ScenarioEvent[]): Map<string, number> {
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    // A point event (a flush) still needs a little room for its marker.
    const end = eventEnd(event) ?? Number.POSITIVE_INFINITY;
    const free = ends.findIndex((laneEnd) => laneEnd <= event.at);
    const index = free === -1 ? Math.min(ends.length, MAX_LANES - 1) : free;
    ends[index] = Math.max(end, event.at + 2000);
    lane.set(event.id, index);
  }
  return lane;
}

export type TargetOption = { value: string; label: string };

/** What an event of this kind can act on, in this system. */
export function targetOptions(doc: SystemDocument, kind: EventKind): TargetOption[] {
  const names = new Map(doc.nodes.map((n) => [n.id, n.name]));
  switch (kind) {
    case "down":
      return doc.nodes.map((n) => ({ value: n.id, label: n.name }));
    case "slow":
      return doc.nodes
        .filter((n) => n.type !== "client")
        .map((n) => ({ value: n.id, label: n.name }));
    case "flush":
      return doc.nodes
        .filter((n) => n.type === "cache")
        .map((n) => ({ value: n.id, label: n.name }));
    case "cut":
      return doc.edges.map((e) => ({
        value: e.id,
        label: `${names.get(e.source) ?? "?"} → ${names.get(e.target) ?? "?"}`,
      }));
    case "surge":
      return [];
  }
}

/** A sensible event of a kind: just ahead of the clock, on the first thing it can act on. */
export function defaultEvent(
  doc: SystemDocument,
  kind: EventKind,
  now: number,
  previous?: NewScenarioEvent,
): NewScenarioEvent | null {
  const at = previous?.at ?? Math.max(10_000, Math.ceil((now + 5000) / 5000) * 5000);
  const duration =
    previous && "duration" in previous && previous.duration !== null ? previous.duration : 20_000;
  const factor = previous && "factor" in previous ? previous.factor : 3;
  if (kind === "surge") return { kind, at, factor, duration };
  const options = targetOptions(doc, kind);
  const kept =
    previous && "target" in previous && options.some((o) => o.value === previous.target)
      ? previous.target
      : undefined;
  const target = kept ?? options[0]?.value;
  if (target === undefined) return null;
  switch (kind) {
    case "down":
      return { kind, at, target, duration };
    case "slow":
      return { kind, at, target, factor, duration };
    case "cut":
      return { kind, at, target, duration };
    case "flush":
      return { kind, at, target };
  }
}

/** Whether the event is happening at `now`. */
export function isActive(event: ScenarioEvent, now: number): boolean {
  const end = eventEnd(event);
  if (event.kind === "flush") return now >= event.at && now < event.at + 1000;
  return now >= event.at && (end === null || now < end);
}
