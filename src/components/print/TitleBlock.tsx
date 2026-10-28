"use client";

import type { TitleBlockData } from "@/lib/schematic/model";
import { formatDeDate } from "@/lib/format";

const dash = (v: string) => (v.trim() ? v : "—");

function Cell({ cap, val, span }: { cap: string; val: string; span?: number }) {
  return (
    <td colSpan={span}>
      <div className="tb-cap">{cap}</div>
      <div className="tb-val">{val}</div>
    </td>
  );
}

/**
 * Druckbögen: Schriftfeld nach DIN EN ISO 7200 (eine Quelle für Druck, Export,
 * Desktop-PDF). Position unten rechts regelt das Druck-CSS (A4 hoch: volle Breite).
 */
export default function TitleBlock({
  data,
  sheet,
  of,
}: {
  data: Required<TitleBlockData>;
  sheet: string;
  of: string;
}) {
  return (
    <table className="tblock" aria-label="Schriftfeld">
      <tbody>
        <tr>
          <Cell cap="Benennung" val={dash(data.title)} span={3} />
          <Cell cap="Dokumentenart" val={dash(data.docType)} />
        </tr>
        <tr>
          <Cell cap="Sachnummer" val={dash(data.docNo)} span={3} />
          <Cell cap="Blatt" val={`${sheet} / ${of}`} />
        </tr>
        <tr>
          <Cell cap="Firma" val={dash(data.owner)} span={3} />
          <Cell cap="Maßstab" val="—" />
        </tr>
        <tr>
          <Cell cap="Erstellt von" val={dash(data.drawnBy)} />
          <Cell cap="Erstellt am" val={formatDeDate(data.drawnDate)} />
          <Cell cap="Genehmigt von" val={dash(data.approvedBy)} />
          <Cell cap="Genehmigt am" val={formatDeDate(data.approvedDate)} />
        </tr>
      </tbody>
    </table>
  );
}
