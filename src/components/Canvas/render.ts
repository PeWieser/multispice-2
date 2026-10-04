import { PART_MAP, SymbolPrim, formatValue, partPins, partSymbol, splitterWidth } from "@/lib/library/catalog";
import { resolveSymbolStyle } from "@/lib/settings";
import { Instance, MeasurementProbe, instanceBounds, pinPosition } from "@/lib/schematic/model";
import { engine, inferWireAngleAt, useEditor } from "@/state/editor";
import { LEGACY_PROBE_COLORS, PROBE_CSSVAR } from "@/lib/probe-style";
import { rms, mean, peakToPeak, estimateFrequency } from "@/lib/sim/realtime";
import { canvasColor } from "@/lib/canvas-theme";
import { hexAlpha, roundRect } from "./geometry";
import { resolveLiveText } from "@/lib/descbox";
import { nearestNetName } from "./hitTest";

export function drawProbe(ctx: CanvasRenderingContext2D, probe: MeasurementProbe, selected:boolean, zoom:number, live:any, netResult:any, netCurrentMap:Map<string,number>) {
  // W85: NI-Multisim-Stil für Messpunkte (Probes).
  // Jede Sonde besitzt:
  //  1. Messspitze / Kontaktpunkt (ax, ay) auf der Leitung oder am Bauteil-Pin
  //     (bei Strom-/Leistungssonde zusätzlich einen Richtungspfeil entlang der Leitung).
  //  2. Ein permanent sichtbares Anzeigekästchen bei (bx, by) mit farbigem
  //     Header (Typ-Badge + Name + Netz) und den Messwerten (im Live-Betrieb
  //     echte Messwerte, vor Simulationsstart ruhige Bereitschaftsanzeige).
  //  3. Eine durchgehende Führungs-Linie (Leader) vom nächstgelegenen Randpunkt
  //     des Anzeigekästchens exakt zur Messspitze (ax, ay).
  const col = (probe.color && !LEGACY_PROBE_COLORS.has(probe.color as string))
    ? (probe.color as string)
    : canvasColor(PROBE_CSSVAR[probe.kind] ?? "--warn");
  const ax = probe.anchorX ?? probe.x;
  const ay = probe.anchorY ?? probe.y;
  const bx = probe.x;
  const by = probe.y;
  const iz = 1 / Math.max(zoom, 0.2);

  const st = useEditor.getState();
  const autoWireDeg = inferWireAngleAt(st.doc, ax, ay);
  const baseDeg = probe.rotation !== undefined ? probe.rotation : autoWireDeg;
  const dir = probe.direction ?? 0;
  const effectiveDeg = (((baseDeg + (dir ? 180 : 0)) % 360) + 360) % 360;
  const effectiveRad = (effectiveDeg * Math.PI) / 180;
  const dirArrow =
    effectiveDeg === 90 ? "↓" : effectiveDeg === 180 ? "←" : effectiveDeg === 270 ? "↑" : "→";

  const netName = probe.net ?? nearestNetName({ x: ax, y: ay }, 20);
  let refNetName: string | null = null;
  if (probe.ref) {
    if (probe.ref.startsWith("pr_")) {
      const rp = st.doc.probes.find((p) => p.id === probe.ref);
      refNetName = rp?.net ?? rp?.ref ?? null;
    } else {
      refNetName = probe.ref;
    }
  }

  const v = live && netName ? (live.nets[netName] ?? 0) : 0;
  const refV = live && refNetName ? (live.nets[refNetName] ?? 0) : 0;

  // W99: Gerichteter Zweigstrom in Pfeilrichtung (effectiveRad) am Messpunkt (ax, ay)
  // nach dem Kirchhoffschen Knotensatz (KCL). Für 2-polige Bauteile fließt
  // live.currents[inst.label] von Pin 0 (Senke aus dem Netz) nach Pin 1 (Quelle in das Netz).
  let i = 0;
  if (live && netName) {
    const ux = Math.cos(effectiveRad);
    const uy = Math.sin(effectiveRad);
    let forwardSinkSum = 0;
    let backwardSinkSum = 0;
    let forwardCount = 0;
    let backwardCount = 0;
    for (const inst of st.doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      const devCurrent = live.currents[inst.label] ?? 0;
      for (let pIdx = 0; pIdx < partPins(part, inst.params).length; pIdx++) {
        const pNet = netResult.pinNets[`${inst.id}:${pIdx}`];
        if (pNet !== netName) continue;
        const pos = pinPosition(inst, pIdx);
        const dot = (pos.x - ax) * ux + (pos.y - ay) * uy;
        // Wie viel Strom nimmt dieser Pin aus dem Netz auf?
        let pinSink = 0;
        if (partPins(part, inst.params).length === 2) {
          pinSink = pIdx === 0 ? devCurrent : -devCurrent;
        } else {
          pinSink = pIdx === 0 ? devCurrent : -devCurrent / Math.max(1, partPins(part, inst.params).length - 1);
        }
        if (dot >= 0) {
          forwardSinkSum += pinSink;
          forwardCount++;
        } else {
          backwardSinkSum += pinSink;
          backwardCount++;
        }
      }
    }
    if (forwardCount > 0 && backwardCount > 0) {
      i = forwardSinkSum;
    } else if (forwardCount > 0) {
      i = forwardSinkSum;
    } else if (backwardCount > 0) {
      i = -backwardSinkSum;
    }
    if (Math.abs(i) < 1e-12) {
      const fallbackMag = netCurrentMap.get(netName) ?? 0;
      i = dir ? -fallbackMag : fallbackMag;
    }
  }

  let vrms = 0, vpp = 0, vavg = 0, irms = 0, ipp = 0, freq = 0;
  if (live && probe.periodic && netName) {
    try {
      const ch = engine.channel(netName, 2048);
      if (ch.v.length > 8) {
        vavg = mean(ch.v);
        vrms = rms(ch.v);
        vpp = peakToPeak(ch.v);
        freq = estimateFrequency(ch.t, ch.v);
        irms = Math.abs(i) * 0.707;
        ipp = Math.abs(i) * 2;
      }
    } catch {}
  }

  const show = probe.show ?? { vdc: true, idc: true, power: true };
  const glyphMap: Record<string, string> = {
    voltage: "V",
    current: "I",
    voltage_current: "V/I",
    power: "W",
    diff: "ΔV",
    ref: "REF",
    digital: "D",
  };
  const glyph = glyphMap[probe.kind] ?? "V";
  const hasCurrentDir =
    probe.kind === "current" || probe.kind === "power" || probe.kind === "voltage_current";
  const titleName = probe.name || glyph;
  const headerText = `${titleName}${hasCurrentDir ? ` ${dirArrow}` : ""}  ${netName ? `(${netName})` : "(—)"}`;

  const valueLines: string[] = [];
  let digCol: string | null = null;
  if (!netName) {
    valueLines.push("Nicht verbunden");
  } else if (!live) {
    if (probe.kind === "voltage") valueLines.push("V(dc): — V");
    else if (probe.kind === "current") valueLines.push(`I(${dirArrow}): — A`);
    else if (probe.kind === "voltage_current") valueLines.push(`V: — V · I(${dirArrow}): — A`);
    else if (probe.kind === "power") valueLines.push(`P(${dirArrow}): — W`);
    else if (probe.kind === "diff") valueLines.push("ΔV: — V");
    else if (probe.kind === "ref") valueLines.push(`Bezug: ${netName}`);
    else if (probe.kind === "digital") valueLines.push("Logik: —");
  } else {
    if (probe.kind === "voltage") {
      const dv = refNetName ? v - refV : v;
      if (show.vdc !== false) valueLines.push(`V(dc): ${formatValue(dv, "V")}`);
      if (probe.periodic) {
        if (show.vrms) valueLines.push(`V(rms): ${formatValue(vrms, "V")}`);
        if (show.vpp) valueLines.push(`V(p-p): ${formatValue(vpp, "V")}`);
        if (show.vavg) valueLines.push(`V(avg): ${formatValue(vavg, "V")}`);
        if (show.freq) valueLines.push(`f: ${freq.toFixed(1)} Hz`);
      }
      if (refNetName && refNetName !== "0") valueLines.push(`Ref ${refNetName}: ${formatValue(refV, "V")}`);
    } else if (probe.kind === "current") {
      if (show.idc !== false) valueLines.push(`I(${dirArrow}): ${formatValue(i, "A")}`);
      if (probe.periodic) {
        if (show.irms) valueLines.push(`I(rms): ${formatValue(irms, "A")}`);
        if (show.ipp) valueLines.push(`I(p-p): ${formatValue(ipp, "A")}`);
      }
    } else if (probe.kind === "voltage_current") {
      const dv = refNetName ? v - refV : v;
      valueLines.push(`V: ${formatValue(dv, "V")}`);
      valueLines.push(`I(${dirArrow}): ${formatValue(i, "A")}`);
      if (probe.periodic && show.vrms) valueLines.push(`Vrms ${formatValue(vrms, "V")} · Irms ${formatValue(irms, "A")}`);
    } else if (probe.kind === "power") {
      const dv = refNetName ? v - refV : v;
      const pwr = dv * i;
      valueLines.push(`P: ${formatValue(pwr, "W")}`);
      if (show.vdc !== false) valueLines.push(`${formatValue(dv, "V")} · I(${dirArrow}) ${formatValue(i, "A")}`);
    } else if (probe.kind === "diff") {
      const dv = v - refV;
      valueLines.push(`ΔV: ${formatValue(dv, "V")}`);
      if (probe.periodic) valueLines.push(`${formatValue(v, "V")} − ${formatValue(refV, "V")}`);
    } else if (probe.kind === "ref") {
      valueLines.push(`REF: ${formatValue(v, "V")}`);
    } else if (probe.kind === "digital") {
      const low = probe.thresholds?.low ?? 0.8;
      const high = probe.thresholds?.high ?? 2.0;
      const lvl = v > high ? "HIGH (1)" : v < low ? "LOW (0)" : "UNDEF (X)";
      digCol = v > high ? canvasColor("--ok") : v < low ? canvasColor("--err") : canvasColor("--warn");
      valueLines.push(`${lvl} · ${formatValue(v, "V")}`);
    }
  }
  if (!valueLines.length) valueLines.push(formatValue(v, "V"));

  ctx.save();

  // ---- 1. Kästchen-Maße in Screen-Einheiten (* iz in Welt-Einheiten) berechnen (W93: groß & klar lesbar!) ----
  ctx.font = `700 12px ui-monospace, monospace`;
  const headerW = ctx.measureText(headerText).width + 38;
  ctx.font = `600 13px ui-monospace, monospace`;
  const maxValW = Math.max(...valueLines.map((l) => ctx.measureText(l).width));
  const padX = 11;
  const headerH = 24;
  const lineH = 18;
  const boxScreenW = Math.max(132, Math.ceil(Math.max(headerW, maxValW + padX * 2)));
  const boxScreenH = headerH + valueLines.length * lineH + 9;

  const boxW = boxScreenW * iz;
  const boxH = boxScreenH * iz;
  const boxX0 = bx;
  const boxY0 = by - boxH / 2;

  // ---- 2. Gestrichelte Referenzlinie für Diff-/Ref-Sonden ----
  if (probe.kind === "diff" || (probe.kind === "voltage" && probe.ref && probe.ref !== "0")) {
    let refX = 0, refY = 0, hasRef = false;
    if (probe.ref && probe.ref.startsWith("pr_")) {
      const refProbe = st.doc.probes.find((p) => p.id === probe.ref);
      if (refProbe) {
        refX = refProbe.anchorX ?? refProbe.x;
        refY = refProbe.anchorY ?? refProbe.y;
        hasRef = true;
      }
    } else if (probe.ref && probe.ref !== "0") {
      const refNet = st.netResult.nets.find((n) => n.name === probe.ref);
      if (refNet && refNet.points.length) {
        refX = refNet.points[0].x;
        refY = refNet.points[0].y;
        hasRef = true;
      }
    }
    if (hasRef) {
      ctx.save();
      ctx.strokeStyle = col + "88";
      ctx.setLineDash([4 * iz, 3 * iz]);
      ctx.lineWidth = 1.1 * iz;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(refX, refY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ---- 3. Durchgehende Leader-Linie vom nächsten Rand des Kästchens zur Messspitze (ax, ay) ----
  const attachX = Math.max(boxX0, Math.min(boxX0 + boxW, ax));
  const attachY = Math.max(boxY0, Math.min(boxY0 + boxH, ay));
  const distToAnchor = Math.hypot(ax - attachX, ay - attachY);

  if (distToAnchor > 2 * iz) {
    const angle = Math.atan2(ay - attachY, ax - attachX);
    ctx.save();
    ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
    ctx.lineWidth = (selected ? 1.5 : 1.15) * iz;
    if (!netName || probe.leader === "magnifier") {
      ctx.setLineDash([3.5 * iz, 2.5 * iz]);
    }
    ctx.beginPath();
    ctx.moveTo(attachX, attachY);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pfeilspitze am Messpunkt (ax, ay)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = selected ? canvasColor("--wire-sel") : col;
    const as = 5.5 * iz;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-as, -as * 0.52);
    ctx.lineTo(-as, as * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---- 4. Messspitze / Kontaktpunkt auf der Leitung (ax, ay) + W99 Stromzange & Richtungspfeil ----
  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(iz, iz);

  if (hasCurrentDir) {
    const strokeCol = selected ? canvasColor("--wire-sel") : col;
    ctx.save();
    ctx.rotate(effectiveRad);

    // 4a) Stromzangen-Hülse (Current Clamp Ring) um die Leitung bei (0, 0)
    ctx.fillStyle = canvasColor("--surface");
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = selected ? 2.2 : 1.7;
    roundRect(ctx, -4.5, -7.5, 9, 15, 4);
    ctx.fill();
    ctx.stroke();

    // 4b) Kontrastreiches Richtungs-Pfeil-Schild ("I ━━▶") parallel zur Leitung
    const badgeY = -18;
    ctx.fillStyle = canvasColor("--surface");
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = selected ? 2.0 : 1.5;
    roundRect(ctx, -18, badgeY - 7.5, 36, 15, 7.5);
    ctx.fill();
    ctx.stroke();

    // Kräftiger Richtungspfeil im Schild + direkt auf der Leitung
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-11, badgeY);
    ctx.lineTo(6, badgeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, badgeY);
    ctx.lineTo(4.5, badgeY - 4.5);
    ctx.lineTo(4.5, badgeY + 4.5);
    ctx.closePath();
    ctx.fill();

    // Zusätzlich direkter Richtungspfeil unmittelbar auf der Leitung vor der Stromzange
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(5.5, -4.5);
    ctx.lineTo(5.5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Kontaktpunkt auf der Leitung
  ctx.fillStyle = canvasColor("--surface");
  ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.lineWidth = selected ? 1.8 : 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, selected ? 4.2 : 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- 5. Permanentes Multisim-Anzeigekästchen bei (boxX0, boxY0) (W93: groß & kontrastreich) ----
  ctx.save();
  ctx.translate(boxX0, boxY0);
  ctx.scale(iz, iz);

  // Kästchen-Hintergrund & Rahmen
  ctx.fillStyle = canvasColor("--surface");
  roundRect(ctx, 0, 0, boxScreenW, boxScreenH, 7);
  ctx.fill();

  // Farbige Kopfzeile im Kästchen
  ctx.save();
  roundRect(ctx, 0, 0, boxScreenW, headerH, 7);
  ctx.clip();
  ctx.fillStyle = col + "28";
  ctx.fillRect(0, 0, boxScreenW, headerH);
  ctx.restore();

  // Trennlinie unter dem Header
  ctx.strokeStyle = col + "55";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(boxScreenW, headerH);
  ctx.stroke();

  // Außenrahmen (hervorgehoben bei Auswahl)
  ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.lineWidth = selected ? 2.2 : 1.4;
  roundRect(ctx, 0, 0, boxScreenW, boxScreenH, 7);
  ctx.stroke();

  // Typ-Badge + Header-Text
  ctx.fillStyle = col;
  roundRect(ctx, 6, 4, 22, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 10.5px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph.slice(0, 2), 17, 12.2);

  ctx.fillStyle = canvasColor("--ink");
  ctx.font = `700 12px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(headerText, 34, 12.2);

  if (digCol) {
    ctx.fillStyle = digCol;
    ctx.beginPath();
    ctx.arc(boxScreenW - 11, 12, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Messwert-Zeilen
  ctx.font = `600 13px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = !netName || !live ? canvasColor("--ink-3") : canvasColor("--ink");
  valueLines.forEach((ln, idx) => {
    ctx.fillText(ln, padX, headerH + 5 + idx * lineH);
  });

  ctx.restore();
  ctx.restore();
}

/**
 * S5.6c: Beschreibungsbox-Karte — Notizkarten-Look (W117), aber Petrol-Akzent
 * und Live-Platzhalter ({V(OUT)} …). Rotation wird ignoriert (Doku-Kasten);
 * die Trefferbox bleibt das Symbol-Rechteck (180×80, min. Kartengröße).
 */
export function drawDescBox(ctx: CanvasRenderingContext2D, inst: Instance, selected:boolean, zoom:number, live:any) {
  const textDef = String(PART_MAP["descbox"]?.params.find((p) => p.key === "text")?.def ?? "");
  const sizeDef = Number(PART_MAP["descbox"]?.params.find((p) => p.key === "size")?.def ?? 11);
  const sz = Math.max(8, Math.min(24, Number(inst.params.size ?? sizeDef)));
  const lines = resolveLiveText(String(inst.params.text ?? textDef), live).split(/\r?\n/);
  const lineH = sz + 5;
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = `500 ${sz}px ui-sans-serif, system-ui`;
  let maxTw = 48;
  for (const ln of lines) {
    const wLn = ctx.measureText(ln).width;
    if (wLn > maxTw) maxTw = wLn;
  }
  const cardW = Math.max(180, Math.ceil(maxTw + 24));
  const cardH = Math.max(80, 18 + lines.length * lineH + 8);
  const cardX = inst.x - cardW / 2;
  const cardY = inst.y - cardH / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  roundRect(ctx, cardX + 1.5, cardY + 2, cardW, cardH, 6);
  ctx.fill();

  ctx.fillStyle = canvasColor("--surface");
  roundRect(ctx, cardX, cardY, cardW, cardH, 6);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cardX, cardY, cardW, cardH, 6);
  ctx.clip();
  ctx.fillStyle = canvasColor("--teal");
  ctx.fillRect(cardX, cardY, 3.5, cardH);
  ctx.restore();

  ctx.strokeStyle = selected ? canvasColor("--wire-sel") : canvasColor("--hairline-strong");
  ctx.lineWidth = (selected ? 1.8 : 1.1) / Math.max(zoom, 0.35);
  roundRect(ctx, cardX, cardY, cardW, cardH, 6);
  ctx.stroke();

  ctx.font = "700 8px ui-monospace, monospace";
  ctx.fillStyle = canvasColor("--teal");
  ctx.fillText("INFO", cardX + 10, cardY + 11);

  ctx.font = `500 ${sz}px ui-sans-serif, system-ui`;
  ctx.fillStyle = canvasColor("--ink");
  for (let li = 0; li < lines.length; li++) {
    ctx.fillText(lines[li], cardX + 10, cardY + 16 + (li + 1) * lineH - 4);
  }
  ctx.restore();
}

export function drawInstance(ctx: CanvasRenderingContext2D, inst: Instance, selected:boolean, zoom:number, live:any) {
  const part=PART_MAP[inst.partId]; if (!part) return;
  // S5.6c: Beschreibungsbox rendert eine eigene Karte (kein Symbol/Label darunter).
  if (inst.partId === "descbox") { drawDescBox(ctx, inst, selected, zoom, live); return; }
  // ISO/ANSI symbol style – auto by browser locale (DE -> IEC rectangle, US -> ANSI zigzag)
  let sym = part.symbol;
  try {
    const pref = (typeof window !== "undefined" ? (localStorage.getItem("multispice.symbolStyle") as any) : null) || "auto";
    const resolved = resolveSymbolStyle(pref);
    sym = partSymbol(part, inst.params, resolved);
  } catch {}
  ctx.save(); ctx.translate(inst.x, inst.y); ctx.rotate((inst.rot*Math.PI)/180); if (inst.mirror) ctx.scale(-1,1);
  const stroke=selected?canvasColor("--wire-sel"):canvasColor("--symbol");
  ctx.strokeStyle=stroke; ctx.fillStyle=stroke; ctx.lineWidth=1.3; ctx.lineJoin="round"; ctx.lineCap="round"; // W27: dünnere Tinte wie die Referenz
  if (live && (part.interactive==="led" || part.interactive==="lamp")) {
    const i=Math.abs(live.currents[inst.label]??0); const bright=Math.min(1,i/0.015);
    if (bright>0.02) {
      const colorMap: Record<string,string> = { red:"#ff4d4f", green:"#4ade80", blue:"#60a5fa", yellow:"#fde047", white:"#f8fafc" };
      const c=colorMap[String(inst.params.color??"red")]??"#ff4d4f";
      const g=ctx.createRadialGradient(0,0,1,0,0,part.interactive==="lamp" ? 48 : 34); g.addColorStop(0,hexAlpha(c,0.85*bright)); g.addColorStop(1,hexAlpha(c,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,part.interactive==="lamp" ? 48 : 34,0,Math.PI*2); ctx.fill(); ctx.fillStyle=stroke;
      if (part.interactive==="lamp") {
        // Filament glow
        ctx.strokeStyle = hexAlpha(c, 0.6*bright);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6,-4); ctx.lineTo(-2,4); ctx.lineTo(2,-4); ctx.lineTo(6,4);
        ctx.stroke();
      }
    }
  }
  // 7-seg display – animated, shows number based on digital engine or voltage
  if (part.interactive==="sevenseg") {
    let val = 0;
    try {
      const ctrl = engine.controls[inst.label];
      if (ctrl !== undefined) val = Math.floor(ctrl) % 16;
      else if (live) {
        // Try digital engine first – real digital state
        const dig = (engine as any).digitalStates?.[inst.label] ?? (engine as any).digitalStates?.[inst.id];
        if (dig !== undefined) val = Math.floor(dig) % 16;
        else {
          // Try connected net voltage – use first net voltage found
          const netVals = Object.values(live.nets);
          if (netVals.length) {
            // Use max voltage as heuristic for BCD
            const maxV = Math.max(...netVals.filter(v=> typeof v === "number") as number[]);
            if (maxV > 0.5) val = Math.floor(maxV) % 16;
            else val = Math.floor((live.time / 1.2) % 10);
          } else {
            val = Math.floor((live.time / 1.2) % 10);
          }
        }
      }
    } catch {}
    const segOn = [
      [1,1,1,1,1,1,0], //0
      [0,1,1,0,0,0,0], //1
      [1,1,0,1,1,0,1], //2
      [1,1,1,1,0,0,1], //3
      [0,1,1,0,0,1,1], //4
      [1,0,1,1,0,1,1], //5
      [1,0,1,1,1,1,1], //6
      [1,1,1,0,0,0,0], //7
      [1,1,1,1,1,1,1], //8
      [1,1,1,1,0,1,1], //9
    ][val] || [0,0,0,0,0,0,0];
    const segPos = [
      {x:0,y:-12,w:14,h:3}, //a top
      {x:9,y:-6,w:3,h:12}, //b top right
      {x:9,y:8,w:3,h:12}, //c bottom right
      {x:0,y:20,w:14,h:3}, //d bottom
      {x:-9,y:8,w:3,h:12}, //e bottom left
      {x:-9,y:-6,w:3,h:12}, //f top left
      {x:0,y:2,w:14,h:3}, //g middle
    ];
    ctx.save();
    segPos.forEach((sp,i)=>{
      ctx.fillStyle = segOn[i] ? "#ff4d4f" : "rgba(255,255,255,0.08)";
      if (segOn[i]) {
        ctx.shadowColor = "#ff4d4f";
        ctx.shadowBlur = 6;
      }
      ctx.fillRect(sp.x - sp.w/2, sp.y - sp.h/2, sp.w, sp.h);
      ctx.shadowBlur = 0;
    });
    ctx.restore();
  }
  // Motor – spins when current flows
  if (part.interactive==="motor" && live) {
    const i = Math.abs(live.currents[inst.label]??0);
    if (i > 0.001) {
      const ang = (live.time * 3600 * i) % 360;
      ctx.save();
      ctx.rotate(ang * Math.PI/180);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(12,0);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const prim of sym) drawPrim(ctx, prim);
  ctx.fillStyle=canvasColor("--pin");
  for (const pin of partPins(part, inst.params)){ ctx.beginPath(); ctx.arc(pin.x,pin.y,1.5,0,Math.PI*2); ctx.fill(); } // W27: dezente Pin-Punkte
  if (part.interactive==="switch" || part.interactive==="button") {
    // W27: Ref-2-Schalter – dünner Hebel, gefüllte Lagerpunkte, neutrale Tinte
    const closed=(engine.controls[inst.label] ?? (inst.params.closed?1:0))>0.5;
    ctx.strokeStyle=canvasColor("--symbol"); ctx.lineWidth=1.3; ctx.lineCap="round";
    ctx.beginPath();
    if (closed){ ctx.moveTo(-14,0); ctx.lineTo(14,0); }
    else { ctx.moveTo(-14,0); ctx.lineTo(11,-10); }
    ctx.stroke();
    ctx.fillStyle=canvasColor("--symbol");
    ctx.beginPath(); ctx.arc(-14,0,1.8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(14,0,1.8,0,Math.PI*2); ctx.fill();
  }
  if (part.interactive==="pot") {
    const pos=engine.controls[inst.label] ?? Number(inst.params.pos??0.5);
    ctx.fillStyle=canvasColor("--teal"); ctx.fillRect(-20+40*pos-1,-12,2,8);
  }
  // Fault visualization (S5.6d: im Lehrer-Modus versteckt)
  const teacherLocked = useEditor.getState().teacher.locked;
  if (!teacherLocked && (inst as any).fault && (inst as any).fault !== "none") {
    ctx.save();
    const fault = (inst as any).fault;
      ctx.strokeStyle = fault === "open" ? canvasColor("--warn") : fault === "short" ? canvasColor("--err") : canvasColor("--violet");
      ctx.lineWidth = 1.4;
    ctx.setLineDash([3,3]);
    const b = { x: -20, y: -14, w: 40, h: 28 };
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 8px ui-sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fault.toUpperCase(), 0, -18);
    ctx.restore();
  }
  ctx.restore();
  if (zoom>0.42 && part.mount!=="virtual") {
    ctx.save(); ctx.translate(inst.x, inst.y);
    const b=instanceBounds(inst); const dy=b.y+b.h-inst.y+14;
    ctx.font="600 10.5px ui-sans-serif, system-ui"; ctx.textAlign="center";
    ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-2");
    ctx.fillText(inst.label,0,dy);
    const main=part.params[0];
    // S5.6d: Nennwerte im Lehrer-Modus verstecken (Label bleibt sichtbar).
    if (!teacherLocked && main && main.type==="number"){
      const val=Number(inst.params[main.key]??main.def);
      // W92: Wenn das Bauteil ausgewählt ist, wird auch sein Wert darunter
      // optisch in der Auswahlfarbe (--wire-sel) hervorgehoben!
      ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-3");
      ctx.font=selected?"600 10.5px ui-monospace, monospace":"10px ui-monospace, monospace";
      ctx.fillText(formatValue(val,main.unit??""),0,dy+12);
    }
    ctx.restore();
  }
  if (zoom>0.42 && (part.id==="onpage_connector" || part.id==="bus_tap" || part.id==="bus_splitter")) {
    // S1.6/S3.1: Virtuelle Bauteile bekommen sonst kein Schild — Verbinder
    // und Bus-Taps brauchen ihren Netznamen aber sichtbar (der Name IST die Verbindung).
    const tag = part.id==="onpage_connector"
      ? String(inst.params.name??"NET_A")
      : part.id==="bus_tap"
        ? `${String(inst.params.bus??"D").trim() || "D"}[${Math.max(0, Math.floor(Number(inst.params.bit ?? 0)))}]`
        : `${String(inst.params.bus??"D").trim() || "D"}[0..${splitterWidth(inst.params) - 1}]`;
    ctx.save(); ctx.translate(inst.x, inst.y);
    const b=instanceBounds(inst); const dy=b.y+b.h-inst.y+14;
    ctx.font="600 10.5px ui-monospace, monospace"; ctx.textAlign="center";
    ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-2");
    ctx.fillText(tag,0,dy);
    ctx.restore();
  }
  if (selected){
    const b=instanceBounds(inst);
    const hasValueLabel = zoom>0.42 && (part.mount!=="virtual" || part.id==="onpage_connector");
    const main=part.params[0];
    const extraBottom = hasValueLabel ? (main && main.type==="number" ? 30 : 18) : 6;
    ctx.strokeStyle=canvasColor("--wire-sel");
    ctx.setLineDash([4,3]);
    ctx.lineWidth=1.1;
    ctx.strokeRect(b.x-6, b.y-6, b.w+12, b.h+6+extraBottom);
    ctx.setLineDash([]);
  }
}
export function drawPrim(ctx: CanvasRenderingContext2D, prim: SymbolPrim) {
  switch(prim.t){
    case "line": ctx.beginPath(); for(let i=0;i<prim.pts.length;i+=2){ if(i===0) ctx.moveTo(prim.pts[0],prim.pts[1]); else ctx.lineTo(prim.pts[i],prim.pts[i+1]); } ctx.stroke(); break;
    case "rect": roundRect(ctx,prim.x,prim.y,prim.w,prim.h,prim.r??0); if(prim.fill) ctx.fill(); else ctx.stroke(); break;
    case "circle": ctx.beginPath(); ctx.arc(prim.x,prim.y,prim.r,0,Math.PI*2); if(prim.fill) ctx.fill(); else ctx.stroke(); break;
    case "arc": ctx.beginPath(); ctx.arc(prim.x,prim.y,prim.r,prim.a0,prim.a1); ctx.stroke(); break;
    case "text": { ctx.save(); ctx.font=`600 ${prim.size??9}px ui-sans-serif, system-ui`; ctx.textAlign=prim.align??"center"; ctx.fillText(prim.s,prim.x,prim.y); ctx.restore(); break; }
  }
}
