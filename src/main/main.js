console.log("[BOOT] Electron process started, PID:", process.pid);

const { app, BrowserWindow, dialog, shell, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// ═══════════════════════════════════════
// CRASH / ERROR HANDLERS
// ═══════════════════════════════════════

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err.message);
  console.error("[FATAL] Stack:", err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[ERROR] unhandledRejection:", reason);
  if (reason instanceof Error) {
    console.error("[ERROR] Stack:", reason.stack);
  }
});

// ═══════════════════════════════════════
// PROTOCOL REGISTRATION (must happen before app.ready)
// ═══════════════════════════════════════

const rendererRoot = path.join(__dirname, "..", "renderer");
console.log("[BOOT] rendererRoot:", rendererRoot);
console.log("[BOOT] rendererRoot exists:", fs.existsSync(rendererRoot));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lignis",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
  },
]);

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

// ═══════════════════════════════════════
// NON-CRITICAL SERVICES (lazy loaded)
// ═══════════════════════════════════════

let ExtensionManager, db, setupDevModeIpc;

function loadNonCriticalModules() {
  try {
    ({ ExtensionManager } = require("./extension-manager"));
    console.log("[BOOT] ExtensionManager module loaded");
  } catch (err) {
    console.error("[WARN] ExtensionManager failed to load:", err.message);
    ExtensionManager = null;
  }

  try {
    ({ db } = require("./database"));
    console.log("[BOOT] DatabaseService module loaded");
  } catch (err) {
    console.error("[WARN] DatabaseService failed to load:", err.message);
    db = null;
  }

  try {
    ({ setupDevModeIpc } = require("./dev-mode"));
    console.log("[BOOT] DevMode module loaded");
  } catch (err) {
    console.error("[WARN] DevMode failed to load:", err.message);
    setupDevModeIpc = null;
  }
  console.log("[BOOT] All non-critical modules loaded");
}

// ═══════════════════════════════════════
// SETTINGS STORE
// ═══════════════════════════════════════

function migrateNovaPadConfig() {
  try {
    const oldPath = path.join(app.getPath("userData"), "novapad-config.json");
    if (fs.existsSync(oldPath)) {
      const newPath = path.join(app.getPath("userData"), "lignis-config.json");
      if (!fs.existsSync(newPath)) {
        fs.copyFileSync(oldPath, newPath);
        console.log("[Lignis] Configurações do NovaPad migradas.");
      }
    }
  } catch (err) {
    console.warn("[WARN] Migração de configurações falhou:", err.message);
  }
}

let store;
function initStore() {
  const Store = require("electron-store");
  store = new Store({
    name: "lignis-config",
    defaults: {
      theme: "dark", fontSize: 14, tabSize: 4, wordWrap: false,
      lineNumbers: true, highlightLine: true, autoIndent: true, autoPair: true,
      recentFiles: [], recentFolders: [],
      windowBounds: { width: 1200, height: 800 },
      useSpaces: true, showStatusBar: true, showToolbar: true,
      autosave: false, autosaveMode: "off", autosaveDelay: 3,
      trimTrailing: false, finalNewline: false,
      accentColor: "#4a9eff", uiScale: 100, animations: true,
      restoreSession: true, restoreCursor: true, restoreZoom: false,
      lastSession: null,
      searchRegex: false, searchMatchCase: false, searchWholeWord: false,
    },
  });
  console.log("[BOOT] Settings store initialized");
}

// ═══════════════════════════════════════
// AUTO UPDATER
// ═══════════════════════════════════════

let autoUpdater;
let updateInstalling = false;

function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = require("electron-updater");
    autoUpdater = updater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (msg) => console.log("[Update]", msg),
      warn: (msg) => console.warn("[Update]", msg),
      error: (msg) => console.error("[Update]", msg),
    };
    console.log("[BOOT] AutoUpdater initialized");
  } catch (err) {
    console.warn("[WARN] AutoUpdater failed to load:", err.message);
    autoUpdater = null;
  }
}

// ═══════════════════════════════════════
// WINDOW CREATION
// ═══════════════════════════════════════

let mainWindow = null;
let isForceClose = false;

function createWindow() {
  console.log("[BOOT] Creating BrowserWindow...");
  const bounds = store.get("windowBounds");
  const preloadPath = path.join(__dirname, "..", "preload", "preload.js");
  console.log("[BOOT] preload path:", preloadPath);
  console.log("[BOOT] preload exists:", fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 600,
    minHeight: 400,
    title: "Lignis",
    icon: (() => { const i = path.join(__dirname, "..", "assets", "icons", "icon.png"); return fs.existsSync(i) ? i : undefined; })(),
    backgroundColor: store.get("theme") === "dark" ? "#171821" : "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
      spellcheck: false,
    },
    show: false,
    frame: true,
  });
  console.log("[BOOT] BrowserWindow created");

  // ── Renderer error monitoring ──
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error("[RENDERER FAIL]", errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error("[RENDERER CRASH]", details.reason, details.exitCode);
  });

  mainWindow.webContents.on("preload-error", (event, preloadPath, error) => {
    console.error("[PRELOAD ERROR]", preloadPath, error.message);
  });

  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    // Log renderer console messages in dev
    if (level >= 2) { // warnings and errors
      const prefix = level === 2 ? "[RENDERER WARN]" : "[RENDERER ERROR]";
      console.log(prefix, message);
    }
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.error("[RENDERER] Unresponsive — waiting for recovery...");
  });

  // ── Load renderer ──
  console.log("[BOOT] Loading lignis://app/index.html ...");
  mainWindow.loadURL("lignis://app/index.html");

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[BOOT] Renderer loaded successfully");
  });

  mainWindow.once("ready-to-show", () => {
    console.log("[BOOT] ready-to-show → showing window");
    mainWindow.show();
  });

  // Fallback: if ready-to-show doesn't fire within 8s, show anyway
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn("[BOOT] ready-to-show timeout — forcing show");
      mainWindow.show();
    }
  }, 8000);

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

// ═══════════════════════════════════════
// SINGLE INSTANCE
// ═══════════════════════════════════════

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("[BOOT] Another instance running — quitting");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ═══════════════════════════════════════
// APP READY — MAIN STARTUP
// ═══════════════════════════════════════

console.log("[BOOT] Waiting for app.whenReady()...");

app.whenReady().then(async () => {
  console.log("[BOOT] app.whenReady() — STARTING");

  // 1. Load non-critical modules (safe failures)
  console.log("[BOOT] Loading non-critical modules...");
  loadNonCriticalModules();

  // 2. Database will be initialized after window is created (to avoid blocking event loop)
  console.log("[BOOT] Step 2: Database deferred (will init after window)");

  // 3. Settings store
  console.log("[BOOT] Step 3: Settings...");
  migrateNovaPadConfig();
  initStore();
  console.log("[BOOT] Settings ready");

  // 4. Auto updater (non-blocking)
  console.log("[BOOT] Step 4: AutoUpdater...");
  initAutoUpdater();

  // 5. Protocol
  console.log("[BOOT] Step 5: Protocol...");
  registerLignisProtocol();
  console.log("[BOOT] Protocol registered");

  // 6. Create window
  console.log("[BOOT] Step 6: Window...");
  createWindow();
  console.log("[BOOT] Window creation initiated");

  // 7. IPC handlers will be set up with ExtensionManager below

  // 8. Menu
  try {
    const { buildMenu } = require("./menu");
    const menu = buildMenu(mainWindow, store);
    Menu.setApplicationMenu(menu);
    console.log("[BOOT] Menu built");
  } catch (err) {
    console.error("[WARN] Menu setup failed:", err.message);
  }

  // 9. DevMode IPC (non-critical)
  if (setupDevModeIpc) {
    try {
      setupDevModeIpc();
      console.log("[BOOT] DevMode IPC registered");
    } catch (err) {
      console.warn("[WARN] DevMode IPC failed:", err.message);
    }
  }

  // 10. IPC + Extension Manager (non-blocking)
  try {
    const { setupIpc } = require("./ipc");
    let extensionManager = null;
    if (ExtensionManager) {
      extensionManager = new ExtensionManager(mainWindow);
      extensionManager.loadAll().catch((err) => {
        console.error("[WARN] Extensions load failed:", err.message);
      });
      console.log("[BOOT] Extension Manager initialized (loading async)");
    }
    setupIpc(mainWindow, store, extensionManager);
    console.log("[BOOT] IPC handlers registered");
  } catch (err) {
    console.error("[ERROR] IPC/ExtensionManager setup failed:", err.message);
  }

  // Deferred: Initialize database after window is created
  // better-sqlite3 can block the event loop on first init
  setImmediate(() => {
    if (db) {
      try {
        db.init();
        console.log("[BOOT] Database initialized (deferred)");
      } catch (err) {
        console.error("[WARN] Database init failed:", err.message);
      }
    }
  });

  console.log("[BOOT] === STARTUP COMPLETE ===");

  // 11. Auto update check (delayed, non-blocking)
  if (autoUpdater) {
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdates().catch(() => {});
      } catch (_) {}
    }, 5000);
  }
});

// ═══════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isForceClose = true;
  if (db) {
    try { db.close(); } catch (_) {}
  }
});

module.exports = { mainWindow: () => mainWindow, getStore: () => store, forceClose: () => { isForceClose = true; if (mainWindow) mainWindow.destroy(); } };
