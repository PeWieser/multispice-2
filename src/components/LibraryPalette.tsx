"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Search, Star, X, FileText, ExternalLink, Zap, LayoutGrid, Command, Clock, Plus } from "lucide-react";
import { CategoryNode, PARTS, PART_MAP, PartDef, buildCategoryTree, getPartSymbol, partPins } from "@/lib/library/catalog";
import { useEditor, useHud } from "@/state/editor";
import { CategoryIcon } from "@/lib/library/icons";
import { getDatasheet, getDatasheetSearchUrl, getOctopartUrl } from "@/lib/library/datasheets";
import { resolveSymbolStyle } from "@/lib/settings";
import { WINDOW_SHELL, WindowTitleBar } from "./ui";
import { withSyncNonce } from "@/lib/desktopSync";
import { mainValueParamKey, splitValueQuery } from "@/lib/library/search";
import { previewFit } from "@/lib/library/preview";
import { formatValue } from "@/lib/format";
import { useIsApple } from "@/lib/platform";

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
    let sym = part.symbol;
    try {
      sym = getPartSymbol(part, resolveSymbolStyle(symbolStylePref));
    } catch {}
    // S5.18: Symbol einpassen (ICs sind größer als die alte 48er-Norm).
    const fit = previewFit(sym, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(fit.scale, fit.scale);
    ctx.translate(-fit.cx, -fit.cy);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--symbol").trim() || "#1c1f22";
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = fit.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
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
  return <canvas ref={ref} className="shrink-0 rounded-control bg-surface-2 border border-hairline" />;
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
  const { terms: tokens } = splitValueQuery(query); // S5.17: „10k" scort nicht mit
  if (!tokens.length) return [];
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
  onSelect,
  onStartDrag,
  selected,
}: {
  part: PartDef;
  onSelect: (id: string) => void;
  onStartDrag: (id: string) => void;
  selected?: boolean;
}) {
  const placing = useEditor((s) => s.placingPartId);
  const favorites = useEditor((s) => s.favorites);
  const active = placing === part.id;
  const isFav = favorites.includes(part.id);
  const datasheet = getDatasheet(part.id);

  return (
    <div
      className="group flex w-full select-none items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] cursor-pointer"
      style={
        active || selected
          ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }
          : { border: "1px solid transparent" }
      }
      onClick={() => onSelect(part.id)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement)?.closest("button,a")) return;
        const sx = e.clientX;
        const sy = e.clientY;
        let started = false;
        const onMove = (ev: PointerEvent) => {
          if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
            started = true;
            onStartDrag(part.id);
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      onDragStart={(e) => {
        e.preventDefault();
      }}
    >
      <SymbolPreview part={part} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-xs font-medium leading-[1.2]">{part.name}</span>
          <span className="rounded px-1 py-0 text-2xs mono bg-surface-2 border border-hairline text-ink-2">
            {part.ref}
          </span>
          {datasheet?.direct && <span className="rounded bg-amber-500/20 px-1 py-0 text-2xs text-amber-400">PDF</span>}
        </span>
        <span className="block truncate text-2xs text-ink-3 leading-[1.2] mt-0.5">{part.description ?? `${part.category.split("/").slice(-1)[0]} · ${part.mount} · ${part.footprint ?? ""}`}</span>
        <span className="mt-1 flex gap-1">
          <CategoryIcon category={part.category} size={12} />
          <span className="text-2xs text-ink-3">{part.category.split("/").slice(-1)[0]}</span>
        </span>
      </span>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]"
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
          <Star size={12} style={{ color: isFav ? "var(--warn)" : "var(--hairline-strong)" }} fill={isFav ? "currentColor" : "none"} />
        </button>
        {datasheet && (
          <a
            href={datasheet.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="grid h-5 w-5 place-items-center rounded-md text-ink-3 hover:text-accent"
            title={`Datenblatt ${datasheet.manufacturer}`}
          >
            <FileText size={11} />
          </a>
        )}
      </div>
    </div>
  );
})

function CatNode({
  node,
  depth,
  selCat,
  onSel,
}: {
  node: CategoryNode;
  depth: number;
  selCat: string | null;
  onSel: (path: string) => void;
}) {
  const [open, setOpen] = useState(false); // S5.17: Kategorien starten eingeklappt
  const count = useMemo(() => {
    const flat = (n: CategoryNode): number => n.parts.length + n.children.reduce((a, c) => a + flat(c), 0);
    return flat(node);
  }, [node]);
  if (!count) return null;
  const active = selCat === node.path;
  return (
    <div>
      <div className="flex items-center">
        <button
          className="grid h-6 w-4 shrink-0 place-items-center text-2xs text-ink-3 hover:text-ink"
          style={{ marginLeft: depth * 10 }}
          onClick={() => setOpen((o) => !o)}
        >
          {node.children.length ? (open ? "▾" : "▸") : ""}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-2xs hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
          style={active ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 } : undefined}
          onClick={() => onSel(node.path)}
          title={node.name}
        >
          <CategoryIcon category={node.path || node.name} size={13} />
          <span className="truncate">{node.name}</span>
          <span className="mono ml-auto shrink-0 text-2xs text-ink-3">{count}</span>
        </button>
      </div>
      {open && node.children.map((c) => <CatNode key={c.path} node={c} depth={depth + 1} selCat={selCat} onSel={onSel} />)}
    </div>
  );
}

export default function LibraryPalette({
  onPartEditor,
  standalone = false,
}: {
  onPartEditor?: () => void;
  standalone?: boolean;
} = {}) {
  const openStore = useEditor((s) => s.libraryOpen);
  const open = standalone ? true : openStore;
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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [customRev, setCustomRev] = useState(0);
  const activeTab = tab === "fav" ? "favorites" : tab === "recent" ? "recent" : "all";
  // Prevent re-render of list during drag – memoize results

  useEffect(() => {
    const onCustom = () => setCustomRev((v) => v + 1);
    window.addEventListener("multispice-custom-parts", onCustom);
    return () => window.removeEventListener("multispice-custom-parts", onCustom);
  }, []);

  const detailPart = selected;  // W6: Detail folgt dem Klick, nicht der Maus

  const tree = useMemo(() => {
    void customRev;
    return buildCategoryTree(PARTS);
  }, [customRev]);
  const results = useMemo(() => {
    void customRev;
    return query ? searchAdvanced(query) : [];
  }, [query, customRev]);
  // Runde 12 (W22): Dreispalter – Spalte 2 zeigt die Teile der gewählten Kategorie
  const groups = useMemo(() => {
    const flat = (n: CategoryNode): PartDef[] => [...n.parts, ...n.children.flatMap(flat)];
    if (selCat) {
      const find = (n: CategoryNode): CategoryNode | null => {
        if (n.path === selCat) return n;
        for (const c of n.children) {
          const r = find(c);
          if (r) return r;
        }
        return null;
      };
      const node = find(tree);
      return node ? [{ name: node.name, parts: flat(node) }] : [];
    }
    return tree.children.map((c) => ({ name: c.name, parts: flat(c) })).filter((g) => g.parts.length > 0);
  }, [selCat, tree]);
  const visibleList = useMemo(() => {
    if (query) return results;
    if (tab === "fav") return favorites.map((id) => PART_MAP[id]).filter(Boolean) as PartDef[];
    if (tab === "recent") return recent.map((id) => PART_MAP[id]).filter(Boolean) as PartDef[];
    return groups.flatMap((g) => g.parts);
  }, [query, results, tab, favorites, recent, groups]);

  const dragRef = useRef<{ x: number; y: number; px: number; py: number; w: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const resizePending = useRef<{ w: number; h: number } | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingSizeRef = useRef<{ w: number; h: number } | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // W32a: Nach jedem Render die direkten DOM-Schreibvorgänge wiederherstellen –
  // Store-Updates dürfen ein laufendes Ziehen/Resize nicht zurückschnappen.
  useLayoutEffect(() => {
    const p = resizePending.current;
    if (paletteRef.current && p) {
      paletteRef.current.style.width = p.w + "px";
      paletteRef.current.style.height = p.h + "px";
    }
  });

  // Smooth drag – direct DOM, no React state during move (verhindert Ruckeln).
  // Runde 17 (W32a): Transform statt left/top (kein Layout pro Frame), Clamp in
  // den Viewport (kein Hängenbleiben außerhalb) + Repair nach jedem Render.
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (paletteRef.current) {
        if (pendingPosRef.current && dragRef.current) {
          paletteRef.current.style.transform = `translate3d(${pendingPosRef.current.x - dragRef.current.px}px, ${pendingPosRef.current.y - dragRef.current.py}px, 0)`;
        }
        if (pendingSizeRef.current) {
          paletteRef.current.style.width = pendingSizeRef.current.w + "px";
          paletteRef.current.style.height = pendingSizeRef.current.h + "px";
        }
      }
    };
    const clearDragFlag = () => {
      // CSS-Schutz erst nach dem nächsten Paint lösen (Commit ist dann sichtbar).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          paletteRef.current?.removeAttribute("data-windrag");
        }),
      );
    };
    const onUp = () => {
      if (dragRef.current && pendingPosRef.current && paletteRef.current) {
        // Endwerte direkt ins DOM schreiben, DANN synchron committen: React
        // schreibt denselben Wert noch vor dem Paint — kein Zwischenframe
        // mit anderer Position („Aufblitzen" nach dem Loslassen).
        paletteRef.current.style.left = pendingPosRef.current.x + "px";
        paletteRef.current.style.top = pendingPosRef.current.y + "px";
        paletteRef.current.style.transform = "";
        flushSync(() => {
          setPos(pendingPosRef.current!);
        });
      }
      if (resizeRef.current && pendingSizeRef.current) {
        flushSync(() => {
          setSize(pendingSizeRef.current!);
        });
      }
      dragRef.current = null;
      resizeRef.current = null;
      resizePending.current = null;
      pendingPosRef.current = null;
      pendingSizeRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearDragFlag();
    };
    const onMove = (e: PointerEvent) => {
      // Taste schon los (Up ging außerhalb verloren)? Anstandslos beenden,
      // statt dem Zeiger ohne Taste zu folgen (Zombie-Drag).
      if ((dragRef.current || resizeRef.current) && e.buttons === 0) {
        onUp();
        return;
      }
      if (dragRef.current) {
        // Titelleiste bleibt greifbar: mindestens 180 px horizontal,
        // 60 px vertikal im Viewport.
        pendingPosRef.current = {
          x: Math.min(window.innerWidth - 180, Math.max(180 - dragRef.current.w, dragRef.current.px + e.clientX - dragRef.current.x)),
          y: Math.min(window.innerHeight - 60, Math.max(0, dragRef.current.py + e.clientY - dragRef.current.y)),
        };
        if (!raf) raf = requestAnimationFrame(apply);
      }
      if (resizeRef.current) {
        pendingSizeRef.current = {
          w: Math.max(640, Math.min(window.innerWidth - 20, resizeRef.current.w + e.clientX - resizeRef.current.x)),
          h: Math.max(380, Math.min(window.innerHeight - 20, resizeRef.current.h + e.clientY - resizeRef.current.y)),
        };
        resizePending.current = pendingSizeRef.current;
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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

  // W132: Einfacher Klick auf ein Bauteil wählt es in der Bibliothek aus
  // (Vorschau, Datenblatt, Pins), schließt die Bibliothek aber NICHT und startet
  // noch nicht das Platzieren – das passiert erst beim Klick auf den
  // „Platzieren“-Button oder beim Klicken-und-Ziehen!
  const onSelectPart = (id: string) => {
    const part = PART_MAP[id];
    if (part) setSelected(part);
  };

  const apple = useIsApple();
  // S5.17: Such-Wert („r 10k") als Einmal-Vorbelegung fürs platzierte Teil.
  const presetFor = useCallback((id: string) => {
    const { value } = splitValueQuery(query);
    if (value === undefined) return null;
    const part = PART_MAP[id];
    const key = part ? mainValueParamKey(part) : null;
    return key ? { partId: id, params: { [key]: value } } : null;
  }, [query]);

  // W132 & W133: Nur beim Klick auf den „Platzieren“-Button (bzw. Enter) oder
  // beim Klicken-und-Ziehen eines Bauteils schließt sich die Bibliothek.
  const onConfirmPlace = useCallback(
    (id: string) => {
      const part = PART_MAP[id];
      if (part) setSelected(part);
      setPlacing(id, presetFor(id));
      useEditor.setState({ libraryOpen: false });
      if (standalone && typeof window !== "undefined") {
        // WDA-5: Eine Nonce für beide Transporte — das Hauptfenster verwirft das Duplikat.
        const msg = withSyncNonce({ type: "pick-part", partId: id });
        try {
          const bc = new BroadcastChannel("multispice-desktop-sync");
          bc.postMessage(msg);
          bc.close();
        } catch {}
        window.multispiceDesktop?.sendSync(msg);
        window.multispiceDesktop?.windowControl("close");
      }
    },
    [setPlacing, standalone, presetFor],
  );

  const onStartDragPart = (id: string) => {
    const part = PART_MAP[id];
    if (part) setSelected(part);
    setPlacing(id, presetFor(id));
    useHud.setState({ dragPart: id });
    useEditor.setState({ libraryOpen: false });
    if (standalone && typeof window !== "undefined") {
      // WDA-5: Eine Nonce für beide Transporte — das Hauptfenster verwirft das Duplikat.
      const msg = withSyncNonce({ type: "pick-part", partId: id });
      try {
        const bc = new BroadcastChannel("multispice-desktop-sync");
        bc.postMessage(msg);
        bc.close();
      } catch {}
      window.multispiceDesktop?.sendSync(msg);
      window.multispiceDesktop?.windowControl("close");
    }
  };

  // Keyboard navigation – arrow keys + enter to place, like Multisim
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" && e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i: number) => {
          const next = Math.min(visibleList.length - 1, i + 1);
          if (visibleList[next]) setSelected(visibleList[next]);
          return Math.max(0, next);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i: number) => {
          const next = Math.max(0, i - 1);
          if (visibleList[next]) setSelected(visibleList[next]);
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Place selected & auto-close library
        const list = visibleList;
        const part = selected ?? list[selectedIdx] ?? list[0];
        if (part) {
          onConfirmPlace(part.id);
          useEditor.getState().log("info", `${part.name} zum Platzieren gewählt – Klick auf Canvas (R = drehen, M = spiegeln)`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, selectedIdx, query, tab, results, visibleList, onConfirmPlace]);

  if (!open) return null;
  if (!standalone && typeof window !== "undefined" && window.multispiceDesktop?.isDesktop) {
    return null;
  }

  return (
    <div
      ref={paletteRef}
      className={
        standalone
          ? "flex h-full w-full flex-col overflow-hidden"
          : `fixed z-40 will-change-transform ${WINDOW_SHELL}`
      }
      style={
        standalone
          ? { background: "var(--surface)" }
          : { left: pos.x, top: pos.y, width: size.w, height: size.h }
      }
    >
      {!standalone && (
      <WindowTitleBar
        icon={<LayoutGrid size={12} />}
        title="Bibliothek"
        hint="Ziehen bewegt das Fenster"
        grab
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, w: paletteRef.current?.offsetWidth ?? 420 };
          // Zombie-Status aus abgebrochenen Gesten (Up außerhalb) vergessen.
          pendingPosRef.current = null;
          pendingSizeRef.current = null;
          paletteRef.current?.setAttribute("data-windrag", "");
        }}
        extra={
          <span className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-2xs text-ink-3 border border-hairline">
            {apple ? (<><Command size={9} />K</>) : "Strg+K"}
          </span>
        }
        actions={
          onPartEditor ? (
            <button
              type="button"
              className="btn h-6 gap-1 px-2 text-2xs"
              onClick={onPartEditor}
              title="Eigenes Bauteil mit Gehäuse & Pinbelegung erstellen" aria-label="Eigenes Bauteil mit Gehäuse & Pinbelegung erstellen"
            >
              <Plus size={11} />
              <span>Bauteil-Editor</span>
            </button>
          ) : undefined
        }
        onClose={toggle}
        closeLabel="Schließen (Esc)"
      />
      )}

      <div className="p-2.5 space-y-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="lib-search"
            autoFocus
            className="input h-8 text-xs"
            style={{ paddingLeft: 28, paddingRight: 28 }}
            placeholder="Suchen: 'r 10k', 'nmos', '555' – / zum Fokussieren"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-md hover:bg-surface-2"
              onClick={() => setQuery("")}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-2 text-2xs text-ink-3">
          <span>{PARTS.length} Teile</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Zap size={10} /> {query ? `${results.length} Treffer` : "Bereit"}
          </span>
          {detailPart && <span className="ml-auto truncate">Vorschau: {detailPart.name}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Spalte 1 – Navigation (Ref-1 Component Browser) */}
        <div className="hidden w-[170px] shrink-0 flex-col overflow-y-auto border-r py-1 md:flex border-hairline bg-surface-2">
          <button
            className="mx-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-2xs hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
            style={!query && tab === "all" && !selCat ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 } : undefined}
            onClick={() => { setQuery(""); setTab("all"); setSelCat(null); }}
          >
            <LayoutGrid size={12} /> Alle <span className="mono ml-auto text-2xs text-ink-3">{PARTS.length}</span>
          </button>
          <button
            className="mx-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-2xs hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
            style={!query && tab === "fav" ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 } : undefined}
            onClick={() => { setQuery(""); setTab("fav"); setSelCat(null); }}
          >
            <Star size={12} /> Favoriten <span className="mono ml-auto text-2xs text-ink-3">{favorites.length}</span>
          </button>
          <button
            className="mx-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-2xs hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
            style={!query && tab === "recent" ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 } : undefined}
            onClick={() => { setQuery(""); setTab("recent"); setSelCat(null); }}
          >
            <Clock size={12} /> Zuletzt <span className="mono ml-auto text-2xs text-ink-3">{recent.length}</span>
          </button>
          <div className="px-2 pb-1 pt-2 text-2xs uppercase tracking-wide text-ink-3">Kategorien</div>
          {tree.children.map((c) => (
            <CatNode
              key={c.path}
              node={c}
              depth={0}
              selCat={selCat}
              onSel={(path) => { setQuery(""); setTab("all"); setSelCat(path); }}
            />
          ))}
        </div>

        {/* Spalte 2 – Teileliste */}
        <div className="min-h-0 w-full overflow-y-auto px-1 pb-2 md:w-[300px] md:shrink-0">
          {query ? (
            <div>
              <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
                <Search size={10} /> {results.length} Treffer für „{query}“ – Enter zum Platzieren
              </div>
              {results.map((p, idx) => (
                <PartRow key={p.id} part={p} onSelect={onSelectPart} onStartDrag={onStartDragPart} selected={selected?.id === p.id || idx === selectedIdx} />
              ))}
            </div>
          ) : activeTab === "favorites" ? (
            <div>
              {favorites.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                <PartRow key={p!.id} part={p!} onSelect={onSelectPart} onStartDrag={onStartDragPart} selected={selected?.id === p!.id} />
              ))}
              {!favorites.length && <div className="p-6 text-center text-xs text-ink-3">Noch keine Favoriten – Stern klicken oder Rechtsklick → Favorit</div>}
            </div>
          ) : activeTab === "recent" ? (
            <div>
              {recent.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                <PartRow key={p!.id} part={p!} onSelect={onSelectPart} onStartDrag={onStartDragPart} selected={selected?.id === p!.id} />
              ))}
              {!recent.length && <div className="p-6 text-center text-xs text-ink-3">Noch nichts verwendet – platziere Bauteile</div>}
            </div>
          ) : (
            <div className="pt-1">
              {groups.map((g) => (
                <div key={g.name}>
                  {!selCat && (
                    <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-2xs uppercase tracking-wide text-ink-3">
                      <CategoryIcon category={g.name} size={11} /> {g.name}
                      <span className="mono ml-auto">{g.parts.length}</span>
                    </div>
                  )}
                  {g.parts.map((p) => (
                    <PartRow key={p.id} part={p} onSelect={onSelectPart} onStartDrag={onStartDragPart} selected={selected?.id === p.id} />
                  ))}
                </div>
              ))}
              {!groups.length && <div className="p-6 text-center text-xs text-ink-3">Keine Teile in dieser Kategorie</div>}
            </div>
          )}
        </div>

        {/* Detail Panel – right side of palette (floating palette + detail) */}
        {detailPart && (
          <div className="hidden min-w-[240px] flex-1 flex-col overflow-y-auto border-l md:flex border-hairline">
            <div className="p-3 space-y-3">
              <div className="flex justify-center">
                <SymbolPreview part={detailPart} size={96} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <CategoryIcon category={detailPart.category} size={16} />
                  <span className="text-sm font-semibold">{detailPart.name}</span>
                </div>
                <div className="mt-1 text-2xs text-ink-3 leading-snug">{detailPart.description ?? "Keine Beschreibung – generisches Bauteil"}</div>
                <button
                  className="btn btn-primary mt-2 w-full justify-center py-2 text-xs font-medium"
                  onClick={() => onConfirmPlace(detailPart.id)}
                >
                  {`Als ${detailPart.ref} platzieren (Enter)`}
                </button>
                {(() => {
                  const { value } = splitValueQuery(query);
                  const key = value !== undefined ? mainValueParamKey(detailPart) : null;
                  if (value === undefined || !key) return null;
                  const pr = detailPart.params.find((d) => d.key === key);
                  return (
                    <div className="mono mt-1.5 rounded-md px-2 py-1 text-center text-2xs text-teal" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)" }}>
                      wird als {formatValue(value, pr?.unit ?? "")} platziert
                    </div>
                  );
                })()}
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full px-2 py-0.5 text-2xs border bg-surface border-hairline text-ink-2">
                    {detailPart.ref}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-2xs border bg-surface border-hairline text-ink-2">
                    {detailPart.mount}
                  </span>
                  {detailPart.footprint && (
                    <span className="rounded-full px-2 py-0.5 text-2xs border bg-surface border-hairline text-ink-2">
                      {detailPart.footprint}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg p-2.5 bg-surface border border-hairline">
                <div className="text-2xs uppercase tracking-wide text-ink-3 mb-1.5">Parameter</div>
                <div className="space-y-1">
                  {detailPart.params.slice(0, 5).map((pr) => (
                    <div key={pr.key} className="flex justify-between text-2xs">
                      <span className="text-ink-2">{pr.label}</span>
                      <span className="mono text-ink-3">{String(pr.def)} {pr.unit ?? ""}</span>
                    </div>
                  ))}
                  {detailPart.params.length > 5 && <div className="text-2xs text-ink-3">+{detailPart.params.length - 5} weitere</div>}
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
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-2xs font-medium border hover:opacity-90 transition-opacity bg-accent text-accent-ink border-accent"
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
                    className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-2xs border hover:bg-surface border-hairline text-ink-2"
                  >
                    <Search size={10} /> AllDatasheet
                  </a>
                  <a
                    href={getOctopartUrl(detailPart.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-2xs border hover:bg-surface border-hairline text-ink-2"
                  >
                    <ExternalLink size={10} /> Octopart
                  </a>
                </div>
              </div>

              {partPins(detailPart).length > 0 && (
                <div className="rounded-lg p-2.5 bg-surface border border-hairline">
                  <div className="text-2xs uppercase tracking-wide text-ink-3 mb-1.5">Pins ({partPins(detailPart).length})</div>
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1 mono text-2xs text-ink-2">
                    {partPins(detailPart).map((pn, i) => (
                      <span key={i}>{pn.name || `Pin ${i + 1}`}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg p-2 text-2xs text-ink-3 leading-snug" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)" }}>
                <div className="font-medium text-2xs mb-1">Hinweis</div>
                Klick wählt das Bauteil zur Vorschau aus. Zum Platzieren auf „Platzieren“ klicken (Enter) oder das Bauteil direkt gedrückt auf die Schaltfläche ziehen. Suche mit „r 10k“ für Widerstand 10k (Wert mit Einheit ans Ende).
              </div>

            </div>
          </div>
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={(e) => {
          resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
          pendingPosRef.current = null;
          pendingSizeRef.current = null;
          resizePending.current = null;
          paletteRef.current?.setAttribute("data-windrag", "");
        }}
        style={{ background: "linear-gradient(135deg, transparent 50%, var(--hairline-strong) 50%)" }}
      />
    </div>
  );
}
