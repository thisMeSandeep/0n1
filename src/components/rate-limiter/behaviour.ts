import { createTokenBucket } from "../../engine/runtime/tokenBucket.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/** Most keys it keeps a bucket for; the least recently seen are forgotten (they'd be full anyway). */
const MAX_KEYS = 100_000;

/**
 * A token bucket per scope: one for everyone, or one per key. A request
 * with no token is rejected at once; the rest pass to a target in turn.
 * Settings are read live: a change starts fresh buckets.
 */
export const rateLimiter: BehaviourFactory = ({ sim, node, recorder, send }) => {
  const params = () => node.params as { limit: number; scope: "everyone" | "key"; burst: number };
  type Bucket = ReturnType<typeof createTokenBucket>;
  let settings = "";
  let shared: Bucket | null = null;
  const perKey = new Map<number, Bucket>();
  const newBucket = () => {
    const { limit, burst } = params();
    return createTokenBucket(limit, (burst / limit) * 1000);
  };
  const bucketFor = (key: number): Bucket => {
    const { limit, burst, scope } = params();
    const current = `${limit}/${burst}/${scope}`;
    if (current !== settings) {
      settings = current;
      shared = null;
      perKey.clear();
    }
    if (scope === "everyone") {
      shared ??= newBucket();
      return shared;
    }
    let bucket = perKey.get(key);
    if (bucket) {
      perKey.delete(key); // most recently used now
    } else {
      bucket = newBucket();
      if (perKey.size >= MAX_KEYS) perKey.delete(perKey.keys().next().value as number);
    }
    perKey.set(key, bucket);
    return bucket;
  };

  let turn = 0;
  let inFlight = 0;
  return {
    handle(request, reply) {
      const arrivedAt = sim.now;
      recorder.arrive(arrivedAt, request.weight);
      if (!bucketFor(request.key).take(arrivedAt, request.weight)) {
        recorder.drop(arrivedAt, request.weight);
        reply({ ok: false, reason: "rejected" });
        return;
      }
      const target = node.targets[turn++ % node.targets.length] as string;
      recorder.setInFlight(++inFlight);
      send(target, request, (outcome) => {
        recorder.setInFlight(--inFlight);
        recorder.complete(sim.now, sim.now - arrivedAt, outcome.ok, request.weight);
        reply(outcome);
      });
    },
  };
};
