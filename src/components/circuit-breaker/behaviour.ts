import type { ScheduledEvent } from "../../engine/core/eventQueue.ts";
import type { BehaviourFactory, Outcome } from "../../engine/runtime/types.ts";

type Settings = {
  threshold: number;
  minimumCalls: number;
  window: number;
  coolDown: number;
  probes: number;
  timeout: number;
};

/**
 * Closed: pass calls on, remembering how each recent one went (a call that
 * errors or outlasts the timeout failed). Too many failures, once enough
 * calls have been seen: open, and fail every call at once for the
 * cool-down. Then half-open: let up to `probes` test calls through. All of
 * them succeeding closes it; any failing opens it again.
 */
export const circuitBreaker: BehaviourFactory = ({ sim, node, recorder, send }) => {
  const params = () => node.params as Settings;
  type State = "closed" | "open" | "half-open";
  let state: State = "closed";
  let openedAt = 0;
  /** How recent calls went while closed, counted per second (bounded however busy it gets). */
  let calls = new Map<number, { total: number; failed: number }>();
  let probesSent = 0;
  let probesPassed = 0;
  let turn = 0;
  let inFlight = 0;

  const enter = (next: State) => {
    state = next;
    recorder.setBreakerState(next);
    if (next === "open") openedAt = sim.now;
    if (next === "half-open") {
      probesSent = 0;
      probesPassed = 0;
    }
    if (next === "closed") calls = new Map();
  };
  recorder.setBreakerState("closed");

  const record = (weight: number, failed: boolean) => {
    const second = Math.floor(sim.now / 1000);
    const oldest = second - Math.ceil(params().window);
    for (const key of calls.keys()) if (key < oldest) calls.delete(key);
    const slot = calls.get(second) ?? { total: 0, failed: 0 };
    slot.total += weight;
    if (failed) slot.failed += weight;
    calls.set(second, slot);
    if (failed) judge(oldest);
  };

  const judge = (oldest: number) => {
    let total = 0;
    let failed = 0;
    for (const [second, slot] of calls) {
      if (second <= oldest) continue;
      total += slot.total;
      failed += slot.failed;
    }
    if (total >= params().minimumCalls && failed / total >= params().threshold / 100) enter("open");
  };

  return {
    handle(request, reply) {
      const arrivedAt = sim.now;
      recorder.arrive(arrivedAt, request.weight);
      if (state === "open" && sim.now - openedAt >= params().coolDown * 1000) enter("half-open");
      const probe = state === "half-open";
      if (state === "open" || (probe && probesSent >= params().probes)) {
        // Failing fast: the dependency isn't even asked.
        recorder.drop(arrivedAt, request.weight);
        reply({ ok: false, reason: "unavailable" });
        return;
      }
      if (probe) probesSent++;

      const target = node.targets[turn++ % node.targets.length] as string;
      recorder.setInFlight(++inFlight);
      let settled = false;
      let timer: ScheduledEvent | null = null;
      const settle = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        if (timer) sim.cancel(timer);
        recorder.setInFlight(--inFlight);
        recorder.complete(sim.now, sim.now - arrivedAt, outcome.ok, request.weight);
        if (probe && state === "half-open") {
          if (!outcome.ok) enter("open");
          else if (++probesPassed >= params().probes) enter("closed");
        } else if (state === "closed") {
          record(request.weight, !outcome.ok);
        }
        reply(outcome);
      };
      timer = sim.schedule(params().timeout, () => settle({ ok: false, reason: "timeout" }));
      send(target, request, settle);
    },
  };
};
