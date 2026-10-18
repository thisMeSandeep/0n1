import type { Params } from "../../model/component.ts";
import type { SystemDocument } from "../../model/document.ts";
import type { CompileIssue } from "../compile.ts";
import type { MetricsSnapshot } from "../metrics/recorder.ts";
import type { TraceRecord } from "../runtime/trace.ts";

/*
 * Messages between the lab (main thread) and the simulation worker.
 * Plain data only, so they survive structured cloning.
 */

/** Run speeds offered by the top bar (UIUX §3). */
export const SPEEDS = [0.5, 1, 2, 5, 10] as const;

export type SimulationCommand =
  /** Compile and start a fresh run of a system (time back to 0, paused or running as before). */
  | { type: "load"; doc: SystemDocument; seed?: number }
  | { type: "play" }
  | { type: "pause" }
  /** Advance by this much simulated time, then pause. */
  | { type: "step"; ms: number }
  /** Start the loaded system again from time 0. */
  | { type: "reset" }
  | { type: "setSpeed"; speed: number }
  /** Scale every client's rate: 1 = as configured, 2 = double (the Traffic % control). */
  | { type: "setTraffic"; multiplier: number }
  /** Change settings while running; no reset needed. */
  | { type: "updateParams"; nodeId: string; params: Params }
  | { type: "takeDown"; nodeId: string }
  | { type: "bringBack"; nodeId: string }
  /** Trace the next request from a client, or from any client (S42). */
  | { type: "trace"; clientId: string | null };

export type SimulationEvent =
  /** The result of `load`: errors mean it can't run. */
  | { type: "loaded"; ok: boolean; errors: CompileIssue[]; warnings: CompileIssue[] }
  /** About 10 times a second while running, and after every command. */
  | {
      type: "snapshot";
      snapshot: MetricsSnapshot;
      running: boolean;
      speed: number;
      traffic: number;
    }
  /** Something went wrong handling a command. The run carries on if it can. */
  | { type: "error"; message: string }
  /** A finished request trace (S42): one asked for, or the slowest or a failed one. */
  | { type: "trace"; trace: TraceRecord };
