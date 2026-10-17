import { slotsFor } from "../../engine/runtime/server.ts";
import type { BehaviourFactory, Request } from "../../engine/runtime/types.ts";

/** A failing job is tried at most this many times when redelivery is on. */
export const MAX_DELIVERIES = 5;

type Job = { request: Request; enqueuedAt: number; deliveries: number };

/**
 * Accepts a job after its enqueue time and answers the sender straight
 * away. Jobs wait in order until a connected worker has a free slot, and go
 * to whichever worker has the most; the queue never hands a worker more
 * than it can take, so the backlog shows up here. When full, new jobs are
 * rejected. Depth and capacity count real jobs, so sampled jobs (S26)
 * count by their weight.
 */
export const queue: BehaviourFactory = ({ sim, node, recorder, send, peer }) => {
  const { capacity, enqueueTime, redeliver } = node.params as {
    capacity: number;
    enqueueTime: number;
    redeliver: boolean;
  };
  const workers = node.routes.workers.map((id) => {
    const concurrency = Math.max(1, Number(peer(id)?.params.concurrency ?? 1));
    return { id, concurrency, free: concurrency };
  });
  let jobs: Job[] = [];
  let head = 0;
  /** Real jobs waiting, and on their way in. */
  let depth = 0;
  let arriving = 0;
  let processing = 0;
  let turn = 0;

  const report = () => {
    recorder.setBusy(sim.now, depth, capacity);
    recorder.setInFlight(processing);
    recorder.setWaiting(depth);
    recorder.setOldest(head < jobs.length ? (jobs[head] as Job).enqueuedAt : null);
  };

  const push = (job: Job) => {
    jobs.push(job);
    depth += job.request.weight;
  };

  const takeNext = (): Job => {
    const job = jobs[head] as Job;
    head++;
    depth -= job.request.weight;
    if (head > 1024 && head * 2 > jobs.length) {
      jobs = jobs.slice(head);
      head = 0;
    }
    return job;
  };

  const finish = (job: Job, ok: boolean) =>
    recorder.complete(sim.now, sim.now - job.enqueuedAt, ok, job.request.weight);

  const dispatch = () => {
    while (head < jobs.length && workers.length > 0) {
      const next = jobs[head] as Job;
      // The worker with the most free slots, as if each free slot were
      // asking for work; ties take turns.
      let worker: (typeof workers)[number] | undefined;
      let slots = 0;
      for (let i = 0; i < workers.length; i++) {
        const candidate = workers[(turn + i) % workers.length];
        if (!candidate) continue;
        if (candidate.free >= 1 && (!worker || candidate.free > worker.free)) {
          worker = candidate;
          // Matches what the worker's own server will take (see slotsFor).
          slots = slotsFor(next.request.weight, candidate.free).slots;
        }
      }
      if (!worker) break;
      turn = (workers.indexOf(worker) + 1) % workers.length;

      const job = takeNext();
      const assigned = worker;
      assigned.free -= slots;
      processing += job.request.weight;
      send(assigned.id, job.request, (outcome) => {
        assigned.free += slots;
        processing -= job.request.weight;
        if (outcome.ok) finish(job, true);
        else if (redeliver && job.deliveries < MAX_DELIVERIES) {
          job.deliveries++;
          push(job);
        } else finish(job, false);
        dispatch();
      });
    }
    report();
  };

  report();
  return {
    handle(request, reply) {
      recorder.arrive(sim.now, request.weight);
      if (depth + arriving + request.weight > capacity) {
        recorder.drop(sim.now, request.weight);
        reply({ ok: false, reason: "rejected" });
        return;
      }
      arriving += request.weight;
      sim.schedule(enqueueTime, () => {
        arriving -= request.weight;
        push({ request: { ...request, op: undefined }, enqueuedAt: sim.now, deliveries: 1 });
        reply({ ok: true });
        dispatch();
      });
    },
  };
};
