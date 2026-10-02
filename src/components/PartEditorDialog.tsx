"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, Plus, Trash2, X } from "lucide-react";
import {
  buildCustomGeometry,
  CustomPartSpec,
  CustomPinSpec,
  deleteCustomPart,
  loadCustomParts,
  PACKAGE_PRESETS,
  PinRole,
  PinSide,
  saveCustomPart,
} from "@/lib/library/customParts";
import { useEditor } from "@/state/editor";

function makeDefaultSpec(): CustomPartSpec {
  const preset = PACKAGE_PRESETS[0];
  return {
    id: `custom_${Date.now().toString(36)}`,
    name: "Mein IC",
    ref: "U",
    category: "Eigene Bauteile/ICs",
    footprint: preset.id,
    mount: preset.mount,
    modelKind: "ic",
    defaultValue: 5,
    pins: preset.pins.map((p) => ({ ...p })),
  };
}

export default function PartEditorDialog({
  open = true,
  onClose,
}: {
  open?: boolean;
  onClose: () => void;
}) {
  const [savedList, setSavedList] = useState<CustomPartSpec[]>(() => loadCustomParts());
  const [spec, setSpec] = useState<CustomPartSpec>(() => makeDefaultSpec());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const geometry = useMemo(() => buildCustomGeometry(spec), [spec]);

  if (!open) return null;

  const applyPackagePreset = (pkgId: string) => {
    const found = PACKAGE_PRESETS.find((p) => p.id === pkgId);
    if (!found) {
      setSpec((s) => ({ ...s, footprint: pkgId }));
      return;
    }
    setSpec((s) => ({
      ...s,
      footprint: found.id,
      mount: found.mount,
      pins: found.pins.map((p) => ({ ...p })),
    }));
  };

  const updatePin = (idx: number, patch: Partial<CustomPinSpec>) => {
    setSpec((s) => ({
      ...s,
      pins: s.pins.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const addPin = () => {
    setSpec((s) => {
      const nextNum = s.pins.length + 1;
      const side: PinSide = nextNum % 2 === 1 ? "left" : "right";
      return {
        ...s,
        pins: [...s.pins, { name: String(nextNum), side, role: "signal" }],
      };
    });
  };

  const removePin = (idx: number) => {
    if (spec.pins.length <= 2) return;
    setSpec((s) => ({
      ...s,
      pins: s.pins.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = (placeAfter: boolean) => {
    const cleanName = spec.name.trim() || "Eigenes Bauteil";
    const finalSpec: CustomPartSpec = {
      ...spec,
      name: cleanName,
      ref: (spec.ref.trim() || "U").toUpperCase(),
      pins: spec.pins.map((p, i) => ({
        ...p,
        name: p.name.trim() || String(i + 1),
      })),
    };
    const next = saveCustomPart(finalSpec);
    setSavedList(next);
    const st = useEditor.getState();
    st.log("ok", `Bauteil „${finalSpec.name}“ (${finalSpec.footprint}, ${finalSpec.pins.length} Pins) gespeichert`);
    if (placeAfter) {
      st.setPlacing(finalSpec.id);
      onClose();
    }
  };

  const handleDelete = (id: string) => {
    const next = deleteCustomPart(id);
    setSavedList(next);
    if (spec.id === id) {
      setSpec(makeDefaultSpec());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bauteile-Editor"
        className="flex h-[560px] max-h-[90vh] w-[820px] max-w-[96vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: "var(--panel-solid)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* W111: Einheitliche obere Fensterleiste */}
        <div
          className="flex h-9 shrink-0 items-center justify-between gap-2 px-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text)]">
            <Cpu size={13} className="text-mute" />
            <span>Bauteile-Editor</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Schließen (Esc)"
            aria-label="Schließen"
            className="btn h-6 px-1 py-0.5"
          >
            <X size={13} />
          </button>
        </div>

        {/* Hauptbereich: Links Vorschau & Liste, Rechts Gehäuse & Pin-Zuweisung */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Linke Spalte: Live-Vorschau (Schaltzeichen + Gehäuse) & gespeicherte Bauteile */}
          <aside
            className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto p-3.5 md:w-[250px]"
            style={{
              background: "var(--bg)",
              borderRight: "1px solid var(--border)",
            }}
          >
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-dim">
                <span>Schaltzeichen-Vorschau</span>
                <span className="mono text-[10px] text-mute">{spec.pins.length} Pins</span>
              </div>
              <div
                className="flex h-[155px] items-center justify-center rounded-lg p-2"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <SchematicSymbolPreview symbol={geometry.symbol} pins={geometry.pins} />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-dim">
                <span>Gehäuse / Footprint</span>
                <span className="mono text-[10px] text-mute">{spec.footprint}</span>
              </div>
              <div
                className="flex h-[135px] items-center justify-center rounded-lg p-2"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <PackageFootprintPreview footprint={spec.footprint} pins={spec.pins} />
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-dim">
                <span>Eigene Bauteile ({savedList.length})</span>
                <button
                  type="button"
                  className="btn h-6 gap-1 px-2 text-[10.5px]"
                  onClick={() => setSpec(makeDefaultSpec())}
                >
                  <Plus size={11} /> Neu
                </button>
              </div>
              <div className="max-h-[140px] space-y-1 overflow-y-auto pr-0.5">
                {savedList.length === 0 ? (
                  <div className="rounded-lg border px-2.5 py-2 text-[11px] text-mute" style={{ borderColor: "var(--border)" }}>
                    Noch keine eigenen Bauteile gespeichert.
                  </div>
                ) : (
                  savedList.map((item) => {
                    const active = item.id === spec.id;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-[11.5px]"
                        style={{
                          background: active ? "var(--panel-2)" : "transparent",
                          borderColor: active ? "var(--wire-sel, #f59e0b)" : "var(--border)",
                        }}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium"
                          onClick={() => setSpec({ ...item, pins: item.pins.map((p) => ({ ...p })) })}
                        >
                          {item.name}{" "}
                          <span className="mono text-[10px] text-mute">({item.footprint})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="grid h-5 w-5 shrink-0 place-items-center rounded text-mute hover:text-[var(--err)]"
                          title="Bauteil löschen"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* Rechte Spalte: Stammdaten, Gehäuse-Auswahl und Pin-Zuweisung */}
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {/* 1. Stammdaten & Gehäuse */}
            <div className="mb-3 text-[11px] font-semibold tracking-tight text-dim">
              Bauteil &amp; Gehäuse
            </div>
            <div
              className="mb-4 grid grid-cols-1 gap-2.5 rounded-lg p-3 sm:grid-cols-3"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <label className="mb-1 block text-[11px] text-mute">Bauteilname</label>
                <input
                  type="text"
                  value={spec.name}
                  onChange={(e) => setSpec((s) => ({ ...s, name: e.target.value }))}
                  placeholder="z. B. LM358, ATtiny85"
                  className="field h-7 w-full text-[12px]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-mute">Gehäuse-Vorlage</label>
                <select
                  value={spec.footprint}
                  onChange={(e) => applyPackagePreset(e.target.value)}
                  className="field h-7 w-full text-[12px]"
                >
                  {PACKAGE_PRESETS.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-mute">Referenz</label>
                  <input
                    type="text"
                    value={spec.ref}
                    maxLength={4}
                    onChange={(e) => setSpec((s) => ({ ...s, ref: e.target.value }))}
                    placeholder="U"
                    className="field mono h-7 w-full text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-mute">Montage</label>
                  <select
                    value={spec.mount}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, mount: e.target.value as CustomPartSpec["mount"] }))
                    }
                    className="field h-7 w-full text-[12px]"
                  >
                    <option value="THT">THT</option>
                    <option value="SMD">SMD</option>
                    <option value="both">THT / SMD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-mute">Kategorie in Bibliothek</label>
                <select
                  value={spec.category}
                  onChange={(e) => setSpec((s) => ({ ...s, category: e.target.value }))}
                  className="field h-7 w-full text-[12px]"
                >
                  <option value="Eigene Bauteile/ICs">Eigene Bauteile / ICs</option>
                  <option value="Eigene Bauteile/Halbleiter">Eigene Bauteile / Halbleiter</option>
                  <option value="Eigene Bauteile/Sensoren">Eigene Bauteile / Sensoren</option>
                  <option value="Eigene Bauteile/Passiv">Eigene Bauteile / Passiv</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-mute">Simulations-Verhalten</label>
                <select
                  value={spec.modelKind}
                  onChange={(e) =>
                    setSpec((s) => ({
                      ...s,
                      modelKind: e.target.value as CustomPartSpec["modelKind"],
                    }))
                  }
                  className="field h-7 w-full text-[12px]"
                >
                  <option value="ic">IC / Makromodell (nach Pin-Rolle)</option>
                  <option value="vreg">Spannungsregler (IN / GND / OUT)</option>
                  <option value="resistor">Zweipol-Widerstand (Pin 1–2)</option>
                  <option value="diode">Diodenstrecke (Pin 1=A, Pin 2=K)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-mute">
                  {spec.modelKind === "resistor" ? "Standardwert (Ω)" : "Nennspannung (V)"}
                </label>
                <input
                  type="number"
                  step="any"
                  value={spec.defaultValue ?? 5}
                  onChange={(e) =>
                    setSpec((s) => ({ ...s, defaultValue: Number(e.target.value) || 0 }))
                  }
                  className="field mono h-7 w-full text-[12px]"
                />
              </div>
            </div>

            {/* 2. Pin-Zuweisung */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-tight text-dim">
                Pin-Zuweisung (Pinout)
              </span>
              <button
                type="button"
                onClick={addPin}
                className="btn h-6 gap-1 px-2 text-[11px]"
              >
                <Plus size={12} /> Pin hinzufügen
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto rounded-lg"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
              }}
            >
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr
                    className="border-b text-[10.5px] text-mute"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <th className="w-12 px-2.5 py-1.5 font-medium">Pin</th>
                    <th className="px-2 py-1.5 font-medium">Bezeichnung</th>
                    <th className="px-2 py-1.5 font-medium">Symbol-Seite</th>
                    <th className="px-2 py-1.5 font-medium">Elektrische Funktion</th>
                    <th className="w-9 px-2 py-1.5 text-right font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {spec.pins.map((pin, idx) => (
                    <tr key={idx} style={{ borderColor: "var(--border)" }}>
                      <td className="mono px-2.5 py-1.5 text-[11px] text-mute">#{idx + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={pin.name}
                          onChange={(e) => updatePin(idx, { name: e.target.value })}
                          placeholder={`Pin ${idx + 1}`}
                          className="field mono h-6 w-full text-[11.5px]"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={pin.side}
                          onChange={(e) => updatePin(idx, { side: e.target.value as PinSide })}
                          className="field h-6 w-full text-[11.5px]"
                        >
                          <option value="left">Links</option>
                          <option value="right">Rechts</option>
                          <option value="top">Oben</option>
                          <option value="bottom">Unten</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={pin.role}
                          onChange={(e) => updatePin(idx, { role: e.target.value as PinRole })}
                          className="field h-6 w-full text-[11.5px]"
                        >
                          <option value="input">Eingang (hochohmig)</option>
                          <option value="output">Ausgang (Treiber)</option>
                          <option value="signal">Signal / Passiv</option>
                          <option value="vcc">VCC (+ Versorgung)</option>
                          <option value="gnd">GND (Masse)</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          disabled={spec.pins.length <= 2}
                          onClick={() => removePin(idx)}
                          className="grid h-6 w-6 place-items-center rounded text-mute hover:text-[var(--err)] disabled:opacity-30"
                          title="Pin entfernen"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>

        {/* Fußleiste mit Aktionen */}
        <div
          className="flex shrink-0 items-center justify-end gap-2 px-4 py-2.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button type="button" className="btn h-7 px-3 text-[12px]" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn h-7 px-3 text-[12px]"
            onClick={() => handleSave(false)}
          >
            In Bibliothek speichern
          </button>
          <button
            type="button"
            className="btn btn-primary h-7 px-3.5 text-[12px]"
            onClick={() => handleSave(true)}
          >
            Speichern &amp; platzieren
          </button>
        </div>
      </div>
    </div>
  );
}

function SchematicSymbolPreview({
  symbol,
  pins,
}: {
  symbol: ReturnType<typeof buildCustomGeometry>["symbol"];
  pins: ReturnType<typeof buildCustomGeometry>["pins"];
}) {
  let minX = -50;
  let maxX = 50;
  let minY = -40;
  let maxY = 40;
  for (const p of pins) {
    if (!p) continue;
    minX = Math.min(minX, p.x - 16);
    maxX = Math.max(maxX, p.x + 16);
    minY = Math.min(minY, p.y - 16);
    maxY = Math.max(maxY, p.y + 16);
  }
  const w = Math.max(100, maxX - minX);
  const h = Math.max(80, maxY - minY);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${minX} ${minY} ${w} ${h}`}
      className="max-h-full max-w-full"
    >
      <g stroke="var(--symbol, #e2e8f0)" fill="none" strokeWidth="1.5" strokeLinecap="round">
        {symbol.map((prim, i) => {
          if (prim.t === "rect") {
            return (
              <rect
                key={i}
                x={prim.x}
                y={prim.y}
                width={prim.w}
                height={prim.h}
                rx={prim.r ?? 0}
                fill="rgba(30, 41, 59, 0.35)"
              />
            );
          }
          if (prim.t === "line") {
            const pts: string[] = [];
            for (let k = 0; k < prim.pts.length; k += 2) {
              pts.push(`${prim.pts[k]},${prim.pts[k + 1]}`);
            }
            return <polyline key={i} points={pts.join(" ")} />;
          }
          if (prim.t === "arc") {
            return (
              <path
                key={i}
                d={`M ${prim.x - prim.r} ${prim.y} A ${prim.r} ${prim.r} 0 0 0 ${prim.x + prim.r} ${prim.y}`}
              />
            );
          }
          if (prim.t === "text") {
            return (
              <text
                key={i}
                x={prim.x}
                y={prim.y}
                fontSize={prim.size ?? 8}
                fill="var(--text)"
                stroke="none"
                textAnchor={
                  prim.align === "left" ? "start" : prim.align === "right" ? "end" : "middle"
                }
                fontFamily="ui-monospace, monospace"
              >
                {prim.s}
              </text>
            );
          }
          return null;
        })}
      </g>
      {pins.map((p, idx) =>
        p ? (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="var(--wire-sel, #f59e0b)"
          />
        ) : null,
      )}
    </svg>
  );
}

function PackageFootprintPreview({
  footprint,
  pins,
}: {
  footprint: string;
  pins: CustomPinSpec[];
}) {
  const n = pins.length;
  const isTo220 = footprint === "TO-220";
  const isTwoPin = n === 2 || footprint === "0805";

  if (isTwoPin) {
    return (
      <svg width="160" height="80" viewBox="-80 -40 160 80">
        <rect x="-42" y="-16" width="22" height="32" rx="3" fill="#f59e0b" opacity="0.75" />
        <rect x="20" y="-16" width="22" height="32" rx="3" fill="#f59e0b" opacity="0.75" />
        <rect x="-26" y="-14" width="52" height="28" rx="2" fill="#1e293b" stroke="var(--border-strong)" />
        <text x="-31" y="4" fontSize="9" fill="#fff" textAnchor="middle" fontFamily="monospace">
          {pins[0]?.name || "1"}
        </text>
        <text x="31" y="4" fontSize="9" fill="#fff" textAnchor="middle" fontFamily="monospace">
          {pins[1]?.name || "2"}
        </text>
      </svg>
    );
  }

  if (isTo220 || n === 3) {
    return (
      <svg width="170" height="105" viewBox="-85 -52 170 105">
        {/* Kühlfahne oben */}
        <rect x="-28" y="-44" width="56" height="16" rx="2" fill="#94a3b8" opacity="0.45" stroke="var(--border-strong)" />
        <circle cx="0" cy="-36" r="4" fill="var(--bg)" />
        {/* Kunststoffgehäuse */}
        <rect x="-30" y="-28" width="60" height="40" rx="3" fill="#1e293b" stroke="var(--border-strong)" />
        {[0, 1, 2].map((i) => {
          const px = -18 + i * 18;
          return (
            <g key={i}>
              <rect x={px - 2.5} y="12" width="5" height="24" rx="1" fill="#cbd5e1" />
              <text x={px} y="46" fontSize="8.5" fill="var(--text)" textAnchor="middle" fontFamily="monospace">
                {pins[i]?.name || i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // Dual-Inline (DIP / SOIC)
  const half = Math.ceil(n / 2);
  const rowPitch = Math.min(16, Math.max(10, Math.floor(88 / Math.max(half, 1))));
  const bodyH = Math.max(44, half * rowPitch + 10);
  const topY = -bodyH / 2;

  return (
    <svg width="180" height="115" viewBox={`-90 ${topY - 10} 180 ${bodyH + 20}`}>
      <rect
        x="-28"
        y={topY}
        width="56"
        height={bodyH}
        rx="3"
        fill="#1e293b"
        stroke="var(--border-strong)"
      />
      <path d={`M -7 ${topY} A 7 7 0 0 0 7 ${topY}`} fill="none" stroke="var(--text-mute)" />
      <circle cx="-18" cy={topY + 9} r="2.2" fill="var(--wire-sel, #f59e0b)" />
      {Array.from({ length: half }).map((_, i) => {
        const y = topY + 10 + i * rowPitch;
        const leftPin = pins[i];
        const rightIdx = n - 1 - i;
        const rightPin = rightIdx >= half ? pins[rightIdx] : null;
        return (
          <g key={i}>
            {/* Linkes Beinchen */}
            <rect x="-38" y={y - 2.5} width="10" height="5" rx="1" fill="#cbd5e1" />
            {leftPin && (
              <text
                x="-42"
                y={y + 2.5}
                fontSize="8"
                fill="var(--text)"
                textAnchor="end"
                fontFamily="monospace"
              >
                {i + 1}:{leftPin.name.slice(0, 5)}
              </text>
            )}
            {/* Rechtes Beinchen */}
            {rightPin && (
              <>
                <rect x="28" y={y - 2.5} width="10" height="5" rx="1" fill="#cbd5e1" />
                <text
                  x="42"
                  y={y + 2.5}
                  fontSize="8"
                  fill="var(--text)"
                  textAnchor="start"
                  fontFamily="monospace"
                >
                  {rightIdx + 1}:{rightPin.name.slice(0, 5)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
