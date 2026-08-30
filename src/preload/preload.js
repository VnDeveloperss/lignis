const { contextBridge, ipcRenderer } = require("electron");

// Whitelist of allowed receive channels (main -> renderer)
const ALLOWED_RECEIVE_CHANNELS = [
  "menu-new-file",
  "menu-open-file",
  "menu-save-file",
  "menu-save-as",
  "menu-save-all",
  "menu-close-tab",
  "menu-close-others",
  "menu-close-right",
  "menu-close-all",
  "menu-reload",
  "menu-undo",
  "menu-redo",
  "menu-find",
  "menu-replace",
  "menu-goto-line",
  "menu-duplicate-line",
  "menu-delete-line",
  "menu-move-line-up",
  "menu-move-line-down",
  "menu-toggle-comment",
  "menu-uppercase",
  "menu-lowercase",
  "menu-title-case",
  "menu-sort-az",
  "menu-sort-za",
  "menu-remove-duplicates",
  "menu-remove-empty-lines",
  "menu-trim-trailing",
  "menu-tabs-to-spaces",
  "menu-spaces-to-tabs",
  "menu-json-format",
  "menu-json-minify",
  "menu-json-validate",
  "menu-statistics",
  "menu-read-only",
  "menu-escape",
  "menu-unescape",
  "menu-insert-timestamp",
  "menu-insert-uuid",
  "menu-copy-as-json",
  "menu-copy-file-path",
  "menu-copy-file-name",
  "menu-copy-directory",
  "menu-open-folder",
  "menu-shortcuts",
  "menu-word-count",
  "toggle-word-wrap",
  "toggle-line-numbers",
  "toggle-status-bar",
  "toggle-toolbar",
  "toggle-focus-mode",
  "toggle-sidebar",
  "toggle-terminal",
  "menu-open-folder-dialog",
  "terminal-data",
  "toggle-markdown-preview",
  "toggle-html-preview",
  "zoom-in",
  "zoom-out",
  "zoom-reset",
  "open-command-palette",
  "open-settings",
  "open-about",
  "menu-open-commands-help",
  "open-recent-file",
  "recent-files-updated",
  "check-unsaved-before-close",
  "window-close-request",
  "window-fullscreen-changed",
  "open-update-check",
  "update-available",
  "update-progress",
  "update-downloaded",
];

// Whitelist of allowed invoke channels (renderer -> main)
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
  "window-minimize",
  "window-toggle-maximize",
  "window-close",
  "window-is-maximized",
  "update-download",
  "update-install",
  "update-check-manual",
  "folder-open-dialog",
  "read-directory",
  "terminal-create",
  "terminal-write",
  "terminal-resize",
  "terminal-kill",
];

contextBridge.exposeInMainWorld("lignisAPI", {
  // Invoke channels (request/response)
  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel not allowed: ${channel}`));
  },

  // File operations
  openFile: () => ipcRenderer.invoke("file-open-dialog"),
  saveFileDialog: (defaultName) =>
    ipcRenderer.invoke("file-save-dialog", defaultName),
  readFile: (filePath) => ipcRenderer.invoke("file-read", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("file-write", filePath, content),
  writeFileAtomic: (filePath, content) =>
    ipcRenderer.invoke("file-write-atomic", filePath, content),

  // App info
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke("get-recent-files"),
  addRecentFile: (filePath) => ipcRenderer.invoke("add-recent-file", filePath),
  clearRecentFiles: () => ipcRenderer.invoke("clear-recent-files"),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSetting: (key, value) => ipcRenderer.invoke("set-settings", key, value),
  setSettingsBulk: (obj) => ipcRenderer.invoke("set-settings-bulk", obj),

  // File utilities
  checkFileExists: (filePath) =>
    ipcRenderer.invoke("check-file-exists", filePath),
  getFileStats: (filePath) => ipcRenderer.invoke("get-file-stats", filePath),
  getFileMtime: (filePath) => ipcRenderer.invoke("get-file-mtime", filePath),

  // Shell
  openExternal: (url) => ipcRenderer.invoke("shell-open-external", url),
  openPath: (filePath) => ipcRenderer.invoke("shell-open-path", filePath),

  // Clipboard
  clipboardWrite: (text) => ipcRenderer.invoke("clipboard-write", text),
  clipboardRead: () => ipcRenderer.invoke("clipboard-read"),

  // Session
  saveSession: (data) => ipcRenderer.invoke("save-session", data),
  loadSession: () => ipcRenderer.invoke("load-session"),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // Folder operations
  openFolderDialog: () => ipcRenderer.invoke("folder-open-dialog"),
  readDirectory: (dirPath) => ipcRenderer.invoke("read-directory", dirPath),

  // Terminal
  terminalCreate: (options) => ipcRenderer.invoke("terminal-create", options),
  terminalWrite: (id, data) => ipcRenderer.invoke("terminal-write", id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke("terminal-resize", id, cols, rows),
  terminalKill: (id) => ipcRenderer.invoke("terminal-kill", id),

  // Listen for events from main process
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    console.warn(`[Lignis] Canal não permitido: ${channel}`);
    return () => {};
  },

  // Send fire-and-forget messages to main
  send: (channel, ...args) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
