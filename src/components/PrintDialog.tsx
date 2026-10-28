"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Dialog, FieldLabel, TextField } from "./ui";
import { useEditor } from "@/state/editor";
import { PRINT_FORMAT_LABELS, resolveTitleBlock, type PrintFormat, type TitleBlockData } from "@/lib/schematic/model";
import { buildPrintPlan } from "@/lib/export/sheet";
import {
  loadPrintSetup,
  loadTitleDefaults,
  savePrintSetup,
  saveTitleDefaults,
} from "@/lib/settings";

const FORMATS: Array<{ value: PrintFormat; label: string }> = (
  ["a4p", "a4l", "a3l"] as PrintFormat[]
).map((value) => ({ value, label: PRINT_FORMAT_LABELS[value] }));

const EMPTY_TB: TitleBlockData = {
  title: "",
  docNo: "",
  owner: "",
  drawnBy: "",
  drawnDate: "",
  approvedBy: "",
  approvedDate: "",
  docType: "",
};

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="py-1.5" role="group" aria-label={label}>
      <FieldLabel>{label}</FieldLabel>
      <div className="inline-flex rounded-field bg-app border border-hairline p-0.5 text-2xs">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={`rounded-field px-2.5 py-1 font-medium transition-colors ${
                active ? "bg-surface-2 text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150"
      style={{
        background: checked ? "var(--wire-sel)" : "rgba(120, 128, 140, 0.34)",
      }}
    >
      <span
        className="inline-block h-[16px] w-[16px] rounded-full bg-white shadow transition-transform duration-150"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

/**
 * Druckbögen: zentraler Druck-Dialog (Format, Umfang, Schriftfeld). „Drucken“
 * schreibt das Schriftfeld in den Entwurf (Verlauf + Auto-Save), setzt den
 * Druckauftrag synchron und ruft erst dann window.print() auf.
 */
export default function PrintDialog({ onClose }: { onClose: () => void }) {
  const st = useEditor.getState;
  const doc = useEditor((s) => s.doc);
  const setup0 = useMemo(() => loadPrintSetup(), []);
  const resolved = useMemo(() => resolveTitleBlock(doc, loadTitleDefaults()), [doc]);
  const [format, setFormat] = useState<PrintFormat>(setup0.format);
  const [scope, setScope] = useState<"all" | "active">(setup0.scope);
  const [toc, setToc] = useState(setup0.toc);
  const [bom, setBom] = useState(setup0.bom);
  const [tb, setTb] = useState<TitleBlockData>({ ...EMPTY_TB, ...doc.titleBlock });
  const [remember, setRemember] = useState(true);

  const pages = doc.pages?.length ? doc.pages : [{ id: doc.id, name: "Seite 1" }];
  const activeName = pages.find((p) => p.id === doc.activePageId)?.name ?? pages[0].name;
  const plan = useMemo(
    () => buildPrintPlan(doc, { scope, toc, bom, format }),
    [doc, scope, toc, bom, format],
  );
  const total = plan.total;
  const formatLabel = PRINT_FORMAT_LABELS[format];

  const set = (k: keyof TitleBlockData, v: string) => setTb((s) => ({ ...s, [k]: v }));

  const doPrint = () => {
    const ticket = { format, scope, toc, bom };
    st().commit((next) => {
      next.titleBlock = { ...tb };
    });
    flushSync(() => {
      st().setPrintTicket(ticket);
    });
    savePrintSetup(ticket);
    if (remember) {
      saveTitleDefaults({
        owner: tb.owner.trim(),
        drawnBy: tb.drawnBy.trim(),
        docType: tb.docType.trim() || "Stromlaufplan",
      });
    }
    window.print();
    st().log("ok", `Druckauftrag: ${total} ${total === 1 ? "Blatt" : "Blätter"} (${formatLabel})`);
    onClose();
  };

  return (
    <Dialog
      title="Drucken"
      subtitle={[
        `${total} ${total === 1 ? "Blatt" : "Blätter"}`,
        formatLabel,
        plan.showToc ? "mit Verzeichnis" : "",
        plan.bom.length ? "mit Stückliste" : "",
      ]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={doPrint}>
            Drucken
          </button>
        </>
      }
    >
      <div className="text-2xs uppercase tracking-wide text-ink-3">Blätter</div>
      <Seg label="Papierformat" value={format} options={FORMATS} onChange={setFormat} />
      <Seg
        label="Umfang"
        value={scope}
        options={[
          { value: "all", label: `Alle Seiten (${pages.length})` },
          { value: "active", label: `Nur „${activeName}“` },
        ]}
        onChange={setScope}
      />
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-ink-2">Inhaltsverzeichnis</span>
        <Switch checked={toc} onChange={() => setToc(!toc)} label="Inhaltsverzeichnis" />
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-ink-2">Stückliste</span>
        <Switch checked={bom} onChange={() => setBom(!bom)} label="Stückliste" />
      </div>

      <div className="mt-3 text-2xs uppercase tracking-wide text-ink-3">Schriftfeld</div>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="col-span-2">
          <TextField label="Benennung" value={tb.title} placeholder={resolved.title} onChange={(v) => set("title", v)} />
        </div>
        <TextField label="Sachnummer" value={tb.docNo} placeholder={resolved.docNo} onChange={(v) => set("docNo", v)} />
        <TextField label="Dokumentenart" value={tb.docType} placeholder={resolved.docType} onChange={(v) => set("docType", v)} />
        <div className="col-span-2">
          <TextField label="Firma" value={tb.owner} placeholder={resolved.owner} onChange={(v) => set("owner", v)} />
        </div>
        <TextField label="Erstellt von" value={tb.drawnBy} placeholder={resolved.drawnBy} onChange={(v) => set("drawnBy", v)} />
        <label className="block py-1.5">
          <FieldLabel>Erstellt am</FieldLabel>
          <input
            type="date"
            aria-label="Erstellt am"
            className="input"
            value={tb.drawnDate}
            onChange={(e) => set("drawnDate", e.target.value)}
          />
        </label>
        <TextField label="Genehmigt von" value={tb.approvedBy} placeholder={resolved.approvedBy} onChange={(v) => set("approvedBy", v)} />
        <label className="block py-1.5">
          <FieldLabel>Genehmigt am</FieldLabel>
          <input
            type="date"
            aria-label="Genehmigt am"
            className="input"
            value={tb.approvedDate}
            onChange={(e) => set("approvedDate", e.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-ink-2">Firma, Name und Dokumentenart als Vorgaben merken</span>
        <Switch checked={remember} onChange={() => setRemember(!remember)} label="Firma, Name und Dokumentenart als Vorgaben merken" />
      </div>
    </Dialog>
  );
}
