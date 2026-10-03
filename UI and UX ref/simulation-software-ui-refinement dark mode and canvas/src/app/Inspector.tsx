import { Icon } from "../ui/icons";
import { Badge, Button, Disclosure, Field, IconButton, Segmented, Select, Stepper, Switch, TextField } from "../ui/primitives";
import { formatSI, PART_NAMES, partIcon, timing, type Circuit, type Part, type Rotation } from "./model";
import type { Note, Probe } from "./Canvas";

const E24 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
function stepE(v: number, dir: 1 | -1) {
  if (v <= 0) return dir > 0 ? 1 : 0;
  const exp = Math.floor(Math.log10(v));
  const m = v / 10 ** exp;
  let idx = E24.findIndex((e) => Math.abs(e - m) < 1e-6);
  if (idx === -1) {
    idx = E24.findIndex((e) => e > m);
    if (dir > 0) return (idx === -1 ? 10 : E24[idx]) * 10 ** exp;
    return (idx <= 0 ? E24[E24.length - 1] / 10 : E24[idx - 1]) * 10 ** exp;
  }
  const n = idx + dir;
  if (n < 0) return E24[E24.length - 1] * 10 ** (exp - 1);
  if (n >= E24.length) return E24[0] * 10 ** (exp + 1);
  return E24[n] * 10 ** exp;
}

export function Inspector({
  circuit,
  selection,
  notes,
  probes,
  onPatch,
  onPatchNote,
  onDelete,
  onDuplicate,
  running,
  docTitle,
  onDocTitle,
}: {
  circuit: Circuit;
  selection: string[];
  notes: Note[];
  probes: Probe[];
  onPatch: (id: string, patch: Partial<Part>) => void;
  onPatchNote: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  running: boolean;
  docTitle: string;
  onDocTitle: (t: string) => void;
}) {
  const part = selection.length === 1 ? circuit.parts.find((p) => p.id === selection[0]) : undefined;
  const note = selection.length === 1 ? notes.find((n) => n.id === selection[0]) : undefined;
  const probe = selection.length === 1 ? probes.find((n) => n.id === selection[0]) : undefined;
  const tm = timing(circuit);

  return (
    <aside className="material flex w-[272px] shrink-0 flex-col border-l border-hairline">
      {/* Header */}
      <div className="flex h-[44px] items-center gap-2.5 border-b border-hairline px-3.5">
        {part ? (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent-soft text-accent">
              <Icon name={partIcon(part.type)} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">{part.ref}</div>
              <div className="truncate text-[11px] text-ink-3">{PART_NAMES[part.type]}</div>
            </div>
            <IconButton icon="copy" label="Duplizieren" shortcut="⌘D" size="sm" onClick={() => onDuplicate(part.id)} />
            <IconButton icon="trash" label="Löschen" shortcut="⌫" size="sm" onClick={() => onDelete(part.id)} className="hover:text-red" />
          </>
        ) : selection.length > 1 ? (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent-soft text-accent">
              <Icon name="layers" size={16} />
            </span>
            <div className="flex-1 text-[13px] font-semibold text-ink">{selection.length} Elemente</div>
            <IconButton icon="trash" label="Löschen" size="sm" onClick={() => selection.forEach(onDelete)} className="hover:text-red" />
          </>
        ) : note ? (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-yellow/20 text-[#9a7b00]">
              <Icon name="note" size={16} />
            </span>
            <div className="flex-1 text-[13px] font-semibold text-ink">Notiz</div>
            <IconButton icon="trash" label="Löschen" size="sm" onClick={() => onDelete(note.id)} className="hover:text-red" />
          </>
        ) : probe ? (
          <>
            <span className={`flex h-7 w-7 items-center justify-center rounded-[7px] ${probe.kind === "V" ? "bg-orange/15 text-orange" : "bg-teal/15 text-teal"}`}>
              <Icon name="probe" size={16} />
            </span>
            <div className="flex-1 text-[13px] font-semibold text-ink">{probe.kind === "V" ? "Spannungssonde" : "Stromsonde"}</div>
            <IconButton icon="trash" label="Löschen" size="sm" onClick={() => onDelete(probe.id)} className="hover:text-red" />
          </>
        ) : (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-ink/[0.06] text-ink-2">
              <Icon name="doc" size={16} />
            </span>
            <div className="flex-1 text-[13px] font-semibold text-ink">Schaltplan</div>
          </>
        )}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {part && (
          <>
            <Disclosure title="Allgemein">
              <Field label="Bezeichnung" inline>
                <TextField size="sm" className="w-[120px]" value={part.ref} onChange={(e) => onPatch(part.id, { ref: e.target.value })} />
              </Field>
              {part.value !== undefined && part.unit && (
                <Field label="Wert" inline>
                  <div className="flex items-center gap-1">
                    <IconButton icon="minus" label="E24 kleiner" size="xs" onClick={() => onPatch(part.id, { value: stepE(part.value!, -1) })} />
                    <Stepper
                      value={part.value}
                      onChange={(v) => onPatch(part.id, { value: v })}
                      step={part.unit === "V" ? 0.5 : part.value / 10}
                      min={0}
                      format={(v) => formatSI(v, "", 3)}
                      unit={part.unit}
                    />
                    <IconButton icon="plus" label="E24 größer" size="xs" onClick={() => onPatch(part.id, { value: stepE(part.value!, 1) })} />
                  </div>
                </Field>
              )}
              {part.tolerance !== undefined && (
                <Field label="Toleranz" inline>
                  <Select
                    size="sm"
                    align="end"
                    value={String(part.tolerance)}
                    onChange={(v) => onPatch(part.id, { tolerance: Number(v) })}
                    options={[{ value: "0.1", label: "±0,1 %" }, { value: "1", label: "±1 %" }, { value: "5", label: "±5 %" }, { value: "10", label: "±10 %" }, { value: "20", label: "±20 %" }]}
                  />
                </Field>
              )}
              {(part.type === "led" || part.type === "ic555" || part.type === "netlabel") && (
                <Field label={part.type === "netlabel" ? "Netzname" : "Typ"} inline>
                  <TextField size="sm" className="w-[120px]" mono={part.type === "netlabel"} value={part.label ?? ""} onChange={(e) => onPatch(part.id, { label: e.target.value, ...(part.type === "netlabel" ? { ref: e.target.value } : {}) })} />
                </Field>
              )}
              {part.type === "led" && (
                <Field label="Farbe" inline>
                  <div className="flex gap-1.5">
                    {["#ff453a", "#30d158", "#ffd60a", "#0a84ff", "#ffffff"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => onPatch(part.id, { color: c, label: { "#ff453a": "Rot", "#30d158": "Grün", "#ffd60a": "Gelb", "#0a84ff": "Blau", "#ffffff": "Weiß" }[c] })}
                        className="press flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-black/10 ring-inset"
                        style={{ background: c }}
                      >
                        {part.color === c && <Icon name="check" size={11} strokeWidth={3} className={c === "#ffffff" || c === "#ffd60a" ? "text-black/70" : "text-white"} />}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </Disclosure>

            <Disclosure title="Darstellung">
              <Field label="Bezeichnung anzeigen" inline>
                <Switch size="sm" checked={part.showRef !== false} onChange={(v) => onPatch(part.id, { showRef: v })} />
              </Field>
              <Field label="Wert anzeigen" inline>
                <Switch size="sm" checked={part.showValue !== false} onChange={(v) => onPatch(part.id, { showValue: v })} />
              </Field>
              <Field label="Ausrichtung">
                <Segmented
                  size="sm"
                  value={String(part.rot)}
                  onChange={(v) => onPatch(part.id, { rot: Number(v) as Rotation })}
                  options={[{ value: "0", label: "0°" }, { value: "90", label: "90°" }, { value: "180", label: "180°" }, { value: "270", label: "270°" }]}
                  className="w-full"
                />
              </Field>
            </Disclosure>

            <Disclosure title="Position">
              <div className="grid grid-cols-2 gap-2">
                <Field label="X">
                  <Stepper value={part.x} onChange={(v) => onPatch(part.id, { x: v })} step={10} unit="px" className="w-full" />
                </Field>
                <Field label="Y">
                  <Stepper value={part.y} onChange={(v) => onPatch(part.id, { y: v })} step={10} unit="px" className="w-full" />
                </Field>
              </div>
            </Disclosure>

            {["r1", "r2", "c1"].includes(part.id) && (
              <Disclosure title="Astabiler Multivibrator">
                <div className="rounded-[9px] bg-surface p-3 shadow-1 dark:bg-surface-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] text-ink-2">Berechnet aus R1, R2, C1</span>
                    <Badge tone={running ? "green" : "neutral"} dot pulse={running}>{running ? "Live" : "Statisch"}</Badge>
                  </div>
                  <dl className="tnum grid grid-cols-[1fr_auto] gap-y-1.5 text-[12.5px]">
                    <dt className="text-ink-2">Frequenz</dt>
                    <dd className="font-medium text-ink">{formatSI(tm.freq, "Hz")}</dd>
                    <dt className="text-ink-2">Periode</dt>
                    <dd className="font-medium text-ink">{formatSI(tm.period, "s")}</dd>
                    <dt className="text-ink-2">t<sub>high</sub></dt>
                    <dd className="font-medium text-ink">{formatSI(tm.tHigh, "s")}</dd>
                    <dt className="text-ink-2">t<sub>low</sub></dt>
                    <dd className="font-medium text-ink">{formatSI(tm.tLow, "s")}</dd>
                    <dt className="text-ink-2">Tastgrad</dt>
                    <dd className="font-medium text-ink">{(tm.duty * 100).toFixed(1)} %</dd>
                  </dl>
                </div>
              </Disclosure>
            )}
          </>
        )}

        {note && (
          <Disclosure title="Inhalt">
            <textarea
              value={note.text}
              onChange={(e) => onPatchNote(note.id, e.target.value)}
              rows={4}
              className="w-full resize-none rounded-[7px] bg-surface p-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong)] focus:shadow-[0_0_0_3px_var(--accent-soft),0_0_0_1.5px_var(--accent)] dark:bg-surface-3"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
            />
          </Disclosure>
        )}

        {probe && (
          <Disclosure title="Messung">
            <Field label="Netz" inline>
              <Badge tone="accent">{probe.net}</Badge>
            </Field>
            <Field label="Position" inline>
              <span className="tnum font-mono text-[12px] text-ink-2">{probe.x}, {probe.y}</span>
            </Field>
          </Disclosure>
        )}

        {!part && !note && !probe && selection.length === 0 && (
          <>
            <Disclosure title="Dokument">
              <Field label="Titel">
                <TextField size="sm" value={docTitle} onChange={(e) => onDocTitle(e.target.value)} />
              </Field>
              <Field label="Bauteile" inline>
                <span className="tnum text-[13px] text-ink">{circuit.parts.filter((p) => p.type !== "netlabel" && p.type !== "ground").length}</span>
              </Field>
              <Field label="Netze" inline>
                <span className="tnum text-[13px] text-ink">{new Set(circuit.wires.map((w) => w.net)).size}</span>
              </Field>
            </Disclosure>
            <Disclosure title="Simulation">
              <Field label="Analyse" inline>
                <Select size="sm" align="end" value="tran" onChange={() => {}} options={[{ value: "tran", label: "Transient" }, { value: "dc", label: "Arbeitspunkt" }, { value: "ac", label: "AC-Sweep" }]} />
              </Field>
              <Field label="Schrittweite" inline>
                <Stepper value={1} onChange={() => {}} step={0.5} unit="ms" min={0.1} />
              </Field>
              <Field label="Max. Dauer" inline>
                <Stepper value={10} onChange={() => {}} step={1} unit="s" min={1} />
              </Field>
            </Disclosure>
            <Disclosure title="Prüfung" defaultOpen>
              <div className="flex items-start gap-2.5 rounded-[9px] bg-green/[0.1] p-2.5 text-[12.5px] text-green-deep dark:text-green">
                <Icon name="check" size={15} strokeWidth={2.4} className="mt-[1px]" />
                <div>
                  <div className="font-medium">Keine Fehler</div>
                  <div className="text-[12px] opacity-80">Alle Pins verbunden, Masse vorhanden.</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-[9px] bg-orange/[0.1] p-2.5 text-[12.5px] text-[#9a5b00] dark:text-orange">
                <Icon name="info" size={15} strokeWidth={2} className="mt-[1px]" />
                <div>
                  <div className="font-medium">Hinweis</div>
                  <div className="text-[12px] opacity-80">U1 CTRL offen — 10 nF gegen Masse empfohlen.</div>
                </div>
              </div>
            </Disclosure>
          </>
        )}
      </div>

      {part && (
        <div className="border-t border-hairline p-3">
          <Button variant="secondary" size="sm" icon="doc" className="w-full">
            Datenblatt öffnen
          </Button>
        </div>
      )}
    </aside>
  );
}
