const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_RECEIVE_CHANNELS = [
  "dev-load-extension",
  "dev-save",
  "dev-run",
  "dev-stop",
  "dev-reload",
  "dev-validate",
  "dev-build",
  "dev-open-manifest",
  "dev-show-permissions",
  "dev-show-docs",
  "dev-show-about",
  "dev-export",
  "ext-state-changed",
];

const ALLOWED_INVOKE_CHANNELS = [
  "devmode-create-extension",
  "devmode-read-file",
  "devmode-write-file",
  "devmode-list-dir",
  "devmode-validate",
  "devmode-open",
  "devmode-close",
  "get-app-info",
  "get-platform",
  "file-read",
];

contextBridge.exposeInMainWorld("devAPI", {
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    return () => {};
  },

  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel not allowed: ${channel}`));
  },

  // Convenience methods
  createExtension: (options) => ipcRenderer.invoke("devmode-create-extension", options),
  readFile: (filePath) => ipcRenderer.invoke("devmode-read-file", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("devmode-write-file", filePath, content),
  listDir: (dirPath) => ipcRenderer.invoke("devmode-list-dir", dirPath),
  validate: (extPath) => ipcRenderer.invoke("devmode-validate", extPath),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getDocs: (filename) => ipcRenderer.invoke("extension-docs-read", filename),
});
