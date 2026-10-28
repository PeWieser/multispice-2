/** Datei-Download (Exporte) — ein Ort für alle Download-Helfer. Desktop (Electron) nutzt den nativen Speichern-Dialog. */

export function downloadText(name: string, content: string, type = "text/plain") {
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
    const ext = name.split(".").pop()?.toLowerCase() || "txt";
    void window.multispiceDesktop.saveFile({
      defaultName: name,
      content,
      title: `Datei speichern (${name})`,
      filters: [
        { name: `${ext.toUpperCase()}-Datei (*.${ext})`, extensions: [ext] },
        { name: "Alle Dateien (*.*)", extensions: ["*"] },
      ],
    });
    return;
  }
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadBlob(name: string, blob: Blob) {
  // WDA-3: Einziger Download ohne Desktop-Zweig — PNG-Schnappschüsse landeten
  // kommentarlos im Download-Ordner statt im nativen Speichern-Dialog.
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
    const ext = name.split(".").pop()?.toLowerCase() || "bin";
    void (async () => {
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        await window.multispiceDesktop?.saveFile?.({
          defaultName: name,
          content: btoa(binary),
          encoding: "base64",
          title: `Datei speichern (${name})`,
          filters: [
            { name: `${ext.toUpperCase()}-Datei (*.${ext})`, extensions: [ext] },
            { name: "Alle Dateien (*.*)", extensions: ["*"] },
          ],
        });
      } catch {}
    })();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safeName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\wäöüÄÖÜß.-]+/g, "-");
}

/** S5.5: Text in die Zwischenablage (mit Fallback für nicht-sichere Kontexte). */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
