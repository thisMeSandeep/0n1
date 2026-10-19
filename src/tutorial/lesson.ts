import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
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
  /** Selected components. */
  selected: readonly string[];
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
  /** The lesson builds in a fresh system of this name. */
  systemName: string;
  steps: readonly TutorialStep[];
};

/** The first component of a type in the system. */
export function nodeOfType(doc: SystemDocument, type: string): SystemNode | undefined {
  return doc.nodes.find((n) => n.type === type);
}

/** A selector for a component's card on the canvas. */
export const cardOf = (node: SystemNode | undefined) =>
  node ? `.react-flow__node[data-id="${node.id}"]` : null;
