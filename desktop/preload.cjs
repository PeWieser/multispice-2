const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("multispiceDesktop", {
  isDesktop: true,
  platform: process.platform,
  windowControl(action) {
    ipcRenderer.send("multispice:window-control", action);
  },
  openChildWindow(spec) {
    ipcRenderer.send("multispice:open-child", spec);
  },
  closeChildWindow(id) {
    ipcRenderer.send("multispice:close-child", id);
  },
  notifyChildReady() {
    ipcRenderer.send("multispice:child-ready");
  },
  sendSync(payload) {
    ipcRenderer.send("multispice:sync", payload);
  },
  onSync(callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("multispice:sync", handler);
    return () => ipcRenderer.removeListener("multispice:sync", handler);
  },
  onChildClosed(callback) {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on("multispice:child-closed", handler);
    return () => ipcRenderer.removeListener("multispice:child-closed", handler);
  },
  saveFile(options) {
    return ipcRenderer.invoke("multispice:save-file", options);
  },
  openFile(options) {
    return ipcRenderer.invoke("multispice:open-file", options);
  },
  printSvg(options) {
    return ipcRenderer.invoke("multispice:print-svg", options);
  },
  saveAppData(key, value) {
    ipcRenderer.send("multispice:save-appdata", { key, value });
  },
  loadAppDataSync(key) {
    return ipcRenderer.sendSync("multispice:load-appdata-sync", key);
  },
});
