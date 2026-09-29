import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GeneratorCore } from '@/lib/fg/core';
import type { Action, WaveId } from '@/lib/fg/types';
import { Key } from './Key';
import { Knob } from './Knob';
import { Bnc } from './Bnc';
import { Lcd } from './Lcd';
import { PowerIcon, WaveIcon } from './Icons';
import { uiClick, uiTick, type KeyKind } from './audio';
import './fg-panel.css';

/* W18: Frontpanel des SimTech FG-2500 (1:1 aus function generator/).
 * Gegenüber der Demo entfallen: Audio-Monitor (Ton-Ausgabe), Patchkabel-Demo,
 * Mini-Scope-Monitor, postMessage-Bridge. Klick-Geräusche bleiben (Utility →
 * Beep schaltet sie stumm). Tastatur-Shortcuts nur bei fokussiertem Panel. */

const STAGE_W = 1160;
const STAGE_H = 545;
const WAVES: WaveId[] = ['sine', 'square', 'ramp', 'pulse', 'noise', 'arb'];
const WAVE_TITLES: Record<WaveId, string> = {
  sine: 'Sinus', square: 'Rechteck', ramp: 'Dreieck / Rampe', pulse: 'Puls', noise: 'Rauschen', arb: 'Arbiträr',
};

const KIND_OF: Partial<Record<Action['type'], KeyKind>> = {
  digit: 'num', sign: 'num', fkey: 'soft', wave: 'wave', power: 'power',
  output: 'toggle', chSel: 'toggle', knobPress: 'toggle', arrow: 'arrow', both: 'toggle', mod: 'toggle',
};
const seedOf = (a: Action): number =>
  a.type === 'digit' ? Number(a.d) || 0
  : a.type === 'fkey' ? a.n
  : a.type === 'wave' ? WAVES.indexOf(a.wave) + 1
  : a.type === 'output' ? a.ch + 3
  : 1;

/** Runde 19 (W36): die beiden Ausgangsbuchsen – Klick nimmt das Kabel auf,
 *  danach legt ein Klick im Schaltplan die Messleitung (wie am Oszi). */
export interface JackState {
  held: 'out1' | 'out2' | null;
  nets: { out1: string; out2: string };
  onPick: (jack: 'out1' | 'out2') => void;
}

export function FunctionGenerator({
  core,
  jacks,
  autoScale = true,
}: {
  core: GeneratorCore;
  jacks?: JackState;
  /** false = das Gerät wird von außen (DeviceFit) skaliert und bleibt 1:1. */
  autoScale?: boolean;
}) {
  const state = useSyncExternalStore(core.subscribe, core.getState);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // W18: Einschalt-Splash – 1 beim ersten Bild, +1 pro Netzschalter.
  const [bootTick, setBootTick] = useState(1);

  /** Geräusche an/aus (Utility → Beep) */
  const soundOn = () => core.getState().sys.beep;

  // ---- Gerätebedienung ----
  const press = useCallback((a: Action) => {
    const enabled = core.getState().sys.beep;
    core.dispatch(a);
    if (a.type === 'power') setBootTick((t) => t + 1);
    if (enabled) uiClick(KIND_OF[a.type] ?? 'default', seedOf(a));
  }, [core]);

  // Panel skaliert nur herunter (1:1-Regel wie am Oszi), nie weich hoch.
  // Runde 19 (W35): Im Gerätefenster übernimmt das DeviceFit (Breite UND Höhe);
  // dann bleibt das Panel unverändert 1:1 und die Messung stimmt.
  useEffect(() => {
    if (!autoScale) return;
    const el = wrapRef.current!;
    const fit = () => setScale(Math.min(1, el.clientWidth / STAGE_W));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [autoScale]);

  // Tastatur: Ziffern, Punkt, Minus, Backspace, Pfeile, Enter, F1–F5.
  // Capture-Phase + stopImmediatePropagation: die App-Shortcuts (Canvas) dürfen
  // nicht mitbedient werden; aktiv nur wenn das Panel den Fokus hat.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || !root.contains(document.activeElement)) return;
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const handled =
        /^[0-9]$/.test(k) || k === '.' || k === ',' || k === '-' || k === 'Backspace' ||
        k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
        k === 'Enter' || /^F[1-5]$/.test(k);
      if (!handled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (/^[0-9]$/.test(k)) press({ type: 'digit', d: k });
      else if (k === '.' || k === ',') press({ type: 'digit', d: '.' });
      else if (k === '-') press({ type: 'sign' });
      else if (k === 'Backspace') press({ type: 'arrow', dir: 'left' });
      else if (k === 'ArrowLeft') press({ type: 'arrow', dir: 'left' });
      else if (k === 'ArrowRight') press({ type: 'arrow', dir: 'right' });
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        const dir = k === 'ArrowUp' ? 1 : -1;
        window.dispatchEvent(new CustomEvent('fg-knob-visual', { detail: dir }));
        press({ type: 'knob', steps: dir });
      } else if (k === 'Enter' && t.tagName !== 'BUTTON') press({ type: 'knobPress' });
      else if (/^F[1-5]$/.test(k)) press({ type: 'fkey', n: Number(k[1]) - 1 });
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [press]);

  const c = state.ch[state.active];
  const power = state.sys.power;
  const keypad: { l: string; a: Action }[] = [
    ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map((d) => ({ l: d, a: { type: 'digit', d } as Action })),
    { l: '.', a: { type: 'digit', d: '.' } },
    { l: '+/-', a: { type: 'sign' } },
  ];

  return (
    <div
      ref={rootRef}
      className="fg-panel"
      tabIndex={0}
      style={{ position: 'relative', outline: 'none' }}
      onPointerDown={() => rootRef.current?.focus({ preventScroll: true })}
    >
      <div ref={wrapRef} style={{ width: '100%', maxWidth: STAGE_W, margin: '0 auto', height: STAGE_H * scale }}>
        <div style={{ position: 'relative', width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {/* Gummischutz & Füße */}
          <div className="fg-bumper" style={{ left: 6, top: 8, width: 128, height: 118, borderRadius: 38 }} />
          <div className="fg-bumper" style={{ left: 1026, top: 8, width: 128, height: 118, borderRadius: 38 }} />
          <div className="fg-bumper" style={{ left: 6, top: 396, width: 128, height: 132, borderRadius: 38 }} />
          <div className="fg-bumper" style={{ left: 1026, top: 396, width: 128, height: 132, borderRadius: 38 }} />
          <div className="fg-foot" style={{ left: 190, top: 490, width: 190 }} />
          <div className="fg-foot" style={{ left: 780, top: 490, width: 190 }} />

          <div className="fg-body">
            {/* Beschriftung */}
            <div className="fg-label fg-label--dark" style={{ left: 64, top: 20, fontSize: 12 }}>
              <b style={{ fontSize: 15 }}>SimTech</b>® <span style={{ opacity: 0.8 }}>ARBITRARY WAVEFORM GENERATOR</span>{' '}
              <b style={{ fontSize: 17, color: '#2a6fc0' }}>2500</b>
            </div>

            {/* Display */}
            <div className="fg-bezel" style={{ left: 36, top: 52, width: 470, height: 340 }}>
              <Lcd state={state} bootTick={bootTick} />
            </div>

            {/* Softkeys F1–F5 */}
            {[0, 1, 2, 3, 4].map((i) => (
              <Key key={i} x={528} y={113 + 55 * i} w={48} h={32} variant="light" className="fg-fkey" title={`Softkey F${i + 1}`} onClick={() => press({ type: 'fkey', n: i })}>
                F{i + 1}
              </Key>
            ))}

            {/* Netz + Wellenformtasten */}
            <Key x={30} y={402} w={46} h={46} variant="power" lit={power} title="Netzschalter" onClick={() => press({ type: 'power' })}>
              <PowerIcon />
            </Key>
            {WAVES.map((w, i) => (
              <Key key={w} x={104 + 66 * i} y={404} w={58} h={42} variant="wave" lit={power && c.wave === w} title={WAVE_TITLES[w]} onClick={() => press({ type: 'wave', wave: w })}>
                <WaveIcon wave={w} />
              </Key>
            ))}

            {/* Ziffernblock */}
            <div className="fg-recess" style={{ left: 610, top: 52, width: 232, height: 204 }} />
            {keypad.map((k, i) => {
              const col = i % 3;
              const row = Math.floor(i / 3);
              return (
                <Key key={k.l} x={622 + col * 72} y={64 + row * 46} w={64} h={38} title={`Taste ${k.l}`} onClick={() => press(k.a)}>
                  {k.l}
                </Key>
              );
            })}

            {/* Knopf + Pfeiltasten */}
            <Knob
              x={913}
              y={116}
              size={104}
              onTurn={(steps) => {
                if (soundOn()) for (let i = 0; i < Math.min(Math.abs(steps), 6); i++) uiTick();
                press({ type: 'knob', steps });
              }}
              onPress={() => press({ type: 'knobPress' })}
            />
            <Key x={864} y={186} w={48} h={34} title="Cursor links / Zeichen löschen" onClick={() => press({ type: 'arrow', dir: 'left' })}>◀</Key>
            <Key x={918} y={186} w={48} h={34} title="Cursor rechts" onClick={() => press({ type: 'arrow', dir: 'right' })}>▶</Key>

            {/* Save / Utility / Help */}
            <Key x={988} y={68} w={80} h={42} title="Save – Speicherplätze" lit={state.ui.page === 'save'} onClick={() => press({ type: 'save' })}>Save</Key>
            <Key x={988} y={128} w={80} h={42} title="Utility – Systemeinstellungen" onClick={() => press({ type: 'utility' })} led={state.ui.page === 'utility'}>Utility</Key>
            <Key x={988} y={188} w={80} h={42} title="Help – Tastenhilfe" onClick={() => press({ type: 'help' })} led={state.ui.help}>Help</Key>

            {/* Blaues Bedienfeld */}
            <div className="fg-bluepanel" style={{ left: 603, top: 268, width: 470, height: 176 }}>
              <Key x={22} y={16} w={86} h={38} title="Kanal wählen (CH1/CH2)" onClick={() => press({ type: 'chSel' })}>CH1/2</Key>
              <Key x={22} y={68} w={86} h={38} title="Both – beide Kanäle anzeigen" led={state.ui.both} onClick={() => press({ type: 'both' })}>Both</Key>
              <Key x={22} y={120} w={86} h={38} title="Mod – Modulation, Sweep, Burst" led={c.mode !== 'off'} onClick={() => press({ type: 'mod' })}>Mod</Key>

              <div style={{ position: 'absolute', left: 130, top: 14, width: 326, height: 148, border: '2px solid rgba(255,255,255,.9)', borderRadius: 16, boxSizing: 'border-box' }}>
                <Key x={16} y={8} w={78} h={30} variant="red" lit={power && state.ch[0].output} title="CH1 Ausgang ein/aus" onClick={() => press({ type: 'output', ch: 0 })}>CH1</Key>
                <Key x={230} y={8} w={78} h={30} variant="blue" lit={power && state.ch[1].output} title="CH2 Ausgang ein/aus" onClick={() => press({ type: 'output', ch: 1 })}>CH2</Key>
                <div style={{ position: 'absolute', left: 113, top: 6, width: 98, height: 40, border: '2px solid #fff', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: '17px', paddingTop: 2, boxSizing: 'border-box', background: 'rgba(255,255,255,.08)' }}>
                  25MHz<br />120 MSa/s
                </div>
                <div className="fg-label" style={{ left: 58, top: 46 }}>OUT1</div>
                <div className="fg-label" style={{ left: 214, top: 46 }}>OUT2</div>
                <div className="fg-label" style={{ left: 143, top: 62, fontSize: 12 }}>50 Ω</div>
                <div style={{ position: 'absolute', left: 90, top: 60, width: 148, height: 40, borderTop: '1px solid #fff', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', opacity: 0.0 }} />
                <div className="fg-label" style={{ left: 134, top: 118, fontSize: 10 }}>▽ 42Vpk max</div>
                {(['out1', 'out2'] as const).map((jack, i) => {
                  const held = jacks?.held === jack;
                  const net = jacks?.nets[jack] ?? '';
                  const title = held
                    ? `${jack.toUpperCase()}: Kabel in der Hand – Klick im Schaltplan auf eine Leitung oder einen Pin legt die Messleitung, Klick auf die Buchse steckt sie zurück`
                    : net
                      ? `${jack.toUpperCase()}: verbunden mit Netz „${net}“ – Klick nimmt das Kabel auf (Umstecken ersetzt die Leitung)`
                      : `${jack.toUpperCase()}: offen – Klick nimmt das Kabel auf, danach im Schaltplan eine Leitung oder einen Pin anklicken`;
                  return (
                    <div key={jack}>
                      <Bnc
                        x={i === 0 ? 75 : 251}
                        y={100}
                        live={power && state.ch[i].output}
                        title={title}
                        jackId={jack}
                        held={held}
                        onClick={jacks ? () => jacks.onPick(jack) : undefined}
                      />
                      <div
                        className="fg-label"
                        style={{ left: i === 0 ? 22 : 198, top: 149, width: 106, textAlign: 'center', fontSize: 9, fontWeight: 600, opacity: held ? 1 : 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {held ? 'in der Hand' : net ? `→ ${net}` : 'offen'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FunctionGenerator;
