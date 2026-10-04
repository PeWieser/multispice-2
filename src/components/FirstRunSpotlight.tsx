"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "@/state/editor";

const KEY = "multispice.firstRun.spotlightDone";

/**
 * S2.3: First-Run-Spotlight auf ▶ — strikt einmalig, non-modal, non-blockierend.
 * Manifest-Konformität (DESIGN §1 „keine Nudges, kein Auto-Popup"): kein Modal,
 * kein Zwang, kein Timer-Nag — ein Puls-Ring plus Hinweis-Chip, der beim ersten
 * Start, Klick oder Esc für immer verschwindet. Klicks fallen durch (außer ×).
 */
export default function FirstRunSpotlight() {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [done, setDone] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(KEY) === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (done) return;
    let alive = true;
    // Anker suchen (erster sichtbarer ▶-Button, Desktop oder Mobil).
    const find = (): boolean => {
      const els = Array.from(document.querySelectorAll('[data-spot="start-sim"]'));
      const el = els.find((e) => e instanceof HTMLElement && e.offsetParent !== null) as HTMLElement | undefined;
      if (el && alive) {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
        return true;
      }
      return false;
    };
    const dismiss = () => {
      if (!alive) return;
      try {
        window.localStorage.setItem(KEY, "1");
      } catch {}
      setDone(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    // State-Updates nur aus Async-Quellen (rAF/Listener/Subscription), nie
    // synchron im Effekt-Body (react-hooks/set-state-in-effect).
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const raf = requestAnimationFrame(() => {
      if (!find()) {
        const t = setTimeout(find, 500);
        timers.push(t);
      }
    });
    const onResize = () => find();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKey);
    // Erster Sim-Start beendet den First-Run (der Ring hat seinen Zweck erfüllt).
    const unsub = useEditor.subscribe((s) => {
      if (s.sim.running) dismiss();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKey);
      unsub();
    };
  }, [done]);

  if (done || !rect) return null;
  const below = rect.y + rect.h + 148 < window.innerHeight;
  return (
    <div className="pointer-events-none fixed inset-0 z-popover" aria-hidden={false} role="status" aria-label="Erste Schritte">
      {/* Puls-Ring um ▶ */}
      <div
        className="absolute animate-ping rounded-lg border-2 border-accent opacity-60"
        style={{ left: rect.x - 5, top: rect.y - 5, width: rect.w + 10, height: rect.h + 10 }}
      />
      <div
        className="absolute rounded-lg border-2 border-accent"
        style={{ left: rect.x - 5, top: rect.y - 5, width: rect.w + 10, height: rect.h + 10 }}
      />
      {/* Hinweis-Chip (einziges klickbares Element: ×) */}
      <div
        className="absolute flex max-w-[240px] items-start gap-2 rounded-lg border border-hairline bg-surface p-2.5 text-xs shadow-lg"
        style={{
          left: Math.min(Math.max(rect.x - 60, 8), window.innerWidth - 248),
          top: below ? rect.y + rect.h + 10 : Math.max(rect.y - 96, 8),
        }}
      >
        <span className="flex-1 leading-snug">
          <strong>Start</strong> erweckt die Schaltung zum Leben — probier es mit der Beispiel-Galerie unter „Vorlagen“.
        </span>
        <button
          className="pointer-events-auto grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, "1");
            } catch {}
            setDone(true);
          }}
          aria-label="Hinweis schließen"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
