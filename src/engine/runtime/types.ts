import type { RuntimeNode } from "../compile.ts";
import type { ScheduledEvent } from "../core/eventQueue.ts";
import type { Rng } from "../core/prng.ts";
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
  | { ok: true; hit?: boolean }
  /**
   * `at`: the component the failure started at. The engine sets it when a
   * failure first comes back from a component; components passing it on keep it.
   */
  | { ok: false; reason: FailureReason; at?: string };

/** Called exactly once with how a request ended. */
export type Reply = (outcome: Outcome) => void;

/** Simulated time and scheduling, as a component sees it. */
export type Clock = {
  readonly now: number;
  schedule(delay: number, event: () => void): ScheduledEvent;
  at(time: number, event: () => void): ScheduledEvent;
  cancel(event: ScheduledEvent): void;
};

export type BehaviourContext = {
  /** Only runs this component's events while it's up (S27). */
  sim: Clock;
  /** This component's own random stream. */
  rng: Rng;
  node: RuntimeNode;
  recorder: NodeRecorder;
  /** What clients experience end to end. */
  system: SystemRecorder;
  /** Send a request to another component; network delay applies both ways. */
  send(to: string, request: Request, onReply: Reply): void;
  /** Another component in the system, e.g. a queue reading its workers' capacity. */
  peer(id: string): RuntimeNode | undefined;
  /** Whether another component is up (not taken down). */
  isUp(id: string): boolean;
  /** The Traffic % control as a multiplier (1 = as configured); clients scale their rate by it. */
  traffic(): number;
  nextRequestId(): number;
  /** Request sampling (S26): clients send one request per `weight` real ones. */
  sampling: {
    /** How many real requests each new request stands for right now. */
    weight(): number;
    /** A client sent a new request (not a retry). */
    countRequest(): void;
  };
};

/** What a component does with requests that reach it. */
export type Behaviour = {
  handle(request: Request, reply: Reply): void;
  /** Called once when the run starts (clients start sending here), and again after coming back up. */
  start?(): void;
  /** Another component was taken down or brought back. */
  onPeerStatus?(id: string, up: boolean): void;
  /** Another component's settings changed while running. */
  onPeerChange?(id: string): void;
  /** Clients: real requests per second sent right now, before the traffic multiplier (S39). */
  offeredRate?(): number;
};

export type BehaviourFactory = (ctx: BehaviourContext) => Behaviour;
