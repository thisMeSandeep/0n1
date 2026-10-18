import { QueueingServer } from "../../engine/runtime/server.ts";
import { liveTokenBucket } from "../../engine/runtime/tokenBucket.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * A request rate limit (a token bucket), then a queueing server whose work
 * is the time to first byte (varying like any work) plus the file's
 * transfer time at the set bandwidth.
 */
export const objectStorage: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const params = () =>
    node.params as {
      firstByte: number;
      objectSize: number;
      bandwidth: number;
      concurrency: number;
      requestLimit: number;
      errorRate: number;
    };
  const limit = liveTokenBucket(() => params().requestLimit);

  const server = new QueueingServer(sim, recorder, {
    get concurrency() {
      return params().concurrency;
    },
    // Callers past the limit are told to slow down instead; the line itself is long.
    maxWaiting: 100_000,
    work: (_request, done, stretch) => {
      const { firstByte, objectSize, bandwidth, errorRate } = params();
      const transferMs = (objectSize / 1024 / bandwidth) * 1000;
      sim.schedule((workTime(rng, firstByte) + transferMs) * stretch, () => {
        done(rng.next() < errorRate / 100 ? { ok: false, reason: "error" } : { ok: true });
      });
    },
  });

  return {
    handle(request, reply) {
      if (!limit.take(sim.now, request.weight)) {
        recorder.arrive(sim.now, request.weight);
        recorder.drop(sim.now, request.weight);
        reply({ ok: false, reason: "rejected" }); // "slow down"
        return;
      }
      server.handle(request, reply);
    },
  };
};
