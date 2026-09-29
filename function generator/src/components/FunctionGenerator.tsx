import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GeneratorCore, installBridge } from '../generator/core';
import type { Action, WaveId } from '../generator/types';
import { Key } from './Key';
import { Knob } from './Knob';
import { Bnc } from './Bnc';
import { Lcd } from './Lcd';
import { PowerIcon, WaveIcon } from './Icons';
import { Scope } from './Scope';
import { useAudioMonitor } from './hooks';
import { uiClick, uiPlug, uiTick, uiUnplug, type KeyKind } from './audio';
import { CableLayer, type DragState } from './CableLayer';
import type { CableLink, InJack, JackGeo, JackId } from './cables';
import { cableOf, chOf, freeTargets, isOut, JACK_LABEL, IN_JACKS } from './cables';

const STAGE_W = 1160;
const STAGE_H = 545;
const WAVES: WaveId[] = ['sine', 'square', 'ramp', 'pulse', 'noise', 'arb'];
const WAVE_TITLES: Record<WaveId, string> = {
  sine: 'Sinus', square: 'Rechteck', ramp: 'Dreieck / Rampe', pulse: 'Puls', noise: 'Rauschen', arb: 'Arbiträr',
};

function makeCore() {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* kein Storage */ }
  return new GeneratorCore(storage);
}

export function FunctionGenerator() {
  const [core] = useState(makeCore);
  const state = useSyncExternalStore(core.subscribe, core.getState);
  const wrapRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // ---- Patchfeld: Messleitungen zwischen OUT1/OUT2 und den Oszilloskop-Eingängen ----
  const [cables, setCables] = useState<CableLink[]>([{ out: 'out1', inp: 'scopeA' }]);
  const [geo, setGeo] = useState<Partial<Record<JackId, JackGeo>>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<JackId | null>(null);
  const [imp, setImp] = useState<Record<InJack, number>>({ scopeA: 1e6, scopeB: 1e6 });
  const [hint, setHint] = useState('');

  const links = useMemo(() => {
    const l = { scopeA: null, scopeB: null } as Record<InJack, 0 | 1 | null>;
    for (const c of cables) l[c.inp] = chOf(c.out);
    return l;
  }, [cables]);

  const measure = useCallback(() => {
    const wrap = benchRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const next: Partial<Record<JackId, JackGeo>> = {};
    wrap.querySelectorAll<HTMLElement>('[data-jack]').forEach((el) => {
      const id = el.dataset.jack as JackId | undefined;
      if (!id) return;
      const r = el.getBoundingClientRect();
      next[id] = { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2, r: (Math.min(r.width, r.height) / 2) * 0.8 };
    });
    setGeo(next);
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, scale, cables]);
  useEffect(() => {
    const wrap = benchRef.current!;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  const localPt = (e: { clientX: number; clientY: number }) => {
    const r = benchRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Geräusche an/aus (Utility → Beep) */
  const soundOn = () => core.getState().sys.beep;

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

  const connect = useCallback((a: JackId, b: JackId) => {
    const out = (isOut(a) ? a : b) as CableLink['out'];
    const inp = (isOut(a) ? b : a) as InJack;
    setCables((cs) => [...cs.filter((c) => c.out !== out && c.inp !== inp), { out, inp }]);
    if (soundOn()) uiPlug();
  }, [core]);

  const dragRef = useRef<DragState | null>(null);
  const hoverRef = useRef<JackId | null>(null);
  const cablesRef = useRef(cables);
  cablesRef.current = cables;
  const geoRef = useRef(geo);
  geoRef.current = geo;

  const onJackDown = useCallback((j: JackId, e: React.PointerEvent) => {
    e.preventDefault();
    setHint('');
    const existing = cableOf(cablesRef.current, j);
    if (existing) {
      setCables((cs) => cs.filter((c) => !(c.out === existing.out && c.inp === existing.inp)));
      if (soundOn()) uiUnplug();
    }
    const pos = localPt(e);
    const d: DragState = {
      fixed: existing ? (isOut(j) ? existing.inp : existing.out) : j,
      pos,
      start: pos,
      moved: false,
      unplugged: !!existing,
    };
    dragRef.current = d;
    hoverRef.current = null;
    setHover(null);
    setDrag(d);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = localPt(e);
      const cs = cablesRef.current.filter((c) => c.out !== d.fixed && c.inp !== d.fixed);
      const targets = freeTargets(cs, d.fixed);
      const near = targets.find((t) => {
        const g = geoRef.current[t];
        return g && Math.hypot(g.x - pos.x, g.y - pos.y) < g.r + 26;
      }) ?? null;
      const next: DragState = { ...d, pos, moved: d.moved || Math.hypot(pos.x - d.start.x, pos.y - d.start.y) > 5 };
      dragRef.current = next;
      hoverRef.current = near;
      setDrag(next);
      setHover(near);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      const target = hoverRef.current;
      hoverRef.current = null;
      setDrag(null);
      setHover(null);
      if (!d) return;
      if (target) connect(d.fixed, target);
      else if (!d.moved && !d.unplugged) {
        const free = freeTargets(cablesRef.current, d.fixed)[0];
        if (free) connect(d.fixed, free);
        else setHint(`Kein freier Anschluss für ${JACK_LABEL[d.fixed]}`);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [connect]);

  // ---- Gerätebedienung ----
  const press = useCallback((a: Action) => {
    const enabled = core.getState().sys.beep;
    core.dispatch(a);
    if (enabled) uiClick(KIND_OF[a.type] ?? 'default', seedOf(a));
  }, [core]);

  useAudioMonitor(core, state.sys.audio && state.sys.power);
  useEffect(() => installBridge(core), [core]);

  useEffect(() => {
    const el = wrapRef.current!;
    const fit = () => setScale(Math.min(1.35, el.clientWidth / STAGE_W));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  // Tastatur: Ziffern, Punkt, Minus, Backspace, Pfeile, Enter, F1–F5
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) press({ type: 'digit', d: k });
      else if (k === '.' || k === ',') press({ type: 'digit', d: '.' });
      else if (k === '-') press({ type: 'sign' });
      else if (k === 'Backspace') press({ type: 'arrow', dir: 'left' });
      else if (k === 'ArrowLeft') { e.preventDefault(); press({ type: 'arrow', dir: 'left' }); }
      else if (k === 'ArrowRight') { e.preventDefault(); press({ type: 'arrow', dir: 'right' }); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const dir = k === 'ArrowUp' ? 1 : -1;
        window.dispatchEvent(new CustomEvent('fg-knob-visual', { detail: dir }));
        press({ type: 'knob', steps: dir });
      } else if (k === 'Enter' && t.tagName !== 'BUTTON') press({ type: 'knobPress' });
      else if (/^F[1-5]$/.test(k)) { e.preventDefault(); press({ type: 'fkey', n: Number(k[1]) - 1 }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press]);

  const c = state.ch[state.active];
  const power = state.sys.power;
  const keypad: { l: string; a: Action }[] = [
    ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map((d) => ({ l: d, a: { type: 'digit', d } as Action })),
    { l: '.', a: { type: 'digit', d: '.' } },
    { l: '+/-', a: { type: 'sign' } },
  ];

  return (
    <div ref={benchRef} style={{ position: 'relative' }}>
      <div ref={wrapRef} style={{ width: '100%', maxWidth: STAGE_W * 1.35, margin: '0 auto', height: STAGE_H * scale }}>
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
              <Lcd state={state} />
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
                <Bnc x={75} y={100} live={power && state.ch[0].output} title="OUT1 (CH1) – Messleitung anstecken" jackId="out1" />
                <Bnc x={251} y={100} live={power && state.ch[1].output} title="OUT2 (CH2) – Messleitung anstecken" jackId="out2" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Scope core={core} state={state} links={links} imp={imp} onImp={(j, v) => setImp((p) => ({ ...p, [j]: v }))} />
      <CableLayer cables={cables} geo={geo} drag={drag} hover={hover} onJackDown={onJackDown} />
      <p className="mx-auto mt-2 max-w-[1160px] text-xs text-slate-400">
        Messleitungen: BNC-Buchse anklicken steckt das Kabel auf den nächsten freien Eingang – nochmals klicken zieht es ab.
        Von Buchse zu Buchse ziehen verbindet gezielt. Angeschlossen: {cables.length ? cables.map((c) => `${c.out.toUpperCase()} → ${IN_JACKS.indexOf(c.inp) === 0 ? 'CH A' : 'CH B'}`).join(', ') : 'nichts'}.
        {hint && <span className="ml-2 text-amber-300">{hint}</span>}
      </p>
    </div>
  );
}
