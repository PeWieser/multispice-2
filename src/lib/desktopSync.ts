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

import { useEditor, type ArmedLead } from "@/state/editor";

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
