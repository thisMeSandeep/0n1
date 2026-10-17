import { createApplicationWork } from "../../engine/runtime/application.ts";
import { QueueingServer } from "../../engine/runtime/server.ts";
import type { BehaviourFactory } from "../../engine/runtime/types.ts";

/**
 * Background processing: the same work as a service (own work, calls,
 * data), but jobs come from a queue that only hands over as many as the
 * worker has slots for, so the backlog stays in the queue.
 */
export const worker: BehaviourFactory = (ctx) => {
  const params = () =>
    ctx.node.params as { concurrency: number; workTime: number; errorRate: number };
  const server = new QueueingServer(ctx.sim, ctx.recorder, {
    get concurrency() {
      return params().concurrency;
    },
    // Normally never used: the queue respects the worker's slots. It only
    // matters if several queues feed one worker.
    maxWaiting: Number.POSITIVE_INFINITY,
    work: createApplicationWork(ctx, () => ({
      workTimeMs: params().workTime,
      errorRate: params().errorRate,
    })),
  });
  return { handle: (request, reply) => server.handle(request, reply) };
};
