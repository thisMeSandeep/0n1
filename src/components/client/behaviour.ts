import { createZipf, exponential, uniformInt } from "../../engine/core/distributions.ts";
import type { ScheduledEvent } from "../../engine/core/eventQueue.ts";
import type { BehaviourFactory, Outcome, Request } from "../../engine/runtime/types.ts";
import { maxShapeFactor, type ShapeSettings, shapeFactor } from "./shape.ts";

/**
 * Open-loop Poisson traffic: requests arrive at random at the configured
 * average rate, whatever the system is doing. Each attempt has a timeout;
 * after a timeout or failure the client retries straight away, up to
 * `retries` extra times. A reply that comes after the timeout is ignored,
 * but the work it caused still happened.
 *
 * When sampling (S26), it sends one request per `weight` real ones, each
 * standing for `weight`, so the real rate is unchanged.
 *
 * A traffic shape (S39) makes the rate change over time. Arrivals are drawn
 * at the shape's highest rate and each is kept with probability
 * (rate now ÷ highest rate): thinning, which follows the shape exactly.
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
  tracing,
}) => {
  // Read live, so changes while running take effect (S28).
  const params = () =>
    node.params as ShapeSettings & {
      rate: number;
      readShare: number;
      keys: number;
      keyPopularity: "hot" | "uniform";
      timeout: number;
      retries: number;
    };
  /** Average gap between candidate arrivals: at the shape's peak, with traffic and sampling. */
  const meanGapMs = () =>
    (1000 * sampling.weight()) / (params().rate * traffic() * maxShapeFactor(params()));
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

  const finish = (request: Request, outcome: Outcome) => {
    const latency = sim.now - request.createdAt;
    system.respond(sim.now, latency, outcome.ok, request.weight);
    recorder.complete(sim.now, latency, outcome.ok, request.weight);
    request.trace?.finish(sim.now, outcome.ok ? "ok" : outcome.reason);
  };

  const attempt = (request: Request) => {
    let settled = false;
    let timer: ScheduledEvent | null = null;

    const settle = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      if (timer) sim.cancel(timer);
      if (outcome.ok) finish(request, outcome);
      else if (request.attempt <= params().retries)
        attempt({ ...request, attempt: request.attempt + 1, path: [node.id] });
      else finish(request, outcome);
    };

    timer = sim.schedule(params().timeout, () => settle({ ok: false, reason: "timeout" }));
    send(pickTarget(), request, settle);
  };

  const sendOne = () => {
    const weight = sampling.weight();
    sampling.countRequest();
    const kind = rng.next() < params().readShare / 100 ? "read" : "write";
    const request: Request = {
      id: nextRequestId(),
      weight,
      kind,
      key: pickKey(),
      createdAt: sim.now,
      attempt: 1,
      path: [node.id],
    };
    const trace = tracing.begin(kind, sim.now);
    if (trace) {
      request.trace = trace;
      request.span = trace.root;
    }
    recorder.arrive(sim.now, request.weight);
    attempt(request);
  };

  const arrival = () => {
    const shape = params();
    const ceiling = maxShapeFactor(shape);
    const factor = shapeFactor(shape, sim.now / 1000);
    // Steady traffic keeps every arrival without a draw, so its runs are unchanged.
    if (factor >= ceiling || rng.next() < factor / ceiling) sendOne();
    sim.schedule(exponential(rng, meanGapMs()), arrival);
  };

  return {
    // Clients don't take requests (the compiler enforces it).
    handle: (_request, reply) => reply({ ok: false, reason: "unavailable" }),
    start: () => {
      if (node.targets.length > 0) sim.schedule(exponential(rng, meanGapMs()), arrival);
    },
    /** Real requests per second it's sending right now, before Traffic %. */
    offeredRate: () => params().rate * shapeFactor(params(), sim.now / 1000),
  };
};
