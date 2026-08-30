// ========================================
// Lignis v3.0.0 - Status Bar
// ========================================

const StatusBar = (function () {
  let visible = true;
  let zoomLevel = 100;

  function init() {
    EditorManager.onDidChangeCursorSelection(() => { updateCursorInfo(); updateSelectionInfo(); });
    EditorManager.onDidChangeModelContent(() => { updateContentInfo(); updateIndentationInfo(); });

    document.getElementById("status-lineending").addEventListener("click", () => {
      const tab = TabManager.getActiveTab();
      if (!tab || tab.readOnly) return;
      tab.lineEnding = tab.lineEnding === "LF" ? "CRLF" : "LF";
      updateLineEnding(tab.lineEnding);
    });

    document.getElementById("status-language").addEventListener("click", () => openLanguagePicker());
    document.getElementById("status-zoom").addEventListener("click", (e) => openZoomPicker(e));
    document.getElementById("status-indentation").addEventListener("click", () => openIndentationPicker());
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? `${count} ${singular}` : `${count} ${plural || singular + "s"}`;
  }

  function updateCursorInfo() {
    const pos = EditorManager.getCursorPosition();
    document.getElementById("status-cursor").textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
  }

  function updateContentInfo() {
    const chars = EditorManager.getCharacterCount();
    const words = EditorManager.getWordCount();
    document.getElementById("status-chars").textContent = pluralize(chars, "caractere");
    document.getElementById("status-words").textContent = pluralize(words, "palavra");
  }

  function updateSelectionInfo() {
    const el = document.getElementById("status-selection");
    const c = EditorManager.getSelectedCharCount();
    if (c > 0) { el.textContent = pluralize(c, "selecionado"); el.classList.remove("hidden"); }
    else { el.classList.add("hidden"); }
  }

  function updateIndentationInfo() {
    const info = EditorManager.getIndentationInfo();
    const el = document.getElementById("status-indentation");
    if (el) el.textContent = info.type === "tabs" ? "Tabs" : `Espaços: ${info.size}`;
  }

  function updateLanguage(language) {
    const el = document.getElementById("status-language");
    if (el) el.textContent = language || "Plain Text";
  }
  function updateEncoding(enc) { document.getElementById("status-encoding").textContent = enc || "UTF-8"; }
  function updateLineEnding(le) { document.getElementById("status-lineending").textContent = le || "LF"; }
  function updateZoom(level) { zoomLevel = level; document.getElementById("status-zoom").textContent = `${level}%`; }
  function getZoom() { return zoomLevel; }
  function toggleVisibility(show) { visible = show !== undefined ? show : !visible; document.getElementById("status-bar").classList.toggle("hidden-bar", !visible); }
  function isVisible() { return visible; }

  function updateAll(tab) {
    if (!tab) return;
    updateLanguage(EditorManager.detectLanguage(tab.name));
    updateEncoding(tab.encoding);
    updateLineEnding(tab.lineEnding);
    updateCursorInfo();
    updateContentInfo();
    updateSelectionInfo();
    updateIndentationInfo();
    const ro = document.getElementById("status-readonly");
    if (ro) ro.classList.toggle("hidden", !tab.readOnly);
  }

  // ── Zoom Picker ──
  function openZoomPicker(e) {
    const popup = document.getElementById("zoom-picker-popup");
    const presets = [50, 75, 90, 100, 110, 125, 150, 200];
    popup.innerHTML = presets.map(z =>
      `<div class="zoom-option ${z === zoomLevel ? "active" : ""}" data-zoom="${z}">${z}%</div>`
    ).join("");

    popup.style.position = "fixed";
    popup.style.right = "8px";
    popup.style.bottom = "32px";
    popup.style.zIndex = FloatingUIManager ? FloatingUIManager.getZIndex("POPOVER") : 10000;
    popup.classList.remove("hidden");

    const handler = (ev) => {
      const opt = ev.target.closest(".zoom-option");
      if (!opt) return;
      const z = parseInt(opt.dataset.zoom);
      const size = Math.round(14 * z / 100);
      EditorManager.setFontSize(size);
      updateZoom(z);
      SettingsManager.set("fontSize", size);
      document.getElementById("font-size-display").textContent = size + "px";
      FloatingUIManager.closeById("zoom-picker");
    };
    popup.addEventListener("click", handler);

    FloatingUIManager.open("zoom-picker", popup, {
      anchor: e.target,
      onClose: () => { popup.removeEventListener("click", handler); EditorManager.focus(); },
    });
  }

  // ── Indentation Picker ──
  function openIndentationPicker() {
    const popup = document.getElementById("zoom-picker-popup");
    popup.innerHTML = `
      <div class="zoom-option" data-action="spaces-2">Espaços: 2</div>
      <div class="zoom-option" data-action="spaces-4">Espaços: 4</div>
      <div class="zoom-option" data-action="tabs">Tabs</div>
    `;
    popup.style.position = "fixed";
    popup.style.right = "8px";
    popup.style.bottom = "32px";
    popup.style.zIndex = FloatingUIManager ? FloatingUIManager.getZIndex("POPOVER") : 10000;
    popup.classList.remove("hidden");

    const handler = (ev) => {
      const opt = ev.target.closest(".zoom-option");
      if (!opt) return;
      const action = opt.dataset.action;
      if (action === "tabs") {
        SettingsManager.set("useSpaces", false);
        EditorManager.setInsertSpaces(false);
      } else {
        const size = parseInt(action.split("-")[1]);
        SettingsManager.set("useSpaces", true);
        SettingsManager.set("tabSize", size);
        EditorManager.setInsertSpaces(true);
        EditorManager.setTabSize(size);
      }
      updateIndentationInfo();
      FloatingUIManager.closeById("indent-picker");
    };
    popup.addEventListener("click", handler);

    FloatingUIManager.open("indent-picker", popup, {
      anchor: document.getElementById("status-indentation"),
      onClose: () => { popup.removeEventListener("click", handler); EditorManager.focus(); },
    });
  }

  // ── Language Picker ──
  const LANGUAGES = [
    { id: "plaintext", label: "Texto simples" },
    { id: "javascript", label: "JavaScript" },
    { id: "typescript", label: "TypeScript" },
    { id: "json", label: "JSON" },
    { id: "html", label: "HTML" },
    { id: "css", label: "CSS" },
    { id: "markdown", label: "Markdown" },
    { id: "python", label: "Python" },
    { id: "java", label: "Java" },
    { id: "c", label: "C" },
    { id: "cpp", label: "C++" },
    { id: "csharp", label: "C#" },
    { id: "gdscript", label: "GDScript" },
    { id: "sql", label: "SQL" },
    { id: "xml", label: "XML" },
    { id: "yaml", label: "YAML" },
    { id: "shell", label: "Shell" },
    { id: "ruby", label: "Ruby" },
    { id: "go", label: "Go" },
    { id: "rust", label: "Rust" },
    { id: "swift", label: "Swift" },
    { id: "kotlin", label: "Kotlin" },
    { id: "lua", label: "Lua" },
    { id: "r", label: "R" },
    { id: "scss", label: "SCSS" },
    { id: "less", label: "LESS" },
    { id: "ini", label: "INI" },
  ];

  function openLanguagePicker() {
    const overlay = document.getElementById("language-overlay");
    const searchInput = document.getElementById("language-search-input");
    const list = document.getElementById("language-list-content");
    const tab = TabManager.getActiveTab();
    if (!tab) return;
    const currentLang = tab.language || "plaintext";

    function renderLangList(filter) {
      const q = (filter || "").toLowerCase();
      const filtered = q ? LANGUAGES.filter(l => l.label.toLowerCase().includes(q)) : LANGUAGES;
      list.innerHTML = filtered.map(l =>
        `<div class="language-item ${l.id === currentLang ? "active" : ""}" data-lang="${l.id}">${l.label}</div>`
      ).join("");
    }
    renderLangList("");
    if (searchInput) { searchInput.value = ""; searchInput.focus(); }
    else overlay.focus();
    overlay.classList.remove("hidden");

    const selectHandler = (e) => {
      const item = e.target.closest(".language-item");
      if (!item) return;
      const langId = item.dataset.lang;
      const model = EditorManager.getModel();
      if (model) {
        tab.language = langId;
        if (typeof monaco !== "undefined") monaco.editor.setModelLanguage(model, langId);
        updateLanguage(LANGUAGES.find(l => l.id === langId)?.label || langId);
      }
      closeLanguagePicker(selectHandler, searchHandler);
    };

    const searchHandler = (e) => {
      renderLangList(e.target.value);
    };

    list.addEventListener("click", selectHandler);
    if (searchInput) searchInput.addEventListener("input", searchHandler);

    FloatingUIManager.open("language-picker", overlay, {
      anchor: document.getElementById("status-language"),
      onClose: () => closeLanguagePicker(selectHandler, searchHandler),
    });
  }

  function closeLanguagePicker(selectHandler, searchHandler) {
    const overlay = document.getElementById("language-overlay");
    const searchInput = document.getElementById("language-search-input");
    const list = document.getElementById("language-list-content");
    overlay.classList.add("hidden");
    list.removeEventListener("click", selectHandler);
    if (searchInput && searchHandler) searchInput.removeEventListener("input", searchHandler);
    EditorManager.focus();
  }

  return {
    init, updateCursorInfo, updateContentInfo, updateSelectionInfo, updateIndentationInfo,
    updateLanguage, updateEncoding, updateLineEnding, updateZoom,
    getZoom, toggleVisibility, isVisible, updateAll,
  };
})();
