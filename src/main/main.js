const { app, BrowserWindow, dialog, shell, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { setupIpc } = require("./ipc");
const { buildMenu } = require("./menu");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");

// Renderer content is served over a custom privileged scheme (lignis://app)
// instead of file://. This gives workers a stable same-origin base so Monaco
// can importScripts() its worker files and nls strings offline.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lignis",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
  },
]);

const rendererRoot = path.join(__dirname, "..", "renderer");

function registerLignisProtocol() {
  protocol.handle("lignis", (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/" || rel === "") rel = "/index.html";
      const filePath = path.normalize(path.join(rendererRoot, rel));
      if (!filePath.startsWith(rendererRoot)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response(`Bad request: ${err.message}`, { status: 400 });
    }
  });
}

// ─── Auto Updater Configuration ─────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
let updateInstalling = false;
autoUpdater.logger = {
  info: (msg) => console.log("[Update]", msg),
  warn: (msg) => console.warn("[Update]", msg),
  error: (msg) => console.error("[Update]", msg),
};

// ─── Migrate NovaPad settings to Lignis ───────────────
function migrateNovaPadConfig() {
  try {
    const oldPath = path.join(app.getPath("userData"), "novapad-config.json");
    if (fs.existsSync(oldPath)) {
      const newPath = path.join(app.getPath("userData"), "lignis-config.json");
      if (!fs.existsSync(newPath)) {
        fs.copyFileSync(oldPath, newPath);
        console.log("[Lignis] Configurações do NovaPad migradas com sucesso.");
      }
    }
  } catch (err) {
    console.warn("[Lignis] Falha na migração de configurações:", err.message);
  }
}

// Run migration before store init
migrateNovaPadConfig();

// Persistent settings store
const store = new Store({
  name: "lignis-config",
  defaults: {
    theme: "dark",
    fontSize: 14,
    tabSize: 4,
    wordWrap: false,
    lineNumbers: true,
    highlightLine: true,
    autoIndent: true,
    autoPair: true,
    recentFiles: [],
    recentFolders: [],
    windowBounds: { width: 1200, height: 800 },
    useSpaces: true,
    showStatusBar: true,
    showToolbar: true,
    autosave: false,
    autosaveMode: "off",
    autosaveDelay: 3,
    trimTrailing: false,
    finalNewline: false,
    accentColor: "#4a9eff",
    uiScale: 100,
    animations: true,
    restoreSession: true,
    restoreCursor: true,
    restoreZoom: false,
    lastSession: null,
    searchRegex: false,
    searchMatchCase: false,
    searchWholeWord: false,
  },
});

let mainWindow = null;
let isForceClose = false;

function createWindow() {
  const bounds = store.get("windowBounds");

  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 600,
    minHeight: 400,
    title: "Lignis",
    icon: path.join(__dirname, "..", "assets", "icons", "icon.png"),
    backgroundColor: store.get("theme") === "dark" ? "#171821" : "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      spellcheck: false,
    },
    show: false,
    frame: true,
  });

  mainWindow.loadURL("lignis://app/index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("resize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [width, height] = mainWindow.getSize();
      store.set("windowBounds", { width, height });
    }
  });

  mainWindow.on("close", (e) => {
    if (isForceClose) return;
    e.preventDefault();
    mainWindow.webContents.send("window-close-request");
  });
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  registerLignisProtocol();
  createWindow();
  setupIpc(mainWindow, store);

  const menu = buildMenu(mainWindow, store);
  Menu.setApplicationMenu(menu);

  // ─── Auto Update: check for updates after app is ready ──
  // Do NOT block startup — check in background
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ─── Auto Update Functions ─────────────────────────
let updateDownloaded = false;

function checkForUpdates() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[Update] Falha ao verificar atualizações:", err.message);
  });
}

autoUpdater.on("checking-for-update", () => {
  console.log("[Update] Verificando atualizações...");
});

autoUpdater.on("update-available", (info) => {
  console.log("[Update] Atualização disponível:", info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-available", {
      version: info.version,
      currentVersion: app.getVersion(),
    });
  }
});

autoUpdater.on("update-not-available", () => {
  console.log("[Update] Nenhuma atualização disponível.");
});

autoUpdater.on("download-progress", (progress) => {
  console.log(`[Update] Download: ${Math.round(progress.percent)}%`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("[Update] Download concluído:", info.version);
  updateDownloaded = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloaded", {
      version: info.version,
    });
  }
});

autoUpdater.on("error", (err) => {
  console.error("[Update] Erro:", err.message);
});

// ─── IPC handlers for update control ──
const { ipcMain } = require("electron");

ipcMain.handle("update-download", () => {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error("[Update] Falha ao baixar:", err.message);
  });
});

ipcMain.handle("update-install", () => {
  // The renderer only invokes this after confirming no unsaved documents
  // (see the guarded action button in app.js). Request a graceful close and
  // install as soon as the window is really closed — event-driven, no delay.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window-close-request");
    mainWindow.once("closed", () => {
      if (!updateInstalling) {
        updateInstalling = true;
        autoUpdater.quitAndInstall(false, true);
      }
    });
  } else {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle("update-check-manual", () => {
  checkForUpdates();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

module.exports = { mainWindow: () => mainWindow, getStore: () => store, forceClose: () => { isForceClose = true; if (mainWindow) mainWindow.destroy(); } };
