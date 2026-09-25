"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Media-Query als externer Store (useSyncExternalStore):
 * kein setState im Effect, kein Zusatz-Render beim Mount, SSR-sicher.
 */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    if (typeof window === "undefined") return null;
    const mq = window.matchMedia(query);
    return {
      subscribe: (cb: () => void) => {
        mq.addEventListener("change", cb);
        return () => mq.removeEventListener("change", cb);
      },
      get: () => mq.matches,
    };
  }, [query]);

  return useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.get : () => false,
    () => false
  );
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 768px)");
}
export function useIsTablet() {
  return useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
}
export function useIsPortrait() {
  return useMediaQuery("(orientation: portrait)");
}
