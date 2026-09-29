import type { Action, GenState, Snapshot } from './types';
import { initialState } from './state';
import { reduce } from './reducer';
import { outputVoltage, syncVoltage } from './waveforms';

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const MEM_KEY = 'simtech-fg2500.memory.v1';

/**
 * GeneratorCore – Framework-unabhängiger Kern (kein React, kein DOM).
 * - dispatch(action)          : entspricht einem Tastendruck / Drehen am Knopf
 * - getState()/subscribe()    : Zustand lesen bzw. beobachten (auch für useSyncExternalStore)
 * - voltage(ch, t, load)      : Momentanspannung am BNC-Ausgang (für Simulatoren)
 * - block(ch, t0, dt, n, load): Block von Abtastwerten
 */
export class GeneratorCore {
  private state: GenState;
  private listeners = new Set<() => void>();
  private storage?: StorageLike;

  constructor(storage?: StorageLike) {
    this.storage = storage;
    let mem: (Snapshot | null)[] | undefined;
    try {
      const raw = storage?.getItem(MEM_KEY);
      if (raw) mem = JSON.parse(raw);
    } catch { /* ignorieren */ }
    this.state = initialState(mem);
  }

  getState = (): GenState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  dispatch = (a: Action): void => {
    const prev = this.state;
    const next = reduce(prev, a);
    if (next === prev) return;
    this.state = next;
    if (next.sys.mem !== prev.sys.mem && JSON.stringify(next.sys.mem) !== JSON.stringify(prev.sys.mem)) {
      try { this.storage?.setItem(MEM_KEY, JSON.stringify(next.sys.mem)); } catch { /* ignorieren */ }
    }
    this.listeners.forEach((l) => l());
  };

  /** Spannung an OUT1/OUT2 in Volt zum Zeitpunkt t (s). loadOhms = Infinity → Leerlauf */
  voltage = (ch: 0 | 1, t: number, loadOhms = Infinity): number => outputVoltage(this.state, ch, t, loadOhms);

  /** Sync-Ausgang (0/5 V) */
  sync = (ch: 0 | 1, t: number): number => syncVoltage(this.state, ch, t);

  block(ch: 0 | 1, t0: number, dt: number, n: number, loadOhms = Infinity): Float64Array {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.voltage(ch, t0 + i * dt, loadOhms);
    return out;
  }
}

/**
 * Optionale Browser-Bridge: window.functionGenerator + postMessage-Protokoll.
 * Nützlich, wenn die Oberfläche in einer WebView/iframe der Ziel-Anwendung läuft.
 *
 * Anfrage  (Host → Generator):  { fg: 'voltage', id, ch: 0|1, t: number, load?: number }
 *                               { fg: 'block', id, ch, t0, dt, n, load? }
 *                               { fg: 'state', id }
 *                               { fg: 'dispatch', action }
 * Antwort  (Generator → Host):  { fg: 'reply', id, value }
 * Ereignis (Generator → Host):  { fg: 'change', state }
 */
export function installBridge(core: GeneratorCore, win: Window = window): () => void {
  const api = {
    voltage: core.voltage,
    block: core.block.bind(core),
    sync: core.sync,
    dispatch: core.dispatch,
    getState: core.getState,
    subscribe: core.subscribe,
  };
  (win as unknown as { functionGenerator: typeof api }).functionGenerator = api;

  const onMessage = (e: MessageEvent) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || !('fg' in m)) return;
    const reply = (value: unknown) => (e.source as Window | null)?.postMessage({ fg: 'reply', id: m.id, value }, { targetOrigin: '*' });
    switch (m.fg) {
      case 'voltage': return reply(core.voltage(m.ch, m.t, m.load ?? Infinity));
      case 'block': return reply(Array.from(core.block(m.ch, m.t0, m.dt, m.n, m.load ?? Infinity)));
      case 'state': return reply(core.getState());
      case 'dispatch': return core.dispatch(m.action);
    }
  };
  win.addEventListener('message', onMessage);
  const unsub = core.subscribe(() => {
    if (win.parent && win.parent !== win) win.parent.postMessage({ fg: 'change', state: core.getState() }, '*');
  });
  return () => {
    win.removeEventListener('message', onMessage);
    unsub();
  };
}

export * from './types';
export { WAVE_NAMES, ARB_WAVES, MAXF, previewPoints, outputVoltage, syncVoltage } from './waveforms';
export { FIELDS } from './fields';
export { formatValue, formatString } from './format';
export { currentMenu, buildMenu, mainFields, modFields } from './menu';
export { reduce } from './reducer';
export { initialState } from './state';
export { spiceSource } from './spice';
