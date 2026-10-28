"use client";

import { useMemo } from "react";
import { Dialog } from "./ui";
import { useEditor } from "@/state/editor";
import { extractSelectionAsDoc } from "@/lib/library/customParts";

/** S6.3: Auswahl als Bauteil übernehmen — exakte Kopie als Schaltplan-Dokument
 * (Ports dort, wo die Auswahl die Außenwelt berührt; Masse bleibt global).
 * Weiter geht es im Bauteile-Editor (prüfen, benennen, speichern); beim
 * Speichern mit Platzieren ersetzt die Instanz die Original-Auswahl. */
export default function ExtractPartDialog() {
  const extractIds = useEditor((s) => s.extractIds);
  const doc = useEditor((s) => s.doc);
  const close = useEditor((s) => s.closeExtractDialog);

  const result = useMemo(
    () => (extractIds ? extractSelectionAsDoc(doc, extractIds) : null),
    [doc, extractIds],
  );

  if (!extractIds || !result) return null;
  const n = extractIds.length;
  const title = `Auswahl als Bauteil übernehmen (${n} ${n === 1 ? "Element" : "Elemente"})`;

  const openInEditor = () => {
    useEditor.getState().extractSelectionToEditor();
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
          <button className="btn btn-primary" onClick={openInEditor} disabled={!result.ok} title={result.ok ? "Extrakt im Bauteile-Editor prüfen" : "Fehler beheben (Auswahl anpassen)"}>
            Im Editor öffnen
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Übernahme ({result.instances.length})</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-ink-3">
                  <th className="py-0.5 pr-2 font-medium">Ref</th>
                  <th className="py-0.5 pr-2 font-medium">Bauteil</th>
                  <th className="py-0.5 font-medium">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {result.instances.map((r) => (
                  <tr key={r.ref} className="border-t border-hairline">
                    <td className="py-1 pr-2 mono font-semibold">{r.ref}</td>
                    <td className="py-1 pr-2 text-ink-2">{r.partName}</td>
                    <td className="py-1 text-ink-3">{r.note || <span className="text-green-400">exakt</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.boundary.length > 0 && (
          <div>
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Ports ({result.boundary.length})</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-ink-3">
                  <th className="py-0.5 pr-2 font-medium">Port</th>
                  <th className="py-0.5 pr-2 font-medium">Netz</th>
                  <th className="py-0.5 font-medium">Außen angeschlossen</th>
                </tr>
              </thead>
              <tbody>
                {result.boundary.map((p) => (
                  <tr key={p.port} className="border-t border-hairline">
                    <td className="py-1 pr-2 mono font-semibold">{p.port}</td>
                    <td className="py-1 pr-2 mono text-ink-2">{p.net}</td>
                    <td className="py-1 mono text-ink-2">
                      {p.labelOnly ? "nur per Name" : `${p.outsidePins.length} Pin${p.outsidePins.length === 1 ? "" : "s"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          Weiter im Bauteile-Editor: Schaltung prüfen, Name und Pins festlegen, speichern — „Speichern & Ersetzen“
          tauscht die Auswahl gegen das neue Bauteil.
        </p>
      </div>
    </Dialog>
  );
}
