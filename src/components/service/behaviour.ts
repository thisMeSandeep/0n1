import { createDataAccess } from "../../engine/runtime/dataAccess.ts";
import { callInSequence } from "../../engine/runtime/forward.ts";
import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime as sampleWorkTime } from "../../engine/runtime/workTime.ts";

/**
 * One instance of an application: a queueing server. Each request does its
 * own work (a random time around the average), then calls the services and
 * load balancers it's connected to, one after another, holding its slot
 * until they answer, like a thread per request. Then it reads or writes its
 * data (see dataAccess.ts). Queues join in S25.
 */
export const service: BehaviourFactory = (ctx) => {
  const { sim, rng, recorder, node } = ctx;
  const { concurrency, workTime, maxWaiting, errorRate } = node.params as {
    concurrency: number;
    workTime: number;
    maxWaiting: number;
    errorRate: number;
  };
  const data = createDataAccess(ctx);
  const server = new QueueingServer(sim, recorder, {
    concurrency,
    maxWaiting,
    work: (request, done) => {
      sim.schedule(sampleWorkTime(rng, workTime), () => {
        if (rng.next() < errorRate / 100) {
          done({ ok: false, reason: "error" });
          return;
        }
        callInSequence(ctx, node.routes.forward, request, (outcome) =>
          outcome.ok ? data(request, done) : done(outcome),
        );
      });
    },
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
