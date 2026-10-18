import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * Answers searches from its own connections. Writes arrive from the
 * database and take `indexingDelay` to show up; a search for a key with a
 * write still on its way is a stale result. Indexing is treated as free,
 * like a replica applying writes. When sampling, each key sees `weight`
 * times fewer writes, so the stale window is stretched to match.
 */
export const searchIndex: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const params = () =>
    node.params as {
      connections: number;
      queryTime: number;
      indexingDelay: number;
      maxWaiting: number;
      errorRate: number;
    };
  /** key → writes received but not searchable yet. */
  const pending = new Map<number, number>();

  const server = new QueueingServer(sim, recorder, {
    get concurrency() {
      return params().connections;
    },
    get maxWaiting() {
      return params().maxWaiting;
    },
    work: (request, done, stretch) => {
      sim.schedule(workTime(rng, params().queryTime) * stretch, () => {
        if (rng.next() < params().errorRate / 100) {
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
      if (request.op === "index") {
        pending.set(request.key, (pending.get(request.key) ?? 0) + 1);
        sim.schedule(params().indexingDelay * request.weight, () => {
          const left = (pending.get(request.key) ?? 1) - 1;
          if (left > 0) pending.set(request.key, left);
          else pending.delete(request.key);
        });
        reply({ ok: true });
        return;
      }
      if (request.kind !== "search") {
        reply({ ok: false, reason: "unavailable" }); // it only answers searches
        return;
      }
      server.handle(request, reply);
    },
  };
};
