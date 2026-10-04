/**
 * WDA-5: Der Desktop-Sync läuft absichtlich über zwei Transporte
 * (BroadcastChannel + Electron-IPC) — ohne Dedupe käme jede Nachricht doppelt
 * an (doppelte Voll-Snapshots alle 45 ms im laufenden Betrieb).
 */

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
