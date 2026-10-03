import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Icon, ICON_GROUPS, type IconName } from "../ui/icons";
import {
  Badge, Button, Checkbox, Disclosure, DocumentTabs, Field, IconButton, Kbd, MenuList, Popover, ProgressBar, RadioGroup,
  Segmented, Select, Shortcut, Slider, Spinner, Stepper, Switch, TextField, ToolButton, ToolGroup, Tooltip, useToast,
} from "../ui/primitives";

const SECTIONS = [
  { id: "prinzipien", label: "Prinzipien" },
  { id: "farben", label: "Farben" },
  { id: "typografie", label: "Typografie" },
  { id: "icons", label: "Icons" },
  { id: "buttons", label: "Buttons" },
  { id: "toggles", label: "Schalter" },
  { id: "inputs", label: "Eingaben" },
  { id: "menus", label: "Menüs & Popover" },
  { id: "feedback", label: "Feedback" },
  { id: "navigation", label: "Navigation" },
];

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {lead && <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">{lead}</p>}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Card({ title, children, className, note }: { title?: string; children: ReactNode; className?: string; note?: string }) {
  return (
    <div className={cn("rounded-[14px] bg-surface shadow-1 ring-1 ring-black/[0.03] dark:ring-white/[0.04]", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="text-[12px] font-semibold tracking-[0.02em] text-ink-2 uppercase">{title}</span>
          {note && <span className="text-[11.5px] text-ink-3">{note}</span>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>;
}

const SWATCHES: { name: string; v: string; text?: boolean }[] = [
  { name: "Accent", v: "var(--accent)" },
  { name: "Green", v: "var(--green)" },
  { name: "Red", v: "var(--red)" },
  { name: "Orange", v: "var(--orange)" },
  { name: "Yellow", v: "var(--yellow)" },
  { name: "Teal", v: "var(--teal)" },
  { name: "Purple", v: "var(--purple)" },
  { name: "Wire", v: "var(--wire)" },
];
const NEUTRALS: { name: string; v: string }[] = [
  { name: "App", v: "var(--app)" },
  { name: "Surface", v: "var(--surface)" },
  { name: "Surface 2", v: "var(--surface-2)" },
  { name: "Surface 3", v: "var(--surface-3)" },
  { name: "Canvas", v: "var(--canvas)" },
  { name: "Ink", v: "var(--ink)" },
  { name: "Ink 2", v: "var(--ink-2)" },
  { name: "Ink 3", v: "var(--ink-3)" },
  { name: "Ink 4", v: "var(--ink-4)" },
];

export function DesignSystem() {
  const { push } = useToast();
  const [active, setActive] = useState(SECTIONS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // state for demos
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [cb1, setCb1] = useState(true);
  const [cb2, setCb2] = useState(false);
  const [radio, setRadio] = useState("tran");
  const [seg, setSeg] = useState("a");
  const [seg2, setSeg2] = useState("grid");
  const [slider, setSlider] = useState(42);
  const [stepper, setStepper] = useState(4.7);
  const [text, setText] = useState("");
  const [sel, setSel] = useState("1n4148");
  const [tool, setTool] = useState("cursor");
  const [pop, setPop] = useState(false);
  const [tab, setTab] = useState("a");
  const [progress, setProgress] = useState(35);
  const [iconQ, setIconQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p >= 100 ? 0 : p + 7)), 900);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyIcon = (n: IconName) => {
    navigator.clipboard?.writeText(`<Icon name="${n}" />`).catch(() => {});
    setCopied(n);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Side nav */}
      <nav className="material flex w-[220px] shrink-0 flex-col border-r border-hairline p-3">
        <div className="mb-3 px-2 pt-1">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">UI-Kit</div>
          <div className="text-[12px] text-ink-3">Circuit Design System · v1.0</div>
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className={cn(
              "focus-ring flex h-[30px] items-center rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
              active === s.id ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="rounded-[10px] bg-surface p-3 text-[12px] leading-relaxed text-ink-2 shadow-1 dark:bg-surface-3">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
            <Icon name="sparkle" size={13} className="text-accent" />
            Hinweis
          </div>
          Alle Komponenten reagieren auf Tastatur, Hover und Fokus. Erscheinungsbild über das Mond-/Sonnen-Symbol wechseln.
        </div>
      </nav>

      {/* Content */}
      <div ref={scrollRef} className="scroll-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[980px] flex-col gap-14 px-10 py-10">
          <Section id="prinzipien" title="Prinzipien" lead="Das Kit folgt den Apple Human Interface Guidelines: Klarheit, Zurückhaltung und Tiefe. Inhalt steht im Vordergrund, Chrome tritt zurück.">
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: "ruler" as IconName, t: "4-pt-Raster", d: "Alle Maße liegen auf einem 4-pt-Raster; Steuerelemente sind 24/28/32 pt hoch." },
                { icon: "layers" as IconName, t: "Materialien", d: "Chrome nutzt transluzente Materialien mit Blur; Inhalt bleibt opak und ruhig." },
                { icon: "bolt" as IconName, t: "Direktes Feedback", d: "Jede Interaktion antwortet in ≤ 150 ms: Hover, Press-Scale, Fokusring, Tooltips." },
                { icon: "swatch" as IconName, t: "Semantische Farben", d: "Blau = Auswahl/Aktion, Grün = läuft/ok, Rot = destruktiv, Orange/Teal = Sondenarten." },
                { icon: "keyboard" as IconName, t: "Tastatur zuerst", d: "Kurzbefehle in jedem Tooltip und Menü; Fokus nur für Tastaturnutzer sichtbar." },
                { icon: "sun" as IconName, t: "Hell & Dunkel", d: "Ein Token-Set, zwei Erscheinungsbilder — ohne Komponentenänderungen." },
              ].map((p) => (
                <div key={p.t} className="rounded-[14px] bg-surface p-5 shadow-1">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <div className="mt-3 text-[14px] font-semibold text-ink">{p.t}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{p.d}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="farben" title="Farben" lead="Alle Farben sind CSS-Variablen. Semantische Töne bleiben in Hell und Dunkel erkennbar; Neutraltöne definieren die Hierarchie.">
            <Card title="Semantisch">
              <div className="grid grid-cols-8 gap-3">
                {SWATCHES.map((s) => (
                  <div key={s.name} className="flex flex-col gap-1.5">
                    <div className="h-14 rounded-[10px] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.08)]" style={{ background: s.v }} />
                    <div className="text-[12px] font-medium text-ink">{s.name}</div>
                    <div className="font-mono text-[10.5px] text-ink-3">{s.v.replace("var(", "").replace(")", "")}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Neutral & Flächen">
              <div className="grid grid-cols-9 gap-3">
                {NEUTRALS.map((s) => (
                  <div key={s.name} className="flex flex-col gap-1.5">
                    <div className="h-14 rounded-[10px] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.1)]" style={{ background: s.v }} />
                    <div className="text-[12px] font-medium text-ink">{s.name}</div>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Section id="typografie" title="Typografie" lead="System-Schrift (SF Pro / Inter-Fallback) mit engem Tracking für Titel. Zahlen in Messwerten sind tabellarisch (tnum) und monospaced.">
            <Card>
              <div className="flex flex-col divide-y divide-hairline">
                {[
                  { l: "Large Title", c: "text-[28px] font-bold tracking-[-0.025em]", t: "555 Blinker" },
                  { l: "Title", c: "text-[20px] font-semibold tracking-[-0.02em]", t: "Astabiler Multivibrator" },
                  { l: "Headline", c: "text-[14px] font-semibold", t: "Bauteil-Eigenschaften" },
                  { l: "Body", c: "text-[13px]", t: "Der Kondensator lädt sich über R1 und R2 auf 2⁄3 Vcc auf." },
                  { l: "Caption", c: "text-[11.5px] text-ink-2", t: "Toleranz ±1 %, Metallschicht" },
                  { l: "Mono / Readout", c: "font-mono text-[13px] tnum", t: "f = 1,385 Hz · T = 722 ms · D = 54,8 %" },
                ].map((r) => (
                  <div key={r.l} className="grid grid-cols-[140px_1fr] items-baseline py-3">
                    <span className="text-[11.5px] text-ink-3">{r.l}</span>
                    <span className={cn("text-ink", r.c)}>{r.t}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Section id="icons" title="Icons" lead="Eigenes Set auf 24-pt-Raster mit 1,6 pt Strichstärke und runden Enden — optisch ausgeglichen wie SF Symbols. Klick kopiert den JSX-Aufruf.">
            <TextField icon="search" placeholder="Icons filtern …" value={iconQ} onChange={(e) => setIconQ(e.target.value)} onClear={() => setIconQ("")} className="max-w-[320px]" />
            {ICON_GROUPS.map((g) => {
              const list = g.icons.filter((n) => n.toLowerCase().includes(iconQ.toLowerCase()));
              if (!list.length) return null;
              return (
                <Card key={g.title} title={g.title} note={`${list.length} Symbole`}>
                  <div className="grid grid-cols-10 gap-1.5">
                    {list.map((n) => (
                      <Tooltip key={n} label={copied === n ? "Kopiert ✓" : n} delay={200}>
                        <button
                          type="button"
                          onClick={() => copyIcon(n)}
                          className="press focus-ring flex h-[72px] w-full flex-col items-center justify-center gap-2 rounded-[10px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
                        >
                          <Icon name={n} size={22} strokeWidth={1.5} />
                          <span className="max-w-full truncate px-1 text-[10px] text-ink-3">{n}</span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </Card>
              );
            })}
          </Section>

          <Section id="buttons" title="Buttons" lead="Primär nur einmal pro Kontext. Sekundär ist der Standard. Destruktiv immer mit Bestätigung oder Widerrufen-Möglichkeit.">
            <Card title="Varianten">
              <Row>
                <Button variant="primary" icon="play">Start</Button>
                <Button variant="secondary">Abbrechen</Button>
                <Button variant="tinted" icon="sparkle">Auto-Layout</Button>
                <Button variant="ghost" icon="doc">Datenblatt</Button>
                <Button variant="destructive" icon="trash">Löschen</Button>
                <Button variant="primary" loading>Simuliere</Button>
                <Button variant="secondary" disabled>Deaktiviert</Button>
              </Row>
            </Card>
            <Card title="Größen">
              <Row>
                <Button size="xs" variant="primary">Extra klein</Button>
                <Button size="sm" variant="primary">Klein</Button>
                <Button size="md" variant="primary">Mittel</Button>
                <Button size="lg" variant="primary" iconRight="chevronRight">Groß</Button>
              </Row>
            </Card>
            <Card title="Icon-Buttons & Werkzeuggruppen" note="Tooltips mit Kurzbefehl nach 450 ms">
              <Row className="gap-5">
                <Row className="gap-1">
                  <IconButton icon="undo" label="Widerrufen" shortcut="⌘Z" />
                  <IconButton icon="redo" label="Wiederholen" shortcut="⇧⌘Z" disabled />
                  <IconButton icon="gear" label="Einstellungen" shortcut="⌘," variant="secondary" />
                  <IconButton icon="grid" label="Raster" active />
                </Row>
                <ToolGroup>
                  {(["cursor", "hand", "wire", "eraser", "probe"] as IconName[]).map((t) => (
                    <ToolButton key={t} icon={t} label={t} shortcut={t[0].toUpperCase()} active={tool === t} onClick={() => setTool(t)} />
                  ))}
                </ToolGroup>
                <ToolGroup>
                  <ToolButton icon="resistor" label="Widerstand" />
                  <ToolButton icon="capacitor" label="Kondensator" />
                  <ToolButton icon="inductor" label="Spule" />
                  <ToolButton icon="source" label="Quelle" active tone="orange" />
                </ToolGroup>
              </Row>
            </Card>
          </Section>

          <Section id="toggles" title="Schalter & Auswahl" lead="Switch für sofort wirksame Zustände, Checkbox für Listen, Radio für exklusive Optionen mit Erklärung, Segmented für Ansichtswechsel.">
            <div className="grid grid-cols-2 gap-5">
              <Card title="Switch">
                <div className="flex flex-col gap-3">
                  <Field label="Raster anzeigen" inline><Switch checked={sw1} onChange={setSw1} /></Field>
                  <Field label="Am Raster ausrichten" hint="Bauteile und Leitungen fangen auf 10 px" inline><Switch checked={sw2} onChange={setSw2} /></Field>
                  <Field label="Kompakt" inline><Switch size="sm" checked={sw1} onChange={setSw1} /></Field>
                  <Field label="Deaktiviert" inline><Switch checked disabled onChange={() => {}} /></Field>
                </div>
              </Card>
              <Card title="Checkbox & Radio">
                <div className="flex flex-col gap-3">
                  <Checkbox checked={cb1} onChange={setCb1} label="Bezeichnung anzeigen" />
                  <Checkbox checked={cb2} onChange={setCb2} label="Wert anzeigen" />
                  <Checkbox checked={false} indeterminate onChange={() => {}} label="Gemischte Auswahl" />
                  <div className="my-1 h-px bg-hairline" />
                  <RadioGroup
                    value={radio}
                    onChange={setRadio}
                    options={[
                      { value: "tran", label: "Transientenanalyse", hint: "Zeitverlauf der Signale" },
                      { value: "dc", label: "Arbeitspunkt", hint: "Statische Spannungen & Ströme" },
                      { value: "ac", label: "AC-Sweep", hint: "Frequenzgang" },
                    ]}
                  />
                </div>
              </Card>
            </div>
            <Card title="Segmented Control" note="Indikator gleitet mit 220 ms">
              <Row className="gap-6">
                <Segmented value={seg} onChange={setSeg} options={[{ value: "a", label: "Schaltplan" }, { value: "b", label: "Layout" }, { value: "c", label: "3D" }]} />
                <Segmented size="sm" value={seg2} onChange={setSeg2} options={[{ value: "grid", icon: "grid" }, { value: "list", icon: "layers" }, { value: "doc", icon: "doc" }]} />
                <Segmented size="sm" value={seg} onChange={setSeg} options={[{ value: "a", label: "0°" }, { value: "b", label: "90°" }, { value: "c", label: "180°" }, { value: "d", label: "270°" }]} />
              </Row>
            </Card>
          </Section>

          <Section id="inputs" title="Eingaben" lead="Textfelder mit Icon, Löschen-Knopf und Suffix. Stepper unterstützen ↑/↓ (⇧ für ×10) und SI-Formatierung. Slider mit Ticks.">
            <div className="grid grid-cols-2 gap-5">
              <Card title="Textfeld & Suche">
                <div className="flex flex-col gap-3">
                  <TextField placeholder="Bezeichnung" value={text} onChange={(e) => setText(e.target.value)} />
                  <TextField icon="search" placeholder="Bauteile suchen …" value={text} onChange={(e) => setText(e.target.value)} onClear={() => setText("")} />
                  <TextField mono placeholder="NET_NAME" suffix="Netz" value={text} onChange={(e) => setText(e.target.value)} />
                  <TextField size="sm" placeholder="Klein" value="" readOnly />
                </div>
              </Card>
              <Card title="Stepper, Select & Slider">
                <div className="flex flex-col gap-4">
                  <Field label="Widerstand" inline><Stepper value={stepper} onChange={setStepper} step={0.1} unit="kΩ" min={0} format={(v) => v.toFixed(1).replace(".", ",")} /></Field>
                  <Field label="Modell" inline>
                    <Select value={sel} onChange={setSel} options={[{ value: "1n4148", label: "1N4148" }, { value: "1n4007", label: "1N4007" }, { value: "bat54", label: "BAT54 Schottky" }]} />
                  </Field>
                  <Field label={`Helligkeit · ${slider} %`}>
                    <Slider value={slider} onChange={setSlider} ticks={[0, 25, 50, 75, 100]} />
                  </Field>
                </div>
              </Card>
            </div>
          </Section>

          <Section id="menus" title="Menüs & Popover" lead="Menüs sind transluzent, Einträge heben sich blau hervor, Kurzbefehle rechtsbündig. Untermenüs öffnen bei Hover.">
            <div className="grid grid-cols-2 gap-5">
              <Card title="Menü (statisch)">
                <MenuList
                  className="shadow-2"
                  style={{ animation: "none" }}
                  items={[
                    { label: "Widerrufen", shortcut: "⌘Z", icon: "undo" },
                    { label: "Wiederholen", shortcut: "⇧⌘Z", icon: "redo", disabled: true },
                    { type: "divider" },
                    { label: "Ausschneiden", shortcut: "⌘X" },
                    { label: "Kopieren", shortcut: "⌘C", icon: "copy" },
                    { label: "Einfügen", shortcut: "⌘V" },
                    { type: "divider" },
                    { label: "Drehen", submenu: [{ label: "90° im Uhrzeigersinn", shortcut: "⌘R" }, { label: "90° gegen Uhrzeigersinn", shortcut: "⇧⌘R" }, { label: "Spiegeln", shortcut: "⌥⌘M" }] },
                    { type: "divider" },
                    { label: "Löschen", shortcut: "⌫", icon: "trash", danger: true },
                  ]}
                />
              </Card>
              <Card title="Popover & Tooltip">
                <div className="flex flex-col gap-5">
                  <Row>
                    <Popover
                      open={pop}
                      onOpenChange={setPop}
                      trigger={<Button onClick={() => setPop((v) => !v)} iconRight="chevronDown">Sonden-Optionen</Button>}
                    >
                      <div className="anim-pop material-overlay w-[260px] rounded-[12px] p-4 shadow-menu">
                        <div className="mb-3 text-[13px] font-semibold text-ink">Sonden</div>
                        <div className="flex flex-col gap-3">
                          <Field label="Live-Werte" inline><Switch size="sm" checked={sw1} onChange={setSw1} /></Field>
                          <Field label="Einheit" inline>
                            <Segmented size="sm" value={seg} onChange={setSeg} options={[{ value: "a", label: "V" }, { value: "b", label: "mV" }]} />
                          </Field>
                          <Field label="Nachkommastellen" inline><Stepper value={2} onChange={() => {}} min={0} max={6} /></Field>
                        </div>
                      </div>
                    </Popover>
                    <Tooltip label="Tooltip mit Kurzbefehl" shortcut="⌘K" side="top">
                      <Button variant="secondary">Hover mich</Button>
                    </Tooltip>
                  </Row>
                  <div className="flex flex-col gap-2 text-[13px] text-ink-2">
                    <div>Kurzbefehle werden konsistent gesetzt: <Shortcut keys="⇧⌘Z" className="text-ink" /></div>
                    <div className="flex items-center gap-1.5">Tasten als Kbd: <Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>P</Kbd></div>
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          <Section id="feedback" title="Feedback" lead="Zustände sind immer sichtbar, nie laut. Badges mit pulsierendem Punkt zeigen laufende Prozesse, Toasts bestätigen Aktionen kurz und verschwinden.">
            <div className="grid grid-cols-2 gap-5">
              <Card title="Badges">
                <Row>
                  <Badge tone="green" dot pulse>Simulation läuft</Badge>
                  <Badge tone="green"><Icon name="check" size={12} strokeWidth={2.6} />Prüfung ok</Badge>
                  <Badge tone="orange" dot>2 Hinweise</Badge>
                  <Badge tone="red" dot>Kurzschluss</Badge>
                  <Badge tone="accent">OUT</Badge>
                  <Badge tone="purple">Beta</Badge>
                  <Badge>Entwurf</Badge>
                </Row>
              </Card>
              <Card title="Fortschritt & Toast">
                <div className="flex flex-col gap-4">
                  <Field label={`Netzliste exportieren · ${progress} %`}><ProgressBar value={progress} /></Field>
                  <Row>
                    <Spinner size={18} className="text-accent" />
                    <span className="text-[13px] text-ink-2">Berechne Arbeitspunkt …</span>
                  </Row>
                  <Row>
                    <Button variant="secondary" icon="bell" onClick={() => push({ title: "Schaltplan gesichert", message: "555 Blinker.cir · gerade eben", icon: "check", tone: "green" })}>Toast anzeigen</Button>
                    <Button variant="secondary" icon="warning" onClick={() => push({ title: "Konvergenzproblem", message: "Schrittweite auf 0,5 ms reduziert", icon: "warning", tone: "red" })}>Warnung</Button>
                  </Row>
                </div>
              </Card>
            </div>
          </Section>

          <Section id="navigation" title="Navigation" lead="Dokument-Tabs mit Schließen bei Hover, aufklappbare Abschnitte mit animierter Höhe, Fenster mit Ampel-Steuerung.">
            <Card title="Dokument-Tabs">
              <div className="h-9 rounded-[10px] bg-app px-2">
                <DocumentTabs
                  tabs={[{ id: "a", title: "555 Blinker" }, { id: "b", title: "RC-Tiefpass", dirty: true }, { id: "c", title: "H-Brücke" }]}
                  active={tab}
                  onSelect={setTab}
                  onClose={() => push({ title: "Tab geschlossen", icon: "close" })}
                  onAdd={() => push({ title: "Neuer Schaltplan", icon: "plus", tone: "accent" })}
                />
              </div>
            </Card>
            <Card title="Disclosure (Inspektor-Abschnitte)" className="p-0">
              <div className="-m-5 overflow-hidden rounded-[14px]">
                <Disclosure title="Allgemein">
                  <Field label="Bezeichnung" inline><TextField size="sm" className="w-[120px]" value="R1" readOnly /></Field>
                  <Field label="Wert" inline><Stepper value={10} onChange={() => {}} unit="kΩ" /></Field>
                </Disclosure>
                <Disclosure title="Darstellung" defaultOpen={false}>
                  <Field label="Bezeichnung anzeigen" inline><Switch size="sm" checked onChange={() => {}} /></Field>
                </Disclosure>
                <Disclosure title="Position" defaultOpen={false}>
                  <Field label="X" inline><Stepper value={440} onChange={() => {}} unit="px" /></Field>
                </Disclosure>
              </div>
            </Card>
          </Section>

          <div className="pb-10 text-center text-[12px] text-ink-3">Circuit UI-Kit · Mit Liebe zum Detail gebaut.</div>
        </div>
      </div>
    </div>
  );
}
