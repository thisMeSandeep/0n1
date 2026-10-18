/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import { flushPendingSave } from "../storage/index.ts";
import { toast } from "../ui/Toast.tsx";
import { watchForUpdates } from "./updates.ts";

/** How often an open lab asks whether a new version has been deployed. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Start the service worker (production builds only), and offer new versions as they arrive. */
export function startUpdates(): void {
  watchForUpdates({
    register: ({ onNeedRefresh }) => {
      const skipWaiting = registerSW({
        onNeedRefresh,
        // The plugin only reloads for some updates (not one found while the
        // page stays open); reloading below covers them all, once.
        onNeedReload: () => {},
        onRegisteredSW(_url, registration) {
          if (!registration) return;
          setInterval(() => registration.update().catch(() => {}), CHECK_EVERY_MS);
        },
      });
      return async () => {
        // The new version takes over, then the page reloads into it.
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
          once: true,
        });
        await skipWaiting(true);
      };
    },
    notify: toast,
    save: flushPendingSave,
  });
}
