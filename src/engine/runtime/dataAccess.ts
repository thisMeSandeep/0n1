import { callInSequence } from "./forward.ts";
import type { BehaviourContext, Outcome, Request } from "./types.ts";

/**
 * How a service (or worker) reads and writes its data, cache-aside:
 * - Read: ask the cache; on a miss read a replica if there is one,
 *   otherwise the database, then store the result in the cache.
 * - Write: put it on a queue if there is one (a worker does it later),
 *   otherwise write the database, then invalidate the key in the cache.
 * - Search (S43b): a search index if there is one; otherwise the database
 *   scans for it, which is slow. Searches aren't cached.
 * - Publish (S43c): once a write is done (or queued), it's published to
 *   each pub/sub it's connected to, in turn.
 * With several caches or databases, the key picks one (sharding);
 * replicas take turns.
 */
export function createDataAccess(ctx: Pick<BehaviourContext, "send" | "node">) {
  const { send, node } = ctx;
  const { caches, databases, replicas, queues, search, topics } = node.routes;
  let nextReplica = 0;

  const byKey = (targets: readonly string[], key: number) =>
    targets.length > 0 ? (targets[key % targets.length] as string) : null;

  const readStore = (request: Request, done: (outcome: Outcome) => void) => {
    const store =
      replicas.length > 0
        ? (replicas[nextReplica++ % replicas.length] as string)
        : byKey(databases, request.key);
    if (store === null) done({ ok: false, reason: "unavailable" });
    else send(store, { ...request, op: undefined }, done);
  };

  return function access(request: Request, done: (outcome: Outcome) => void): void {
    if (request.kind === "search") {
      const store = byKey(search, request.key) ?? byKey(databases, request.key);
      if (store === null)
        done({ ok: true }); // nothing to search
      else send(store, { ...request, op: undefined }, done);
      return;
    }
    const cache = byKey(caches, request.key);
    const hasStore = databases.length + replicas.length > 0;

    if (request.kind === "read") {
      if (cache === null) {
        if (hasStore) readStore(request, done);
        else done({ ok: true });
        return;
      }
      send(cache, { ...request, op: "get" }, (lookup) => {
        if (lookup.ok && lookup.hit) {
          done({ ok: true });
          return;
        }
        // A miss, or the cache failed: go to the store, then fill the cache.
        readStore(request, (read) => {
          if (!read.ok) done(read);
          else send(cache, { ...request, op: "set" }, () => done({ ok: true }));
        });
      });
      return;
    }

    // A write: handed to a queue when there is one.
    const written =
      topics.length === 0
        ? done
        : (outcome: Outcome) =>
            outcome.ok
              ? callInSequence(ctx, topics, { ...request, op: undefined }, done)
              : done(outcome);
    const queue = byKey(queues, request.key);
    if (queue !== null) {
      send(queue, { ...request, op: undefined }, written);
      return;
    }
    const database = byKey(databases, request.key);
    if (database === null) {
      // Replicas are read-only; with only replicas there's nowhere to write.
      written(replicas.length > 0 ? { ok: false, reason: "unavailable" } : { ok: true });
      return;
    }
    send(database, { ...request, op: undefined }, (write) => {
      if (!write.ok || cache === null) written(write);
      else send(cache, { ...request, op: "delete" }, () => written({ ok: true }));
    });
  };
}
