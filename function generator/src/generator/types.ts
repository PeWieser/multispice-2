/**
 * Typen des Funktionsgenerators.
 * Diese Datei (und alles in src/generator/) ist frei von React/DOM und kann 1:1 portiert werden.
 */

export type WaveId = 'sine' | 'square' | 'ramp' | 'pulse' | 'noise' | 'arb';
export type ModMode = 'off' | 'AM' | 'FM' | 'PM' | 'FSK' | 'sweep' | 'burst';
export type ModShape = 'sine' | 'square' | 'ramp';
export type Load = 'highz' | '50';
export type Kind = 'freq' | 'time' | 'vpp' | 'volt' | 'phase' | 'pct' | 'count';

export type FieldId =
  | 'freq' | 'period' | 'amp' | 'high' | 'offset' | 'low'
  | 'phase' | 'duty' | 'symmetry' | 'width' | 'delay'
  | 'modFreq' | 'depth' | 'devFreq' | 'devPhase' | 'hopFreq' | 'rate'
  | 'sweepStart' | 'sweepStop' | 'sweepTime'
  | 'burstCycles' | 'burstPeriod';

export interface Channel {
  output: boolean;
  wave: WaveId;
  /** Hz */
  freq: number;
  /** Vpp (an der eingestellten Last) */
  amp: number;
  /** V */
  offset: number;
  /** Grad */
  phase: number;
  /** % (Rechteck) */
  duty: number;
  /** % (Dreieck/Rampe) */
  symmetry: number;
  /** s (Puls) */
  width: number;
  /** s (Puls) */
  delay: number;
  /** Index in ARB_WAVES */
  arb: number;
  freqView: 'freq' | 'period';
  ampView: 'amp' | 'high';
  offView: 'offset' | 'low';
  load: Load;
  mode: ModMode;
  mod: {
    shape: ModShape;
    freq: number;
    /** % */
    depth: number;
    /** Hz */
    devFreq: number;
    /** Grad */
    devPhase: number;
    hopFreq: number;
    rate: number;
  };
  sweep: { start: number; stop: number; time: number; type: 'lin' | 'log' };
  burst: { cycles: number; period: number };
}

export type PageId = 'main' | 'mod' | 'arb' | 'utility' | 'save';

export interface UiState {
  page: PageId;
  menuPage: number;
  focus: FieldId;
  /** Dekade (Zehnerpotenz in Basiseinheit), auf die der Cursor zeigt */
  cursorExp: number;
  edit: null | { text: string };
  both: boolean;
  help: boolean;
  helpText: string;
  msg: string;
  msgId: number;
}

export interface Snapshot {
  ch: [Channel, Channel];
  active: 0 | 1;
}

export interface SysState {
  power: boolean;
  beep: boolean;
  sync: boolean;
  brightness: number;
  audio: boolean;
  coupleFreq: boolean;
  coupleAmp: boolean;
  slot: number;
  mem: (Snapshot | null)[];
}

export interface GenState {
  active: 0 | 1;
  ch: [Channel, Channel];
  ui: UiState;
  sys: SysState;
}

export type Action =
  | { type: 'power' }
  | { type: 'wave'; wave: WaveId }
  | { type: 'fkey'; n: number }
  | { type: 'digit'; d: string }
  | { type: 'sign' }
  | { type: 'knob'; steps: number }
  | { type: 'knobPress' }
  | { type: 'arrow'; dir: 'left' | 'right' }
  | { type: 'chSel' }
  | { type: 'output'; ch: 0 | 1 }
  | { type: 'both' }
  | { type: 'mod' }
  | { type: 'save' }
  | { type: 'utility' }
  | { type: 'help' }
  /** Programmatischer Zugriff (Host-Anwendung) */
  | { type: 'patch'; ch: 0 | 1; patch: Partial<Channel> };

export interface MenuItem {
  lines: string[];
  /** Index der hervorgehobenen Zeile (z.B. aktive Variante bei "Freq/Period") */
  hi?: number;
  selected?: boolean;
  run?: (s: GenState) => void;
}
