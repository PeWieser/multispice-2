/**
 * W1/W105–W107: Strom-Animation pro TEILSTÜCK (Kettenglied zwischen zwei
 * Knoten des Draht-Graphen) statt pro Draht.
 *
 * Ein Draht mit T-Abzweig führt links und rechts des Abzweigs verschiedene,
 * ggf. gegenläufige Ströme (NE555-Astabil: der R1↔R2-Draht wird mittig zum
 * DIS-Pin angezapft; in der Entladephase fließt oben R1→DIS und unten R2→DIS).
 * Ein einziger längengewichteter Mittelwert pro Draht zeigte die kürzere Hälfte
 * dadurch rückwärts — am R2 schien Strom von beiden Seiten hineinzufließen.
 *
 * Die Kirchhoff-Lösung (phi pro Knoten, Zweigstrom (pa − pb) pro Kante) kommt
 * aus der MNA-Simulation und ist hier nur Eingabe; dieses Modul aggregiert
 * pro Kante Richtung/Stärke/Phase für den Dot-Renderer. Läuft ohne DOM.
 */

export interface FlowLinkInput {
  a: string;
  b: string;
  len: number;
}

export interface FlowLink {
  wireId: string;
  linkIdx: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len: number;
  /** +1 = Perlen laufen A→B, −1 = B→A (Anzeigerichtung inkl. Elektronen-Modus). */
  dir: number;
  /** Betrag des Kantenstroms in Ampere. */
  mag: number;
  /** Phasenoffset (px) für den 22-px-Perlenraster. */
  phase: number;
}

export interface FlowVizOpts {
  spacing?: number;
  minCurrent?: number;
  electron?: boolean;
  timeScaleFactor?: number;
  running?: boolean;
  dtSec?: number;
  minLen?: number;
}

export const FLOW_SPACING_DEFAULT = 22;
export const MIN_FLOW_CURRENT_DEFAULT = 1e-5;
export const MIN_FLOW_LEN_DEFAULT = 6;

/** Gedämpfte logarithmische Driftgeschwindigkeit (px/s): ~20 bei 10 µA, max 110. */
export function driftSpeedPxPerSec(
  mag: number,
  minCurrent: number = MIN_FLOW_CURRENT_DEFAULT,
  timeScaleFactor = 1,
): number {
  return (
    Math.min(110, Math.max(18, 20 + Math.max(0, Math.log10(mag / minCurrent)) * 18)) * timeScaleFactor
  );
}

function parseKey(key: string): [number, number] {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/**
 * Baut pro Kettenglied einen FlowLink (Richtung/Stärke/Phase). Phasen werden
 * kontinuierlich integriert (phase += dir · v · dt, modulo Raster); bei
 * Stromumkehr wechselt nur das Vorzeichen — kein Sprung. Neu auftauchende
 * Glieder starten phasenversetzt um ihre Kumulativlänge (gleichmäßiges Bild).
 */
export function computeFlowLinks(
  wires: Array<{ id: string }>,
  wireChains: Map<string, FlowLinkInput[]>,
  phi: Map<string, number>,
  prevPhases: Map<string, number>,
  opts: FlowVizOpts = {},
): { flows: FlowLink[]; nextPhases: Map<string, number> } {
  const spacing = opts.spacing ?? FLOW_SPACING_DEFAULT;
  const minCurrent = opts.minCurrent ?? MIN_FLOW_CURRENT_DEFAULT;
  const electron = opts.electron ?? false;
  const tsf = opts.timeScaleFactor ?? 1;
  const running = opts.running ?? true;
  const dtSec = opts.dtSec ?? 0;
  const minLen = opts.minLen ?? MIN_FLOW_LEN_DEFAULT;
  const flows: FlowLink[] = [];
  const nextPhases = new Map(prevPhases);
  for (const w of wires) {
    const chain = wireChains.get(w.id);
    if (!chain || chain.length === 0) continue;
    let cumLen = 0;
    for (let k = 0; k < chain.length; k++) {
      const seg = chain[k];
      const pa = phi.get(seg.a);
      const pb = phi.get(seg.b);
      if (pa === undefined || pb === undefined) {
        cumLen += seg.len;
        continue;
      }
      // Technischer Zweigstrom von seg.a nach seg.b in Ampere.
      const iLink = pa - pb;
      const mag = Math.abs(iLink);
      if (seg.len < minLen || mag < minCurrent) {
        cumLen += seg.len;
        continue;
      }
      const convDir = iLink > 0 ? 1 : -1;
      const dir = electron ? -convDir : convDir;
      const speed = driftSpeedPxPerSec(mag, minCurrent, tsf);
      const key = `${w.id}:${k}`;
      const prevPhase = nextPhases.get(key) ?? (cumLen % spacing);
      const nextPhase = running
        ? (((prevPhase + dir * speed * dtSec) % spacing) + spacing) % spacing
        : prevPhase;
      nextPhases.set(key, nextPhase);
      const [ax, ay] = parseKey(seg.a);
      const [bx, by] = parseKey(seg.b);
      flows.push({ wireId: w.id, linkIdx: k, ax, ay, bx, by, len: seg.len, dir, mag, phase: nextPhase });
      cumLen += seg.len;
    }
  }
  return { flows, nextPhases };
}
