/**
 * Eine einzige Wahrheit für „Datei öffnen“: Menü-Dialog, nativer Windows-Öffnen-Dialog,
 * Drag & Drop auf den Canvas und alles Zukünftige nutzen denselben Pfad — inklusive
 * ehrlicher Fehlermeldung in Menschensprache und Auto-Save-Bindung (W130).
 */

import { useEditor, type InstrumentWindow } from "@/state/editor";
import {
  clearActiveSaveTarget,
  isValidProjectDoc,
  normalizeProjectDoc,
  setActiveBrowserFileHandle,
  setActiveDesktopFilePath,
  type BrowserFileHandle,
} from "@/lib/storage";
import { fromKicadSch, fromLtspiceAsc, fromSpiceNetlist, isKicadSch, isLtspiceAsc } from "./importers";

interface ProjectEnvelope {
  name?: string;
  doc?: unknown;
  instruments?: unknown[];
  savedAt?: string;
}

export function loadTextContentInEditor(
  text: string,
  fileName: string,
  opts?: { filePath?: string | null; fileHandle?: BrowserFileHandle | null },
): void {
  const st = useEditor.getState();
  try {
    if (fileName.toLowerCase().endsWith(".json")) {
      const parsed: unknown = JSON.parse(text);
      const env = parsed as ProjectEnvelope;
      if (env && typeof env === "object" && env.doc !== undefined) {
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
      if (opts?.filePath) {
        setActiveDesktopFilePath(opts.filePath);
      } else if (opts?.fileHandle) {
        setActiveBrowserFileHandle(opts.fileHandle);
      }
      st.log("ok", `${fileName} geöffnet – Projekt inkl. Gerätefenster (Auto-Save aktiv)`);
      return;
    }
    clearActiveSaveTarget();
    const doc = isLtspiceAsc(text) ? fromLtspiceAsc(text) : fromSpiceNetlist(text);
    st.setDoc(doc);
    st.log("ok", `${fileName} geöffnet – ${doc.instances.length} Bauteile, ${doc.wires.length} Leitungen`);
  } catch (e) {
    st.log("error", `Import fehlgeschlagen: ${(e as Error).message}`);
  }
}

export async function openFileInEditor(file: File, fileHandle?: BrowserFileHandle | null): Promise<void> {
  const st = useEditor.getState();
  let text = "";
  try {
    text = await file.text();
  } catch (e) {
    st.log("error", `Datei nicht lesbar: ${(e as Error).message}`);
    return;
  }
  loadTextContentInEditor(text, file.name, { fileHandle });
}

/**
 * W130: Öffnet unter Windows den nativen Windows-Datei-Öffnen-Dialog (und bindet
 * geöffnete .msx.json-Dateien automatisch an das laufende Datei-Auto-Save).
 * Gibt `true` zurück, wenn der Dialog über die Desktop-Bridge abgewickelt wurde.
 */
export async function openProjectViaNativeDialogIfAvailable(): Promise<boolean> {
  if (typeof window !== "undefined" && window.multispiceDesktop?.openFile) {
    const res = await window.multispiceDesktop.openFile({
      title: "Schaltplan oder Netzliste öffnen",
      filters: [
        {
          name: "MultiSpice-Projekte & SPICE-Dateien",
          extensions: ["json", "cir", "net", "sp", "asc", "txt"],
        },
        { name: "Alle Dateien (*.*)", extensions: ["*"] },
      ],
    });
    if (!res.canceled && res.ok && typeof res.content === "string" && res.name) {
      loadTextContentInEditor(res.content, res.name, { filePath: res.filePath ?? null });
    } else if (res.error) {
      useEditor.getState().log("error", `Öffnen fehlgeschlagen: ${res.error}`);
    }
    return true;
  }
  return false;
}
