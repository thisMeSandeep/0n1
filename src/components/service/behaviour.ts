import { lognormal } from "../../engine/core/distributions.ts";
import { callInSequence } from "../../engine/runtime/forward.ts";
import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * How much work per request varies: a lognormal with this coefficient of
 * variation (standard deviation ÷ mean). Most requests take about the
 * average; a few take much longer.
 */
export const WORK_TIME_CV = 1;

/**
 * One instance of an application: a queueing server. Each request does its
 * own work (a random time around the average), then calls the services and
 * load balancers it's connected to, one after another, holding its slot
 * until they answer, like a thread per request. Caches, databases and
 * queues join in S24 and S25.
 */
export const service: BehaviourFactory = (ctx) => {
  const { sim, rng, recorder, node } = ctx;
  const { concurrency, workTime, maxWaiting, errorRate } = node.params as {
    concurrency: number;
    workTime: number;
    maxWaiting: number;
    errorRate: number;
  };
  const server = new QueueingServer(sim, recorder, {
    concurrency,
    maxWaiting,
    work: (request, done) => {
      sim.schedule(lognormal(rng, workTime, WORK_TIME_CV), () => {
        if (rng.next() < errorRate / 100) done({ ok: false, reason: "error" });
        else callInSequence(ctx, node.routes.forward, request, done);
      });
    },
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
