import { FunctionGenerator } from './components/FunctionGenerator';

export default function App() {
  return (
    <main className="mx-auto max-w-[1600px] px-3 pb-10 pt-5 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-[1160px] flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-slate-100">Funktionsgenerator SimTech FG-2500</h1>
          <p className="text-sm text-slate-400">2-Kanal-Arbiträrgenerator · Sinus, Rechteck, Rampe, Puls, Rauschen, Arb · AM/FM/PM/FSK · Sweep · Burst</p>
        </div>
        <p className="text-xs text-slate-400">
          Bedienung wie am Gerät: Wellenform-Taste → Softkey F1–F5 → Zifferneingabe + Einheit <em>oder</em> Drehknopf (Ziehen/Mausrad).
          Tastatur: 0–9 · . · − · ←/→ Cursor · ↑/↓ Knopf · Enter · F1–F5
        </p>
      </header>
      <FunctionGenerator />
    </main>
  );
}
