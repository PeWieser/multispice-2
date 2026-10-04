"use client";

import dynamic from "next/dynamic";
import { formatValue } from "@/lib/library/catalog";
import { InstrumentWindow, useEditor } from "@/state/editor";
import { grid } from "./shared";

export function PatternGenerator() {
  const doc = useEditor((s) => s.doc);
  const setParam = useEditor((s) => s.setParam);
  const clocks = doc.instances.filter((i) => i.partId === "clockgen" || i.partId === "vpulse");
  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="text-2xs text-ink-3">
        Treibt digitale Taktquellen und Pulsgeneratoren. Platziere »Taktgenerator (digital)« oder »Pulsquelle« im Schaltplan.
      </div>
      {clocks.map((c) => (
        <div key={c.id} className="rounded-lg p-2 bg-surface-2">
          <div className="mb-1 flex justify-between text-2xs">
            <span className="mono text-teal">
              {c.label}
            </span>
            <span className="mono text-ink-3">{formatValue(Number(c.params.freq ?? 1000), "Hz")}</span>
          </div>
          <input
            type="range"
            className="w-full"
            min={-1}
            max={6}
            step={0.02}
            value={Math.log10(Number(c.params.freq ?? 1000))}
            onChange={(e) => setParam(c.id, "freq", Math.pow(10, Number(e.target.value)))}
          />
          {c.partId === "vpulse" && (
            <input
              type="range"
              className="mt-1 w-full"
              min={1}
              max={99}
              value={Number(c.params.duty ?? 50)}
              onChange={(e) => setParam(c.id, "duty", Number(e.target.value))}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* frequency counter                                                   */
/* ------------------------------------------------------------------ */

export function LogicConverter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const cfg = (win.config.logicconv as { inputs: number; table: number[]; expr: string }) ?? { inputs: 3, table: Array(8).fill(0).map((_,i)=> (i%2)), expr: "" };
  const set = (patch: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, logicconv: { ...cfg, ...patch } } });

  const inputs = cfg.inputs;
  const rows = 1 << inputs;
  const table = cfg.table.length === rows ? cfg.table : Array(rows).fill(0);

  // Generate Boolean expression via Quine-McCluskey (simplified)
  const generateExpr = () => {
    // Collect minterms
    const minterms: number[] = [];
    for (let r=0; r<rows; r++) if (table[r]) minterms.push(r);
    if (!minterms.length) { set({ expr: "0" }); return; }
    if (minterms.length === rows) { set({ expr: "1" }); return; }

    // Quine-McCluskey – group by ones count
    type Imp = { bits: string; minterms: number[]; used: boolean };
    let groups: Map<number, Imp[]> = new Map();
    for (const m of minterms) {
      const bits = m.toString(2).padStart(inputs, "0");
      const ones = bits.split("").filter(b=>b==="1").length;
      const arr = groups.get(ones) ?? [];
      arr.push({ bits, minterms: [m], used: false });
      groups.set(ones, arr);
    }

    const primeImplicants: Imp[] = [];
    let hasCombined = true;
    while (hasCombined) {
      hasCombined = false;
      const nextGroups = new Map<number, Imp[]>();
      const keys = Array.from(groups.keys()).sort((a,b)=>a-b);
      for (let k=0; k<keys.length-1; k++) {
        const g1 = groups.get(keys[k]) ?? [];
        const g2 = groups.get(keys[k+1]) ?? [];
        for (const a of g1) {
          for (const b of g2) {
            let diff = 0;
            let diffPos = -1;
            for (let i=0; i<inputs; i++) {
              if (a.bits[i] !== b.bits[i]) { diff++; diffPos = i; }
            }
            if (diff === 1) {
              hasCombined = true;
              a.used = true;
              b.used = true;
              const newBits = a.bits.substring(0,diffPos) + "-" + a.bits.substring(diffPos+1);
              const newMinterms = Array.from(new Set([...a.minterms, ...b.minterms])).sort((x,y)=>x-y);
              const ones = newBits.split("").filter(ch=>ch==="1").length;
              const arr = nextGroups.get(ones) ?? [];
              if (!arr.some(x=>x.bits===newBits)) arr.push({ bits: newBits, minterms: newMinterms, used: false });
              nextGroups.set(ones, arr);
            }
          }
        }
      }
      // Collect unused as prime
      for (const [, imps] of groups) {
        for (const imp of imps) if (!imp.used) primeImplicants.push(imp);
      }
      groups = nextGroups;
    }
    for (const [, imps] of groups) for (const imp of imps) primeImplicants.push(imp);

    // Essential prime selection – simple greedy covering
    const covered = new Set<number>();
    const selected: Imp[] = [];
    // First essential
    for (const m of minterms) {
      const covering = primeImplicants.filter(pi=> pi.minterms.includes(m));
      if (covering.length === 1 && !selected.includes(covering[0])) {
        selected.push(covering[0]);
        covering[0].minterms.forEach(x=> covered.add(x));
      }
    }
    // Greedy for rest
    let remaining = minterms.filter(m=> !covered.has(m));
    while (remaining.length) {
      let best: Imp | null = null;
      let bestCover = 0;
      for (const pi of primeImplicants) {
        if (selected.includes(pi)) continue;
        const cover = pi.minterms.filter(m=> remaining.includes(m)).length;
        if (cover > bestCover) { bestCover = cover; best = pi; }
      }
      if (!best) break;
      selected.push(best);
      best.minterms.forEach(x=> covered.add(x));
      remaining = minterms.filter(m=> !covered.has(m));
    }

    // Convert to expression
    const terms = selected.map(imp=>{
      const lits: string[] = [];
      for (let i=0; i<inputs; i++) {
        const ch = imp.bits[i];
        if (ch === "-") continue;
        const varName = String.fromCharCode(65+i);
        lits.push(ch==="1" ? varName : `~${varName}`);
      }
      if (!lits.length) return "1";
      return lits.length===1 ? lits[0] : `(${lits.join(" & ")})`;
    });
    const expr = terms.length ? terms.join(" | ") : "0";
    set({ expr });
  };

  // Generate circuit – for demo, create text description
  const generateCircuit = () => {
    const doc = useEditor.getState().doc;
    // Simple: place AND/OR gates for SOP – for MVP just log
    useEditor.getState().log("ok", `Logic Converter: ${inputs} Eingänge, ${table.filter(v=>v).length} Minterme → ${cfg.expr || "kein Ausdruck"} – Schaltung würde ${table.filter(v=>v).length} ANDs + 1 OR generieren`);
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2.5 text-2xs">
      <div className="flex items-center gap-2">
        <span className="text-ink-3">Eingänge</span>
        <select className="input w-20 py-0.5" value={inputs} onChange={e=> set({ inputs: Number(e.target.value), table: Array(1<<Number(e.target.value)).fill(0) })}>
          {[2,3,4,5,6,7,8].map(n=> <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-primary ml-auto" onClick={generateExpr}>→ Boolean</button>
        <button className="btn" onClick={generateCircuit}>→ Schaltung</button>
      </div>
      <div className="grid gap-1 overflow-auto rounded-lg p-2 bg-surface-2 border border-hairline">
        <div className="grid text-2xs font-medium text-ink-3" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
          {Array.from({length: inputs}).map((_,i)=> <span key={i} className="text-center">{String.fromCharCode(65+i)}</span>)}
          <span className="text-center">F</span>
        </div>
        {Array.from({length: rows}).map((_,r)=>{
          const bits = r.toString(2).padStart(inputs,"0");
          return (
            <div key={r} className="grid items-center" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
              {bits.split("").map((b,i)=> <span key={i} className="text-center mono">{b}</span>)}
              <button className="h-6 rounded text-2xs font-bold" style={{ background: table[r] ? "var(--ok)" : "var(--surface)", color: table[r] ? "#fff" : "var(--ink-3)", border: "1px solid var(--hairline)" }} onClick={()=>{
                const nt = [...table];
                nt[r] = nt[r] ? 0 : 1;
                set({ table: nt });
              }}>{table[r]}</button>
            </div>
          );
        })}
      </div>
      <div>
        <div className="text-2xs text-ink-3 mb-1">Boolescher Ausdruck (SOP)</div>
        <div className="rounded-lg p-2 mono text-2xs bg-surface border border-hairline">{cfg.expr || "– klicke → Boolean –"}</div>
      </div>
      <div className="text-2xs text-ink-3">Wahrheitstabelle ↔ Boolesch ↔ Schaltung (SOP via Quine-McCluskey).</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* distortion analyzer                                                  */
/* ------------------------------------------------------------------ */
