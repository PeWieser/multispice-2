"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X, Grip, FileText, ExternalLink, Zap, LayoutGrid, List, Command } from "lucide-react";
import { CategoryNode, PARTS, PART_MAP, PartDef, buildCategoryTree, getPartSymbol } from "@/lib/library/catalog";
import { useEditor, useHud } from "@/state/editor";
import { CategoryIcon } from "@/lib/library/icons";
import { getDatasheet, getDatasheetSearchUrl, getOctopartUrl } from "@/lib/library/datasheets";
import { resolveSymbolStyle } from "@/lib/settings";

// --- Symbol Preview (mini canvas) – ISO/ANSI aware, memoized ---
function SymbolPreview({ part, size = 40 }: { part: PartDef; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const symbolStylePref = useEditor((s) => s.symbolStyle);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // center
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const scale = size / 48;
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#dbe4f7";
    ctx.fillStyle = "#dbe4f7";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    let sym = part.symbol;
    try {
      sym = getPartSymbol(part, resolveSymbolStyle(symbolStylePref));
    } catch {}
    for (const prim of sym) {
      switch (prim.t) {
        case "line":
          ctx.beginPath();
          for (let i = 0; i < prim.pts.length; i += 2) {
            if (i === 0) ctx.moveTo(prim.pts[0], prim.pts[1]);
            else ctx.lineTo(prim.pts[i], prim.pts[i + 1]);
          }
          ctx.stroke();
          break;
        case "rect":
          if (prim.fill) {
            ctx.fillRect(prim.x, prim.y, prim.w, prim.h);
          } else {
            ctx.strokeRect(prim.x, prim.y, prim.w, prim.h);
          }
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(prim.x, prim.y, prim.r, 0, Math.PI * 2);
          if (prim.fill) ctx.fill();
          else ctx.stroke();
          break;
        case "arc":
          ctx.beginPath();
          ctx.arc(prim.x, prim.y, prim.r, prim.a0, prim.a1);
          ctx.stroke();
          break;
        case "text":
          ctx.font = `600 ${prim.size ?? 9}px ui-sans-serif`;
          ctx.textAlign = (prim.align as any) ?? "center";
          ctx.fillText(prim.s, prim.x, prim.y);
          break;
      }
    }
    ctx.restore();
  }, [part, size, symbolStylePref]);
  return <canvas ref={ref} className="shrink-0 rounded-[5px]" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} />;
}

// --- Advanced search with scoring ---
function scorePart(part: PartDef, tokens: string[]): number {
  let score = 0;
  const name = part.name.toLowerCase();
  const id = part.id.toLowerCase();
  const cat = part.category.toLowerCase();
  const tags = part.tags.map((t) => t.toLowerCase()).join(" ");
  const desc = (part.description ?? "").toLowerCase();

  for (const tok of tokens) {
    if (!tok) continue;
    if (id === tok) score += 100;
    else if (id.includes(tok)) score += 50;
    if (name.includes(tok)) score += 40;
    if (part.ref.toLowerCase() === tok) score += 60;
    if (part.ref.toLowerCase().includes(tok)) score += 30;
    if (cat.includes(tok)) score += 20;
    if (tags.includes(tok)) score += 25;
    if (desc.includes(tok)) score += 10;
    // command palette style: "r 10k" -> r = resistor
    if (tok === "r" && cat.includes("resistor")) score += 15;
    if (tok === "c" && cat.includes("capacitor")) score += 15;
    if (tok === "l" && cat.includes("inductor")) score += 15;
    if (tok === "d" && cat.includes("diode")) score += 15;
    if (tok === "q" && cat.includes("transistor")) score += 15;
  }
  return score;
}

function searchAdvanced(query: string): PartDef[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  const tokens = raw.split(/\s+/).filter(Boolean);
  const scored = PARTS.map((p) => ({ part: p, score: scorePart(p, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .map((x) => x.part);
  return scored;
}

// --- Part Row V2 ---
const PartRow = React.memo(function PartRow({
  part,
  onPick,
  onHover,
  selected,
}: {
  part: PartDef;
  onPick: (id: string) => void;
  onHover: (p: PartDef | null) => void;
  selected?: boolean;
}) {
  const placing = useEditor((s) => s.placingPartId);
  const favorites = useEditor((s) => s.favorites);
  const active = placing === part.id;
  const isFav = favorites.includes(part.id);
  const datasheet = getDatasheet(part.id);

  return (
    <div
      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] cursor-pointer"
      style={
        active || selected
          ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }
          : { border: "1px solid transparent" }
      }
      onClick={() => onPick(part.id)}
      onMouseEnter={() => onHover(part)}
      onMouseLeave={() => onHover(null)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/multispice-part", part.id);
        e.dataTransfer.effectAllowed = "copy";
        useHud.setState({ dragPart: part.id });
      }}
      onDragEnd={() => useHud.setState({ dragPart: null })}
      title={`${part.name} — ${part.category} — ${part.description ?? ""}`}
    >
      <SymbolPreview part={part} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-[12px] font-medium leading-[1.2]">{part.name}</span>
          <span className="rounded px-1 py-0 text-[9px] mono" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>
            {part.ref}
          </span>
          {datasheet?.direct && <span className="rounded bg-amber-500/20 px-1 py-0 text-[8px] text-amber-400">PDF</span>}
        </span>
        <span className="block truncate text-[10.5px] text-mute leading-[1.2] mt-0.5">{part.description ?? `${part.category.split("/").slice(-1)[0]} · ${part.mount} · ${part.footprint ?? ""}`}</span>
        <span className="mt-1 flex gap-1">
          <CategoryIcon category={part.category} size={12} />
          <span className="text-[9px] text-mute">{part.category.split("/").slice(-1)[0]}</span>
        </span>
      </span>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          onClick={(e) => {
            e.stopPropagation();
            const st = useEditor.getState();
            const favs = st.favorites;
            const isFavNow = favs.includes(part.id);
            const nextFavs = isFavNow ? favs.filter((f) => f !== part.id) : [part.id, ...favs].slice(0, 24);
            useEditor.setState({ favorites: nextFavs });
            try {
              localStorage.setItem("multispice.favorites", JSON.stringify(nextFavs));
            } catch {}
          }}
          title={isFav ? "Favorit entfernen" : "Favorit hinzufügen"}
        >
          <Star size={12} style={{ color: isFav ? "var(--warn)" : "var(--border-strong)" }} fill={isFav ? "currentColor" : "none"} />
        </button>
        {datasheet && (
          <a
            href={datasheet.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="grid h-5 w-5 place-items-center rounded-md text-mute hover:text-[var(--accent)]"
            title={`Datenblatt ${datasheet.manufacturer}`}
          >
            <FileText size={11} />
          </a>
        )}
      </div>
    </div>
  );
})

function TreeNode({
  node,
  depth,
  onPick,
  onHover,
  selectedId,
}: {
  node: CategoryNode;
  depth: number;
  onPick: (id: string) => void;
  onHover: (p: PartDef | null) => void;
  selectedId?: string;
}) {
  const [open, setOpen] = useState(depth < 1);
  if (!node.parts.length && !node.children.length) return null;
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-dim hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[10px] w-3">{open ? "▾" : "▸"}</span>
        <CategoryIcon category={node.path || node.name} size={14} />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[9px] text-mute">{node.parts.length + node.children.reduce((a, c) => a + c.parts.length, 0)}</span>
      </button>
      {open && (
        <div>
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} depth={depth + 1} onPick={onPick} onHover={onHover} selectedId={selectedId} />
          ))}
          {node.parts.map((p) => (
            <div key={p.id} style={{ paddingLeft: depth * 12 + 20 }}>
              <PartRow part={p} onPick={onPick} onHover={onHover} selected={selectedId === p.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LibraryPalette() {
  const open = useEditor((s) => s.libraryOpen);
  const pos = useEditor((s) => s.libraryPos);
  const size = useEditor((s) => s.librarySize);
  const setPos = useEditor((s) => s.setLibraryPos);
  const setSize = useEditor((s) => s.setLibrarySize);
  const toggle = useEditor((s) => s.toggleLibrary);
  const setPlacing = useEditor((s) => s.setPlacing);
  const favorites = useEditor((s) => s.favorites);
  const recent = useEditor((s) => s.recent);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "fav" | "recent">("all");
  const [selected, setSelected] = useState<PartDef | null>(null);
  const [hovered, setHovered] = useState<PartDef | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const activeTab = tab === "fav" ? "favorites" : tab === "recent" ? "recent" : "all";
  // Prevent re-render of list during drag – memoize results


  const detailPart = hovered ?? selected;

  const tree = useMemo(() => buildCategoryTree(PARTS), []);
  const results = useMemo(() => (query ? searchAdvanced(query) : []), [query]);

  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Smooth drag – direct DOM, no React state during move (verhindert Ruckeln)
  useEffect(() => {
    let raf = 0;
    let pendingPos: { x: number; y: number } | null = null;
    let pendingSize: { w: number; h: number } | null = null;
    const apply = () => {
      raf = 0;
      if (paletteRef.current) {
        if (pendingPos) {
          // Use transform for GPU acceleration, will-change
          paletteRef.current.style.left = pendingPos.x + "px";
          paletteRef.current.style.top = pendingPos.y + "px";
        }
        if (pendingSize) {
          paletteRef.current.style.width = pendingSize.w + "px";
          paletteRef.current.style.height = pendingSize.h + "px";
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        pendingPos = { x: dragRef.current.px + e.clientX - dragRef.current.x, y: dragRef.current.py + e.clientY - dragRef.current.y };
        if (!raf) raf = requestAnimationFrame(apply);
      }
      if (resizeRef.current) {
        pendingSize = {
          w: Math.max(320, Math.min(window.innerWidth - 20, resizeRef.current.w + e.clientX - resizeRef.current.x)),
          h: Math.max(380, Math.min(window.innerHeight - 20, resizeRef.current.h + e.clientY - resizeRef.current.y)),
        };
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    const onUp = () => {
      if (dragRef.current && pendingPos) {
        setPos(pendingPos);
      }
      if (resizeRef.current && pendingSize) {
        setSize(pendingSize);
      }
      dragRef.current = null;
      resizeRef.current = null;
      pendingPos = null;
      pendingSize = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [setPos, setSize]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggle();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        document.getElementById("lib-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  const onPick = (id: string) => {
    const current = useEditor.getState().placingPartId;
    const part = PART_MAP[id];
    if (part) setSelected(part);
    setPlacing(current === id ? null : id);
  };

  // Keyboard navigation – arrow keys + enter to place, like Multisim
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" && e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i: number) => i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i: number) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Place selected
        const list = results ?? [];
        const part = list[selectedIdx] ?? list[0];
        if (part) {
          useEditor.getState().setPlacing(part.id);
          useEditor.getState().log("info", `${part.name} zum Platzieren gewählt – Klick auf Canvas`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectedIdx, query, tab, results]);

  if (!open) return null;

  return (
    <div
      ref={paletteRef}
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl will-change-transform"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        background: "var(--panel-solid)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 px-3"
        style={{ borderBottom: "1px solid var(--border)" }}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
      >
        <Grip size={12} className="text-mute" />
        <span className="text-[12px] font-medium flex items-center gap-1.5">
          <LayoutGrid size={12} /> Bibliothek
        </span>
        <span className="flex items-center gap-1 rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[9px] text-mute border border-[var(--border)]">
          <Command size={9} />K
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-[var(--panel-2)]"
            onClick={() => setViewMode((m) => (m === "list" ? "grid" : "list"))}
            title={viewMode === "list" ? "Grid Ansicht" : "Listen Ansicht"}
          >
            {viewMode === "list" ? <LayoutGrid size={12} /> : <List size={12} />}
          </button>
          <button className="btn px-1 py-0.5 h-6" onClick={toggle} title="Schließen (Esc)">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
          <input
            id="lib-search"
            autoFocus
            className="input pl-7 pr-7 h-8 text-[12px]"
            placeholder="Suchen: 'r 10k', 'nmos', '555' – / zum Fokussieren"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-md hover:bg-[var(--panel-2)]"
              onClick={() => setQuery("")}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: "all", label: "Alle" },
            { id: "fav", label: "Favoriten" },
            { id: "recent", label: "Zuletzt" },
            { id: "passives", label: "Passiv" },
            { id: "active", label: "Aktiv" },
            { id: "ic", label: "ICs" },
          ].map((chip) => (
            <button
              key={chip.id}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] border transition-colors"
              style={
                tab === chip.id
                  ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }
                  : { background: "var(--panel-2)", color: "var(--text-dim)", borderColor: "var(--border)" }
              }
              onClick={() => {
                if (["all", "fav", "recent"].includes(chip.id)) setTab(chip.id as any);
                else setQuery(chip.label.toLowerCase());
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-2 text-[10px] text-mute">
          <span>{PARTS.length} Teile</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Zap size={10} /> {query ? `${results.length} Treffer` : "Bereit"}
          </span>
          {detailPart && <span className="ml-auto truncate">Vorschau: {detailPart.name}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          {query ? (
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute flex items-center gap-1.5">
                <Command size={10} /> {results.length} Treffer für „{query}“ – Enter zum Platzieren
              </div>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-1.5 p-1">
                  {results.map((p, idx) => (
                    <div
                      key={p.id}
                      className="rounded-lg p-2 border cursor-pointer hover:bg-[var(--panel-2)]"
                      style={{ borderColor: idx===selectedIdx ? "var(--accent)" : "var(--border)", background: idx===selectedIdx ? "var(--accent-soft)" : "var(--panel)", boxShadow: idx===selectedIdx ? "0 0 0 2px var(--accent-soft)" : "none" }}
                      onClick={() => { setSelectedIdx(idx); onPick(p.id); }}
                      onMouseEnter={() => { setHovered(p); setSelectedIdx(idx); }}
                      onMouseLeave={() => setHovered(null)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/multispice-part", p.id);
                        e.dataTransfer.effectAllowed = "copy";
                        useHud.setState({ dragPart: p.id });
                      }}
                      onDragEnd={() => useHud.setState({ dragPart: null })}
                    >
                      <div className="flex justify-center mb-1.5">
                        <SymbolPreview part={p} size={48} />
                      </div>
                      <div className="text-[11px] font-medium truncate">{p.name}</div>
                      <div className="text-[9px] text-mute truncate">{p.ref} · {p.category.split("/").slice(-1)[0]}</div>
                    </div>
                  ))}
                </div>
              ) : (
                results.map((p, idx) => <PartRow key={p.id} part={p} onPick={onPick} onHover={setHovered} selected={selected?.id === p.id || idx===selectedIdx} />)
              )}
            </div>
          ) : activeTab === "favorites" ? (
            <div>
              {favorites.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                <PartRow key={p!.id} part={p!} onPick={onPick} onHover={setHovered} selected={selected?.id === p!.id} />
              ))}
              {!favorites.length && <div className="p-6 text-center text-[12px] text-mute">Noch keine Favoriten – Stern klicken oder Rechtsklick → Favorit</div>}
            </div>
          ) : activeTab === "recent" ? (
            <div>
              {recent.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                <PartRow key={p!.id} part={p!} onPick={onPick} onHover={setHovered} selected={selected?.id === p!.id} />
              ))}
              {!recent.length && <div className="p-6 text-center text-[12px] text-mute">Noch nichts verwendet – platziere Bauteile</div>}
            </div>
          ) : (
            <div className="pt-1">
              {tree.children.map((c) => (
                <TreeNode key={c.path} node={c} depth={0} onPick={onPick} onHover={setHovered} selectedId={selected?.id} />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel – right side of palette (floating palette + detail) */}
        {detailPart && (
          <div className="hidden md:flex w-[260px] shrink-0 flex-col border-l overflow-y-auto" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
            <div className="p-3 space-y-3">
              <div className="flex justify-center">
                <SymbolPreview part={detailPart} size={96} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <CategoryIcon category={detailPart.category} size={16} />
                  <span className="text-[13px] font-semibold">{detailPart.name}</span>
                </div>
                <div className="mt-1 text-[11px] text-mute leading-snug">{detailPart.description ?? "Keine Beschreibung – generisches Bauteil"}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full px-2 py-0.5 text-[9px] border" style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                    {detailPart.ref}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] border" style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                    {detailPart.mount}
                  </span>
                  {detailPart.footprint && (
                    <span className="rounded-full px-2 py-0.5 text-[9px] border" style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                      {detailPart.footprint}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg p-2.5" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
                <div className="text-[10px] uppercase tracking-wide text-mute mb-1.5">Parameter</div>
                <div className="space-y-1">
                  {detailPart.params.slice(0, 5).map((pr) => (
                    <div key={pr.key} className="flex justify-between text-[11px]">
                      <span className="text-dim">{pr.label}</span>
                      <span className="mono text-mute">{String(pr.def)} {pr.unit ?? ""}</span>
                    </div>
                  ))}
                  {detailPart.params.length > 5 && <div className="text-[10px] text-mute">+{detailPart.params.length - 5} weitere</div>}
                </div>
              </div>

              <div className="space-y-2">
                {(() => {
                  const ds = getDatasheet(detailPart.id);
                  if (ds) {
                    return (
                      <a
                        href={ds.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium border hover:opacity-90 transition-opacity"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }}
                      >
                        <FileText size={14} /> Datenblatt – {ds.manufacturer} {ds.direct ? "(PDF)" : ""}
                        <ExternalLink size={12} className="ml-auto" />
                      </a>
                    );
                  }
                  return null;
                })()}
                <div className="grid grid-cols-2 gap-1.5">
                  <a
                    href={getDatasheetSearchUrl(detailPart.id, detailPart.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] border hover:bg-[var(--panel)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <Search size={10} /> AllDatasheet
                  </a>
                  <a
                    href={getOctopartUrl(detailPart.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] border hover:bg-[var(--panel)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <ExternalLink size={10} /> Octopart
                  </a>
                </div>
              </div>

              <div className="rounded-lg p-2 text-[10.5px] text-mute leading-snug" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)" }}>
                <div className="font-medium text-[11px] mb-1">💡 Tipp</div>
                Klick zum Platzieren, nochmal klicken zum Abbrechen. Rechtsklick → Favorit. Drag & Drop: Bauteil direkt auf die Fläche ziehen. Suche mit „r 10k“ für Widerstand 10k.
              </div>

              <button
                className="w-full rounded-lg py-2 text-[12px] font-medium border"
                style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text)" }}
                onClick={() => onPick(detailPart.id)}
              >
                {useEditor.getState().placingPartId === detailPart.id ? "Platzieren abbrechen" : `Als ${detailPart.ref} platzieren (Enter)`}
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={(e) => {
          resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
        }}
        style={{ background: "linear-gradient(135deg, transparent 50%, var(--border-strong) 50%)" }}
      />
    </div>
  );
}
