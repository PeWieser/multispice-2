"use client";
import { useRef, type ReactNode } from "react";
import { useCB } from "@/lib/cb/store";

/** Floating, draggable, resizable window whose geometry is persisted in project.layout.windows. */
export function FloatWin({ id, title, children, w = 560, h = 380, onDock }: { id: string; title: string; children: ReactNode; w?: number; h?: number; onDock?: () => void }) {
  const s = useCB();
  const geo = s.project.layout.windows[id] ?? { x: 120 + (s.windows.indexOf(id) % 6) * 30, y: 90 + (s.windows.indexOf(id) % 6) * 30, w, h, open: true };
  const box = useRef<HTMLDivElement>(null);
  const save = (g: Partial<typeof geo>) => {
    const p = s.project;
    s.set({ project: { ...p, layout: { ...p.layout, windows: { ...p.layout.windows, [id]: { ...geo, ...g } } } }, dirty: true });
  };
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const sx = e.clientX, sy = e.clientY, ox = geo.x, oy = geo.y;
    s.openWindow(id);
    const mv = (ev: MouseEvent) => { if (box.current) { box.current.style.left = ox + ev.clientX - sx + "px"; box.current.style.top = Math.max(0, oy + ev.clientY - sy) + "px"; } };
    const up = (ev: MouseEvent) => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); save({ x: ox + ev.clientX - sx, y: Math.max(0, oy + ev.clientY - sy) }); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const onResizeEnd = () => { if (box.current) { const r = box.current; if (r.offsetWidth !== geo.w || r.offsetHeight !== geo.h) save({ w: r.offsetWidth, h: r.offsetHeight }); } };
  const z = 40 + s.windows.indexOf(id);
  return (
    <div ref={box} onMouseUp={onResizeEnd} onMouseDown={() => s.windows[s.windows.length - 1] !== id && s.openWindow(id)}
      className="fixed flex flex-col overflow-hidden rounded-md border shadow-xl"
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: z, resize: "both", background: "var(--cb-panel)", borderColor: "var(--cb-border)", minWidth: 280, minHeight: 160 }}>
      <div onMouseDown={startDrag} className="flex h-7 shrink-0 cursor-move items-center gap-2 border-b px-2 text-[12px] font-medium" style={{ borderColor: "var(--cb-border)", background: "var(--cb-toolbar)" }}>
        <span className="truncate">{title}</span>
        <span className="flex-1" />
        {onDock && <button className="cb-btn h-5 px-1.5 text-[11px]" title="Dock into bottom panel" onClick={onDock}>Dock</button>}
        <button className="cb-btn h-5 w-5 justify-center p-0 text-[12px]" title="Close" aria-label="Close window" onClick={() => s.closeWindow(id)}>×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
