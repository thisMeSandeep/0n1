import { describe, expect, it } from "vitest";
import { EventQueue } from "./eventQueue.ts";
import { createRng } from "./prng.ts";

const noop = () => {};

describe("EventQueue", () => {
  it("pops events in time order", () => {
    const queue = new EventQueue();
    const rng = createRng(1);
    const times = Array.from({ length: 1000 }, () => rng.next() * 1000);
    for (const t of times) queue.push(t, noop);

    const popped: number[] = [];
    for (let e = queue.pop(); e; e = queue.pop()) popped.push(e.time);
    expect(popped).toEqual([...times].sort((a, b) => a - b));
  });

  it("keeps scheduling order for equal times", () => {
    const queue = new EventQueue();
    const order: string[] = [];
    for (const label of ["a", "b", "c", "d"]) queue.push(5, () => order.push(label));
    queue.push(1, () => order.push("first"));
    for (let e = queue.pop(); e; e = queue.pop()) e.run();
    expect(order).toEqual(["first", "a", "b", "c", "d"]);
  });

  it("skips cancelled events and counts only live ones", () => {
    const queue = new EventQueue();
    const a = queue.push(1, noop);
    const b = queue.push(2, noop);
    queue.push(3, noop);
    queue.cancel(a);
    queue.cancel(a);
    expect(queue.size).toBe(2);
    expect(queue.peek()).toBe(b);
    expect(queue.pop()?.time).toBe(2);
    expect(queue.pop()?.time).toBe(3);
    expect(queue.pop()).toBeUndefined();
    expect(queue.size).toBe(0);
  });
});
