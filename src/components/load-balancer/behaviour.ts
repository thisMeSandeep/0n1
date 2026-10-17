import { createTokenBucket } from "../../engine/runtime/tokenBucket.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * Picks one target per request (round robin, or the one with the fewest
 * requests in progress), adds a small fixed delay, and turns requests away
 * above its throughput limit. With health checks on, it only picks targets
 * that are up; with them off, requests sent to a down target fail.
 */
export const loadBalancer: BehaviourFactory = ({ sim, node, recorder, send, isUp }) => {
  const { strategy, delay, throughputLimit, healthChecks } = node.params as {
    strategy: "round-robin" | "least-busy";
    delay: number;
    throughputLimit: number;
    healthChecks: boolean;
  };
  const targets = node.targets;
  const outstanding = new Map(targets.map((t) => [t, 0]));
  const limit = createTokenBucket(throughputLimit);
  let turn = 0;
  let inFlight = 0;
  recorder.setRateCapacity(throughputLimit);

  /** The next target, or null if health checks find none up. */
  const pick = (): string | null => {
    const start = turn++ % targets.length;
    let best: string | null = null;
    for (let i = 0; i < targets.length; i++) {
      const candidate = targets[(start + i) % targets.length] as string;
      if (healthChecks && !isUp(candidate)) continue;
      if (strategy === "round-robin") return candidate;
      // Least busy; ties go to whoever's turn it is, so it's still fair.
      if (best === null || (outstanding.get(candidate) ?? 0) < (outstanding.get(best) ?? 0)) {
        best = candidate;
      }
    }
    return best;
  };

  return {
    handle(request, reply) {
      const arrivedAt = sim.now;
      recorder.arrive(arrivedAt, request.weight);
      if (!limit.take(arrivedAt, request.weight)) {
        recorder.drop(arrivedAt, request.weight);
        reply({ ok: false, reason: "rejected" });
        return;
      }
      const target = pick();
      if (target === null) {
        recorder.complete(arrivedAt, 0, false, request.weight);
        reply({ ok: false, reason: "unavailable" });
        return;
      }
      outstanding.set(target, (outstanding.get(target) ?? 0) + request.weight);
      recorder.setInFlight(++inFlight);
      sim.schedule(delay, () =>
        send(target, request, (outcome) => {
          outstanding.set(target, (outstanding.get(target) ?? request.weight) - request.weight);
          recorder.setInFlight(--inFlight);
          recorder.complete(sim.now, sim.now - arrivedAt, outcome.ok, request.weight);
          reply(outcome);
        }),
      );
    },
  };
};
