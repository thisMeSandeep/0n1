import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * A database: a limited number of connections, each running one query at a
 * time; the rest wait in line. Reads and writes take different times. Each
 * successful write is sent on to connected read replicas.
 */
export const database: BehaviourFactory = ({ sim, rng, recorder, node, send }) => {
  const { connections, readTime, writeTime, maxWaiting, errorRate } = node.params as {
    connections: number;
    readTime: number;
    writeTime: number;
    maxWaiting: number;
    errorRate: number;
  };
  const replicate = () => {};

  const server = new QueueingServer(sim, recorder, {
    concurrency: connections,
    maxWaiting,
    work: (request, done) => {
      const mean = request.kind === "write" ? writeTime : readTime;
      sim.schedule(workTime(rng, mean), () => {
        if (rng.next() < errorRate / 100) {
          done({ ok: false, reason: "error" });
          return;
        }
        if (request.kind === "write") {
          for (const replica of node.routes.replicas)
            send(replica, { ...request, op: "replicate" }, replicate);
        }
        done({ ok: true });
      });
    },
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
