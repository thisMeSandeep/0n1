import type { ToastOptions } from "../ui/Toast.tsx";

/*
 * New versions (S47). The service worker downloads a new version in the
 * background; 0n1 says so once, quietly, and only reloads when asked, after
 * storing any pending edit. Wired up in registerUpdates.ts.
 */

export const UPDATE_READY = "A new version of 0n1 is ready";

export type UpdateDeps = {
  /** Registers the service worker; the result activates the waiting version and reloads. */
  register(options: { onNeedRefresh(): void }): (reload?: boolean) => Promise<void>;
  notify(options: ToastOptions): void;
  /** Stores any pending edit to the open system. */
  save(): Promise<void>;
};

export function watchForUpdates({ register, notify, save }: UpdateDeps): void {
  let told = false;
  const activate = register({
    onNeedRefresh() {
      if (told) return;
      told = true;
      notify({
        title: UPDATE_READY,
        action: {
          label: "Reload",
          // Even if saving fails, the edit is still in memory: reloading is what was asked for.
          onClick: () =>
            void save()
              .catch(() => undefined)
              .then(() => activate(true)),
        },
        // It waits for the user, however long that takes.
        durationMs: Number.POSITIVE_INFINITY,
      });
    },
  });
}
