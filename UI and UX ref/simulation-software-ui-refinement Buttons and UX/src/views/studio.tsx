import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AudioWaveform, BatteryCharging, Binary, Gauge, PanelLeft, PanelRight,
  Undo2, Redo2, Play, Square, Search, Settings, Sun, Moon, MousePointer2, Spline,
  Type, Eraser, Tag, StickyNote, ChevronDown, Plus, X, Check, CheckCheck, Command,
  Grid3X3, Magnet, FlaskConical, CircuitBoard, Keyboard, FilePlus2, FolderOpen, Save,
  Printer, Download, Scissors, Copy, ClipboardPaste, Trash2, ZoomIn, Maximize2,
  Sparkles, Layers, Info, RotateCcw, Pause, SlidersHorizontal, CircleDot, ListChecks,
} from "lucide-react";
import {
  Btn, IconBtn, Seg, Toggle, Badge, Dot, Divider, Kbd, Tip, MenuList, Popover,
  SliderRow, Stepper, Field, Row, Progress, cx, type MenuItem,
} from "../ui/kit";
import { SYMBOLS, SYMBOL_CATS, SProbeV, SProbeA } from "../ui/symbols";
import { CircuitCanvas, ScopeCanvas, useSim, COMP_META, NET_META, type Sel, type SimState } from "../sim/circuit";

/* ============================== helpers ============================== */

export function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${d}`;
}

export function TrafficLights({ onAction }: { onAction: (a: string) => void }) {
  const b = "group/tl flex h-3 w-3 items-center justify-center rounded-full";
  return (
    <div className="flex items-center gap-2 px-1" role="group" aria-label="Fenstersteuerung">
      <button aria-label="Schließen" onClick={() => onAction("close")} className={cx(b, "bg-[#ff5f57] shadow-[inset_0_0_0_.5px_rgba(0,0,0,.15)]")}>
        <X className="h-2 w-2 text-black/60 opacity-0 transition-opacity group-hover/tl:opacity-100" strokeWidth={3} />
      </button>
      <button aria-label="Minimieren" onClick={() => onAction("min")} className={cx(b, "bg-[#febc2e] shadow-[inset_0_0_0_.5px_rgba(0,0,0,.15)]")}>
        <span className="h-[1.5px] w-[7px] rounded bg-black/60 opacity-0 transition-opacity group-hover/tl:opacity-100" />
      </button>
      <button aria-label="Zoomen" onClick={() => onAction("zoom")} className={cx(b, "bg-[#28c840] shadow-[inset_0_0_0_.5px_rgba(0,0,0,.15)]")}>
        <Plus className="h-2 w-2 text-black/60 opacity-0 transition-opacity group-hover/tl:opacity-100" strokeWidth={3} />
      </button>
    </div>
  );
}

export type PaletteAction = { icon: React.ReactNode; label: string; hint?: string; group: string; run: () => void };

export function CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open ]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return actions;
    return actions.filter((a) => (a.label + " " + a.group).toLowerCase().includes(s));
  }, [q, actions]);
  useEffect(() => setIdx(0), [q]);
  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="absolute inset-0 z-[100] flex items-start justify-center pt-[12vh]" onPointerDown={onClose}>
      <div className="animate-menu-in w-[560px] max-w-[92%] overflow-hidden rounded-[14px] shadow-pop"
        style={{ background: "var(--menu-bg)", backdropFilter: "saturate(1.7) blur(26px)" }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter" && filtered[idx]) { filtered[idx].run(); onClose(); }
          if (e.key === "Escape") onClose();
        }}>
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--hair)" }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Befehl oder Bauteil suchen …" className="h-[46px] w-full bg-transparent text-[13.5px] outline-none"
            style={{ color: "var(--ink-1)" }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="scroll-thin max-h-[340px] overflow-y-auto p-1.5">
          {filtered.map((a, i) => {
            const head = a.group !== lastGroup ? ((lastGroup = a.group), true) : false;
            return (
              <React.Fragment key={a.label + i}>
                {head && (
                  <div className="px-2.5 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>
                    {a.group}
                  </div>
                )}
                <button
                  onClick={() => { a.run(); onClose(); }}
                  onMouseEnter={() => setIdx(i)}
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left text-[13px]"
                  style={{
                    background: i === idx ? "var(--accent)" : "transparent",
                    color: i === idx ? "#fff" : "var(--ink-1)",
                  }}>
                  <span className="inline-flex opacity-80 [&>svg]:h-[15px] [&>svg]:w-[15px]">{a.icon}</span>
                  <span className="flex-1 font-medium">{a.label}</span>
                  {a.hint && <span className="text-[12px] opacity-60">{a.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
              Keine Treffer für „{q}“
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 text-[11.5px]" style={{ borderTop: "1px solid var(--hair)", color: "var(--ink-3)" }}>
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigieren</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> Ausführen</span>
        </div>
      </div>
    </div>
  );
}

/* ============================== types ============================== */

export type ToolId = "select" | "wire" | "text" | "erase" | "label" | "note";
export type InstrId = "scope" | "dmm" | "psu" | "fgen" | "logic" | null;

const INSTRUMENTS: Array<{ id: Exclude<InstrId, null>; name: string; icon: React.ReactNode; hint: string }> = [
  { id: "scope", name: "Oszilloskop", icon: <Activity />, hint: "OUT & CAP live" },
  { id: "dmm", name: "Multimeter", icon: <Gauge />, hint: "V · A · Ω" },
  { id: "psu", name: "Labornetzteil", icon: <BatteryCharging />, hint: "0 – 12 V" },
  { id: "fgen", name: "Funktionsgenerator", icon: <AudioWaveform />, hint: "Sinus · Rechteck" },
  { id: "logic", name: "Logikanalysator", icon: <Binary />, hint: "8 Kanäle" },
];

/* ============================== main ============================== */

export default function StudioView(props: {
  dark: boolean; setDark: (v: boolean) => void;
  view: "studio" | "library"; onView: (v: "studio" | "library") => void;
  toast: (title: string, desc?: string, icon?: React.ReactNode) => void;
  paletteOpen: boolean; setPaletteOpen: (v: boolean) => void;
  onTraffic: (a: string) => void;
}) {
  const { dark, setDark, toast, paletteOpen, setPaletteOpen, onTraffic } = props;
  const [running, setRunning] = useState(false);
  const [freq, setFreq] = useState(1.4);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<ToolId>("select");
  const [selected, setSelected] = useState<Sel>(null);
  const [libOpen, setLibOpen] = useState(true);
  const [inspOpen, setInspOpen] = useState(true);
  const [instr, setInstr] = useState<InstrId>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [libSearch, setLibSearch] = useState("");
  const [libCat, setLibCat] = useState<string | null>(null);
  const [probeV, setProbeV] = useState(true);
  const [probeA, setProbeA] = useState(false);
  const [tabs] = useState([{ id: "a", name: "555 Blinker" }, { id: "b", name: "Netzteil 5 V" }]);
  const [activeTab, setActiveTab] = useState("a");
  const [setPop, setSetPop] = useState(false);
  const [sondenPop, setSondenPop] = useState(false);
  const [speedPop, setSpeedPop] = useState(false);

  const sim = useSim(running, freq * speed);

  const toggleRun = () => {
    setRunning((r) => {
      if (!r) toast("Simulation gestartet", `Transientenanalyse · f ≈ ${freq.toFixed(1)} Hz`, <Play className="h-4 w-4" />);
      return !r;
    });
  };

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inField = t.closest("input, textarea, [contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (inField) return;
      if (e.code === "Space" && !t.closest("button")) { e.preventDefault(); toggleRun(); }
      else if (e.key === "Escape") {
        if (menu) setMenu(null);
        else if (instr) setInstr(null);
        else if (tool !== "select") setTool("select");
        else setSelected(null);
      }
      else if (e.key.toLowerCase() === "v") setTool("select");
      else if (e.key.toLowerCase() === "w") setTool("wire");
      else if (e.key.toLowerCase() === "t") setTool("text");
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); setLibOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const paletteActions: PaletteAction[] = useMemo(() => [
    { icon: running ? <Square /> : <Play />, label: running ? "Simulation stoppen" : "Simulation starten", hint: "Leertaste", group: "Simulation", run: toggleRun },
    { icon: <RotateCcw />, label: "Simulationszeit zurücksetzen", group: "Simulation", run: () => { sim.reset(); toast("Zeit zurückgesetzt", "t = 00:00,0"); } },
    { icon: <Activity />, label: "Oszilloskop öffnen", group: "Geräte", run: () => setInstr("scope") },
    { icon: <Gauge />, label: "Multimeter öffnen", group: "Geräte", run: () => setInstr("dmm") },
    { icon: <FlaskConical />, label: "Transientenanalyse …", hint: "⌘T", group: "Analysen", run: () => toast("Transientenanalyse", "0 – 10 s · max. Schrittweite 1 ms") },
    { icon: <PanelLeft />, label: libOpen ? "Bibliothek ausblenden" : "Bibliothek einblenden", hint: "⌘B", group: "Ansicht", run: () => setLibOpen(!libOpen) },
    { icon: <PanelRight />, label: inspOpen ? "Informationen ausblenden" : "Informationen einblenden", group: "Ansicht", run: () => setInspOpen(!inspOpen) },
    { icon: dark ? <Sun /> : <Moon />, label: dark ? "Helle Darstellung" : "Dunkle Darstellung", group: "Ansicht", run: () => setDark(!dark) },
    { icon: <Layers />, label: "Zur UI-Library wechseln", group: "Ansicht", run: () => props.onView("library") },
    ...SYMBOLS.slice(0, 12).map((s) => ({
      icon: <span className="inline-flex h-[18px] w-[18px]"><s.C /></span>, label: `${s.name} platzieren`, hint: s.key, group: "Bauteile",
      run: () => toast(s.name, "Klicke auf die Arbeitsfläche, um zu platzieren"),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [running, libOpen, inspOpen, dark]);

  /* ---------- menus ---------- */
  const menus: Array<{ id: string; label: string; items: MenuItem[] }> = [
    {
      id: "datei", label: "Datei", items: [
        { label: "Neue Schaltung", icon: <FilePlus2 />, shortcut: "⌘N", onSelect: () => toast("Neue Schaltung", "Leeres Blatt im Raster 2,54 mm angelegt") },
        { label: "Öffnen …", icon: <FolderOpen />, shortcut: "⌘O", onSelect: () => toast("Öffnen", "Demo: Dateidialog") },
        { header: "Diese Woche" },
        { label: "555 Blinker", checked: true, onSelect: () => setActiveTab("a") },
        { label: "Netzteil 5 V", onSelect: () => setActiveTab("b") },
        { divider: true },
        { label: "Sichern", icon: <Save />, shortcut: "⌘S", onSelect: () => toast("Gesichert", "Alle Änderungen sind gespeichert", <CheckCheck className="h-4 w-4" />) },
        { label: "Duplizieren", shortcut: "⇧⌘S", onSelect: () => toast("Dupliziert", "„555 Blinker Kopie“ angelegt") },
        { label: "Exportieren", icon: <Download />, submenu: true, onSelect: () => toast("Exportieren", "PDF · PNG · SVG · Netzliste") },
        { divider: true },
        { label: "Drucken …", icon: <Printer />, shortcut: "⌘P", onSelect: () => toast("Drucken", "Demo: Druckdialog") },
      ],
    },
    {
      id: "bearbeiten", label: "Bearbeiten", items: [
        { label: "Rückgängig", shortcut: "⌘Z", onSelect: () => toast("Rückgängig", "Leitung verschoben") },
        { label: "Wiederholen", shortcut: "⇧⌘Z", onSelect: () => toast("Wiederholen", "Keine weiteren Schritte") },
        { divider: true },
        { label: "Ausschneiden", icon: <Scissors />, shortcut: "⌘X", disabled: !selected },
        { label: "Kopieren", icon: <Copy />, shortcut: "⌘C", disabled: !selected },
        { label: "Einfügen", icon: <ClipboardPaste />, shortcut: "⌘V", onSelect: () => toast("Einfügen", "Zwischenablage ist leer") },
        { label: "Duplizieren", shortcut: "⌘D", disabled: !selected, onSelect: () => toast("Dupliziert", selected ? COMP_META[selected.id]?.ref ?? selected.id : "") },
        { divider: true },
        { label: "Löschen", icon: <Trash2 />, shortcut: "⌫", danger: true, disabled: !selected, onSelect: () => { setSelected(null); toast("Gelöscht", "Bauteil entfernt"); } },
      ],
    },
    {
      id: "ansicht", label: "Ansicht", items: [
        { header: "Seitenleisten" },
        { label: "Bibliothek", icon: <PanelLeft />, shortcut: "⌘B", checked: libOpen, onSelect: () => setLibOpen(!libOpen) },
        { label: "Informationen", icon: <PanelRight />, checked: inspOpen, onSelect: () => setInspOpen(!inspOpen) },
        { divider: true },
        { header: "Arbeitsfläche" },
        { label: "Raster", icon: <Grid3X3 />, checked: showGrid, onSelect: () => setShowGrid(!showGrid) },
        { label: "Beschriftungen", icon: <Tag />, checked: showLabels, onSelect: () => setShowLabels(!showLabels) },
        { label: "Fangen", icon: <Magnet />, checked: true, onSelect: () => toast("Fangen", "Magnetisches Raster: 2,54 mm") },
        { divider: true },
        { label: "Vergrößern", icon: <ZoomIn />, shortcut: "⌘+", onSelect: () => toast("Zoom", "Tipp: Scrollen auf der Fläche") },
        { label: "Einpassen", icon: <Maximize2 />, shortcut: "⌘0", onSelect: () => toast("Zoom", "FIT über die Schaltfläche rechts unten") },
        { divider: true },
        { label: "Dunkle Darstellung", icon: <Moon />, checked: dark, onSelect: () => setDark(!dark) },
      ],
    },
    {
      id: "vorlagen", label: "Vorlagen", items: [
        { label: "555 Blinker", icon: <CircuitBoard />, checked: true },
        { label: "Netzteil 5 V", icon: <BatteryCharging />, badge: "Neu", onSelect: () => setActiveTab("b") },
        { label: "Differenzverstärker", icon: <AudioWaveform />, onSelect: () => toast("Vorlage", "„Differenzverstärker“ wird geladen …") },
        { label: "H-Brücke", icon: <Layers />, onSelect: () => toast("Vorlage", "„H-Brücke“ wird geladen …") },
        { divider: true },
        { label: "Alle Vorlagen …", onSelect: () => toast("Vorlagen", "Galerie mit 24 Schaltungen") },
      ],
    },
    {
      id: "analysen", label: "Analysen", items: [
        { label: "Transientenanalyse …", icon: <Activity />, shortcut: "⌘T", onSelect: () => { setInstr("scope"); toast("Transientenanalyse", "Oszilloskop zeigt OUT & CAP"); } },
        { label: "AC-Analyse (Bode) …", icon: <FlaskConical />, onSelect: () => toast("AC-Analyse", "10 Hz – 100 kHz · 50 Punkte/Dekade") },
        { label: "DC-Arbeitspunkt …", icon: <CircleDot />, onSelect: () => toast("DC-Arbeitspunkt", "VCC 9,00 V · OUT 8,72 V · CAP 4,50 V") },
        { label: "Monte-Carlo …", icon: <Sparkles />, badge: "Pro", onSelect: () => toast("Monte-Carlo", "200 Läufe · Toleranzen ±1 %") },
        { divider: true },
        { label: "Elektrische Prüfung (ERC)", icon: <ListChecks />, shortcut: "⇧⌘E", onSelect: () => toast("Prüfung ok", "0 Fehler · 0 Warnungen · 7 Bauteile", <Check className="h-4 w-4" />) },
      ],
    },
    {
      id: "geraete", label: "Geräte", items: INSTRUMENTS.map((g) => ({
        label: g.name, icon: g.icon, checked: instr === g.id,
        onSelect: () => setInstr(instr === g.id ? null : g.id),
      })),
    },
  ];

  const quickInsert = ["r-iec", "c", "d", "gnd", "vdc"].map((id) => SYMBOLS.find((s) => s.id === id)!);

  const tools: Array<{ id: ToolId; label: string; icon: React.ReactNode; key: string }> = [
    { id: "select", label: "Auswählen", icon: <MousePointer2 className="h-[16px] w-[16px]" />, key: "V" },
    { id: "wire", label: "Leitung", icon: <Spline className="h-[16px] w-[16px]" />, key: "W" },
    { id: "text", label: "Text", icon: <Type className="h-[16px] w-[16px]" />, key: "T" },
    { id: "erase", label: "Radieren", icon: <Eraser className="h-[16px] w-[16px]" />, key: "E" },
    { id: "label", label: "Netzlabel", icon: <Tag className="h-[16px] w-[16px]" />, key: "L" },
    { id: "note", label: "Notiz", icon: <StickyNote className="h-[16px] w-[16px]" />, key: "N" },
  ];

  const libFiltered = useMemo(() => {
    const s = libSearch.trim().toLowerCase();
    return SYMBOLS.filter((c) => (!libCat || c.cat === libCat) && (!s || (c.name + c.id).toLowerCase().includes(s)));
  }, [libSearch, libCat]);

  return (
    <div className="flex h-full flex-col">
      {/* ================= Menüleiste ================= */}
      <div className="glass-bar relative z-[60] flex h-[38px] shrink-0 items-center gap-0.5 px-2 hairline-b">
        <TrafficLights onAction={onTraffic} />
        <div className="mx-1.5 h-[18px] w-px" style={{ background: "var(--hair)" }} />
        {menus.map((m) => (
          <div key={m.id} className="relative">
            <button
              onClick={() => setMenu(menu === m.id ? null : m.id)}
              onMouseEnter={() => menu && setMenu(m.id)}
              className={cx("pressable rounded-[6px] px-2.5 py-[3px] text-[12.5px] font-medium")}
              style={{
                color: "var(--ink-1)",
                background: menu === m.id ? "var(--fill-active)" : "transparent",
                fontWeight: menu === m.id ? 600 : 500,
              }}>
              {m.label}
            </button>
            <Popover open={menu === m.id} onClose={() => setMenu(null)} width={264}>
              <MenuList items={m.items} onClose={() => setMenu(null)} />
            </Popover>
          </div>
        ))}
        <div className="mx-1.5 h-[18px] w-px" style={{ background: "var(--hair)" }} />
        <Tip label="Rückgängig" shortcut="⌘Z">
          <IconBtn size={28} onClick={() => toast("Rückgängig", "Leitung verschoben")}><Undo2 className="h-[15px] w-[15px]" /></IconBtn>
        </Tip>
        <Tip label="Wiederholen" shortcut="⇧⌘Z">
          <IconBtn size={28} onClick={() => toast("Wiederholen", "Keine weiteren Schritte")}><Redo2 className="h-[15px] w-[15px]" /></IconBtn>
        </Tip>

        {/* Start */}
        <div className="flex flex-1 items-center justify-center gap-2">
          <button
            onClick={toggleRun}
            aria-label={running ? "Simulation stoppen" : "Simulation starten"}
            className="pressable ring-focus flex h-[27px] items-center gap-1.5 rounded-full pl-3 pr-3.5 text-[12.5px] font-semibold text-white"
            style={{
              minWidth: running ? 148 : 96,
              justifyContent: "center",
              background: running ? "linear-gradient(180deg,#3a3a3f,#232327)" : "linear-gradient(180deg,#0a7aff,#0066d6)",
              boxShadow: running
                ? "inset 0 0 0 .5px rgba(255,255,255,.14), 0 1px 3px rgba(0,0,0,.3)"
                : "inset 0 .5px 0 rgba(255,255,255,.35), 0 1px 2px rgba(0,102,214,.4), 0 4px 12px -2px rgba(0,113,227,.45)",
              transition: "min-width .3s cubic-bezier(.3,1.2,.4,1), background .2s",
            }}>
            {running ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
            {running ? "Stopp" : "Start"}
            {running && (
              <span className="tabular animate-fade-in font-mono text-[11.5px] font-medium text-white/85">
                · {fmtTime(sim.t)}
              </span>
            )}
          </button>
          {running && <span className="live-dot h-[7px] w-[7px] rounded-full bg-[#ff453a]" style={{ boxShadow: "0 0 8px 2px rgba(255,69,58,.6)" }} />}
        </div>

        {/* rechts */}
        <Seg value={props.view} onChange={props.onView} size="sm" ariaLabel="Bereich"
          options={[{ value: "studio", label: "Studio" }, { value: "library", label: "Library" }]} />
        <div className="mx-1 h-[18px] w-px" style={{ background: "var(--hair)" }} />
        <Tip label="Befehle suchen" shortcut="⌘K">
          <IconBtn size={28} onClick={() => setPaletteOpen(true)}><Command className="h-[15px] w-[15px]" /></IconBtn>
        </Tip>
        <Tip label={dark ? "Helle Darstellung" : "Dunkle Darstellung"}>
          <IconBtn size={28} onClick={() => setDark(!dark)}>{dark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}</IconBtn>
        </Tip>
        <div className="relative">
          <Tip label="Einstellungen">
            <IconBtn size={28} active={setPop} onClick={() => setSetPop(!setPop)}><Settings className="h-[15px] w-[15px]" /></IconBtn>
          </Tip>
          <Popover open={setPop} onClose={() => setSetPop(false)} width={260} align="right">
            <div className="p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>Darstellung</div>
              <Seg value={dark ? "d" : "h"} onChange={(v) => setDark(v === "d")} className="w-full"
                options={[{ value: "h", icon: <Sun />, label: "Hell" }, { value: "d", icon: <Moon />, label: "Dunkel" }]} />
              <div className="mt-1">
                <div style={{ borderTop: "1px solid var(--hair)" }}>
                  <Row label="Raster"><Toggle checked={showGrid} onChange={setShowGrid} size="sm" /></Row>
                </div>
                <div style={{ borderTop: "1px solid var(--hair)" }}>
                  <Row label="Beschriftungen"><Toggle checked={showLabels} onChange={setShowLabels} size="sm" /></Row>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-[8px] p-2" style={{ background: "var(--panel-2)" }}>
                <Info className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ink-3)" }} />
                <span className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>SimStudio 2.4 · Build 8142</span>
              </div>
            </div>
          </Popover>
        </div>
      </div>

      {/* ================= Werkzeugleiste ================= */}
      <div className="glass-bar relative z-[50] flex h-[46px] shrink-0 items-center gap-2 px-3 hairline-b">
        <Tip label="Bibliothek ein-/ausblenden" shortcut="⌘B">
          <button onClick={() => setLibOpen(!libOpen)}
            className={cx("pressable ring-focus flex h-[32px] items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium")}
            style={{ color: libOpen ? "var(--accent-ink)" : "var(--ink-2)", background: libOpen ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent" }}>
            <PanelLeft className="h-[15px] w-[15px]" /> Bibliothek
          </button>
        </Tip>
        <Divider className="h-[22px]" />
        <div className="flex items-center gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--fill-hover)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
          {quickInsert.map((s) => (
            <Tip key={s.id} label={s.name} shortcut={s.key}>
              <IconBtn size={30} onClick={() => toast(s.name, "Klicke auf die Arbeitsfläche, um zu platzieren")}>
                <span className="inline-flex h-[20px] w-[20px]"><s.C /></span>
              </IconBtn>
            </Tip>
          ))}
        </div>
        <Divider className="h-[22px]" />
        <div className="flex items-center gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--fill-hover)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
          {tools.map((t) => (
            <Tip key={t.id} label={t.label} shortcut={t.key}>
              <IconBtn size={30} active={tool === t.id} accent={tool === t.id} onClick={() => { setTool(t.id); if (t.id !== "select") toast(t.label, toolHint(t.id)); }}>
                {t.icon}
              </IconBtn>
            </Tip>
          ))}
        </div>
        <Divider className="h-[22px]" />
        <div className="flex items-center gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--fill-hover)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
          <Tip label="V-Sonde" shortcut="⇧V">
            <button onClick={() => { setProbeV(!probeV); toast(probeV ? "V-Sonde abgelegt" : "V-Sonde aktiv", "Knoten anklicken, um zu messen"); }}
              className="pressable ring-focus flex h-[30px] items-center gap-1 rounded-[7px] px-1.5"
              style={{ background: probeV ? "color-mix(in srgb, #ff9f0a 20%, transparent)" : "transparent", boxShadow: probeV ? "inset 0 0 0 .5px #ff9f0a88" : "none" }}>
              <span className="inline-flex h-[20px] w-[20px]"><SProbeV /></span>
            </button>
          </Tip>
          <Tip label="A-Sonde" shortcut="⇧A">
            <button onClick={() => { setProbeA(!probeA); toast(probeA ? "A-Sonde abgelegt" : "A-Sonde aktiv", "Leitung anklicken, um zu messen"); }}
              className="pressable ring-focus flex h-[30px] items-center gap-1 rounded-[7px] px-1.5"
              style={{ background: probeA ? "color-mix(in srgb, #12a5b8 20%, transparent)" : "transparent", boxShadow: probeA ? "inset 0 0 0 .5px #12a5b888" : "none" }}>
              <span className="inline-flex h-[20px] w-[20px]"><SProbeA /></span>
            </button>
          </Tip>
          <div className="relative">
            <button onClick={() => setSondenPop(!sondenPop)}
              className="pressable ring-focus flex h-[30px] items-center gap-1 rounded-[7px] px-2 text-[12.5px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              style={{ color: "var(--ink-2)" }}>
              Sonden <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            <Popover open={sondenPop} onClose={() => setSondenPop(false)} width={230}>
              <MenuList onClose={() => setSondenPop(false)} items={[
                { label: "V-Sonde", icon: <span className="inline-flex h-[16px] w-[16px]"><SProbeV /></span>, shortcut: "⇧V", checked: probeV, onSelect: () => setProbeV(!probeV) },
                { label: "A-Sonde", icon: <span className="inline-flex h-[16px] w-[16px]"><SProbeA /></span>, shortcut: "⇧A", checked: probeA, onSelect: () => setProbeA(!probeA) },
                { divider: true },
                { label: "Differenzsonde", onSelect: () => toast("Differenzsonde", "Zwei Knoten der Reihe nach anklicken") },
                { label: "Logiksonde", badge: "8 ch", onSelect: () => setInstr("logic") },
              ]} />
            </Popover>
          </div>
        </div>

        <div className="flex-1" />
        <button onClick={() => toast("Prüfung ok", "0 Fehler · 0 Warnungen · 7 Bauteile geprüft", <Check className="h-4 w-4" />)}
          className="pressable ring-focus">
          <Badge tone="green"><Check className="h-3 w-3" strokeWidth={3} /> Prüfung ok</Badge>
        </button>
        <Tip label="Informationen ein-/ausblenden">
          <IconBtn size={30} active={inspOpen} onClick={() => setInspOpen(!inspOpen)}>
            <PanelRight className="h-[15px] w-[15px]" />
          </IconBtn>
        </Tip>
      </div>

      {/* ================= Hauptbereich ================= */}
      <div className="flex min-h-0 flex-1">
        {/* Bibliothek */}
        <aside className="flex shrink-0 flex-col overflow-hidden hairline-r"
          style={{
            width: libOpen ? 264 : 0, opacity: libOpen ? 1 : 0,
            background: "var(--bar-solid)", transition: "width .32s cubic-bezier(.3,1,.3,1), opacity .22s",
          }}>
          <div className="w-[264px] p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
              <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Bauteil suchen"
                className="ring-focus h-[30px] w-full rounded-[8px] pl-8 pr-7 text-[12.5px] outline-none"
                style={{ background: "var(--inset)", color: "var(--ink-1)", boxShadow: "inset 0 0 0 .5px var(--hair)" }} />
              {libSearch && (
                <button onClick={() => setLibSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-black/10">
                  <X className="h-3 w-3" style={{ color: "var(--ink-3)" }} />
                </button>
              )}
            </div>
            <div className="scroll-none mt-2 flex gap-1 overflow-x-auto pb-0.5">
              <CatChip active={!libCat} label="Alle" onClick={() => setLibCat(null)} />
              {SYMBOL_CATS.map((c) => <CatChip key={c} active={libCat === c} label={c.split(" ")[0]} title={c} onClick={() => setLibCat(libCat === c ? null : c)} />)}
            </div>
          </div>
          <div className="scroll-thin w-[264px] flex-1 overflow-y-auto px-2.5 pb-2">
            {libFiltered.map((s) => (
              <button key={s.id}
                onClick={() => toast(s.name, "Klicke auf die Arbeitsfläche, um zu platzieren")}
                className="pressable-subtle ring-focus group flex w-full items-center gap-2.5 rounded-[9px] px-2 py-[7px] text-left hover:bg-black/[0.045] dark:hover:bg-white/[0.07]">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] p-[3px]"
                  style={{ background: "var(--panel)", color: "var(--ink-1)", boxShadow: "inset 0 0 0 .5px var(--hair), 0 1px 2px rgba(0,0,0,.05)" }}>
                  <s.C />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium" style={{ color: "var(--ink-1)" }}>{s.name}</span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--ink-3)" }}>{s.cat}</span>
                </span>
                {s.key && <Kbd>{s.key}</Kbd>}
              </button>
            ))}
            {libFiltered.length === 0 && (
              <div className="px-2 py-8 text-center text-[12px]" style={{ color: "var(--ink-3)" }}>
                Keine Bauteile gefunden.
              </div>
            )}
          </div>
          <div className="w-[264px] p-2.5 hairline-t">
            <Btn variant="tertiary" size="sm" className="w-full" onClick={() => props.onView("library")}>
              Alle {SYMBOLS.length} Symbole in der Library <span aria-hidden>→</span>
            </Btn>
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          <CircuitCanvas sim={sim} running={running} selected={selected} onSelect={setSelected} showGrid={showGrid} showLabels={showLabels} />

          {/* HUD oben links */}
          <div className="absolute left-3 top-3 flex select-none items-center gap-2 rounded-[12px] py-1.5 pl-3 pr-2 shadow-float"
            style={{ background: "color-mix(in srgb, var(--panel) 88%, transparent)", backdropFilter: "blur(14px)", boxShadow: "inset 0 0 0 .5px var(--hair), 0 8px 24px -6px rgba(0,0,0,.18)" }}>
            <span className="flex items-center gap-1.5">
              <span className={cx("h-[7px] w-[7px] rounded-full", running && "live-dot")}
                style={{ background: running ? "#30d158" : "var(--ink-4)", boxShadow: running ? "0 0 6px 1px rgba(48,209,88,.7)" : "none" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-1)" }}>{running ? "Läuft" : "Bereit"}</span>
            </span>
            <span className="tabular font-mono text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>t = {fmtTime(sim.t)}</span>
            <div className="h-[18px] w-px" style={{ background: "var(--hair)" }} />
            <span className="text-[11.5px] font-medium" style={{ color: "var(--ink-3)" }}>f</span>
            <Stepper size="sm" value={freq} min={0.2} max={5} step={0.1} onChange={setFreq} format={(v) => `${v.toFixed(1)} Hz`} />
            <Tip label="Zeit zurücksetzen" side="bottom">
              <IconBtn size={26} onClick={() => { sim.reset(); toast("Zeit zurückgesetzt", "t = 00:00,0"); }}><RotateCcw className="h-[13px] w-[13px]" /></IconBtn>
            </Tip>
          </div>

          {/* Tool-Hinweis */}
          {tool !== "select" && (
            <div className="animate-rise absolute left-1/2 top-3 flex -translate-x-1/2 select-none items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-3 pr-2.5 text-[12px] font-medium shadow-float"
              style={{ background: "rgba(28,28,32,.9)", color: "#f5f5f7", backdropFilter: "blur(10px)" }}>
              <Dot color="#ff9f0a" glow /> {toolHint(tool)}
              <button onClick={() => setTool("select")} className="ml-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-white/70 hover:bg-white/15 hover:text-white">
                esc
              </button>
            </div>
          )}

          {/* Instrumenten-Panel (floating) */}
          {instr && (
            <div className="animate-menu-in absolute bottom-3 right-3 top-3 w-[372px] max-w-[calc(100%-24px)] overflow-hidden rounded-[14px] shadow-pop"
              style={{ background: "var(--panel)", boxShadow: "inset 0 0 0 .5px var(--hair), 0 24px 60px -12px rgba(0,0,0,.3)" }}>
              <InstrumentPanel instr={instr} sim={sim} running={running} onClose={() => setInstr(null)}
                toast={toast} toggleRun={toggleRun} freq={freq} setFreq={setFreq} />
            </div>
          )}
        </main>

        {/* Inspektor */}
        <aside className="shrink-0 overflow-hidden hairline-l"
          style={{
            width: inspOpen ? 288 : 0, opacity: inspOpen ? 1 : 0,
            background: "var(--bar-solid)", transition: "width .32s cubic-bezier(.3,1,.3,1), opacity .22s",
          }}>
          <Inspector sim={sim} running={running} selected={selected} freq={freq} setFreq={setFreq} toast={toast} toggleRun={toggleRun} />
        </aside>

        {/* Geräte-Dock */}
        <nav className="flex w-[54px] shrink-0 flex-col items-center gap-1 py-2 hairline-l"
          style={{ background: "var(--bar-solid)" }} aria-label="Messgeräte">
          {INSTRUMENTS.map((g) => (
            <Tip key={g.id} label={g.name} side="left">
              <button onClick={() => setInstr(instr === g.id ? null : g.id)}
                aria-pressed={instr === g.id}
                className="pressable ring-focus relative flex h-[42px] w-[42px] items-center justify-center rounded-[11px]"
                style={{
                  color: instr === g.id ? "#fff" : "var(--ink-2)",
                  background: instr === g.id ? "linear-gradient(180deg,#3a3a3f,#232327)" : "transparent",
                  boxShadow: instr === g.id ? "inset 0 0 0 .5px rgba(255,255,255,.12), 0 2px 6px rgba(0,0,0,.25)" : "none",
                }}>
                <span className="[&>svg]:h-[19px] [&>svg]:w-[19px]">{g.icon}</span>
                {instr === g.id && (
                  <span className="absolute -left-[7px] top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full" style={{ background: "var(--accent)" }} />
                )}
              </button>
            </Tip>
          ))}
          <div className="my-1 h-px w-[26px]" style={{ background: "var(--hair)" }} />
          <Tip label="Tastaturkürzel" side="left">
            <IconBtn size={38} onClick={() => toast("Kürzel", "Leertaste Start/Stopp · V/W/T Werkzeuge · ⌘K Befehle · ⌘B Bibliothek", <Keyboard className="h-4 w-4" />)}>
              <Keyboard className="h-[17px] w-[17px]" />
            </IconBtn>
          </Tip>
        </nav>
      </div>

      {/* ================= Statusleiste ================= */}
      <div className="glass-bar flex h-[30px] shrink-0 items-center gap-1.5 px-2 hairline-t">
        <Tip label="Neue Schaltung" side="top">
          <IconBtn size={24} onClick={() => toast("Neue Schaltung", "Leeres Blatt angelegt")}><Plus className="h-3.5 w-3.5" /></IconBtn>
        </Tip>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); if (t.id !== "a") toast(t.name, "Demo: Fokus bleibt auf „555 Blinker“"); }}
            className={cx("pressable group flex h-[23px] items-center gap-1.5 rounded-[7px] pl-2.5 pr-1.5 text-[12px]")}
            style={{
              background: activeTab === t.id ? "color-mix(in srgb, #ff9f0a 16%, transparent)" : "transparent",
              boxShadow: activeTab === t.id ? "inset 0 0 0 .5px #ff9f0a66" : "none",
              color: "var(--ink-1)", fontWeight: activeTab === t.id ? 600 : 500,
            }}>
            {t.name}
            <span className="rounded-[5px] p-[3px] opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/15" style={{ color: "var(--ink-3)" }}>
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
        <div className="flex-1" />
        <span className="hidden items-center gap-1 text-[11.5px] sm:flex" style={{ color: "var(--ink-3)" }}>
          <Check className="h-3 w-3" style={{ color: "var(--success)" }} strokeWidth={3} /> Prüfung ok
        </span>
        <div className="relative">
          <button onClick={() => setSpeedPop(!speedPop)}
            className="pressable ring-focus tabular flex h-[23px] items-center gap-1 rounded-[6px] px-2 font-mono text-[11.5px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            style={{ color: "var(--ink-2)" }}>
            {speed}× <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <Popover open={speedPop} onClose={() => setSpeedPop(false)} width={150} align="right" drop="up">
            <MenuList onClose={() => setSpeedPop(false)} items={[0.25, 0.5, 1, 2, 4].map((s) => ({
              label: `${s}×`, checked: speed === s, onSelect: () => setSpeed(s),
            }))} />
          </Popover>
        </div>
        <span className="tabular flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: running ? "var(--success)" : "var(--ink-3)" }}>
          {running ? <><Pause className="h-3 w-3" /> Läuft · {fmtTime(sim.t)}</> : "Bereit"}
        </span>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
    </div>
  );
}

/* ============================== Bausteine ============================== */

function toolHint(t: ToolId) {
  switch (t) {
    case "wire": return "Leitung: Start- und Zielpunkt anklicken";
    case "text": return "Text: Position anklicken und schreiben";
    case "erase": return "Radieren: Element anklicken";
    case "label": return "Netzlabel: Leitung anklicken";
    case "note": return "Notiz: Position anklicken";
    default: return "";
  }
}

function CatChip({ active, label, title, onClick }: { active: boolean; label: string; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="pressable ring-focus h-[24px] shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium"
      style={{
        background: active ? "var(--ink-1)" : "var(--fill-hover)",
        color: active ? "var(--bar-solid)" : "var(--ink-2)",
        boxShadow: active ? "none" : "inset 0 0 0 .5px var(--hair)",
      }}>
      {label}
    </button>
  );
}

/* ---------- Inspektor ---------- */

function Inspector({ sim, running, selected, freq, setFreq, toast, toggleRun }: {
  sim: SimState; running: boolean; selected: Sel; freq: number; setFreq: (v: number) => void;
  toast: (t: string, d?: string, i?: React.ReactNode) => void; toggleRun: () => void;
}) {
  const [val, setVal] = useState("");
  const [showName, setShowName] = useState(true);
  const [showValue, setShowValue] = useState(true);

  useEffect(() => { setVal(selected?.type === "comp" ? COMP_META[selected.id]?.value ?? "" : ""); }, [selected?.type, (selected as { id?: string } | null)?.id]);

  const netV = (id: string) => {
    if (!running) return "—";
    switch (id) {
      case "VCC": return "9,00 V";
      case "GND": return "0,00 V";
      case "OUT": return `${sim.outV.toFixed(2).replace(".", ",")} V`;
      case "CAP": return `${sim.capV.toFixed(2).replace(".", ",")} V`;
      case "DIS": return sim.high ? "0,22 V" : "8,85 V";
      default: return "—";
    }
  };

  return (
    <div className="scroll-thin flex h-full w-[288px] flex-col overflow-y-auto">
      <div className="px-3.5 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
        Informationen
      </div>

      {selected?.type === "comp" && COMP_META[selected.id] ? (
        <div className="animate-fade-in px-3.5 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>{COMP_META[selected.id].ref}</span>
                <Badge tone="gray">{COMP_META[selected.id].cat}</Badge>
              </div>
              <div className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ink-1)" }}>{COMP_META[selected.id].name}</div>
            </div>
            <Dot color={running ? "#30d158" : "#aeaeb2"} />
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{COMP_META[selected.id].desc}</p>

          <div className="mt-3">
            <Field label="Wert" value={val} onChange={setVal} mono suffix={selected.id === "U1" ? "" : undefined} />
          </div>

          {running && (
            <div className="mt-3 rounded-[10px] p-2.5" style={{ background: "var(--success-bg)", boxShadow: "inset 0 0 0 .5px color-mix(in srgb, var(--success) 30%, transparent)" }}>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--success)" }}>
                <span className="live-dot h-[6px] w-[6px] rounded-full bg-current" /> Live
              </div>
              <LiveRows id={selected.id} sim={sim} />
            </div>
          )}

          <div className="mt-3" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>Kennwerte</div>
            {COMP_META[selected.id].specs.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-[5px] text-[12px]">
                <span style={{ color: "var(--ink-3)" }}>{k}</span>
                <span className="tabular mx-2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" style={{ borderBottom: "1px dotted var(--hair-strong)" }} />
                <span className="tabular font-medium" style={{ color: "var(--ink-1)" }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="mt-2" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>Darstellung</div>
            <Row label="Referenz zeigen"><Toggle size="sm" checked={showName} onChange={setShowName} /></Row>
            <Row label="Wert zeigen"><Toggle size="sm" checked={showValue} onChange={setShowValue} /></Row>
          </div>
        </div>
      ) : selected?.type === "net" ? (
        <div className="animate-fade-in px-3.5 pb-4">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>Netz</span>
            <Badge tone="blue">{selected.id}</Badge>
          </div>
          <div className="mt-1 text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>{NET_META[selected.id]?.name}</div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{NET_META[selected.id]?.desc}</p>
          <div className="mt-3 rounded-[12px] p-3 text-center" style={{ background: "#0e1116" }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/50">Potenzial</div>
            <div key={netV(selected.id)} className="tick tabular font-mono text-[26px] font-semibold text-white">
              {netV(selected.id)}
            </div>
            {!running && <div className="mt-1 text-[11px] text-white/45">Simulation starten für Live-Werte</div>}
          </div>
          <Btn variant="secondary" size="sm" className="mt-2.5 w-full" icon={<Activity className="h-3.5 w-3.5" />}
            onClick={() => toast("Verlauf", `Messreihe für Netz ${selected.id} wird aufgezeichnet`)}>
            Verlauf aufzeichnen
          </Btn>
        </div>
      ) : (
        <div className="animate-fade-in px-3.5 pb-4">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>SCH-01</span>
            <Badge tone="green"><Check className="h-3 w-3" strokeWidth={3} /> OK</Badge>
          </div>
          <div className="mt-0.5 text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>555 Blinker</div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Astabiler Multivibrator mit NE555. Klicke ein Bauteil oder eine Leitung für Details an.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[["7", "Bauteile"], ["5", "Netze"], ["0", "Fehler"]].map(([n, l]) => (
              <div key={l} className="rounded-[10px] py-2 text-center" style={{ background: "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
                <div className="tabular text-[16px] font-bold" style={{ color: "var(--ink-1)" }}>{n}</div>
                <div className="text-[10.5px] font-medium" style={{ color: "var(--ink-3)" }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>Simulation</div>
            <SliderRow label="Zielfrequenz" value={freq} min={0.2} max={5} step={0.1} onChange={setFreq} format={(v) => `${v.toFixed(1)} Hz`} />
            <div className="mt-2.5 flex gap-1.5">
              <Btn variant={running ? "secondary" : "primary"} size="sm" className="flex-1"
                icon={running ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />} onClick={toggleRun}>
                {running ? "Stopp" : "Start"}
              </Btn>
              <Btn variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { sim.reset(); toast("Zeit zurückgesetzt", "t = 00:00,0"); }} aria-label="Zurücksetzen" />
            </div>
          </div>
          <div className="mt-2.5 flex items-start gap-2 rounded-[10px] p-2.5 text-[11.5px] leading-relaxed"
            style={{ background: "var(--warning-bg)", color: "var(--warning)", boxShadow: "inset 0 0 0 .5px color-mix(in srgb, var(--warning) 30%, transparent)" }}>
            <SlidersHorizontal className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            Tipp: Mit der Leertaste startest du die Simulation von überall.
          </div>
        </div>
      )}
    </div>
  );
}

function LiveRows({ id, sim }: { id: string; sim: SimState }) {
  const rows: Array<[string, string]> = (() => {
    switch (id) {
      case "D1": return [["IF", `${sim.ledI.toFixed(1)} mA`], ["UF", sim.high ? "2,00 V" : "0,00 V"], ["P", sim.high ? "29,2 mW" : "0 mW"]];
      case "R3": return [["I", `${sim.ledI.toFixed(1)} mA`], ["U", sim.high ? "6,72 V" : "0,00 V"], ["P", sim.high ? "98 mW" : "0 mW"]];
      case "C1": return [["UC", `${sim.capV.toFixed(2).replace(".", ",")} V`], ["I", sim.high ? "+0,19 mA" : "−0,13 mA"]];
      case "U1": return [["OUT", sim.high ? "HIGH · 8,72 V" : "LOW · 0,18 V"], ["f", `${sim.freq.toFixed(1)} Hz`], ["Tastv.", "62 %"]];
      case "R1": return [["I", sim.high ? "0,03 mA" : "0,87 mA"]];
      case "R2": return [["I", sim.high ? "+0,19 mA" : "−0,13 mA"]];
      case "V1": return [["I ges.", sim.high ? "18,4 mA" : "3,1 mA"], ["P", sim.high ? "166 mW" : "28 mW"]];
      default: return [];
    }
  })();
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-[3px] text-[12px]">
          <span className="font-mono font-semibold" style={{ color: "var(--success)" }}>{k}</span>
          <span key={v} className="tick tabular font-mono font-medium" style={{ color: "var(--ink-1)" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Instrumente ---------- */

function InstrumentPanel({ instr, sim, running, onClose, toast, toggleRun, freq, setFreq }: {
  instr: Exclude<InstrId, null>; sim: SimState; running: boolean; onClose: () => void;
  toast: (t: string, d?: string, i?: React.ReactNode) => void; toggleRun: () => void; freq: number; setFreq: (v: number) => void;
}) {
  const meta = INSTRUMENTS.find((g) => g.id === instr)!;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 px-3 hairline-b" style={{ background: "var(--panel-2)" }}>
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-white [&>svg]:h-[15px] [&>svg]:w-[15px]"
          style={{ background: "linear-gradient(180deg,#3a3a3f,#232327)" }}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold leading-tight" style={{ color: "var(--ink-1)" }}>{meta.name}</div>
          <div className="truncate text-[11px] leading-tight" style={{ color: "var(--ink-3)" }}>{meta.hint}</div>
        </div>
        {running && <span className="live-dot h-[7px] w-[7px] rounded-full bg-[#30d158]" />}
        <IconBtn size={26} onClick={onClose} aria-label="Schließen"><X className="h-3.5 w-3.5" /></IconBtn>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {instr === "scope" && <ScopeBody sim={sim} running={running} toggleRun={toggleRun} />}
        {instr === "dmm" && <DmmBody sim={sim} running={running} />}
        {instr === "psu" && <PsuBody toast={toast} />}
        {instr === "fgen" && <FgenBody toast={toast} freq={freq} setFreq={setFreq} />}
        {instr === "logic" && <LogicBody sim={sim} running={running} />}
      </div>
    </div>
  );
}

function ScopeBody({ sim, running, toggleRun }: { sim: SimState; running: boolean; toggleRun: () => void }) {
  const [ch1, setCh1] = useState(true);
  const [ch2, setCh2] = useState(true);
  const [tb, setTb] = useState("500 ms");
  return (
    <div>
      <div className="overflow-hidden rounded-[10px]" style={{ boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.12)" }}>
        <ScopeCanvas sim={sim} running={running && (ch1 || ch2)} />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={() => setCh1(!ch1)} className="pressable ring-focus flex flex-1 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold"
          style={{ background: ch1 ? "rgba(255,214,10,.14)" : "var(--panel-2)", color: ch1 ? "#9a7b00" : "var(--ink-3)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
          <Dot color="#ffd60a" glow={ch1} /> CH1 · OUT
        </button>
        <button onClick={() => setCh2(!ch2)} className="pressable ring-focus flex flex-1 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold"
          style={{ background: ch2 ? "rgba(100,210,255,.14)" : "var(--panel-2)", color: ch2 ? "#0a7d8c" : "var(--ink-3)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
          <Dot color="#64d2ff" glow={ch2} /> CH2 · CAP
        </button>
      </div>
      <div className="mt-2.5">
        <div className="mb-1 text-[11.5px] font-medium" style={{ color: "var(--ink-2)" }}>Zeitbasis</div>
        <Seg value={tb} onChange={setTb} size="sm" className="w-full"
          options={["100 ms", "500 ms", "1 s"].map((v) => ({ value: v, label: v }))} />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[
          ["f OUT", running ? `${sim.freq.toFixed(2)} Hz` : "—"],
          ["Vpp", running ? "8,54 V" : "—"],
          ["Tastv.", running ? "62 %" : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[8px] px-2 py-1.5 text-center" style={{ background: "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
            <div className="text-[10px] font-medium" style={{ color: "var(--ink-3)" }}>{k}</div>
            <div className="tabular font-mono text-[12px] font-semibold" style={{ color: "var(--ink-1)" }}>{v}</div>
          </div>
        ))}
      </div>
      <Btn variant={running ? "secondary" : "primary"} size="sm" className="mt-2.5 w-full"
        icon={running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />} onClick={toggleRun}>
        {running ? "Anhalten" : "Laufen lassen"}
      </Btn>
    </div>
  );
}

function DmmBody({ sim, running }: { sim: SimState; running: boolean }) {
  const [mode, setMode] = useState("V");
  const [hold, setHold] = useState(false);
  const [frozen, setFrozen] = useState("0,00");
  const live = mode === "V" ? sim.outV : mode === "A" ? sim.ledI / 1000 : 470;
  const shown = !running ? "− − − −" : hold ? frozen : mode === "Ω" ? "470,0" : live.toFixed(2).replace(".", ",");
  return (
    <div>
      <div className="rounded-[12px] p-3.5 text-center" style={{ background: "#0e1116", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.1)" }}>
        <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/45">
          <span>{mode === "V" ? "Gleichspannung" : mode === "A" ? "Gleichstrom" : "Widerstand"}</span>
          {hold && <span className="text-[#ffd60a]">Hold</span>}
        </div>
        <div key={shown} className="tick tabular mt-1 font-mono text-[38px] font-semibold leading-none tracking-tight text-white">
          {shown}
          <span className="ml-1 text-[16px] font-medium text-white/50">{mode === "V" ? "V" : mode === "A" ? "A" : "Ω"}</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-white/45">
          <Dot color={running ? "#30d158" : "#636366"} /> {running ? "Auto · 6000 Counts" : "Bereit — Simulation starten"}
        </div>
      </div>
      <div className="mt-2.5">
        <Seg value={mode} onChange={setMode} className="w-full"
          options={[{ value: "V", label: "V ⎓" }, { value: "A", label: "A ⎓" }, { value: "Ω", label: "Ω" }]} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Btn variant="secondary" size="sm" onClick={() => { setFrozen(live.toFixed(2).replace(".", ",")); setHold(!hold); }}>{hold ? "Weiter" : "Hold"}</Btn>
        <Btn variant="secondary" size="sm" onClick={() => {}}>Min/Max</Btn>
        <Btn variant="secondary" size="sm" onClick={() => {}}>Rel Δ</Btn>
      </div>
      <div className="mt-2.5 rounded-[10px] p-2.5 text-[11.5px] leading-relaxed" style={{ background: "var(--panel-2)", color: "var(--ink-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
        Messspitzen an <b>OUT</b> {mode === "A" ? "in Reihe mit R3" : mode === "Ω" ? "über R3" : "gegen GND"}.
      </div>
    </div>
  );
}

function PsuBody({ toast }: { toast: (t: string, d?: string, i?: React.ReactNode) => void }) {
  const [v, setV] = useState(9);
  const [i, setI] = useState(0.5);
  const [out, setOut] = useState(true);
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        {[["Spannung", `${v.toFixed(2).replace(".", ",")} V`, "#30d158"], ["Strom", out ? "0,018 A" : "0,000 A", "#ffd60a"]].map(([k, val, c]) => (
          <div key={k as string} className="rounded-[12px] p-3 text-center" style={{ background: "#0e1116" }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">{k}</div>
            <div className="tabular mt-0.5 font-mono text-[21px] font-semibold" style={{ color: c as string }}>{val}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <SliderRow label="Sollspannung" value={v} min={0} max={12} step={0.1} onChange={setV} format={(x) => `${x.toFixed(1)} V`} />
        <SliderRow label="Strombegrenzung" value={i} min={0.05} max={2} step={0.05} onChange={setI} format={(x) => `${x.toFixed(2)} A`} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[10px] px-3 py-2.5" style={{ background: out ? "var(--success-bg)" : "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
        <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
          <Dot color={out ? "#30d158" : "#aeaeb2"} glow={out} /> Ausgang {out ? "ein" : "aus"}
        </span>
        <Toggle checked={out} onChange={(x) => { setOut(x); toast(x ? "Ausgang eingeschaltet" : "Ausgang ausgeschaltet", x ? `${v.toFixed(1)} V · CC/CV Auto` : "Klemmen hochohmig"); }} />
      </div>
    </div>
  );
}

function FgenBody({ toast, freq, setFreq }: { toast: (t: string, d?: string, i?: React.ReactNode) => void; freq: number; setFreq: (v: number) => void }) {
  const [wave, setWave] = useState("sin");
  const [amp, setAmp] = useState(2.5);
  const [out, setOut] = useState(false);
  return (
    <div>
      <div className="overflow-hidden rounded-[10px] p-3" style={{ background: "#0e1116" }}>
        <svg viewBox="0 0 300 64" className="h-[64px] w-full">
          <path d={wave === "sin" ? "M0 32 C 25 32 25 6 50 6 S 75 58 100 58 S 125 6 150 6 S 175 58 200 58 S 225 6 250 6 S 275 58 300 58"
            : wave === "squ" ? "M0 52 V12 H50 V52 H100 V12 H150 V52 H200 V12 H250 V52 H300"
            : "M0 52 L25 12 L50 52 L75 12 L100 52 L125 12 L150 52 L175 12 L200 52 L225 12 L250 52 L275 12 L300 52"}
            fill="none" stroke={out ? "#ac8eff" : "#636366"} strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-white/50">
          <span>{wave === "sin" ? "Sinus" : wave === "squ" ? "Rechteck" : "Dreieck"}</span>
          <span className="tabular">{freq.toFixed(1)} Hz · {amp.toFixed(1)} Vpp</span>
        </div>
      </div>
      <div className="mt-2.5">
        <Seg value={wave} onChange={setWave} size="sm" className="w-full"
          options={[{ value: "sin", label: "Sinus" }, { value: "squ", label: "Rechteck" }, { value: "tri", label: "Dreieck" }]} />
      </div>
      <div className="mt-3 space-y-3">
        <SliderRow label="Frequenz" value={freq} min={0.2} max={5} step={0.1} onChange={setFreq} format={(x) => `${x.toFixed(1)} Hz`} />
        <SliderRow label="Amplitude" value={amp} min={0.1} max={5} step={0.1} onChange={setAmp} format={(x) => `${x.toFixed(1)} Vpp`} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[10px] px-3 py-2.5" style={{ background: "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>Ausgang aktivieren</span>
        <Toggle checked={out} onChange={(x) => { setOut(x); toast(x ? "Generator ein" : "Generator aus", x ? "Signal liegt an TRG an (Demo)" : undefined); }} color="#ac8eff" />
      </div>
    </div>
  );
}

function LogicBody({ sim, running }: { sim: SimState; running: boolean }) {
  const [rate, setRate] = useState("1 MHz");
  const bits = (ch: number) => {
    if (!running) return false;
    const n = Math.floor(sim.t * sim.freq * 4) + ch * 3;
    return ((n >> (ch % 3)) & 1) === 1 || (ch === 0 && sim.high);
  };
  return (
    <div>
      <div className="overflow-hidden rounded-[10px] p-2.5" style={{ background: "#0e1116" }}>
        {Array.from({ length: 8 }, (_, ch) => (
          <div key={ch} className="flex items-center gap-2 py-[3px]">
            <span className="w-6 font-mono text-[10.5px] font-semibold text-white/50">D{ch}</span>
            <div className="flex flex-1 gap-[3px]">
              {Array.from({ length: 24 }, (_, i) => {
                const on = running && (((Math.floor(sim.t * sim.freq * 4) - i + ch * 5) >> (ch % 3)) & 1) === 1;
                return <span key={i} className="h-[13px] flex-1 rounded-[3px]" style={{ background: on ? "#30d158" : "rgba(255,255,255,.09)", boxShadow: on ? "0 0 5px rgba(48,209,88,.5)" : "none", opacity: 1 - i * 0.03 }} />;
              })}
            </div>
            <span className="w-4 text-right font-mono text-[10.5px] font-bold" style={{ color: bits(ch) ? "#30d158" : "rgba(255,255,255,.3)" }}>{bits(ch) ? 1 : 0}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5">
        <div className="mb-1 text-[11.5px] font-medium" style={{ color: "var(--ink-2)" }}>Abtastrate</div>
        <Seg value={rate} onChange={setRate} size="sm" className="w-full"
          options={["100 kHz", "1 MHz", "10 MHz"].map((v) => ({ value: v, label: v }))} />
      </div>
      <div className="mt-2.5">
        <div className="mb-1 flex justify-between text-[11.5px] font-medium" style={{ color: "var(--ink-2)" }}>
          <span>Puffer</span><span className="tabular font-mono">{running ? "64 %" : "0 %"}</span>
        </div>
        <Progress value={running ? 64 : 0} tone="green" />
      </div>
    </div>
  );
}
