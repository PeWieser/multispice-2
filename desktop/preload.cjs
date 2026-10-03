const { contextBridge, ipcRenderer } = require("electron");

// Synchron beim Start den gespeicherten AppData-Zustand holen, damit
// localStorage bereits vor dem ersten React-Render hydriert werden kann.
let initialAppData = {};
try {
  initialAppData = ipcRenderer.sendSync("multispice:appdata-load-sync") || {};
} catch {
  initialAppData = {};
}

contextBridge.exposeInMainWorld("multispiceDesktop", {
  isDesktop: true,
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
  loadAppDataSync: () => {
    try {
      return ipcRenderer.sendSync("multispice:appdata-load-sync") || {};
    } catch {
      return {};
    }
  },
  saveFile: (opts) => ipcRenderer.invoke("multispice:file-save", opts),
  openFile: (opts) => ipcRenderer.invoke("multispice:file-open", opts),
  printSvg: (opts) => ipcRenderer.invoke("multispice:print-svg", opts),
});
