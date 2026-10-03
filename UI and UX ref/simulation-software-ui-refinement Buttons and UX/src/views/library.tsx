import React, { useEffect, useState } from "react";
import {
  Droplet, Type, Pointer, SlidersHorizontal, TextCursor, List, BadgeCheck, CircuitBoard,
  ToggleLeft, Crosshair, MessageSquare, Keyboard, Check, Copy, Sun, Moon, Command,
  Eye, Heart, Layers, Play, Trash2, Plus, ChevronDown, Search, Info, Sparkles,
} from "lucide-react";
import {
  Btn, IconBtn, Seg, Toggle, Checkbox, Radio, SliderRow, Stepper, Progress, Ring,
  Field, Badge, Dot, Kbd, Tip, MenuList, Popover, Section, Specimen, Divider, cx,
} from "../ui/kit";
import {
  SYMBOLS, SYMBOL_CATS, Kippschalter, TasterRund, DipBank, Drehschalter, Schiebeschalter, Wippschalter,
} from "../ui/symbols";
import { TrafficLights, CommandPalette, type PaletteAction } from "./studio";

/* ============================== Daten ============================== */

const NAV: Array<{ group: string; items: Array<{ id: string; label: string; icon: React.ReactNode }> }> = [
  { group: "Grundlagen", items: [
    { id: "farben", label: "Farben", icon: <Droplet /> },
    { id: "typo", label: "Typografie", icon: <Type /> },
  ]},
  { group: "Steuerelemente", items: [
    { id: "taster", label: "Taster", icon: <Pointer /> },
    { id: "segmente", label: "Segmente", icon: <Layers /> },
    { id: "schalter", label: "Schalter", icon: <ToggleLeft /> },
    { id: "regler", label: "Regler & Fortschritt", icon: <SlidersHorizontal /> },
  ]},
  { group: "Eingaben", items: [
    { id: "felder", label: "Felder & Suche", icon: <TextCursor /> },
    { id: "menues", label: "Menüs & Auswahl", icon: <List /> },
  ]},
  { group: "Anzeige", items: [
    { id: "badges", label: "Badges & Status", icon: <BadgeCheck /> },
    { id: "feedback", label: "Feedback & Leerzustände", icon: <MessageSquare /> },
  ]},
  { group: "E-CAD", items: [
    { id: "symbole", label: "Schaltsymbole", icon: <CircuitBoard /> },
    { id: "physik", label: "Schalter & Taster", icon: <ToggleLeft /> },
    { id: "sonden", label: "Sonden", icon: <Crosshair /> },
  ]},
  { group: "System", items: [
    { id: "kuerzel", label: "Tastaturkürzel", icon: <Keyboard /> },
  ]},
];

const COLORS: Array<{ name: string; hex: string; hexD: string; desc: string }> = [
  { name: "Accent", hex: "#0071E3", hexD: "#0A84FF", desc: "Primäraktionen, Auswahl, Links" },
  { name: "Success", hex: "#1E9E50", hexD: "#30D158", desc: "Prüfung ok, Läuft, Ein-Zustände" },
  { name: "Warning", hex: "#FF9F0A", hexD: "#FF9F0A", desc: "Werkzeug aktiv, Hinweise, V-Sonde" },
  { name: "Danger", hex: "#D70015", hexD: "#FF453A", desc: "Löschen, Fehler, Aufnahme" },
  { name: "Sonde A", hex: "#12A5B8", hexD: "#64D2FF", desc: "Strommessung, CAP-Kanal" },
  { name: "Violett", hex: "#A259D9", hexD: "#BF5AF2", desc: "Generator, Sonderfunktionen" },
  { name: "Leitung", hex: "#0A62D0", hexD: "#409CFF", desc: "Schaltplan-Verdrahtung" },
  { name: "Ink 1", hex: "#1D1D1F", hexD: "#F5F5F7", desc: "Primärtext" },
  { name: "Ink 2", hex: "#515154", hexD: "#B8B8BE", desc: "Sekundärtext" },
  { name: "Ink 3", hex: "#86868B", hexD: "#7C7C84", desc: "Platzhalter, Captions" },
];

/* ============================== View ============================== */

export default function LibraryView(props: {
  dark: boolean; setDark: (v: boolean) => void;
  view: "studio" | "library"; onView: (v: "studio" | "library") => void;
  toast: (title: string, desc?: string, icon?: React.ReactNode) => void;
  paletteOpen: boolean; setPaletteOpen: (v: boolean) => void;
  onTraffic: (a: string) => void;
}) {
  const { dark, setDark, toast, paletteOpen, setPaletteOpen, onTraffic } = props;
  const [active, setActive] = useState("farben");
  const [segA, setSegA] = useState("raster");
  const [segB, setSegB] = useState("v");
  const [sw, setSw] = useState({ a: true, b: false, c: true, d: false });
  const [radio, setRadio] = useState("auto");
  const [check, setCheck] = useState({ a: true, b: false });
  const [slA, setSlA] = useState(9);
  const [slB, setSlB] = useState(62);
  const [step, setStep] = useState(1.4);
  const [prog, setProg] = useState(0);
  const [progRun, setProgRun] = useState(false);
  const [fName, setFName] = useState("555 Blinker");
  const [fVcc, setFVcc] = useState("9");
  const [fSearch, setFSearch] = useState("");
  const [m1, setM1] = useState(false);
  const [m2, setM2] = useState(false);
  const [selVal, setSelVal] = useState("0603");
  const [loading, setLoading] = useState(false);
  const [presses, setPresses] = useState(0);
  const [symQ, setSymQ] = useState("");

  useEffect(() => {
    if (!progRun) return;
    setProg(0);
    const id = setInterval(() => {
      setProg((p) => {
        if (p >= 100) { clearInterval(id); setProgRun(false); toast("Analyse abgeschlossen", "Transiente 0 – 10 s · 4.210 Zeitschritte", <Check className="h-4 w-4" />); return 100; }
        return p + 4;
      });
    }, 60);
    return () => clearInterval(id);
  }, [progRun, toast]);

  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copy = async (hex: string, name: string) => {
    try { await navigator.clipboard.writeText(hex); } catch { /* ignore */ }
    toast("Kopiert", `${name} · ${hex}`, <Copy className="h-4 w-4" />);
  };

  const actions: PaletteAction[] = NAV.flatMap((g) =>
    g.items.map((it) => ({ icon: it.icon, label: it.label, group: g.group, run: () => go(it.id) }))
  );

  const symFiltered = SYMBOLS.filter((s) => !symQ.trim() || (s.name + s.cat).toLowerCase().includes(symQ.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      {/* Kopf */}
      <div className="glass-bar flex h-[38px] shrink-0 items-center gap-2 px-2 hairline-b">
        <TrafficLights onAction={onTraffic} />
        <div className="mx-1 h-[18px] w-px" style={{ background: "var(--hair)" }} />
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
          <CircuitBoard className="h-[15px] w-[15px]" style={{ color: "var(--accent-ink)" }} /> UI-Library
        </span>
        <Badge tone="gray">v2.4</Badge>
        <div className="flex-1" />
        <Seg value={props.view} onChange={props.onView} size="sm" ariaLabel="Bereich"
          options={[{ value: "studio", label: "Studio" }, { value: "library", label: "Library" }]} />
        <div className="mx-1 h-[18px] w-px" style={{ background: "var(--hair)" }} />
        <Tip label="Befehle suchen" shortcut="⌘K">
          <IconBtn size={28} onClick={() => setPaletteOpen(true)}><Command className="h-[15px] w-[15px]" /></IconBtn>
        </Tip>
        <Tip label={dark ? "Helle Darstellung" : "Dunkle Darstellung"}>
          <IconBtn size={28} onClick={() => setDark(!dark)}>{dark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}</IconBtn>
        </Tip>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Navigation */}
        <aside className="scroll-thin hidden w-[218px] shrink-0 overflow-y-auto p-2.5 md:block hairline-r" style={{ background: "var(--bar-solid)" }}>
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} onClick={() => go(it.id)}
                  className="pressable ring-focus flex w-full items-center gap-2 rounded-[8px] px-2 py-[6px] text-left text-[12.5px] font-medium"
                  style={{
                    background: active === it.id ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                    color: active === it.id ? "var(--accent-ink)" : "var(--ink-2)",
                  }}>
                  <span className="[&>svg]:h-[15px] [&>svg]:w-[15px]">{it.icon}</span>
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Inhalt */}
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--w-bg)" }}>
          <div className="mx-auto max-w-[960px] space-y-10 px-5 pb-16 pt-7">
            {/* Hero */}
            <header className="animate-rise">
              <div className="flex items-center gap-2">
                <Badge tone="blue"><Sparkles className="h-3 w-3" /> Interface Guidelines</Badge>
                <Badge tone="gray">Apple HIG-nah</Badge>
              </div>
              <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.025em]" style={{ color: "var(--ink-1)" }}>
                Baukasten für präzise<br />Schaltungssoftware.
              </h1>
              <p className="mt-2 max-w-[620px] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Jede Komponente dieser Library ist live: Schalter schalten, Regler regeln, Menüs öffnen sich.
                So fühlt sich an, was im Studio zum Einsatz kommt — bis ins letzte Pixel durchdacht.
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {[
                  { i: <Eye />, t: "Klarheit", d: "Eine Hierarchie, eine Aktion, kein Rauschen." },
                  { i: <Heart />, t: "Sorgfalt", d: "0,5-pt-Hairlines, echte Federn, ruhige Motion." },
                  { i: <Layers />, t: "Tiefe", d: "Vibrancy & Ebenen statt harter Kästen." },
                ].map((p) => (
                  <div key={p.t} className="flex gap-2.5 rounded-[12px] p-3"
                    style={{ background: "var(--panel)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
                    <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] text-white [&>svg]:h-[15px] [&>svg]:w-[15px]"
                      style={{ background: "linear-gradient(180deg,#0a7aff,#0063d1)" }}>{p.i}</span>
                    <span>
                      <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{p.t}</span>
                      <span className="block text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>{p.d}</span>
                    </span>
                  </div>
                ))}
              </div>
            </header>

            {/* FARBEN */}
            <Section id="farben" eyebrow="Grundlagen" title="Farben"
              desc="Semantische Tokens, keine Hex-Werte im Code. Jede Farbe existiert für Hell und Dunkel — anklicken kopiert den Wert.">
              <Specimen title="Semantik" desc="Bedeutung schlägt Dekoration: Jede Farbe hat genau einen Job.">
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {COLORS.map((c) => {
                    const hex = dark ? c.hexD : c.hex;
                    return (
                      <button key={c.name} onClick={() => copy(hex, c.name)}
                        className="pressable ring-focus group flex items-center gap-2.5 rounded-[10px] p-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                        <span className="h-[38px] w-[38px] shrink-0 rounded-[10px]"
                          style={{ background: hex, boxShadow: `inset 0 0 0 .5px rgba(0,0,0,.15), 0 2px 6px ${hex}44` }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{c.name}</span>
                          <span className="block truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>{c.desc}</span>
                        </span>
                        <span className="tabular font-mono text-[11px] font-medium" style={{ color: "var(--ink-2)" }}>{hex}</span>
                        <Copy className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" style={{ color: "var(--ink-3)" }} />
                      </button>
                    );
                  })}
                </div>
              </Specimen>
            </Section>

            {/* TYPO */}
            <Section id="typo" eyebrow="Grundlagen" title="Typografie"
              desc="Inter mit optischer Größe, −2 % Laufweite in Titeln, tabulare Ziffern für alle Messwerte.">
              <Specimen title="Skala" wide>
                {[
                  ["Titel · 21 / semibold / −2 %", "text-[21px] font-semibold tracking-[-0.02em]", "Oszilloskop"],
                  ["Überschrift · 15 / semibold", "text-[15px] font-semibold", "555 Blinker"],
                  ["Fließtext · 13 / regular", "text-[13px]", "Der astabile Multivibrator erzeugt ein Rechtecksignal."],
                  ["Beschriftung · 12 / medium", "text-[12px] font-medium", "Zielfrequenz"],
                  ["Caption · 11 / caps", "text-[11px] font-semibold uppercase tracking-[0.07em]", "Informationen"],
                ].map(([cap, cls, txt]) => (
                  <div key={cap as string} className="flex items-baseline justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0" style={{ borderColor: "var(--hair)" }}>
                    <span className={cx("truncate", cls as string)} style={{ color: "var(--ink-1)" }}>{txt}</span>
                    <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>{cap}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4">
                  <span className="tabular font-mono text-[15px] font-semibold" style={{ color: "var(--ink-1)" }}>8,72 V · 14,6 mA · 00:12,4</span>
                  <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>Mono tabular · Messwerte</span>
                </div>
              </Specimen>
            </Section>

            {/* TASTER */}
            <Section id="taster" eyebrow="Steuerelemente" title="Taster"
              desc="Sechs Varianten, drei Größen. Primär hat Verlauf, Innenlicht und Tastenschatten — beim Drücken skaliert alles auf 96 %.">
              <Specimen title="Varianten & Größen">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="primary" icon={<Play className="h-3.5 w-3.5 fill-current" />} onClick={() => toast("Start", "Primäraktion ausgelöst")}>Start</Btn>
                    <Btn variant="secondary" onClick={() => toast("Gesichert", undefined, <Check className="h-4 w-4" />)}>Sichern</Btn>
                    <Btn variant="tertiary" onClick={() => toast("Mehr", "Tertiär für untergeordnete Aktionen")}>Details …</Btn>
                    <Btn variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => toast("Hinzufügen", "Geist-Taster für Symbolleisten")}>Neu</Btn>
                    <Btn variant="destructive" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => toast("Gelöscht", "Destruktiv — immer mit Bedacht", <Trash2 className="h-4 w-4" />)}>Löschen</Btn>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="primary" size="sm">Klein</Btn>
                    <Btn variant="primary" size="md">Mittel</Btn>
                    <Btn variant="primary" size="lg">Groß</Btn>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="primary" loading={loading} onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); toast("Fertig", "Ladevorgang abgeschlossen", <Check className="h-4 w-4" />); }, 1400); }}>
                      {loading ? "Analysiert …" : "Analyse starten"}
                    </Btn>
                    <Btn variant="secondary" disabled>Deaktiviert</Btn>
                    <Btn variant="secondary" icon={<ChevronDown className="h-3.5 w-3.5" />} trailing={undefined} onClick={() => toast("Menü", "Taster mit Menü öffnen das Popover")}>Exportieren</Btn>
                  </div>
                </div>
              </Specimen>
              <Specimen title="Symboltaster" desc="30-pt-Raster, 8-pt-Radius, Tooltip mit Kürzel. Aktiv: Orange für Werkzeuge, Blau für Ansichten.">
                <Tip label="Auswählen" shortcut="V"><IconBtn active accent><Pointer className="h-[15px] w-[15px]" /></IconBtn></Tip>
                <Tip label="Bibliothek" shortcut="⌘B"><IconBtn active><Layers className="h-[15px] w-[15px]" /></IconBtn></Tip>
                <Tip label="Suchen" shortcut="⌘K"><IconBtn><Search className="h-[15px] w-[15px]" /></IconBtn></Tip>
                <Tip label="Einstellungen"><IconBtn><Info className="h-[15px] w-[15px]" /></IconBtn></Tip>
                <IconBtn disabled><Plus className="h-[15px] w-[15px]" /></IconBtn>
              </Specimen>
            </Section>

            {/* SEGMENTE */}
            <Section id="segmente" eyebrow="Steuerelemente" title="Segmentsteuerung"
              desc="Der Apple-Klassiker für 2–5 exklusive Optionen. Der Daumen gleitet federnd, die Auswahl bleibt lesbar.">
              <Specimen title="Live-Beispiele">
                <div className="flex w-full flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium" style={{ color: "var(--ink-2)" }}>Arbeitsfläche</span>
                    <Seg value={segA} onChange={setSegA} options={[{ value: "raster", label: "Raster" }, { value: "frei", label: "Frei" }, { value: "liste", label: "Liste" }]} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium" style={{ color: "var(--ink-2)" }}>Multimeter</span>
                    <Seg value={segB} onChange={setSegB} options={[{ value: "v", label: "V ⎓" }, { value: "a", label: "A ⎓" }, { value: "o", label: "Ω" }]} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium" style={{ color: "var(--ink-2)" }}>Kompakt</span>
                    <Seg value={segA} onChange={setSegA} size="sm" options={[{ value: "raster", label: "Studio" }, { value: "frei", label: "Library" }]} />
                  </div>
                </div>
              </Specimen>
            </Section>

            {/* SCHALTER */}
            <Section id="schalter" eyebrow="Steuerelemente" title="Schalter, Boxen & Radios"
              desc="iOS-Schalter mit Federknopf, Boxen mit gezeichnetem Häkchen, Radios mit aufpoppendem Punkt.">
              <Specimen title="Schalter" desc="Grün = System an/aus, Blau = Funktion, Violett = Sonderkanal.">
                <div className="flex items-center gap-2.5">
                  <Toggle checked={sw.a} onChange={(v) => setSw({ ...sw, a: v })} />
                  <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>Simulation {sw.a ? "ein" : "aus"}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Toggle checked={sw.b} onChange={(v) => setSw({ ...sw, b: v })} color="var(--accent)" />
                  <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>Fangen</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Toggle checked={sw.c} onChange={(v) => setSw({ ...sw, c: v })} size="sm" />
                  <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>Kompakt</span>
                </div>
                <div className="flex items-center gap-2.5 opacity-60">
                  <Toggle checked={true} onChange={() => {}} disabled />
                  <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>Deaktiviert</span>
                </div>
              </Specimen>
              <Specimen title="Checkbox & Radio" desc="Gemischt-Zustand für Teilauswahl, Tastatur: Leertaste schaltet.">
                <div className="flex flex-col gap-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-1)" }}>
                    <Checkbox checked={check.a} onChange={(v) => setCheck({ ...check, a: v })} /> Raster anzeigen
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-1)" }}>
                    <Checkbox checked={check.b} onChange={(v) => setCheck({ ...check, b: v })} /> Beschriftungen
                  </label>
                  <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-1)" }}>
                    <Checkbox checked={false} indeterminate onChange={() => toast("Teilauswahl", "2 von 5 Ebenen aktiv")} /> Ebenen (teilweise)
                  </span>
                </div>
                <Divider className="h-[72px]" />
                <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Messbereich">
                  {[["auto", "Automatisch"], ["man", "Manuell"], ["ext", "Extern getaktet"]].map(([v, l]) => (
                    <button key={v} onClick={() => setRadio(v)} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-1)" }}>
                      <Radio checked={radio === v} onChange={() => setRadio(v)} /> {l}
                    </button>
                  ))}
                </div>
              </Specimen>
            </Section>

            {/* REGLER */}
            <Section id="regler" eyebrow="Steuerelemente" title="Regler & Fortschritt"
              desc="Schieberegler mit Live-Wert, Stepper für exakte Schritte, Balken und Ringe für Prozesse.">
              <Specimen title="Schieberegler & Stepper" wide>
                <div className="grid w-full gap-x-8 gap-y-4 md:grid-cols-2">
                  <SliderRow label="Versorgungsspannung" value={slA} min={0} max={12} step={0.1} onChange={setSlA} format={(v) => `${v.toFixed(1)} V`} />
                  <SliderRow label="Tastverhältnis" value={slB} min={1} max={99} onChange={setSlB} format={(v) => `${Math.round(v)} %`} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>Frequenz</span>
                    <Stepper value={step} min={0.2} max={5} step={0.1} onChange={setStep} format={(v) => `${v.toFixed(1)} Hz`} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>Dezimalstellen</span>
                    <Stepper value={2} onChange={() => {}} min={0} max={6} size="sm" />
                  </div>
                </div>
              </Specimen>
              <Specimen title="Fortschritt" desc="Startet eine echte 4-Sekunden-Sequenz mit Abschluss-Toast.">
                <div className="flex w-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Progress value={prog} className="flex-1" />
                    <span className="tabular w-10 text-right font-mono text-[11.5px] font-medium" style={{ color: "var(--ink-2)" }}>{Math.round(prog)} %</span>
                  </div>
                  <Progress value={68} tone="green" />
                  <div className="flex items-center gap-4">
                    <Ring value={prog} size={52}><span className="tabular font-mono text-[10px] font-bold" style={{ color: "var(--ink-1)" }}>{Math.round(prog)}</span></Ring>
                    <Ring value={82} size={52} tone="green"><Check className="h-4 w-4" style={{ color: "var(--success)" }} strokeWidth={3} /></Ring>
                    <Ring value={34} size={52} tone="orange"><span className="tabular font-mono text-[10px] font-bold" style={{ color: "var(--ink-1)" }}>⅓</span></Ring>
                    <Btn variant="secondary" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => setProgRun(true)} disabled={progRun}>
                      {progRun ? "Läuft …" : "Sequenz starten"}
                    </Btn>
                  </div>
                </div>
              </Specimen>
            </Section>

            {/* FELDER */}
            <Section id="felder" eyebrow="Eingaben" title="Felder & Suche"
              desc="30-pt-Höhe, 8-pt-Radius, Fokus mit 2-pt-Accent plus Halo. Fehler erklären sich selbst — hier: über 12 V.">
              <Specimen title="Textfelder" wide>
                <div className="grid w-full gap-3 md:grid-cols-2">
                  <Field label="Schaltungsname" value={fName} onChange={setFName} placeholder="Name eingeben" />
                  <Field label="Versorgung" value={fVcc} onChange={setFVcc} suffix="V DC" mono
                    error={Number(fVcc) > 12 ? "NE555 verträgt maximal 16 V — 12 V empfohlen." : undefined} />
                  <Field label="Suchen" value={fSearch} onChange={setFSearch} placeholder="Bauteil, Netz, Befehl …"
                    icon={<Search className="h-3.5 w-3.5" />} suffix={<Kbd>⌘K</Kbd>} />
                  <Field label="Referenz" value="R3" onChange={() => {}} icon={<Info className="h-3.5 w-3.5" />} />
                </div>
              </Specimen>
            </Section>

            {/* MENÜS */}
            <Section id="menues" eyebrow="Eingaben" title="Menüs & Auswahl"
              desc="Vibrancy-Popover mit 12-pt-Radius: Check-Spalte, Shortcuts rechts, Danger in Rot. Hover färbt die Zeile accent.">
              <Specimen title="Menütaster & Dropdowns">
                <div className="relative">
                  <Btn variant="secondary" onClick={() => setM1(!m1)} trailing={<ChevronDown className="h-3.5 w-3.5" />}>Exportieren</Btn>
                  <Popover open={m1} onClose={() => setM1(false)} width={240}>
                    <MenuList onClose={() => setM1(false)} items={[
                      { header: "Dokument" },
                      { label: "Als PDF", shortcut: "⌘P", onSelect: () => toast("Export", "Schaltplan.pdf · Vektor, 300 dpi") },
                      { label: "Als PNG", shortcut: "⇧⌘P", checked: true, onSelect: () => toast("Export", "Schaltplan.png · 2× Retina") },
                      { label: "Als SVG", onSelect: () => toast("Export", "Schaltplan.svg") },
                      { divider: true },
                      { label: "Netzliste (SPICE)", badge: ".cir", onSelect: () => toast("Export", "Netzliste mit 7 Bauteilen erzeugt") },
                    ]} />
                  </Popover>
                </div>
                <div className="relative">
                  <button onClick={() => setM2(!m2)}
                    className="pressable ring-focus flex h-[30px] items-center gap-2 rounded-[8px] px-3 text-[12.5px] font-medium btn-secondary"
                    style={{ color: "var(--ink-1)" }}>
                    Bauform: <b>{selVal}</b> <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                  <Popover open={m2} onClose={() => setM2(false)} width={210}>
                    <MenuList onClose={() => setM2(false)} items={["0402", "0603", "0805", "1206"].map((b) => ({
                      label: b, checked: selVal === b, onSelect: () => { setSelVal(b); toast("Bauform", `${b} für alle Widerstände`); },
                    }))} />
                  </Popover>
                </div>
                <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  <Kbd>⌘</Kbd><Kbd>K</Kbd> öffnet die Befehlspalette
                </div>
              </Specimen>
            </Section>

            {/* BADGES */}
            <Section id="badges" eyebrow="Anzeige" title="Badges & Status"
              desc="Pillen für Zustände, Punkte für Live-Signale. Pulsierende Punkte nur dort, wo wirklich etwas lebt.">
              <Specimen title="Badges" desc="Sechs Töne, ein Radius, semibold 11 pt.">
                <Badge tone="gray">Entwurf</Badge>
                <Badge tone="green"><Check className="h-3 w-3" strokeWidth={3} /> Prüfung ok</Badge>
                <Badge tone="blue">Simuliert</Badge>
                <Badge tone="orange">Werkzeug aktiv</Badge>
                <Badge tone="red">2 Fehler</Badge>
                <Badge tone="purple">Pro</Badge>
                <Badge tone="green" pulse>Läuft</Badge>
                <Badge tone="red" pulse>Aufnahme</Badge>
              </Specimen>
              <Specimen title="Statuspunkte" desc="8-pt-Durchmesser, Glow nur im Live-Kontext.">
                <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}><Dot color="#30d158" glow /> Bereit</span>
                <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}><Dot color="#ff9f0a" glow /> Warnung</span>
                <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}><Dot color="#ff453a" /> Fehler</span>
                <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}><Dot color="#aeaeb2" /> Inaktiv</span>
                <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}><Dot color="#409cff" /> Info</span>
              </Specimen>
            </Section>

            {/* SYMBOLE */}
            <Section id="symbole" eyebrow="E-CAD" title={`Schaltsymbole · ${SYMBOLS.length}`}
              desc="Einheitliches 40er-Raster, 1,8-pt-Linie, runde Kappen. IEC-Rechteck als Standard, US-Zickzack als Alternative.">
              <Specimen title="Alle Zeichen" desc="Anklicken zeigt Verwendung — Suche filtert live." wide>
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
                  <input value={symQ} onChange={(e) => setSymQ(e.target.value)} placeholder={`${SYMBOLS.length} Symbole filtern …`}
                    className="ring-focus h-[30px] w-full rounded-[8px] pl-8 pr-3 text-[12.5px] outline-none"
                    style={{ background: "var(--panel)", color: "var(--ink-1)", boxShadow: "inset 0 0 0 .5px var(--hair)" }} />
                </div>
                {SYMBOL_CATS.map((cat) => {
                  const items = symFiltered.filter((s) => s.cat === cat);
                  if (!items.length) return null;
                  return (
                    <div key={cat} className="w-full">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--ink-3)" }}>{cat}</span>
                        <span className="tabular font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>{items.length}</span>
                        <span className="h-px flex-1" style={{ background: "var(--hair)" }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                        {items.map((s) => (
                          <button key={s.id} onClick={() => toast(s.name, `${s.cat} · ${s.key ? `Kürzel ${s.key}` : "Kein Kürzel"}`)}
                            className="pressable-subtle ring-focus group flex flex-col items-center gap-1 rounded-[10px] px-1 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                            <span className="h-[40px] w-[40px] transition-transform duration-150 group-hover:scale-110" style={{ color: "var(--ink-1)" }}>
                              <s.C />
                            </span>
                            <span className="w-full truncate text-center text-[10.5px] font-medium leading-tight" style={{ color: "var(--ink-2)" }}>{s.name}</span>
                            {s.key && <Kbd>{s.key}</Kbd>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Specimen>
            </Section>

            {/* PHYSIKALISCHE SCHALTER */}
            <Section id="physik" eyebrow="E-CAD" title="Schalter & Taster"
              desc="Bedienelemente mit echter Haptik: Federn, Raststufen, Druckpunkte. Der Taster zählt jede Betätigung.">
              <Specimen title="Bedienpanel" desc="Alle Elemente sind voll funktionsfähig — ausprobieren ausdrücklich erwünscht.">
                <div className="flex flex-col items-center gap-2">
                  <Kippschalter />
                  <span className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>Kippschalter</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <TasterRund onPress={() => setPresses((p) => p + 1)} />
                  <span className="tabular text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>Taster · {presses}×</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <DipBank n={4} />
                  <span className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>DIP-Bank</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Drehschalter />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Schiebeschalter />
                  <span className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>Schiebeschalter</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Wippschalter />
                  <span className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>Wippe I/O</span>
                </div>
              </Specimen>
            </Section>

            {/* SONDEN */}
            <Section id="sonden" eyebrow="E-CAD" title="Sonden"
              desc="Farbkodiert und unverwechselbar: Orange misst Spannung, Petrol misst Strom.">
              <Specimen title="Messsonden" wide>
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {[
                    { n: "V-Sonde", d: "Potenzial gegen GND · hochohmig", k: "⇧V", el: <span className="h-[34px] w-[34px]"><svg viewBox="0 0 40 40" className="h-full w-full"><circle cx="20" cy="20" r="12" fill="#ff9f0a" /><text x="20" y="21.5" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight={700} fill="#fff" fontFamily="Inter">V</text></svg></span> },
                    { n: "A-Sonde", d: "Strom in Reihe · True-RMS", k: "⇧A", el: <span className="h-[34px] w-[34px]"><svg viewBox="0 0 40 40" className="h-full w-full"><circle cx="20" cy="20" r="12" fill="#12a5b8" /><text x="20" y="21.5" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight={700} fill="#fff" fontFamily="Inter">A</text></svg></span> },
                    { n: "Differenzsonde", d: "Zwei Knoten, ein Verlauf", k: "⇧D", el: <Dot color="#a259d9" size={22} /> },
                    { n: "Logiksonde", d: "8 Kanäle · 10 MHz", k: "⇧L", el: <Dot color="#30d158" size={22} /> },
                  ].map((p) => (
                    <button key={p.n} onClick={() => toast(p.n, p.d)}
                      className="pressable ring-focus flex items-center gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                      {p.el}
                      <span className="flex-1">
                        <span className="block text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{p.n}</span>
                        <span className="block text-[11.5px]" style={{ color: "var(--ink-3)" }}>{p.d}</span>
                      </span>
                      <Kbd>{p.k}</Kbd>
                    </button>
                  ))}
                </div>
              </Specimen>
            </Section>

            {/* FEEDBACK */}
            <Section id="feedback" eyebrow="Anzeige" title="Feedback & Leerzustände"
              desc="Toasts erscheinen unten mittig, stapeln sich und verschwinden von selbst. Leerzustände erklären den nächsten Schritt.">
              <Specimen title="Toasts" desc="Drei Töne — live auslösen:">
                <Btn variant="secondary" size="sm" onClick={() => toast("Gesichert", "Alle Änderungen sind gespeichert", <Check className="h-4 w-4" />)}>Erfolg</Btn>
                <Btn variant="secondary" size="sm" onClick={() => toast("Exportieren", "Schaltplan.pdf wird erzeugt …", <Info className="h-4 w-4" />)}>Info</Btn>
                <Btn variant="secondary" size="sm" onClick={() => toast("ERC: 2 Warnungen", "Netz N/C an U1·5 unbeschaltet", <Info className="h-4 w-4" />)}>Warnung</Btn>
              </Specimen>
            </Section>

            {/* KÜRZEL */}
            <Section id="kuerzel" eyebrow="System" title="Tastaturkürzel"
              desc="Jede Kernaktion ist tastaturfähig. Diese Tabelle ist die verbindliche Referenz.">
              <Specimen title="Referenz" wide>
                <div className="grid w-full gap-x-10 gap-y-0 md:grid-cols-2">
                  {[
                    ["Simulation Start/Stopp", ["Leertaste"]], ["Befehlspalette", ["⌘", "K"]],
                    ["Auswählen / Leitung / Text", ["V", "W", "T"]], ["Bibliothek", ["⌘", "B"]],
                    ["Sichern", ["⌘", "S"]], ["Duplizieren", ["⌘", "D"]],
                    ["Rückgängig", ["⌘", "Z"]], ["V-Sonde / A-Sonde", ["⇧V", "⇧A"]],
                    ["Einpassen", ["⌘", "0"]], ["Abbrechen / Schließen", ["esc"]],
                  ].map(([label, keys]) => (
                    <div key={label as string} className="flex items-center justify-between border-b py-2 last:border-0" style={{ borderColor: "var(--hair)" }}>
                      <span className="text-[12.5px]" style={{ color: "var(--ink-1)" }}>{label}</span>
                      <span className="flex gap-1">{(keys as string[]).map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                    </div>
                  ))}
                </div>
              </Specimen>
            </Section>

            <footer className="flex items-center justify-between pt-2 text-[11.5px]" style={{ color: "var(--ink-4)" }}>
              <span>SimStudio Interface Guidelines · v2.4 · Build 8142</span>
              <span>Mit Liebe zum Detail gefertigt.</span>
            </footer>
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />
    </div>
  );
}
