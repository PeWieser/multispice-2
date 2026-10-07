"use client";

/* S6.2 (Phase 2): Bauteile-Editor-Shell — Doc-Swap-Vollbildmodus. Parkt den
   Haupt-Plan im Store und arbeitet mit genau einer Canvas-Instanz
   (Workbench hängt die Haupt-Canvas währenddessen aus): Schaltung zeichnen,
   Symbol gestalten, Pins und freigegebene Parameter pflegen, explizit
   speichern. Lebend-Validierung zeigt Fehler vor dem Speichern. */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircuitBoard, PenTool, Package, Save, Sliders, X } from "lucide-react";
import { useEditor } from "@/state/editor";
import type { PartDef } from "@/lib/library/catalog";
import {
  CustomPartSpec,
  collectPorts,
  derivePinsFromPorts,
  isEditorPlaceable,
  validatePartSchematic,
} from "@/lib/library/customParts";
import Canvas from "../Canvas";
import ComponentStrip from "../ComponentStrip";
import DrawingTools from "../DrawingTools";
import Inspector from "../Inspector";
import LibraryPalette from "../LibraryPalette";
import { Button, TextField } from "../ui";
import { SymbolCanvasEditor } from "./SymbolCanvas";
import { PinsPanel } from "./PinsPanel";
import { ParamLinksPanel } from "./ParamLinksPanel";

export default function PartEditorShell() {
  const tab = useEditor((s) => s.partEditor.tab);
  const dirty = useEditor((s) => s.partEditor.dirty);
  const meta = useEditor((s) => s.partEditor.meta);
  const editingId = useEditor((s) => s.partEditor.editingId);
  const doc = useEditor((s) => s.doc);
  const links = useEditor((s) => s.partEditor.links);
  const pinOverrides = useEditor((s) => s.partEditor.pinOverrides);
  const customSymbol = useEditor((s) => s.partEditor.customSymbol);
  const [confirmClose, setConfirmClose] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);

  // S6.2: stabiler Filter (Palette memoisiert darauf) — nur editingId-Wechsel baut um.
  const partFilter = useMemo(
    () => (p: PartDef) => isEditorPlaceable(p.id, editingId),
    [editingId],
  );
  const pins = useMemo(() => derivePinsFromPorts(doc, pinOverrides), [doc, pinOverrides]);
  const candidate: CustomPartSpec = useMemo(
    () => ({
      id: editingId ?? "preview_part",
      name: meta.name.trim() || "Eigenes Bauteil",
      ref: meta.ref.trim() || "U",
      category: meta.category.trim() || "Eigene Bauteile/ICs",
      footprint: meta.footprint.trim() || "DIP-8",
      mount: meta.mount,
      description: meta.description.trim() || undefined,
      modelKind: "ic",
      pins,
      customSymbol: customSymbol.length > 0 ? customSymbol : undefined,
      schematic: { ...doc, probes: [] },
      paramLinks: links.length > 0 ? links : undefined,
    }),
    [editingId, meta, pins, customSymbol, doc, links],
  );
  const issues = useMemo(() => validatePartSchematic(candidate), [candidate]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  // S6.2: Ansicht einpassen, sobald die Canvas ihr Maß kennt.
  useEffect(() => {
    const t = setTimeout(() => useEditor.getState().fitView(), 60);
    return () => clearTimeout(t);
  }, []);

  const attemptClose = () => {
    if (useEditor.getState().partEditor.dirty) setConfirmClose(true);
    else useEditor.getState().closePartEditor();
  };

  // S6.2: Strg+S speichert das Bauteil (Capture: fängt Canvas-Handler ab),
  // Esc schließt — aber erst nach Abwahl (Canvas-Handler läuft daneben).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        useEditor.getState().savePartEditor(false);
        return;
      }
      if (e.key === "Escape") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (useEditor.getState().selection.length > 0) return;
        if (useEditor.getState().placingPartId) return;
        attemptClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const tabs = (
    [
      ["circuit", "Schaltung", <CircuitBoard key="c" size={13} />],
      ["symbol", "Symbol", <PenTool key="s" size={13} />],
      ["pins", `Pins (${pins.length})`, <Package key="p" size={13} />],
      ["params", `Parameter (${links.length})`, <Sliders key="m" size={13} />],
    ] as const
  );

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-surface text-ink" role="dialog" aria-label="Bauteile-Editor">
      {/* Kopfzeile: Schließen · Titel · Status · Speichern */}
      <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-surface-2 px-3 py-2">
        <button
          type="button"
          onClick={attemptClose}
          title="Editor schließen"
          aria-label="Editor schließen"
          className="pressable ring-focus grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink"
        >
          <X size={16} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span className="truncate">Bauteile-Editor{meta.name.trim() ? ` — ${meta.name.trim()}` : ""}</span>
            {dirty && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Ungespeicherte Änderungen" />
            )}
          </div>
          <div className="text-2xs text-ink-3">
            {editingId ? "Bauteil bearbeiten" : "Neues Bauteil"} · {collectPorts(doc).length} Ports ·{" "}
            {doc.instances.length} Innenteile
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIssuesOpen((v) => !v)}
            title={errors.length > 0 ? "Prüfung: Fehler anzeigen" : warnings.length > 0 ? "Prüfung: Hinweise anzeigen" : "Prüfung bestanden"}
            aria-expanded={issuesOpen}
            className={`pressable ring-focus flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              errors.length > 0
                ? "bg-err/10 text-err"
                : warnings.length > 0
                  ? "bg-warn/10 text-warn"
                  : "bg-ok/10 text-ok"
            }`}
          >
            {errors.length > 0 || warnings.length > 0 ? <AlertTriangle size={13} /> : <Check size={13} />}
            {errors.length > 0 ? `${errors.length} Fehler` : warnings.length > 0 ? `${warnings.length} Hinweise` : "Bereit"}
            <ChevronDown size={12} className={issuesOpen ? "rotate-180" : ""} />
          </button>
          <Button size="sm" variant="ghost" onClick={() => useEditor.getState().savePartEditor(false)}>
            <Save size={13} /> Speichern
          </Button>
          <Button size="sm" onClick={() => useEditor.getState().savePartEditor(true)}>
            Speichern & Platzieren
          </Button>
        </div>
      </div>

      {/* Meta-Zeile: Grunddaten des Bauteils */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-hairline px-3 py-2 md:grid-cols-6">
        <div className="col-span-2">
          <TextField label="Name" value={meta.name} onChange={(v) => useEditor.getState().setPartEditorMeta({ name: v })} />
        </div>
        <TextField label="Kürzel" value={meta.ref} onChange={(v) => useEditor.getState().setPartEditorMeta({ ref: v })} />
        <TextField label="Kategorie" value={meta.category} onChange={(v) => useEditor.getState().setPartEditorMeta({ category: v })} />
        <TextField label="Gehäuse" value={meta.footprint} onChange={(v) => useEditor.getState().setPartEditorMeta({ footprint: v })} />
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-3">Bauform</span>
          <select
            className="input h-8 text-xs"
            value={meta.mount}
            onChange={(e) => useEditor.getState().setPartEditorMeta({ mount: e.target.value as "THT" | "SMD" | "both" })}
          >
            <option value="THT">THT</option>
            <option value="SMD">SMD</option>
            <option value="both">Beide</option>
          </select>
        </label>
      </div>

      {/* Reiter */}
      <div className="flex shrink-0 items-center gap-1 border-b border-hairline px-3 pt-1.5">
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className="tab"
            data-active={tab === id}
            onClick={() => useEditor.getState().setPartEditorTab(id)}
          >
            <span className="flex items-center gap-1.5">
              {icon} {label}
            </span>
          </button>
        ))}
      </div>

      {/* Schließen-Rückfrage bei ungespeicherten Änderungen */}
      {confirmClose && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          <AlertTriangle size={14} className="text-warn" />
          <span className="font-semibold">Ungespeicherte Änderungen — Bauteil speichern?</span>
          <span className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              onClick={() => {
                if (useEditor.getState().savePartEditor(false)) useEditor.getState().closePartEditor();
                else setConfirmClose(false);
              }}
            >
              Speichern
            </Button>
            <Button size="sm" variant="danger" onClick={() => useEditor.getState().closePartEditor()}>
              Verwerfen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>
              Abbrechen
            </Button>
          </span>
        </div>
      )}

      {/* Prüfergebnis (aufklappbar) */}
      {issuesOpen && (
        <div className="max-h-32 shrink-0 space-y-1 overflow-y-auto border-b border-hairline bg-surface-2 px-3 py-2 text-xs">
          {issues.length === 0 && <div className="text-ink-3">Keine Probleme — das Bauteil lässt sich speichern.</div>}
          {issues.slice(0, 12).map((issue, i) => (
            <button
              key={`${issue.code}-${i}`}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left pressable hover:bg-surface-3"
              onClick={() => {
                if (!issue.instanceId) return;
                const st = useEditor.getState();
                st.setPartEditorTab("circuit");
                st.setSelection([issue.instanceId]);
              }}
              title={issue.instanceId ? "Betroffenes Bauteil auswählen" : undefined}
            >
              <AlertTriangle size={12} className={issue.severity === "error" ? "shrink-0 text-err" : "shrink-0 text-warn"} />
              <span className={issue.severity === "error" ? "text-ink" : "text-ink-2"}>{issue.message}</span>
            </button>
          ))}
          {issues.length > 12 && <div className="text-2xs text-ink-3">+ {issues.length - 12} weitere</div>}
        </div>
      )}

      {/* Inhalt */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "circuit" && (
          <div className="flex min-h-0 flex-1 overflow-x-auto">
            <div className="hidden w-64 shrink-0 border-r border-hairline md:block lg:w-72">
              <LibraryPalette docked partFilter={partFilter} />
            </div>
            <div className="flex min-w-[420px] flex-1 flex-col">
              <ComponentStrip tools={<DrawingTools />} editorMode />
              <div className="relative min-h-0 flex-1">
                <Canvas />
              </div>
            </div>
            <div className="hidden w-72 shrink-0 border-l border-hairline lg:block xl:w-80">
              <Inspector />
            </div>
          </div>
        )}
        {tab === "symbol" && (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <SymbolCanvasEditor
              spec={candidate}
              onUpdateSymbol={(prims) => useEditor.getState().setPartEditorSymbol(prims)}
              onUpdatePins={(next) => {
                const st = useEditor.getState();
                next.forEach((p, i) => {
                  const cur = pins[i];
                  if (!cur || p.x === undefined || p.y === undefined) return;
                  if (p.x === cur.x && p.y === cur.y) return;
                  st.setPinOverride(cur.name, { x: p.x, y: p.y });
                });
              }}
            />
          </div>
        )}
        {tab === "pins" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PinsPanel />
          </div>
        )}
        {tab === "params" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ParamLinksPanel />
          </div>
        )}
      </div>
    </div>
  );
}
