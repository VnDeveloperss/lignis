const { ipcMain, dialog, app, shell, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

// Optional native PTY backend (e.g. `npm i node-pty && npm rebuild node-pty`).
// When available we get a real pseudo-terminal (resize, interactive TUIs).
// Otherwise we fall back to a robust pipe-based spawn.
let ptyLib = null;
try {
  ptyLib = require("node-pty");
} catch (_) {
  ptyLib = null;
}

// Allowed IPC invoke channels (renderer -> main)
const ALLOWED_INVOKE_CHANNELS = [
  "file-open-dialog",
  "file-save-dialog",
  "file-read",
  "file-write",
  "file-write-atomic",
  "get-app-info",
  "get-recent-files",
  "add-recent-file",
  "clear-recent-files",
  "get-settings",
  "set-settings",
  "set-settings-bulk",
  "check-file-exists",
  "get-file-stats",
  "get-file-mtime",
  "shell-open-external",
  "shell-open-path",
  "get-platform",
  "request-close",
  "force-close",
  "clipboard-write",
  "clipboard-read",
  "save-session",
  "load-session",
  "folder-open-dialog",
  "read-directory",
  "terminal-create",
  "terminal-write",
  "terminal-resize",
  "terminal-kill",
];

// Allowed file extensions for open dialog
const ALLOWED_EXTENSIONS = [
  "txt", "md", "json", "js", "ts", "jsx", "tsx", "html", "css", "scss",
  "less", "xml", "yaml", "yml", "py", "java", "c", "cpp", "h", "hpp",
  "cs", "gd", "sql", "log", "ini", "cfg", "env", "sh", "bat", "ps1",
  "rb", "go", "rs", "swift", "kt", "lua", "r", "toml", "vue", "svelte",
  "wasm", "diff", "patch", "jsonc", "json5",
];

// Max file size: 50MB (warn above 10MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const WARN_FILE_SIZE = 10 * 1024 * 1024;

let extensionManager = null;

function setupIpc(mainWindow, store, extManager) {
  extensionManager = extManager || null;
  ipcMain.handle("file-open-dialog", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Abrir arquivo",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Arquivos de texto", extensions: ALLOWED_EXTENSIONS },
        { name: "Todos os arquivos", extensions: ["*"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, data: result.filePaths };
  });

  ipcMain.handle("file-save-dialog", async (event, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Salvar arquivo",
      defaultPath: defaultName || "Sem título",
      filters: [
        { name: "Arquivos de texto", extensions: ALLOWED_EXTENSIONS },
        { name: "Todos os arquivos", extensions: ["*"] },
      ],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, data: result.filePath };
  });

  ipcMain.handle("file-read", async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        return { success: false, error: "Caminho de arquivo inválido." };
      }

      const resolved = path.resolve(filePath);

      if (!fs.existsSync(resolved)) {
        return { success: false, error: "Arquivo não encontrado." };
      }

      const stats = fs.statSync(resolved);
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `O arquivo é muito grande (${(stats.size / 1024 / 1024).toFixed(1)}MB).`,
          tooLarge: true,
          size: stats.size,
        };
      }

      if (stats.size === 0) {
        return {
          success: true,
          data: {
            content: "",
            encoding: "utf-8",
            lineEnding: "LF",
            size: 0,
            modifiedTime: stats.mtimeMs,
            large: false,
          },
        };
      }

      const buffer = fs.readFileSync(resolved);

      // Detect binary
      for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
        if (buffer[i] === 0) {
          return {
            success: false,
            error: "O arquivo parece ser binário e não pode ser aberto como texto.",
            binary: true,
          };
        }
      }

      let content = buffer.toString("utf-8");

      // Detect BOM
      let encoding = "utf-8";
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        encoding = "utf-8-bom";
        content = content.substring(1);
      } else if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        encoding = "utf-16le";
        content = buffer.toString("utf-16le");
      } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        encoding = "utf-16be";
        content = buffer.toString("utf16le");
      }

      // Detect line ending
      let lineEnding = "LF";
      if (content.includes("\r\n")) {
        lineEnding = "CRLF";
      } else if (content.includes("\r")) {
        lineEnding = "CR";
      }

      return {
        success: true,
        data: {
          content,
          encoding,
          lineEnding,
          size: stats.size,
          modifiedTime: stats.mtimeMs,
          large: stats.size > WARN_FILE_SIZE,
        },
      };
    } catch (err) {
      return { success: false, error: `Falha ao ler arquivo: ${err.message}` };
    }
  });

  ipcMain.handle("file-write", async (event, filePath, content) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        return { success: false, error: "Caminho de arquivo inválido." };
      }
      if (typeof content !== "string") {
        return { success: false, error: "Conteúdo inválido." };
      }

      const resolved = path.resolve(filePath);

      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolved, content, "utf-8");

      const stats = fs.statSync(resolved);
      return {
        success: true,
        data: { size: stats.size, modifiedTime: stats.mtimeMs },
      };
    } catch (err) {
      return { success: false, error: `Falha ao salvar arquivo: ${err.message}` };
    }
  });

  // Atomic write: write to temp file, then rename
  ipcMain.handle("file-write-atomic", async (event, filePath, content) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        return { success: false, error: "Caminho de arquivo inválido." };
      }
      if (typeof content !== "string") {
        return { success: false, error: "Conteúdo inválido." };
      }

      const resolved = path.resolve(filePath);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpPath = resolved + ".tmp.lignis";
      fs.writeFileSync(tmpPath, content, "utf-8");

      // Atomic rename
      fs.renameSync(tmpPath, resolved);

      const stats = fs.statSync(resolved);
      return {
        success: true,
        data: { size: stats.size, modifiedTime: stats.mtimeMs },
      };
    } catch (err) {
      // Cleanup temp file if it exists
      try {
        const tmpPath = path.resolve(filePath) + ".tmp.lignis";
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
      return { success: false, error: `Falha ao salvar arquivo: ${err.message}` };
    }
  });

  ipcMain.handle("get-app-info", () => {
    return {
      success: true,
      data: {
        version: app.getVersion(),
        name: app.getName(),
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
    };
  });

  ipcMain.handle("get-recent-files", () => {
    const recent = store.get("recentFiles") || [];
    const valid = recent.filter((f) => {
      try {
        return fs.existsSync(f);
      } catch {
        return false;
      }
    });
    if (valid.length !== recent.length) {
      store.set("recentFiles", valid);
    }
    return { success: true, data: valid };
  });

  ipcMain.handle("add-recent-file", (event, filePath) => {
    if (!filePath || typeof filePath !== "string") return { success: false };
    const recent = store.get("recentFiles") || [];
    const filtered = recent.filter((f) => f !== filePath);
    filtered.unshift(filePath);
    store.set("recentFiles", filtered.slice(0, 30));
    return { success: true };
  });

  ipcMain.handle("clear-recent-files", () => {
    store.set("recentFiles", []);
    return { success: true };
  });

  ipcMain.handle("get-settings", () => {
    return { success: true, data: store.store };
  });

  ipcMain.handle("set-settings", (event, key, value) => {
    try {
      store.set(key, value);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("set-settings-bulk", (event, settingsObj) => {
    try {
      Object.entries(settingsObj).forEach(([key, value]) => {
        store.set(key, value);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("check-file-exists", (event, filePath) => {
    try {
      return { success: true, data: fs.existsSync(path.resolve(filePath)) };
    } catch {
      return { success: true, data: false };
    }
  });

  ipcMain.handle("get-file-stats", (event, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      const stats = fs.statSync(resolved);
      return {
        success: true,
        data: {
          size: stats.size,
          modifiedTime: stats.mtimeMs,
          isFile: stats.isFile(),
        },
      };
    } catch {
      return { success: false, error: "Não foi possível ler estatísticas do arquivo." };
    }
  });

  ipcMain.handle("get-file-mtime", (event, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) return { success: false, error: "Arquivo não encontrado." };
      const stats = fs.statSync(resolved);
      return { success: true, data: stats.mtimeMs };
    } catch {
      return { success: false, error: "Não foi possível ler o arquivo." };
    }
  });

  ipcMain.handle("shell-open-external", async (event, url) => {
    try {
      if (typeof url !== "string") return { success: false };
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        return { success: false, error: "Somente URLs HTTPS permitidas." };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("shell-open-path", (event, filePath) => {
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        shell.showItemInFolder(resolved);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-platform", () => {
    return { success: true, data: process.platform };
  });

  ipcMain.handle("request-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle("force-close", () => {
    const { forceClose } = require("./main");
    forceClose();
  });

  ipcMain.handle("clipboard-write", (event, text) => {
    try {
      if (typeof text !== "string") return { success: false };
      clipboard.writeText(text);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle("clipboard-read", () => {
    try {
      return { success: true, data: clipboard.readText() };
    } catch {
      return { success: false, data: "" };
    }
  });

  ipcMain.handle("save-session", (event, sessionData) => {
    try {
      store.set("lastSession", sessionData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("load-session", () => {
    try {
      const session = store.get("lastSession");
      return { success: true, data: session || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Window Controls (use mainWindow parameter, no circular dependency) ──
  ipcMain.handle("window-minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    return { success: true };
  });

  ipcMain.handle("window-toggle-maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    return { success: true };
  });

  ipcMain.handle("window-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-close-request");
    }
    return { success: true };
  });

  ipcMain.handle("window-is-maximized", () => {
    return { success: true, data: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false };
  });

  // ── Folder Operations ──
  ipcMain.handle("folder-open-dialog", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Abrir pasta",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, data: result.filePaths[0] };
  });

  ipcMain.handle("read-directory", async (event, dirPath) => {
    try {
      if (!dirPath || typeof dirPath !== "string") {
        return { success: false, error: "Caminho inválido." };
      }
      const resolved = path.resolve(dirPath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: "Diretório não encontrado." };
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return { success: false, error: "O caminho não é um diretório." };
      }
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const SKIP_DIRS = new Set([".git", "node_modules", ".cache", "dist", "build", ".vscode", ".idea"]);
      const items = entries
        .filter(e => !e.name.startsWith(".") && !SKIP_DIRS.has(e.name))
        .map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(resolved, e.name),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return { success: true, data: items };
    } catch (err) {
      return { success: false, error: `Falha ao ler diretório: ${err.message}` };
    }
  });

  // ── Terminal (PTY) ──
  const terminals = new Map();
  let terminalIdCounter = 0;

  function getShell() {
    const fs = require("fs");
    if (process.platform === "win32") {
      // Prefer PowerShell 7+ > Windows PowerShell > CMD
      const pwsh7 = "pwsh.exe";
      const pwsh = "powershell.exe";
      const comspec = process.env.COMSPEC || "cmd.exe";
      // Quick heuristic: try pwsh first, fall back to powershell, then comspec
      return pwsh7; // Most modern; fallback is automatic via spawn error handling
    }
    return process.env.SHELL || "/bin/bash";
  }

  function getShellArgs() {
    if (process.platform === "win32") {
      // Don't pass -NoLogo for pwsh/powershell; cmd.exe takes no args
      return [];
    }
    return [];
  }

  ipcMain.handle("terminal-create", (event, options) => {
    try {
      const id = "term_" + (++terminalIdCounter);
      const cwd = (options && options.cwd) || app.getPath("home");
      const cols = (options && options.cols) || 80;
      const rows = (options && options.rows) || 24;
      const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" };

      if (ptyLib) {
        let shellCmd = getShell();
        let shellArgs = getShellArgs();
        // On Windows, try PowerShell 7, then Windows PowerShell, then CMD
        if (process.platform === "win32") {
          const { execSync } = require("child_process");
          let resolved = false;
          for (const sh of ["pwsh.exe", "powershell.exe", "cmd.exe"]) {
            try {
              execSync(`where ${sh}`, { stdio: "ignore" });
              shellCmd = sh;
              resolved = true;
              break;
            } catch (_) {}
          }
          if (!resolved) shellCmd = "cmd.exe";
        }
        const pty = ptyLib.spawn(shellCmd, shellArgs, {
          name: "xterm-256color",
          cols,
          rows,
          cwd,
          env,
        });
        pty.onData((data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("terminal-data", { id, data });
          }
        });
        pty.onExit(({ exitCode }) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("terminal-data", {
              id,
              data: `\r\n[Processo finalizado: ${exitCode}]\r\n`,
            });
          }
          terminals.delete(id);
        });
        terminals.set(id, { pty, proc: null, cols, rows });
        return { success: true, data: { id }, pty: true };
      }

      // Fallback: child_process spawn (no real PTY, but works)
      let shellCmd = getShell();
      let shellArgs = getShellArgs();
      if (process.platform === "win32") {
        const { execSync } = require("child_process");
        for (const sh of ["pwsh.exe", "powershell.exe", "cmd.exe"]) {
          try { execSync(`where ${sh}`, { stdio: "ignore" }); shellCmd = sh; break; } catch (_) {}
        }
      }
      const proc = spawn(shellCmd, shellArgs, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform !== "win32",
        windowsHide: true,
      });

      const stdoutDecoder = new StringDecoder("utf-8");
      const stderrDecoder = new StringDecoder("utf-8");
      proc.stdout.on("data", (chunk) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal-data", { id, data: stdoutDecoder.write(chunk) });
        }
      });
      proc.stderr.on("data", (chunk) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal-data", { id, data: stderrDecoder.write(chunk) });
        }
      });
      proc.on("close", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const tail = stdoutDecoder.end() + stderrDecoder.end();
          if (tail) mainWindow.webContents.send("terminal-data", { id, data: tail });
        }
        terminals.delete(id);
      });
      proc.on("error", (err) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal-data", { id, data: `\r\n[Erro ao iniciar o shell: ${err.message}]\r\n` });
        }
      });
      proc.on("exit", (code) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal-data", { id, data: `\r\n[Processo finalizado: ${code}]\r\n` });
        }
        terminals.delete(id);
      });
      if (proc.stdin) proc.stdin.on("error", () => {});
      terminals.set(id, { pty: null, proc, cols, rows });
      return { success: true, data: { id } };
    } catch (err) {
      return { success: false, error: `Falha ao criar terminal: ${err.message}` };
    }
  });

  ipcMain.handle("terminal-write", (event, id, data) => {
    const term = terminals.get(id);
    if (!term) return { success: false, error: "Terminal não encontrado." };
    try {
      if (term.pty) {
        term.pty.write(data);
      } else if (term.proc && term.proc.stdin) {
        term.proc.stdin.write(data);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("terminal-resize", (event, id, cols, rows) => {
    const term = terminals.get(id);
    if (!term) return { success: false };
    term.cols = cols;
    term.rows = rows;
    // Real PTY resize is only possible with node-pty.
    if (term.pty && typeof term.pty.resize === "function") {
      try {
        term.pty.resize(cols, rows);
      } catch (_) {}
    }
    return { success: true };
  });

  ipcMain.handle("terminal-kill", (event, id) => {
    const term = terminals.get(id);
    if (!term) return { success: false };
    try {
      if (term.pty) {
        term.pty.kill();
      } else if (term.proc) {
        term.proc.kill();
      }
    } catch (_) {}
    terminals.delete(id);
    return { success: true };
  });
}

// ── Extension IPC Handlers ──
  ipcMain.handle("extension-discover", () => {
    if (!extensionManager) return { success: false, error: "Extension system not initialized." };
    return { success: true, data: extensionManager.discover() };
  });

  ipcMain.handle("extension-get-all", () => {
    if (!extensionManager) return { success: true, data: [] };
    return { success: true, data: extensionManager.getAllExtensions() };
  });

  ipcMain.handle("extension-get", (event, id) => {
    if (!extensionManager) return { success: false };
    const ext = extensionManager.getExtension(id);
    return ext ? { success: true, data: ext } : { success: false, error: "Not found" };
  });

  ipcMain.handle("extension-activate", async (event, id) => {
    if (!extensionManager) return { success: false, error: "Extension system not initialized." };
    try {
      await extensionManager.activate(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-deactivate", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.deactivate(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-enable", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.enable(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-disable", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.disable(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-install-dialog", async () => {
    if (!extensionManager) return { success: false };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Instalar extensão",
      properties: ["openDirectory"],
      filters: [{ name: "Extensões Lignis", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    try {
      const ext = await extensionManager.installFromPath(result.filePaths[0]);
      return { success: true, data: ext };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-uninstall", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.uninstall(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-get-commands", () => {
    if (!extensionManager) return { success: true, data: [] };
    return { success: true, data: extensionManager.getRegisteredCommands() };
  });

  ipcMain.handle("extension-validate", (event, id) => {
    if (!extensionManager) return { success: false, error: "Extension system not initialized." };
    const result = extensionManager.validateExtension(id);
    return { success: true, data: result };
  });

  ipcMain.handle("extension-export", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      const result = await extensionManager.exportExtension(id);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-rollback", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.rollback(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("extension-reload", async (event, id) => {
    if (!extensionManager) return { success: false };
    try {
      await extensionManager.reload(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

module.exports = { setupIpc };
