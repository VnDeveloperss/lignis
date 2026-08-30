// ========================================
// Lignis v3.1.1 - Main Application Orchestrator
// ========================================

const App = (function () {
  let markdownPreviewVisible = false;
  let htmlPreviewVisible = false;
  let htmlPreviewTimer = null;
  let focusMode = false;
  let sidebarVisible = false;
  let quickOpenVisible = false;
  let markedLib = null;
  let DOMPurifyLib = null;
  let workspaceFiles = [];
  let startupState = "BOOTING"; // BOOTING | LOADING_EDITOR | RESTORING | READY | FAILED
  let htmlPreviewEnabled = false; // setting: "allow scripts in HTML preview"

  // ─── Helpers ─────────────────────────────

  function escapeHtmlSafe(str) {
    try {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    } catch (_) {
      return String(str || "");
    }
  }

  async function init() {
    try {
      startupState = "BOOTING";
      console.log("[STARTUP] BOOTSTRAP iniciado.");
      try { console.log("[STARTUP] Electron:", process.versions?.electron || "?", "Chrome:", process.versions?.chrome || "?"); } catch (_) { console.log("[STARTUP] Environment info unavailable."); }

      // Step 1: Locale
      if (typeof LOCALE_PT_BR !== "undefined") {
        Locale.register("pt-BR", LOCALE_PT_BR);
        Locale.set("pt-BR");
      }
      console.log("[STARTUP] I18N pronto.");

      // Step 2: Icons (non-critical — optional)
      try { IconService.init(); } catch (e) { console.warn("[Lignis] Falha ao inicializar ícones:", e); }

      // Step 3: Commands engine (non-critical — optional)
      if (typeof LignisCommands !== "undefined") {
        try {
          LignisCommands.init();
          LignisCommands.setEnabled(SettingsManager.get("commandsEnabled") !== false);
          LignisCommands.setAutocompleteEnabled(SettingsManager.get("commandsAutocomplete") !== false);
          LignisCommands.setHighlightEnabled(SettingsManager.get("commandsHighlight") !== false);
        } catch (e) { console.warn("[Lignis] Falha ao inicializar comandos:", e); }
      }
      console.log("[Lignis] COMANDOS pronto.");

      // Step 4: Platform detection (non-critical)
      try {
        const platformResult = await window.lignisAPI.getPlatform();
        if (platformResult.success && platformResult.data === "darwin") {
          document.body.classList.add("darwin");
        }
      } catch (e) { console.warn("[Lignis] Falha ao detectar plataforma:", e); }

      // Step 5: Settings (critical)
      console.log("[STARTUP] Settings iniciando...");
      await SettingsManager.init();
      console.log("[STARTUP] Settings pronto.");

      // Step 6+7: Monaco Editor — single init in background (non-blocking),
      // then restore session as soon as the editor is really ready.
      startupState = "LOADING_EDITOR";
      console.log("[STARTUP] Monaco iniciando (background)...");
      const editorReady = EditorManager.init();
      editorReady.then(() => {
        console.log("[STARTUP] Monaco pronto.");
        startupState = "READY_EDITOR";
      }).catch(err => {
        console.error("[STARTUP] Monaco falhou:", err);
        startupState = "FAILED_EDITOR";
      });

      editorReady.then(async () => {
        startupState = "RESTORING";
        try {
          await restoreSession();
          console.log("[STARTUP] Sessão restaurada.");
        } catch (e) {
          console.warn("[Lignis] Falha ao restaurar sessão:", e);
        }
        if (TabManager.getAllTabs().length === 0) {
          TabManager.createTab();
        }
      }).catch(() => {
        // Monaco failed, create a blank tab anyway
        if (TabManager.getAllTabs().length === 0) {
          TabManager.createTab();
        }
      });

      // Step 8: Init UI modules (non-critical)
      try { SearchManager.init(); } catch (e) { console.warn("[Lignis] Falha ao init SearchManager:", e); }
      try { CommandPalette.init(); } catch (e) { console.warn("[Lignis] Falha ao init CommandPalette:", e); }
      try { ContextMenuManager.init(); } catch (e) { console.warn("[Lignis] Falha ao init ContextMenuManager:", e); }
      try { StatusBar.init(); } catch (e) { console.warn("[Lignis] Falha ao init StatusBar:", e); }
      try { StatusBar.updateAll(TabManager.getActiveTab()); } catch (e) {}

      // Step 10: Setup features (non-critical)
      try { setupSidebar(); } catch (_) {}
      try { setupQuickOpen(); } catch (_) {}
      try { setupToolbarButtons(); } catch (_) {}
      try { setupKeyboardShortcuts(); } catch (_) {}
      try { setupIpcListeners(); } catch (_) {}
      try { setupTabChangeListener(); } catch (_) {}
      try { setupDragAndDrop(); } catch (_) {}
      try { setupEditorListeners(); } catch (_) {}
      try { setupAbout(); } catch (_) {}

      // Step 11: Optional libraries (non-critical — loaded async)
      try { setupMarkdownLibraries(); } catch (_) {}
      try { setupHtmlPreview(); } catch (_) {}

      // Step 12: Autosave
      try { SettingsManager.setupAutosave(); } catch (_) {}

      // ── READY ──
      startupState = "READY";
      console.log("[STARTUP] READY — startup completo.");
      // Hide overlay if somehow still visible
      try { document.getElementById("loading-overlay").classList.add("hidden"); } catch (_) {}

      // Apply HTML preview setting
      htmlPreviewEnabled = SettingsManager.get("htmlPreviewScripts") || false;

    } catch (err) {
      startupState = "FAILED";
      console.error("[STARTUP] FALHA no startup:", err);
      // Show error in console — app continues without crashed features
    }
  }

  // ─── Editor Listeners ────────────────────
  function setupEditorListeners() {
    EditorManager.onDidChangeModelContent(() => {
      const tab = TabManager.getActiveTab();
      if (!tab) return;

      tab.content = EditorManager.getValue();
      tab.isDirty = tab.content !== tab.savedContent;
      TabManager.markDirty(tab.id, tab.isDirty);

      // Live HTML preview debounce
      if (htmlPreviewVisible && isHtmlFile(tab.name)) {
        updateHtmlPreviewDebounced();
      }
    });

    EditorManager.onDidChangeCursorSelection(() => {
      StatusBar.updateCursorInfo();
    });

    // ─── Auto-exec Lignis Commands in Plain Text ───
    if (typeof monaco !== "undefined") {
      EditorManager.getEditor().onKeyDown((e) => {
        if (startupState !== "READY") return;
        if (!LignisCommands || !LignisCommands.isEnabled()) return;

        const tab = TabManager.getActiveTab();
        if (!tab || tab.readOnly) return;

        const model = EditorManager.getModel();
        if (!model) return;

        // Only auto-exec in Plain Text
        const langId = model.getLanguageId();
        if (langId !== "plaintext") return;

        const isSpace = e.keyCode === 32;
        const isEnter = e.keyCode === 13;
        if (!isSpace && !isEnter) return;

        const pos = model.getPosition();
        const line = model.getLineContent(pos.lineNumber);
        const cmdRegex = /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\([^)]*\)/g;
        let match;
        while ((match = cmdRegex.exec(line)) !== null) {
          const cmdEnd = match.index + match[0].length;
          // Only auto-exec if cursor is right after the closing paren
          if (pos.column - 1 === cmdEnd) {
            e.preventDefault();
            const execResult = LignisCommands.execute(match[0]);
            Promise.resolve(execResult).then(res => {
              if (res.success) {
                const range = new monaco.Range(
                  pos.lineNumber, match.index + 1,
                  pos.lineNumber, match.index + 1 + match[0].length
                );
                const insertText = isSpace ? String(res.value) + " " : String(res.value) + "\n";
                model.pushEditOperations([], [{ range, text: insertText }], () => null);
                EditorManager.updateCommandsDecorations();
              } else {
                // Not a valid command, let the keystroke through naturally
                if (isSpace) {
                  model.pushEditOperations([], [{
                    range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                    text: " "
                  }], () => null);
                } else {
                  model.pushEditOperations([], [{
                    range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                    text: "\n"
                  }], () => null);
                }
                EditorManager.getEditor().setPosition({ lineNumber: pos.lineNumber + 1, column: 1 });
              }
            });
            return;
          }
        }
      });
    }

    // Autosave on blur
    window.addEventListener("blur", () => {
      if (SettingsManager.get("autosaveMode") === "focus") {
        const tab = TabManager.getActiveTab();
        if (tab && tab.isDirty && tab.path) {
          saveFile();
        }
      }
    });
  }

  // ─── File Operations ─────────────────────
  function newFile() {
    TabManager.createTab();
  }

  async function openFile() {
    const result = await window.lignisAPI.openFile();
    if (!result.success || result.canceled) return;
    for (const filePath of result.data) {
      await openFileByPath(filePath);
    }
  }

  async function openFileByPath(filePath) {
    // Check if already open - activate existing tab
    const existingTab = TabManager.getTabByPath(filePath);
    if (existingTab) {
      TabManager.switchToTab(existingTab.id);
      return;
    }

    const readResult = await window.lignisAPI.readFile(filePath);
    if (!readResult.success) {
      showToast(readResult.error, "error");
      return;
    }

    // Warn about large files
    if (readResult.data.large) {
      showToast(`Arquivo grande (${(readResult.data.size / 1024 / 1024).toFixed(1)}MB). Alguns recursos podem ser desativados.`, "warning", 5000);
    }

    const fileName = filePath.split(/[\\\\/]/).pop();
    const tab = TabManager.createTab({
      path: filePath,
      name: fileName,
      content: readResult.data.content,
      encoding: readResult.data.encoding,
      lineEnding: readResult.data.lineEnding,
    });

    tab.lastMtime = readResult.data.modifiedTime;
    tab.content = readResult.data.content;
    tab.savedContent = readResult.data.content;

    EditorManager.updateLanguage(tab.id, fileName);
    TabManager.markSaved(tab.id);
    StatusBar.updateAll(tab);

    await window.lignisAPI.addRecentFile(filePath);
    updateRecentMenu();
    saveSessionDebounced();
  }

  async function saveFile(tabId) {
    tabId = tabId || TabManager.getActiveTabId();
    const tab = TabManager.getTab(tabId);
    if (!tab) return false;

    if (!tab.path) return saveFileAs(tabId);

    let content;
    if (tabId === TabManager.getActiveTabId()) {
      content = EditorManager.getValue();
    } else {
      const model = EditorManager.getModelForTab(tabId);
      content = model ? model.getValue() : tab.content;
    }

    // Apply settings
    if (SettingsManager.get("trimTrailing")) {
      content = content.split("\n").map(l => l.replace(/\s+$/, "")).join("\n");
    }
    if (SettingsManager.get("finalNewline") && !content.endsWith("\n")) {
      content += "\n";
    }

    const result = await window.lignisAPI.writeFileAtomic(tab.path, content);
    if (result.success) {
      tab.content = content;
      tab.savedContent = content;
      tab.lastMtime = result.data.modifiedTime;
      TabManager.markSaved(tabId);
      await window.lignisAPI.addRecentFile(tab.path);
      updateRecentMenu();
      saveSessionDebounced();
      return true;
    } else {
      showToast(result.error, "error");
      return false;
    }
  }

  async function saveFileAs(tabId) {
    tabId = tabId || TabManager.getActiveTabId();
    const tab = TabManager.getTab(tabId);
    if (!tab) return false;

    const result = await window.lignisAPI.saveFileDialog(tab.name);
    if (!result.success || result.canceled) return false;

    const filePath = result.data;
    const fileName = filePath.split(/[\\\\/]/).pop();

    let content;
    if (tabId === TabManager.getActiveTabId()) {
      content = EditorManager.getValue();
    } else {
      const model = EditorManager.getModelForTab(tabId);
      content = model ? model.getValue() : tab.content;
    }

    const writeResult = await window.lignisAPI.writeFileAtomic(filePath, content);
    if (writeResult.success) {
      tab.path = filePath;
      tab.name = fileName;
      tab.content = content;
      tab.savedContent = content;
      tab.lastMtime = writeResult.data.modifiedTime;
      TabManager.updateTabName(tabId, fileName, filePath);
      TabManager.markSaved(tabId);
      EditorManager.updateLanguage(tabId, fileName);
      StatusBar.updateAll(tab);
      await window.lignisAPI.addRecentFile(filePath);
      updateRecentMenu();
      saveSessionDebounced();
      showToast(`Arquivo salvo: ${fileName}`, "success");
      return true;
    } else {
      showToast(writeResult.error, "error");
      return false;
    }
  }

  async function saveAllFiles() {
    const tabs = TabManager.getAllTabs();
    let savedCount = 0;
    for (const tab of tabs) {
      if (tab.isDirty && tab.path) {
        const saved = await saveFile(tab.id);
        if (saved) savedCount++;
      }
    }
    if (savedCount > 0) showToast(`${savedCount} arquivo(s) salvo(s).`, "success");
    return savedCount;
  }

  function saveCurrentFile() { return saveFile(); }

  // ─── Reload File ─────────────────────────
  async function reloadFile(tabId) {
    tabId = tabId || TabManager.getActiveTabId();
    const tab = TabManager.getTab(tabId);
    if (!tab || !tab.path) {
      showToast("Arquivo não possui caminho para recarregar.", "warning");
      return;
    }

    if (tab.isDirty) {
      const confirmed = await TabManager.showUnsavedDialog(tab);
      if (confirmed !== "discard" && confirmed !== "save") return;
      if (confirmed === "save") {
        const saved = await saveFile(tabId);
        if (!saved) return;
      }
    }

    const readResult = await window.lignisAPI.readFile(tab.path);
    if (!readResult.success) {
      showToast(readResult.error, "error");
      return;
    }

    const model = EditorManager.getModelForTab(tabId);
    if (model) {
      model.setValue(readResult.data.content);
    }
    tab.content = readResult.data.content;
    tab.savedContent = readResult.data.content;
    tab.encoding = readResult.data.encoding;
    tab.lineEnding = readResult.data.lineEnding;
    tab.lastMtime = readResult.data.modifiedTime;
    TabManager.markSaved(tabId);
    StatusBar.updateAll(tab);
    showToast("Arquivo recarregado.", "success");
  }

  // ─── Theme ───────────────────────────────
  function toggleTheme() {
    const current = SettingsManager.get("theme");
    const newTheme = current === "dark" ? "light" : "dark";
    SettingsManager.set("theme", newTheme);
    SettingsManager.applySettings();
    document.getElementById("setting-theme").value = newTheme;
    showToast(`Tema: ${newTheme === "dark" ? "Escuro" : "Claro"}`, "info");
  }

  function setTheme(theme) {
    SettingsManager.set("theme", theme);
    SettingsManager.applySettings();
    document.getElementById("setting-theme").value = theme;
    showToast(`Tema alterado para ${theme === "dark" ? "Escuro" : "Claro"}.`, "info");
  }

  // ─── Word Wrap ───────────────────────────
  function toggleWordWrap() {
    const current = SettingsManager.get("wordWrap");
    const newValue = !current;
    SettingsManager.set("wordWrap", newValue);
    EditorManager.setWordWrap(newValue);
    document.getElementById("setting-word-wrap").checked = newValue;
    document.getElementById("tb-wrap").classList.toggle("active", newValue);
  }

  // ─── Focus Mode ──────────────────────────
  function toggleFocusMode() {
    focusMode = !focusMode;
    document.body.setAttribute("data-focused", focusMode);
    showToast(focusMode ? "Modo foco ativado." : "Modo foco desativado.", "info");
  }

  // ─── Sidebar ─────────────────────────────
  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    document.getElementById("sidebar").classList.toggle("visible", sidebarVisible);
    document.getElementById("tb-sidebar").classList.toggle("active", sidebarVisible);
    setTimeout(() => EditorManager.layout(), 50);
  }

  function setupSidebar() {
    document.getElementById("sidebar-close-btn").addEventListener("click", toggleSidebar);
    document.getElementById("sidebar-open-folder-btn").addEventListener("click", openFolder);
  }

  // ─── Explorer ───────────────────────────

  async function openFolder() {
    const result = await window.lignisAPI.openFolderDialog();
    if (!result.success || result.canceled) return;
    workspacePath = result.data;
    await loadWorkspace(workspacePath);
    // Add to recent folders
    try {
      const settings = await window.lignisAPI.getSettings();
      if (settings.success && settings.data) {
        const recentFolders = settings.data.recentFolders || [];
        const filtered = recentFolders.filter(f => f !== workspacePath);
        filtered.unshift(workspacePath);
        await window.lignisAPI.setSetting("recentFolders", filtered.slice(0, 20));
      }
    } catch (_) {}
  }

  async function loadWorkspace(dirPath) {
    const result = await window.lignisAPI.readDirectory(dirPath);
    if (!result.success) {
      showToast(result.error, "error");
      return;
    }
    document.getElementById("sidebar-empty").style.display = "none";
    const tree = document.getElementById("file-tree");
    tree.style.display = "";
    tree.innerHTML = "";
    const rootLabel = document.createElement("div");
    rootLabel.className = "tree-item tree-root";
    rootLabel.innerHTML = `<i class="fa-solid fa-folder-open tree-icon"></i> <span>${escapeHtmlSafe(dirPath.split(/[\\/]/).pop())}</span>`;
    tree.appendChild(rootLabel);
    renderTreeItems(tree, result.data, dirPath);
    // Show sidebar if hidden
    if (!sidebarVisible) toggleSidebar();
  }

  function renderTreeItems(parentEl, items, parentPath) {
    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "tree-item" + (item.isDirectory ? " tree-dir" : " tree-file");
      el.dataset.path = item.path;
      el.dataset.isDir = item.isDirectory ? "1" : "0";
      const icon = item.isDirectory ? "fa-solid fa-folder" : getFileIcon(item.name);
      el.innerHTML = `<i class="${icon} tree-icon"></i> <span>${escapeHtmlSafe(item.name)}</span>`;

      if (item.isDirectory) {
        let loaded = false;
        let childrenEl = null;
        const caret = document.createElement("span");
        caret.className = "tree-caret";
        caret.innerHTML = "<i class=\"fa-solid fa-caret-right\"></i>";
        el.prepend(caret);
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (loaded) {
            if (childrenEl) childrenEl.style.display = childrenEl.style.display === "none" ? "" : "none";
            caret.innerHTML = childrenEl && childrenEl.style.display !== "none" ? "<i class=\"fa-solid fa-caret-down\"></i>" : "<i class=\"fa-solid fa-caret-right\"></i>";
            return;
          }
          const dirResult = await window.lignisAPI.readDirectory(item.path);
          if (!dirResult.success) { showToast(dirResult.error, "error"); return; }
          loaded = true;
          childrenEl = document.createElement("div");
          childrenEl.className = "tree-children";
          childrenEl.style.paddingLeft = "12px";
          renderTreeItems(childrenEl, dirResult.data, item.path);
          el.after(childrenEl);
          caret.innerHTML = "<i class=\"fa-solid fa-caret-down\"></i>";
        });
      } else {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await openFileByPath(item.path);
        });
      }
      parentEl.appendChild(el);
    });
  }

  function getFileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    const map = {
      js: "fa-brands fa-js", ts: "fa-solid fa-code", jsx: "fa-brands fa-react",
      tsx: "fa-brands fa-react", html: "fa-brands fa-html5", css: "fa-brands fa-css3-alt",
      json: "fa-solid fa-code", md: "fa-brands fa-markdown", py: "fa-brands fa-python",
      java: "fa-brands fa-java", c: "fa-solid fa-c", cpp: "fa-solid fa-c",
      go: "fa-brands fa-golang", rs: "fa-solid fa-gear", rb: "fa-solid fa-gem",
      sql: "fa-solid fa-database", xml: "fa-solid fa-code", yaml: "fa-solid fa-file-code",
      yml: "fa-solid fa-file-code", sh: "fa-solid fa-terminal", bat: "fa-solid fa-terminal",
      ps1: "fa-solid fa-terminal", txt: "fa-regular fa-file", log: "fa-regular fa-file",
    };
    return map[ext] || "fa-regular fa-file";
  }

  // ─── Terminal ───────────────────────────
  let terminalVisible = false;
  let terminalEl = null;
  let terminalInstance = null;
  let terminalId = null;
  let termFitAddon = null;

  function toggleTerminal() {
    terminalVisible = !terminalVisible;
    let termPanel = document.getElementById("terminal-panel");
    if (terminalVisible) {
      if (!termPanel) {
        termPanel = document.createElement("div");
        termPanel.id = "terminal-panel";
        termPanel.innerHTML = `
          <div class="terminal-header">
            <span class="terminal-title"><i class=\"fa-solid fa-terminal\"></i> Terminal</span>
            <button id="terminal-close-btn" class="terminal-header-btn" title="Fechar terminal" aria-label="Fechar terminal"><i class=\"fa-solid fa-xmark\"></i></button>
          </div>
          <div id="terminal-container"></div>
        `;
        document.getElementById("editor-area").appendChild(termPanel);
        termPanel.style.cssText = "height:200px;border-top:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;";
        document.getElementById("terminal-container").style.cssText = "flex:1;overflow:hidden;background:#0d0d0d;";
        document.getElementById("terminal-close-btn").addEventListener("click", () => toggleTerminal());
      }
      termPanel.style.display = "";
      initTerminal();
    } else {
      if (termPanel) termPanel.style.display = "none";
    }
    setTimeout(() => EditorManager.layout(), 50);
  }

  async function initTerminal() {
    const container = document.getElementById("terminal-container");
    if (!container) return;

    // Check if xterm.js is available
    if (typeof Terminal === "undefined") {
      container.innerHTML = `<div style=\"padding:12px;color:#888;font-size:13px;\"><i class=\"fa-solid fa-triangle-exclamation\"></i> xterm.js não está disponível. Terminal desativado.</div>`;
      return;
    }

    if (terminalInstance) return; // Already initialized

    terminalInstance = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#d4d4d4',
        cursor: '#dcdcaa',
        cursorAccent: '#0d0d0d',
        selectionBackground: '#264f78',
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    // Try to load FitAddon
    try {
      if (typeof FitAddon !== "undefined") {
        termFitAddon = new FitAddon.FitAddon();
        terminalInstance.loadAddon(termFitAddon);
      }
    } catch (_) {}

    terminalInstance.open(container);
    if (termFitAddon) {
      try { termFitAddon.fit(); } catch (_) {}
    }

    // Intercept Lignis commands in terminal
    let termLineBuffer = "";
    terminalInstance.onData((data) => {
      // Enter pressed — check for Lignis command
      if (data === "\r" || data === "\n") {
        const trimmed = termLineBuffer.trim();
        if (trimmed.startsWith("$") && typeof LignisCommands !== "undefined" && LignisCommands.isEnabled()) {
          const cmdRegex = /^\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\([^)]*\)$/;
          if (cmdRegex.test(trimmed)) {
            const execResult = LignisCommands.execute(trimmed);
            Promise.resolve(execResult).then(res => {
              if (res.success) {
                terminalInstance.write("\r\n" + String(res.value) + "\r\n");
                termLineBuffer = "";
                return;
              }
            });
            termLineBuffer = "";
            return; // Don't send to shell
          }
        }
        termLineBuffer = "";
      } else if (data === "\x7f" || data === "\b") {
        termLineBuffer = termLineBuffer.slice(0, -1);
      } else {
        termLineBuffer += data;
      }
      if (terminalId) {
        window.lignisAPI.terminalWrite(terminalId, data);
      }
    });

    // Create terminal in main process
    const cwd = workspacePath || undefined;
    const cols = terminalInstance.cols || 80;
    const rows = terminalInstance.rows || 24;
    const result = await window.lignisAPI.terminalCreate({ cwd, cols, rows });
    if (result.success) {
      terminalId = result.data.id;
    } else {
      terminalInstance.write(`\r\nErro ao criar terminal: ${result.error}\r\n`);
    }

    // Listen for data from terminal
    window.lignisAPI.on("terminal-data", (data) => {
      if (data.id === terminalId && terminalInstance) {
        terminalInstance.write(data.data);
      }
    });

    terminalInstance.focus();
  }

  // Handle window resize for terminal fit
  window.addEventListener("resize", () => {
    if (termFitAddon && terminalVisible) {
      try { termFitAddon.fit(); } catch (_) {}
    }
  });

  // ─── Minimap Toggle ──────────────────────
  function toggleMinimap() {
    const current = SettingsManager.get("minimap");
    SettingsManager.set("minimap", !current);
    EditorManager.setMinimap(!current);
    showToast(!current ? "Minimap ativado." : "Minimap desativado.", "info");
  }

  // ─── Quick Open ──────────────────────────
  function setupQuickOpen() {
    const overlay = document.getElementById("quick-open-overlay");
    const input = document.getElementById("quick-open-input");
    const list = document.getElementById("quick-open-list");
    let selectedIndex = 0;
    let filteredFiles = [];

    input.addEventListener("input", () => {
      const query = input.value.toLowerCase().trim();
      filteredFiles = TabManager.getAllTabs();
      if (query) filteredFiles = filteredFiles.filter(t => t.name.toLowerCase().includes(query) || (t.path && t.path.toLowerCase().includes(query)));
      selectedIndex = 0;
      renderQuickOpen(list, filteredFiles, selectedIndex);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeQuickOpen();
      else if (e.key === "ArrowDown") { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filteredFiles.length - 1); renderQuickOpen(list, filteredFiles, selectedIndex); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); renderQuickOpen(list, filteredFiles, selectedIndex); }
      else if (e.key === "Enter" && filteredFiles[selectedIndex]) { closeQuickOpen(); TabManager.switchToTab(filteredFiles[selectedIndex].id); }
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeQuickOpen(); });

    function renderQuickOpen(listEl, files, selIdx) {
      listEl.innerHTML = "";
      files.forEach((t, i) => {
        const item = document.createElement("div");
        item.className = "quick-open-item" + (i === selIdx ? " selected" : "");
        item.innerHTML = `<i class="fa-regular fa-file quick-open-item-icon"></i><span class="quick-open-item-name">${t.name}</span>${t.path ? `<span class="quick-open-item-path">${t.path}</span>` : ""}`;
        item.addEventListener("click", () => { closeQuickOpen(); TabManager.switchToTab(t.id); });
        listEl.appendChild(item);
      });
    }
  }

  function openQuickOpen() {
    quickOpenVisible = true;
    const overlay = document.getElementById("quick-open-overlay");
    const input = document.getElementById("quick-open-input");
    const list = document.getElementById("quick-open-list");
    overlay.classList.remove("hidden");
    input.value = "";
    const files = TabManager.getAllTabs();
    list.innerHTML = "";
    files.forEach((t, i) => {
      const item = document.createElement("div");
      item.className = "quick-open-item" + (i === 0 ? " selected" : "");
      item.innerHTML = `<i class="fa-regular fa-file quick-open-item-icon"></i><span class="quick-open-item-name">${t.name}</span>${t.path ? `<span class="quick-open-item-path">${t.path}</span>` : ""}`;
      item.addEventListener("click", () => { closeQuickOpen(); TabManager.switchToTab(t.id); });
      list.appendChild(item);
    });
    input.focus();
  }

  function closeQuickOpen() {
    quickOpenVisible = false;
    document.getElementById("quick-open-overlay").classList.add("hidden");
    EditorManager.focus();
  }

  // ─── HTML Preview ────────────────────────
  function isHtmlFile(name) {
    return name && (name.endsWith(".html") || name.endsWith(".htm"));
  }

  function setupHtmlPreview() {
    // No-op: preview is toggled on demand
  }

  function setupMarkdownLibraries() {
    const markedScript = document.createElement("script");
    markedScript.src = "https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js";
    markedScript.onload = () => { markedLib = window.marked; };
    markedScript.onerror = () => console.warn("[Lignis] Falha ao carregar marked.js via CDN.");
    document.head.appendChild(markedScript);

    const purifyScript = document.createElement("script");
    purifyScript.src = "https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js";
    purifyScript.onload = () => { DOMPurifyLib = window.DOMPurify; };
    purifyScript.onerror = () => console.warn("[Lignis] Falha ao carregar DOMPurify via CDN.");
    document.head.appendChild(purifyScript);
  }

  function toggleMarkdownPreview() {
    const tab = TabManager.getActiveTab();
    if (!tab) return;
    const isMarkdown = tab.name.endsWith(".md") || tab.name.endsWith(".markdown");
    if (!isMarkdown) {
      showToast("Preview Markdown disponível apenas para arquivos .md.", "warning");
      return;
    }

    // Close HTML preview if open
    if (htmlPreviewVisible) toggleHtmlPreview();

    markdownPreviewVisible = !markdownPreviewVisible;
    const preview = document.getElementById("markdown-preview");
    const editor = document.getElementById("editor");

    if (markdownPreviewVisible) {
      if (!markedLib || !DOMPurifyLib) {
        showToast("Bibliotecas de preview não carregadas.", "error");
        markdownPreviewVisible = false;
        return;
      }
      const content = EditorManager.getValue();
      const rawHtml = markedLib.parse(content);
      const cleanHtml = DOMPurifyLib.sanitize(rawHtml);
      preview.innerHTML = cleanHtml;
      preview.classList.add("visible");
      editor.style.display = "none";
      EditorManager.layout();
    } else {
      preview.classList.remove("visible");
      editor.style.display = "";
      EditorManager.layout();
      EditorManager.focus();
    }
  }

  function toggleHtmlPreview() {
    const tab = TabManager.getActiveTab();
    if (!tab) return;
    if (!isHtmlFile(tab.name)) {
      showToast("Pré-visualização HTML disponível apenas para arquivos .html/.htm.", "warning");
      return;
    }

    // Close Markdown preview if open
    if (markdownPreviewVisible) toggleMarkdownPreview();

    htmlPreviewVisible = !htmlPreviewVisible;
    const iframe = document.getElementById("html-preview");
    const editor = document.getElementById("editor");

    if (htmlPreviewVisible) {
      updateHtmlPreview();
      iframe.classList.remove("visible");
      iframe.style.display = "block";
      editor.style.display = "none";
      // Split layout
      document.getElementById("editor-container").style.flexDirection = "column";
      document.getElementById("editor-container").style.display = "flex";
      iframe.style.flex = "1";
      EditorManager.layout();
    } else {
      iframe.style.display = "none";
      editor.style.display = "";
      document.getElementById("editor-container").style.flexDirection = "";
      document.getElementById("editor-container").style.display = "";
      if (htmlPreviewTimer) { clearTimeout(htmlPreviewTimer); htmlPreviewTimer = null; }
      EditorManager.layout();
      EditorManager.focus();
    }
  }

  function updateHtmlPreviewDebounced() {
    if (htmlPreviewTimer) clearTimeout(htmlPreviewTimer);
    htmlPreviewTimer = setTimeout(updateHtmlPreview, 350);
  }

  function updateHtmlPreview() {
    const iframe = document.getElementById("html-preview");
    if (!iframe || !htmlPreviewVisible) return;

    const content = EditorManager.getValue();

    // Sanitize: remove dangerous elements from user HTML
    let safeHtml = content;

    if (!htmlPreviewEnabled) {
      // Remove <script> tags when JS preview is disabled
      safeHtml = safeHtml.replace(/<script[\s\S]*?<\/script>/gi, "<!-- script bloqueado -->");
    }

    // Use srcdoc with sandbox for isolation
    // The iframe has sandbox="allow-scripts" (no allow-same-origin) from HTML
    // CSP inside iframe blocks all network access
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src data:;">
</head><body>${safeHtml}</body></html>`;

    iframe.srcdoc = fullHtml;
  }

  // ─── Go to Line ──────────────────────────
  function openGoToLine() {
    const overlay = document.getElementById("goto-overlay");
    const input = document.getElementById("goto-input");
    overlay.classList.remove("hidden");
    input.value = "";
    input.focus();

    const handler = () => {
      const val = input.value.trim();
      let line = 1, col = 1;

      if (val.includes(":")) {
        const parts = val.split(":");
        line = parseInt(parts[0]);
        col = parseInt(parts[1]) || 1;
      } else {
        line = parseInt(val);
      }

      const lineCount = EditorManager.getLineCount();
      if (line && line >= 1 && line <= lineCount) {
        EditorManager.goToPosition(line, col);
        closeGoToLine();
      } else {
        showToast(`Linha inválida. Valor entre 1 e ${lineCount}.`, "warning");
      }
    };

    document.getElementById("goto-ok").onclick = handler;
    document.getElementById("goto-cancel").onclick = closeGoToLine;
    input.onkeydown = (e) => {
      if (e.key === "Enter") handler();
      if (e.key === "Escape") closeGoToLine();
    };
    overlay.onclick = (e) => { if (e.target === overlay) closeGoToLine(); };
  }

  function closeGoToLine() {
    document.getElementById("goto-overlay").classList.add("hidden");
    EditorManager.focus();
  }

  // ─── Statistics ──────────────────────────
  function showStatistics() {
    const tab = TabManager.getActiveTab();
    if (!tab) return;

    const content = EditorManager.getValue();
    const lines = content.split("\n").length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const charsNoSpaces = content.replace(/\s/g, "").length;
    const bytes = new Blob([content]).size;
    const language = EditorManager.detectLanguage(tab.name);
    const encoding = tab.encoding || "UTF-8";
    const lineEnding = tab.lineEnding || "LF";

    const formatBytes = (b) => {
      if (b < 1024) return b + " bytes";
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
      return (b / 1024 / 1024).toFixed(2) + " MB";
    };

    document.getElementById("stats-content").innerHTML = `
      <div class="stat-item"><span class="stat-label">Linhas</span><span class="stat-value">${lines.toLocaleString("pt-BR")}</span></div>
      <div class="stat-item"><span class="stat-label">Palavras</span><span class="stat-value">${words.toLocaleString("pt-BR")}</span></div>
      <div class="stat-item"><span class="stat-label">Caracteres</span><span class="stat-value">${chars.toLocaleString("pt-BR")}</span></div>
      <div class="stat-item"><span class="stat-label">Caracteres (sem espaços)</span><span class="stat-value">${charsNoSpaces.toLocaleString("pt-BR")}</span></div>
      <div class="stat-item"><span class="stat-label">Tamanho</span><span class="stat-value">${formatBytes(bytes)}</span></div>
      <div class="stat-item"><span class="stat-label">Linguagem</span><span class="stat-value">${language}</span></div>
      <div class="stat-item"><span class="stat-label">Codificação</span><span class="stat-value">${encoding}</span></div>
      <div class="stat-item"><span class="stat-label">Quebra de linha</span><span class="stat-value">${lineEnding}</span></div>
    `;

    document.getElementById("stats-overlay").classList.remove("hidden");

    document.getElementById("stats-close-btn").onclick = () => {
      document.getElementById("stats-overlay").classList.add("hidden");
    };
    document.getElementById("stats-overlay").onclick = (e) => {
      if (e.target === document.getElementById("stats-overlay"))
        document.getElementById("stats-overlay").classList.add("hidden");
    };
  }

  // ─── Shortcuts Dialog ────────────────────
  function showShortcuts() {
    const L = typeof Locale !== "undefined" ? Locale : { t: (k) => k };
    const shortcuts = [
      [L.t("shortcut.newFile"), "Ctrl+N"],
      [L.t("shortcut.openFile"), "Ctrl+O"],
      [L.t("shortcut.newTab"), "Ctrl+T"],
      [L.t("shortcut.save"), "Ctrl+S"],
      [L.t("shortcut.saveAs"), "Ctrl+Shift+S"],
      [L.t("shortcut.saveAll"), "Ctrl+Alt+S"],
      [L.t("shortcut.closeTab"), "Ctrl+W"],
      ["Recarregar", "Ctrl+Shift+R"],
      ["", ""],
      [L.t("shortcut.find"), "Ctrl+F"],
      [L.t("shortcut.replace"), "Ctrl+H"],
      [L.t("shortcut.goToLine"), "Ctrl+G"],
      ["", ""],
      [L.t("shortcut.undo"), "Ctrl+Z"],
      [L.t("shortcut.redo"), "Ctrl+Shift+Z"],
      [L.t("shortcut.duplicateLine"), "Ctrl+D"],
      [L.t("shortcut.deleteLine"), "Ctrl+Shift+K"],
      [L.t("shortcut.moveLineUp"), "Alt+↑"],
      [L.t("shortcut.moveLineDown"), "Alt+↓"],
      [L.t("shortcut.toggleComment"), "Ctrl+/"],
      ["", ""],
      [L.t("shortcut.commandPalette"), "Ctrl+Shift+P"],
      [L.t("shortcut.settings"), "Ctrl+,"],
      [L.t("shortcut.toggleTheme"), "Ctrl+Shift+T"],
      [L.t("shortcut.toggleWordWrap"), "Alt+Z"],
      [L.t("shortcut.zoomIn"), "Ctrl++"],
      [L.t("shortcut.zoomOut"), "Ctrl+-"],
      [L.t("shortcut.zoomReset"), "Ctrl+0"],
      [L.t("shortcut.fullscreen"), "F11"],
    ];

    document.getElementById("shortcuts-content").innerHTML = shortcuts
      .filter(([label]) => label !== "")
      .map(([label, keys]) =>
        `<div class="shortcut-item"><span class="shortcut-label">${label}</span><span class="shortcut-keys">${keys}</span></div>`
      ).join("");

    document.getElementById("shortcuts-overlay").classList.remove("hidden");

    document.getElementById("shortcuts-close-btn").onclick = () => {
      document.getElementById("shortcuts-overlay").classList.add("hidden");
    };
    document.getElementById("shortcuts-overlay").onclick = (e) => {
      if (e.target === document.getElementById("shortcuts-overlay"))
        document.getElementById("shortcuts-overlay").classList.add("hidden");
    };
  }

  // ─── About ───────────────────────────────
  function setupAbout() {
    document.getElementById("about-close-btn").onclick = () => {
      document.getElementById("about-overlay").classList.add("hidden");
    };
    document.getElementById("about-overlay").onclick = (e) => {
      if (e.target === document.getElementById("about-overlay"))
        document.getElementById("about-overlay").classList.add("hidden");
    };
  }

  function showAbout() {
    document.getElementById("about-overlay").classList.remove("hidden");
    window.lignisAPI.getAppInfo().then(result => {
      if (result.success) {
        document.getElementById("about-version").textContent = `Versão ${result.data.version}`;
        const details = document.getElementById("about-details");
        if (details) {
          details.innerHTML = `
            <p style="font-size:11px;color:var(--text-muted);margin:4px 0">Electron ${result.data.electron || "?"}</p>
            <p style="font-size:11px;color:var(--text-muted);margin:4px 0">Chromium ${result.data.chrome || "?"}</p>
            <p style="font-size:11px;color:var(--text-muted);margin:4px 0">Node.js ${result.data.node || "?"}</p>
          `;
        }
      }
    });
  }

  // ─── Toasts ──────────────────────────────
  function showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  // ─── Toolbar ─────────────────────────────
  function setupToolbarButtons() {
    document.getElementById("tb-new").addEventListener("click", newFile);
    document.getElementById("tb-open").addEventListener("click", openFile);
    document.getElementById("tb-save").addEventListener("click", saveCurrentFile);
    document.getElementById("tb-undo").addEventListener("click", () => EditorManager.undo());
    document.getElementById("tb-redo").addEventListener("click", () => EditorManager.redo());
    document.getElementById("tb-find").addEventListener("click", () => SearchManager.open(false));
    document.getElementById("tb-wrap").addEventListener("click", toggleWordWrap);
    document.getElementById("tb-theme").addEventListener("click", toggleTheme);
    document.getElementById("tb-focus").addEventListener("click", toggleFocusMode);
    document.getElementById("tb-sidebar").addEventListener("click", toggleSidebar);
    document.getElementById("new-tab-btn").addEventListener("click", newFile);
  }

  // ─── Keyboard Shortcuts ──────────────────
  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      if (ctrl && !shift && !alt && e.key === "n") { e.preventDefault(); newFile(); return; }
      if (ctrl && !shift && !alt && e.key === "o") { e.preventDefault(); openFile(); return; }
      if (ctrl && !shift && !alt && e.key === "s") { e.preventDefault(); saveCurrentFile(); return; }
      if (ctrl && shift && !alt && e.key === "S") { e.preventDefault(); saveFileAs(); return; }
      if (ctrl && alt && e.key === "s") { e.preventDefault(); saveAllFiles(); return; }
      if (ctrl && !shift && !alt && e.key === "w") { e.preventDefault(); TabManager.closeTab(TabManager.getActiveTabId()); return; }
      if (ctrl && !shift && !alt && e.key === "t") { e.preventDefault(); newFile(); return; }
      if (ctrl && !shift && !alt && e.key === "f") { e.preventDefault(); SearchManager.open(false); return; }
      if (ctrl && !shift && !alt && e.key === "h") { e.preventDefault(); SearchManager.open(true); return; }
      if (ctrl && !shift && !alt && e.key === "g") { e.preventDefault(); openGoToLine(); return; }
      if (ctrl && !shift && !alt && e.key === "d") { e.preventDefault(); EditorManager.selectNextOccurrence(); return; }
      if (ctrl && !shift && !alt && e.key === "/") { e.preventDefault(); EditorManager.toggleComment(); return; }
      if (ctrl && shift && e.key === "P") { e.preventDefault(); CommandPalette.open(); return; }
      if (ctrl && e.key === ",") { e.preventDefault(); SettingsManager.openSettings(); return; }
      if (ctrl && shift && e.key === "T") { e.preventDefault(); toggleTheme(); return; }
      if (alt && e.key === "z") { e.preventDefault(); toggleWordWrap(); return; }
      if (e.key === "F11") { e.preventDefault(); return; }
      // Ctrl+Enter - Execute command on current line
      if (ctrl && !shift && !alt && e.key === "Enter") {
        e.preventDefault();
        executeCommand();
        return;
      }

      // Ctrl+B - Sidebar
      if (ctrl && !shift && !alt && e.key === "b") { e.preventDefault(); toggleSidebar(); return; }
      // Ctrl+P - Quick Open
      if (ctrl && !shift && !alt && e.key === "p") { e.preventDefault(); openQuickOpen(); return; }
      // Ctrl+` - Toggle terminal
      if (ctrl && !shift && !alt && (e.key === "`" || e.key === "`")) { e.preventDefault(); toggleTerminal(); return; }
      // Ctrl+Shift+D - Duplicate line
      if (ctrl && shift && !alt && e.key === "D") { e.preventDefault(); EditorManager.duplicateLine(); return; }
      // F2 - Next bookmark
      if (!ctrl && !shift && !alt && e.key === "F2") { e.preventDefault(); TextTools.nextBookmark(); return; }
      // Shift+F2 - Previous bookmark
      if (ctrl && shift && !alt && e.key === "F2") { e.preventDefault(); TextTools.prevBookmark(); return; }
      // Ctrl+F2 - Toggle bookmark
      if (ctrl && !shift && !alt && e.key === "F2") { e.preventDefault(); TextTools.toggleBookmark(); return; }

      if (e.key === "Escape") {
        if (htmlPreviewVisible) { toggleHtmlPreview(); return; }
        if (quickOpenVisible) { closeQuickOpen(); return; }
        if (CommandPalette.isOpened()) { CommandPalette.close(); return; }
        if (SearchManager.isOpened()) { SearchManager.close(); return; }
        if (SettingsManager.isOpened()) { SettingsManager.closeSettings(); return; }
        if (document.getElementById("commands-help-overlay") && !document.getElementById("commands-help-overlay").classList.contains("hidden")) {
          LignisCommands.closeHelp(); return;
        }
        closeGoToLine();
        document.getElementById("about-overlay").classList.add("hidden");
        document.getElementById("stats-overlay").classList.add("hidden");
        document.getElementById("shortcuts-overlay").classList.add("hidden");
        document.getElementById("language-overlay").classList.add("hidden");
      }

      if (ctrl && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const size = EditorManager.zoomIn();
        StatusBar.updateZoom(Math.round((size / 14) * 100));
        document.getElementById("font-size-display").textContent = size + "px";
        SettingsManager.set("fontSize", size);
        return;
      }
      if (ctrl && e.key === "-") {
        e.preventDefault();
        const size = EditorManager.zoomOut();
        StatusBar.updateZoom(Math.round((size / 14) * 100));
        document.getElementById("font-size-display").textContent = size + "px";
        SettingsManager.set("fontSize", size);
        return;
      }
      if (ctrl && e.key === "0") {
        e.preventDefault();
        const size = EditorManager.zoomReset();
        StatusBar.updateZoom(100);
        document.getElementById("font-size-display").textContent = size + "px";
        SettingsManager.set("fontSize", size);
        return;
      }
    });
  }

  // ─── IPC Listeners ───────────────────────
  function setupIpcListeners() {
    const api = window.lignisAPI;

    // File operations
    api.on("menu-new-file", newFile);
    api.on("menu-open-file", openFile);
    api.on("menu-save-file", saveCurrentFile);
    api.on("menu-save-as", () => saveFileAs());
    api.on("menu-save-all", saveAllFiles);
    api.on("menu-reload", () => reloadFile());
    api.on("menu-close-tab", () => TabManager.closeTab(TabManager.getActiveTabId()));
    api.on("menu-close-others", () => TabManager.closeOtherTabs(TabManager.getActiveTabId()));
    api.on("menu-close-all", () => TabManager.closeAllTabs());

    // Edit operations
    api.on("menu-undo", () => EditorManager.undo());
    api.on("menu-redo", () => EditorManager.redo());
    api.on("menu-find", () => SearchManager.open(false));
    api.on("menu-replace", () => SearchManager.open(true));
    api.on("menu-goto-line", openGoToLine);
    api.on("menu-duplicate-line", () => EditorManager.duplicateLine());
    api.on("menu-delete-line", () => EditorManager.deleteLine());
    api.on("menu-move-line-up", () => EditorManager.moveLineUp());
    api.on("menu-move-line-down", () => EditorManager.moveLineDown());
    api.on("menu-uppercase", () => TextTools.toUpperCase());
    api.on("menu-lowercase", () => TextTools.toLowerCase());
    api.on("menu-title-case", () => TextTools.toTitleCase());

    // Format operations
    api.on("menu-json-format", () => TextTools.formatJSON());
    api.on("menu-json-minify", () => TextTools.minifyJSON());
    api.on("menu-json-validate", () => TextTools.validateJSON());
    api.on("menu-sort-az", () => TextTools.sortLinesAZ());
    api.on("menu-sort-za", () => TextTools.sortLinesZA());
    api.on("menu-remove-duplicates", () => TextTools.removeDuplicateLines());
    api.on("menu-remove-empty-lines", () => TextTools.removeEmptyLines());
    api.on("menu-trim-trailing", () => TextTools.trimTrailingSpaces());
    api.on("menu-tabs-to-spaces", () => TextTools.tabsToSpaces());
    api.on("menu-spaces-to-tabs", () => TextTools.spacesToTabs());

    // New tools
    api.on("menu-statistics", showStatistics);
    api.on("menu-read-only", () => TabManager.toggleReadOnly());
    api.on("menu-escape", () => TextTools.escapeText());
    api.on("menu-unescape", () => TextTools.unescapeText());
    api.on("menu-insert-timestamp", () => TextTools.insertTimestamp());
    api.on("menu-insert-uuid", () => TextTools.insertUUID());
    api.on("menu-copy-as-json", () => TextTools.copyAsJSONString());
    api.on("menu-copy-file-path", copyFilePath);
    api.on("menu-copy-file-name", copyFileName);
    api.on("menu-copy-directory", copyDirectory);
    api.on("menu-open-folder", openContainingFolder);
    api.on("menu-shortcuts", showShortcuts);

    // View operations
    api.on("toggle-word-wrap", (enabled) => {
      SettingsManager.set("wordWrap", enabled);
      EditorManager.setWordWrap(enabled);
      document.getElementById("setting-word-wrap").checked = enabled;
      document.getElementById("tb-wrap").classList.toggle("active", enabled);
    });
    api.on("toggle-line-numbers", (enabled) => {
      SettingsManager.set("lineNumbers", enabled);
      EditorManager.setLineNumbers(enabled);
      document.getElementById("setting-line-numbers").checked = enabled;
    });
    api.on("toggle-status-bar", (enabled) => {
      SettingsManager.set("showStatusBar", enabled);
      StatusBar.toggleVisibility(enabled);
    });
    api.on("toggle-toolbar", (enabled) => {
      SettingsManager.set("showToolbar", enabled);
      const toolbar = document.getElementById("toolbar");
      if (toolbar) toolbar.style.display = enabled ? "" : "none";
    });
    api.on("toggle-focus-mode", toggleFocusMode);
    api.on("toggle-sidebar", toggleSidebar);
    api.on("toggle-terminal", toggleTerminal);
    api.on("menu-open-folder-dialog", openFolder);
    api.on("toggle-markdown-preview", toggleMarkdownPreview);
    api.on("toggle-html-preview", toggleHtmlPreview);
    api.on("set-theme", setTheme);
    api.on("open-command-palette", () => CommandPalette.open());
    api.on("open-settings", () => SettingsManager.openSettings());
    api.on("open-about", showAbout);
    api.on("menu-open-commands-help", () => LignisCommands.openHelp());

    api.on("zoom-in", () => {
      const size = EditorManager.zoomIn();
      StatusBar.updateZoom(Math.round((size / 14) * 100));
    });
    api.on("zoom-out", () => {
      const size = EditorManager.zoomOut();
      StatusBar.updateZoom(Math.round((size / 14) * 100));
    });
    api.on("zoom-reset", () => {
      EditorManager.zoomReset();
      StatusBar.updateZoom(100);
    });

    api.on("open-update-check", () => checkForUpdatesManual());
    api.on("open-recent-file", (filePath) => openFileByPath(filePath));
    api.on("recent-files-updated", () => updateRecentMenu());

    // Close confirmation
    api.on("window-close-request", async () => {
      if (TabManager.hasUnsavedChanges()) {
        const dirtyTabs = TabManager.getAllTabs().filter(t => t.isDirty);
        const result = await TabManager.showUnsavedDialogMultiple(dirtyTabs);
        if (result === "save") {
          const saved = await saveAllFiles();
          if (saved > 0 || !TabManager.hasUnsavedChanges()) {
            window.lignisAPI.invoke("force-close");
          }
        } else if (result === "discard") {
          window.lignisAPI.invoke("force-close");
        }
      } else {
        window.lignisAPI.invoke("force-close");
      }
    });

    // ─── Auto Update listeners ──
    api.on("update-available", (data) => {
      showUpdateModal(data.version, data.currentVersion);
    });

    api.on("update-progress", (data) => {
      updateDownloadProgress(data.percent);
    });

    api.on("update-downloaded", (data) => {
      showUpdateReady(data.version);
    });
  }

  // ─── Auto Update UI ──────────────────────
  let updateCurrentVersion = "";
  let updateNewVersion = "";

  function showUpdateModal(newVersion, currentVersion) {
    updateCurrentVersion = currentVersion;
    updateNewVersion = newVersion;

    const overlay = document.getElementById("update-overlay");
    const title = document.getElementById("update-title");
    const info = document.getElementById("update-info");
    const progressContainer = document.getElementById("update-progress-container");
    const actionBtn = document.getElementById("update-action-btn");
    const dismissBtn = document.getElementById("update-dismiss-btn");

    title.textContent = "Nova atualização disponível";
    info.textContent = `Lignis ${newVersion} está disponível. Você está usando ${currentVersion}.`;
    progressContainer.classList.add("hidden");
    actionBtn.textContent = "Baixar atualização";
    actionBtn.className = "btn-primary";
    actionBtn.disabled = false;

    actionBtn.onclick = () => {
      progressContainer.classList.remove("hidden");
      actionBtn.disabled = true;
      actionBtn.textContent = "Baixando...";
      window.lignisAPI.invoke("update-download");
    };

    dismissBtn.onclick = () => {
      overlay.classList.add("hidden");
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    };

    overlay.classList.remove("hidden");
  }

  function updateDownloadProgress(percent) {
    const fill = document.getElementById("update-progress-fill");
    const text = document.getElementById("update-progress-text");
    if (fill) fill.style.width = `${Math.round(percent)}%`;
    if (text) text.textContent = `Baixando atualização... ${Math.round(percent)}%`;
  }

  function showUpdateReady(version) {
    const title = document.getElementById("update-title");
    const info = document.getElementById("update-info");
    const progressContainer = document.getElementById("update-progress-container");
    const actionBtn = document.getElementById("update-action-btn");
    const dismissBtn = document.getElementById("update-dismiss-btn");

    title.textContent = "Atualização pronta para instalar";
    info.textContent = `Lignis ${version} foi baixado e está pronto para instalar.`;
    progressContainer.classList.add("hidden");
    actionBtn.textContent = "Reiniciar e instalar";
    actionBtn.className = "btn-primary";
    actionBtn.disabled = false;

    actionBtn.onclick = () => {
      // Check for unsaved documents
      if (TabManager.hasUnsavedChanges()) {
        showToast("Salve seus documentos antes de reiniciar.", "warning", 5000);
        return;
      }
      window.lignisAPI.invoke("update-install");
    };

    dismissBtn.textContent = "Instalar ao fechar";
    dismissBtn.onclick = () => {
      document.getElementById("update-overlay").classList.add("hidden");
      showToast("A atualização será instalada ao fechar o Lignis.", "info");
    };
  }

  function checkForUpdatesManual() {
    window.lignisAPI.invoke("update-check-manual").then(() => {
      showToast("Verificando atualizações...", "info");
    }).catch(() => {
      showToast("Não foi possível verificar atualizações no momento.", "warning");
    });
  }

  // ─── Recent Files ────────────────────────
  async function updateRecentMenu() {
    try { await window.lignisAPI.getRecentFiles(); } catch {}
  }

  // ─── Drag and Drop ───────────────────────
  function setupDragAndDrop() {
    const editorContainer = document.getElementById("editor-container");
    editorContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    });

    editorContainer.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) {
          showToast(`Arquivo muito grande: ${file.name}`, "error");
          continue;
        }
        if (file.path) {
          await openFileByPath(file.path);
        } else {
          showToast("Arraste um arquivo do explorador de arquivos.", "warning");
        }
      }
    });

    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());
  }

  // ─── File Info Helpers ───────────────────
  async function copyFilePath() {
    const tab = TabManager.getActiveTab();
    if (tab && tab.path) {
      await window.lignisAPI.clipboardWrite(tab.path);
      showToast("Caminho copiado.", "success");
    }
  }

  async function copyFileName() {
    const tab = TabManager.getActiveTab();
    if (tab) {
      await window.lignisAPI.clipboardWrite(tab.name);
      showToast("Nome copiado.", "success");
    }
  }

  async function copyDirectory() {
    const tab = TabManager.getActiveTab();
    if (tab && tab.path) {
      const dir = tab.path.replace(/[\\\\/][^\\\\/]+$/, "");
      await window.lignisAPI.clipboardWrite(dir);
      showToast("Diretório copiado.", "success");
    }
  }

  function openContainingFolder() {
    const tab = TabManager.getActiveTab();
    if (tab && tab.path) {
      window.lignisAPI.openPath(tab.path);
    }
  }

  // ─── Session Save/Restore ────────────────
  let sessionSaveTimer = null;
  function saveSessionDebounced() {
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(() => saveSession(), 1000);
  }

  async function saveSession() {
    if (!SettingsManager.get("restoreSession")) return;

    const tabData = TabManager.getSessionData();
    const activeId = TabManager.getActiveTabId();
    const activeIdx = TabManager.getAllTabs().findIndex(t => t.id === activeId);
    const pos = EditorManager.getCursorPosition();
    const zoom = StatusBar.getZoom();

    const session = {
      tabs: tabData,
      activeIndex: activeIdx,
      cursor: pos,
      zoom,
      theme: SettingsManager.get("theme"),
      wordWrap: SettingsManager.get("wordWrap"),
    };

    await window.lignisAPI.saveSession(session);
  }

  async function restoreSession() {
    if (!SettingsManager.get("restoreSession")) return;

    try {
      const result = await window.lignisAPI.loadSession();
      if (!result.success || !result.data || !result.data.tabs) return;

      const session = result.data;
      let restoredCount = 0;

      for (const tabData of session.tabs) {
        if (!tabData.path) continue;

        // Check file still exists
        const existsResult = await window.lignisAPI.checkFileExists(tabData.path);
        if (!existsResult.success || !existsResult.data) {
          showToast(`Arquivo não encontrado: ${tabData.name}`, "warning", 4000);
          continue;
        }

        await openFileByPath(tabData.path);
        restoredCount++;
      }

      if (restoredCount > 0) {
        // Switch to previously active tab
        if (session.activeIndex !== undefined) {
          const allTabs = TabManager.getAllTabs();
          if (allTabs[session.activeIndex]) {
            TabManager.switchToTab(allTabs[session.activeIndex].id);
          }
        }

        // Restore cursor
        if (SettingsManager.get("restoreCursor") && session.cursor) {
          EditorManager.goToPosition(session.cursor.lineNumber, session.cursor.column);
        }

        // Restore zoom
        if (SettingsManager.get("restoreZoom") && session.zoom) {
          const zoomPct = session.zoom;
          const size = Math.round(14 * zoomPct / 100);
          EditorManager.setFontSize(size);
          StatusBar.updateZoom(zoomPct);
          document.getElementById("font-size-display").textContent = size + "px";
        }

        showToast(`${restoredCount} arquivo(s) da sessão restaurado(s).`, "info");
      }
    } catch (err) {
      console.warn("[Lignis] Falha ao restaurar sessão:", err);
    }
  }

  // ─── LignisCommands Execution ──────────
  function executeCommand() {
    if (typeof LignisCommands === "undefined" || !LignisCommands.isEnabled()) return;

    const tab = TabManager.getActiveTab();
    if (!tab || tab.readOnly) {
      showToast("O documento está em modo somente leitura.", "warning");
      return;
    }

    const pos = EditorManager.getCursorPosition();
    const model = EditorManager.getModel();
    if (!model) return;

    const line = model.getLineContent(pos.lineNumber);
    const result = LignisCommands.tryExecuteInLine(line);

    if (result.replaced) {
      const range = new monaco.Range(pos.lineNumber, 1, pos.lineNumber, model.getLineMaxColumn(pos.lineNumber));
      model.pushEditOperations([], [{ range, text: result.text }], () => null);
      EditorManager.updateCommandsDecorations();
      showToast("Comando executado.", "success");
    } else {
      // Try to find and execute just the $command part at cursor position
      const regex = /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\([^)]*\)/g;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const cmdStart = match.index + 1;
        const cmdEnd = match.index + match[0].length;
        if (pos.column >= cmdStart && pos.column <= cmdEnd + 1) {
          const execResult = LignisCommands.execute(match[0]);
          Promise.resolve(execResult).then(res => {
            if (res.success) {
              const range = new monaco.Range(
                pos.lineNumber, match.index + 1,
                pos.lineNumber, match.index + 1 + match[0].length
              );
              model.pushEditOperations([], [{ range, text: String(res.value) }], () => null);
              EditorManager.updateCommandsDecorations();
              showToast("Comando executado.", "success");
            } else {
              showToast(res.error, "error");
            }
          });
          return;
        }
      }
      showToast("Nenhum comando encontrado na linha atual.", "info");
    }
  }

  // ─── Tab Change Listener with decorations ──
  let decorationsDebounce = null;
  function setupTabChangeListener() {
    TabManager.onTabChange((tab) => {
      if (tab) {
        StatusBar.updateAll(tab);
        document.getElementById("tb-wrap").classList.toggle("active", SettingsManager.get("wordWrap"));
        saveSessionDebounced();
        // Update LignisCommands decorations with debounce
        if (decorationsDebounce) clearTimeout(decorationsDebounce);
        decorationsDebounce = setTimeout(() => EditorManager.updateCommandsDecorations(), 300);
      }
    });
  }

  return {
    init, newFile, openFile, openFileByPath,
    saveFile, saveFileAs, saveAllFiles, saveCurrentFile,
    reloadFile, toggleTheme, setTheme, toggleWordWrap, toggleFocusMode,
    toggleSidebar, toggleMinimap, toggleTerminal, openQuickOpen, openFolder,
    toggleMarkdownPreview, toggleHtmlPreview,
    openGoToLine,
    showStatistics, showShortcuts, showAbout, showToast,
    openContainingFolder, copyFilePath, copyFileName, copyDirectory,
    executeCommand, checkForUpdatesManual,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  console.log("[STARTUP] DOMContentLoaded disparado.");
  App.init();
});

// Catch unhandled Promise rejections to prevent silent failures
window.addEventListener("unhandledrejection", (event) => {
  console.error("[STARTUP] Unhandled Promise rejection:", event.reason);
});

// Catch uncaught errors
window.addEventListener("error", (event) => {
  console.error("[STARTUP] Uncaught error:", event.message, event.filename, event.lineno);
});
