import { useSyncExternalStore } from "react";

type MatchMedia = (query: string) => MediaQueryList;

/** Subscribe to a media query. Returns an unsubscribe function. */
export function subscribeMediaQuery(
  query: string,
  onChange: () => void,
  matchMedia: MatchMedia = window.matchMedia.bind(window),
): () => void {
  const list = matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMediaQuery(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user asked the OS to minimise motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
