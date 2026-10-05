/**
 * MultiSpice – Native Windows Desktop App (Electron Main Process)
 *
 * Runde 40 (W130–W140):
 * - W130: Fester lokaler Port (17531) + native Datei-Persistenz in %APPDATA%/MultiSpice
 *         sowie echter Datei-Speicherdialog beim ersten Speichern und stilles Auto-Save
 *         in dieselbe Datei bei allen Folgeänderungen.
 * - W131: Nativer PDF-Export (`webContents.printToPDF`) & Vektor-Druck aus Electron.
 * - W134: Synchroner `<head>`-Boot-Shield in `index.html`, damit Kindfenster niemals
 *         kurz das MultiSpice-Hauptfenster aufblitzen lassen.
 * - W135: Gerätefenster öffnen nie im Vollbild (außer vom User zuvor so skaliert),
 *         speichern ihre Nutzergröße und skalieren immer streng proportional.
 * - W137: Ein einziger, animierter Ladebildschirm im Taskbar (`skipTaskbar: false`)
 *         mit humorvollen Textmeldungen statt Ladebalken; wird die App aus dem
 *         sofortigen Portable-Starter (`--portable-splash-pid=…`) gestartet, öffnet
 *         Electron kein zweites Ladefenster, sondern schließt den Starter nahtlos.
 * - W138: Jedes Fenster unter Windows trägt seinen eigenen echten Fenstertitel
 *         (z. B. „Oszilloskop“, „Funktionsgenerator“, „Bauteil-Bibliothek“),
 *         sodass die Windows-Taskleisten-Vorschau beim Hovern den Gerätenamen zeigt.
 */

const { app, BrowserWindow, shell, Menu, ipcMain, screen, dialog } = require("electron");
const { atomicWriteFileSync, rotateBackupSync, readJsonWithBackupSync } = require("./atomic.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");

app.setAppUserModelId("de.multispice.desktop");

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
  ".wasm": "application/wasm",
};

/**
 * W134: Synchroner Boot-Shield für Kindfenster (`?desktopWindow=...`).
 */
const CHILD_BOOT_SHIELD = `<script>(function(){try{if(location.search.indexOf("desktopWindow=")!==-1){document.documentElement.setAttribute("data-ms-child-boot","1");}}catch(e){}})();</script><style>html[data-ms-child-boot="1"],html[data-ms-child-boot="1"] body{background:#0d1017 !important;}html[data-ms-child-boot="1"] body{opacity:0 !important;pointer-events:none !important;}</style>`;

/**
 * W137: Prüft, ob MultiSpice vom nativen Portable-Starter gestartet wurde,
 * der bereits das animierte Splash-Fenster anzeigt.
 */
function getPortableSplashPid() {
  for (const arg of process.argv) {
    if (typeof arg === "string" && arg.startsWith("--portable-splash-pid=")) {
      const n = Number(arg.slice("--portable-splash-pid=".length));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

const portableSplashPid = getPortableSplashPid();

function closePortableSplashIfRunning() {
  if (!portableSplashPid) return;
  try {
    process.kill(portableSplashPid);
  } catch {
    // Prozess bereits beendet
  }
}

/**
 * Persistenter AppData-Speicher (%APPDATA%/MultiSpice/workspace-state.json)
 */
function getStateFilePath() {
  try {
    return path.join(app.getPath("userData"), "workspace-state.json");
  } catch {
    return path.join(__dirname, "workspace-state.json");
  }
}

let appDataCache = null;

function readAppData() {
  if (appDataCache) return appDataCache;
  const p = getStateFilePath();
  try {
    if (fs.existsSync(p)) {
      // S5.11: Bei korrupter Hauptdatei (Crash vor S5.11) das .bak lesen.
      const parsed = readJsonWithBackupSync(p);
      if (parsed && typeof parsed === "object") {
        appDataCache = parsed;
        return appDataCache;
      }
    }
  } catch {
    // Fallback auf leeres Objekt
  }
  appDataCache = {};
  return appDataCache;
}

let writeTimer = null;
function writeAppDataSoon() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const p = getStateFilePath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      // S5.11: .bak rotieren + atomar schreiben (nie wieder halbe JSON).
      rotateBackupSync(p);
      atomicWriteFileSync(p, JSON.stringify(appDataCache || {}, null, 2), "utf8");
    } catch {
      // Ignorieren
    }
  }, 150);
}

function flushAppDataSync() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!appDataCache) return;
  try {
    const p = getStateFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(appDataCache, null, 2), "utf8");
  } catch {
    // Ignorieren
  }
}

/**
 * Startet einen lokalen statischen HTTP-Server für das exportierte Next.js-Bundle (`out/`)
 * auf einem festen Vorzugsport (17531..17535).
 */
function startStaticServer(rootDir) {
  const tryPorts = [17531, 17532, 17533, 17534, 17535, 0];

  const createHandler = (req, res) => {
    try {
      const urlObj = new URL(req.url || "/", "http://127.0.0.1");
      let relPath = decodeURIComponent(urlObj.pathname);
      if (relPath.endsWith("/")) relPath += "index.html";

      let filePath = path.normalize(path.join(rootDir, relPath));
      if (!filePath.startsWith(path.normalize(rootDir))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const htmlCandidate = filePath + ".html";
        if (fs.existsSync(htmlCandidate)) {
          filePath = htmlCandidate;
        } else {
          filePath = path.join(rootDir, "index.html");
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";

      if (ext === ".html") {
        let html = fs.readFileSync(filePath, "utf8");
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${CHILD_BOOT_SHIELD}`);
        } else {
          html = CHILD_BOOT_SHIELD + html;
        }
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "no-cache",
        });
        res.end(html, "utf8");
        return;
      }

      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  };

  return new Promise((resolve, reject) => {
    let idx = 0;
    const attempt = () => {
      const port = tryPorts[idx++];
      const server = http.createServer(createHandler);
      server.once("error", (err) => {
        if (idx < tryPorts.length) {
          attempt();
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => {
        const addr = server.address();
        resolve({ server, port: addr.port });
      });
    };
    attempt();
  });
}

let mainWindow = null;
let splashWindow = null;
let staticServer = null;
let serverPort = 0;
const childWindows = new Map();
const windowTitles = new Map();

function getAppIconPath() {
  const icoPath = path.join(__dirname, "icon.ico");
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.join(__dirname, "out", "favicon.png");
  if (fs.existsSync(pngPath)) return pngPath;
  return undefined;
}

function getLogoDataUrl() {
  try {
    const pngPath = path.join(__dirname, "out", "favicon.png");
    if (fs.existsSync(pngPath)) {
      const b64 = fs.readFileSync(pngPath).toString("base64");
      return `data:image/png;base64,${b64}`;
    }
  } catch {
    // Fallback ohne Bild
  }
  return "";
}

/**
 * W138: Sperrt den echten Fenstertitel eines BrowserWindows gegen das Überschreiben
 * durch `<title>MultiSpice</title>` aus `out/index.html`.
 */
function lockWindowTitle(win, initialTitle) {
  windowTitles.set(win.id, initialTitle || "MultiSpice");
  win.setTitle(initialTitle || "MultiSpice");
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    const desired = windowTitles.get(win.id) || initialTitle || "MultiSpice";
    if (!win.isDestroyed()) {
      win.setTitle(desired);
    }
  });
  win.on("closed", () => {
    windowTitles.delete(win.id);
  });
}

/**
 * W137: Animierter Ladebildschirm (sichtbar als Fenster in der Taskleiste,
 * mit rotierendem Amber-Ring und humorvollen Statusmeldungen statt Ladebalken).
 * Wird nur geöffnet, wenn kein Portable-Starter-Splash (`portableSplashPid`) läuft.
 */
function createSplashWindow() {
  const iconPath = getAppIconPath();
  const logoUrl = getLogoDataUrl();
  splashWindow = new BrowserWindow({
    width: 380,
    height: 236,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    show: true,
    title: "MultiSpice",
    backgroundColor: "#0d1017",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockWindowTitle(splashWindow, "MultiSpice");

  const splashHtml = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>MultiSpice</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: radial-gradient(circle at 50% 28%, #182030 0%, #0d1017 74%);
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    -webkit-app-region: drag;
  }
  .ring-wrap {
    position: relative;
    width: 82px;
    height: 82px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
  }
  .ring-svg {
    position: absolute;
    inset: 0;
    width: 82px;
    height: 82px;
    animation: orbit 1.35s linear infinite;
  }
  .logo {
    width: 54px;
    height: 54px;
    border-radius: 13px;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55);
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #f3f4f6;
    margin-bottom: 10px;
  }
  .status {
    min-height: 36px;
    padding: 0 28px;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    color: #9ca8ba;
    transition: opacity 0.22s ease;
  }
  @keyframes orbit {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
</head>
<body>
  <div class="ring-wrap">
    <svg class="ring-svg" viewBox="0 0 82 82" fill="none">
      <circle cx="41" cy="41" r="37" stroke="rgba(255,255,255,0.12)" stroke-width="2.5" />
      <circle cx="41" cy="41" r="37" stroke="#f59e0b" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="64 180" />
    </svg>
    ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="MultiSpice" />` : `<div class="logo"></div>`}
  </div>
  <div class="title">MultiSpice</div>
  <div id="status-msg" class="status">Lötkolben wird auf 350 °C vorgeheizt …</div>
  <script>
    const msgs = [
      "Lötkolben wird auf 350 °C vorgeheizt …",
      "Widerstände nach Farbringen sortieren …",
      "Magischen Rauch in die ICs füllen …",
      "Oszilloskop-Strahl entknoten …",
      "Kondensatoren auf Nennspannung streicheln …",
      "Kalte Lötstellen höflich wegdiskutieren …",
      "Kirchhoffsche Knotenregeln durchsetzen …",
      "Tastköpfe auf 10:1 abgleichen …",
      "Operationsverstärker beruhigen …",
      "Entkopplungskondensatoren verteilen …"
    ];
    let idx = 0;
    const el = document.getElementById("status-msg");
    setInterval(() => {
      idx = (idx + 1) % msgs.length;
      if (el) el.textContent = msgs[idx];
    }, 1200);
  </script>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function attachWindowStateEvents(win) {
  const sendState = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("multispice:window-state", {
        maximized: win.isMaximized(),
      });
    }
  };
  win.on("maximize", sendState);
  win.on("unmaximize", sendState);
  win.webContents.on("did-finish-load", sendState);
}

/**
 * W135: Erzwingt proportionales Skalieren (festes Seitenverhältnis) auf Windows-Ebene.
 */
function enforceProportionalResize(win, aspectRatio) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
  try {
    win.setAspectRatio(aspectRatio);
  } catch {
    // Fallback über will-resize
  }
  win.on("will-resize", (event, newBounds) => {
    if (!newBounds || newBounds.width <= 0 || newBounds.height <= 0) return;
    const current = win.getBounds();
    const dw = Math.abs(newBounds.width - current.width);
    const dh = Math.abs(newBounds.height - current.height);
    let targetW = newBounds.width;
    let targetH = newBounds.height;
    if (dw >= dh) {
      targetH = Math.max(220, Math.round(targetW / aspectRatio));
    } else {
      targetW = Math.max(280, Math.round(targetH * aspectRatio));
    }
    if (Math.abs(targetW - newBounds.width) > 2 || Math.abs(targetH - newBounds.height) > 2) {
      event.preventDefault();
      win.setBounds({
        x: newBounds.x,
        y: newBounds.y,
        width: targetW,
        height: targetH,
      });
    }
  });
}

function getSavedWindowBounds(boundsKey) {
  const data = readAppData();
  const map = data.windowBounds;
  if (!map || typeof map !== "object") return null;
  const entry = map[boundsKey];
  if (!entry || typeof entry !== "object") return null;
  return entry;
}

function saveWindowBounds(boundsKey, win) {
  if (!boundsKey || !win || win.isDestroyed()) return;
  const data = readAppData();
  if (!data.windowBounds || typeof data.windowBounds !== "object") {
    data.windowBounds = {};
  }
  const b = win.getBounds();
  data.windowBounds[boundsKey] = {
    width: b.width,
    height: b.height,
    maximized: win.isMaximized(),
  };
  writeAppDataSoon();
}

/**
 * W135: Berechnet die kompakte, nicht-vollbildartige Startgröße eines Gerätefensters
 * unter Wahrung des exakten Seitenverhältnisses.
 */
function computeInitialChildSize({ boundsKey, width, height, minWidth, minHeight, aspectRatio }) {
  const primary = screen.getPrimaryDisplay();
  const workArea = primary?.workAreaSize || { width: 1600, height: 900 };
  const minW = minWidth || 320;
  const minH = minHeight || 240;

  const saved = boundsKey ? getSavedWindowBounds(boundsKey) : null;
  if (saved && Number(saved.width) >= minW && Number(saved.height) >= minH) {
    let w = Math.min(Number(saved.width), workArea.width - 40);
    let h = Math.min(Number(saved.height), workArea.height - 40);
    if (aspectRatio && aspectRatio > 0) {
      h = Math.round(w / aspectRatio);
      if (h > workArea.height - 40) {
        h = workArea.height - 40;
        w = Math.round(h * aspectRatio);
      }
    }
    return {
      width: Math.max(minW, w),
      height: Math.max(minH, h),
      maximized: Boolean(saved.maximized),
    };
  }

  let w = width || 720;
  let h = height || 480;
  const maxW = Math.round(workArea.width * 0.64);
  const maxH = Math.round(workArea.height * 0.64);

  if (aspectRatio && aspectRatio > 0) {
    const scale = Math.min(1, maxW / Math.max(w, 1), maxH / Math.max(h, 1));
    w = Math.max(minW, Math.round(w * scale));
    h = Math.max(minH, Math.round(w / aspectRatio));
  } else {
    w = Math.max(minW, Math.min(w, maxW));
    h = Math.max(minH, Math.min(h, maxH));
  }

  return { width: w, height: h, maximized: false };
}

function openChildWindow(spec) {
  if (!serverPort || !spec) return;
  const winKey = spec.id || spec.key;
  if (!winKey) return;

  const existing = childWindows.get(winKey);
  if (existing && !existing.isDestroyed()) {
    if (spec.title) {
      windowTitles.set(existing.id, spec.title);
      existing.setTitle(spec.title);
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }

  const isLibrary = spec.role === "library" || winKey === "library";
  const effectiveBoundsKey =
    spec.boundsKey || (isLibrary ? "library" : `inst:${spec.kind || winKey}`);
  const aspectRatio =
    spec.aspectRatio ||
    (!isLibrary && spec.kind !== "inspector" && spec.width && spec.height
      ? Number(spec.width) / Math.max(Number(spec.height), 1)
      : undefined);

  const initial = computeInitialChildSize({
    boundsKey: effectiveBoundsKey,
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    aspectRatio,
  });

  const resolvedTitle = spec.title || (isLibrary ? "Bauteil-Bibliothek" : "Messgerät");
  const query =
    spec.query ||
    (isLibrary
      ? `desktopWindow=library&title=${encodeURIComponent(resolvedTitle)}`
      : `desktopWindow=instrument&winId=${encodeURIComponent(winKey)}&kind=${encodeURIComponent(spec.kind || "scope")}&title=${encodeURIComponent(resolvedTitle)}`);

  const child = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    minWidth: spec.minWidth || 320,
    minHeight: spec.minHeight || 240,
    title: resolvedTitle,
    backgroundColor: "#0d1017",
    frame: false,
    autoHideMenuBar: true,
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  lockWindowTitle(child, resolvedTitle);

  if (aspectRatio && aspectRatio > 0) {
    enforceProportionalResize(child, aspectRatio);
  }

  childWindows.set(winKey, child);
  attachWindowStateEvents(child);

  const revealChild = () => {
    if (child.isDestroyed() || child.isVisible()) return;
    if (initial.maximized) {
      child.maximize();
    }
    child.show();
    child.focus();
  };

  // W134: Erst zeigen, wenn die Kind-Ansicht (`notifyChildReady`) fertig gerendert ist!
  const safetyTimer = setTimeout(revealChild, 3500);

  const onResizeOrMax = () => {
    if (child.isVisible()) {
      saveWindowBounds(effectiveBoundsKey, child);
    }
  };
  child.on("resized", onResizeOrMax);
  child.on("maximize", onResizeOrMax);
  child.on("unmaximize", onResizeOrMax);

  child.on("closed", () => {
    clearTimeout(safetyTimer);
    childWindows.delete(winKey);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("multispice:child-closed", winKey);
      mainWindow.webContents.send("multispice:sync", {
        type: "child-closed",
        id: winKey,
      });
    }
  });

  child.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  child.loadURL(`http://127.0.0.1:${serverPort}/?${query}`);
}

async function createMainWindow() {
  // W137: Nur dann ein eigenes Electron-Splash-Fenster öffnen, wenn nicht
  // bereits der sofortige Portable-Starter-Splash läuft.
  if (!portableSplashPid) {
    createSplashWindow();
  }
  readAppData();

  const outDir = path.join(__dirname, "out");
  const { server, port } = await startStaticServer(outDir);
  staticServer = server;
  serverPort = port;

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, Math.round(width * 0.92)),
    height: Math.min(980, Math.round(height * 0.92)),
    minWidth: 1024,
    minHeight: 680,
    title: "MultiSpice",
    backgroundColor: "#0d1017",
    frame: false,
    autoHideMenuBar: true,
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  lockWindowTitle(mainWindow, "MultiSpice");
  Menu.setApplicationMenu(null);
  attachWindowStateEvents(mainWindow);

  const showMain = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    closePortableSplashIfRunning();
  };

  mainWindow.once("ready-to-show", showMain);
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(showMain, 120);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    flushAppDataSync();
    for (const [, child] of childWindows) {
      if (!child.isDestroyed()) child.close();
    }
    childWindows.clear();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    closePortableSplashIfRunning();
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

// IPC: Fenstertitel setzen (W138)
ipcMain.on("multispice:set-title", (event, rawTitle) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const nextTitle = String(rawTitle || "MultiSpice").trim() || "MultiSpice";
  windowTitles.set(win.id, nextTitle);
  win.setTitle(nextTitle);
});

// IPC: Fenster-Steuerung
ipcMain.on("multispice:window-control", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (action === "minimize") win.minimize();
  else if (action === "maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === "close") {
    win.close();
  }
});

// IPC: Kind-Fenster öffnen / schließen
ipcMain.on("multispice:open-child", (_event, opts) => {
  if (opts && (opts.id || opts.key)) openChildWindow(opts);
});

ipcMain.on("multispice:child-ready", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win !== mainWindow && win !== splashWindow) {
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  }
});

ipcMain.on("multispice:close-child", (event, key) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    return;
  }
  const child = childWindows.get(key);
  if (child && !child.isDestroyed()) {
    const url = child.webContents.getURL() || "";
    if (key === "library" && !url.includes("desktopWindow=library")) {
      return;
    }
    child.close();
    childWindows.delete(key);
  }
});

// IPC: Echtzeit-Synchronisation zwischen Hauptfenster & Kindfenstern
ipcMain.on("multispice:sync", (event, payload) => {
  const senderId = event.sender.id;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id !== senderId) {
    mainWindow.webContents.send("multispice:sync", payload);
  }
  for (const [, child] of childWindows) {
    if (!child.isDestroyed() && child.webContents.id !== senderId) {
      child.webContents.send("multispice:sync", payload);
    }
  }
});

// IPC: Persistenter AppData-Speicher (W130)
ipcMain.on("multispice:appdata-load-sync", (event) => {
  event.returnValue = readAppData();
});

ipcMain.on("multispice:appdata-save", (_event, payload) => {
  if (!payload || typeof payload.key !== "string") return;
  const data = readAppData();
  data[payload.key] = payload.value;
  writeAppDataSoon();
});

// IPC: Nativer Datei-Speicherdialog & Direkt-Speicherung für Auto-Save (W130 & W131)
ipcMain.handle("multispice:file-save", async (event, opts) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    let targetPath = opts?.filePath || null;

    if (!targetPath) {
      const defaultName = opts?.defaultName || "schaltplan.msx.json";
      const filters = Array.isArray(opts?.filters) && opts.filters.length
        ? opts.filters
        : [
            { name: "MultiSpice-Projekt (*.msx.json)", extensions: ["msx.json", "json"] },
            { name: "Alle Dateien (*.*)", extensions: ["*"] },
          ];
      const result = await dialog.showSaveDialog(win, {
        title: opts?.title || "Projekt speichern",
        defaultPath: defaultName,
        filters,
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      targetPath = result.filePath;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    // S5.11: Atomar schreiben — ein Crash während des Datei-Auto-Saves darf
    // die Projektdatei nie halb geschrieben zurücklassen (kein .bak beim
    // Nutzer: Crash → alter ODER neuer Stand, nie ein halber).
    if (opts?.encoding === "base64" && typeof opts?.content === "string") {
      atomicWriteFileSync(targetPath, Buffer.from(opts.content, "base64"));
    } else {
      atomicWriteFileSync(targetPath, String(opts?.content ?? ""), "utf8");
    }
    return { ok: true, filePath: targetPath };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// IPC: Nativer Datei-Öffnen-Dialog (W130)
ipcMain.handle("multispice:file-open", async (event, opts) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const filters = Array.isArray(opts?.filters) && opts.filters.length
      ? opts.filters
      : [
          {
            name: "Schaltplan-Dateien (*.msx.json, *.json, *.cir, *.sp, *.net, *.asc)",
            extensions: ["json", "cir", "sp", "net", "asc"],
          },
          { name: "Alle Dateien (*.*)", extensions: ["*"] },
        ];
    const result = await dialog.showOpenDialog(win, {
      title: opts?.title || "Schaltplan öffnen",
      properties: ["openFile"],
      filters,
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, "utf8");
    return {
      ok: true,
      filePath,
      name: path.basename(filePath),
      content,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// IPC: Nativer Vektor-Druck & PDF-Export unter Windows (W131)
ipcMain.handle("multispice:print-svg", async (event, opts) => {
  let printWin = null;
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const svg = String(opts?.svg || "");
    const title = String(opts?.title || "Schaltplan");
    const mode = opts?.mode === "pdf" ? "pdf" : "print";

    let pdfTargetPath = null;
    if (mode === "pdf") {
      const saveRes = await dialog.showSaveDialog(parentWin, {
        title: "Als PDF exportieren",
        defaultPath: opts?.defaultName || `${title}.pdf`,
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

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; color: #111111; }
  body { display: flex; align-items: center; justify-content: center; }
  svg { width: 100%; height: 100%; max-width: 277mm; max-height: 190mm; display: block; }
</style>
</head>
<body>${svg}</body>
</html>`;

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    if (mode === "pdf" && pdfTargetPath) {
      const pdfBuffer = await printWin.webContents.printToPDF({
        landscape: true,
        pageSize: "A4",
        printBackground: true,
      });
      fs.writeFileSync(pdfTargetPath, pdfBuffer);
      printWin.close();
      return { ok: true, filePath: pdfTargetPath };
    }

    return await new Promise((resolve) => {
      printWin.webContents.print(
        { silent: false, printBackground: true, landscape: true },
        (success, failureReason) => {
          if (printWin && !printWin.isDestroyed()) {
            printWin.close();
          }
          resolve({ ok: Boolean(success), error: failureReason || undefined });
        },
      );
    });
  } catch (err) {
    if (printWin && !printWin.isDestroyed()) {
      printWin.close();
    }
    return { ok: false, error: String(err?.message || err) };
  }
});

app.whenReady().then(createMainWindow);

app.on("window-all-closed", () => {
  flushAppDataSync();
  if (staticServer) {
    try {
      staticServer.close();
    } catch {
      // Ignore
    }
  }
  closePortableSplashIfRunning();
  app.quit();
});
