// ========================================
// Lignis v3.0.0 - Command Palette
// ========================================

const CommandPalette = (function () {
  let isOpen = false;
  let selectedIndex = 0;
  let filteredCommands = [];

  function getCommands() {
    const L = typeof Locale !== "undefined" ? Locale : { t: (k) => k };
    return [
      { cat: "Arquivo", id: "new-file", label: L.t("cmd.newFile"), shortcut: "Ctrl+N", action: () => App.newFile() },
      { cat: "Arquivo", id: "open-file", label: L.t("cmd.openFile"), shortcut: "Ctrl+O", action: () => App.openFile() },
      { cat: "Arquivo", id: "save", label: L.t("cmd.save"), shortcut: "Ctrl+S", action: () => App.saveCurrentFile() },
      { cat: "Arquivo", id: "save-as", label: L.t("cmd.saveAs"), shortcut: "Ctrl+Shift+S", action: () => App.saveFileAs() },
      { cat: "Arquivo", id: "save-all", label: L.t("cmd.saveAll"), shortcut: "Ctrl+Alt+S", action: () => App.saveAllFiles() },
      { cat: "Arquivo", id: "reload", label: L.t("cmd.reload"), shortcut: "Ctrl+Shift+R", action: () => App.reloadFile() },
      { cat: "Arquivo", id: "close-tab", label: L.t("cmd.closeTab"), shortcut: "Ctrl+W", action: () => TabManager.closeTab(TabManager.getActiveTabId()) },
      { cat: "Arquivo", id: "close-all", label: L.t("cmd.closeAll"), action: () => TabManager.closeAllTabs() },
      { type: "separator" },
      { cat: "Editar", id: "undo", label: L.t("cmd.undo"), shortcut: "Ctrl+Z", action: () => EditorManager.undo() },
      { cat: "Editar", id: "redo", label: L.t("cmd.redo"), shortcut: "Ctrl+Shift+Z", action: () => EditorManager.redo() },
      { cat: "Editar", id: "duplicate-line", label: L.t("cmd.duplicateLine"), shortcut: "Shift+Alt+↓", action: () => EditorManager.duplicateLine() },
      { cat: "Editar", id: "delete-line", label: L.t("cmd.deleteLine"), shortcut: "Ctrl+Shift+K", action: () => EditorManager.deleteLine() },
      { cat: "Editar", id: "move-line-up", label: L.t("cmd.moveLineUp"), shortcut: "Alt+↑", action: () => EditorManager.moveLineUp() },
      { cat: "Editar", id: "move-line-down", label: L.t("cmd.moveLineDown"), shortcut: "Alt+↓", action: () => EditorManager.moveLineDown() },
      { cat: "Editar", id: "toggle-comment", label: L.t("cmd.toggleComment"), shortcut: "Ctrl+/", action: () => EditorManager.toggleComment() },
      { cat: "Editar", id: "uppercase", label: L.t("cmd.uppercase"), action: () => TextTools.toUpperCase() },
      { cat: "Editar", id: "lowercase", label: L.t("cmd.lowercase"), action: () => TextTools.toLowerCase() },
      { cat: "Editar", id: "title-case", label: L.t("cmd.titleCase"), action: () => TextTools.toTitleCase() },
      { cat: "Editar", id: "toggle-case", label: L.t("cmd.toggleCase"), action: () => TextTools.toggleCase() },
      { type: "separator" },
      { cat: "Pesquisar", id: "find", label: L.t("cmd.find"), shortcut: "Ctrl+F", action: () => SearchManager.open(false) },
      { cat: "Pesquisar", id: "replace", label: L.t("cmd.replace"), shortcut: "Ctrl+H", action: () => SearchManager.open(true) },
      { cat: "Pesquisar", id: "goto-line", label: L.t("cmd.goToLine"), shortcut: "Ctrl+G", action: () => App.openGoToLine() },
      { cat: "Pesquisar", id: "next-occurrence", label: "Próxima ocorrência", shortcut: "Ctrl+D", action: () => EditorManager.selectNextOccurrence() },
      { type: "separator" },
      { cat: "Formatar", id: "json-format", label: L.t("cmd.jsonFormat"), action: () => TextTools.formatJSON() },
      { cat: "Formatar", id: "json-minify", label: L.t("cmd.jsonMinify"), action: () => TextTools.minifyJSON() },
      { cat: "Formatar", id: "json-validate", label: L.t("cmd.jsonValidate"), action: () => TextTools.validateJSON() },
      { cat: "Formatar", id: "sort-az", label: L.t("cmd.sortAZ"), action: () => TextTools.sortLinesAZ() },
      { cat: "Formatar", id: "sort-za", label: L.t("cmd.sortZA"), action: () => TextTools.sortLinesZA() },
      { cat: "Formatar", id: "sort-natural", label: "Ordenação natural", action: () => TextTools.sortLinesNatural(true) },
      { cat: "Formatar", id: "remove-duplicates", label: L.t("cmd.removeDuplicates"), action: () => TextTools.removeDuplicateLines() },
      { cat: "Formatar", id: "remove-empty", label: L.t("cmd.removeEmptyLines"), action: () => TextTools.removeEmptyLines() },
      { cat: "Formatar", id: "trim-trailing", label: L.t("cmd.trimTrailing"), action: () => TextTools.trimTrailingSpaces() },
      { cat: "Formatar", id: "tabs-to-spaces", label: L.t("cmd.tabsToSpaces"), action: () => TextTools.tabsToSpaces() },
      { cat: "Formatar", id: "spaces-to-tabs", label: L.t("cmd.spacesToTabs"), action: () => TextTools.spacesToTabs() },
      { type: "separator" },
      { cat: "Ferramentas", id: "encode-base64", label: "Codificar Base64", action: () => TextTools.encodeBase64() },
      { cat: "Ferramentas", id: "decode-base64", label: "Decodificar Base64", action: () => TextTools.decodeBase64() },
      { cat: "Ferramentas", id: "encode-url", label: "Codificar URL", action: () => TextTools.encodeURL() },
      { cat: "Ferramentas", id: "decode-url", label: "Decodificar URL", action: () => TextTools.decodeURL() },
      { cat: "Ferramentas", id: "escape-html", label: "Escapar HTML", action: () => TextTools.escapeHTML() },
      { cat: "Ferramentas", id: "unescape-html", label: "Desescapar HTML", action: () => TextTools.unescapeHTML() },
      { cat: "Ferramentas", id: "escape-text", label: L.t("cmd.escape"), action: () => TextTools.escapeText() },
      { cat: "Ferramentas", id: "unescape-text", label: L.t("cmd.unescape"), action: () => TextTools.unescapeText() },
      { cat: "Ferramentas", id: "insert-timestamp", label: L.t("cmd.insertTimestamp"), action: () => TextTools.insertTimestamp() },
      { cat: "Ferramentas", id: "insert-date", label: "Inserir data", action: () => TextTools.insertDate() },
      { cat: "Ferramentas", id: "insert-time", label: "Inserir hora", action: () => TextTools.insertTime() },
      { cat: "Ferramentas", id: "insert-iso", label: "Inserir ISO 8601", action: () => TextTools.insertISO() },
      { cat: "Ferramentas", id: "insert-uuid", label: L.t("cmd.insertUUID"), action: () => TextTools.insertUUID() },
      { cat: "Ferramentas", id: "copy-uuid", label: "Copiar UUID", action: () => TextTools.copyUUID() },
      { cat: "Ferramentas", id: "copy-json-string", label: L.t("cmd.copyAsJSONString"), action: () => TextTools.copyAsJSONString() },
      { type: "separator" },
      { cat: "Exibir", id: "theme-toggle", label: L.t("cmd.toggleTheme"), shortcut: "Ctrl+Shift+T", action: () => App.toggleTheme() },
      { cat: "Exibir", id: "settings", label: L.t("cmd.settings"), shortcut: "Ctrl+,", action: () => SettingsManager.openSettings() },
      { cat: "Exibir", id: "word-wrap", label: L.t("cmd.toggleWordWrap"), shortcut: "Alt+Z", action: () => App.toggleWordWrap() },
      { cat: "Exibir", id: "focus-mode", label: L.t("cmd.focusMode"), action: () => App.toggleFocusMode() },
      { cat: "Exibir", id: "sidebar", label: "Alternar sidebar", shortcut: "Ctrl+B", action: () => App.toggleSidebar() },
      { cat: "Exibir", id: "markdown-preview", label: L.t("cmd.markdownPreview"), action: () => App.toggleMarkdownPreview() },
      { cat: "Exibir", id: "html-preview", label: "Pré-visualização HTML", action: () => App.toggleHtmlPreview() },
      { cat: "Exibir", id: "minimap", label: "Alternar minimap", action: () => App.toggleMinimap() },
      { type: "separator" },
      { cat: "Documento", id: "statistics", label: L.t("cmd.statistics"), action: () => App.showStatistics() },
      { cat: "Documento", id: "read-only", label: L.t("cmd.readOnly"), action: () => TabManager.toggleReadOnly() },
      { cat: "Documento", id: "bookmark", label: "Alternar bookmark", shortcut: "Ctrl+F2", action: () => TextTools.toggleBookmark() },
      { cat: "Documento", id: "next-bookmark", label: "Próximo bookmark", shortcut: "F2", action: () => TextTools.nextBookmark() },
      { cat: "Documento", id: "prev-bookmark", label: "Bookmark anterior", shortcut: "Shift+F2", action: () => TextTools.prevBookmark() },
      { type: "separator" },
      { type: "separator" },
      { cat: "Ajuda", id: "commands-help", label: "Comandos do Lignis", action: () => LignisCommands.openHelp() },
      { cat: "Ajuda", id: "execute-command", label: "Executar comando na linha atual", shortcut: "Ctrl+Enter", action: () => App.executeCommand() },
      { cat: "Ajuda", id: "shortcuts", label: L.t("cmd.shortcuts"), action: () => App.showShortcuts() },
      { cat: "Ajuda", id: "check-updates", label: "Verificar atualizações", action: () => App.checkForUpdatesManual() },
    ];
  }

  function init() {
    const overlay = document.getElementById("command-palette-overlay");
    const input = document.getElementById("command-palette-input");
    input.addEventListener("input", () => filterCommands(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") { e.preventDefault(); selectNext(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); selectPrevious(); }
      else if (e.key === "Enter") { e.preventDefault(); executeSelected(); }
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  function open() {
    isOpen = true;
    document.getElementById("command-palette-overlay").classList.remove("hidden");
    const input = document.getElementById("command-palette-input");
    input.value = ""; filterCommands(""); input.focus();
  }

  function close() {
    isOpen = false;
    document.getElementById("command-palette-overlay").classList.add("hidden");
    EditorManager.focus();
  }

  function fuzzyMatch(query, text) {
    query = query.toLowerCase(); text = text.toLowerCase();
    if (text.includes(query)) return true;
    let qi = 0;
    for (let ti = 0; ti < text.length && qi < query.length; ti++) { if (text[ti] === query[qi]) qi++; }
    return qi === query.length;
  }

  function filterCommands(query) {
    const list = document.getElementById("command-palette-list");
    const commands = getCommands();
    query = query.toLowerCase().trim();
    filteredCommands = commands.filter(cmd => {
      if (cmd.type === "separator") return false;
      if (!query) return true;
      return fuzzyMatch(query, cmd.label) || (cmd.cat && fuzzyMatch(query, cmd.cat));
    });
    selectedIndex = 0;
    renderCommands(list);
  }

  function renderCommands(list) {
    list.innerHTML = "";
    let lastCat = "";
    filteredCommands.forEach((cmd, idx) => {
      if (cmd.cat && cmd.cat !== lastCat) {
        lastCat = cmd.cat;
        const catEl = document.createElement("div");
        catEl.className = "command-category";
        catEl.textContent = cmd.cat;
        list.appendChild(catEl);
      }
      const item = document.createElement("div");
      item.className = "command-item" + (idx === selectedIndex ? " selected" : "");
      item.innerHTML = `<span class="command-item-label"><span class="command-item-text">${cmd.label}</span></span>${cmd.shortcut ? `<span class="command-item-shortcut">${cmd.shortcut}</span>` : ""}`;
      item.addEventListener("click", () => { close(); cmd.action(); });
      item.addEventListener("mouseenter", () => { selectedIndex = idx; updateSelection(list); });
      list.appendChild(item);
    });
  }

  function updateSelection(list) {
    const items = list.querySelectorAll(".command-item");
    items.forEach((item, i) => item.classList.toggle("selected", i === selectedIndex));
    if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: "nearest" });
  }
  function selectNext() { if (!filteredCommands.length) return; selectedIndex = (selectedIndex + 1) % filteredCommands.length; updateSelection(document.getElementById("command-palette-list")); }
  function selectPrevious() { if (!filteredCommands.length) return; selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length; updateSelection(document.getElementById("command-palette-list")); }
  function executeSelected() { if (filteredCommands[selectedIndex]) { close(); filteredCommands[selectedIndex].action(); } }
  function isOpened() { return isOpen; }

  return { init, open, close, isOpened };
})();
