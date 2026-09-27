/**
 * Eine einzige Wahrheit für „Datei öffnen“: Menü-Dialog, Drag & Drop auf den
 * Canvas und alles Zukünftige nutzen denselben Pfad — inklusive ehrlicher
 * Fehlermeldung in Menschensprache.
 */

import { useEditor, type InstrumentWindow } from "@/state/editor";
import { isValidProjectDoc, normalizeProjectDoc } from "@/lib/storage";
import { fromLtspiceAsc, fromSpiceNetlist, isLtspiceAsc } from "./importers";

interface ProjectEnvelope {
  name?: string;
  doc?: unknown;
  instruments?: unknown[];
  savedAt?: string;
}

export async function openFileInEditor(file: File): Promise<void> {
  const st = useEditor.getState();
  let text = "";
  try {
    text = await file.text();
  } catch (e) {
    st.log("error", `Datei nicht lesbar: ${(e as Error).message}`);
    return;
  }
  try {
    if (file.name.endsWith(".json")) {
      const parsed: unknown = JSON.parse(text);
      const env = parsed as ProjectEnvelope;
      if (env && typeof env === "object" && env.doc !== undefined) {
        // Projekt-Umschlag (Export ab Runde 6): Schaltung + Gerätefenster
        if (!isValidProjectDoc(env.doc)) {
          throw new Error("Die Datei sieht nicht wie ein Multispice-Projekt aus (JSON-Struktur unbekannt).");
        }
        st.setDoc(normalizeProjectDoc(env.doc));
        if (Array.isArray(env.instruments)) {
          useEditor.setState({ instruments: env.instruments as InstrumentWindow[] });
        }
      } else {
        if (!isValidProjectDoc(parsed)) {
          throw new Error("Die Datei sieht nicht wie ein Multispice-Projekt aus (JSON-Struktur unbekannt).");
        }
        st.setDoc(normalizeProjectDoc(parsed));
      }
      st.log("ok", `${file.name} geöffnet – Projekt inkl. Gerätefenster`);
      return;
    }
    const doc = isLtspiceAsc(text) ? fromLtspiceAsc(text) : fromSpiceNetlist(text);
    st.setDoc(doc);
    st.log("ok", `${file.name} geöffnet – ${doc.instances.length} Bauteile, ${doc.wires.length} Leitungen`);
  } catch (e) {
    st.log("error", `Import fehlgeschlagen: ${(e as Error).message}`);
  }
}
