"use client";

import { useMemo, useState } from "react";
import { Dialog } from "./ui";
import { useEditor } from "@/state/editor";
import {
  CustomPartSpec,
  extractSelectionAsPart,
  registerCustomPart,
  saveCustomPart,
} from "@/lib/library/customParts";
import { PART_MAP } from "@/lib/library/catalog";

/** S3.2: Auswahl als wiederverwendbares Bauteil speichern (exakte Abbildung). */
export default function ExtractPartDialog() {
  const extractIds = useEditor((s) => s.extractIds);
  const doc = useEditor((s) => s.doc);
  const close = useEditor((s) => s.closeExtractDialog);
  const toast = useEditor((s) => s.setToast);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("U");

  const result = useMemo(
    () => (extractIds ? extractSelectionAsPart(doc, extractIds) : null),
    [doc, extractIds],
  );

  if (!extractIds || !result) return null;
  const n = extractIds.length;
  const title = `Auswahl als Bauteil speichern (${n} ${n === 1 ? "Element" : "Elemente"})`;

  const save = () => {
    const finalName = name.trim() || `Modul aus ${n} Elementen`;
    const slugBase =
      "custom_" +
      (finalName
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
        .replace(/^-+|-+$/g, "") || "modul");
    let id = slugBase;
    for (let k = 2; PART_MAP[id]; k++) id = `${slugBase}-${k}`;
    const spec: CustomPartSpec = {
      id,
      name: finalName,
      ref: (prefix.trim() || "U").toUpperCase().slice(0, 3),
      category: "Eigene Bauteile/Extrahiert",
      footprint: "—",
      mount: "THT",
      description: `Aus ${n} Elementen extrahiert (${result.instances.map((i) => i.ref).join(", ")}).`,
      modelKind: "subcircuit",
      pins: result.pins,
      subcircuit: result.subcircuit,
    };
    saveCustomPart(spec);
    registerCustomPart(spec);
    toast({ message: `„${finalName}“ gespeichert (Bibliothek → Eigene Bauteile).` });
    close();
  };

  return (
    <Dialog
      title={title}
      subtitle="Ports entstehen exakt dort, wo die Auswahl die Außenwelt berührt. Masse bleibt global."
      onClose={close}
      wide
      actions={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!result.ok} title={result.ok ? "Bauteil speichern" : "Fehler beheben (Auswahl anpassen)"}>
            Bauteil speichern
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Name
            <input
              className="h-8 rounded border border-hairline bg-surface px-2 text-xs"
              value={name}
              placeholder={`Modul aus ${n} Elementen`}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Kürzel
            <input
              className="h-8 rounded border border-hairline bg-surface px-2 text-xs mono"
              value={prefix}
              maxLength={3}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </label>
        </div>

        {result.errors.length > 0 && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs text-ink">
            <div className="mb-1 font-semibold text-red-400">Nicht extrahierbar</div>
            <ul className="list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {result.instances.length > 0 && (
          <div>
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Abbildung ({result.instances.length})</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-ink-3">
                  <th className="py-0.5 pr-2 font-medium">Ref</th>
                  <th className="py-0.5 pr-2 font-medium">Bauteil</th>
                  <th className="py-0.5 pr-2 font-medium">Element</th>
                  <th className="py-0.5 font-medium">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {result.instances.map((r) => (
                  <tr key={r.ref} className="border-t border-hairline">
                    <td className="py-1 pr-2 mono font-semibold">{r.ref}</td>
                    <td className="py-1 pr-2 text-ink-2">{r.partName}</td>
                    <td className="py-1 pr-2 mono text-ink-2">{r.mapping}</td>
                    <td className="py-1 text-ink-3">{r.note || <span className="text-green-400">exakt</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.ports.length > 0 && (
          <div>
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Ports ({result.ports.length})</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-ink-3">
                  <th className="py-0.5 pr-2 font-medium">Port</th>
                  <th className="py-0.5 pr-2 font-medium">Netz</th>
                  <th className="py-0.5 font-medium">Außen angeschlossen</th>
                </tr>
              </thead>
              <tbody>
                {result.ports.map((p) => (
                  <tr key={p.port} className="border-t border-hairline">
                    <td className="py-1 pr-2 mono font-semibold">{p.port}</td>
                    <td className="py-1 pr-2 mono text-ink-2">{p.net}</td>
                    <td className="py-1 mono text-ink-2">{p.outside.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.ok && result.ports.length === 0 && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs">
            Insellösung: kein Netz verlässt die Auswahl — das Bauteil hätte keine Ports und wäre nutzlos. Auswahl erweitern oder Außenverdrahtung prüfen.
          </div>
        )}

        {result.internalNets.length > 0 && (
          <div className="text-xs text-ink-3">
            <span className="text-2xs uppercase tracking-wide">Innen (bleiben privat): </span>
            <span className="mono">{result.internalNets.join(", ")}</span>
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-ink">
            <div className="mb-1 font-semibold text-amber-400">Übernahme-Hinweise</div>
            <ul className="list-disc pl-4">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-2xs text-ink-3">
          Symbol wird automatisch erzeugt (Box, {result.pins.length} Pins). Verschachtelung (Bauteil im Bauteil) wird nicht unterstützt.
        </p>
      </div>
    </Dialog>
  );
}
