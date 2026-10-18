import type { MetricsSnapshot } from "../engine/metrics/recorder.ts";
import type { TraceRecord } from "../engine/runtime/trace.ts";
import type { SystemDocument } from "../model/document.ts";
import { findInsights, type Insight } from "./rules.ts";

/*
 * Keeps insights calm (S41): one appears only after its situation has held
 * for APPEAR_MS of simulated time, and stays LINGER_MS after it clears, so
 * notes don't flicker while the numbers wobble. Also measures how fast each
 * queue's backlog is growing, which one snapshot can't tell.
 */

export const APPEAR_MS = 2000;
export const LINGER_MS = 3000;
/** Backlog growth is measured over about this long. */
const GROWTH_WINDOW_MS = 5000;

type Seen = { first: number; last: number; insight: Insight };

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

    const shown = [...this.#seen.values()]
      .filter((seen) => now - seen.first >= APPEAR_MS)
      .map((seen) => seen.insight);
    return shown.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
  }

  reset(): void {
    this.#seen.clear();
    this.#backlogs.clear();
    this.#lastTime = -1;
  }

  /** Jobs per second each queue's backlog grew by over the last few seconds. */
  #growth(snapshot: MetricsSnapshot, doc: SystemDocument): Map<string, number> {
    const growth = new Map<string, number>();
    for (const queue of doc.nodes.filter((n) => n.type === "queue")) {
      const waiting = snapshot.nodes[queue.id]?.waiting ?? 0;
      const history = (this.#backlogs.get(queue.id) ?? []).filter(
        (point) => snapshot.time - point.time <= GROWTH_WINDOW_MS,
      );
      history.push({ time: snapshot.time, waiting });
      this.#backlogs.set(queue.id, history);
      const first = history[0];
      if (first && snapshot.time - first.time >= 1000) {
        growth.set(queue.id, ((waiting - first.waiting) / (snapshot.time - first.time)) * 1000);
      }
    }
    return growth;
  }
}
