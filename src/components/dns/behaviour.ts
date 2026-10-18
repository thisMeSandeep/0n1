import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/** Lookups answered at once: a resolver is rarely what runs out. */
const LOOKUPS_AT_ONCE = 1000;

/**
 * Answers address lookups after the lookup time, maybe failing at the error
 * rate. Clients do the caching (client/resolver.ts): how long an answer is
 * kept is this component's TTL, which they read when it arrives.
 */
export const dns: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const params = () => node.params as { lookupTime: number; ttl: number; errorRate: number };
  const server = new QueueingServer(sim, recorder, {
    concurrency: LOOKUPS_AT_ONCE,
    maxWaiting: Number.POSITIVE_INFINITY,
    work: (_request, done, stretch) => {
      sim.schedule(workTime(rng, params().lookupTime) * stretch, () => {
        done(rng.next() < params().errorRate / 100 ? { ok: false, reason: "error" } : { ok: true });
      });
    },
  });
  return {
    handle(request, reply) {
      if (request.op !== "resolve") {
        reply({ ok: false, reason: "unavailable" }); // it only answers lookups
        return;
      }
      server.handle(request, reply);
    },
  };
};
