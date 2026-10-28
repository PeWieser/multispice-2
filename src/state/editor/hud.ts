"use client";

import { create } from "zustand";

/**
 * HUD-State (Cursor, laufendes Netzzeichnen …) als eigener Store: wird bei
 * jeder Mausbewegung geschrieben, aber nur die Statusleiste / Werkzeugleiste
 * hört zu — der Editor-Store rendert dadurch nicht neu.
 */
export const useHud = create<{
  cursor: { x: number; y: number };
  viewport: { w: number; h: number };
  dragPart: string | null;
  /** W73: true, solange auf dem Canvas aktiv ein Netz gezeichnet wird (`sr.netDraft`). */
  netDrawing: boolean;
  /** W73: Zähler zum Abbrechen eines laufenden Netzes aus der Werkzeugleiste. */
  netCancelSeq: number;
  cancelNetDrawing: () => void;
}>((set) => ({
  cursor: { x: 0, y: 0 },
  viewport: { w: 0, h: 0 },
  dragPart: null,
  netDrawing: false,
  netCancelSeq: 0,
  cancelNetDrawing: () => set((s) => ({ netDrawing: false, netCancelSeq: s.netCancelSeq + 1 })),
}));

/** Utility used by canvas hit tests. */
