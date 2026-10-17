import { createApplicationWork } from "../../engine/runtime/application.ts";
import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * One instance of an application: a queueing server whose requests do
 * their own work, call the services they're connected to, then read or
 * write their data. A request holds its slot until all of that is done,
 * like a thread per request.
 */
export const service: BehaviourFactory = (ctx) => {
  const { concurrency, workTime, maxWaiting, errorRate } = ctx.node.params as {
    concurrency: number;
    workTime: number;
    maxWaiting: number;
    errorRate: number;
  };
  const server = new QueueingServer(ctx.sim, ctx.recorder, {
    concurrency,
    maxWaiting,
    work: createApplicationWork(ctx, { workTimeMs: workTime, errorRate }),
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
