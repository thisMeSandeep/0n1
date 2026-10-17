import { describe, expect, it, vi } from "vitest";
import { subscribeMediaQuery } from "./useMediaQuery.ts";

function fakeMatchMedia() {
  const listeners = new Set<() => void>();
  const list = {
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  } as unknown as MediaQueryList;
  return {
    matchMedia: () => list,
    fire: () => {
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

describe("subscribeMediaQuery", () => {
  it("notifies on change until unsubscribed", () => {
    const media = fakeMatchMedia();
    const onChange = vi.fn();

    const unsubscribe = subscribeMediaQuery("(x)", onChange, media.matchMedia);
    media.fire();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    media.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(media.listeners.size).toBe(0);
  });
});
