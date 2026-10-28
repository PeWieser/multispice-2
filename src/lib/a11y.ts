/**
 * S5.4: Screenreader-Texte — reine Funktionen (Snapshots in sprint5test).
 */
import { PART_MAP } from "./library/catalog";

const ANALYSIS_LABEL: Record<string, string> = {
  ac: "AC-Analyse",
  dc: "DC-Sweep",
  op: "Arbeitspunkt",
  tran: "Transientenanalyse",
  fourier: "Fourier-Analyse",
  noise: "Rauschanalyse",
  tf: "Übertragungsfunktion",
  thd: "Klirrfaktor-Analyse",
  pz: "Pol-Nullstellen-Analyse",
};

export function analysisLabel(kind: string): string {
  return ANALYSIS_LABEL[kind] ?? (kind || "Analyse");
}

/**
 * Schaltungs-Zusammenfassung, z. B.
 * „3× Widerstand, 1× Kondensator, 4 Netze, ERC still".
 * ×-Form statt Plural (pluralfrei, SR-sicher), Bauteile in Erst-Reihenfolge.
 */
export function summarizeCircuit(
  instances: ReadonlyArray<{ partId: string }>,
  nets: ReadonlyArray<{ name: string }>,
  errors: ReadonlyArray<string>,
  warnings: ReadonlyArray<string>,
): string {
  const counts = new Map<string, number>();
  for (const i of instances) {
    const name = PART_MAP[i.partId]?.name ?? i.partId;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([name, c]) => `${c}× ${name}`);
  const netTxt = nets.length === 1 ? "1 Netz" : `${nets.length} Netze`;
  const ercBits: string[] = [];
  if (errors.length > 0) ercBits.push(`${errors.length} Fehler`);
  if (warnings.length > 0) ercBits.push(warnings.length === 1 ? "1 Warnung" : `${warnings.length} Warnungen`);
  const erc = ercBits.length > 0 ? `ERC: ${ercBits.join(", ")}` : "ERC still";
  return [...(parts.length > 0 ? parts : ["keine Bauteile"]), netTxt, erc].join(", ");
}

/** Sim-Status für die Live-Region (läuft/fertig/fehler). */
export function simLiveText(s: {
  running: boolean;
  liveOk: boolean;
  liveMessage?: string;
  analysisKind: string;
  analysisRunning: boolean;
  analysisError?: string;
}): string {
  const kind = analysisLabel(s.analysisKind);
  if (s.analysisRunning) return `Analyse ${kind} läuft …`;
  if (s.analysisError) return `Analyse ${kind} fehlgeschlagen: ${s.analysisError}`;
  if (!s.liveOk) return `Simulationsfehler: ${s.liveMessage ?? "keine Konvergenz"}`;
  if (s.running) return "Simulation läuft";
  return "Simulation bereit";
}

/** „… abgeschlossen"-Hinweis beim Flankenwechsel Analyse läuft → fertig. */
export function completionNote(
  wasRunning: boolean,
  running: boolean,
  error: string | undefined,
  kind: string,
): string | null {
  if (wasRunning && !running && !error) return `Analyse ${analysisLabel(kind)} abgeschlossen`;
  return null;
}
