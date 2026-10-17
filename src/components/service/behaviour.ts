import { lognormal } from "../../engine/core/distributions.ts";
import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * How much work per request varies: a lognormal with this coefficient of
 * variation (standard deviation ÷ mean). Most requests take about the
 * average; a few take much longer.
 */
export const WORK_TIME_CV = 1;

/**
 * One instance of an application: a queueing server whose work takes a
 * random time around the average. Calls to what it's connected to arrive
 * in S23.
 */
export const service: BehaviourFactory = ({ sim, rng, recorder, node }) => {
  const { concurrency, workTime, maxWaiting, errorRate } = node.params as {
    concurrency: number;
    workTime: number;
    maxWaiting: number;
    errorRate: number;
  };
  const server = new QueueingServer(sim, recorder, {
    concurrency,
    maxWaiting,
    work: (_request, done) => {
      sim.schedule(lognormal(rng, workTime, WORK_TIME_CV), () =>
        done(rng.next() < errorRate / 100 ? { ok: false, reason: "error" } : { ok: true }),
      );
    },
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
