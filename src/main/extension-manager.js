// ========================================
// Lignis v3.4.0 - Extension Manager
// Extension lifecycle, permissions, activation
// ========================================

const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");

// Extension states
const ExtState = {
  INSTALLED: "installed",
  ACTIVATING: "activating",
  ACTIVE: "active",
  DEACTIVATING: "deactivating",
  FAILED: "failed",
  DISABLED: "disabled",
};

// Available permissions
const AVAILABLE_PERMISSIONS = {
  "workspace.read": { label: "Ler arquivos do workspace", sensitive: false },
  "workspace.write": { label: "Modificar arquivos do workspace", sensitive: true },
  "terminal.create": { label: "Criar terminais", sensitive: false },
  "terminal.sendText": { label: "Enviar comandos ao terminal", sensitive: true },
  "network": { label: "Acessar a internet", sensitive: true },
  "clipboard": { label: "Acessar a área de transferência", sensitive: false },
  "notifications": { label: "Exibir notificações", sensitive: false },
  "editor": { label: "Modificar o editor", sensitive: false },
  "commands": { label: "Registrar comandos", sensitive: false },
  "settings": { label: "Ler configurações", sensitive: false },
  "statusbar": { label: "Adicionar itens à barra de status", sensitive: false },
  "views": { label: "Criar painéis laterais", sensitive: false },
  "process.execute": { label: "Executar processos locais", sensitive: true },
};

class ExtensionManager extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.extensions = new Map(); // id -> ExtensionEntry
    this.extensionsDir = path.join(app.getPath("userData"), "extensions");
    this.apiVersion = "1.0.0";
    this.enabledState = {}; // persisted enabled/disabled state
    this._ensureDir();
    this._loadEnabledState();
  }

  _ensureDir() {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
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

  /**
   * Discover all extensions in the extensions directory.
   * Each extension is a folder containing `lignis-extension.json`.
   */
  discover() {
    const found = [];
    if (!fs.existsSync(this.extensionsDir)) return found;

    const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const manifestPath = path.join(this.extensionsDir, entry.name, "lignis-extension.json");
      try {
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          found.push(this._parseManifest(manifest, entry.name));
        }
      } catch (err) {
        console.warn(`[Extensions] Failed to parse ${entry.name}:`, err.message);
      }
    }
    return found;
  }

  _parseManifest(manifest, folderName) {
    const id = manifest.publisher
      ? `${manifest.publisher}.${manifest.name}`
      : manifest.name;

    const isEnabled = this.enabledState[id] !== false; // enabled by default

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
      path: path.join(this.extensionsDir, folderName),
      folderName,
      state: isEnabled ? ExtState.INSTALLED : ExtState.DISABLED,
      api: null, // will hold the extension API object
      activateTime: null,
    };
  }

  /**
   * Load all enabled extensions (called on startup).
   * Extensions are loaded but activated lazily based on activationEvents.
   */
  async loadAll() {
    const discovered = this.discover();
    this.extensions.clear();

    for (const ext of discovered) {
      this.extensions.set(ext.id, ext);
    }

    // Activate extensions with onStartupFinished event
    const toActivate = [];
    for (const [id, ext] of this.extensions) {
      if (ext.state === ExtState.DISABLED) continue;
      if (ext.activationEvents.includes("onStartupFinished")) {
        toActivate.push(id);
      }
    }

    for (const id of toActivate) {
      await this.activate(id).catch((err) => {
        console.warn(`[Extensions] Failed to activate ${id}:`, err.message);
      });
    }

    this.emit("extensions-loaded");
    return this.getAllExtensions();
  }

  /**
   * Activate a specific extension.
   */
  async activate(id) {
    const ext = this.extensions.get(id);
    if (!ext) throw new Error(`Extension not found: ${id}`);
    if (ext.state === ExtState.ACTIVE) return;
    if (ext.state === ExtState.DISABLED) throw new Error(`Extension is disabled: ${id}`);

    ext.state = ExtState.ACTIVATING;
    this._sendStateChange(id, ExtState.ACTIVATING);

    const startTime = Date.now();

    try {
      // Load extension module
      const mainPath = path.join(ext.path, ext.main);
      if (!fs.existsSync(mainPath)) {
        throw new Error(`Extension main file not found: ${mainPath}`);
      }

      // Clear require cache for this extension
      delete require.cache[require.resolve(mainPath)];

      const extModule = require(mainPath);

      // Create extension API context
      const context = this._createExtensionContext(ext);

      // Call activate
      if (typeof extModule.activate === "function") {
        await extModule.activate(context);
      }

      ext.api = extModule;
      ext.context = context;
      ext.state = ExtState.ACTIVE;
      ext.activateTime = Date.now() - startTime;

      this._sendStateChange(id, ExtState.ACTIVE);
      this.emit("extension-activated", id);
      console.log(`[Extensions] ${id} activated in ${ext.activateTime}ms`);
    } catch (err) {
      ext.state = ExtState.FAILED;
      ext.error = err.message;
      this._sendStateChange(id, ExtState.FAILED, err.message);
      this.emit("extension-failed", id, err);
      console.error(`[Extensions] Failed to activate ${id}:`, err);
    }
  }

  /**
   * Deactivate a specific extension.
   */
  async deactivate(id) {
    const ext = this.extensions.get(id);
    if (!ext || ext.state !== ExtState.ACTIVE) return;

    ext.state = ExtState.DEACTIVATING;
    this._sendStateChange(id, ExtState.DEACTIVATING);

    try {
      // Call deactivate
      if (ext.api && typeof ext.api.deactivate === "function") {
        await ext.api.deactivate();
      }

      // Dispose all subscriptions
      if (ext.context && ext.context.subscriptions) {
        for (const sub of ext.context.subscriptions) {
          try {
            if (typeof sub.dispose === "function") await sub.dispose();
          } catch (_) {}
        }
        ext.context.subscriptions = [];
      }

      ext.state = ExtState.INSTALLED;
      ext.api = null;
      ext.context = null;

      this._sendStateChange(id, ExtState.INSTALLED);
      this.emit("extension-deactivated", id);
    } catch (err) {
      console.warn(`[Extensions] Error deactivating ${id}:`, err);
      ext.state = ExtState.INSTALLED;
    }
  }

  /**
   * Enable an extension.
   */
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

  /**
   * Disable an extension.
   */
  async disable(id) {
    const ext = this.extensions.get(id);
    if (!ext) return;
    await this.deactivate(id);
    ext.state = ExtState.DISABLED;
    this.enabledState[id] = false;
    this._saveEnabledState();
    this.emit("extension-disabled", id);
  }

  /**
   * Install an extension from a directory path.
   */
  async installFromPath(sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error("Extension path does not exist");
    }

    const manifestPath = path.join(sourcePath, "lignis-extension.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("Invalid extension: lignis-extension.json not found");
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const id = manifest.publisher
      ? `${manifest.publisher}.${manifest.name}`
      : manifest.name;

    // Check if already installed
    if (this.extensions.has(id)) {
      await this.uninstall(id);
    }

    // Copy to extensions directory
    const destPath = path.join(this.extensionsDir, manifest.name);
    this._copyDirectory(sourcePath, destPath);

    // Reload
    const ext = this._parseManifest(manifest, manifest.name);
    ext.state = ExtState.INSTALLED;
    this.extensions.set(id, ext);

    await this.activate(id);
    return ext;
  }

  /**
   * Uninstall an extension.
   */
  async uninstall(id) {
    const ext = this.extensions.get(id);
    if (!ext) return;

    await this.deactivate(id);

    // Remove files
    try {
      this._removeDirectory(ext.path);
    } catch (err) {
      console.warn(`[Extensions] Failed to remove ${ext.path}:`, err);
    }

    this.extensions.delete(id);
    delete this.enabledState[id];
    this._saveEnabledState();
    this.emit("extension-uninstalled", id);
  }

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

  /**
   * Create the extension API context that gets passed to activate(context).
   */
  _createExtensionContext(ext) {
    const subscriptions = [];
    const self = this;

    const context = {
      subscriptions: [],
      extensionPath: ext.path,
      extensionUri: ext.path,
      extensionMode: "production",

      // Subscriptions management
      get subscriptions() { return subscriptions; },
      set subs(val) { /* ignore */ },

      // Lignis API
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
            if (self._hasPermission(ext, "commands")) {
              self._registerExtensionCommand(ext, commandId, callback);
              return { dispose: () => self._unregisterExtensionCommand(commandId) };
            }
            console.warn(`[Extensions] ${ext.id}: no permission for commands`);
            return { dispose: () => {} };
          },
          executeCommand: (commandId, ...args) => {
            return self._invokeRenderer("ext-execute-command", commandId, ...args);
          },
          getCommands: () => {
            return Array.from(self._registeredCommands.keys());
          },
        },

        // Workspace API
        workspace: {
          getWorkspaceFolders: () => {
            return self._getWorkspaceFolders(ext);
          },
          getConfiguration: (section) => {
            return self._getConfiguration(ext, section);
          },
          findFiles: (pattern) => {
            return self._invokeRenderer("ext-find-files", pattern);
          },
          openTextDocument: (options) => {
            return self._invokeRenderer("ext-open-document", options);
          },
          onDidChangeWorkspaceFolders: (callback) => {
            self.on("workspace-folders-changed", callback);
            return { dispose: () => self.removeListener("workspace-folders-changed", callback) };
          },
        },

        // Editor API
        editor: {
          getActiveTextEditor: () => {
            return self._invokeRenderer("ext-get-active-editor");
          },
          createStatusBarItem: (alignment, priority) => {
            if (!self._hasPermission(ext, "statusbar")) return { dispose: () => {}, setText: () => {}, setTooltip: () => {}, show: () => {}, hide: () => {} };
            const id = `ext-status-${ext.id}-${Date.now()}`;
            const item = {
              id,
              text: "",
              tooltip: "",
              command: null,
              show: () => self._emitToRenderer("ext-statusbar-show", id),
              hide: () => self._emitToRenderer("ext-statusbar-hide", id),
              setText: (t) => { item.text = t; self._emitToRenderer("ext-statusbar-update", { id, text: t, tooltip: item.tooltip, command: item.command }); },
              setTooltip: (t) => { item.tooltip = t; self._emitToRenderer("ext-statusbar-update", { id, text: item.text, tooltip: t, command: item.command }); },
              setCommand: (cmd) => { item.command = cmd; },
              dispose: () => {
                const idx = self._statusBarItems.indexOf(item);
                if (idx >= 0) self._statusBarItems.splice(idx, 1);
                self._emitToRenderer("ext-statusbar-remove", id);
              },
            };
            self._statusBarItems.push(item);
            return item;
          },
          setDecorations: (uri, decorations) => {
            return self._emitToRenderer("ext-set-decorations", { uri, decorations });
          },
        },

        // Inline Commands API ($commands)
        inlineCommands: {
          register: (command) => {
            self._registerInlineCommand(ext, command);
            return { dispose: () => self._unregisterInlineCommand(command.id) };
          },
        },

        // Languages API
        languages: {
          registerCompletionItemProvider: (selector, provider) => {
            return self._emitToRenderer("ext-register-completion", { selector, provider: { provideCompletionItems: true } });
          },
          registerHoverProvider: (selector, provider) => {
            return self._emitToRenderer("ext-register-hover", { selector });
          },
        },

        // Terminal API
        terminal: {
          createTerminal: (name) => {
            if (!self._hasPermission(ext, "terminal.create")) return null;
            return self._invokeRenderer("ext-create-terminal", name);
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

        // File System API (permission-gated)
        fs: {
          readFile: (filePath) => {
            if (!self._hasPermission(ext, "workspace.read")) throw new Error("No permission: workspace.read");
            return fs.readFileSync(filePath, "utf-8");
          },
          writeFile: (filePath, content) => {
            if (!self._hasPermission(ext, "workspace.write")) throw new Error("No permission: workspace.write");
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, "utf-8");
          },
          stat: (filePath) => {
            if (!self._hasPermission(ext, "workspace.read")) throw new Error("No permission: workspace.read");
            return fs.statSync(filePath);
          },
          readDirectory: (dirPath) => {
            if (!self._hasPermission(ext, "workspace.read")) throw new Error("No permission: workspace.read");
            return fs.readdirSync(dirPath, { withFileTypes: true }).map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
            }));
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

  _registerExtensionCommand(ext, commandId, callback) {
    if (!this._registeredCommands) this._registeredCommands = new Map();
    this._registeredCommands.set(commandId, { callback, extension: ext.id });
    this._emitToRenderer("ext-command-registered", commandId);
  }

  _unregisterExtensionCommand(commandId) {
    if (this._registeredCommands) this._registeredCommands.delete(commandId);
  }

  _registerInlineCommand(ext, command) {
    if (!this._registeredInlineCommands) this._registeredInlineCommands = new Map();
    this._registeredInlineCommands.set(command.id, { ...command, extension: ext.id });
    this._emitToRenderer("ext-inline-command-registered", command);
  }

  _unregisterInlineCommand(commandId) {
    if (this._registeredInlineCommands) this._registeredInlineCommands.delete(commandId);
  }

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

  _getWorkspaceFolders(ext) {
    // Return current workspace path
    return this._invokeRenderer("ext-get-workspace").then((result) => {
      if (result && result.path) {
        return [{ uri: result.path, name: path.basename(result.path) }];
      }
      return [];
    });
  }

  _getConfiguration(ext, section) {
    // Read from store or extension's own settings
    return this._invokeRenderer("ext-get-configuration", { extensionId: ext.id, section });
  }

  _sendStateChange(id, state, error) {
    this._emitToRenderer("ext-state-changed", { id, state, error });
  }

  getAllExtensions() {
    return Array.from(this.extensions.values()).map((ext) => ({
      id: ext.id,
      name: ext.name,
      displayName: ext.displayName,
      version: ext.version,
      publisher: ext.publisher,
      description: ext.description,
      permissions: ext.permissions,
      state: ext.state,
      error: ext.error,
      activateTime: ext.activateTime,
      path: ext.path,
    }));
  }

  getExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext) return null;
    return {
      id: ext.id,
      name: ext.name,
      displayName: ext.displayName,
      version: ext.version,
      publisher: ext.publisher,
      description: ext.description,
      permissions: ext.permissions,
      state: ext.state,
      error: ext.error,
      path: ext.path,
    };
  }

  getRegisteredCommands() {
    if (!this._registeredCommands) return [];
    return Array.from(this._registeredCommands.entries()).map(([id, cmd]) => ({
      id,
      extension: cmd.extension,
    }));
  }

  getRegisteredInlineCommands() {
    if (!this._registeredInlineCommands) return [];
    return Array.from(this._registeredInlineCommands.values());
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  async cleanup() {
    const activeIds = [];
    for (const [id, ext] of this.extensions) {
      if (ext.state === ExtState.ACTIVE) {
        activeIds.push(id);
      }
    }
    for (const id of activeIds) {
      await this.deactivate(id);
    }
  }
}

module.exports = { ExtensionManager, ExtState, AVAILABLE_PERMISSIONS };
