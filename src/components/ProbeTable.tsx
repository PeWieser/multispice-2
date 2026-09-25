"use client";

import { useEffect, useMemo, useState } from "react";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor } from "@/state/editor";
import { rms, mean, peakToPeak, estimateFrequency } from "@/lib/sim/realtime";

export default function ProbeTable() {
  const probes = useEditor((s) => s.doc.probes);
  const netResult = useEditor((s) => s.netResult);
  const selection = useEditor((s) => s.selection);
  const setSelection = useEditor((s) => s.setSelection);
  const tick = useEditor((s) => s.sim.tick);
  void tick;
  const live = engine.lastState;

  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    return probes.map((pr) => {
      const netName = pr.net ?? "";
      const refName = pr.ref && pr.ref.startsWith("pr_") ? (probes.find((p) => p.id === pr.ref)?.net ?? "") : pr.ref ?? "0";
      const v = netName ? (live?.nets[netName] ?? 0) : 0;
      const refV = refName && refName !== "0" ? (live?.nets[refName] ?? 0) : 0;
      let i = 0;
      // estimate current from netCurrentMap-like logic
      const dv = refName && refName !== "0" ? v - refV : v;

      let vrms = 0,
        vpp = 0,
        vavg = 0,
        freq = 0;
      if (pr.periodic && netName) {
        try {
          const ch = engine.channel(netName, 1024);
          if (ch.v.length > 8) {
            vavg = mean(ch.v);
            vrms = rms(ch.v);
            vpp = peakToPeak(ch.v);
            freq = estimateFrequency(ch.t, ch.v);
          }
        } catch {}
      }

      return {
        id: pr.id,
        name: pr.name ?? pr.kind.toUpperCase(),
        kind: pr.kind,
        color: pr.color ?? "#fbbf24",
        net: netName,
        ref: refName,
        vdc: dv,
        vrms,
        vpp,
        vavg,
        freq,
        rawV: v,
        refV,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now/netResult sind Taktgeber: Live-Werte liest die Engine imperativ (engine.channel), nicht reaktiv.
  }, [probes, live, now, netResult]);

  if (!probes.length) {
    return (
      <div className="p-6 text-center">
        <div className="text-[13px] font-medium">Keine Messpunkte</div>
        <div className="mt-1 text-[11px] text-mute leading-snug">
          Mindestens 1 Probe empfohlen (Multisim Hinweis).<br />
          Platziere V Probe via Toolbar (gelb) oder Rechtsklick auf Leitung → Probe.
          <br />
          Probes werden automatisch zu Transient/AC Grapher hinzugefügt.
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <button className="btn text-[11px]" onClick={() => useEditor.getState().addMeasurementProbe("voltage", 200, 200)}>
            + V Probe
          </button>
          <button className="btn text-[11px]" onClick={() => useEditor.getState().addMeasurementProbe("current", 240, 200)}>
            + A Probe
          </button>
          <button className="btn text-[11px]" onClick={() => useEditor.getState().addMeasurementProbe("ref", 280, 200)}>
            + REF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" role="region" aria-label="Messpunkte Tabelle – permanente Anzeige aller Probes">
      <table className="sr-only"><caption>Probes Messwerte – Name, Typ, Netz, REF, Vdc, Vrms, Vpp, Vavg, Frequenz. Wie in Multisim permanente Anzeige neben Spannung.</caption></table>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-mute" style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
        <span>Messpunkte – Multisim-like permanente Anzeige</span>
        <span className="ml-auto mono">{rows.length} Probes</span>
        <button
          className="btn h-6 px-2 text-[10px]"
          onClick={() => {
            const csv = ["Name,Typ,Netz,REF,Vdc,Vrms,Vpp,Vavg,Freq", ...rows.map((r) => `${r.name},${r.kind},${r.net},${r.ref},${r.vdc},${r.vrms},${r.vpp},${r.vavg},${r.freq}`)].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "probes.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          CSV Export
        </button>
      </div>
      <table className="w-full text-[11px]">
        <thead className="sticky top-[33px] z-10 text-[10px] text-mute" style={{ background: "var(--panel-2)" }}>
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Name</th>
            <th className="px-2 py-1.5 text-left font-medium">Typ</th>
            <th className="px-2 py-1.5 text-left font-medium">Netz</th>
            <th className="px-2 py-1.5 text-left font-medium">REF</th>
            <th className="px-2 py-1.5 text-right font-medium">Vdc</th>
            <th className="px-2 py-1.5 text-right font-medium">Vrms</th>
            <th className="px-2 py-1.5 text-right font-medium">Vpp</th>
            <th className="px-2 py-1.5 text-right font-medium">Vavg</th>
            <th className="px-2 py-1.5 text-right font-medium">Freq</th>
          </tr>
        </thead>
        <tbody className="mono">
          {rows.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
              style={{
                borderTop: "1px solid var(--border)",
                background: selection.includes(r.id) ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
              }}
              onClick={() => setSelection([r.id])}
            >
              <td className="px-2 py-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {r.name}
                </span>
              </td>
              <td className="px-2 py-1.5 text-dim">{r.kind}</td>
              <td className="px-2 py-1.5" style={{ color: "var(--accent-2)" }}>
                {r.net || "—"}
              </td>
              <td className="px-2 py-1.5 text-mute">{r.ref || "GND"}</td>
              <td className="px-2 py-1.5 text-right">{formatValue(r.vdc, "V")}</td>
              <td className="px-2 py-1.5 text-right text-mute">{r.vrms ? formatValue(r.vrms, "V") : "—"}</td>
              <td className="px-2 py-1.5 text-right text-mute">{r.vpp ? formatValue(r.vpp, "V") : "—"}</td>
              <td className="px-2 py-1.5 text-right text-mute">{r.vavg ? formatValue(r.vavg, "V") : "—"}</td>
              <td className="px-2 py-1.5 text-right text-mute">{r.freq > 0.1 ? `${r.freq.toFixed(1)} Hz` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 text-[10px] text-mute leading-snug">
        Wie in Multisim: Voltage misst gegen GND oder REF-Probe, Differential ΔV = V+ - Vref, Power W = V·I. Periodic Checkbox in Inspector aktiviert Vrms/Vpp/Freq. Alt+Hover über Leitung zeigt Messwerte im Run-Modus.
      </div>
    </div>
  );
}
