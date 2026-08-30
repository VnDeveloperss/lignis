// ========================================
// Lignis v3.5.0 - Extension Manager
// Complete lifecycle, validation, crash isolation, import/export, rollback
// ========================================

const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");
const { createWriteStream } = require("fs");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

// Extension states
const ExtState = {
  INSTALLED: "installed",
  ACTIVATING: "activating",
  ACTIVE: "active",
  DEACTIVATING: "deactivating",
  FAILED: "failed",
  DISABLED: "disabled",
};

// Known permissions with labels
const AVAILABLE_PERMISSIONS = {
  "workspace.read": { label: "Ler arquivos do workspace", sensitive: false },
  "workspace.write": { label: "Modificar arquivos do workspace", sensitive: true },
  "workspace.watch": { label: "Observar alterações no workspace", sensitive: false },
  "editor.read": { label: "Ler dados do editor", sensitive: false },
  "editor.write": { label: "Modificar o editor", sensitive: false },
  "terminal.create": { label: "Criar terminais", sensitive: false },
  "terminal.sendText": { label: "Enviar comandos ao terminal", sensitive: true },
  "network": { label: "Acessar a internet", sensitive: true },
  "clipboard.read": { label: "Ler área de transferência", sensitive: false },
  "clipboard.write": { label: "Modificar área de transferência", sensitive: false },
  "notifications": { label: "Exibir notificações", sensitive: false },
  "commands": { label: "Registrar comandos", sensitive: false },
  "settings": { label: "Ler configurações", sensitive: false },
  "statusbar": { label: "Adicionar itens à barra de status", sensitive: false },
  "views": { label: "Criar painéis laterais", sensitive: false },
  "languages": { label: "Registrar linguagens", sensitive: false },
  "process.execute": { label: "Executar processos locais", sensitive: true },
};

// Activation events
const KNOWN_ACTIVATION_EVENTS = [
  "onStartupFinished",
  "onCommand:",
  "onLanguage:",
  "onFileSystem:",
  "onWorkspaceContains:",
  "onTerminal",
  "onView:",
];

class ExtensionManager extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.extensions = new Map();
    this.extensionsDir = path.join(app.getPath("userData"), "extensions");
    this.storageDir = path.join(app.getPath("userData"), "extensionStorage");
    this.apiVersion = "1.0.0";
    this.enabledState = {};
    this.crashLog = [];
    this._registeredCommands = new Map();
    this._registeredInlineCommands = new Map();
    this._statusBarItems = [];
    this._activationTimeout = 15000; // 15 seconds max activation time
    this._ensureDirs();
    this._loadEnabledState();
    this._loadCrashLog();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
    }
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  _loadEnabledState() {
    try {
      const statePath = path.join(this.extensionsDir, ".state.json");
      if (fs.existsSync(statePath)) {
        this.enabledState = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      }
    } catch (_) {
      this.enabledState = {};
    }
  }

  _saveEnabledState() {
    try {
      const statePath = path.join(this.extensionsDir, ".state.json");
      fs.writeFileSync(statePath, JSON.stringify(this.enabledState, null, 2));
    } catch (_) {}
  }

  _loadCrashLog() {
    try {
      const logPath = path.join(this.extensionsDir, ".crash-log.json");
      if (fs.existsSync(logPath)) {
        this.crashLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      }
    } catch (_) {
      this.crashLog = [];
    }
  }

  _saveCrashLog() {
    try {
      const logPath = path.join(this.extensionsDir, ".crash-log.json");
      fs.writeFileSync(logPath, JSON.stringify(this.crashLog.slice(-50), null, 2));
    } catch (_) {}
  }

  _recordCrash(id, error) {
    this.crashLog.push({
      extensionId: id,
      error: error.message || String(error),
      stack: error.stack,
      timestamp: Date.now(),
    });
    this._saveCrashLog();
  }

  _getExtensionStorage(id) {
    const dir = path.join(this.storageDir, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ═══════════════════════════════════════
  // DISCOVERY & PARSING
  // ═══════════════════════════════════════

  discover() {
    const found = [];
    if (!fs.existsSync(this.extensionsDir)) return found;

    const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const manifestPath = path.join(this.extensionsDir, entry.name, "lignis-extension.json");
      try {
        if (fs.existsSync(manifestPath)) {
          const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          const validation = this.validateManifest(raw, entry.name);
          if (validation.valid) {
            found.push(this._parseManifest(raw, entry.name, validation));
          } else {
            console.warn(`[Extensions] Invalid manifest ${entry.name}:`, validation.errors);
            found.push({
              id: entry.name,
              name: entry.name,
              displayName: entry.name,
              state: ExtState.FAILED,
              error: `Manifesto inválido: ${validation.errors.join(", ")}`,
              path: path.join(this.extensionsDir, entry.name),
              folderName: entry.name,
              validation,
            });
          }
        }
      } catch (err) {
        console.warn(`[Extensions] Failed to parse ${entry.name}:`, err.message);
      }
    }
    return found;
  }

  _parseManifest(manifest, folderName, validation) {
    const id = manifest.publisher
      ? `${manifest.publisher}.${manifest.name}`
      : manifest.name;
    const isEnabled = this.enabledState[id] !== false;
    const lastCrash = this.crashLog.filter(c => c.extensionId === id).pop();

    return {
      id,
      name: manifest.name,
      displayName: manifest.displayName || manifest.name,
      version: manifest.version || "0.0.1",
      publisher: manifest.publisher || "unknown",
      description: manifest.description || "",
      main: manifest.main || "./extension.js",
      permissions: manifest.permissions || [],
      activationEvents: manifest.activationEvents || ["onStartupFinished"],
      contributes: manifest.contributes || {},
      engines: manifest.engines || {},
      homepage: manifest.homepage || "",
      repository: manifest.repository || "",
      license: manifest.license || "",
      path: path.join(this.extensionsDir, folderName),
      folderName,
      state: isEnabled ? ExtState.INSTALLED : ExtState.DISABLED,
      api: null,
      context: null,
      activateTime: null,
      error: lastCrash ? lastCrash.error : null,
      lastCrash: lastCrash ? lastCrash.timestamp : null,
      validation: validation || { valid: true, errors: [], warnings: [] },
    };
  }

  // ═══════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════

  validateManifest(manifest, folderName) {
    const errors = [];
    const warnings = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: ["Manifesto não é um objeto JSON válido"], warnings };
    }

    // Required fields
    if (!manifest.name || typeof manifest.name !== "string") {
      errors.push("Campo 'name' é obrigatório e deve ser uma string");
    } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
      errors.push("Campo 'name' deve conter apenas minúsculas, números e hífens");
    }

    if (!manifest.version || typeof manifest.version !== "string") {
      errors.push("Campo 'version' é obrigatório");
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      warnings.push("Versão não segue semver estritamente");
    }

    if (!manifest.main) {
      warnings.push("Campo 'main' não definido, usando './extension.js'");
    }

    if (!manifest.publisher) {
      warnings.push("Campo 'publisher' não definido");
    }

    // Validate engine compatibility
    if (manifest.engines && manifest.engines.lignis) {
      const required = manifest.engines.lignis.replace(/[^0-9.]/g, "");
      const current = app.getVersion();
      if (this._compareVersions(current, required) < 0) {
        errors.push(`Extensão requer Lignis >= ${required}, versão atual: ${current}`);
      }
    }

    // Validate permissions
    if (manifest.permissions) {
      for (const perm of manifest.permissions) {
        if (perm !== "*" && !AVAILABLE_PERMISSIONS[perm]) {
          warnings.push(`Permissão desconhecida: ${perm}`);
        }
      }
    }

    // Validate activation events
    if (manifest.activationEvents) {
      for (const event of manifest.activationEvents) {
        const known = KNOWN_ACTIVATION_EVENTS.some(ke => event === ke || event.startsWith(ke));
        if (!known) {
          warnings.push(`Activation event possivelmente inválido: ${event}`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  _compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  validateExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext) return { valid: false, errors: ["Extensão não encontrada"], warnings: [] };

    const errors = [];
    const warnings = [];

    // Check manifest file
    const manifestPath = path.join(ext.path, "lignis-extension.json");
    if (!fs.existsSync(manifestPath)) {
      errors.push("Arquivo lignis-extension.json não encontrado");
    }

    // Check main file
    const mainPath = path.join(ext.path, ext.main || "./extension.js");
    if (!fs.existsSync(mainPath)) {
      errors.push(`Arquivo principal não encontrado: ${ext.main}`);
    }

    // Re-validate manifest
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const result = this.validateManifest(manifest, ext.folderName);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } catch (e) {
        errors.push(`Erro ao ler manifesto: ${e.message}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ═══════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════

  async loadAll() {
    const discovered = this.discover();
    this.extensions.clear();
    for (const ext of discovered) {
      this.extensions.set(ext.id, ext);
    }

    // Activate extensions with onStartupFinished event
    for (const [id, ext] of this.extensions) {
      if (ext.state === ExtState.DISABLED) continue;
      if (ext.state === ExtState.FAILED) continue;
      if (ext.activationEvents.includes("onStartupFinished")) {
        await this.activate(id).catch(() => {});
      }
    }

    this.emit("extensions-loaded");
    return this.getAllExtensions();
  }

  async activate(id) {
    const ext = this.extensions.get(id);
    if (!ext) throw new Error(`Extension not found: ${id}`);
    if (ext.state === ExtState.ACTIVE) return;
    if (ext.state === ExtState.DISABLED) throw new Error(`Extension is disabled: ${id}`);

    ext.state = ExtState.ACTIVATING;
    this._sendStateChange(id, ExtState.ACTIVATING);
    const startTime = Date.now();

    try {
      const mainPath = path.join(ext.path, ext.main);
      if (!fs.existsSync(mainPath)) {
        throw new Error(`Arquivo principal não encontrado: ${ext.main}`);
      }

      // Clear require cache for this extension and its dependencies
      this._clearRequireCache(ext.path);

      const extModule = require(mainPath);
      const context = this._createExtensionContext(ext);

      // Activation with timeout
      const activationPromise = typeof extModule.activate === "function"
        ? extModule.activate(context)
        : Promise.resolve();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Ativação expirou após ${this._activationTimeout}ms`)), this._activationTimeout);
      });

      await Promise.race([activationPromise, timeoutPromise]);

      ext.api = extModule;
      ext.context = context;
      ext.state = ExtState.ACTIVE;
      ext.activateTime = Date.now() - startTime;
      ext.error = null;

      this._sendStateChange(id, ExtState.ACTIVE);
      this.emit("extension-activated", id);
      console.log(`[Extensions] ${id} activated in ${ext.activateTime}ms`);
    } catch (err) {
      ext.state = ExtState.FAILED;
      ext.error = err.message;
      this._recordCrash(id, err);
      this._sendStateChange(id, ExtState.FAILED, err.message);
      this.emit("extension-failed", id, err);
      console.error(`[Extensions] Failed to activate ${id}:`, err);
    }
  }

  async deactivate(id) {
    const ext = this.extensions.get(id);
    if (!ext || ext.state !== ExtState.ACTIVE) return;

    ext.state = ExtState.DEACTIVATING;
    this._sendStateChange(id, ExtState.DEACTIVATING);

    try {
      if (ext.api && typeof ext.api.deactivate === "function") {
        await ext.api.deactivate();
      }

      // Dispose all subscriptions
      if (ext.context && ext.context.subscriptions) {
        for (const sub of [...ext.context.subscriptions]) {
          try {
            if (typeof sub.dispose === "function") await sub.dispose();
          } catch (_) {}
        }
        ext.context.subscriptions = [];
      }

      // Clean up registered commands
      for (const [cmdId, cmd] of this._registeredCommands) {
        if (cmd.extension === id) this._registeredCommands.delete(cmdId);
      }
      for (const [cmdId, cmd] of this._registeredInlineCommands) {
        if (cmd.extension === id) this._registeredInlineCommands.delete(cmdId);
      }

      // Clean up status bar items
      this._statusBarItems = this._statusBarItems.filter(item => {
        if (item.extensionId === id) {
          this._emitToRenderer("ext-statusbar-remove", item.id);
          return false;
        }
        return true;
      });

      ext.state = ExtState.INSTALLED;
      ext.api = null;
      ext.context = null;

      this._sendStateChange(id, ExtState.INSTALLED);
      this.emit("extension-deactivated", id);
    } catch (err) {
      console.warn(`[Extensions] Error deactivating ${id}:`, err);
      ext.state = ExtState.INSTALLED;
      ext.api = null;
      ext.context = null;
    }
  }

  async reload(id) {
    await this.deactivate(id);
    this._clearRequireCache(this.extensions.get(id)?.path);
    await this.activate(id);
  }

  async enable(id) {
    const ext = this.extensions.get(id);
    if (!ext) return;
    this.enabledState[id] = true;
    this._saveEnabledState();
    if (ext.state === ExtState.DISABLED) {
      ext.state = ExtState.INSTALLED;
      await this.activate(id);
    }
    this.emit("extension-enabled", id);
  }

  async disable(id) {
    const ext = this.extensions.get(id);
    if (!ext) return;
    await this.deactivate(id);
    ext.state = ExtState.DISABLED;
    this.enabledState[id] = false;
    this._saveEnabledState();
    this.emit("extension-disabled", id);
  }

  // ═══════════════════════════════════════
  // INSTALL / UNINSTALL / IMPORT / EXPORT
  // ═══════════════════════════════════════

  async installFromPath(sourcePath) {
    if (!fs.existsSync(sourcePath)) throw new Error("Caminho não existe");

    const manifestPath = path.join(sourcePath, "lignis-extension.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("lignis-extension.json não encontrado");
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const validation = this.validateManifest(manifest, path.basename(sourcePath));
    if (!validation.valid) {
      throw new Error(`Manifesto inválido: ${validation.errors.join("; ")}`);
    }

    const id = manifest.publisher
      ? `${manifest.publisher}.${manifest.name}`
      : manifest.name;

    // Backup existing if updating
    if (this.extensions.has(id)) {
      await this._backupExtension(id);
      await this.uninstall(id);
    }

    // Security: prevent path traversal
    const destPath = path.join(this.extensionsDir, manifest.name);
    const resolvedDest = path.resolve(destPath);
    if (!resolvedDest.startsWith(this.extensionsDir)) {
      throw new Error("Caminho de destino inválido (path traversal detectado)");
    }

    this._copyDirectory(sourcePath, destPath);

    const ext = this._parseManifest(manifest, manifest.name, validation);
    ext.state = ExtState.INSTALLED;
    this.extensions.set(id, ext);

    await this.activate(id);
    return this.getExtension(id);
  }

  async uninstall(id) {
    const ext = this.extensions.get(id);
    if (!ext) return;

    await this.deactivate(id);

    try {
      this._removeDirectory(ext.path);
    } catch (err) {
      console.warn(`[Extensions] Failed to remove ${ext.path}:`, err);
    }

    // Clean up storage
    try {
      const storagePath = path.join(this.storageDir, id);
      if (fs.existsSync(storagePath)) this._removeDirectory(storagePath);
    } catch (_) {}

    // Clean up backup
    try {
      const backupPath = path.join(this.extensionsDir, `.${id}.backup`);
      if (fs.existsSync(backupPath)) this._removeDirectory(backupPath);
    } catch (_) {}

    this.extensions.delete(id);
    delete this.enabledState[id];
    this._saveEnabledState();
    this.emit("extension-uninstalled", id);
  }

  async _backupExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext || !fs.existsSync(ext.path)) return;
    const backupPath = path.join(this.extensionsDir, `.${id}.backup`);
    try {
      if (fs.existsSync(backupPath)) this._removeDirectory(backupPath);
      this._copyDirectory(ext.path, backupPath);
    } catch (_) {}
  }

  async rollback(id) {
    const backupPath = path.join(this.extensionsDir, `.${id}.backup`);
    if (!fs.existsSync(backupPath)) {
      throw new Error("Nenhum backup disponível para restauração");
    }

    await this.uninstall(id);
    await this.installFromPath(backupPath);
    this._removeDirectory(backupPath);
  }

  async exportExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext) throw new Error("Extensão não encontrada");

    const exportDir = path.join(this.extensionsDir, `.${id}.export`);
    try {
      if (fs.existsSync(exportDir)) this._removeDirectory(exportDir);
      this._copyDirectory(ext.path, exportDir);

      // Remove unnecessary files
      const skipFiles = ["node_modules", ".git", ".cache", ".log", ".env"];
      for (const skip of skipFiles) {
        const skipPath = path.join(exportDir, skip);
        if (fs.existsSync(skipPath)) this._removeDirectory(skipPath);
      }

      // Create .lignis-extension (ZIP-like structure using tar or simple copy)
      const exportPath = path.join(
        app.getPath("userData"),
        `${ext.name}-${ext.version}.lignis-extension`
      );

      // For now, copy the directory (ZIP support can be added later)
      if (fs.existsSync(exportPath)) this._removeDirectory(exportPath);
      this._copyDirectory(exportPath ? exportPath : exportDir, exportDir);

      return { success: true, path: exportDir };
    } finally {
      // Cleanup temp export dir
    }
  }

  // ═══════════════════════════════════════
  // SAFE MODE
  // ═══════════════════════════════════════

  isSafeMode() {
    return process.argv.includes("--disable-extensions");
  }

  async loadAllSafe() {
    if (this.isSafeMode()) {
      console.log("[Extensions] Safe mode: extensions disabled");
      // Discover but don't activate
      const discovered = this.discover();
      this.extensions.clear();
      for (const ext of discovered) {
        ext.state = ExtState.DISABLED;
        this.extensions.set(ext.id, ext);
      }
      return this.getAllExtensions();
    }
    return this.loadAll();
  }

  // ═══════════════════════════════════════
  // FILE OPERATIONS
  // ═══════════════════════════════════════

  _copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this._copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  _removeDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this._removeDirectory(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    fs.rmdirSync(dirPath);
  }

  _clearRequireCache(extPath) {
    if (!extPath) return;
    const resolved = path.resolve(extPath);
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(resolved)) {
        delete require.cache[key];
      }
    }
  }

  // ═══════════════════════════════════════
  // EXTENSION API CONTEXT
  // ═══════════════════════════════════════

  _createExtensionContext(ext) {
    const self = this;
    const subscriptions = [];

    const context = {
      subscriptions,
      extensionPath: ext.path,
      extensionUri: ext.path,
      extensionMode: process.env.NODE_ENV === "production" ? "production" : "development",
      storagePath: self._getExtensionStorage(ext.id),

      lignis: {
        // Window API
        window: {
          showInformationMessage: (msg) => self._emitToRenderer("ext-show-info", msg),
          showWarningMessage: (msg) => self._emitToRenderer("ext-show-warn", msg),
          showErrorMessage: (msg) => self._emitToRenderer("ext-show-error", msg),
          showQuickPick: (items) => self._invokeRenderer("ext-show-quickpick", items),
          showInputBox: (options) => self._invokeRenderer("ext-show-input", options),
          showProgress: (message) => self._emitToRenderer("ext-show-progress", message),
        },

        // Commands API
        commands: {
          registerCommand: (commandId, callback) => {
            if (!self._hasPermission(ext, "commands")) {
              return { dispose: () => {} };
            }
            // Conflict detection
            if (self._registeredCommands.has(commandId)) {
              const existing = self._registeredCommands.get(commandId);
              console.warn(`[Extensions] Command conflict: ${commandId} already registered by ${existing.extension}`);
            }
            self._registeredCommands.set(commandId, { callback, extension: ext.id });
            self._emitToRenderer("ext-command-registered", commandId);
            return { dispose: () => self._registeredCommands.delete(commandId) };
          },
          executeCommand: (commandId, ...args) => {
            const cmd = self._registeredCommands.get(commandId);
            if (!cmd) return Promise.reject(new Error(`Command not found: ${commandId}`));
            try {
              return Promise.resolve(cmd.callback(...args));
            } catch (err) {
              return Promise.reject(err);
            }
          },
          getCommands: () => Array.from(self._registeredCommands.keys()),
        },

        // Workspace API
        workspace: {
          getWorkspaceFolders: () => self._getWorkspaceFolders(ext),
          rootPath: null, // set dynamically
          getConfiguration: (section) => self._getConfiguration(ext, section),
          findFiles: (pattern) => self._invokeRenderer("ext-find-files", pattern),
          openTextDocument: (options) => self._invokeRenderer("ext-open-document", options),
          onDidChangeWorkspaceFolders: (callback) => {
            self.on("workspace-folders-changed", callback);
            return { dispose: () => self.removeListener("workspace-folders-changed", callback) };
          },
        },

        // Editor API
        editor: {
          getActiveTextEditor: () => self._invokeRenderer("ext-get-active-editor"),
          getVisibleTextEditors: () => self._invokeRenderer("ext-get-visible-editors"),
          createStatusBarItem: (alignment, priority) => {
            if (!self._hasPermission(ext, "statusbar")) {
              return { dispose() {}, setText() {}, setTooltip() {}, setCommand() {}, show() {}, hide() {}, text: "", tooltip: "", command: null };
            }
            const itemId = `ext-status-${ext.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const item = {
              id: itemId,
              extensionId: ext.id,
              text: "",
              tooltip: "",
              command: null,
              show: () => self._emitToRenderer("ext-statusbar-show", itemId),
              hide: () => self._emitToRenderer("ext-statusbar-hide", itemId),
              setText: (t) => { item.text = t; self._emitToRenderer("ext-statusbar-update", { id: itemId, text: t, tooltip: item.tooltip, command: item.command }); },
              setTooltip: (t) => { item.tooltip = t; self._emitToRenderer("ext-statusbar-update", { id: itemId, text: item.text, tooltip: t, command: item.command }); },
              setCommand: (cmd) => { item.command = cmd; },
              dispose: () => {
                const idx = self._statusBarItems.findIndex(i => i.id === itemId);
                if (idx >= 0) self._statusBarItems.splice(idx, 1);
                self._emitToRenderer("ext-statusbar-remove", itemId);
              },
            };
            self._statusBarItems.push(item);
            return item;
          },
          setDecorations: (uri, decorations) => self._emitToRenderer("ext-set-decorations", { uri, decorations }),
        },

        // Document API (via editor)
        document: {
          getText: () => self._invokeRenderer("ext-get-document-text"),
          getFileName: () => self._invokeRenderer("ext-get-document-filename"),
          getLanguageId: () => self._invokeRenderer("ext-get-document-language"),
          getLineCount: () => self._invokeRenderer("ext-get-document-line-count"),
        },

        // Inline Commands API
        inlineCommands: {
          register: (command) => {
            if (!command.id || !command.syntax || !command.execute) {
              throw new Error("Inline command requires id, syntax, and execute");
            }
            // Conflict detection
            if (self._registeredInlineCommands.has(command.id)) {
              console.warn(`[Extensions] Inline command conflict: ${command.id}`);
            }
            self._registeredInlineCommands.set(command.id, { ...command, extension: ext.id });
            self._emitToRenderer("ext-inline-command-registered", command);
            return { dispose: () => self._registeredInlineCommands.delete(command.id) };
          },
        },

        // Languages API
        languages: {
          registerCompletionItemProvider: (selector, provider) => {
            if (!self._hasPermission(ext, "languages")) return { dispose() {} };
            return self._emitToRenderer("ext-register-completion", { selector, provider: { provideCompletionItems: true } });
          },
          registerHoverProvider: (selector, provider) => {
            if (!self._hasPermission(ext, "languages")) return { dispose() {} };
            return self._emitToRenderer("ext-register-hover", { selector });
          },
        },

        // Terminal API
        terminal: {
          createTerminal: (name) => {
            if (!self._hasPermission(ext, "terminal.create")) return null;
            return self._invokeRenderer("ext-create-terminal", name || ext.displayName);
          },
          sendText: (terminalId, text) => {
            if (!self._hasPermission(ext, "terminal.sendText")) return;
            self._emitToRenderer("ext-terminal-send", { id: terminalId, text });
          },
          onDidOpenTerminal: (callback) => {
            self.on("terminal-opened", callback);
            return { dispose: () => self.removeListener("terminal-opened", callback) };
          },
          onDidCloseTerminal: (callback) => {
            self.on("terminal-closed", callback);
            return { dispose: () => self.removeListener("terminal-closed", callback) };
          },
        },

        // File System API
        fs: {
          readFile: (filePath) => {
            if (!self._hasPermission(ext, "workspace.read") && !self._hasPermission(ext, "fs.read")) {
              throw new Error("Sem permissão: workspace.read");
            }
            return fs.readFileSync(filePath, "utf-8");
          },
          writeFile: (filePath, content) => {
            if (!self._hasPermission(ext, "workspace.write") && !self._hasPermission(ext, "fs.write")) {
              throw new Error("Sem permissão: workspace.write");
            }
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, "utf-8");
          },
          stat: (filePath) => {
            if (!self._hasPermission(ext, "workspace.read")) throw new Error("Sem permissão: workspace.read");
            return fs.statSync(filePath);
          },
          readDirectory: (dirPath) => {
            if (!self._hasPermission(ext, "workspace.read")) throw new Error("Sem permissão: workspace.read");
            return fs.readdirSync(dirPath, { withFileTypes: true }).map(e => ({
              name: e.name, isDirectory: e.isDirectory(),
            }));
          },
          createDirectory: (dirPath) => {
            if (!self._hasPermission(ext, "workspace.write")) throw new Error("Sem permissão: workspace.write");
            fs.mkdirSync(dirPath, { recursive: true });
          },
          delete: (filePath) => {
            if (!self._hasPermission(ext, "workspace.write")) throw new Error("Sem permissão: workspace.write");
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          },
          rename: (oldPath, newPath) => {
            if (!self._hasPermission(ext, "workspace.write")) throw new Error("Sem permissão: workspace.write");
            fs.renameSync(oldPath, newPath);
          },
        },

        // Storage API
        storage: {
          get: (key) => {
            try {
              const storagePath = path.join(self._getExtensionStorage(ext.id), "data.json");
              if (!fs.existsSync(storagePath)) return null;
              const data = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
              return key ? data[key] : data;
            } catch (_) { return null; }
          },
          set: (key, value) => {
            try {
              const storagePath = path.join(self._getExtensionStorage(ext.id), "data.json");
              let data = {};
              if (fs.existsSync(storagePath)) {
                data = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
              }
              data[key] = value;
              fs.writeFileSync(storagePath, JSON.stringify(data, null, 2));
            } catch (_) {}
          },
        },

        // Utility
        util: {
          getExtensionVersion: () => ext.version,
          getLignisApiVersion: () => self.apiVersion,
        },
      },
    };

    return context;
  }

  _hasPermission(ext, permission) {
    return ext.permissions.includes(permission) || ext.permissions.includes("*");
  }

  _getWorkspaceFolders(ext) {
    return this._invokeRenderer("ext-get-workspace").then((result) => {
      if (result && result.path) {
        return [{ uri: result.path, name: path.basename(result.path) }];
      }
      return [];
    });
  }

  _getConfiguration(ext, section) {
    return this._invokeRenderer("ext-get-configuration", { extensionId: ext.id, section });
  }

  // ═══════════════════════════════════════
  // IPC COMMUNICATION
  // ═══════════════════════════════════════

  _emitToRenderer(channel, ...args) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  _invokeRenderer(channel, ...args) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.webContents.invoke(channel, ...args);
    }
    return Promise.resolve(null);
  }

  _sendStateChange(id, state, error) {
    this._emitToRenderer("ext-state-changed", { id, state, error });
  }

  // ═══════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════

  getAllExtensions() {
    return Array.from(this.extensions.values()).map(ext => ({
      id: ext.id,
      name: ext.name,
      displayName: ext.displayName,
      version: ext.version,
      publisher: ext.publisher,
      description: ext.description,
      homepage: ext.homepage,
      repository: ext.repository,
      license: ext.license,
      permissions: ext.permissions,
      activationEvents: ext.activationEvents,
      contributes: ext.contributes,
      engines: ext.engines,
      state: ext.state,
      error: ext.error,
      lastCrash: ext.lastCrash,
      activateTime: ext.activateTime,
      path: ext.path,
      validation: ext.validation,
    }));
  }

  getExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext) return null;
    return {
      id: ext.id, name: ext.name, displayName: ext.displayName,
      version: ext.version, publisher: ext.publisher, description: ext.description,
      homepage: ext.homepage, repository: ext.repository, license: ext.license,
      permissions: ext.permissions, activationEvents: ext.activationEvents,
      contributes: ext.contributes, engines: ext.engines,
      state: ext.state, error: ext.error, lastCrash: ext.lastCrash,
      activateTime: ext.activateTime, path: ext.path, validation: ext.validation,
    };
  }

  getRegisteredCommands() {
    return Array.from(this._registeredCommands.entries()).map(([id, cmd]) => ({
      id, extension: cmd.extension,
    }));
  }

  getRegisteredInlineCommands() {
    return Array.from(this._registeredInlineCommands.values());
  }

  getCrashLog() {
    return [...this.crashLog];
  }

  clearCrashLog() {
    this.crashLog = [];
    this._saveCrashLog();
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  async cleanup() {
    const activeIds = [];
    for (const [id, ext] of this.extensions) {
      if (ext.state === ExtState.ACTIVE) activeIds.push(id);
    }
    for (const id of activeIds) {
      await this.deactivate(id);
    }
  }
}

module.exports = { ExtensionManager, ExtState, AVAILABLE_PERMISSIONS };
