/**
 * S2.1: Analyse-Worker — der SPICE-Kernel läuft hier, nicht auf dem Main-Thread.
 *
 * Protokoll (Main → Worker): { id, kind, doc, payload }
 * Protokoll (Worker → Main):
 *   { id, type: "progress", frac } · { id, type: "result", report } · { id, type: "error", message }
 *
 * Hinweis: `payload.progress` (Funktion) überlebt kein structured-clone —
 * der Fortschritts-Callback wird daher hier angehängt, nicht mitgeschickt.
 */

import { runAnalysisLocal, AnalysisPayload, AnalysisReport } from "./runner";
import { SchematicDoc } from "@/lib/schematic/model";

export interface WorkerRequest {
  id: number;
  kind: string;
  doc: SchematicDoc;
  payload: AnalysisPayload;
}

export type WorkerResponse =
  | { id: number; type: "progress"; frac: number }
  | { id: number; type: "result"; report: AnalysisReport }
  | { id: number; type: "error"; message: string };

const post = (msg: WorkerResponse) => {
  (self as unknown as { postMessage: (m: WorkerResponse) => void }).postMessage(msg);
};

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, kind, doc, payload } = e.data;
  try {
    const report = runAnalysisLocal(doc, kind, {
      ...payload,
      progress: (frac: number) => post({ id, type: "progress", frac }),
    });
    post({ id, type: "progress", frac: 1 });
    post({ id, type: "result", report });
  } catch (err) {
    post({ id, type: "error", message: (err as Error).message ?? String(err) });
  }
};
