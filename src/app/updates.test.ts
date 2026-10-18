import { describe, expect, it, vi } from "vitest";
import type { ToastOptions } from "../ui/Toast.tsx";
import { UPDATE_READY, watchForUpdates } from "./updates.ts";

function setup(save: () => Promise<void> = () => Promise.resolve()) {
  let needRefresh = () => {};
  const activate = vi.fn(() => Promise.resolve());
  const notify = vi.fn<(options: ToastOptions) => void>();
  const saved = vi.fn(save);
  watchForUpdates({
    register: (options) => {
      needRefresh = options.onNeedRefresh;
      return activate;
    },
    notify,
    save: saved,
  });
  return { needRefresh: () => needRefresh(), activate, notify, saved };
}

describe("new versions", () => {
  it("says nothing until a new version is ready, and never reloads on its own", () => {
    const { activate, notify } = setup();
    expect(notify).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("says so once, quietly, with a Reload button that stays until used", () => {
    const { needRefresh, notify, activate } = setup();
    needRefresh();
    needRefresh();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({
      title: UPDATE_READY,
      action: { label: "Reload" },
      durationMs: Number.POSITIVE_INFINITY,
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("stores pending edits before reloading", async () => {
    const order: string[] = [];
    const { needRefresh, notify, activate } = setup(async () => {
      order.push("saved");
    });
    activate.mockImplementation(async () => {
      order.push("reloaded");
    });
    needRefresh();
    notify.mock.calls[0]?.[0].action?.onClick();
    await vi.waitFor(() => expect(order).toEqual(["saved", "reloaded"]));
    expect(activate).toHaveBeenCalledWith(true);
  });

  it("still reloads if storing fails", async () => {
    const { needRefresh, notify, activate } = setup(() => Promise.reject(new Error("quota")));
    needRefresh();
    notify.mock.calls[0]?.[0].action?.onClick();
    await vi.waitFor(() => expect(activate).toHaveBeenCalled());
  });
});
