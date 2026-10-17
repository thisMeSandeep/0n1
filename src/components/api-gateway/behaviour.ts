import { liveTokenBucket } from "../../engine/runtime/tokenBucket.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * Checks each request (a small fixed delay), rejects it straight away if
 * rate limiting is on and the rate is over the limit, or if the gateway
 * itself is over its throughput limit, then passes it to a target in turn.
 */
export const apiGateway: BehaviourFactory = ({ sim, node, recorder, send }) => {
  const params = () =>
    node.params as {
      delay: number;
      throughputLimit: number;
      rateLimiting: boolean;
      rateLimit: number;
    };
  const throughput = liveTokenBucket(() => params().throughputLimit, recorder);
  const limiter = liveTokenBucket(() => params().rateLimit);
  let turn = 0;
  let inFlight = 0;

  return {
    handle(request, reply) {
      const arrivedAt = sim.now;
      recorder.arrive(arrivedAt, request.weight);
      const allowed =
        (!params().rateLimiting || limiter.take(arrivedAt, request.weight)) &&
        throughput.take(arrivedAt, request.weight);
      if (!allowed) {
        recorder.drop(arrivedAt, request.weight);
        reply({ ok: false, reason: "rejected" });
        return;
      }
      const target = node.targets[turn++ % node.targets.length] as string;
      recorder.setInFlight(++inFlight);
      sim.schedule(params().delay, () =>
        send(target, request, (outcome) => {
          recorder.setInFlight(--inFlight);
          recorder.complete(sim.now, sim.now - arrivedAt, outcome.ok, request.weight);
          reply(outcome);
        }),
      );
    },
  };
};
