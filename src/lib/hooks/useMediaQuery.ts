"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else (mq as any).addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else (mq as any).removeListener(handler);
    };
  }, [query]);
  return matches;
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
