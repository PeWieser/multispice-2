"use client";

import { Minus, Plus } from "lucide-react";
import { useEditor } from "@/state/editor";

export default function ZoomButtons({ onFit }: { onFit: () => void }) {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <div className="flex flex-col items-center gap-1.5 select-none" role="group" aria-label="Zoom-Steuerung">
      <div
        className="flex flex-col overflow-hidden rounded-lg shadow-sm backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          border: "1px solid var(--hairline-strong)",
        }}
      >
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center transition-colors hover:bg-surface-2 active:bg-surface-3 text-ink"
          onClick={() => setView({ zoom: Math.min(6, view.zoom * 1.25) })}
          title="Vergrößern (+)"
          aria-label="Vergrößern"
        >
          <Plus size={15} strokeWidth={2} />
        </button>
        <div className="h-px w-full bg-hairline" />
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center transition-colors hover:bg-surface-2 active:bg-surface-3 text-ink"
          onClick={() => setView({ zoom: Math.max(0.12, view.zoom / 1.25) })}
          title="Verkleinern (−)"
          aria-label="Verkleinern"
        >
          <Minus size={15} strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        className="w-8 h-7 rounded-lg shadow-sm backdrop-blur-md flex items-center justify-center font-mono text-2xs font-semibold tracking-wider transition-colors hover:bg-surface-2 active:bg-surface-3"
        style={{
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          border: "1px solid var(--hairline-strong)",
          color: "var(--ink-2)",
        }}
        onClick={onFit}
        title="Schaltplan einpassen (F)"
        aria-label="Einpassen"
      >
        FIT
      </button>
    </div>
  );
}
