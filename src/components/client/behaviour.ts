import { createZipf, exponential, uniformInt } from "../../engine/core/distributions.ts";
import type { ScheduledEvent } from "../../engine/core/eventQueue.ts";
import type { BehaviourFactory, Outcome, Request } from "../../engine/runtime/types.ts";

/**
 * Open-loop Poisson traffic: requests arrive at random at the configured
 * average rate, whatever the system is doing. Each attempt has a timeout;
 * after a timeout or failure the client retries straight away, up to
 * `retries` extra times. A reply that comes after the timeout is ignored,
 * but the work it caused still happened.
 */
export const client: BehaviourFactory = ({
  sim,
  rng,
  node,
  recorder,
  system,
  send,
  nextRequestId,
}) => {
  const { rate, readShare, keys, keyPopularity, timeout, retries } = node.params as {
    rate: number;
    readShare: number;
    keys: number;
    keyPopularity: "hot" | "uniform";
    timeout: number;
    retries: number;
  };
  const meanGapMs = 1000 / rate;
  const zipf = keyPopularity === "hot" ? createZipf(keys, 1) : null;
  let nextTarget = 0;

  const pickTarget = () => {
    const target = node.targets[nextTarget % node.targets.length] as string;
    nextTarget++;
    return target;
  };

  const finish = (request: Request, ok: boolean) => {
    const latency = sim.now - request.createdAt;
    system.respond(sim.now, latency, ok, request.weight);
    recorder.complete(sim.now, latency, ok, request.weight);
  };

  const attempt = (request: Request) => {
    let settled = false;
    let timer: ScheduledEvent | null = null;

    const settle = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      if (timer) sim.cancel(timer);
      if (outcome.ok) finish(request, true);
      else if (request.attempt <= retries)
        attempt({ ...request, attempt: request.attempt + 1, path: [node.id] });
      else finish(request, false);
    };

    timer = sim.schedule(timeout, () => settle({ ok: false, reason: "timeout" }));
    send(pickTarget(), request, settle);
  };

  const sendOne = () => {
    const request: Request = {
      id: nextRequestId(),
      weight: 1,
      kind: rng.next() < readShare / 100 ? "read" : "write",
      key: zipf ? zipf.sample(rng) : uniformInt(rng, keys),
      createdAt: sim.now,
      attempt: 1,
      path: [node.id],
    };
    recorder.arrive(sim.now, request.weight);
    attempt(request);
    sim.schedule(exponential(rng, meanGapMs), sendOne);
  };

  return {
    // Clients don't take requests (the compiler enforces it).
    handle: (_request, reply) => reply({ ok: false, reason: "unavailable" }),
    start: () => {
      if (node.targets.length > 0) sim.schedule(exponential(rng, meanGapMs), sendOne);
    },
  };
};
