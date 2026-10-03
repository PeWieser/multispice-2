import { useCallback, useState } from "react";
import { cn } from "../utils/cn";
import { Icon } from "../ui/icons";
import { Button, IconButton, MenuList, Segmented, Tooltip, useClickOutside, type MenuItem } from "../ui/primitives";

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

export function MenuBar({
  menus,
  running,
  onToggleRun,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  mode,
  onMode,
  theme,
  onTheme,
  simTime,
  onSettings,
}: {
  menus: MenuDef[];
  running: boolean;
  onToggleRun: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  mode: "editor" | "kit";
  onMode: (m: "editor" | "kit") => void;
  theme: "light" | "dark";
  onTheme: () => void;
  simTime: number;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const ref = useClickOutside<HTMLDivElement>(open !== null, close);

  return (
    <header className="material relative z-[100] flex h-[46px] shrink-0 items-center gap-1 border-b border-hairline px-2">
      {/* App identity */}
      <div className="mr-1 flex items-center gap-2 pl-1 pr-2">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[linear-gradient(145deg,#3aa0ff,#0a5fd6)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(10,95,214,0.4)]">
          <Icon name="bolt" size={13} strokeWidth={2} />
        </div>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Circuit</span>
      </div>

      {/* Menus */}
      <nav ref={ref} className="flex items-center" aria-label="Hauptmenü">
        {menus.map((m) => {
          const on = open === m.id;
          return (
            <div key={m.id} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : m.id)}
                onPointerEnter={() => open && setOpen(m.id)}
                className={cn(
                  "focus-ring h-[26px] rounded-[6px] px-2.5 text-[13px] text-ink transition-colors duration-100",
                  on ? "bg-accent text-white" : "hover:bg-ink/[0.06]",
                )}
              >
                {m.label}
              </button>
              {on && <MenuList items={m.items} onClose={close} className="absolute top-[calc(100%+4px)] left-0" />}
            </div>
          );
        })}
      </nav>

      <span className="mx-1.5 h-4 w-px bg-hairline-strong" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <IconButton icon="undo" label="Widerrufen" shortcut="⌘Z" size="sm" disabled={!canUndo} onClick={onUndo} />
        <IconButton icon="redo" label="Wiederholen" shortcut="⇧⌘Z" size="sm" disabled={!canRedo} onClick={onRedo} />
      </div>

      <span className="mx-1.5 h-4 w-px bg-hairline-strong" />

      {/* Run controls */}
      <div className="flex items-center gap-1.5">
        <Tooltip label={running ? "Simulation stoppen" : "Simulation starten"} shortcut="F5">
          <Button
            variant={running ? "destructive" : "primary"}
            size="sm"
            icon={running ? "stop" : "play"}
            onClick={onToggleRun}
            className="min-w-[82px] pl-2.5"
          >
            {running ? "Stopp" : "Start"}
          </Button>
        </Tooltip>
        <IconButton icon="pause" label="Pause" shortcut="F6" size="sm" disabled={!running} />
        {running && (
          <div className="anim-fade tnum ml-1 flex items-center gap-1.5 rounded-full bg-green/[0.12] py-0.5 pr-2.5 pl-2 font-mono text-[11.5px] font-medium text-green-deep dark:text-green">
            <span className="anim-pulse-dot h-[6px] w-[6px] rounded-full bg-green" />
            {simTime.toFixed(2)} s
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Right side */}
      <Segmented
        size="sm"
        value={mode}
        onChange={onMode}
        options={[
          { value: "editor", label: "Editor", icon: "layers" },
          { value: "kit", label: "UI-Kit", icon: "swatch" },
        ]}
      />
      <span className="mx-1.5 h-4 w-px bg-hairline-strong" />
      <IconButton icon={theme === "light" ? "moon" : "sun"} label={theme === "light" ? "Dunkles Erscheinungsbild" : "Helles Erscheinungsbild"} size="sm" onClick={onTheme} />
      <IconButton icon="gear" label="Einstellungen" shortcut="⌘," size="sm" onClick={onSettings} />
    </header>
  );
}
