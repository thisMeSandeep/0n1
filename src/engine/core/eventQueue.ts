/**
 * A min-heap of scheduled events ordered by time, then by the order they
 * were scheduled, so ties always resolve the same way. Cancelling is O(1):
 * cancelled events are skipped when they reach the top.
 */

export type ScheduledEvent = {
  readonly time: number;
  readonly seq: number;
  readonly run: () => void;
  cancelled: boolean;
};

const before = (a: ScheduledEvent, b: ScheduledEvent) =>
  a.time < b.time || (a.time === b.time && a.seq < b.seq);

export class EventQueue {
  #heap: ScheduledEvent[] = [];
  #seq = 0;
  #live = 0;

  /** Events still to run (cancelled ones don't count). */
  get size(): number {
    return this.#live;
  }

  push(time: number, run: () => void): ScheduledEvent {
    const event: ScheduledEvent = { time, seq: this.#seq++, run, cancelled: false };
    this.#heap.push(event);
    this.#up(this.#heap.length - 1);
    this.#live++;
    return event;
  }

  cancel(event: ScheduledEvent): void {
    if (event.cancelled) return;
    event.cancelled = true;
    this.#live--;
  }

  /** The next event that hasn't been cancelled, without removing it. */
  peek(): ScheduledEvent | undefined {
    this.#dropCancelled();
    return this.#heap[0];
  }

  pop(): ScheduledEvent | undefined {
    this.#dropCancelled();
    const top = this.#heap[0];
    if (!top) return undefined;
    this.#removeTop();
    this.#live--;
    return top;
  }

  #dropCancelled() {
    while (this.#heap[0]?.cancelled) this.#removeTop();
  }

  #removeTop() {
    const last = this.#heap.pop();
    if (last && this.#heap.length > 0) {
      this.#heap[0] = last;
      this.#down(0);
    }
  }

  #up(index: number) {
    const heap = this.#heap;
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(heap[i] as ScheduledEvent, heap[parent] as ScheduledEvent)) break;
      [heap[i], heap[parent]] = [heap[parent] as ScheduledEvent, heap[i] as ScheduledEvent];
      i = parent;
    }
  }

  #down(index: number) {
    const heap = this.#heap;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (
        left < heap.length &&
        before(heap[left] as ScheduledEvent, heap[smallest] as ScheduledEvent)
      ) {
        smallest = left;
      }
      if (
        right < heap.length &&
        before(heap[right] as ScheduledEvent, heap[smallest] as ScheduledEvent)
      ) {
        smallest = right;
      }
      if (smallest === i) return;
      [heap[i], heap[smallest]] = [heap[smallest] as ScheduledEvent, heap[i] as ScheduledEvent];
      i = smallest;
    }
  }
}
