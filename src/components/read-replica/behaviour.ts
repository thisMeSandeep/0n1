import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * A read-only copy of a database. Reads queue for its own connections.
 * Writes arrive from the primary and take `replicationLag` to apply; a read
 * of a key with a write still on its way is counted as stale. Applying
 * writes is treated as free, so it doesn't compete with reads for slots.
 * When sampling, each key sees `weight` times fewer writes, so a write's
 * stale window is stretched by its weight to keep the stale share right.
 */
export const readReplica: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const { connections, readTime, replicationLag, maxWaiting, errorRate } = node.params as {
    connections: number;
    readTime: number;
    replicationLag: number;
    maxWaiting: number;
    errorRate: number;
  };
  /** key → writes received but not yet applied. */
  const pending = new Map<number, number>();

  const server = new QueueingServer(sim, recorder, {
    concurrency: connections,
    maxWaiting,
    work: (request, done, stretch) => {
      sim.schedule(workTime(rng, readTime) * stretch, () => {
        if (rng.next() < errorRate / 100) {
          done({ ok: false, reason: "error" });
          return;
        }
        recorder.recordRead(sim.now, (pending.get(request.key) ?? 0) > 0, request.weight);
        done({ ok: true });
      });
    },
  });

  return {
    handle(request, reply) {
      if (request.op === "replicate") {
        pending.set(request.key, (pending.get(request.key) ?? 0) + 1);
        sim.schedule(replicationLag * request.weight, () => {
          const left = (pending.get(request.key) ?? 1) - 1;
          if (left > 0) pending.set(request.key, left);
          else pending.delete(request.key);
        });
        reply({ ok: true });
        return;
      }
      if (request.kind === "write") {
        reply({ ok: false, reason: "unavailable" }); // read-only
        return;
      }
      server.handle(request, reply);
    },
  };
};
