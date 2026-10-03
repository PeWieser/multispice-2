const { app, BrowserWindow, ipcMain, shell, dialog, screen } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

let mainWindow = null;
let splashWindow = null;
/** @type {Map<string, BrowserWindow>} */
const childWindows = new Map();
let serverPort = 0;

/* ------------------------------------------------------------------ */
/* Persistenter AppData-Speicher (%APPDATA%/MultiSpice/state.json)    */
/* ------------------------------------------------------------------ */
let appDataCache = null;

function getAppDataFilePath() {
  try {
    const dir = app.getPath("userData");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "workspace-state.json");
  } catch {
    return null;
  }
}

function readAppData() {
  if (appDataCache !== null) return appDataCache;
  const p = getAppDataFilePath();
  if (!p || !fs.existsSync(p)) {
    appDataCache = {};
    return appDataCache;
  }
  try {
    appDataCache = JSON.parse(fs.readFileSync(p, "utf-8")) || {};
  } catch {
    appDataCache = {};
  }
  return appDataCache;
}

let writeTimer = null;
function writeAppData(key, value) {
  const store = readAppData();
  store[key] = value;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const p = getAppDataFilePath();
    if (!p) return;
    try {
      fs.writeFileSync(p, JSON.stringify(store), "utf-8");
    } catch {}
  }, 150);
}

function flushAppDataSync() {
  if (!appDataCache) return;
  const p = getAppDataFilePath();
  if (!p) return;
  try {
    fs.writeFileSync(p, JSON.stringify(appDataCache), "utf-8");
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Icon & Splash Window (identische Maße 320x200 wie splash.bmp)      */
/* ------------------------------------------------------------------ */
function resolveIconPath() {
  const candidates = [
    path.join(__dirname, "icon.png"),
    path.join(__dirname, "out", "favicon.png"),
    path.join(__dirname, "..", "public", "favicon.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function getIconDataUri() {
  const p = resolveIconPath();
  if (!p) return "";
  try {
    const buf = fs.readFileSync(p);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function createSplashWindow() {
  const iconPath = resolveIconPath();
  const iconDataUri = getIconDataUri();
  const splash = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#0d1017",
    icon: iconPath,
    title: "MultiSpice",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  html, body {
    width: 100%;
    height: 100%;
    background: #0d1017;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid #232a38;
    overflow: hidden;
    -webkit-app-region: drag;
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    margin-bottom: 24px;
    animation: pulse 1.8s ease-in-out infinite;
  }
  .track {
    width: 128px;
    height: 4px;
    background: #1e2533;
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }
  .bar {
    position: absolute;
    top: 0;
    left: -45%;
    width: 45%;
    height: 100%;
    background: #f59e0b;
    border-radius: 999px;
    animation: slide 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes slide {
    0% { left: -45%; }
    100% { left: 100%; }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.96; }
    50% { transform: scale(1.03); opacity: 1; }
  }
</style>
</head>
<body>
  ${iconDataUri ? `<img class="logo" src="${iconDataUri}" alt="" />` : ""}
  <div class="track"><div class="bar"></div></div>
</body>
</html>`;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return splash;
}

/* ------------------------------------------------------------------ */
/* Statischer Server mit festem Vorzugsport & Child-Boot-Shield       */
/* ------------------------------------------------------------------ */
const CHILD_BOOT_SHIELD = `<script>if(window.location.search.indexOf("desktopWindow=")!==-1){document.documentElement.setAttribute("data-ms-child-boot","1");}</script><style>html[data-ms-child-boot="1"],html[data-ms-child-boot="1"] body{background:#0d1017!important;}html[data-ms-child-boot="1"] body>*{opacity:0!important;pointer-events:none!important;}</style>`;

function startStaticServer(rootDir) {
  const createHandler = () =>
    http.createServer((req, res) => {
      try {
        const parsed = new URL(req.url || "/", "http://127.0.0.1");
        let relPath = decodeURIComponent(parsed.pathname);
        if (relPath === "/" || relPath === "") relPath = "/index.html";

        let filePath = path.join(rootDir, relPath);
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        } else if (!fs.existsSync(filePath) && !path.extname(filePath)) {
          const htmlCandidate = `${filePath}.html`;
          if (fs.existsSync(htmlCandidate)) {
            filePath = htmlCandidate;
          } else {
            filePath = path.join(rootDir, "index.html");
          }
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        // W134: In index.html injizieren wir das Child-Boot-Shield, damit ein
        // Kindfenster (?desktopWindow=...) niemals kurz das vor-gerenderte
        // MultiSpice-Hauptfenster aus out/index.html aufblitzen lässt.
        if (ext === ".html") {
          let html = fs.readFileSync(filePath, "utf-8");
          if (html.includes("<head>")) {
            html = html.replace("<head>", `<head>${CHILD_BOOT_SHIELD}`);
          } else {
            html = `${CHILD_BOOT_SHIELD}${html}`;
          }
          res.writeHead(200, { "Content-Type": contentType });
          res.end(html, "utf-8");
          return;
        }

        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

  // W130: Fester Vorzugsport (17531..17545), damit der localStorage-Origin
  // http://127.0.0.1:17531 über Programm-Neustarts hinweg identisch bleibt.
  const candidatePorts = [17531, 17532, 17533, 17534, 17535, 0];
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      const port = candidatePorts[idx++];
      const server = createHandler();
      server.once("error", (err) => {
        if (idx < candidatePorts.length) {
          tryNext();
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => {
        const addr = server.address();
        resolve(addr.port);
      });
    };
    tryNext();
  });
}

function createFramelessWindow(options) {
  const iconPath = resolveIconPath();
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    x: options.x,
    y: options.y,
    minWidth: options.minWidth || 320,
    minHeight: options.minHeight || 220,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    center: options.x === undefined && options.y === undefined,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    fullscreenable: false,
    backgroundColor: "#0d1017",
    show: false,
    icon: iconPath,
    title: options.title || "MultiSpice",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (options.autoShow !== false) {
    win.once("ready-to-show", () => {
      win.show();
    });
  }

  return win;
}

async function boot() {
  splashWindow = createSplashWindow();

  const outDir = fs.existsSync(path.join(__dirname, "out"))
    ? path.join(__dirname, "out")
    : path.join(__dirname, "..", "out");

  serverPort = await startStaticServer(outDir);

  mainWindow = createFramelessWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "MultiSpice",
    autoShow: false,
  });

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  mainWindow.on("closed", () => {
    flushAppDataSync();
    mainWindow = null;
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    for (const child of childWindows.values()) {
      if (!child.isDestroyed()) child.close();
    }
    childWindows.clear();
  });
}

ipcMain.on("multispice:window-control", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (action === "minimize") {
    win.minimize();
  } else if (action === "maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === "close") {
    win.close();
  }
});

ipcMain.on("multispice:child-ready", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && !win.isVisible()) {
    if (win.__restoreMaximized) {
      win.maximize();
    }
    win.show();
    win.focus();
  }
});

/* ------------------------------------------------------------------ */
/* W134 & W135: Kindfenster (Bibliothek & proportionale Geräte)       */
/* ------------------------------------------------------------------ */
ipcMain.on("multispice:open-child", (event, spec) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  if (!spec || !spec.id) return;
  const existing = childWindows.get(spec.id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    if (!existing.isVisible()) existing.show();
    existing.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const workArea = display?.workAreaSize || { width: 1600, height: 900 };
  const sw = workArea.width;
  const sh = workArea.height;

  const isInstrument = spec.role === "instrument";
  const kindKey = spec.kind || spec.id;
  const store = readAppData();
  const savedBoundsMap = store.windowBounds || {};
  const userBounds = isInstrument ? savedBoundsMap[kindKey] : savedBoundsMap.library;

  // Natürliches Seitenverhältnis des Geräts (inkl. 28px Titelleiste)
  const natW = Math.max(320, Number(spec.width) || 560);
  const natH = Math.max(240, Number(spec.height) || 400);
  const aspect = natW / natH;

  let initW = natW;
  let initH = natH;
  let restoreMaximized = false;

  if (userBounds && typeof userBounds.width === "number" && typeof userBounds.height === "number") {
    // User hat das Fenster zuvor selbst angepasst -> Größe übernehmen (proportional für Geräte)
    initW = Math.min(sw - 24, Math.max(320, Math.round(userBounds.width)));
    initH = isInstrument
      ? Math.round(initW / aspect)
      : Math.min(sh - 24, Math.max(240, Math.round(userBounds.height)));
    if (isInstrument && initH > sh - 24) {
      initH = sh - 24;
      initW = Math.round(initH * aspect);
    }
    restoreMaximized = Boolean(userBounds.maximized);
  } else if (isInstrument) {
    // W135: Geräte beim Erstöffnen NIE im Vollbild öffnen!
    // Maximal 62 % der Bildschirmbreite bzw. 64 % der Bildschirmhöhe, exakt im
    // Original-Seitenverhältnis (aspect) des Geräts.
    const maxInitW = Math.min(natW, Math.round(sw * 0.62));
    const maxInitH = Math.min(natH, Math.round(sh * 0.64));
    initW = maxInitW;
    initH = Math.round(initW / aspect);
    if (initH > maxInitH) {
      initH = maxInitH;
      initW = Math.round(initH * aspect);
    }
  } else {
    initW = Math.min(natW, Math.round(sw * 0.68));
    initH = Math.min(natH, Math.round(sh * 0.72));
  }

  const minW = isInstrument ? 320 : 520;
  const minH = isInstrument ? Math.max(180, Math.round(minW / aspect)) : 360;

  const child = createFramelessWindow({
    width: initW,
    height: initH,
    minWidth: minW,
    minHeight: minH,
    title: spec.title || "MultiSpice",
    autoShow: false,
  });

  child.__restoreMaximized = restoreMaximized;

  if (isInstrument) {
    // W135: Seitenverhältnis bei Geräten immer proportional halten (wie im Browser)
    try {
      child.setAspectRatio(aspect);
    } catch {}

    child.on("will-resize", (resizeEvent, newBounds) => {
      if (child.isMaximized()) return;
      let targetW = Math.max(minW, Math.min(sw - 12, newBounds.width));
      let targetH = Math.round(targetW / aspect);
      if (targetH > sh - 12) {
        targetH = sh - 12;
        targetW = Math.round(targetH * aspect);
      }
      if (targetH < minH) {
        targetH = minH;
        targetW = Math.round(targetH * aspect);
      }
      if (Math.abs(targetW - newBounds.width) > 2 || Math.abs(targetH - newBounds.height) > 2) {
        resizeEvent.preventDefault();
        child.setBounds({
          x: newBounds.x,
          y: newBounds.y,
          width: targetW,
          height: targetH,
        });
      }
    });
  }

  const saveCurrentBounds = () => {
    if (child.isDestroyed()) return;
    const isMax = child.isMaximized();
    const b = child.getNormalBounds ? child.getNormalBounds() : child.getBounds();
    const curStore = readAppData();
    const map = curStore.windowBounds || {};
    map[isInstrument ? kindKey : "library"] = {
      width: b.width,
      height: b.height,
      maximized: isMax,
    };
    writeAppData("windowBounds", map);
  };

  child.on("resized", saveCurrentBounds);
  child.on("maximize", saveCurrentBounds);
  child.on("unmaximize", saveCurrentBounds);

  childWindows.set(spec.id, child);

  const params = new URLSearchParams({
    desktopWindow: spec.role || "instrument",
    winId: spec.id,
    kind: spec.kind || "",
    title: spec.title || "MultiSpice",
  });

  child.loadURL(`http://127.0.0.1:${serverPort}/?${params.toString()}`);

  // W134: Großzügiger Sicherheits-Fallback (3500 ms), damit das Fenster im
  // Normalfall ausschließlich durch multispice:child-ready nach dem Rendern
  // der Kind-Ansicht geöffnet wird (kein Aufblitzen des Hauptfensters!).
  const showFallback = setTimeout(() => {
    if (!child.isDestroyed() && !child.isVisible()) {
      child.show();
      child.focus();
    }
  }, 3500);

  child.on("closed", () => {
    clearTimeout(showFallback);
    childWindows.delete(spec.id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("multispice:child-closed", spec.id);
    }
  });
});

ipcMain.on("multispice:close-child", (event, id) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  const child = childWindows.get(id);
  if (child && !child.isDestroyed()) {
    child.close();
  }
  childWindows.delete(id);
});

ipcMain.on("multispice:sync", (event, payload) => {
  const senderId = event.sender.id;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id !== senderId) {
    mainWindow.webContents.send("multispice:sync", payload);
  }
  for (const child of childWindows.values()) {
    if (!child.isDestroyed() && child.webContents.id !== senderId) {
      child.webContents.send("multispice:sync", payload);
    }
  }
});

/* ------------------------------------------------------------------ */
/* W130: Native Datei-Operationen & AppData-Persistenz                */
/* ------------------------------------------------------------------ */
ipcMain.on("multispice:save-appdata", (_event, payload) => {
  if (!payload || typeof payload.key !== "string") return;
  writeAppData(payload.key, payload.value);
});

ipcMain.on("multispice:load-appdata-sync", (event, key) => {
  const store = readAppData();
  event.returnValue = store[key] !== undefined ? store[key] : null;
});

ipcMain.handle("multispice:save-file", async (event, opts) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    let targetPath = opts?.filePath || null;

    if (!targetPath) {
      const defaultName = opts?.defaultName || "schaltplan.msx.json";
      const filters = opts?.filters || [
        { name: "MultiSpice-Projekt (*.msx.json)", extensions: ["msx.json", "json"] },
        { name: "Alle Dateien (*.*)", extensions: ["*"] },
      ];
      const res = await dialog.showSaveDialog(win, {
        title: opts?.title || "Schaltplan speichern",
        defaultPath: path.join(app.getPath("documents"), defaultName),
        filters,
      });
      if (res.canceled || !res.filePath) {
        return { ok: false, canceled: true };
      }
      targetPath = res.filePath;
    }

    const encoding = opts?.encoding === "base64" ? "base64" : "utf-8";
    const data = opts?.encoding === "base64" ? Buffer.from(opts.content || "", "base64") : String(opts?.content ?? "");
    await fs.promises.writeFile(targetPath, data, encoding === "base64" ? undefined : "utf-8");
    return { ok: true, filePath: targetPath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("multispice:open-file", async (event, opts) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const filters = opts?.filters || [
      {
        name: "MultiSpice & SPICE Dateien",
        extensions: ["json", "cir", "net", "sp", "asc", "txt"],
      },
      { name: "Alle Dateien (*.*)", extensions: ["*"] },
    ];
    const res = await dialog.showOpenDialog(win, {
      title: opts?.title || "Schaltplan öffnen",
      defaultPath: app.getPath("documents"),
      properties: ["openFile"],
      filters,
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const filePath = res.filePaths[0];
    const content = await fs.promises.readFile(filePath, "utf-8");
    return {
      ok: true,
      filePath,
      name: path.basename(filePath),
      content,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

/* ------------------------------------------------------------------ */
/* W131: Nativer Vektor-Druck & PDF-Export unter Windows              */
/* ------------------------------------------------------------------ */
ipcMain.handle("multispice:print-svg", async (event, opts) => {
  let printWin = null;
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const svg = String(opts?.svg || "");
    const title = String(opts?.title || "Schaltplan");
    const mode = opts?.mode === "pdf" ? "pdf" : "print";

    let pdfTargetPath = null;
    if (mode === "pdf") {
      const defaultName = opts?.defaultName || `${title.replace(/\s+/g, "_")}.pdf`;
      const saveRes = await dialog.showSaveDialog(parentWin, {
        title: "Schaltblatt als PDF speichern",
        defaultPath: path.join(app.getPath("documents"), defaultName),
        filters: [{ name: "PDF-Dokument (*.pdf)", extensions: ["pdf"] }],
      });
      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: false, canceled: true };
      }
      pdfTargetPath = saveRes.filePath;
    }

    printWin = new BrowserWindow({
      width: 1123,
      height: 794,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }
</style>
</head>
<body>${svg}</body>
</html>`;

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    if (mode === "pdf" && pdfTargetPath) {
      const pdfBuf = await printWin.webContents.printToPDF({
        landscape: true,
        pageSize: "A4",
        printBackground: true,
      });
      await fs.promises.writeFile(pdfTargetPath, pdfBuf);
      printWin.close();
      printWin = null;
      return { ok: true, filePath: pdfTargetPath };
    }

    return await new Promise((resolve) => {
      printWin.webContents.print(
        {
          silent: false,
          printBackground: true,
          landscape: true,
        },
        (success, failureReason) => {
          if (printWin && !printWin.isDestroyed()) {
            printWin.close();
          }
          if (!success && failureReason && failureReason !== "cancelled") {
            resolve({ ok: false, error: failureReason });
          } else {
            resolve({ ok: success, canceled: !success });
          }
        },
      );
    });
  } catch (err) {
    if (printWin && !printWin.isDestroyed()) {
      printWin.close();
    }
    return { ok: false, error: err?.message || String(err) };
  }
});

app.whenReady().then(boot);

app.on("before-quit", () => {
  flushAppDataSync();
});

app.on("window-all-closed", () => {
  flushAppDataSync();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
