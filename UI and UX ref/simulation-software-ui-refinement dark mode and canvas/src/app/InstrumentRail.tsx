import { cn } from "../utils/cn";
import { Icon, type IconName } from "../ui/icons";
import { Tooltip } from "../ui/primitives";

export const INSTRUMENTS: { id: string; icon: IconName; label: string; short: string }[] = [
  { id: "osc", icon: "oscilloscope", label: "Oszilloskop", short: "XSC" },
  { id: "mm", icon: "multimeter", label: "Multimeter", short: "XMM" },
  { id: "fg", icon: "funcgen", label: "Funktionsgenerator", short: "XFG" },
  { id: "timer", icon: "timer", label: "Frequenzzähler", short: "XFC" },
  { id: "bode", icon: "bode", label: "Bode-Plotter", short: "XBP" },
  { id: "la", icon: "logicAnalyzer", label: "Logikanalysator", short: "XLA" },
  { id: "lc", icon: "logicConverter", label: "Logikkonverter", short: "XLC" },
  { id: "watt", icon: "wattmeter", label: "Wattmeter", short: "XWM" },
  { id: "spec", icon: "spectrum", label: "Spektrumanalysator", short: "XSA" },
  { id: "dist", icon: "distortion", label: "Klirrfaktormesser", short: "XDA" },
  { id: "sig", icon: "signal", label: "Signalgenerator", short: "XSG" },
];

export function InstrumentRail({ active, onToggle }: { active: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="material flex w-[46px] shrink-0 flex-col items-center gap-0.5 border-l border-hairline py-2">
      <span className="mb-1 text-[9.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Geräte</span>
      {INSTRUMENTS.map((ins, i) => {
        const on = active.includes(ins.id);
        return (
          <div key={ins.id} className="flex flex-col items-center">
            {i === 5 && <span className="my-1 h-px w-5 bg-hairline-strong" />}
            <Tooltip label={ins.label} shortcut={ins.short} side="left" delay={300}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={ins.label}
                onClick={() => onToggle(ins.id)}
                className={cn(
                  "press focus-ring relative flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
                  on && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
                )}
              >
                <Icon name={ins.icon} size={18} strokeWidth={1.6} />
                {on && <span className="absolute top-1 right-1 h-[5px] w-[5px] rounded-full bg-accent ring-2 ring-[var(--chrome)]" />}
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
