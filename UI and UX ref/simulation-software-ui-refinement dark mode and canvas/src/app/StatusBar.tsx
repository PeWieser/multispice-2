import { Icon } from "../ui/icons";
import { Badge, DocumentTabs, IconButton, Slider, Tooltip } from "../ui/primitives";

export function StatusBar({
  tabs,
  activeTab,
  onTab,
  onCloseTab,
  onAddTab,
  zoom,
  onZoom,
  onFit,
  running,
  simTime,
  cursor,
  hoverNet,
  tool,
}: {
  tabs: { id: string; title: string; dirty?: boolean }[];
  activeTab: string;
  onTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  zoom: number;
  onZoom: (k: number) => void;
  onFit: () => void;
  running: boolean;
  simTime: number;
  cursor: { x: number; y: number } | null;
  hoverNet: string | null;
  tool: string;
}) {
  const pct = Math.round(zoom * 100);
  return (
    <footer className="material flex h-[36px] shrink-0 items-center gap-3 border-t border-hairline px-2">
      <DocumentTabs tabs={tabs} active={activeTab} onSelect={onTab} onClose={onCloseTab} onAdd={onAddTab} />

      <div className="flex-1" />

      {/* Context readouts */}
      <div className="tnum hidden items-center gap-3 font-mono text-[11.5px] text-ink-3 lg:flex">
        {hoverNet && (
          <span className="anim-fade flex items-center gap-1.5 text-accent">
            <Icon name="wire" size={12} />
            Netz {hoverNet}
          </span>
        )}
        {cursor && (
          <span className="w-[112px] text-right">
            {cursor.x}, {cursor.y}
          </span>
        )}
      </div>

      <Tooltip label="Elektrische Regelprüfung" side="top">
        <Badge tone="green" className="cursor-default">
          <Icon name="check" size={12} strokeWidth={2.6} />
          Prüfung ok
        </Badge>
      </Tooltip>

      <div className="flex items-center gap-1.5">
        <IconButton icon="zoomOut" label="Verkleinern" shortcut="⌘-" size="xs" onClick={() => onZoom(Math.max(0.2, zoom / 1.2))} tooltipSide="top" />
        <Slider className="w-[110px]" value={Math.log2(zoom)} min={Math.log2(0.2)} max={Math.log2(4)} step={0.01} onChange={(v) => onZoom(2 ** v)} ariaLabel="Zoom" />
        <IconButton icon="zoomIn" label="Vergrößern" shortcut="⌘+" size="xs" onClick={() => onZoom(Math.min(4, zoom * 1.2))} tooltipSide="top" />
        <Tooltip label="Auf 100 % zurücksetzen · Doppelklick: Einpassen" side="top">
          <button
            type="button"
            onClick={() => onZoom(1)}
            onDoubleClick={onFit}
            className="tnum focus-ring h-6 min-w-[48px] rounded-[6px] px-1.5 font-mono text-[11.5px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink"
          >
            {pct} %
          </button>
        </Tooltip>
      </div>

      <span className="h-4 w-px bg-hairline-strong" />

      <div className="tnum flex min-w-[120px] items-center justify-end gap-1.5 text-[12px] text-ink-2">
        {running ? (
          <>
            <span className="anim-pulse-dot h-[6px] w-[6px] rounded-full bg-green" />
            <span className="font-mono">Transient · {simTime.toFixed(2)} s</span>
          </>
        ) : (
          <>
            <span className="h-[6px] w-[6px] rounded-full bg-ink-4" />
            Bereit · {tool}
          </>
        )}
      </div>
    </footer>
  );
}
