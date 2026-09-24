"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Clock, FolderTree, Layers, Search, Star, X,
} from "lucide-react";
import { CategoryNode, PARTS, PART_MAP, PartDef, buildCategoryTree, searchParts } from "@/lib/library/catalog";
import { useEditor } from "@/state/editor";

type MountFilter = "all" | "THT" | "SMD" | "virtual";

function PartRow({ part }: { part: PartDef }) {
  const setPlacing = useEditor((s) => s.setPlacing);
  const placing = useEditor((s) => s.placingPartId);
  const favorites = useEditor((s) => s.favorites);
  const active = placing === part.id;
  return (
    <button
      className="tree-row group flex w-full items-center gap-2 rounded-md py-[5px] pl-6 pr-2 text-left"
      style={active ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)" } : undefined}
      onClick={() => setPlacing(active ? null : part.id)}
      title={`${part.name} — ${part.category}`}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded border text-[9px] mono"
        style={{ borderColor: "var(--border)", color: "var(--accent-2)" }}>
        {part.ref}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px]">{part.name}</span>
      {favorites.includes(part.id) && <Star size={11} style={{ color: "var(--warn)" }} fill="currentColor" />}
      <span className="shrink-0 rounded px-1 text-[9px] mono text-mute opacity-0 group-hover:opacity-100"
        style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
        {part.mount === "virtual" ? "VIRT" : part.mount}
      </span>
    </button>
  );
}

function TreeNode({ node, depth, filter }: { node: CategoryNode; depth: number; filter: MountFilter }) {
  const [open, setOpen] = useState(depth < 1);
  const parts = node.parts.filter((p) => filter === "all" || p.mount === filter || p.mount === "both");
  const childCount = countParts(node, filter);
  if (!childCount) return null;
  return (
    <div>
      <button
        className="tree-row flex w-full items-center gap-1.5 rounded-md py-[5px] pr-2 text-left"
        style={{ paddingLeft: depth * 10 + 6 }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={13} className="shrink-0 text-mute" /> : <ChevronRight size={13} className="shrink-0 text-mute" />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{node.name}</span>
        <span className="mono text-[9.5px] text-mute">{childCount}</span>
      </button>
      {open && (
        <div>
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} depth={depth + 1} filter={filter} />
          ))}
          {parts.map((p) => (
            <PartRow key={p.id} part={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function countParts(node: CategoryNode, filter: MountFilter): number {
  const own = node.parts.filter((p) => filter === "all" || p.mount === filter || p.mount === "both").length;
  return own + node.children.reduce((a, c) => a + countParts(c, filter), 0);
}

export default function LeftSidebar() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MountFilter>("all");
  const [tab, setTab] = useState<"library" | "project">("library");
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const setSelection = useEditor((s) => s.setSelection);
  const favorites = useEditor((s) => s.favorites);
  const recent = useEditor((s) => s.recent);
  const netResult = useEditor((s) => s.netResult);
  const placing = useEditor((s) => s.placingPartId);
  const setPlacing = useEditor((s) => s.setPlacing);

  const tree = useMemo(() => buildCategoryTree(PARTS), []);
  const results = useMemo(() => (query ? searchParts(query) : []), [query]);

  return (
    <aside className="panel flex h-full w-[286px] shrink-0 flex-col" style={{ borderWidth: "0 1px 0 0" }}>
      <div className="flex items-center gap-1 px-2 pt-2">
        <button className="tab" data-active={tab === "library"} onClick={() => setTab("library")}>
          <span className="flex items-center gap-1.5">
            <Layers size={12} /> Bibliothek
          </span>
        </button>
        <button className="tab" data-active={tab === "project"} onClick={() => setTab("project")}>
          <span className="flex items-center gap-1.5">
            <FolderTree size={12} /> Projekt
          </span>
        </button>
      </div>

      {tab === "library" ? (
        <>
          <div className="px-2 py-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
              <input
                className="input pl-7"
                placeholder="Bauteile suchen (R, 555, MOSFET …)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-mute" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-1">
              {(["all", "THT", "SMD", "virtual"] as MountFilter[]).map((f) => (
                <button key={f} className="tab flex-1 text-center" data-active={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? "Alle" : f === "virtual" ? "Virtuell" : f}
                </button>
              ))}
            </div>
          </div>

          {placing && (
            <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]"
              style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)" }}>
              <span className="flex-1">Platziere <b>{PART_MAP[placing]?.name}</b> — Klick auf Canvas</span>
              <button onClick={() => setPlacing(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            {query ? (
              <div className="pt-1">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-mute">{results.length} Treffer</div>
                {results.map((p) => (
                  <PartRow key={p.id} part={p} />
                ))}
              </div>
            ) : (
              <>
                {!!favorites.length && (
                  <Section title="Favoriten" icon={<Star size={11} />}>
                    {favorites.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                      <PartRow key={"f" + p.id} part={p} />
                    ))}
                  </Section>
                )}
                {!!recent.length && (
                  <Section title="Zuletzt verwendet" icon={<Clock size={11} />}>
                    {recent.map((id) => PART_MAP[id]).filter(Boolean).map((p) => (
                      <PartRow key={"r" + p.id} part={p} />
                    ))}
                  </Section>
                )}
                <div className="pt-1">
                  {tree.children.map((c) => (
                    <TreeNode key={c.path} node={c} depth={0} filter={filter} />
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="px-3 py-2 text-[10px] text-mute" style={{ borderTop: "1px solid var(--border)" }}>
            {PARTS.length} Modelle · SPICE-Subcircuits · SMD/THT
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="mb-2 rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
            <div className="text-[12px] font-semibold">{doc.name}</div>
            <div className="mono mt-0.5 text-[10px] text-mute">
              {doc.instances.length} Bauteile · {doc.wires.length} Leitungen · {netResult.nets.length} Netze
            </div>
          </div>
          <Section title="Bauteile" icon={<Layers size={11} />}>
            {doc.instances.map((i) => (
              <button
                key={i.id}
                className="tree-row flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px]"
                style={selection.includes(i.id) ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)" } : undefined}
                onClick={() => setSelection([i.id])}
              >
                <span className="mono w-11 shrink-0 text-[10.5px]" style={{ color: "var(--accent-2)" }}>{i.label}</span>
                <span className="min-w-0 flex-1 truncate text-dim">{PART_MAP[i.partId]?.name ?? i.partId}</span>
              </button>
            ))}
          </Section>
          <Section title="Netze" icon={<FolderTree size={11} />}>
            {netResult.nets.map((n) => (
              <div key={n.name} className="flex items-center gap-2 rounded-md px-2 py-[5px] text-[12px]">
                <span className="mono w-11 shrink-0 text-[10.5px]" style={{ color: n.name === "0" ? "var(--text-mute)" : "var(--ok)" }}>{n.name}</span>
                <span className="min-w-0 flex-1 truncate text-mute">{n.pins.length} Anschlüsse</span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wide text-mute" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {icon}
        {title}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
