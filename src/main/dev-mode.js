// ========================================
// Lignis v3.6.0 - DevMode Extension Window
// Separate BrowserWindow for extension development
// ========================================

const { BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

let devWindow = null;
let devExtensionPath = null;
let devWatcher = null;

function getDevWindow() {
  return devWindow;
}

function openDevMode(extensionPath) {
  // If window already open, focus it
  if (devWindow && !devWindow.isDestroyed()) {
    devWindow.focus();
    if (extensionPath) loadExtensionInDev(extensionPath);
    return;
  }

  devExtensionPath = extensionPath || null;

  devWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "DevMode Extension — Lignis",
    backgroundColor: "#171821",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "..", "preload", "dev-preload.js"),
      spellcheck: false,
    },
    show: false,
    frame: true,
  });

  devWindow.loadURL("lignis://app/dev-mode.html");

  devWindow.once("ready-to-show", () => {
    devWindow.show();
    // Send initial extension path if provided
    if (devExtensionPath) {
      devWindow.webContents.once("did-finish-load", () => {
        devWindow.webContents.send("dev-load-extension", devExtensionPath);
      });
    }
  });

  devWindow.on("closed", () => {
    devWindow = null;
    devExtensionPath = null;
    stopWatcher();
  });

  // Build DevMode-specific menu
  const menu = buildDevMenu();
  Menu.setApplicationMenu(menu);
}

function buildDevMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        { label: "Salvar", accelerator: "CmdOrCtrl+S", click: () => devWindow?.webContents.send("dev-save") },
        { type: "separator" },
        { label: "Fechar", role: "close" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Executar",
      submenu: [
        { label: "Executar extensão", accelerator: "F5", click: () => devWindow?.webContents.send("dev-run") },
        { label: "Parar", accelerator: "Shift+F5", click: () => devWindow?.webContents.send("dev-stop") },
        { label: "Recarregar", accelerator: "CmdOrCtrl+Shift+R", click: () => devWindow?.webContents.send("dev-reload") },
        { type: "separator" },
        { label: "Validar", click: () => devWindow?.webContents.send("dev-validate") },
        { label: "Build", accelerator: "CmdOrCtrl+Shift+B", click: () => devWindow?.webContents.send("dev-build") },
      ],
    },
    {
      label: "Extensão",
      submenu: [
        { label: "Abrir manifesto", click: () => devWindow?.webContents.send("dev-open-manifest") },
        { label: "Permissões", click: () => devWindow?.webContents.send("dev-show-permissions") },
        { label: "Exportar", click: () => devExportExtension() },
        { label: "Instalar no Lignis", click: () => devWindow?.webContents.send("dev-install-main") },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        { label: "Documentação da API", click: () => devWindow?.webContents.send("dev-show-docs") },
        { type: "separator" },
        { label: "Sobre DevMode", click: () => devWindow?.webContents.send("dev-show-about") },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

async function devExportExtension() {
  if (!devExtensionPath || !devWindow) return;

  const result = await dialog.showSaveDialog(devWindow, {
    title: "Exportar extensão",
    defaultPath: "extension.lignis-extension",
    filters: [{ name: "Extensão Lignis", extensions: ["lignis-extension"] }],
  });

  if (result.canceled || !result.filePath) return;

  devWindow.webContents.send("dev-export", result.filePath);
}

function loadExtensionInDev(extensionPath) {
  devExtensionPath = extensionPath;
  if (devWindow && !devWindow.isDestroyed()) {
    devWindow.webContents.send("dev-load-extension", extensionPath);
  }
}

function stopWatcher() {
  if (devWatcher) {
    try { devWatcher.close(); } catch (_) {}
    devWatcher = null;
  }
}

function closeDevMode() {
  if (devWindow && !devWindow.isDestroyed()) {
    devWindow.close();
  }
  stopWatcher();
}

// ═══════════════════════════════════════
// DevMode IPC Handlers
// ═══════════════════════════════════════

function setupDevModeIpc() {
  ipcMain.handle("devmode-open", (event, extensionPath) => {
    openDevMode(extensionPath);
    return { success: true };
  });

  ipcMain.handle("devmode-close", () => {
    closeDevMode();
    return { success: true };
  });

  ipcMain.handle("devmode-create-extension", async (event, options) => {
    try {
      const { name, id, publisher, description, version, template, directory } = options;
      const extDir = path.join(directory || app.getPath("userData"), "extensions", name);

      if (fs.existsSync(extDir)) {
        return { success: false, error: "Extensão já existe neste diretório." };
      }

      fs.mkdirSync(extDir, { recursive: true });

      // Create manifest
      const manifest = {
        name,
        id: id || `${publisher || "user"}.${name}`,
        displayName: options.displayName || name,
        publisher: publisher || "user",
        description: description || "",
        version: version || "1.0.0",
        engines: { lignis: "^3.6.0" },
        main: "./extension.js",
        activationEvents: ["onStartupFinished"],
        permissions: options.permissions || [],
      };
      fs.writeFileSync(path.join(extDir, "lignis-extension.json"), JSON.stringify(manifest, null, 2));

      // Create extension.js from template
      const templateCode = getTemplateCode(template || "hello-world", name);
      fs.writeFileSync(path.join(extDir, "extension.js"), templateCode);

      // Create README
      fs.writeFileSync(path.join(extDir, "README.md"), `# ${manifest.displayName}\n\n${manifest.description}\n`);

      return { success: true, path: extDir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("devmode-read-file", (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: "File not found" };
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, data: { content, path: filePath } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("devmode-write-file", (event, filePath, content) => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("devmode-list-dir", (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return { success: false, error: "Directory not found" };
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries
        .filter(e => !e.name.startsWith(".") && e.name !== "node_modules")
        .map(e => ({ name: e.name, isDirectory: e.isDirectory(), path: path.join(dirPath, e.name) }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return { success: true, data: items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("devmode-validate", (event, extensionPath) => {
    try {
      const manifestPath = path.join(extensionPath, "lignis-extension.json");
      if (!fs.existsSync(manifestPath)) return { success: false, error: "lignis-extension.json não encontrado" };

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const errors = [];
      const warnings = [];

      if (!manifest.name) errors.push("Campo 'name' é obrigatório");
      if (!manifest.version) errors.push("Campo 'version' é obrigatório");
      if (!manifest.main) warnings.push("Campo 'main' não definido");

      const mainPath = path.join(extensionPath, manifest.main || "./extension.js");
      if (!fs.existsSync(mainPath)) errors.push(`Arquivo principal não encontrado: ${manifest.main}`);

      return { success: errors.length === 0, data: { errors, warnings, manifest } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// ═══════════════════════════════════════
// Templates
// ═══════════════════════════════════════

function getTemplateCode(template, name) {
  const templates = {
    "hello-world": `// ${name} — Hello World
function activate(context) {
  context.lignis.window.showInformationMessage("Olá do ${name}!");
  console.log("[${name}] Extensão ativada.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "command": `// ${name} — Command Template
function activate(context) {
  const { lignis } = context;

  const cmd = lignis.commands.registerCommand("${name}.hello", () => {
    lignis.window.showInformationMessage("Comando executado: ${name}");
  });
  context.subscriptions.push(cmd);
  console.log("[${name}] Comando registrado.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "status-bar": `// ${name} — Status Bar Template
function activate(context) {
  const { lignis } = context;

  const item = lignis.editor.createStatusBarItem("left", 100);
  item.setText("$(rocket) ${name}");
  item.setTooltip("${name} está ativo");
  item.show();
  context.subscriptions.push(item);
  console.log("[${name}] Status bar item criado.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "inline-command": `// ${name} — Inline Command Template
function activate(context) {
  const { lignis } = context;

  const cmd = lignis.inlineCommands.register({
    id: "${name}.greeting",
    namespace: "${name}",
    syntax: "$${name}.greeting()",
    description: "Retorna uma saudação",
    execute: () => "Olá de ${name}! 👋",
  });
  context.subscriptions.push(cmd);
  console.log("[${name}] Comando inline registrado.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "terminal": `// ${name} — Terminal Template
function activate(context) {
  const { lignis } = context;

  const cmd = lignis.commands.registerCommand("${name}.run", async () => {
    const terminal = await lignis.terminal.createTerminal("${name}");
    if (terminal) {
      lignis.terminal.sendText(terminal.id, "echo Hello from ${name}!");
    }
  });
  context.subscriptions.push(cmd);
  console.log("[${name}] Comando de terminal registrado.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "workspace": `// ${name} — Workspace Template
function activate(context) {
  const { lignis } = context;

  const cmd = lignis.commands.registerCommand("${name}.info", async () => {
    const folders = await lignis.workspace.getWorkspaceFolders();
    if (folders && folders.length > 0) {
      lignis.window.showInformationMessage("Workspace: " + folders[0].name);
    } else {
      lignis.window.showWarningMessage("Nenhum workspace aberto.");
    }
  });
  context.subscriptions.push(cmd);

  const inlineCmd = lignis.inlineCommands.register({
    id: "${name}.workspace",
    namespace: "${name}",
    syntax: "$${name}.workspace()",
    description: "Nome do workspace",
    execute: async () => {
      const folders = await lignis.workspace.getWorkspaceFolders();
      return folders && folders.length > 0 ? folders[0].name : "(nenhum)";
    },
  });
  context.subscriptions.push(inlineCmd);
  console.log("[${name}] Extensão de workspace ativada.");
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
    "full": `// ${name} — Full Extension Template
// Demonstrates all major APIs
function activate(context) {
  const { lignis } = context;

  // Status bar
  const statusItem = lignis.editor.createStatusBarItem("left", 100);
  statusItem.setText("$(puzzle-piece) ${name}");
  statusItem.setTooltip("${name} v1.0.0");
  statusItem.show();
  context.subscriptions.push(statusItem);

  // Command
  const cmd = lignis.commands.registerCommand("${name}.hello", () => {
    lignis.window.showInformationMessage("Hello from ${name}!");
  });
  context.subscriptions.push(cmd);

  // Inline command
  const inlineCmd = lignis.inlineCommands.register({
    id: "${name}.greeting",
    namespace: "${name}",
    syntax: "$${name}.greeting()",
    description: "Greeting from ${name}",
    execute: () => "Hello from ${name}! 🎉",
  });
  context.subscriptions.push(inlineCmd);

  // Workspace command
  const wsCmd = lignis.commands.registerCommand("${name}.workspace", async () => {
    const folders = await lignis.workspace.getWorkspaceFolders();
    if (folders && folders.length > 0) {
      lignis.window.showInformationMessage("Workspace: " + folders[0].name);
    }
  });
  context.subscriptions.push(wsCmd);

  // Storage
  const count = lignis.storage.get("usageCount") || 0;
  lignis.storage.set("usageCount", count + 1);

  console.log(\`[\${name}] Extensão ativada. Uso: \${count + 1} vezes.\`);
}

function deactivate() {
  console.log("[${name}] Extensão desativada.");
}

module.exports = { activate, deactivate };
`,
  };

  return templates[template] || templates["hello-world"];
}

module.exports = { openDevMode, closeDevMode, getDevWindow, setupDevModeIpc, loadExtensionInDev };
