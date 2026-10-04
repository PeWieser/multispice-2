/**
 * S2.1: Client-Seite des Analyse-Workers.
 *
 * `runAnalysisTask` lagert den Kernel in einen Web Worker aus (UI bleibt
 * flüssig, Fortschritt + Abbrechen funktionieren). Schlägt der Worker fehl
 * (SSR, blockiert, Export-Edge), fällt der Task ehrlich auf den synchronen
 * `runAnalysisLocal`-Pfad zurück — `task.worker === false` verrät es der UI.
 */

import { SchematicDoc } from "@/lib/schematic/model";
import { AnalysisPayload, AnalysisReport, runAnalysisLocal } from "./runner";
import type { WorkerRequest, WorkerResponse } from "./analysis.worker";

export interface AnalysisTask {
  promise: Promise<AnalysisReport>;
  /** Bricht ab (Worker wird terminiert, Promise verwirft mit Abbruch-Fehler). */
  cancel: () => void;
  /** True = läuft im Worker; false = synchroner Fallback auf dem Main-Thread. */
  worker: boolean;
}

export class AnalysisAbortedError extends Error {
  constructor() {
    super("Analyse abgebrochen");
    this.name = "AnalysisAbortedError";
  }
}

let nextId = 1;

function runLocal(
  doc: SchematicDoc,
  kind: string,
  payload: AnalysisPayload,
  onProgress?: (frac: number) => void,
): AnalysisTask {
  let cancelled = false;
  const promise = new Promise<AnalysisReport>((resolve, reject) => {
    // Ein Yield, damit „läuft …" rendert, bevor der Kernel blockiert.
    setTimeout(() => {
      if (cancelled) {
        reject(new AnalysisAbortedError());
        return;
      }
      try {
        const report = runAnalysisLocal(doc, kind, { ...payload, progress: onProgress });
        onProgress?.(1);
        resolve(report);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, 0);
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
    worker: false,
  };
}

export function runAnalysisTask(
  doc: SchematicDoc,
  kind: string,
  payload: AnalysisPayload = {},
  onProgress?: (frac: number) => void,
): AnalysisTask {
  try {
    if (typeof Worker === "undefined") return runLocal(doc, kind, payload, onProgress);
    const worker = new Worker(new URL("./analysis.worker.ts", import.meta.url));
    const id = nextId++;
    let settled = false;
    let promiseResolve: (r: AnalysisReport) => void = () => {};
    let promiseReject: (e: Error) => void = () => {};
    const promise = new Promise<AnalysisReport>((resolve, reject) => {
      promiseResolve = resolve;
      promiseReject = reject;
    });
    const finish = () => {
      settled = true;
      worker.terminate();
    };
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "progress") {
        onProgress?.(msg.frac);
      } else if (msg.type === "result") {
        if (settled) return;
        finish();
        promiseResolve(msg.report);
      } else {
        if (settled) return;
        finish();
        promiseReject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      if (settled) return;
      finish();
      promiseReject(new Error("Analyse-Worker fehlgeschlagen"));
    };
    const req: WorkerRequest = { id, kind, doc, payload };
    worker.postMessage(req);
    return {
      promise,
      cancel: () => {
        if (settled) return;
        finish();
        promiseReject(new AnalysisAbortedError());
      },
      worker: true,
    };
  } catch {
    return runLocal(doc, kind, payload, onProgress);
  }
}
