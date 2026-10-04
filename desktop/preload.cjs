// WDA-1: Guards, damit der Vertrags-Test (scripts/webdesktoptest.ts) die reinen
// Helfer ohne Electron laden kann — in der echten App greift immer der
// Try-Zweig, das Verhalten ist unverändert.
let contextBridge = null;
let ipcRenderer = null;
try {
	 
	const electron = require("electron");
	contextBridge = electron.contextBridge;
	ipcRenderer = electron.ipcRenderer;
} catch {
	contextBridge = null;
	ipcRenderer = null;
}

// Synchron beim Start den gespeicherten AppData-Zustand holen, damit
// localStorage bereits vor dem ersten React-Render hydriert werden kann.
let initialAppData = {};
try {
  initialAppData = ipcRenderer ? ipcRenderer.sendSync("multispice:appdata-load-sync") || {} : {};
} catch {
  initialAppData = {};
}

// WDA-1: Schlüsselbezogener AppData-Zugriff. Vorher ignorierte loadAppDataSync
// den Schlüssel und lieferte den ganzen Store — alle vier Hydrierungsstellen
// (Projekt, Bibliothek, Slots, eigene Bauteile) liefen dadurch ins Leere.
function pickAppDataKey(store, key) {
  if (key === undefined || key === null) return store && typeof store === "object" ? store : {};
  if (!store || typeof store !== "object") return null;
  const v = store[key];
  return v === undefined ? null : v;
}

if (contextBridge && ipcRenderer) {
contextBridge.exposeInMainWorld("multispiceDesktop", {  isDesktop: true,
  platform: process.platform,
  initialAppData,
  windowControl: (action) => ipcRenderer.send("multispice:window-control", action),
  setWindowTitle: (title) => ipcRenderer.send("multispice:set-title", String(title || "MultiSpice")),
  openChildWindow: (opts) => ipcRenderer.send("multispice:open-child", opts),
  closeChildWindow: (key) => ipcRenderer.send("multispice:close-child", key),
  notifyChildReady: () => ipcRenderer.send("multispice:child-ready"),
  sendSync: (payload) => ipcRenderer.send("multispice:sync", payload),
  onSync: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("multispice:sync", handler);
    return () => ipcRenderer.removeListener("multispice:sync", handler);
  },
  onChildClosed: (callback) => {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on("multispice:child-closed", handler);
    return () => ipcRenderer.removeListener("multispice:child-closed", handler);
  },
  onWindowState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("multispice:window-state", handler);
    return () => ipcRenderer.removeListener("multispice:window-state", handler);
  },
  saveAppData: (key, value) => ipcRenderer.send("multispice:appdata-save", { key, value }),
  loadAppDataSync: (key) => {
    let store = {};
    try {
      store = ipcRenderer.sendSync("multispice:appdata-load-sync") || {};
    } catch {
      store = {};
    }
    return pickAppDataKey(store, key);
  },
  saveFile: (opts) => ipcRenderer.invoke("multispice:file-save", opts),
  openFile: (opts) => ipcRenderer.invoke("multispice:file-open", opts),
  printSvg: (opts) => ipcRenderer.invoke("multispice:print-svg", opts),
});
} // contextBridge && ipcRenderer

// WDA-1: Reine Auswahlfunktion für den Vertrags-Test (scripts/webdesktoptest.ts).
if (typeof module !== "undefined" && module.exports) {
  module.exports.__test = { pickAppDataKey };
}
