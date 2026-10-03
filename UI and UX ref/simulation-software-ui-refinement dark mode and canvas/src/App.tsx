import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, fitView, type Note, type Probe, type Tool, type View } from "./app/Canvas";
import { DesignSystem } from "./app/DesignSystem";
import { Inspector } from "./app/Inspector";
import { InstrumentRail, INSTRUMENTS } from "./app/InstrumentRail";
import { LibraryPanel } from "./app/LibraryPanel";
import { MenuBar, type MenuDef } from "./app/MenuBar";
import { initialCircuit, PART_NAMES, sample, timing, type Circuit, type Part, type PartType } from "./app/model";
import { Oscilloscope } from "./app/Oscilloscope";
import { StatusBar } from "./app/StatusBar";
import { Toolbar, type ProbeMode } from "./app/Toolbar";
import { Icon } from "./ui/icons";
import { Button, Field, IconButton, Segmented, Select, Switch, ToastProvider, useToast } from "./ui/primitives";

interface Doc {
  id: string;
  title: string;
  circuit: Circuit;
  notes: Note[];
  probes: Probe[];
}

let uid = 100;
const nid = (p: string) => `${p}${++uid}`;

function nextRef(c: Circuit, type: PartType) {
  const prefix = { resistor: "R", capacitor: "C", inductor: "L", source: "V", ground: "GND", diode: "D", led: "D", ic555: "U", netlabel: "NET" }[type];
  if (type === "ground") return "GND";
  let n = 1;
  while (c.parts.some((p) => p.ref === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function AppInner() {
  const { push } = useToast();

  /* ───── appearance ───── */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [mode, setMode] = useState<"editor" | "kit">("editor");

  /* ───── documents + history ───── */
  const [docs, setDocs] = useState<Doc[]>([{ id: "d1", title: "555 Blinker", circuit: initialCircuit, notes: [], probes: [] }]);
  const [activeDoc, setActiveDoc] = useState("d1");
  const doc = docs.find((d) => d.id === activeDoc) ?? docs[0];
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);

  const commit = useCallback(
    (fn: (d: Doc) => Doc) => {
      setDocs((ds) => {
        const cur = ds.find((d) => d.id === activeDoc)!;
        setPast((p) => [...p.slice(-49), cur]);
        setFuture([]);
        return ds.map((d) => (d.id === activeDoc ? fn(d) : d));
      });
    },
    [activeDoc],
  );
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDocs((ds) => ds.map((d) => (d.id === prev.id ? prev : d)));
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, doc]);
    setDocs((ds) => ds.map((d) => (d.id === next.id ? next : d)));
  };

  /* ───── editor state ───── */
  const [tool, setTool] = useState<Tool>("select");
  const [placing, setPlacing] = useState<PartType | null>(null);
  const [probeKind, setProbeKind] = useState<"V" | "A">("V");
  const [probeMode, setProbeMode] = useState<ProbeMode>("live");
  const [selection, setSelection] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>({ x: 120, y: 60, k: 1 });
  const canvasWrap = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    const el = canvasWrap.current;
    if (!el) return;
    setView(fitView(doc.circuit, el.clientWidth, el.clientHeight));
  }, [doc.circuit]);
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc, libraryOpen, inspectorOpen, mode]);

  const zoomTo = (k: number) => {
    const el = canvasWrap.current;
    if (!el) return;
    const cx = el.clientWidth / 2,
      cy = el.clientHeight / 2;
    setView((v) => {
      const s = k / v.k;
      return { k, x: cx - (cx - v.x) * s, y: cy - (cy - v.y) * s };
    });
  };

  /* ───── simulation ───── */
  const [running, setRunning] = useState(false);
  const [simT, setSimT] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = performance.now() - simT * 1000;
    const loop = (now: number) => {
      setSimT((now - start.current) / 1000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const tm = useMemo(() => timing(doc.circuit), [doc.circuit]);
  const s = sample(simT, tm);
  const live = { running, outHigh: s.high, vcNorm: (s.vc - tm.vcc / 3) / (tm.vcc / 3) };

  const toggleRun = () => {
    setRunning((r) => {
      if (!r) {
        setSimT(0);
        push({ title: "Simulation gestartet", message: `Transient · f ≈ ${tm.freq.toFixed(2)} Hz`, icon: "play", tone: "green" });
      }
      return !r;
    });
  };

  const netValue = useCallback(
    (net: string, kind: "V" | "A") => {
      if (!running && probeMode === "live") return "—";
      const r3 = doc.circuit.parts.find((p) => p.id === "r3")?.value ?? 470;
      const v: Record<string, number> = { VCC: tm.vcc, GND: 0, OUT: s.vout, CAP: s.vc, DIS: s.high ? tm.vcc : 0.2 };
      const val = v[net] ?? 0;
      if (kind === "V") return `${val.toFixed(2)} V`;
      const i = net === "OUT" ? Math.max(0, (val - 1.9) / r3) * 1000 : net === "VCC" ? 4.2 : 0;
      return `${i.toFixed(2)} mA`;
    },
    [running, probeMode, doc.circuit.parts, tm.vcc, s],
  );

  /* ───── mutations ───── */
  const patchPart = (id: string, patch: Partial<Part>) =>
    commit((d) => ({ ...d, circuit: { ...d.circuit, parts: d.circuit.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } }));

  const deleteId = (id: string) => {
    commit((d) => ({
      ...d,
      circuit: { ...d.circuit, parts: d.circuit.parts.filter((p) => p.id !== id) },
      notes: d.notes.filter((n) => n.id !== id),
      probes: d.probes.filter((n) => n.id !== id),
    }));
    setSelection((sel) => sel.filter((x) => x !== id));
  };

  const duplicate = (id: string) =>
    commit((d) => {
      const p = d.circuit.parts.find((x) => x.id === id);
      if (!p) return d;
      const np = { ...p, id: nid("p"), x: p.x + 40, y: p.y + 40, ref: nextRef(d.circuit, p.type) };
      setSelection([np.id]);
      return { ...d, circuit: { ...d.circuit, parts: [...d.circuit.parts, np] } };
    });

  const placePart = (type: PartType, x: number, y: number) =>
    commit((d) => {
      const table: Record<PartType, Partial<Part>> = {
        resistor: { value: 1e3, unit: "Ω", tolerance: 1, rot: 90 },
        capacitor: { value: 100e-9, unit: "F", tolerance: 10, rot: 90 },
        inductor: { value: 10e-6, unit: "H", tolerance: 10, rot: 90 },
        source: { value: 5, unit: "V" },
        ground: {},
        diode: { label: "1N4148" },
        led: { label: "Rot", color: "#ff453a" },
        ic555: { label: "NE555" },
        netlabel: { label: "NET" },
      };
      const defaults = table[type];
      const np: Part = { id: nid("p"), type, ref: nextRef(d.circuit, type), x, y, rot: 0, showRef: true, showValue: true, ...defaults };
      setSelection([np.id]);
      return { ...d, circuit: { ...d.circuit, parts: [...d.circuit.parts, np] } };
    });

  const addWire = (points: [number, number][]) => {
    commit((d) => ({ ...d, circuit: { ...d.circuit, wires: [...d.circuit.wires, { id: nid("w"), points, net: `N${d.circuit.wires.length + 1}` }] } }));
    push({ title: "Leitung hinzugefügt", icon: "wire", tone: "accent" });
  };
  const addProbe = (kind: "V" | "A", x: number, y: number, net: string) => {
    commit((d) => ({ ...d, probes: [...d.probes, { id: nid("probe"), kind, x, y, net }] }));
  };
  const addNote = (x: number, y: number) => {
    const id = nid("note");
    commit((d) => ({ ...d, notes: [...d.notes, { id, x, y, text: "Notiz — im Inspektor bearbeiten" }] }));
    setSelection([id]);
    setTool("select");
  };
  const addLabel = (x: number, y: number) => {
    const id = nid("p");
    commit((d) => ({ ...d, circuit: { ...d.circuit, parts: [...d.circuit.parts, { id, type: "netlabel", ref: "NET", label: "NET", x, y, rot: 0 }] } }));
    setSelection([id]);
    setTool("select");
  };
  const patchNote = (id: string, text: string) => commit((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, text } : n)) }));

  const select = (ids: string[], additive?: boolean) =>
    setSelection((sel) => (additive ? (ids.every((i) => sel.includes(i)) ? sel.filter((x) => !ids.includes(x)) : [...new Set([...sel, ...ids])]) : ids));

  /* ───── docs ───── */
  const addDoc = () => {
    const id = nid("d");
    setDocs((ds) => [...ds, { id, title: `Ohne Titel ${ds.length}`, circuit: { parts: [], wires: [], junctions: [] }, notes: [], probes: [] }]);
    setActiveDoc(id);
    setSelection([]);
  };
  const closeDoc = (id: string) => {
    if (docs.length === 1) return push({ title: "Letztes Dokument", message: "Mindestens ein Schaltplan bleibt geöffnet.", icon: "info" });
    setDocs((ds) => ds.filter((d) => d.id !== id));
    if (activeDoc === id) setActiveDoc(docs.find((d) => d.id !== id)!.id);
  };

  /* ───── keyboard ───── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (meta && e.key === "d" && selection.length === 1) {
        e.preventDefault();
        duplicate(selection[0]);
        return;
      }
      if (meta && e.key === "l") {
        e.preventDefault();
        setLibraryOpen((v) => !v);
        return;
      }
      if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomTo(Math.min(4, view.k * 1.2));
        return;
      }
      if (meta && e.key === "-") {
        e.preventDefault();
        zoomTo(Math.max(0.2, view.k / 1.2));
        return;
      }
      if (meta && e.key === "0") {
        e.preventDefault();
        fit();
        return;
      }
      if (meta) return;
      if (e.key === "F5") {
        e.preventDefault();
        toggleRun();
        return;
      }
      if (e.key === "Escape") {
        setPlacing(null);
        setSelection([]);
        setTool("select");
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        selection.forEach(deleteId);
        return;
      }
      const map: Record<string, Tool> = { v: "select", h: "hand", w: "wire", e: "eraser", p: "probe", t: "tag", n: "note" };
      const k = e.key.toLowerCase();
      if (e.shiftKey && (k === "v" || k === "a")) {
        setProbeKind(k.toUpperCase() as "V" | "A");
        setTool("probe");
        return;
      }
      if (map[k] && !e.shiftKey) {
        setTool(map[k]);
        setPlacing(null);
      }
      if (k === "r" && selection.length === 1) {
        const p = doc.circuit.parts.find((x) => x.id === selection[0]);
        if (p) patchPart(p.id, { rot: (((p.rot + 90) % 360) as 0 | 90 | 180 | 270) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ───── menus ───── */
  const menus: MenuDef[] = [
    {
      id: "file",
      label: "Datei",
      items: [
        { label: "Neu", shortcut: "⌘N", icon: "plus", onSelect: addDoc },
        { label: "Öffnen …", shortcut: "⌘O", icon: "folder" },
        { label: "Zuletzt verwendet", submenu: [{ label: "RC-Tiefpass.cir" }, { label: "H-Brücke.cir" }, { type: "divider" }, { label: "Liste löschen" }] },
        { type: "divider" },
        { label: "Sichern", shortcut: "⌘S", onSelect: () => push({ title: "Schaltplan gesichert", message: `${doc.title}.cir`, icon: "check", tone: "green" }) },
        { label: "Duplizieren …", shortcut: "⇧⌘S" },
        { label: "Exportieren", submenu: [{ label: "Netzliste (SPICE) …" }, { label: "PDF …" }, { label: "SVG …" }, { label: "PNG …" }] },
        { type: "divider" },
        { label: "Drucken …", shortcut: "⌘P" },
      ],
    },
    {
      id: "edit",
      label: "Bearbeiten",
      items: [
        { label: "Widerrufen", shortcut: "⌘Z", disabled: !past.length, onSelect: undo },
        { label: "Wiederholen", shortcut: "⇧⌘Z", disabled: !future.length, onSelect: redo },
        { type: "divider" },
        { label: "Ausschneiden", shortcut: "⌘X", disabled: !selection.length },
        { label: "Kopieren", shortcut: "⌘C", disabled: !selection.length },
        { label: "Einfügen", shortcut: "⌘V", disabled: true },
        { label: "Duplizieren", shortcut: "⌘D", disabled: selection.length !== 1, onSelect: () => duplicate(selection[0]) },
        { label: "Löschen", shortcut: "⌫", disabled: !selection.length, danger: true, onSelect: () => selection.forEach(deleteId) },
        { type: "divider" },
        { label: "Alles auswählen", shortcut: "⌘A", onSelect: () => setSelection(doc.circuit.parts.map((p) => p.id)) },
        { label: "Drehen", shortcut: "R", disabled: selection.length !== 1 },
      ],
    },
    {
      id: "view",
      label: "Ansicht",
      items: [
        { label: "Bibliothek", shortcut: "⌘L", checked: libraryOpen, onSelect: () => setLibraryOpen((v) => !v) },
        { label: "Inspektor", shortcut: "⌥⌘I", checked: inspectorOpen, onSelect: () => setInspectorOpen((v) => !v) },
        { type: "divider" },
        { label: "Raster", shortcut: "⌘'", checked: showGrid, onSelect: () => setShowGrid((v) => !v) },
        { label: "Am Raster ausrichten", shortcut: "⇧⌘'", checked: snapOn, onSelect: () => setSnapOn((v) => !v) },
        { type: "divider" },
        { label: "Vergrößern", shortcut: "⌘+", onSelect: () => zoomTo(view.k * 1.2) },
        { label: "Verkleinern", shortcut: "⌘-", onSelect: () => zoomTo(view.k / 1.2) },
        { label: "Einpassen", shortcut: "⌘0", onSelect: fit },
        { label: "Tatsächliche Größe", shortcut: "⌘1", onSelect: () => zoomTo(1) },
        { type: "divider" },
        { label: "Erscheinungsbild", submenu: [
          { label: "Hell", checked: theme === "light", onSelect: () => setTheme("light") },
          { label: "Dunkel", checked: theme === "dark", onSelect: () => setTheme("dark") },
        ] },
      ],
    },
    {
      id: "templates",
      label: "Vorlagen",
      items: [
        { type: "header", label: "Grundschaltungen" },
        { label: "555 Blinker", icon: "timer", checked: true },
        { label: "RC-Tiefpass", icon: "capacitor" },
        { label: "Spannungsteiler", icon: "resistor" },
        { label: "LED mit Vorwiderstand", icon: "led" },
        { type: "divider" },
        { type: "header", label: "Analog" },
        { label: "Invertierender Verstärker", icon: "opamp" },
        { label: "Emitterschaltung", icon: "transistor" },
        { type: "divider" },
        { label: "Als Vorlage sichern …" },
      ],
    },
    {
      id: "analysis",
      label: "Analysen",
      items: [
        { label: "Transientenanalyse …", icon: "oscilloscope", checked: true },
        { label: "Arbeitspunkt (DC) …", icon: "multimeter" },
        { label: "AC-Sweep …", icon: "bode" },
        { label: "Parameter-Sweep …", icon: "spectrum" },
        { label: "Monte Carlo …", icon: "distortion" },
        { type: "divider" },
        { label: running ? "Simulation stoppen" : "Simulation starten", shortcut: "F5", icon: running ? "stop" : "play", onSelect: toggleRun },
        { label: "Pause", shortcut: "F6", disabled: !running },
      ],
    },
    {
      id: "instruments",
      label: "Geräte",
      items: INSTRUMENTS.map((i) => ({ label: i.label, icon: i.icon, checked: instruments.includes(i.id), onSelect: () => toggleInstrument(i.id) })),
    },
  ];

  function toggleInstrument(id: string) {
    if (id !== "osc" && !instruments.includes(id)) {
      const ins = INSTRUMENTS.find((x) => x.id === id)!;
      push({ title: `${ins.label} platziert`, message: `${ins.short}1 wurde dem Schaltplan hinzugefügt.`, icon: ins.icon, tone: "accent" });
    }
    setInstruments((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const toolName: Record<Tool, string> = { select: "Auswählen", hand: "Verschieben", wire: "Leitung", eraser: "Löschen", probe: "Sonde", tag: "Bezeichner", note: "Notiz" };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app text-ink">
      <MenuBar
        menus={menus}
        running={running}
        onToggleRun={toggleRun}
        canUndo={!!past.length}
        canRedo={!!future.length}
        onUndo={undo}
        onRedo={redo}
        mode={mode}
        onMode={setMode}
        theme={theme}
        onTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        simTime={simT}
        onSettings={() => setSettingsOpen(true)}
      />

      {mode === "kit" ? (
        <div className="min-h-0 flex-1">
          <DesignSystem />
        </div>
      ) : (
        <>
          <Toolbar
            libraryOpen={libraryOpen}
            onToggleLibrary={() => setLibraryOpen((v) => !v)}
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            tool={tool}
            onTool={setTool}
            placing={placing}
            onPlacing={setPlacing}
            probeKind={probeKind}
            onProbeKind={setProbeKind}
            probeMode={probeMode}
            onProbeMode={setProbeMode}
            showGrid={showGrid}
            onShowGrid={setShowGrid}
            snapOn={snapOn}
            onSnap={setSnapOn}
          />

          <div className="flex min-h-0 flex-1">
            {libraryOpen && <LibraryPanel placing={placing} onPlace={setPlacing} onClose={() => setLibraryOpen(false)} />}

            <div ref={canvasWrap} className="relative min-w-0 flex-1">
              <Canvas
                circuit={doc.circuit}
                notes={doc.notes}
                probes={doc.probes}
                tool={tool}
                probeKind={probeKind}
                placing={placing}
                selection={selection}
                live={live}
                netValue={netValue}
                view={view}
                setView={setView}
                showGrid={showGrid}
                snapOn={snapOn}
                onSelect={select}
                onPlacePart={placePart}
                onPlaced={() => setPlacing(null)}
                onDelete={deleteId}
                onAddWire={addWire}
                onAddProbe={addProbe}
                onAddNote={addNote}
                onAddLabel={addLabel}
                onHoverNet={setHoverNet}
                onCursor={setCursor}
              />

              {/* Zoom cluster */}
              <div className="material-overlay absolute right-4 bottom-4 flex flex-col items-center rounded-[11px] p-1 shadow-2">
                <IconButton icon="plus" label="Vergrößern" shortcut="⌘+" size="sm" tooltipSide="left" onClick={() => zoomTo(Math.min(4, view.k * 1.2))} />
                <IconButton icon="minus" label="Verkleinern" shortcut="⌘-" size="sm" tooltipSide="left" onClick={() => zoomTo(Math.max(0.2, view.k / 1.2))} />
                <span className="my-0.5 h-px w-4 bg-hairline-strong" />
                <IconButton icon="fit" label="Einpassen" shortcut="⌘0" size="sm" tooltipSide="left" onClick={fit} />
              </div>

              {/* Empty state */}
              {doc.circuit.parts.length === 0 && (
                <div className="anim-fade pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-[16px] bg-surface/80 p-8 text-center shadow-2 backdrop-blur">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
                      <Icon name="sparkle" size={24} />
                    </span>
                    <div className="text-[15px] font-semibold text-ink">Leerer Schaltplan</div>
                    <div className="max-w-[32ch] text-[13px] text-ink-2">Wähle ein Bauteil aus der Bibliothek oder der Werkzeugleiste und klicke zum Platzieren.</div>
                    <Button variant="primary" size="sm" icon="library" onClick={() => setLibraryOpen(true)}>Bibliothek öffnen</Button>
                  </div>
                </div>
              )}

              {instruments.includes("osc") && (
                <Oscilloscope t={simT} running={running} tm={tm} onClose={() => toggleInstrument("osc")} />
              )}
            </div>

            {inspectorOpen && (
              <Inspector
                circuit={doc.circuit}
                selection={selection}
                notes={doc.notes}
                probes={doc.probes}
                onPatch={patchPart}
                onPatchNote={patchNote}
                onDelete={deleteId}
                onDuplicate={duplicate}
                running={running}
                docTitle={doc.title}
                onDocTitle={(t) => setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, title: t } : d)))}
              />
            )}
            <InstrumentRail active={instruments} onToggle={toggleInstrument} />
          </div>

          <StatusBar
            tabs={docs.map((d) => ({ id: d.id, title: d.title, dirty: d.id === activeDoc && past.length > 0 }))}
            activeTab={activeDoc}
            onTab={(id) => {
              setActiveDoc(id);
              setSelection([]);
            }}
            onCloseTab={closeDoc}
            onAddTab={addDoc}
            zoom={view.k}
            onZoom={zoomTo}
            onFit={fit}
            running={running}
            simTime={simT}
            cursor={cursor}
            hoverNet={hoverNet}
            tool={placing ? `${PART_NAMES[placing]} platzieren` : toolName[tool]}
          />
        </>
      )}

      {/* Settings sheet */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[250] flex items-start justify-center bg-black/20 pt-[12vh] backdrop-blur-[2px]" onPointerDown={() => setSettingsOpen(false)}>
          <div className="anim-slide-up w-[440px] overflow-hidden rounded-[16px] bg-surface shadow-3 ring-1 ring-black/[0.06]" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink/[0.06] text-ink-2"><Icon name="gear" size={18} /></span>
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-ink">Einstellungen</div>
                <div className="text-[12px] text-ink-3">Allgemein · Editor · Simulation</div>
              </div>
              <IconButton icon="close" label="Schließen" shortcut="Esc" size="sm" onClick={() => setSettingsOpen(false)} />
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              <Field label="Erscheinungsbild" inline>
                <Segmented size="sm" value={theme} onChange={setTheme} options={[{ value: "light", label: "Hell", icon: "sun" }, { value: "dark", label: "Dunkel", icon: "moon" }]} />
              </Field>
              <Field label="Raster anzeigen" inline><Switch size="sm" checked={showGrid} onChange={setShowGrid} /></Field>
              <Field label="Am Raster ausrichten" inline><Switch size="sm" checked={snapOn} onChange={setSnapOn} /></Field>
              <Field label="Sondenanzeige" inline>
                <Select size="sm" align="end" value={probeMode} onChange={setProbeMode} options={[{ value: "live", label: "Live" }, { value: "static", label: "Statisch" }, { value: "hold", label: "Halten" }]} />
              </Field>
              <Field label="Symbolnorm" hint="Darstellung der Schaltzeichen" inline>
                <Segmented size="sm" value="iec" onChange={() => {}} options={[{ value: "iec", label: "IEC" }, { value: "ansi", label: "ANSI" }]} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline bg-surface-2/60 px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(false)}>Abbrechen</Button>
              <Button variant="primary" size="sm" onClick={() => { setSettingsOpen(false); push({ title: "Einstellungen gesichert", icon: "check", tone: "green" }); }}>Fertig</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
