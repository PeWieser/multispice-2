"use client";

/* S6.2 (Phase 2): Pin-Reiter der Bauteile-Editor-Shell. Die Außenpins werden
   aus den Ports der Innenschaltung abgeleitet (Reihenfolge = Pin-Nummern);
   Seite, Rolle, Markierung und freie Position sind je Pin überstimmbar.
   Umordnen nummeriert die Ports per Commit um (Undo-fähig). */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useEditor } from "@/state/editor";
import { PinMarker, PinRole, PinSide, collectPorts, derivePinsFromPorts } from "@/lib/library/customParts";
import { SelectField } from "../ui/Field";

const SIDES: Array<{ value: PinSide; label: string }> = [
  { value: "left", label: "Links" },
  { value: "right", label: "Rechts" },
  { value: "top", label: "Oben" },
  { value: "bottom", label: "Unten" },
];

const ROLES: Array<{ value: PinRole; label: string }> = [
  { value: "input", label: "Eingang" },
  { value: "output", label: "Ausgang" },
  { value: "signal", label: "Signal" },
  { value: "vcc", label: "Versorgung" },
  { value: "gnd", label: "Masse" },
];

const MARKERS: Array<{ value: PinMarker; label: string }> = [
  { value: "none", label: "Keins" },
  { value: "invert", label: "Invert-Punkt" },
  { value: "clock", label: "Flanken-Dreieck" },
];

export function PinsPanel() {
  const doc = useEditor((s) => s.doc);
  const overrides = useEditor((s) => s.partEditor.pinOverrides);

  const ports = useMemo(() => collectPorts(doc), [doc]);
  const pins = useMemo(() => derivePinsFromPorts(doc, overrides), [doc, overrides]);

  if (ports.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16 text-center text-xs text-ink-3">
        Noch keine Ports platziert.
        <div className="mt-1 text-2xs">
          Jeder Port in der Schaltung wird ein Außenpin — Eingänge links, Ausgänge rechts.
        </div>
      </div>
    );
  }

  const move = (idx: number, dir: 1 | -1) => {
    const order = ports.map((p) => p.instanceId);
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    // S6.2: Compiler-Reihenfolge ist die Instanz-ID-Sortierung — Umordnen
    // heißt Ummummerieren (ein Undo-Schritt, Links unberührt: Ports sind
    // nie Link-Ziele).
    useEditor.getState().commit((d) => {
      const rank = new Map(order.map((id, r) => [id, r]));
      for (const inst of d.instances) {
        const r = rank.get(inst.id);
        if (r !== undefined) inst.id = `pe_p${String(r).padStart(2, "0")}`;
      }
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-2.5 overflow-y-auto p-4">
      {pins.map((pin, idx) => {
        const port = ports[idx];
        const ov = overrides[pin.name];
        return (
          <div key={pin.name} className="rounded-xl border border-hairline bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <span className="mono grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-soft text-xs font-bold text-accent">
                {idx + 1}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs font-semibold pressable hover:text-accent"
                title="Port in der Schaltung auswählen"
                onClick={() => {
                  const st = useEditor.getState();
                  st.setPartEditorTab("circuit");
                  if (port) st.setSelection([port.instanceId]);
                }}
              >
                {pin.name}
              </button>
              <span className="shrink-0 text-2xs text-ink-3">
                {port?.partId === "port_in" ? "Eingang" : port?.partId === "port_out" ? "Ausgang" : "Bidirektional"}
              </span>
              <button
                type="button"
                className="pressable rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                disabled={idx === 0}
                title="Pin nach oben"
                aria-label={`Pin ${pin.name} nach oben`}
                onClick={() => move(idx, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className="pressable rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                disabled={idx === pins.length - 1}
                title="Pin nach unten"
                aria-label={`Pin ${pin.name} nach unten`}
                onClick={() => move(idx, 1)}
              >
                <ArrowDown size={14} />
              </button>
              {ov && (
                <button
                  type="button"
                  className="pressable flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs text-ink-3 hover:bg-surface-3 hover:text-ink"
                  title="Eigene Pin-Einstellungen verwerfen (Konvention)"
                  onClick={() => useEditor.getState().setPinOverride(pin.name, null)}
                >
                  <RotateCcw size={12} /> Auto
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <SelectField
                label="Seite"
                value={pin.side}
                options={SIDES}
                onChange={(v) => useEditor.getState().setPinOverride(pin.name, { side: v as PinSide })}
              />
              <SelectField
                label="Rolle"
                value={pin.role}
                options={ROLES}
                onChange={(v) => useEditor.getState().setPinOverride(pin.name, { role: v as PinRole })}
              />
              <SelectField
                label="Markierung"
                value={pin.marker ?? "none"}
                options={MARKERS}
                onChange={(v) => useEditor.getState().setPinOverride(pin.name, { marker: v as PinMarker })}
              />
            </div>
          </div>
        );
      })}
      <div className="pb-2 text-center text-2xs text-ink-3">
        Pin-Namen stehen am Port-Bauteil in der Schaltung (anklicken zum Auswählen). Freie Positionen setzt der
        Symbol-Reiter per Ziehen.
      </div>
    </div>
  );
}

export default PinsPanel;
