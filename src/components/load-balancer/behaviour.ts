import { createTokenBucket } from "../../engine/runtime/tokenBucket.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * Picks one target per request (round robin, or the one with the fewest
 * requests in progress), adds a small fixed delay, and turns requests away
 * above its throughput limit. Skipping targets that are down arrives in S27.
 */
export const loadBalancer: BehaviourFactory = ({ sim, node, recorder, send }) => {
  const { strategy, delay, throughputLimit } = node.params as {
    strategy: "round-robin" | "least-busy";
    delay: number;
    throughputLimit: number;
  };
  const targets = node.targets;
  const outstanding = new Map(targets.map((t) => [t, 0]));
  const limit = createTokenBucket(throughputLimit);
  let turn = 0;
  let inFlight = 0;
  recorder.setRateCapacity(throughputLimit);

  const pick = (): string => {
    const start = turn++ % targets.length;
    if (strategy === "round-robin") return targets[start] as string;
    // Least busy; ties go to whoever's turn it is, so it's still fair.
    let best = targets[start] as string;
    for (let i = 1; i < targets.length; i++) {
      const candidate = targets[(start + i) % targets.length] as string;
      if ((outstanding.get(candidate) ?? 0) < (outstanding.get(best) ?? 0)) best = candidate;
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
      outstanding.set(target, (outstanding.get(target) ?? 0) + 1);
      recorder.setInFlight(++inFlight);
      sim.schedule(delay, () =>
        send(target, request, (outcome) => {
          outstanding.set(target, (outstanding.get(target) ?? 1) - 1);
          recorder.setInFlight(--inFlight);
          recorder.complete(sim.now, sim.now - arrivedAt, outcome.ok, request.weight);
          reply(outcome);
        }),
      );
    },
  };
};
