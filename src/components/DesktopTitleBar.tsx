"use client";

import React, { useEffect, useState } from "react";
import { Cpu, Minus, Square, Copy, X, Activity } from "lucide-react";
import { engine, useEditor } from "@/state/editor";
import { RingBuffer } from "@/lib/sim/realtime";
import { formatValue } from "@/lib/library/catalog";

export interface DesktopChildWindowSpec {
  id: string;
  role: "instrument" | "library";
  kind?: string;
  title: string;
  width: number;
  height: number;
}

export interface MultispiceDesktopBridge {
  isDesktop: boolean;
  platform?: string;
  windowControl: (action: "minimize" | "maximize" | "close") => void;
  openChildWindow: (spec: DesktopChildWindowSpec) => void;
  closeChildWindow: (id: string) => void;
  sendSync: (payload: unknown) => void;
  onSync: (cb: (payload: unknown) => void) => () => void;
  onChildClosed: (cb: (id: string) => void) => () => void;
}

declare global {
  interface Window {
    multispiceDesktop?: MultispiceDesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.multispiceDesktop?.isDesktop);
}

/**
 * Maßgeschneiderte Fensterleiste im Stil von iTunes für Windows:
 * Rahmenloses OS-Fenster ohne Standard-Windows-Titelleiste, gebürstete dunkle
 * Metall-Optik, integriertes LCD-Status-Display in der Mitte (im Hauptfenster)
 * und eigene Fenster-Steuerknöpfe (Minimieren, Maximieren, Schließen).
 */
export default function DesktopTitleBar({
  title,
  subtitle,
  compact = false,
  onCloseOverride,
}: {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onCloseOverride?: () => void;
}) {
  const docName = useEditor((s) => s.doc.name);
  const instCount = useEditor((s) => s.doc.instances.length);
  const netCount = useEditor((s) => s.netResult.nets.length);
  const simRunning = useEditor((s) => s.sim.running);
  const simTick = useEditor((s) => s.sim.tick);
  void simTick;
  const simTime = engine.lastState.time;
  const [maximized, setMaximized] = useState(false);

  const handleControl = (action: "minimize" | "maximize" | "close") => {
    if (action === "close" && onCloseOverride) {
      onCloseOverride();
      return;
    }
    if (action === "maximize") {
      setMaximized((v) => !v);
    }
    window.multispiceDesktop?.windowControl(action);
  };

  return (
    <div
      className="flex h-8 shrink-0 select-none items-center justify-between px-2.5 text-[11.5px]"
      style={{
        background: "linear-gradient(180deg, #2c3340 0%, #1c212b 52%, #141820 100%)",
        borderBottom: "1px solid #0b0e14",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14)",
        color: "#e2e8f0",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Links: App-Emblem + Fenstertitel */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded"
          style={{
            background: "linear-gradient(180deg, #f59e0b 0%, #b45309 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.5)",
            color: "#111827",
          }}
        >
          <Cpu size={12} />
        </span>
        <span className="truncate font-semibold tracking-tight text-[#f1f5f9]">
          {title ?? "MultiSpice Desktop"}
        </span>
        {subtitle && (
          <span className="truncate text-[10.5px] text-[#94a3b8]">· {subtitle}</span>
        )}
      </div>

      {/* Mitte: iTunes-for-Windows-inspiriertes LCD-Statusfenster (nur im Hauptfenster) */}
      {!compact && (
        <div
          className="hidden md:flex items-center gap-2.5 rounded-md px-3 py-0.5 text-[10.5px] mono"
          style={{
            background: "linear-gradient(180deg, #0f141c 0%, #171f2c 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.65)",
            color: "#cbd5e1",
          }}
        >
          <span className="font-medium text-[#f8fafc]">{docName || "Schaltplan"}</span>
          <span className="text-[#475569]">|</span>
          <span className="text-[#94a3b8]">{instCount} Bauteile · {netCount} Netze</span>
          <span className="text-[#475569]">|</span>
          <span className="flex items-center gap-1" style={{ color: simRunning ? "#4ade80" : "#94a3b8" }}>
            <Activity size={11} />
            {simRunning ? `LAUF · ${formatValue(simTime, "s")}` : "BEREIT"}
          </span>
        </div>
      )}

      {/* Rechts: Maßgeschneiderte iTunes-for-Windows-Fensterknöpfe */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => handleControl("minimize")}
          title="Minimieren"
          aria-label="Fenster minimieren"
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-white/10 active:bg-white/15"
          style={{
            border: "1px solid rgba(255,255,255,0.09)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.01) 100%)",
          }}
        >
          <Minus size={11} />
        </button>
        <button
          type="button"
          onClick={() => handleControl("maximize")}
          title={maximized ? "Wiederherstellen" : "Maximieren"}
          aria-label={maximized ? "Fenster wiederherstellen" : "Fenster maximieren"}
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-white/10 active:bg-white/15"
          style={{
            border: "1px solid rgba(255,255,255,0.09)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.01) 100%)",
          }}
        >
          {maximized ? <Copy size={10} /> : <Square size={10} />}
        </button>
        <button
          type="button"
          onClick={() => handleControl("close")}
          title="Schließen"
          aria-label="Fenster schließen"
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-[#dc2626] hover:text-white active:bg-[#b91c1c]"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, rgba(239,68,68,0.22) 0%, rgba(185,28,28,0.18) 100%)",
          }}
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

/**
 * Synchronisiert im Desktop-Modus das Hauptfenster mit allen abgekoppelten
 * Messgeräte- und Bibliotheks-OS-Fenstern (über BroadcastChannel + Electron IPC).
 */
export function useDesktopMultiWindowSync(role: "main" | "instrument" | "library", winId?: string) {
  const instruments = useEditor((s) => s.instruments);
  const libraryOpen = useEditor((s) => s.libraryOpen);

  // Hauptfenster: Öffnet/schließt native OS-Kindfenster für Messgeräte & Bibliothek
  useEffect(() => {
    if (role !== "main" || !isDesktopApp()) return;
    const bridge = window.multispiceDesktop;
    if (!bridge) return;

    for (const w of instruments) {
      bridge.openChildWindow({
        id: w.id,
        role: "instrument",
        kind: w.kind,
        title: w.title,
        width: Math.max(360, Math.round(w.w)),
        height: Math.max(280, Math.round(w.h + 32)),
      });
    }
  }, [role, instruments]);

  useEffect(() => {
    if (role !== "main" || !isDesktopApp()) return;
    const bridge = window.multispiceDesktop;
    if (!bridge) return;
    if (libraryOpen) {
      bridge.openChildWindow({
        id: "library",
        role: "library",
        title: "Bauteile-Bibliothek",
        width: 780,
        height: 600,
      });
    } else {
      bridge.closeChildWindow("library");
    }
  }, [role, libraryOpen]);

  // bidirektionale State-/Engine-Synchronisation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("multispice-desktop-sync") : null;
    const bridge = window.multispiceDesktop;

    const sendMsg = (msg: unknown) => {
      try {
        bc?.postMessage(msg);
      } catch {}
      bridge?.sendSync(msg);
    };

    if (role === "main") {
      const broadcastState = () => {
        const st = useEditor.getState();
        const buffersSnapshot: Record<string, { t: number[]; v: number[] }> = {};
        for (const [netName, rb] of engine.buffers.entries()) {
          buffersSnapshot[netName] = rb.window(512);
        }
        sendMsg({
          type: "state-snapshot",
          doc: st.doc,
          sim: st.sim,
          netResult: st.netResult,
          instruments: st.instruments,
          selection: st.selection,
          theme: st.theme,
          engineState: {
            time: engine.lastState.time,
            nets: engine.lastState.nets,
            currents: engine.lastState.currents,
            power: engine.lastState.power,
            ok: engine.lastState.ok,
            stepsPerSecond: engine.lastState.stepsPerSecond,
            realtimeFactor: engine.lastState.realtimeFactor,
          },
          buffers: buffersSnapshot,
        });
      };

      const unsubStore = useEditor.subscribe(() => {
        broadcastState();
      });
      const timer = setInterval(() => {
        if (useEditor.getState().sim.running) broadcastState();
      }, 45);

      const handleIncoming = (raw: unknown) => {
        const msg = raw as Record<string, unknown> | null;
        if (!msg || typeof msg.type !== "string") return;
        const st = useEditor.getState();
        if (msg.type === "request-initial") {
          broadcastState();
        } else if (msg.type === "pick-part" && typeof msg.partId === "string") {
          st.setPlacing(msg.partId);
          useEditor.setState({ libraryOpen: false });
        } else if (msg.type === "update-instrument" && typeof msg.id === "string" && msg.patch) {
          st.updateInstrument(msg.id, msg.patch as Record<string, unknown>);
        } else if (msg.type === "child-closed" && typeof msg.id === "string") {
          if (msg.id === "library") {
            useEditor.setState({ libraryOpen: false });
          } else {
            st.closeInstrument(msg.id);
          }
        }
      };

      const onBc = (ev: MessageEvent) => handleIncoming(ev.data);
      bc?.addEventListener("message", onBc);
      const offIpc = bridge?.onSync(handleIncoming);
      const offClosed = bridge?.onChildClosed((closedId) => {
        handleIncoming({ type: "child-closed", id: closedId });
      });

      return () => {
        unsubStore();
        clearInterval(timer);
        bc?.removeEventListener("message", onBc);
        bc?.close();
        offIpc?.();
        offClosed?.();
      };
    } else {
      // Kindfenster (Instrument oder Bibliothek): Empfängt Snapshots vom Hauptfenster
      const handleIncoming = (raw: unknown) => {
        const msg = raw as Record<string, unknown> | null;
        if (!msg || msg.type !== "state-snapshot") return;
        if (msg.engineState) {
          const es = msg.engineState as typeof engine.lastState;
          engine.lastState = {
            ...engine.lastState,
            time: es.time ?? 0,
            nets: es.nets ?? {},
            currents: es.currents ?? {},
            power: es.power ?? {},
            ok: es.ok ?? true,
            stepsPerSecond: es.stepsPerSecond ?? 0,
            realtimeFactor: es.realtimeFactor ?? 1,
          };
        }
        if (msg.buffers && typeof msg.buffers === "object") {
          const incomingBuffers = msg.buffers as Record<string, { t: number[]; v: number[] }>;
          for (const [netName, winData] of Object.entries(incomingBuffers)) {
            let rb = engine.buffers.get(netName);
            if (!rb) {
              rb = new RingBuffer(2048);
              engine.buffers.set(netName, rb);
            } else {
              rb.clear();
            }
            const len = Math.min(winData.t?.length ?? 0, winData.v?.length ?? 0);
            for (let i = 0; i < len; i++) {
              rb.push(winData.t[i], winData.v[i]);
            }
          }
        }
        useEditor.setState({
          doc: (msg.doc as ReturnType<typeof useEditor.getState>["doc"]) ?? useEditor.getState().doc,
          sim: (msg.sim as ReturnType<typeof useEditor.getState>["sim"]) ?? useEditor.getState().sim,
          netResult:
            (msg.netResult as ReturnType<typeof useEditor.getState>["netResult"]) ??
            useEditor.getState().netResult,
          instruments:
            (msg.instruments as ReturnType<typeof useEditor.getState>["instruments"]) ??
            useEditor.getState().instruments,
          selection:
            (msg.selection as ReturnType<typeof useEditor.getState>["selection"]) ??
            useEditor.getState().selection,
          theme: (msg.theme as ReturnType<typeof useEditor.getState>["theme"]) ?? useEditor.getState().theme,
        });
      };

      const onBc = (ev: MessageEvent) => handleIncoming(ev.data);
      bc?.addEventListener("message", onBc);
      const offIpc = bridge?.onSync(handleIncoming);
      sendMsg({ type: "request-initial", winId });

      return () => {
        bc?.removeEventListener("message", onBc);
        bc?.close();
        offIpc?.();
      };
    }
  }, [role, winId]);
}
