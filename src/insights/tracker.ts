import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { SystemDocument } from "../model/document.ts";
import { backlogKey, findInsights, type Insight } from "./rules.ts";

/*
 * Keeps insights calm (S41): one appears only after its situation has held
 * for APPEAR_MS of simulated time, and stays LINGER_MS after it clears, so
 * notes don't flicker while the numbers wobble. Also measures how fast each
 * queue's backlog is growing (and each pub/sub subscriber's, S43c), which
 * one snapshot can't tell.
 */

export const APPEAR_MS = 2000;
export const LINGER_MS = 3000;
/** Backlog growth is measured over about this long. */
const GROWTH_WINDOW_MS = 5000;

type Seen = { first: number; last: number; insight: Insight };

/** Notes about how a component itself is doing: it only ever gets one of these at a time. */
const STATE = /^(overloaded|near|failing):/;

export class InsightTracker {
  #seen = new Map<string, Seen>();
  #backlogs = new Map<string, { time: number; waiting: number }[]>();
  #lastTime = -1;

  /** The insights to show now. Call with each snapshot, in time order. */
  update(
    snapshot: MetricsSnapshot,
    doc: SystemDocument,
    slowTrace: TraceRecord | null = null,
  ): Insight[] {
    const now = snapshot.time;
    if (now < this.#lastTime) this.reset(); // a reset or reload: start over
    this.#lastTime = now;

    const found = findInsights(snapshot, doc, {
      backlogGrowth: this.#growth(snapshot, doc),
      slowTrace,
    });
    for (const insight of found) {
      const seen = this.#seen.get(insight.id);
      this.#seen.set(insight.id, { first: seen?.first ?? now, last: now, insight });
    }
    for (const [id, seen] of this.#seen) {
      if (now - seen.last > LINGER_MS) this.#seen.delete(id);
    }

    const ready = [...this.#seen.values()].filter((seen) => now - seen.first >= APPEAR_MS);
    // One state note per component: what's true now beats one lingering after it
    // cleared, then the more serious one wins. A component whose situation
    // just changed doesn't get both its old note and its new one.
    const rank = (seen: Seen) =>
      (seen.last === now ? 2 : 0) + (seen.insight.severity === "fail" ? 1 : 0);
    const best = new Map<string, Seen>();
    for (const seen of ready) {
      // Only notes about a component's own state; others (users timing out because of it) stay.
      const node = STATE.test(seen.insight.id) ? seen.insight.nodeId : undefined;
      if (node === undefined) continue;
      const current = best.get(node);
      if (!current || rank(seen) > rank(current)) best.set(node, seen);
    }
    const shown = ready
      .filter((seen) => {
        const node = STATE.test(seen.insight.id) ? seen.insight.nodeId : undefined;
        return node === undefined || best.get(node) === seen;
      })
      .map((seen) => seen.insight);
    return shown.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
  }

  reset(): void {
    this.#seen.clear();
    this.#backlogs.clear();
    this.#lastTime = -1;
  }

  /**
   * Jobs per second each backlog grew by over the last few seconds: a
   * queue's by its id, a pub/sub subscriber's by backlogKey.
   */
  #growth(snapshot: MetricsSnapshot, doc: SystemDocument): Map<string, number> {
    const growth = new Map<string, number>();
    const measure = (key: string, waiting: number) => {
      const history = (this.#backlogs.get(key) ?? []).filter(
        (point) => snapshot.time - point.time <= GROWTH_WINDOW_MS,
      );
      history.push({ time: snapshot.time, waiting });
      this.#backlogs.set(key, history);
      const first = history[0];
      if (first && snapshot.time - first.time >= 1000) {
        growth.set(key, ((waiting - first.waiting) / (snapshot.time - first.time)) * 1000);
      }
    };
    for (const node of doc.nodes) {
      const m = snapshot.nodes[node.id];
      if (node.type === "queue") measure(node.id, m?.waiting ?? 0);
      for (const s of m?.subscriptions ?? []) measure(backlogKey(node.id, s.node), s.waiting);
    }
    return growth;
  }
}
