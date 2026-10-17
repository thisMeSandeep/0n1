import type { BehaviourContext, Outcome, Request } from "./types.ts";

/**
 * How a service (or worker) reads and writes its data, cache-aside:
 * - Read: ask the cache; on a miss read a replica if there is one,
 *   otherwise the database, then store the result in the cache.
 * - Write: write the database, then invalidate the key in the cache.
 * With several caches or databases, the key picks one (sharding);
 * replicas take turns.
 */
export function createDataAccess(ctx: Pick<BehaviourContext, "send" | "node">) {
  const { send, node } = ctx;
  const { caches, databases, replicas } = node.routes;
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

    // A write.
    const database = byKey(databases, request.key);
    if (database === null) {
      // Replicas are read-only; with only replicas there's nowhere to write.
      done(replicas.length > 0 ? { ok: false, reason: "unavailable" } : { ok: true });
      return;
    }
    send(database, { ...request, op: undefined }, (write) => {
      if (!write.ok || cache === null) done(write);
      else send(cache, { ...request, op: "delete" }, () => done({ ok: true }));
    });
  };
}
