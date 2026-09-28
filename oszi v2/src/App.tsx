import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Oscilloscope from './components/Oscilloscope';
import TestBench from './components/TestBench';
import HelpOverlay from './components/HelpOverlay';
import type { CircuitState, Env, GenState, ProbeState } from './scope/types';
import { CH_COLORS } from './scope/types';
import { SOURCES } from './scope/signals';

function Fit({ width, children }: { width: number; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const upd = () => {
      setScale(Math.min(1, (window.innerWidth - 24) / width));
      if (inner.current) setH(inner.current.offsetHeight);
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (inner.current) ro.observe(inner.current);
    window.addEventListener('resize', upd);
    return () => { ro.disconnect(); window.removeEventListener('resize', upd); };
  }, [width]);
  return (
    <div style={{ width: width * scale, height: h * scale, margin: '0 auto' }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [circuit, setCircuit] = useState<CircuitState>({
    power: true, powerOnT: 0, vcc: 9, c1: 100e-9, c2: 100e-9, rb1: 47000, rb2: 47000, rc: 1000,
  });
  const [gen, setGen] = useState<GenState>({ on: true, wave: 'sine', freq: 1000, amp: 2, offset: 0, noise: 0 });
  const [probes, setProbes] = useState<ProbeState[]>([
    { target: 'tp1', atten: 10, comp: 0 },
    { target: 'tp3', atten: 10, comp: 0 },
    { target: 'gen', atten: 10, comp: 0 },
    { target: 'comp', atten: 10, comp: -0.25 },
  ]);
  const [held, setHeld] = useState<number | null>(null);
  const [help, setHelp] = useState(false);

  const envRef = useRef<Env>({ circuit, gen, probes });
  envRef.current = { circuit, gen, probes };

  useEffect(() => {
    document.title = 'OTX2074 – Oszilloskop-Simulator';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setHeld(null); setHelp(false); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const onTargetClick = (id: string) => {
    if (held === null) return;
    setProbes((ps) => ps.map((p, i) => (i === held ? { ...p, target: id } : p)));
    setHeld(null);
  };

  return (
    <div className="min-h-screen pb-16" style={{ cursor: held !== null ? 'crosshair' : undefined }}>
      <header className="mx-auto flex max-w-[1420px] items-center justify-between px-4 py-4 text-[#f3e9dc]">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Oszilloskop-Simulator <span className="font-normal opacity-70">· Labortisch</span></h1>
          <p className="text-[12px] opacity-70">Knöpfe ziehen oder mit dem Mausrad drehen · Klick auf Knopf = Drücken · Tastkopf aufnehmen und auf Messpunkt klicken</p>
        </div>
        <button className="sk-btn" style={{ width: 110, height: 32 }} onClick={() => setHelp(true)}>❓ Anleitung</button>
      </header>

      {held !== null && (
        <div className="fixed left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/85 px-5 py-2 text-[13px] text-white shadow-xl" style={{ boxShadow: `0 0 0 2px ${CH_COLORS[held]}` }}>
          <span className="h-3 w-3 rounded-full" style={{ background: CH_COLORS[held] }} />
          Tastkopf CH{held + 1} in der Hand – klicke auf einen Messpunkt ({SOURCES.map((s) => s.label).join(', ')})
          <button className="rounded-full bg-white/15 px-3 py-0.5 text-[12px] hover:bg-white/25" onClick={() => setHeld(null)}>Abbrechen</button>
        </div>
      )}

      <Fit width={1420}>
        <Oscilloscope
          envRef={envRef}
          probes={probes}
          heldProbe={held}
          onTargetClick={onTargetClick}
          onPickProbe={(ch) => setHeld((h) => (h === ch ? null : ch))}
          onHelp={() => setHelp(true)}
        />
      </Fit>

      <div className="h-24" />

      <Fit width={1370}>
        <TestBench
          circuit={circuit}
          setCircuit={(fn) => setCircuit(fn)}
          gen={gen}
          setGen={(fn) => setGen(fn)}
          probes={probes}
          setProbes={(fn) => setProbes(fn)}
          heldProbe={held}
          setHeldProbe={setHeld}
          onTargetClick={onTargetClick}
        />
      </Fit>

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}
