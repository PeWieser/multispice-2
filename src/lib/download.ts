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
