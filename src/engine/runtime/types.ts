import type { RuntimeNode } from "../compile.ts";
import type { Rng } from "../core/prng.ts";
import type { Simulator } from "../core/simulator.ts";
import type { NodeRecorder, SystemRecorder } from "../metrics/recorder.ts";

/** One request travelling through the system. Retries are new attempts of the same request. */
export type Request = {
  id: number;
  /** How many real requests this one stands for (above 1 when sampling, S26). */
  weight: number;
  kind: "read" | "write";
  /** Which item it's about: a rank, where 0 is the most popular key. */
  key: number;
  /** When the client first sent it (ms). */
  createdAt: number;
  /** 1 for the first try, 2 for the first retry… */
  attempt: number;
  /** Components it has passed through, in order. */
  path: string[];
  /**
   * What's being asked of a data component, when it isn't the request's own
   * read or write: cache lookups, fills and invalidations, and replication.
   */
  op?: "get" | "set" | "delete" | "replicate";
};

export type FailureReason =
  /** The component failed it (its error rate). */
  | "error"
  /** Turned away: line full or rate limited. */
  | "rejected"
  /** The client gave up waiting. */
  | "timeout"
  /** The component (or what it needed) is down (S27). */
  | "unavailable";

export type Outcome =
  /** `hit` is set by caches and CDNs: whether the answer came from them. */
  { ok: true; hit?: boolean } | { ok: false; reason: FailureReason };

/** Called exactly once with how a request ended. */
export type Reply = (outcome: Outcome) => void;

export type BehaviourContext = {
  sim: Simulator;
  /** This component's own random stream. */
  rng: Rng;
  node: RuntimeNode;
  recorder: NodeRecorder;
  /** What clients experience end to end. */
  system: SystemRecorder;
  /** Send a request to another component; network delay applies both ways. */
  send(to: string, request: Request, onReply: Reply): void;
  nextRequestId(): number;
};

/** What a component does with requests that reach it. */
export type Behaviour = {
  handle(request: Request, reply: Reply): void;
  /** Called once when the run starts (clients start sending here). */
  start?(): void;
};

export type BehaviourFactory = (ctx: BehaviourContext) => Behaviour;
