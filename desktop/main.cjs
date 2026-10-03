const { app, BrowserWindow, ipcMain, shell } = require("electron");
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
    width: 260,
    height: 190,
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
    border-radius: 12px;
    overflow: hidden;
    -webkit-app-region: drag;
  }
  .logo {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    margin-bottom: 18px;
    animation: pulse 1.8s ease-in-out infinite;
  }
  .track {
    width: 120px;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
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
    animation: slide 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes slide {
    0% { left: -45%; }
    100% { left: 100%; }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.95; }
    50% { transform: scale(1.04); opacity: 1; }
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

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
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
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(addr.port);
    });
    server.on("error", reject);
  });
}

function createFramelessWindow(options) {
  const iconPath = resolveIconPath();
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    minWidth: options.minWidth || 340,
    minHeight: options.minHeight || 240,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
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
    width: 1480,
    height: 920,
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
    win.show();
    win.focus();
  }
});

ipcMain.on("multispice:open-child", (event, spec) => {
  // W126: Nur das Hauptfenster darf Kindfenster öffnen
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  if (!spec || !spec.id) return;
  const existing = childWindows.get(spec.id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    if (!existing.isVisible()) existing.show();
    existing.focus();
    return;
  }

  const child = createFramelessWindow({
    width: Math.max(360, Number(spec.width) || 560),
    height: Math.max(280, Number(spec.height) || 440),
    minWidth: 320,
    minHeight: 240,
    title: spec.title || "MultiSpice",
    autoShow: false,
  });

  childWindows.set(spec.id, child);

  const params = new URLSearchParams({
    desktopWindow: spec.role || "instrument",
    winId: spec.id,
    kind: spec.kind || "",
    title: spec.title || "MultiSpice",
  });

  child.loadURL(`http://127.0.0.1:${serverPort}/?${params.toString()}`);

  // Sicherheits-Fallback, falls child-ready verzögert ist
  const showFallback = setTimeout(() => {
    if (!child.isDestroyed() && !child.isVisible()) {
      child.show();
      child.focus();
    }
  }, 450);

  child.on("closed", () => {
    clearTimeout(showFallback);
    childWindows.delete(spec.id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("multispice:child-closed", spec.id);
    }
  });
});

ipcMain.on("multispice:close-child", (event, id) => {
  // W126: Nur das Hauptfenster darf Kindfenster per close-child schließen
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

app.whenReady().then(boot);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
