import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissToast, toast, toastStore } from "./Toast.tsx";

afterEach(() => vi.useRealTimers());

describe("toast store", () => {
  it("adds toasts, closes them, then removes them after the exit animation", () => {
    vi.useFakeTimers();
    const id = toast({ title: "Backup saved" });

    expect(toastStore.getSnapshot().find((t) => t.id === id)?.open).toBe(true);

    dismissToast(id);
    expect(toastStore.getSnapshot().find((t) => t.id === id)?.open).toBe(false);

    vi.runAllTimers();
    expect(toastStore.getSnapshot().find((t) => t.id === id)).toBeUndefined();
  });

  it("notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);
    toast({ title: "Hello" });
    unsubscribe();
    toast({ title: "Ignored" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
