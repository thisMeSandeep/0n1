import { createZipf, exponential, uniformInt } from "../../engine/core/distributions.ts";
import type { ScheduledEvent } from "../../engine/core/eventQueue.ts";
import type { BehaviourFactory, Outcome, Request } from "../../engine/runtime/types.ts";

/**
 * Open-loop Poisson traffic: requests arrive at random at the configured
 * average rate, whatever the system is doing. Each attempt has a timeout;
 * after a timeout or failure the client retries straight away, up to
 * `retries` extra times. A reply that comes after the timeout is ignored,
 * but the work it caused still happened.
 *
 * When sampling (S26), it sends one request per `weight` real ones, each
 * standing for `weight`, so the real rate is unchanged.
 */
export const client: BehaviourFactory = ({
  sim,
  rng,
  node,
  recorder,
  system,
  send,
  nextRequestId,
  sampling,
  traffic,
}) => {
  // Read live, so changes while running take effect (S28).
  const params = () =>
    node.params as {
      rate: number;
      readShare: number;
      keys: number;
      keyPopularity: "hot" | "uniform";
      timeout: number;
      retries: number;
    };
  /** Average gap between new requests, for the current rate, traffic and sampling. */
  const meanGapMs = () => (1000 * sampling.weight()) / (params().rate * traffic());
  let zipf: { keys: number; sampler: ReturnType<typeof createZipf> } | null = null;
  const pickKey = () => {
    const { keys, keyPopularity } = params();
    if (keyPopularity !== "hot") return uniformInt(rng, keys);
    if (zipf?.keys !== keys) zipf = { keys, sampler: createZipf(keys, 1) };
    return zipf.sampler.sample(rng);
  };
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
      else if (request.attempt <= params().retries)
        attempt({ ...request, attempt: request.attempt + 1, path: [node.id] });
      else finish(request, false);
    };

    timer = sim.schedule(params().timeout, () => settle({ ok: false, reason: "timeout" }));
    send(pickTarget(), request, settle);
  };

  const sendOne = () => {
    const weight = sampling.weight();
    sampling.countRequest();
    const request: Request = {
      id: nextRequestId(),
      weight,
      kind: rng.next() < params().readShare / 100 ? "read" : "write",
      key: pickKey(),
      createdAt: sim.now,
      attempt: 1,
      path: [node.id],
    };
    recorder.arrive(sim.now, request.weight);
    attempt(request);
    sim.schedule(exponential(rng, meanGapMs()), sendOne);
  };

  return {
    // Clients don't take requests (the compiler enforces it).
    handle: (_request, reply) => reply({ ok: false, reason: "unavailable" }),
    start: () => {
      if (node.targets.length > 0) sim.schedule(exponential(rng, meanGapMs()), sendOne);
    },
  };
};
