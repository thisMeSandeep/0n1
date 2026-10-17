import { createDataAccess } from "./dataAccess.ts";
import { callInSequence } from "./forward.ts";
import type { BehaviourContext, Outcome, Request } from "./types.ts";
import { workTime } from "./workTime.ts";

/**
 * What application code does with a request, for services and workers:
 * its own work (a random time around the average), maybe failing at the
 * error rate, then calls to the services it's connected to, one after
 * another, then its data (see dataAccess.ts).
 */
export function createApplicationWork(
  ctx: BehaviourContext,
  { workTimeMs, errorRate }: { workTimeMs: number; errorRate: number },
) {
  const { sim, rng, node } = ctx;
  const data = createDataAccess(ctx);
  return (request: Request, done: (outcome: Outcome) => void, stretch = 1) => {
    sim.schedule(workTime(rng, workTimeMs) * stretch, () => {
      if (rng.next() < errorRate / 100) {
        done({ ok: false, reason: "error" });
        return;
      }
      callInSequence(ctx, node.routes.forward, request, (outcome) =>
        outcome.ok ? data(request, done) : done(outcome),
      );
    });
  };
}
