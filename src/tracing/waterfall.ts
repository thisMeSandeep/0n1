import type { Span, TraceRecord } from "../engine/runtime/trace.ts";

/*
 * Laying out a request trace (S42) as a waterfall: one row per hop, in call
 * order, indented by depth, with each hop's time split into network,
 * waiting in line and working.
 */

export type WaterfallRow = {
  span: Span;
  depth: number;
  /** Where it starts and ends on the trace's time axis, 0–1. */
  start: number;
  end: number;
  /** Waiting in line, as part of the axis (0–1); null when it didn't wait. */
  waiting: { start: number; end: number } | null;
  /**
   * Its own work, as parts of the axis: from starting to answering, minus
   * the time its own calls were out (that's waiting on the next component).
   */
  working: { start: number; end: number }[];
  /** It never answered before the trace was reported. */
  unfinished: boolean;
  /** Milliseconds, from the caller sending to it getting the answer (or the trace's end). */
  total: number;
  waited: number | null;
  worked: number | null;
};

/** When the trace's last recorded moment is: the client's answer, or a later reply. */
export function traceEnd(trace: TraceRecord): number {
  let end = trace.finishedAt;
  for (const span of trace.spans) {
    end = Math.max(end, span.receivedAt ?? span.repliedAt ?? span.arrivedAt ?? span.sentAt);
  }
  return end;
}

export function waterfall(trace: TraceRecord): WaterfallRow[] {
  const end = traceEnd(trace);
  const span = Math.max(1e-6, end - trace.startedAt);
  const at = (time: number) => (time - trace.startedAt) / span;
  const children = new Map<number | null, Span[]>();
  for (const s of trace.spans) {
    const list = children.get(s.parent) ?? [];
    list.push(s);
    children.set(s.parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.sentAt - b.sentAt || a.id - b.id);

  const rows: WaterfallRow[] = [];
  const visit = (s: Span, depth: number) => {
    const finish = s.receivedAt ?? s.repliedAt ?? end;
    const unfinished = s.repliedAt === null;
    const started = s.startedAt ?? (unfinished ? null : s.arrivedAt);
    const answered = s.repliedAt ?? (unfinished ? end : null);
    rows.push({
      span: s,
      depth,
      start: at(s.sentAt),
      end: at(finish),
      waiting:
        s.arrivedAt !== null && started !== null && started > s.arrivedAt
          ? { start: at(s.arrivedAt), end: at(started) }
          : null,
      working:
        started === null || answered === null
          ? []
          : ownTime(started, answered, children.get(s.id) ?? []).map(([a, b]) => ({
              start: at(a),
              end: at(b),
            })),
      unfinished,
      total: finish - s.sentAt,
      waited: s.arrivedAt !== null && started !== null ? started - s.arrivedAt : null,
      worked:
        started !== null && s.repliedAt !== null
          ? ownTime(started, s.repliedAt, children.get(s.id) ?? []).reduce(
              (sum, [a, b]) => sum + b - a,
              0,
            )
          : null,
    });
    for (const child of children.get(s.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}

/** [from, to] minus the times its calls were out: the stretches it was busy itself. */
function ownTime(from: number, to: number, calls: readonly Span[]): [number, number][] {
  const out = calls
    .map((c) => [c.sentAt, c.receivedAt ?? c.repliedAt ?? to] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const own: [number, number][] = [];
  let cursor = from;
  for (const [sent, back] of out) {
    if (sent > cursor) own.push([cursor, Math.min(sent, to)]);
    cursor = Math.max(cursor, back);
  }
  if (to > cursor) own.push([cursor, to]);
  return own.filter(([a, b]) => b - a > 1e-9);
}

/** Each pair of components the request travelled between, as "source→target". */
export function tracedLinks(trace: TraceRecord): Set<string> {
  const node = new Map(trace.spans.map((s) => [s.id, s.node]));
  const links = new Set<string>();
  for (const s of trace.spans) {
    const from = s.parent === null ? undefined : node.get(s.parent);
    if (from) links.add(`${from}→${s.node}`);
  }
  return links;
}

/** How much of a request's time one component took: waiting in its line, or working on it. */
export type TimeShare = { node: string; waited: number; worked: number; share: number };

/**
 * Where a request's time went, per component, biggest first: the time it
 * waited in each component's line plus the time each one worked on it.
 * Only until the client had its answer; network time and waiting on the
 * next component aren't anyone's own. The client itself isn't counted.
 */
export function whereTimeWent(trace: TraceRecord): TimeShare[] {
  const total = trace.finishedAt - trace.startedAt;
  if (total <= 0) return [];
  const clip = ([a, b]: [number, number]) =>
    Math.max(0, Math.min(b, trace.finishedAt) - Math.max(a, trace.startedAt));
  const children = new Map<number, Span[]>();
  for (const s of trace.spans) {
    if (s.parent === null) continue;
    children.set(s.parent, [...(children.get(s.parent) ?? []), s]);
  }
  const byNode = new Map<string, { waited: number; worked: number }>();
  for (const s of trace.spans) {
    if (s.parent === null || s.arrivedAt === null) continue;
    const started = s.startedAt ?? s.arrivedAt;
    const answered = s.repliedAt ?? trace.finishedAt;
    const waited = clip([s.arrivedAt, started]);
    const worked = ownTime(started, answered, children.get(s.id) ?? []).reduce(
      (sum, part) => sum + clip(part),
      0,
    );
    const entry = byNode.get(s.node) ?? { waited: 0, worked: 0 };
    entry.waited += waited;
    entry.worked += worked;
    byNode.set(s.node, entry);
  }
  return [...byNode]
    .map(([node, { waited, worked }]) => ({
      node,
      waited,
      worked,
      share: (waited + worked) / total,
    }))
    .sort((a, b) => b.share - a.share);
}
