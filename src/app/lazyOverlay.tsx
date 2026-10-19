import { type ComponentType, useEffect, useState } from "react";
import { useUi } from "../store/index.ts";
import type { UiState } from "../store/ui.ts";

/** After this long (or when the browser is next idle), overlays' code is fetched ahead of use. */
const PREFETCH_AFTER_MS = 2000;

/**
 * An overlay that isn't needed at first paint (M09). Its code stays out of
 * what the app downloads to start, is fetched once the app is idle, and
 * otherwise the first time the overlay opens. Once loaded it stays mounted,
 * so it opens instantly and closes with its animation.
 *
 * No React.lazy: React holds back content that suspended for about 300 ms,
 * which made a dialog lag behind its shortcut even with its code at hand.
 */
export function lazyOverlay(
  isOpen: (ui: UiState) => boolean,
  load: () => Promise<{ default: ComponentType }>,
): ComponentType {
  let loaded: ComponentType | null = null;
  let loading: Promise<ComponentType> | null = null;
  const get = () => {
    loading ??= load().then(
      (module) => {
        loaded = module.default;
        return loaded;
      },
      (error) => {
        loading = null; // try again next time
        throw error;
      },
    );
    return loading;
  };
  const prefetch = () => void get().catch(() => {});
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(prefetch);
      else prefetch();
    }, PREFETCH_AFTER_MS);
  }

  return function LazyOverlay() {
    const open = useUi(isOpen);
    const [Overlay, setOverlay] = useState<ComponentType | null>(() => loaded);
    useEffect(() => {
      if (!open || Overlay) return;
      let current = true;
      get().then(
        (component) => current && setOverlay(() => component),
        (error) => console.error("0n1: couldn't load part of the app", error),
      );
      return () => {
        current = false;
      };
    }, [open, Overlay]);
    return Overlay ? <Overlay /> : null;
  };
}
