import type { FailureReason, Request, RequestKind } from "./types.ts";

/*
 * Request tracing (S42): one request followed hop by hop. Only traced
 * requests record anything, so tracing costs almost nothing.
 *
 * A span is one visit of the request to a component. Times are simulated ms:
 *   sentAt     the caller sent it
 *   arrivedAt  it reached the component (after the network)
 *   startedAt  it left the line and work began (components without a line start on arrival)
 *   repliedAt  the component answered
 *   receivedAt the answer reached the caller
 * The client's own span is the root: from creating the request to giving up
 * or getting its answer, retries included.
 */

export type SpanOutcome = "ok" | FailureReason;

export type Span = {
  id: number;
  /** The span that made this call; null for the client's root span. */
  parent: number | null;
  node: string;
  sentAt: number;
  arrivedAt: number | null;
  startedAt: number | null;
  repliedAt: number | null;
  receivedAt: number | null;
  outcome: SpanOutcome | null;
  /** The client's try this belongs to (1 = first, 2 = first retry…). */
  attempt: number;
  /** What was asked of it: the request's read or write, or a cache's get, set… */
  op: RequestKind | NonNullable<Request["op"]>;
};

/** Why it was traced: someone asked, or the engine kept it as the slowest or a failed one. */
export type TraceReason = "asked" | "slow" | "failed";

/** A finished trace, as plain data (it crosses from the worker to the page). */
export type TraceRecord = {
  id: string;
  reason: TraceReason;
  client: string;
  kind: RequestKind;
  startedAt: number;
  finishedAt: number;
  outcome: SpanOutcome;
  spans: Span[];
};

/**
 * `onFinish`: the client has its answer (or gave up). `onSettle`: the trace
 * is complete: finished, and every call in it has come back (work a queue
 * hands to a worker happens after the client's answer), or the engine gave
 * up waiting and called settle(). Each is called once.
 */
export type TraceHooks = {
  onFinish(trace: Trace): void;
  onSettle(trace: Trace): void;
};

export class Trace {
  readonly spans: Span[] = [];
  #finished: { at: number; outcome: SpanOutcome } | null = null;
  /** Calls sent and not yet answered. */
  #open = 0;
  #settled = false;

  constructor(
    readonly id: string,
    public reason: TraceReason,
    readonly client: string,
    readonly kind: RequestKind,
    readonly startedAt: number,
    private readonly hooks: TraceHooks,
  ) {
    this.spans.push(this.#span(null, client, startedAt, 1));
    const root = this.spans[0] as Span;
    root.arrivedAt = startedAt;
    root.startedAt = startedAt;
  }

  /** The client's own span. */
  get root(): number {
    return 0;
  }

  get finished(): boolean {
    return this.#finished !== null;
  }

  /** Reported: nothing more is recorded. */
  get settled(): boolean {
    return this.#settled;
  }

  #span(
    parent: number | null,
    node: string,
    sentAt: number,
    attempt: number,
    op: Span["op"] = this.kind,
  ): Span {
    return {
      op,
      id: this.spans.length,
      parent,
      node,
      sentAt,
      arrivedAt: null,
      startedAt: null,
      repliedAt: null,
      receivedAt: null,
      outcome: null,
      attempt,
    };
  }

  /** A call from span `parent` to `node`; returns the new span's id. */
  send(parent: number, node: string, at: number, attempt: number, op?: Span["op"]): number {
    const span = this.#span(parent, node, at, attempt, op);
    this.spans.push(span);
    this.#open++;
    return span.id;
  }

  arrive(span: number, at: number): void {
    const s = this.spans[span];
    if (s && s.arrivedAt === null) s.arrivedAt = at;
  }

  /** It left the line and work began. */
  start(span: number | undefined, at: number): void {
    const s = span === undefined ? undefined : this.spans[span];
    if (s && s.startedAt === null) s.startedAt = at;
  }

  reply(span: number, at: number, outcome: SpanOutcome): void {
    const s = this.spans[span];
    if (!s || s.repliedAt !== null) return;
    s.repliedAt = at;
    s.outcome = outcome;
    // Nothing waited in a line: it started as it arrived.
    s.startedAt ??= s.arrivedAt;
  }

  receive(span: number, at: number): void {
    const s = this.spans[span];
    if (!s || s.receivedAt !== null) return;
    s.receivedAt = at;
    this.#open--;
    this.#settleIfDone();
  }

  /** The client got its answer or gave up. Called once. */
  finish(at: number, outcome: SpanOutcome): void {
    if (this.#finished) return;
    this.#finished = { at, outcome };
    const root = this.spans[0] as Span;
    root.repliedAt = at;
    root.receivedAt = at;
    root.outcome = outcome;
    this.hooks.onFinish(this);
    this.#settleIfDone();
  }

  /** Complete: report it now, even if some calls are still out. */
  settle(): void {
    if (this.#settled) return;
    this.#settled = true;
    this.hooks.onSettle(this);
  }

  #settleIfDone(): void {
    if (this.#finished && this.#open <= 0) this.settle();
  }

  /** A copy as plain data: later activity (a reply after the client gave up) isn't included. */
  record(): TraceRecord {
    const finished = this.#finished ?? { at: this.startedAt, outcome: "timeout" as const };
    return {
      id: this.id,
      reason: this.reason,
      client: this.client,
      kind: this.kind,
      startedAt: this.startedAt,
      finishedAt: finished.at,
      outcome: finished.outcome,
      spans: this.spans.map((span) => ({ ...span })),
    };
  }
}
