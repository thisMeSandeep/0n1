import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { GlossaryId } from "../guide/glossary.ts";
import type { SystemDocument, SystemNode } from "../model/document.ts";

/*
 * Tutorials (the guide, part 2): lessons as data, step by step. Each step
 * says what to do and what to look at, and moves on by itself once it's
 * done, judged from the design and the run. More lessons are just more data.
 */

/** What a step can see to tell whether it's done. */
export type TutorialContext = {
  doc: SystemDocument;
  /** The latest numbers, or null before a run. */
  snapshot: MetricsSnapshot | null;
  running: boolean;
  /** The Traffic % control, as a multiplier (1 = 100%). */
  traffic: number;
  /** Selected components. */
  selected: readonly string[];
  /** The request trace open in the inspector, if any. */
  openTrace: TraceRecord | null;
};

export type TutorialStep = {
  /** Stable within its lesson: saved progress points at it. */
  id: string;
  title: string;
  /** A paragraph each. */
  body: readonly string[];
  /**
   * What to look at, highlighted while the step shows: a CSS selector, or
   * one worked out from the system (e.g. the client's card).
   */
  target?: string | ((context: TutorialContext) => string | null);
  /** Done when this is true, and the step moves on. Without it, it waits for Next. */
  done?: (context: TutorialContext) => boolean;
  /** The guide's entry for the number this step is about. */
  explain?: GlossaryId;
};

export type Lesson = {
  id: string;
  title: string;
  /** One line, for the menus. */
  summary: string;
  /** Roughly how long it takes. */
  minutes: number;
  /** Where it starts: a fresh copy of a blueprint, or a new blank system of this name. */
  start: { blueprint: string } | { blank: string };
  steps: readonly TutorialStep[];
};

/** The first component of a type in the system. */
export function nodeOfType(doc: SystemDocument, type: string): SystemNode | undefined {
  return doc.nodes.find((n) => n.type === type);
}

/** A selector for a component's card on the canvas. */
export const cardOf = (node: SystemNode | undefined) =>
  node ? `.react-flow__node[data-id="${node.id}"]` : null;

/** A component by id (blueprints keep theirs: "db", "api-1"…). */
export const nodeById = (doc: SystemDocument, id: string) => doc.nodes.find((n) => n.id === id);

/** Whether there's a connection from `source` to `target`. */
export const connected = (
  doc: SystemDocument,
  source: string | undefined,
  target: string | undefined,
) => !!source && !!target && doc.edges.some((e) => e.source === source && e.target === target);

/** The share of users' requests failing right now. */
export const errorsOf = (c: TutorialContext) => c.snapshot?.system.errorRate ?? 0;
/** p99 as users see it right now (ms). */
export const p99Of = (c: TutorialContext) => c.snapshot?.system.latency?.p99 ?? 0;
/** How long a run must have gone before its numbers say anything (a restart starts from 0). */
const SETTLE_MS = 3000;
/** Running for a while, answering, with no errors and a quick p99: healthy. */
export const healthy = (c: TutorialContext) =>
  c.running &&
  (c.snapshot?.time ?? 0) >= SETTLE_MS &&
  (c.snapshot?.system.throughput ?? 0) > 0 &&
  errorsOf(c) < 0.005 &&
  p99Of(c) < 300;

/** Where to look, shared by lessons. */
export const TARGETS = {
  run: "[data-run-button]",
  traffic: 'button[aria-label^="Traffic "]',
  vitals: '[aria-label="System vitals"]',
  insight: "[data-insight-note]",
  palette: (type: string) => `[data-palette-type="${type}"]`,
  vital: (name: string) => `[data-vital="${name}"]`,
  stat: (label: string) => `[data-stat="${label}"]`,
} as const;
