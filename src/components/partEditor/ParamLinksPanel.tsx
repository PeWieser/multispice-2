"use client";

/* S6.2 (Phase 2): Parameter-Reiter der Bauteile-Editor-Shell. Listet die
   freigegebenen Außenparameter (Inspector-Link-Schalter) mit Zielen, Werte-
   bereich und Standard — Umbenennen, Nachstellen, Lösen. */

import { PART_MAP } from "@/lib/library/catalog";
import { useEditor } from "@/state/editor";
import { Trash2, Unlink, Crosshair } from "lucide-react";
import { Checkbox, NumberField, TextField } from "../ui/Field";

export function ParamLinksPanel() {
  const links = useEditor((s) => s.partEditor.links);
  const doc = useEditor((s) => s.doc);

  if (links.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16 text-center text-xs text-ink-3">
        Keine freigegebenen Parameter.
        <div className="mt-1 text-2xs">
          Bauteil in der Schaltung anklicken, rechts bei einem Wert „Als Parameter freigeben“ wählen — der Wert wird
          von außen einstellbar.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-2.5 overflow-y-auto p-4">
      {links.map((link) => {
        const firstTarget = link.targets[0];
        const targetInst = firstTarget ? doc.instances.find((i) => i.id === firstTarget.instanceId) : undefined;
        const targetPart = targetInst ? PART_MAP[targetInst.partId] : undefined;
        const targetDef = firstTarget ? targetPart?.params.find((p) => p.key === firstTarget.key) : undefined;
        const isBool = typeof link.def === "boolean";
        const isNum = typeof link.def === "number";
        return (
          <div key={link.name} className="rounded-xl border border-hairline bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  label="Name (außen)"
                  value={link.name}
                  onChange={(v) => {
                    if (v !== link.name) useEditor.getState().updateParamLink(link.name, { name: v });
                  }}
                />
              </div>
              <button
                type="button"
                className="pressable mt-4 shrink-0 rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-err"
                title={`Parameter „${link.name}“ löschen (Innen-Werte bleiben)`}
                aria-label={`Parameter ${link.name} löschen`}
                onClick={() => useEditor.getState().deleteParamLink(link.name)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <TextField
                label="Anzeige"
                value={link.label ?? ""}
                onChange={(v) => useEditor.getState().updateParamLink(link.name, { label: v })}
              />
              <TextField
                label="Einheit"
                value={link.unit ?? ""}
                onChange={(v) => useEditor.getState().updateParamLink(link.name, { unit: v })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {isBool ? (
                <Checkbox
                  label="Standard"
                  checked={!!link.def}
                  onChange={(v) => useEditor.getState().updateParamLink(link.name, { def: v })}
                />
              ) : isNum ? (
                <NumberField
                  label="Standard"
                  value={Number(link.def)}
                  unit={link.unit}
                  onChange={(v) => useEditor.getState().updateParamLink(link.name, { def: v })}
                />
              ) : (
                <div className="col-span-2">
                  <TextField
                    label="Standard"
                    value={String(link.def)}
                    onChange={(v) => useEditor.getState().updateParamLink(link.name, { def: v })}
                  />
                </div>
              )}
              {isNum && (
                <>
                  <NumberField
                    label="Min"
                    value={link.min ?? 0}
                    onChange={(v) => useEditor.getState().updateParamLink(link.name, { min: v })}
                  />
                  <NumberField
                    label="Max"
                    value={link.max ?? 0}
                    onChange={(v) => useEditor.getState().updateParamLink(link.name, { max: v })}
                  />
                  <NumberField
                    label="Schritt"
                    value={link.step ?? 0}
                    onChange={(v) => useEditor.getState().updateParamLink(link.name, { step: v })}
                  />
                </>
              )}
            </div>
            <div className="mt-2">
              <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">
                Gesteuerte Innen-Werte ({link.targets.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {link.targets.map((t) => {
                  const inst = doc.instances.find((i) => i.id === t.instanceId);
                  const pname = inst ? (PART_MAP[inst.partId]?.params.find((p) => p.key === t.key)?.label ?? t.key) : t.key;
                  const gone = !inst;
                  return (
                    <span
                      key={`${t.instanceId}:${t.key}`}
                      className={`flex items-center gap-1 rounded-full border border-hairline bg-surface-3 py-0.5 pl-2 pr-1 text-2xs ${
                        gone ? "text-err" : "text-ink-2"
                      }`}
                      title={gone ? "Bauteil gelöscht — Ziel löst sich beim Speichern nicht auf, bitte entfernen" : `${inst?.label} · ${pname}`}
                    >
                      {!gone && (
                        <button
                          type="button"
                          className="pressable hover:text-accent"
                          title="In der Schaltung zeigen"
                          onClick={() => {
                            const st = useEditor.getState();
                            st.setPartEditorTab("circuit");
                            st.setSelection([t.instanceId]);
                          }}
                        >
                          <Crosshair size={11} />
                        </button>
                      )}
                      <span className="mono">
                        {gone ? "gelöscht" : inst?.label} · {pname}
                      </span>
                      <button
                        type="button"
                        className="pressable rounded-full p-0.5 hover:text-err"
                        title="Ziel lösen"
                        aria-label={`Ziel ${pname} lösen`}
                        onClick={() => useEditor.getState().toggleParamLink(t.instanceId, t.key)}
                      >
                        <Unlink size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
              {targetDef && targetInst && (
                <div className="mt-1 text-2xs text-ink-3">
                  Quelle: {targetInst.label} · {targetDef.label}
                  {targetDef.unit ? ` (${targetDef.unit})` : ""} — der Außenwert überschreibt die Innen-Werte beim
                  Einsetzen.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ParamLinksPanel;
