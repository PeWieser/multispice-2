import { useMemo, useState } from "react";
import { cn } from "../utils/cn";
import { Icon, type IconName } from "../ui/icons";
import { Badge, IconButton, Segmented, TextField } from "../ui/primitives";
import type { PartType } from "./model";

interface LibEntry {
  id: string;
  name: string;
  icon: IconName;
  type?: PartType;
  cat: string;
  hint?: string;
}

const LIB: LibEntry[] = [
  { id: "res", name: "Widerstand", icon: "resistor", type: "resistor", cat: "Passiv", hint: "E24" },
  { id: "pot", name: "Potentiometer", icon: "potentiometer", cat: "Passiv" },
  { id: "cap", name: "Kondensator", icon: "capacitor", type: "capacitor", cat: "Passiv" },
  { id: "ind", name: "Spule", icon: "inductor", type: "inductor", cat: "Passiv" },
  { id: "vsrc", name: "DC-Quelle", icon: "source", type: "source", cat: "Quellen" },
  { id: "bat", name: "Batterie", icon: "battery", cat: "Quellen" },
  { id: "gnd", name: "Masse", icon: "ground", type: "ground", cat: "Quellen" },
  { id: "dio", name: "Diode", icon: "diode", type: "diode", cat: "Halbleiter", hint: "1N4148" },
  { id: "led", name: "LED", icon: "led", type: "led", cat: "Halbleiter" },
  { id: "npn", name: "Transistor NPN", icon: "transistor", cat: "Halbleiter", hint: "BC547" },
  { id: "opa", name: "Operationsverstärker", icon: "opamp", cat: "ICs", hint: "LM358" },
  { id: "555", name: "Timer 555", icon: "ic", cat: "ICs", hint: "NE555" },
  { id: "sw", name: "Schalter", icon: "switch", cat: "Elektromechanik" },
  { id: "lamp", name: "Glühlampe", icon: "lamp", cat: "Elektromechanik" },
];

const CATS = ["Alle", "Passiv", "Quellen", "Halbleiter", "ICs", "Elektromechanik"];

export function LibraryPanel({ placing, onPlace, onClose }: { placing: PartType | null; onPlace: (t: PartType | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Alle");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [recent, setRecent] = useState<string[]>(["res", "cap", "gnd"]);

  const items = useMemo(
    () => LIB.filter((e) => (cat === "Alle" || e.cat === cat) && (q === "" || e.name.toLowerCase().includes(q.toLowerCase()) || e.hint?.toLowerCase().includes(q.toLowerCase()))),
    [q, cat],
  );

  const pick = (e: LibEntry) => {
    if (!e.type) return;
    setRecent((r) => [e.id, ...r.filter((x) => x !== e.id)].slice(0, 4));
    onPlace(placing === e.type ? null : e.type);
  };

  return (
    <aside className="material flex w-[264px] shrink-0 flex-col border-r border-hairline">
      <div className="flex h-[44px] items-center gap-2 border-b border-hairline px-3">
        <span className="text-[13px] font-semibold text-ink">Bibliothek</span>
        <Badge tone="neutral" className="h-[18px] px-1.5 text-[11px]">{LIB.length}</Badge>
        <div className="flex-1" />
        <Segmented size="sm" value={viewMode} onChange={setViewMode} options={[{ value: "grid", icon: "grid", title: "Raster" }, { value: "list", icon: "layers", title: "Liste" }]} />
        <IconButton icon="sidebarLeft" label="Bibliothek ausblenden" shortcut="⌘L" size="sm" onClick={onClose} />
      </div>

      <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
        <TextField icon="search" size="sm" placeholder="Bauteile suchen …" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} />
        <div className="scroll-thin -mx-3 flex gap-1 overflow-x-auto px-3 pb-1">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "press focus-ring h-[22px] shrink-0 rounded-full px-2.5 text-[11.5px] font-medium transition-colors",
                cat === c ? "bg-ink text-app dark:bg-white dark:text-black" : "bg-ink/[0.06] text-ink-2 hover:bg-ink/[0.1] hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-3">
        {q === "" && cat === "Alle" && (
          <>
            <div className="mt-1 mb-1.5 text-[11px] font-semibold tracking-[0.03em] text-ink-3 uppercase">Zuletzt verwendet</div>
            <div className="mb-3 flex gap-1.5">
              {recent.map((id) => {
                const e = LIB.find((x) => x.id === id)!;
                return (
                  <button
                    key={id}
                    type="button"
                    title={e.name}
                    onClick={() => pick(e)}
                    className={cn(
                      "press focus-ring flex h-10 w-10 items-center justify-center rounded-[9px] bg-surface text-ink-2 shadow-1 hover:text-ink dark:bg-surface-3",
                      placing && placing === e.type && "bg-accent text-white shadow-none hover:text-white",
                    )}
                  >
                    <Icon name={e.icon} size={20} strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-[0.03em] text-ink-3 uppercase">Alle Bauteile</div>
          </>
        )}

        {items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="search" size={22} className="text-ink-4" />
            <div className="text-[13px] text-ink-2">Keine Treffer für „{q}“</div>
          </div>
        )}

        {viewMode === "grid" ? (
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((e) => {
              const on = !!placing && placing === e.type;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => pick(e)}
                  disabled={!e.type}
                  title={!e.type ? "Noch nicht verfügbar" : e.name}
                  className={cn(
                    "press focus-ring group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[10px] bg-surface p-1 text-ink-2 shadow-1 transition-colors hover:text-ink disabled:opacity-40 dark:bg-surface-3",
                    on && "bg-accent text-white shadow-none hover:text-white",
                  )}
                >
                  <Icon name={e.icon} size={24} strokeWidth={1.4} />
                  <span className="max-w-full truncate px-1 text-[10.5px] leading-none font-medium">{e.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map((e) => {
              const on = !!placing && placing === e.type;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => pick(e)}
                  disabled={!e.type}
                  className={cn(
                    "focus-ring flex h-9 items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-ink hover:bg-ink/[0.05] disabled:opacity-40",
                    on && "bg-accent text-white hover:bg-accent",
                  )}
                >
                  <Icon name={e.icon} size={18} strokeWidth={1.5} className={on ? "" : "text-ink-2"} />
                  <span className="flex-1 truncate">{e.name}</span>
                  {e.hint && <span className={cn("font-mono text-[11px]", on ? "text-white/70" : "text-ink-3")}>{e.hint}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-hairline px-3 py-2 text-[11.5px] text-ink-3">
        Tipp: <kbd className="font-sans text-ink-2">⇧</kbd> halten, um mehrere zu platzieren.
      </div>
    </aside>
  );
}
