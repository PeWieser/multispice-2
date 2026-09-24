"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, ChevronDown, CircuitBoard, Cpu, Download, FileCode2, FilePlus2, FolderOpen,
  Gauge, Moon, Pause, Play, Redo2, Save, Square, Sun, Thermometer, Undo2, Upload, Waves, Zap,
} from "lucide-react";
import { PRESETS } from "@/lib/schematic/tools";
import { buildBom, toSpiceNetlist } from "@/lib/schematic/model";
import { useEditor } from "@/state/editor";

function Menu({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className="btn" data-active={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="glass rise absolute left-0 top-[calc(100%+6px)] z-50 min-w-[230px] rounded-xl p-1.5 shadow-2xl"
          style={{ boxShadow: "var(--shadow)" }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Item({ children, onClick, hint }: { children: React.ReactNode; onClick?: () => void; hint?: string }) {
  return (
    <button
      className="flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-dim hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
      onClick={onClick}
    >
      <span className="flex items-center gap-2">{children}</span>
      {hint && <span className="mono text-[10px] text-mute">{hint}</span>}
    </button>
  );
}

function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AppBar() {
  const st = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportSpice = () => {
    download(`${st.doc.name.replace(/\s+/g, "_")}.cir`, toSpiceNetlist(st.doc, ".tran 10u 20m"));
    st.log("ok", "SPICE-Netzliste exportiert (.cir)");
  };
  const exportJson = () => {
    download(`${st.doc.name.replace(/\s+/g, "_")}.msx.json`, JSON.stringify(st.doc, null, 2), "application/json");
    st.log("ok", "Projekt als JSON exportiert");
  };
  const exportBom = () => {
    const rows = buildBom(st.doc);
    const csv = ["Referenz;Bauteil;Wert;Footprint;Montage;Menge", ...rows.map((r) => `${r.ref};${r.part};${r.value};${r.footprint};${r.mount};${r.qty}`)].join("\n");
    download(`${st.doc.name.replace(/\s+/g, "_")}_BOM.csv`, csv, "text/csv");
    st.log("ok", `Stückliste exportiert (${rows.length} Positionen)`);
  };
  const exportGerber = () => {
    const rows = buildBom(st.doc);
    const g = [
      "G04 CircuitLab Studio Gerber RS-274X (Platzhalter-Layer)*",
      "%FSLAX36Y36*%",
      "%MOMM*%",
      "%ADD10C,1.000*%",
      "D10*",
      ...rows.map((_, i) => `X${(10000 + i * 2540).toString()}Y${(10000).toString()}D03*`),
      "M02*",
    ].join("\n");
    download(`${st.doc.name.replace(/\s+/g, "_")}_top.gbr`, g);
    st.log("warn", "Gerber-Export: Platzhalter-Layer aus BOM erzeugt (Layout-Editor folgt)");
  };
  const exportPdf = () => {
    window.print();
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (file.name.endsWith(".json")) {
          st.setDoc(JSON.parse(text));
          st.log("ok", `${file.name} importiert`);
        } else {
          import("@/lib/schematic/model").then((m) => {
            st.setDoc(m.fromSpiceNetlist(text));
            st.log("ok", `SPICE-Datei ${file.name} importiert`);
          });
        }
      } catch (e) {
        st.log("error", `Import fehlgeschlagen: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const rtf = st.sim.running ? (typeof window !== "undefined" ? undefined : undefined) : undefined;
  void rtf;

  return (
    <header className="glass relative z-40 flex h-12 shrink-0 items-center gap-1.5 px-2.5" style={{ borderWidth: "0 0 1px 0" }}>
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-3))" }}>
          <CircuitBoard size={15} color="#fff" />
        </div>
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight">CircuitLab Studio</div>
          <div className="text-[9.5px] text-mute">EDA · SPICE · Co-Simulation</div>
        </div>
      </div>

      <div className="mx-1 h-6 w-px" style={{ background: "var(--border)" }} />

      <Menu label="Datei" icon={<FilePlus2 size={14} />}>
        <Item onClick={() => st.newDocument()} hint="Strg+N">
          <FilePlus2 size={14} /> Neuer Schaltplan
        </Item>
        <Item onClick={() => void st.saveProject()} hint="Strg+S">
          <Save size={14} /> In Datenbank speichern
        </Item>
        <Item onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Importieren (.json/.cir)
        </Item>
        <div className="my-1 h-px" style={{ background: "var(--border)" }} />
        <Item onClick={exportSpice}>
          <FileCode2 size={14} /> Export SPICE-Netzliste
        </Item>
        <Item onClick={exportJson}>
          <Download size={14} /> Export Projekt (JSON)
        </Item>
        <Item onClick={exportBom}>
          <Download size={14} /> Export Stückliste (CSV)
        </Item>
        <Item onClick={exportGerber}>
          <Download size={14} /> Export Gerber (RS-274X)
        </Item>
        <Item onClick={exportPdf}>
          <Download size={14} /> Drucken / PDF
        </Item>
      </Menu>

      <Menu label="Vorlagen" icon={<FolderOpen size={14} />}>
        {PRESETS.map((p) => (
          <Item key={p.id} onClick={() => st.loadPreset(p.id)}>
            <Zap size={13} /> {p.name}
          </Item>
        ))}
      </Menu>

      <Menu label="Analysen" icon={<Activity size={14} />}>
        <Item onClick={() => st.runAnalysis("op")}>DC-Arbeitspunkt (.op)</Item>
        <Item onClick={() => st.setBottomTab("scope")}>Transient (.tran)</Item>
        <Item onClick={() => st.openInstrument("bode")}>AC-Sweep / Bode (.ac)</Item>
        <Item onClick={() => st.runAnalysis("dc", { sourceId: st.doc.instances.find((i) => i.partId.startsWith("v"))?.label ?? "V1", sweep: { start: 0, stop: 12, points: 60, type: "lin" } })}>
          DC-Sweep
        </Item>
        <div className="my-1 h-px" style={{ background: "var(--border)" }} />
        <Item onClick={() => st.runAnalysis("noise", { sweep: { start: 10, stop: 1e6, points: 10, type: "dec" } })}>Rauschanalyse (.noise)</Item>
        <Item onClick={() => st.runAnalysis("thd", { fundamental: 1000 })}>THD / Fourier</Item>
        <Item onClick={() => st.runAnalysis("montecarlo", { runs: 40, tolerance: 5 })}>Monte-Carlo</Item>
        <Item onClick={() => st.runAnalysis("worstcase", { tolerance: 5 })}>Worst-Case</Item>
        <Item onClick={() => st.runAnalysis("temp", { temps: [-40, -10, 25, 60, 85, 125] })}>
          <Thermometer size={13} /> Temperatur-Sweep
        </Item>
      </Menu>

      <div className="mx-1 h-6 w-px" style={{ background: "var(--border)" }} />

      <button className="btn" onClick={st.undo} disabled={!st.past.length} title="Rückgängig (Strg+Z)">
        <Undo2 size={15} />
      </button>
      <button className="btn" onClick={st.redo} disabled={!st.future.length} title="Wiederholen (Strg+Y)">
        <Redo2 size={15} />
      </button>

      <div className="mx-1 h-6 w-px" style={{ background: "var(--border)" }} />

      {/* simulation transport */}
      <div className="flex items-center gap-1 rounded-xl px-1.5 py-1" style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}>
        <button
          className={st.sim.running ? "btn" : "btn btn-primary"}
          onClick={() => (st.sim.running ? st.pauseSim() : st.startSim())}
          title="Simulation starten/pausieren (Leertaste)"
        >
          {st.sim.running ? <Pause size={14} /> : <Play size={14} />}
          {st.sim.running ? "Pause" : "Simulieren"}
        </button>
        <button className="btn" onClick={st.stopSim} title="Stopp & Reset">
          <Square size={13} />
        </button>
        <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
        <Gauge size={13} className="text-mute" />
        <input
          type="range"
          min={-4}
          max={1}
          step={0.05}
          value={Math.log10(st.sim.timeScale)}
          onChange={(e) => st.setSimOption("timeScale", Math.pow(10, Number(e.target.value)))}
          className="w-24"
          title="Zeitskalierung"
        />
        <span className="mono w-14 text-[10.5px] text-dim">
          {st.sim.timeScale >= 1 ? `${st.sim.timeScale.toFixed(1)}×` : `1/${Math.round(1 / st.sim.timeScale)}×`}
        </span>
      </div>

      <div className="flex-1" />

      <div className="mono hidden items-center gap-3 pr-2 text-[10.5px] text-mute lg:flex">
        <span className="flex items-center gap-1">
          <Waves size={12} /> {(st.sim.sampleRate / 1000).toFixed(0)} kS/s
        </span>
        <span className="flex items-center gap-1">
          <Cpu size={12} /> {st.netResult.netlist.devices.length} Devices
        </span>
        <span className="flex items-center gap-1">{st.netResult.nets.length} Netze</span>
        <span className="flex items-center gap-1" style={{ color: st.sim.fps > 50 ? "var(--ok)" : "var(--warn)" }}>
          {st.sim.fps.toFixed(0)} FPS
        </span>
        {st.sim.running && (
          <span className="live-dot flex items-center gap-1" style={{ color: "var(--ok)" }}>
            ● LIVE t = {st.sim.running ? formatTime() : "0"}
          </span>
        )}
      </div>

      <button className="btn" onClick={st.toggleTheme} title="Theme wechseln">
        {st.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.cir,.net,.sp,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </header>
  );
}

function formatTime(): string {
  // read from the engine without subscribing (updated every frame by the canvas loop)
  const t = (globalThis as unknown as { __clsTime?: number }).__clsTime ?? 0;
  if (t > 1) return `${t.toFixed(2)} s`;
  if (t > 1e-3) return `${(t * 1e3).toFixed(2)} ms`;
  return `${(t * 1e6).toFixed(1)} µs`;
}
