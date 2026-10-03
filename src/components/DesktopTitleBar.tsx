"use client";

import React, { useEffect, useRef, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { engine, useEditor } from "@/state/editor";
import { RingBuffer } from "@/lib/sim/realtime";

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
  notifyChildReady?: () => void;
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
 * W124: Maximal minimalistische Fensterleiste (wie bei macOS):
 * Kein Icon, kein Text, kein Farbverlauf – verschmilzt nahtlos mit var(--panel-solid)
 * und besitzt nur eine dezente 1px-Trennlinie sowie rechts die Fenstersteuerung.
 */
export default function DesktopTitleBar({
  onCloseOverride,
}: {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onCloseOverride?: () => void;
}) {
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
      className="flex h-7 shrink-0 select-none items-center justify-end px-2"
      style={{
        background: "var(--panel-solid)",
        borderBottom: "1px solid var(--border)",
        color: "var(--text-dim)",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => handleControl("minimize")}
          title="Minimieren"
          aria-label="Fenster minimieren"
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
        >
          <Minus size={11} />
        </button>
        <button
          type="button"
          onClick={() => handleControl("maximize")}
          title={maximized ? "Wiederherstellen" : "Maximieren"}
          aria-label={maximized ? "Fenster wiederherstellen" : "Fenster maximieren"}
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
        >
          {maximized ? <Copy size={10} /> : <Square size={10} />}
        </button>
        <button
          type="button"
          onClick={() => handleControl("close")}
          title="Schließen"
          aria-label="Fenster schließen"
          className="grid h-5 w-6 place-items-center rounded transition-colors hover:bg-[#dc2626] hover:text-white"
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
  const wasLibraryOpenRef = useRef(false);
  const prevInstIdsRef = useRef<string[]>([]);

  // Hauptfenster: Öffnet/schließt native OS-Kindfenster für Messgeräte
  useEffect(() => {
    if (typeof window === "undefined" || !isDesktopApp()) return;
    if (window.location.search.includes("desktopWindow=") || role !== "main") return;
    const bridge = window.multispiceDesktop;
    if (!bridge) return;

    const currentIds = instruments.map((w) => w.id);
    for (const w of instruments) {
      bridge.openChildWindow({
        id: w.id,
        role: "instrument",
        kind: w.kind,
        title: w.title,
        width: Math.max(360, Math.round(w.w)),
        height: Math.max(280, Math.round(w.h + 28)),
      });
    }
    for (const oldId of prevInstIdsRef.current) {
      if (!currentIds.includes(oldId)) {
        bridge.closeChildWindow(oldId);
      }
    }
    prevInstIdsRef.current = currentIds;
  }, [role, instruments]);

  // Hauptfenster: Öffnet/schließt das native OS-Kindfenster für die Bibliothek
  // W126: Niemals beim ersten Mount closeChildWindow("library") feuern!
  useEffect(() => {
    if (typeof window === "undefined" || !isDesktopApp()) return;
    if (window.location.search.includes("desktopWindow=") || role !== "main") return;
    const bridge = window.multispiceDesktop;
    if (!bridge) return;

    if (libraryOpen) {
      wasLibraryOpenRef.current = true;
      bridge.openChildWindow({
        id: "library",
        role: "library",
        title: "Bauteile-Bibliothek",
        width: 780,
        height: 600,
      });
    } else if (wasLibraryOpenRef.current) {
      wasLibraryOpenRef.current = false;
      bridge.closeChildWindow("library");
    }
  }, [role, libraryOpen]);

  // bidirektionale State-/Engine-Synchronisation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const actualIsChild = window.location.search.includes("desktopWindow=");
    const effectiveRole = actualIsChild ? (role === "main" ? "library" : role) : role;

    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("multispice-desktop-sync") : null;
    const bridge = window.multispiceDesktop;

    const sendMsg = (msg: unknown) => {
      try {
        bc?.postMessage(msg);
      } catch {}
      bridge?.sendSync(msg);
    };

    if (effectiveRole === "main") {
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
          wasLibraryOpenRef.current = false;
          st.setPlacing(msg.partId);
          useEditor.setState({ libraryOpen: false });
        } else if (msg.type === "update-instrument" && typeof msg.id === "string" && msg.patch) {
          st.updateInstrument(msg.id, msg.patch as Record<string, unknown>);
        } else if (msg.type === "child-closed" && typeof msg.id === "string") {
          if (msg.id === "library") {
            wasLibraryOpenRef.current = false;
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
      // Kindfenster (Instrument oder Bibliothek): Meldet sich bereit & empfängt Snapshots
      bridge?.notifyChildReady?.();

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
