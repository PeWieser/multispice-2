/**
 * WDA-5: Der Desktop-Sync läuft absichtlich über zwei Transporte
 * (BroadcastChannel + Electron-IPC) — ohne Dedupe käme jede Nachricht doppelt
 * an (doppelte Voll-Snapshots alle 45 ms im laufenden Betrieb).
 *
 * Okt-26 (Desktop-Messgeräte): Kindfenster (Oszi/FG/Quellen) halten nur eine
 * Snapshot-Kopie — Doc-Schreibzugriffe (Bauteil-Parameter) und das Scharf-
 * schalten von Messleitungen müssen ans Hauptfenster gespiegelt werden, sonst
 * haben die Geräte keinen Ein-/Ausgang zur Schaltung.
 */

import { useEditor, type ArmedLead, type EditorState } from "@/state/editor";
import { RingBuffer, type LiveState } from "@/lib/sim/realtime";

/** Läuft dieser Renderer als abgekoppeltes Desktop-Kindfenster? */
export function isDesktopChild(): boolean {
  return typeof window !== "undefined" && window.location.search.includes("desktopWindow=");
}

/** Nachricht an die anderen Fenster (beide Transporte, ein Nonce-Objekt). */
export function sendDesktopSync(msg: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const envelope = withSyncNonce(msg);
  try {
    const bc = new BroadcastChannel("multispice-desktop-sync");
    bc.postMessage(envelope);
    bc.close();
  } catch {}
  window.multispiceDesktop?.sendSync(envelope);
}

/** Bauteil-Parameter setzen — im Kindfenster zusätzlich ans Hauptfenster. */
export function setDocParamSynced(instanceId: string, key: string, value: number | string | boolean): void {
  useEditor.getState().setParam(instanceId, key, value);
  if (isDesktopChild()) sendDesktopSync({ type: "set-doc-param", instanceId, key, value });
}

/** Messleitung scharf/unscharf — im Kindfenster zusätzlich ans Hauptfenster. */
export function setLeadArmedSynced(lead: ArmedLead | null): void {
  useEditor.getState().setLeadArmed(lead);
  if (!isDesktopChild()) return;
  if (lead) sendDesktopSync({ type: "arm-lead", lead: { ...lead } });
  else sendDesktopSync({ type: "disarm-lead" });
}

export interface MainSyncTarget {
  setLeadArmed: (a: ArmedLead | null) => void;
  setParam: (instanceId: string, key: string, value: number | string | boolean) => void;
}

/**
 * Kind→Haupt-Nachrichten anwenden (reine Funktion → unit-testbar).
 * Gibt true zurück, wenn die Nachricht erkannt und angewendet wurde.
 */
export function applyChildMessageToMain(st: MainSyncTarget, msg: Record<string, unknown>): boolean {
  if (msg.type === "arm-lead" && msg.lead && typeof msg.lead === "object") {
    // Buchsenklick im Geräte-Kindfenster → Hauptfenster-Canvas legt die Messleitung.
    const l = msg.lead as Record<string, unknown>;
    if (typeof l.instanceId === "string" && typeof l.pinIndex === "number") {
      st.setLeadArmed({
        instanceId: l.instanceId,
        pinIndex: l.pinIndex,
        name: typeof l.name === "string" ? l.name : undefined,
        color: typeof l.color === "string" ? l.color : undefined,
      });
      return true;
    }
    return false;
  }
  if (msg.type === "disarm-lead") {
    st.setLeadArmed(null);
    return true;
  }
  if (msg.type === "set-doc-param" && typeof msg.instanceId === "string" && typeof msg.key === "string") {
    // FG-Zustand/Quellen-Parameter aus dem Kindfenster kommen im Haupt-Doc an.
    const v = msg.value;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      st.setParam(msg.instanceId, msg.key, v);
      return true;
    }
  }
  return false;
}

/** Hängt eine einmalige Kennung an — beide Transporte senden dasselbe Objekt. */
export function withSyncNonce(msg: Record<string, unknown>): Record<string, unknown> {
  const tag = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  return { ...msg, __nonce: tag };
}

export interface SyncDedupe {
  /** true = frisch (verarbeiten), false = Duplikat (verwerfen). */
  check: (msg: unknown) => boolean;
}

/** Merkt die letzten `limit` Kennungen (Ring, kein unbegrenztes Wachstum). */
export function createSyncDedupe(limit = 200): SyncDedupe {
  const seen = new Set<string>();
  const order: string[] = [];
  return {
    check(msg: unknown): boolean {
      const n = (msg as Record<string, unknown> | null)?.__nonce;
      // Ohne Nonce (Altbestand/fremde Sender): passieren lassen.
      if (typeof n !== "string" || !n) return true;
      if (seen.has(n)) return false;
      seen.add(n);
      order.push(n);
      while (order.length > limit) {
        const oldest = order.shift();
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    },
  };
}

/** Fenster pro Netz im 45-ms-Takt (heißer Pfad — klein halten). */
export const SYNC_FAST_WINDOW = 512;
/** Langsam-Tier: großes Fenster, nur jede N. Nachricht + initial. */
export const SYNC_SLOW_WINDOW = 4096;
export const SYNC_SLOW_EVERY = 10;

export interface ChildEngineTarget {
  running: boolean;
  lastState: LiveState;
  buffers: Map<string, RingBuffer>;
  slowBuffers: Map<string, RingBuffer>;
}

type SnapshotBuf = { t: number[]; v: number[] };

function fillBuffers(target: Map<string, RingBuffer>, cap: number, incoming: unknown): void {
  if (!incoming || typeof incoming !== "object") return;
  for (const [netName, winData] of Object.entries(incoming as Record<string, SnapshotBuf>)) {
    let rb = target.get(netName);
    if (!rb) {
      rb = new RingBuffer(cap);
      target.set(netName, rb);
    } else {
      rb.clear();
    }
    const len = Math.min(winData.t?.length ?? 0, winData.v?.length ?? 0);
    for (let i = 0; i < len; i++) rb.push(winData.t[i], winData.v[i]);
  }
}

/**
 * Okt-27 (Desktop-Geräte ohne Messdaten): Haupt→Kind-Snapshot anwenden.
 * Spiegelt zusätzlich `engine.running` — der Oszi-Sampler (`if (!running)
 * return 0`) und die Oszi-Clock lesen das Engine-Flag, das im Kindfenster
 * sonst nie true wird (Start/Stopp gibt es nur im Hauptfenster). Füllt auch
 * das Langsam-Tier (langsames Zeitbasis); fehlt dessen Schlüssel in der
 * Nachricht, bleibt der alte Stand — kein Wischen.
 * Reine Funktion bis auf die übergebenen Ziele (engine + store) → testbar.
 */
export function applySnapshotToChild(
  eng: ChildEngineTarget,
  getState: () => EditorState,
  setState: (patch: Partial<EditorState>) => void,
  msg: Record<string, unknown>,
): boolean {
  if (!msg || msg.type !== "state-snapshot") return false;
  const sim = msg.sim as { running?: unknown } | null;
  eng.running = sim?.running === true;
  if (msg.engineState) {
    const es = msg.engineState as Partial<LiveState>;
    eng.lastState = {
      ...eng.lastState,
      time: es.time ?? 0,
      nets: es.nets ?? {},
      currents: es.currents ?? {},
      power: es.power ?? {},
      ok: es.ok ?? true,
      stepsPerSecond: es.stepsPerSecond ?? 0,
      realtimeFactor: es.realtimeFactor ?? 1,
    };
  }
  fillBuffers(eng.buffers, 2048, msg.buffers);
  if ("slowBuffers" in msg) fillBuffers(eng.slowBuffers, 8192, msg.slowBuffers);
  const cur = getState();
  setState({
    doc: (msg.doc as EditorState["doc"]) ?? cur.doc,
    sim: (msg.sim as EditorState["sim"]) ?? cur.sim,
    netResult: (msg.netResult as EditorState["netResult"]) ?? cur.netResult,
    instruments: (msg.instruments as EditorState["instruments"]) ?? cur.instruments,
    selection: (msg.selection as EditorState["selection"]) ?? cur.selection,
    theme: (msg.theme as EditorState["theme"]) ?? cur.theme,
    placingPartId: (msg.placingPartId as EditorState["placingPartId"]) ?? cur.placingPartId,
    // Okt-26: null läuft mit (Entwarnung) — deshalb Schlüsseltest statt ??.
    leadArmed: "leadArmed" in msg ? (msg.leadArmed as EditorState["leadArmed"]) : cur.leadArmed,
  });
  return true;
}
