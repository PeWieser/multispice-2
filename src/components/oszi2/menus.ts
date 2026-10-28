import type { MenuId, Settings, CursorSel } from './types';
import { MEAS_TYPES, clamp, fmt, step125 } from './types';
import { HDIV } from './engine';
import type { MenuItemView } from './render';

export interface MenuItem extends MenuItemView {
  press?: () => void;
  knobId?: string;
}

export interface MenuApi {
  set: (fn: (s: Settings) => Settings) => void;
  msg: (t: string) => void;
  saveRef: (k: number) => void;
  clearRefs: () => void;
  hasRef: (k: number) => boolean;
  screenshot: () => void;
  csv: () => void;
  saveSetup: () => void;
  loadSetup: () => void;
  calib: () => void;
  toggleInfo: () => void;
  defaultSetup: () => void;
  level50: () => void;
  resetStats: () => void;
  clearPersist: () => void;
  searchCount: number;
  /** W30: physischer Tastkopf – Umschalter und Abgleich-Trimmer im CH-Menü. */
  probeAtten: (k: number) => number;
  probeComp: (k: number) => number;
  toggleProbeAtten: (k: number) => void;
}

export const MENU_TITLES: Record<MenuId, string> = {
  ch0: 'Kanal 1', ch1: 'Kanal 2', ch2: 'Kanal 3', ch3: 'Kanal 4',
  trigger: 'Trigger', acquire: 'Erfassung', measure: 'Messung', cursor: 'Cursor', math: 'Math',
  fft: 'FFT', ref: 'Referenz', save: 'Speichern/Abruf', display: 'Anzeige', utility: 'System',
  zoom: 'Zoom', search: 'Suche',
};

const cycle = <T,>(arr: readonly T[], v: T, d = 1): T => arr[(arr.indexOf(v) + d + arr.length) % arr.length];
const srcN = (n: number) => (n === 4 ? 'MATH' : `CH${n + 1}`);
const onOff = (b: boolean) => (b ? 'Ein' : 'Aus');
const PERSIST = [0, 0.5, 2, 5, -1];
const ZOOMS = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
const FFTDB = [1, 2, 5, 10, 20];
const FFTZ = [1, 2, 5, 10, 20];

export function cursorSels(mode: Settings['cursor']['mode']): CursorSel[] {
  return mode === 'both' ? ['ta', 'tb', 'va', 'vb'] : ['a', 'b', 'ab'];
}
const selName = (s: CursorSel) => ({ a: 'a', b: 'b', ab: 'a + b', ta: 'Zeit a', tb: 'Zeit b', va: 'Ampl. a', vb: 'Ampl. b' }[s]);

/** Apply a knob rotation to a knob id. Returns updated settings. */
export function applyKnob(id: string, d: number, s: Settings): Settings {
  const fine = s.fineMode;
  const n = { ...s };
  switch (id) {
    case 'holdoff': {
      const v = s.trig.holdoff * Math.pow(fine ? 1.05 : 1.5, d);
      return { ...n, trig: { ...s.trig, holdoff: clamp(v, 20e-9, 8) } };
    }
    case 'trigLevel': {
      // S5.20: Netz-Trigger liegt fest auf 0 V (Nulldurchgang) — kein toter Knopf.
      if (s.trig.source === 4) return { ...n, trig: { ...s.trig, level: 0 } };
      const vd = s.ch[s.trig.source].vdiv;
      // S5.20: ±8 Divs — weiter draußen triggert real nichts mehr; der Knopf
      // bleibt erreichbar statt ins Unendliche zu laufen.
      const lv = clamp(s.trig.level + d * vd * (fine ? 0.01 : 0.05), -8 * vd, 8 * vd);
      return { ...n, trig: { ...s.trig, level: +lv.toPrecision(4) } };
    }
    case 'avgCount': {
      const e = clamp(Math.round(Math.log2(s.acq.avgCount)) + d, 1, 9);
      return { ...n, acq: { ...s.acq, avgCount: Math.pow(2, e) } };
    }
    case 'hDelay': {
      // S5.20: ±1 Spanne — mehr verlangt Historie, die nie existiert, und
      // ließe die Aufnahme scheinbar einfrieren (Engine sichert ebenfalls).
      const span = HDIV * s.tdiv;
      return { ...n, hDelay: +clamp(s.hDelay - d * s.tdiv * (fine ? 0.02 : 0.2), -span, span).toPrecision(6) };
    }
    case 'measSrc':
      return { ...n, meas: { ...s.meas, selSrc: (s.meas.selSrc + d + 50) % (s.math.on ? 5 : 4) } };
    case 'measType':
      return { ...n, meas: { ...s.meas, selType: (s.meas.selType + d + MEAS_TYPES.length * 10) % MEAS_TYPES.length } };
    case 'mathScale':
      return { ...n, math: { ...s.math, vdiv: step125(s.math.vdiv, -d, 1e-3, 1e4) } };
    case 'mathPos':
      return { ...n, math: { ...s.math, pos: clamp(+(s.math.pos + d * (fine ? 0.02 : 0.1)).toFixed(2), -10, 10) } };
    case 'fftDb':
      return { ...n, fft: { ...s.fft, dbdiv: FFTDB[clamp(FFTDB.indexOf(s.fft.dbdiv) - d, 0, FFTDB.length - 1)] } };
    case 'fftLevel':
      return { ...n, fft: { ...s.fft, level: clamp(s.fft.level + d * (fine ? 1 : 5), -150, 60) } };
    case 'fftZoom':
      return { ...n, fft: { ...s.fft, zoom: FFTZ[clamp(FFTZ.indexOf(s.fft.zoom) + d, 0, FFTZ.length - 1)] } };
    case 'intensity':
      return { ...n, display: { ...s.display, intensity: clamp(s.display.intensity + d * 5, 5, 100) } };
    case 'zoomFactor':
      return { ...n, zoom: { ...s.zoom, factor: ZOOMS[clamp(ZOOMS.indexOf(s.zoom.factor) + d, 0, ZOOMS.length - 1)] } };
    case 'zoomPos': {
      const half = 7.5 - 7.5 / s.zoom.factor;
      return { ...n, zoom: { ...s.zoom, pos: clamp(+(s.zoom.pos + d * (fine ? 0.01 : 0.1) * Math.max(0.2, 5 / s.zoom.factor)).toFixed(3), -half, half) } };
    }
    case 'searchLevel': {
      const vd = s.ch[s.search.src].vdiv;
      return { ...n, search: { ...s.search, level: +(s.search.level + d * vd * (fine ? 0.01 : 0.05)).toPrecision(4) } };
    }
    case 'cursor': {
      const c = { ...s.cursor };
      const st = fine ? 0.02 : 0.1;
      const sel = c.sel;
      const mv = (v: number, lim: number) => clamp(+(v + d * st).toFixed(3), -lim, lim);
      if (c.mode === 'time') {
        if (sel === 'a' || sel === 'ab') c.ta = mv(c.ta, 7.5);
        if (sel === 'b' || sel === 'ab') c.tb = mv(c.tb, 7.5);
      } else if (c.mode === 'amp') {
        if (sel === 'a' || sel === 'ab') c.va = mv(c.va, 4);
        if (sel === 'b' || sel === 'ab') c.vb = mv(c.vb, 4);
      } else if (c.mode === 'both') {
        if (sel === 'ta') c.ta = mv(c.ta, 7.5);
        if (sel === 'tb') c.tb = mv(c.tb, 7.5);
        if (sel === 'va') c.va = mv(c.va, 4);
        if (sel === 'vb') c.vb = mv(c.vb, 4);
      }
      return { ...n, cursor: c };
    }
  }
  const m = id.match(/^ch(\d)pos$/);
  if (m) {
    const k = +m[1];
    const ch = s.ch.map((c, i) => (i === k ? { ...c, pos: clamp(+(c.pos + d * (fine ? 0.02 : 0.1)).toFixed(2), -10, 10) } : c));
    return { ...n, ch };
  }
  return s;
}

export function defaultKnob(s: Settings): string | null {
  if (s.knobTarget) return s.knobTarget;
  if (s.cursor.mode !== 'off') return 'cursor';
  if (s.zoom.on) return 'zoomPos';
  return null;
}

export function buildMenu(s: Settings, api: MenuApi): MenuItem[] {
  const set = api.set;
  const kt = defaultKnob(s);
  const K = (label: string, value: string, knobId: string): MenuItem => ({
    label, value, knobId, knob: kt === knobId, active: kt === knobId,
    press: () => set((x) => ({ ...x, knobTarget: x.knobTarget === knobId ? null : knobId })),
  });
  const menu = s.menu;
  if (!menu) return [];
  const chm = menu.match(/^ch(\d)$/);
  if (chm) {
    const k = +chm[1];
    const c = s.ch[k];
    const upd = (fn: (c: Settings['ch'][number]) => Partial<Settings['ch'][number]>) =>
      set((x) => ({ ...x, ch: x.ch.map((cc, i) => (i === k ? { ...cc, ...fn(cc) } : cc)) }));
    return [
      { label: 'Kopplung', value: c.coupling === 'DC' ? 'DC' : c.coupling === 'AC' ? 'AC' : 'Masse (GND)', press: () => upd((cc) => ({ coupling: cycle(['DC', 'AC', 'GND'] as const, cc.coupling) })) },
      { label: 'Invertieren', value: onOff(c.invert), press: () => upd((cc) => ({ invert: !cc.invert })) },
      { label: 'Bandbreite', value: c.bwLimit ? '20 MHz' : 'Voll (70 MHz)', press: () => upd((cc) => ({ bwLimit: !cc.bwLimit })) },
      {
        label: 'Tastkopf', value: `${c.probe}X  Spannung`,
        press: () => set((x) => {
          const cc = x.ch[k];
          const np: 1 | 10 = cc.probe === 10 ? 1 : 10;
          const f = np / cc.probe;
          const trig = x.trig.source === k ? { ...x.trig, level: x.trig.level * f } : x.trig;
          return { ...x, trig, ch: x.ch.map((c2, i) => (i === k ? { ...c2, probe: np, vdiv: c2.vdiv * f } : c2)) };
        }),
      },
      // W30: Schalter & Trimmer saßen in oszi v2 am Tastkopf neben der
      // Testbench – hier als Menüpunkte (User-Entscheidung).
      { label: 'Schalter (Tastkopf)', value: `${api.probeAtten(k)}X  Dämpfung`, press: () => api.toggleProbeAtten(k) },
      K(
        'Abgleich-Trimmer',
        `${api.probeAtten(k) === 1 ? '— (nur 10X)' : `${api.probeComp(k) > 0 ? '+' : ''}${Math.round(api.probeComp(k) * 100)} %`}`,
        `probeComp${k}`,
      ),
      { label: 'V/div Feineinst.', value: onOff(c.fine), press: () => upd((cc) => ({ fine: !cc.fine })) },
      K('Position', `${c.pos.toFixed(2)} div`, `ch${k}pos`),
    ];
  }
  switch (menu) {
    case 'trigger':
      return [
        { label: 'Quelle', value: s.trig.source === 4 ? 'Netz (50 Hz)' : srcN(s.trig.source), press: () => set((x) => ({ ...x, trig: { ...x.trig, source: (x.trig.source + 1) % 5 } })) },
        { label: 'Flanke', value: s.trig.slope === 'rise' ? '⟋ Steigend' : s.trig.slope === 'fall' ? '⟍ Fallend' : '⟋⟍ Beide', press: () => set((x) => ({ ...x, trig: { ...x.trig, slope: cycle(['rise', 'fall', 'both'] as const, x.trig.slope) } })) },
        { label: 'Modus', value: s.trig.mode === 'auto' ? 'Auto (Roll)' : 'Normal', press: () => set((x) => ({ ...x, trig: { ...x.trig, mode: x.trig.mode === 'auto' ? 'normal' : 'auto' } })) },
        K('Holdoff', fmt(s.trig.holdoff, 's'), 'holdoff'),
        K('Pegel', fmt(s.trig.level, 'V'), 'trigLevel'),
        { label: 'Pegel auf 50%', press: api.level50 },
      ];
    case 'acquire':
      return [
        { label: 'Modus', value: { sample: 'Abtastung', peak: 'Spitzenwert', average: 'Mittelwert', hires: 'Hohe Auflösung' }[s.acq.mode], press: () => set((x) => ({ ...x, acq: { ...x.acq, mode: cycle(['sample', 'peak', 'average', 'hires'] as const, x.acq.mode) } })) },
        K('Mittelwerte', String(s.acq.avgCount), 'avgCount'),
        { label: 'XY-Anzeige', value: s.acq.xy ? 'Ein (CH1/CH2)' : 'Aus (YT)', press: () => set((x) => ({ ...x, acq: { ...x.acq, xy: !x.acq.xy }, ch: x.acq.xy ? x.ch : x.ch.map((c, i) => (i < 2 ? { ...c, on: true } : c)) })) },
        { label: 'Roll-Modus', value: s.acq.roll ? 'Auto (≥100ms)' : 'Aus', press: () => set((x) => ({ ...x, acq: { ...x.acq, roll: !x.acq.roll } })) },
        K('Verzögerung', fmt(s.hDelay, 's'), 'hDelay'),
        { label: 'Verzögerung → 0', press: () => set((x) => ({ ...x, hDelay: 0 })) },
      ];
    case 'measure':
      return [
        { ...K('Quelle', srcN(s.meas.selSrc), 'measSrc') },
        { ...K('Typ', MEAS_TYPES[s.meas.selType].label, 'measType') },
        {
          label: 'Hinzufügen', value: `${s.meas.list.length}/6`,
          press: () => {
            if (s.meas.list.length >= 6) { api.msg('Maximal 6 Messungen möglich'); return; }
            set((x) => ({ ...x, meas: { ...x.meas, list: [...x.meas.list, { type: MEAS_TYPES[x.meas.selType].id, src: x.meas.selSrc }] } }));
            api.resetStats();
          },
        },
        { label: 'Letzte entfernen', press: () => set((x) => ({ ...x, meas: { ...x.meas, list: x.meas.list.slice(0, -1) } })) },
        { label: 'Alle entfernen', press: () => set((x) => ({ ...x, meas: { ...x.meas, list: [] } })) },
        { label: 'Statistik', value: onOff(s.meas.stats), press: () => { api.resetStats(); set((x) => ({ ...x, meas: { ...x.meas, stats: !x.meas.stats } })); } },
      ];
    case 'cursor':
      return [
        {
          label: 'Typ', value: { off: 'Aus', time: 'Zeit (vertikal)', amp: 'Amplitude (horiz.)', both: 'Bildschirm' }[s.cursor.mode],
          press: () => set((x) => {
            const mode = cycle(['off', 'time', 'amp', 'both'] as const, x.cursor.mode);
            return { ...x, cursor: { ...x.cursor, mode, sel: mode === 'both' ? 'ta' : 'a' } };
          }),
        },
        { label: 'Quelle', value: srcN(s.cursor.src), press: () => set((x) => ({ ...x, cursor: { ...x.cursor, src: (x.cursor.src + 1) % (x.math.on ? 5 : 4) } })) },
        { label: 'Auswahl', value: selName(s.cursor.sel) + '  (Knopf drücken)', press: () => set((x) => ({ ...x, cursor: { ...x.cursor, sel: cycle(cursorSels(x.cursor.mode), x.cursor.sel) } })) },
        { label: 'Verschieben', value: 'Mehrzweckknopf', knob: kt === 'cursor', active: kt === 'cursor', press: () => set((x) => ({ ...x, knobTarget: null })) },
        { label: 'Zentrieren', press: () => set((x) => ({ ...x, cursor: { ...x.cursor, ta: -3, tb: 3, va: 2, vb: -2 } })) },
        { label: 'Cursor aus', press: () => set((x) => ({ ...x, cursor: { ...x.cursor, mode: 'off' }, menu: null })) },
      ];
    case 'math':
      return [
        { label: 'Operation', value: s.math.op === '+' ? 'Addition  +' : s.math.op === '-' ? 'Subtraktion  −' : 'Multiplikation  ×', press: () => set((x) => ({ ...x, math: { ...x.math, op: cycle(['+', '-', '*'] as const, x.math.op) } })) },
        { label: 'Quelle 1', value: srcN(s.math.a), press: () => set((x) => ({ ...x, math: { ...x.math, a: (x.math.a + 1) % 4 } })) },
        { label: 'Quelle 2', value: srcN(s.math.b), press: () => set((x) => ({ ...x, math: { ...x.math, b: (x.math.b + 1) % 4 } })) },
        K('Skala', fmt(s.math.vdiv, s.math.op === '*' ? 'V²' : 'V') + '/div', 'mathScale'),
        K('Position', `${s.math.pos.toFixed(2)} div`, 'mathPos'),
        { label: 'Math aus', press: () => set((x) => ({ ...x, math: { ...x.math, on: false }, menu: null, knobTarget: null })) },
      ];
    case 'fft':
      return [
        { label: 'Quelle', value: srcN(s.fft.source), press: () => set((x) => ({ ...x, fft: { ...x.fft, source: (x.fft.source + 1) % 4 } })) },
        { label: 'Fenster', value: { hann: 'Hanning', rect: 'Rechteck', hamming: 'Hamming', blackman: 'Blackman-Harris' }[s.fft.window], press: () => set((x) => ({ ...x, fft: { ...x.fft, window: cycle(['hann', 'rect', 'hamming', 'blackman'] as const, x.fft.window) } })) },
        K('Vertikal', `${s.fft.dbdiv} dB/div`, 'fftDb'),
        K('Ref.-Pegel', `${s.fft.level} dBV`, 'fftLevel'),
        K('Frequenz-Zoom', `×${s.fft.zoom}`, 'fftZoom'),
        { label: 'Quellsignal', value: s.fft.showSource ? 'Anzeigen' : 'Ausblenden', press: () => set((x) => ({ ...x, fft: { ...x.fft, showSource: !x.fft.showSource } })) },
      ];
    case 'ref':
      return [
        { label: 'Quelle', value: srcN(s.refSource), press: () => set((x) => ({ ...x, refSource: (x.refSource + 1) % (x.math.on ? 5 : 4) })) },
        { label: '→ R1 speichern', press: () => api.saveRef(0) },
        { label: 'R1 anzeigen', value: api.hasRef(0) ? onOff(s.refShow[0]) : 'leer', disabled: !api.hasRef(0), press: () => set((x) => ({ ...x, refShow: [!x.refShow[0], x.refShow[1]] })) },
        { label: '→ R2 speichern', press: () => api.saveRef(1) },
        { label: 'R2 anzeigen', value: api.hasRef(1) ? onOff(s.refShow[1]) : 'leer', disabled: !api.hasRef(1), press: () => set((x) => ({ ...x, refShow: [x.refShow[0], !x.refShow[1]] })) },
        { label: 'Referenzen löschen', press: api.clearRefs },
      ];
    case 'save':
      return [
        { label: 'Bildschirmfoto', value: 'PNG herunterladen', press: api.screenshot },
        { label: 'Signaldaten', value: 'CSV herunterladen', press: api.csv },
        { label: 'Setup speichern', value: 'Interner Speicher', press: api.saveSetup },
        { label: 'Setup abrufen', value: 'Interner Speicher', press: api.loadSetup },
        { label: 'Taste „Save“', value: { png: 'Bildschirmfoto', csv: 'Signaldaten', setup: 'Setup' }[s.saveAssign], press: () => set((x) => ({ ...x, saveAssign: cycle(['png', 'csv', 'setup'] as const, x.saveAssign) })) },
      ];
    case 'display':
      return [
        { label: 'Nachleuchten', value: s.display.persistence === 0 ? 'Aus' : s.display.persistence < 0 ? 'Unendlich' : `${s.display.persistence} s`, press: () => { api.clearPersist(); set((x) => ({ ...x, display: { ...x.display, persistence: cycle(PERSIST, x.display.persistence) } })); } },
        { label: 'Nachleuchten löschen', press: api.clearPersist },
        K('Intensität', `${s.display.intensity}%`, 'intensity'),
        { label: 'Raster', value: { full: 'Voll', grid: 'Gitter', cross: 'Fadenkreuz', frame: 'Rahmen' }[s.display.graticule], press: () => set((x) => ({ ...x, display: { ...x.display, graticule: cycle(['full', 'grid', 'cross', 'frame'] as const, x.display.graticule) } })) },
        { label: 'Darstellung', value: s.display.dots ? 'Punkte' : 'Vektoren', press: () => set((x) => ({ ...x, display: { ...x.display, dots: !x.display.dots } })) },
        { label: 'Hintergrundbel.', value: s.display.backlight === 1 ? 'Hoch' : s.display.backlight > 0.7 ? 'Mittel' : 'Niedrig', press: () => set((x) => ({ ...x, display: { ...x.display, backlight: cycle([1, 0.8, 0.6], x.display.backlight) } })) },
      ];
    case 'utility':
      return [
        { label: 'Selbstkalibrierung', value: 'Starten', press: api.calib },
        { label: 'Systeminfo', value: 'Anzeigen', press: api.toggleInfo },
        { label: 'Datum & Uhrzeit', value: onOff(s.display.showClock), press: () => set((x) => ({ ...x, display: { ...x.display, showClock: !x.display.showClock } })) },
        { label: 'Sprache', value: 'Deutsch', press: () => api.msg('Sprache: Deutsch (weitere nicht installiert)') },
        { label: 'Werkseinstellung', value: 'Wiederherstellen', press: api.defaultSetup },
      ];
    case 'zoom':
      return [
        { label: 'Zoom', value: onOff(s.zoom.on), press: () => set((x) => ({ ...x, zoom: { ...x.zoom, on: !x.zoom.on } })) },
        K('Zoomfaktor', `×${s.zoom.factor}`, 'zoomFactor'),
        K('Zoomposition', `${s.zoom.pos.toFixed(2)} div`, 'zoomPos'),
        { label: 'Position zentrieren', press: () => set((x) => ({ ...x, zoom: { ...x.zoom, pos: 0 } })) },
      ];
    case 'search':
      return [
        { label: 'Suche', value: onOff(s.search.on), press: () => set((x) => ({ ...x, search: { ...x.search, on: !x.search.on } })) },
        { label: 'Quelle', value: srcN(s.search.src), press: () => set((x) => ({ ...x, search: { ...x.search, src: (x.search.src + 1) % 4 } })) },
        { label: 'Flanke', value: s.search.slope === 'rise' ? '⟋ Steigend' : '⟍ Fallend', press: () => set((x) => ({ ...x, search: { ...x.search, slope: x.search.slope === 'rise' ? 'fall' : 'rise' } })) },
        K('Schwelle', fmt(s.search.level, 'V'), 'searchLevel'),
        { label: 'Marken löschen', value: `${s.search.marks.length} gesetzt`, press: () => set((x) => ({ ...x, search: { ...x.search, marks: [] } })) },
        { label: 'Treffer', value: s.search.on ? `${api.searchCount} Ereignisse` : '—', disabled: true },
      ];
  }
  return [];
}
