import { cn } from "../utils/cn";
import { Button, IconButton, Select, ToolButton, ToolGroup, Tooltip } from "../ui/primitives";
import { PART_NAMES, partIcon, type PartType } from "./model";
import type { Tool } from "./Canvas";

export type ProbeMode = "live" | "static" | "hold";

const QUICK_PARTS: PartType[] = ["resistor", "capacitor", "inductor", "source", "ground"];

const TOOLS: { id: Tool; icon: "cursor" | "wire" | "eraser" | "probe" | "tag" | "note" | "hand"; label: string; key: string }[] = [
  { id: "select", icon: "cursor", label: "Auswählen", key: "V" },
  { id: "hand", icon: "hand", label: "Verschieben", key: "H" },
];
const DRAW_TOOLS: typeof TOOLS = [
  { id: "wire", icon: "wire", label: "Leitung zeichnen", key: "W" },
  { id: "eraser", icon: "eraser", label: "Löschen", key: "E" },
  { id: "probe", icon: "probe", label: "Sonde setzen", key: "P" },
];
const ANNOT_TOOLS: typeof TOOLS = [
  { id: "tag", icon: "tag", label: "Netzbezeichner", key: "T" },
  { id: "note", icon: "note", label: "Notiz", key: "N" },
];

export function Toolbar({
  libraryOpen,
  onToggleLibrary,
  inspectorOpen,
  onToggleInspector,
  tool,
  onTool,
  placing,
  onPlacing,
  probeKind,
  onProbeKind,
  probeMode,
  onProbeMode,
  showGrid,
  onShowGrid,
  snapOn,
  onSnap,
}: {
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  placing: PartType | null;
  onPlacing: (p: PartType | null) => void;
  probeKind: "V" | "A";
  onProbeKind: (k: "V" | "A") => void;
  probeMode: ProbeMode;
  onProbeMode: (m: ProbeMode) => void;
  showGrid: boolean;
  onShowGrid: (v: boolean) => void;
  snapOn: boolean;
  onSnap: (v: boolean) => void;
}) {
  const probeToggle = (k: "V" | "A") => {
    const colour = k === "V" ? "bg-orange" : "bg-teal";
    const active = tool === "probe" && probeKind === k;
    return (
      <Tooltip label={k === "V" ? "Spannungssonde" : "Stromsonde"} shortcut={k === "V" ? "⇧V" : "⇧A"}>
        <button
          type="button"
          aria-pressed={active}
          onClick={() => {
            onProbeKind(k);
            onTool("probe");
          }}
          className={cn(
            "press focus-ring inline-flex h-[26px] items-center gap-1.5 rounded-[7px] pr-2.5 pl-1.5 text-[12.5px] font-semibold text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
            active && "bg-accent text-white hover:bg-accent hover:text-white",
          )}
        >
          <span className={cn("flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white/70", colour)}>
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
          </span>
          {k}
        </button>
      </Tooltip>
    );
  };

  return (
    <div className="material relative z-[90] flex h-[48px] shrink-0 items-center gap-2.5 border-b border-hairline px-3">
      <Button
        variant="ghost"
        size="sm"
        icon="library"
        className={cn("pl-2", libraryOpen && "bg-accent-soft text-accent hover:bg-accent-soft")}
        onClick={onToggleLibrary}
        aria-pressed={libraryOpen}
      >
        Bibliothek
      </Button>

      <ToolGroup>
        {QUICK_PARTS.map((p) => (
          <ToolButton
            key={p}
            icon={partIcon(p)}
            label={PART_NAMES[p]}
            active={placing === p}
            onClick={() => {
              onPlacing(placing === p ? null : p);
              onTool("select");
            }}
          />
        ))}
      </ToolGroup>

      <ToolGroup>
        {TOOLS.map((t) => (
          <ToolButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.id && !placing} onClick={() => { onTool(t.id); onPlacing(null); }} />
        ))}
      </ToolGroup>
      <ToolGroup>
        {DRAW_TOOLS.map((t) => (
          <ToolButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.id && !placing} onClick={() => { onTool(t.id); onPlacing(null); }} />
        ))}
      </ToolGroup>
      <ToolGroup>
        {ANNOT_TOOLS.map((t) => (
          <ToolButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.id && !placing} onClick={() => { onTool(t.id); onPlacing(null); }} />
        ))}
      </ToolGroup>

      <ToolGroup>
        {probeToggle("V")}
        {probeToggle("A")}
      </ToolGroup>

      <Select
        size="sm"
        icon="probe"
        value={probeMode}
        onChange={onProbeMode}
        options={[
          { value: "live", label: "Sonden · Live" },
          { value: "static", label: "Sonden · Statisch" },
          { value: "hold", label: "Sonden · Halten" },
        ]}
      />

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <IconButton icon="grid" label="Raster" shortcut="⌘'" size="sm" active={showGrid} onClick={() => onShowGrid(!showGrid)} />
        <IconButton icon="magnet" label="Am Raster ausrichten" shortcut="⇧⌘'" size="sm" active={snapOn} onClick={() => onSnap(!snapOn)} />
        <span className="mx-1 h-4 w-px bg-hairline-strong" />
        <IconButton icon="sidebarRight" label="Inspektor" shortcut="⌥⌘I" size="sm" active={inspectorOpen} onClick={onToggleInspector} />
      </div>
    </div>
  );
}
