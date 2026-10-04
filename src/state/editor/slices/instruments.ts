



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { WINDOW_SPECS, recallPos, CHROME_W, CHROME_H, fgDefaultSize, DEVICE_MIN, PANEL_MIN, scopeDefaultSize } from "../windows";
import type { InstrumentKind } from "../types";export function createInstrumentsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "openInstrument" | "toggleInspector" | "closeInstrument" | "updateInstrument" | "focusInstrument" | "toggleProbe"> {
  return {
      openInstrument: (kind, opts) => {
        // W29: Instrument-Fenster sind an ein Schaltsymbol auf dem Plan gebunden
        // (Doppelklick). Pro Instanz genau ein Fenster; entkoppelte Oszi-/FG-Fenster
        // gibt es nicht mehr. W18: gleiche Mechanik für den FG-2500.
        if ((kind === "scope" || kind === "funcgen") && opts?.instanceId) {
          const bound = get().instruments.find((i) => i.kind === kind && i.instanceId === opts.instanceId);
          if (bound) {
            get().focusInstrument(bound.id);
            // Runde 17 (W32a): Rückholhilfe – liegt das Fenster (fast) außerhalb
            // des Screens, zieht ein Doppelklick aufs Symbol es wieder hinein.
            set((s) => ({
              instruments: s.instruments.map((w) =>
                w.id === bound.id
                  ? { ...w, minimized: false, title: opts.title ?? w.title, ...recallPos(w) }
                  : w,
              ),
            }));
            return;
          }
          const count = get().instruments.length;
          // W31a: Fenster klebt am Gerät (nie größer als der Viewport);
          // W18: FG-2500 hat eine feste Bühne (1160×545) + Chrome-Rest.
          const { w: defW, h: defH } =
            kind === "funcgen" ? fgDefaultSize() : scopeDefaultSize();
          set((s) => ({
            instruments: [
              ...s.instruments,
              {
                id: "w_" + opts.instanceId,
                kind,
                title: opts.title ?? (kind === "funcgen" ? "Funktionsgenerator" : "Oszilloskop"),
                x: 180 + count * 34,
                y: 110 + count * 28,
                w: defW,
                h: defH,
                z: 10 + count,
                minimized: false,
                // Runde 19/20 (W35/W38): Jedes Öffnen klebt wieder exakt am Gerät
                // (deviceFit: 0 = noch anpassen; der Adapter setzt danach 1).
                // W39: Skalieren bis 640×480 herunter (Gerät wird maßstäblich
                // kleiner, nie kleiner als bedienbar); Obergrenze bleibt das Bild.
                config: {
                  ...(s.configArchive["w_" + opts.instanceId] ?? {}),
                  deviceFit: 0,
                  minW: DEVICE_MIN.w,
                  minH: DEVICE_MIN.h,
                },
                instanceId: opts.instanceId,
              },
            ],
          }));
          return;
        }
        const titles: Record<InstrumentKind, string> = {
          dmm: "Digitalmultimeter",
          scope: "4-Kanal Oszilloskop",
          funcgen: "Funktionsgenerator",
          bode: "Bode-Plotter",
          logic: "Logikanalysator",
          logicconv: "Logic Converter",
          watt: "Wattmeter",
          iv: "IV-Analyzer",
          pattern: "Mustergenerator",
          spectrum: "Spektrumanalysator",
          counter: "Frequenzzähler",
          distortion: "Distortion Analyzer",
          network: "Network Analyzer",
          inspector: "Inspector",
        };
        const existing = get().instruments.find((i) => i.kind === kind);
        if (existing) {
          get().focusInstrument(existing.id);
          // Runde 17 (W32a): Rückholhilfe auch für die übrigen Geräte-Fenster.
          set((s) => ({
            instruments: s.instruments.map((i) =>
              i.id === existing.id ? { ...i, minimized: false, ...recallPos(i) } : i,
            ),
          }));
          return;
        }
        // Runde 20 (W40): Alle Fenster laufen durch denselben Manager. Startgröße
        // kommt aus WINDOW_SPECS (Entwurfsbreite, Untergrenze der Höhe); der
        // Fenster-Fit misst direkt nach dem ersten Bild den echten Inhalt und setzt
        // die Größe exakt (config.deviceFit = 0 erzwingt die Messung).
        const spec = WINDOW_SPECS[kind];
        const count = get().instruments.length;
        const id = "w_" + Math.random().toString(36).slice(2, 8);
        const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
        const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
        set((s) => ({
          instruments: [
            ...s.instruments,
            {
              id,
              kind,
              title: titles[kind],
              x: 180 + count * 34,
              y: 110 + count * 28,
              w: Math.max(320, Math.min(spec.w + CHROME_W, vw - 8)),
              h: Math.max(220, Math.min(spec.h + CHROME_H, vh - 8)),
              z: 10 + count,
              minimized: false,
              // Panels: Mindestmaß 320×220 (Layout bricht sonst um); die
              // Inhaltsmessung setzt die Startgröße darüber.
              config: { ...(s.configArchive[id] ?? {}), deviceFit: 0, minW: PANEL_MIN.w, minH: PANEL_MIN.h },
            },
          ],
        }));
      },

      toggleInspector: () => {
        const ex = get().instruments.find((w) => w.kind === "inspector");
        if (ex) get().closeInstrument(ex.id);
        else get().openInstrument("inspector");
      },

      closeInstrument: (id) =>
        set((s) => {
          const w = s.instruments.find((i) => i.id === id);
          return {
            instruments: s.instruments.filter((i) => i.id !== id),
            // Runde 19: eine im Gerät aufgenommene Messleitung fällt mit dem Fenster weg.
            leadArmed: w?.instanceId && s.leadArmed?.instanceId === w.instanceId ? null : s.leadArmed,
            // Runde 17: Konfiguration merken – Wiederöffnen bringt die Einstellungen
            // des Geräts zurück (Sicherheitsnetz, „kein Fenster geht verloren").
            configArchive: w ? { ...s.configArchive, [id]: w.config } : s.configArchive,
          };
        }),
      updateInstrument: (id, patch) =>
        set((s) => ({ instruments: s.instruments.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      focusInstrument: (id) =>
        set((s) => {
          const maxZ = Math.max(10, ...s.instruments.map((i) => i.z));
          return { instruments: s.instruments.map((i) => (i.id === id ? { ...i, z: maxZ + 1 } : i)) };
        }),

      toggleProbe: (net) =>
        set((s) => ({ probes: s.probes.includes(net) ? s.probes.filter((n) => n !== net) : [...s.probes, net].slice(-8) })),
  };
}
