"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "@/state/editor";
import { buildPrintPlan, docToSvg } from "@/lib/export/sheet";
import {
  PRINT_FORMAT_LABELS,
  offpageGroups,
  resolveTitleBlock,
  type PrintFormat,
} from "@/lib/schematic/model";
import { loadTitleDefaults } from "@/lib/settings";
import { formatDeDate } from "@/lib/format";
import TitleBlock from "./TitleBlock";

const PAGE_SIZE: Record<PrintFormat, string> = {
  a4p: "A4 portrait",
  a4l: "A4 landscape",
  a3l: "A3 landscape",
};

interface SheetDef {
  pageId: string;
  name: string;
  no: number;
  svg: string;
  parts: number;
  wires: number;
  nets: number;
  xrefs: Array<{ net: string; to: number[] }>;
}

/**
 * Druckbögen (§4): N echte Schaltblätter (Rahmen, Zonenraster, Querverweise,
 * DIN-Schriftfeld) plus Deckblatt/Verzeichnis und Stückliste als Portal direkt
 * unter <body>. Nummerierung aus einer Quelle (buildPrintPlan).
 */
export default function PrintSheet() {
  const doc = useEditor((s) => s.doc);
  const nets = useEditor((s) => s.netResult.nets);
  const ticket = useEditor((s) => s.printTicket);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // @page-Größe folgt dem Ticket (Top-Level-Regel — gilt nur für Seitenmedien).
  useEffect(() => {
    let el = document.getElementById("print-page-size");
    if (!el) {
      el = document.createElement("style");
      el.id = "print-page-size";
      document.head.appendChild(el);
    }
    el.textContent = `@page { size: ${PAGE_SIZE[ticket.format]}; margin: 0; }`;
  }, [ticket.format]);

  const model = useMemo(() => {
    const plan = buildPrintPlan(doc, ticket);
    const numOf = new Map(plan.sheets.map((s) => [s.pageId, s.blatt]));
    const groups = offpageGroups(doc);
    const single = !doc.pages || doc.pages.length <= 1;
    const sheets: SheetDef[] = plan.sheets.map((sh) => {
      const pd = sh.doc;
      const xrefs = groups
        .filter((g) => g.hits.some((h) => h.pageId === sh.pageId))
        .map((g) => ({
          net: g.display,
          to: [
            ...new Set(
              g.hits
                .map((h) => numOf.get(h.pageId))
                .filter((n): n is number => n !== undefined && n !== sh.blatt),
            ),
          ].sort((a, b) => a - b),
        }))
        .filter((x) => x.to.length > 0);
      return {
        pageId: sh.pageId,
        name: sh.name,
        no: sh.blatt,
        svg: docToSvg(pd, { frame: false, paperColor: "#ffffff", zones: true }),
        parts: pd.instances.length,
        wires: pd.wires.length,
        nets: single ? nets.length : nets.filter((n) => n.page === sh.pageId).length,
        xrefs,
      };
    });
    const tocNets = groups.map((g) => ({
      net: g.display,
      to: [
        ...new Set(
          g.hits.map((h) => numOf.get(h.pageId)).filter((n): n is number => n !== undefined),
        ),
      ].sort((a, b) => a - b),
      hanging: g.hits.length < 2,
    }));
    return {
      plan,
      sheets,
      tb: resolveTitleBlock(doc, loadTitleDefaults()),
      tocNets,
      netTotal: new Set(nets.map((n) => n.name)).size,
    };
  }, [doc, nets, ticket]);

  if (!mounted) return null;

  const { plan, sheets, tb, tocNets, netTotal } = model;
  const total = plan.total;
  const partTotal = sheets.reduce((a, s) => a + s.parts, 0);
  const wireTotal = sheets.reduce((a, s) => a + s.wires, 0);

  return createPortal(
    <div className="print-root" aria-hidden="true">
      {plan.showToc && (
        <section className={`print-sheet fmt-${ticket.format}`}>
          <span className="foldmark foldmark-top" />
          <span className="foldmark foldmark-bot" />
          <div className="sheet-frame">
            <div className="toc-wrap">
              <div className="toc-kicker">
                {tb.docType} · {PRINT_FORMAT_LABELS[ticket.format]}
              </div>
              <div className="toc-title">{tb.title || "—"}</div>
              <div className="toc-meta">
                {
                  [
                    tb.docNo ? `Sachnummer ${tb.docNo}` : "",
                    `${total} Blätter`,
                    `Stand ${formatDeDate(tb.drawnDate)}`,
                    tb.owner,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
              </div>
              <div className="toc-facts">
                <div>
                  <div className="fact-k">Erstellt von</div>
                  <div className="fact-v">{tb.drawnBy || "—"}</div>
                </div>
                <div>
                  <div className="fact-k">Erstellt am</div>
                  <div className="fact-v">{formatDeDate(tb.drawnDate)}</div>
                </div>
                <div>
                  <div className="fact-k">Genehmigt von</div>
                  <div className="fact-v">{tb.approvedBy || "—"}</div>
                </div>
                <div>
                  <div className="fact-k">Genehmigt am</div>
                  <div className="fact-v">{formatDeDate(tb.approvedDate)}</div>
                </div>
              </div>
              <div className="toc-sec">Blätter</div>
              <table className="toc-table">
                <thead>
                  <tr>
                    <th>Blatt</th>
                    <th>Seite</th>
                    <th>Bauteile</th>
                    <th>Leitungen</th>
                    <th>Netze</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.pageId}>
                      <td className="num">
                        {s.no} / {total}
                      </td>
                      <td>{s.name}</td>
                      <td className="num">{s.parts}</td>
                      <td className="num">{s.wires}</td>
                      <td className="num">{s.nets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tocNets.length > 0 && (
                <>
                  <div className="toc-sec">Netz-Verzeichnis</div>
                  <table className="toc-table">
                    <thead>
                      <tr>
                        <th>Netz</th>
                        <th>Blätter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tocNets.map((t) => (
                        <tr key={t.net}>
                          <td className="num">{t.net}</td>
                          <td className="num">
                            Bl. {t.to.join(", ")}
                            {t.hanging ? " · hängend" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="sheet-foot">
              <div className="sheet-side">
                <div className="sheet-stats">
                  Gesamt: {partTotal} Bauteile · {wireTotal} Leitungen · {netTotal}{" "}
                  Netze
                </div>
              </div>
              <TitleBlock data={tb} sheet="1" of={String(total)} />
            </div>
          </div>
        </section>
      )}
      {sheets.map((s) => (
        <section className={`print-sheet fmt-${ticket.format}`} key={s.pageId}>
          <span className="foldmark foldmark-top" />
          <span className="foldmark foldmark-bot" />
          <div className="sheet-frame">
            <div className="sheet-img" dangerouslySetInnerHTML={{ __html: s.svg }} />
            <div className="sheet-foot">
              <div className="sheet-side">
                <div className="sheet-stats">
                  {s.name} · {s.parts} Bauteile · {s.wires} Leitungen · {s.nets} Netze
                </div>
                {s.xrefs.length > 0 && (
                  <div className="sheet-xref">
                    Querverweise:{" "}
                    {s.xrefs.map((x, i) => (
                      <span key={x.net}>
                        {i > 0 && "; "}
                        <span className="mono">{x.net}</span> → Bl. {x.to.join(", ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <TitleBlock data={tb} sheet={String(s.no)} of={String(total)} />
            </div>
          </div>
        </section>
      ))}
      {plan.bom.map((rows, ci) => {
        const no = plan.bomStart + ci;
        const qty = rows.reduce((a, r) => a + r.qty, 0);
        const start = plan.bom.slice(0, ci).reduce((a, c) => a + c.length, 0);
        const part = plan.bom.length > 1 ? ` · Teil ${ci + 1} von ${plan.bom.length}` : "";
        return (
          <section className={`print-sheet fmt-${ticket.format}`} key={`bom-${ci}`}>
            <span className="foldmark foldmark-top" />
            <span className="foldmark foldmark-bot" />
            <div className="sheet-frame">
              <div className="toc-wrap">
                <div className="toc-kicker">Stückliste{part}</div>
                <div className="toc-title">{tb.title || "—"}</div>
                <div className="toc-meta">
                  {
                    [
                      tb.docNo ? `Sachnummer ${tb.docNo}` : "",
                      `${rows.length} Positionen · ${qty} Bauteile`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                </div>
                <div className="toc-sec">Positionen</div>
                <table className="toc-table">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Menge</th>
                      <th>Referenz</th>
                      <th>Bauteil</th>
                      <th>Wert</th>
                      <th className="col-foot">Footprint</th>
                      <th>Fundstellen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={`${r.ref}-${ri}`}>
                        <td className="num">{start + ri + 1}</td>
                        <td className="num">{r.qty}</td>
                        <td>{r.ref}</td>
                        <td>{r.part}</td>
                        <td className="num">{r.value || "—"}</td>
                        <td className="col-foot">{r.footprint}</td>
                        <td className="num">{r.locations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sheet-foot">
                <div className="sheet-side">
                  <div className="sheet-stats">
                    Stückliste{part}: {rows.length} Positionen · {qty} Bauteile
                  </div>
                </div>
                <TitleBlock data={tb} sheet={String(no)} of={String(total)} />
              </div>
            </div>
          </section>
        );
      })}
    </div>,
    document.body,
  );
}
