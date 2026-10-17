/**
 * Picks how many real requests each simulated one stands for, so the
 * engine stays within an event budget whatever the traffic (S26).
 *
 * It learns how many events a request costs in this system (network hops,
 * calls, timers…) and chooses the smallest whole weight that keeps events
 * per simulated second under budget. It only steps down once the need has
 * dropped well below the current weight, so the weight doesn't flicker.
 *
 * Sampling is an approximation, and the UI says so ("Sampling 1 in N"):
 * - Throughput, utilization and error rates stay accurate.
 * - A sampled request reaches a server like a small burst of real ones, so
 *   waiting times grow once the weight is a sizeable share of a server's
 *   slots (measured: about +3% latency at weight 4 on 32-slot services,
 *   +11% at 8, much more at 16). Keep weights small; the default budget does.
 * - Fewer concurrent duplicate requests means fewer cache stampedes, so hit
 *   ratios read slightly high.
 */
export class SamplingController {
  #weight = 1;
  /** Events per request: starts from a guess, then learned. */
  #eventsPerRequest: number;
  #requests = 0;
  #lastRequests = 0;
  #lastEvents = 0;

  constructor(
    private readonly budgetPerSecond: number,
    private offeredRate: number,
    initialEventsPerRequest = 10,
  ) {
    this.#eventsPerRequest = initialEventsPerRequest;
    this.#update();
  }

  get weight(): number {
    return this.#weight;
  }

  get eventsPerRequest(): number {
    return this.#eventsPerRequest;
  }

  countRequest(): void {
    this.#requests++;
  }

  /** Real requests per second clients are offering (e.g. after a rate change, S28). */
  setOfferedRate(perSecond: number): void {
    this.offeredRate = perSecond;
    this.#update();
  }

  /** Called regularly with the total events processed so far. */
  observe(eventsProcessed: number): void {
    const requests = this.#requests - this.#lastRequests;
    const events = eventsProcessed - this.#lastEvents;
    this.#lastRequests = this.#requests;
    this.#lastEvents = eventsProcessed;
    if (requests >= 20) {
      this.#eventsPerRequest = 0.7 * this.#eventsPerRequest + 0.3 * (events / requests);
    }
    this.#update();
  }

  #update(): void {
    if (!Number.isFinite(this.budgetPerSecond)) {
      this.#weight = 1;
      return;
    }
    const needed = Math.max(
      1,
      Math.ceil((this.offeredRate * this.#eventsPerRequest) / this.budgetPerSecond),
    );
    // Step up at once (stay in budget); step down only past a 25% margin.
    if (needed > this.#weight || needed < this.#weight * 0.75) this.#weight = needed;
  }
}
