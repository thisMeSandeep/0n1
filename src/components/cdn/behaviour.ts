import type { BehaviourFactory } from "../../engine/runtime/types.ts";
import { workTime } from "../../engine/runtime/workTime.ts";

/**
 * Answers a share of reads at the edge (the hit ratio you set) after its
 * edge response time; misses and all writes go on to an origin, in turn.
 * Capacity is treated as unlimited.
 */
export const cdn: BehaviourFactory = ({ sim, rng, recorder, node, send }) => {
  const { hitRatio, edgeTime } = node.params as { hitRatio: number; edgeTime: number };
  let turn = 0;
  let inFlight = 0;

  return {
    handle(request, reply) {
      const arrivedAt = sim.now;
      recorder.arrive(arrivedAt, request.weight);
      recorder.setInFlight(++inFlight);
      const finish = (ok: boolean) => {
        recorder.setInFlight(--inFlight);
        recorder.complete(sim.now, sim.now - arrivedAt, ok, request.weight);
      };

      if (request.kind === "read") {
        const hit = rng.next() < hitRatio / 100;
        recorder.recordLookup(arrivedAt, hit, request.weight);
        if (hit) {
          sim.schedule(workTime(rng, edgeTime), () => {
            finish(true);
            reply({ ok: true, hit: true });
          });
          return;
        }
      }
      const origin = node.targets[turn++ % node.targets.length] as string;
      send(origin, request, (outcome) => {
        finish(outcome.ok);
        reply(outcome);
      });
    },
  };
};
