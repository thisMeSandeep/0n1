import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * An in-memory key store: a queueing server (it can only answer so many at
 * once) over a real LRU of keys with expiry. The hit ratio isn't a setting;
 * it comes from the size, the TTL and which keys clients ask for.
 * Answers `get` (with `hit`), `set` and `delete`.
 *
 * Sampling (S26): a sampled request stands for `weight` real ones, so each
 * key is asked for `weight` times less often; its TTL is stretched by the
 * same factor so entries don't expire early.
 */
export const cache: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const { size, concurrency, responseTime, ttl } = node.params as {
    size: number;
    concurrency: number;
    responseTime: number;
    ttl: number;
  };
  const ttlMs = ttl * 1000;
  /** key → expiry time. Map order is recency: oldest first. */
  const entries = new Map<number, number>();

  const lookup = (key: number): boolean => {
    const expires = entries.get(key);
    if (expires === undefined) return false;
    entries.delete(key);
    if (expires <= sim.now) return false;
    entries.set(key, expires); // most recently used now
    return true;
  };

  const store = (key: number, weight: number) => {
    entries.delete(key);
    entries.set(key, sim.now + ttlMs * weight);
    while (entries.size > size) {
      const oldest = entries.keys().next().value as number;
      entries.delete(oldest);
    }
  };

  const server = new QueueingServer(sim, recorder, {
    concurrency,
    maxWaiting: 100_000,
    work: (request, done, stretch) => {
      sim.schedule(workTime(rng, responseTime) * stretch, () => {
        if (request.op === "set") {
          store(request.key, request.weight);
          done({ ok: true });
        } else if (request.op === "delete") {
          entries.delete(request.key);
          done({ ok: true });
        } else {
          const hit = lookup(request.key);
          recorder.recordLookup(sim.now, hit, request.weight);
          done({ ok: true, hit });
        }
      });
    },
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
