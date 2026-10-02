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
/** @type {Map<string, BrowserWindow>} */
const childWindows = new Map();
let serverPort = 0;

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

  win.once("ready-to-show", () => {
    win.show();
  });

  return win;
}

async function boot() {
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
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  mainWindow.on("closed", () => {
    mainWindow = null;
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

ipcMain.on("multispice:open-child", (_event, spec) => {
  if (!spec || !spec.id) return;
  const existing = childWindows.get(spec.id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  const child = createFramelessWindow({
    width: Math.max(360, Number(spec.width) || 560),
    height: Math.max(280, Number(spec.height) || 440),
    minWidth: 320,
    minHeight: 240,
    title: spec.title || "MultiSpice",
  });

  childWindows.set(spec.id, child);

  const params = new URLSearchParams({
    desktopWindow: spec.role || "instrument",
    winId: spec.id,
    kind: spec.kind || "",
    title: spec.title || "MultiSpice",
  });

  child.loadURL(`http://127.0.0.1:${serverPort}/?${params.toString()}`);

  child.on("closed", () => {
    childWindows.delete(spec.id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("multispice:child-closed", spec.id);
    }
  });
});

ipcMain.on("multispice:close-child", (_event, id) => {
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
