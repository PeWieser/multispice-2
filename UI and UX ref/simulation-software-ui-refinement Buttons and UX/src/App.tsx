import React, { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import StudioView from "./views/studio";
import LibraryView from "./views/library";

type Toast = { id: number; title: string; desc?: string; icon?: React.ReactNode };

export default function App() {
  const [view, setView] = useState<"studio" | "library">("studio");
  const [dark, setDark] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toast = useCallback((title: string, desc?: string, icon?: React.ReactNode) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, title, desc, icon }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(
      () => toast("Willkommen bei SimStudio", "Leertaste startet die Simulation · ⌘K öffnet Befehle", <Check className="h-4 w-4" />),
      700
    );
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ⌘K global (Library hat keinen eigenen Key-Handler) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTraffic = (a: string) => {
    if (a === "zoom") {
      setZoomed((z) => !z);
      toast(zoomed ? "Fenster normal" : "Fenster vergrößert", undefined, <Check className="h-4 w-4" />);
    } else if (a === "min") {
      toast("Minimieren", "Das Fenster bleibt — es ist eine Demo");
    } else {
      toast("Schließen?", "Ungespeicherte Änderungen gibt es hier keine");
    }
  };

  return (
    <div className={`sim-root ${dark ? "dark" : ""} h-full`}>
      <div
        className={`flex h-full w-full ${dark ? "wallpaper-dark" : "wallpaper-light"}`}
        style={{ padding: zoomed ? 0 : undefined }}
      >
        <div className={zoomed ? "flex min-h-0 min-w-0 flex-1" : "flex min-h-0 min-w-0 flex-1 p-2 sm:p-3.5"}>
          <div
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden shadow-window"
            style={{
              background: "var(--w-bg)",
              borderRadius: zoomed ? 0 : 14,
              transition: "border-radius .25s",
            }}
          >
            {view === "studio" ? (
              <StudioView
                dark={dark} setDark={setDark} view={view} onView={setView}
                toast={toast} paletteOpen={paletteOpen} setPaletteOpen={setPaletteOpen} onTraffic={onTraffic}
              />
            ) : (
              <LibraryView
                dark={dark} setDark={setDark} view={view} onView={setView}
                toast={toast} paletteOpen={paletteOpen} setPaletteOpen={setPaletteOpen} onTraffic={onTraffic}
              />
            )}

            {/* Toasts */}
            <div className="pointer-events-none absolute bottom-[42px] left-1/2 z-[120] flex w-max max-w-[92%] -translate-x-1/2 flex-col items-center gap-2">
              {toasts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                  className="animate-toast-in pointer-events-auto flex max-w-full items-center gap-2.5 rounded-[12px] py-2 pl-2.5 pr-3.5 text-left"
                  style={{ background: "rgba(24,24,28,0.92)", backdropFilter: "blur(12px)", boxShadow: "0 12px 32px -6px rgba(0,0,0,.4), inset 0 0 0 .5px rgba(255,255,255,.12)" }}
                >
                  <span
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-white [&>svg]:h-[14px] [&>svg]:w-[14px]"
                    style={{ background: "linear-gradient(180deg,#34c759,#1e9e50)" }}
                  >
                    {t.icon ?? <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{t.title}</span>
                    {t.desc && <span className="block truncate text-[11.5px] text-white/60">{t.desc}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
