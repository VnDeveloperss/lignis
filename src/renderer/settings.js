// ========================================
// Lignis v3.0.0 - Settings Manager
// ========================================

const SettingsManager = (function () {
  let settings = {};
  const defaults = {
    theme: "dark", fontSize: 14, tabSize: 4, wordWrap: false,
    lineNumbers: true, highlightLine: true, autoIndent: true, autoPair: true,
    recentFiles: [], recentFolders: [],
    useSpaces: true, showStatusBar: true, showToolbar: true,
    autosave: false, autosaveMode: "off", autosaveDelay: 3,
    trimTrailing: false, finalNewline: false, formatOnSave: false,
    accentColor: "#4a9eff", uiScale: 100, animations: "full",
    restoreSession: true, restoreCursor: true, restoreZoom: false,
    searchRegex: false, searchMatchCase: false, searchWholeWord: false,
    minimap: false, ligatures: false, cursorStyle: "line",
    lineHeight: "1.5",    renderWhitespace: "selection",
    commandsEnabled: true,
    commandsAutocomplete: true,
    commandsHighlight: true,
  };
  let autosaveTimer = null;

  async function init() {
    try { const r = await window.lignisAPI.getSettings(); settings = r.success ? { ...defaults, ...r.data } : { ...defaults }; }
    catch { settings = { ...defaults }; }
    applySettings(); setupUI();
  }

  function get(key) { return settings[key] !== undefined ? settings[key] : defaults[key]; }
  async function set(key, value) { settings[key] = value; try { await window.lignisAPI.setSetting(key, value); } catch (e) { console.error("[Lignis]", e); } }
  function getAll() { return { ...defaults, ...settings }; }

  function applySettings() {
    const isDark = get("theme") === "dark";
    document.body.classList.toggle("light-theme", !isDark);
    EditorManager.setTheme(get("theme"));
    EditorManager.setFontSize(get("fontSize"));
    EditorManager.setTabSize(get("tabSize"));
    EditorManager.setWordWrap(get("wordWrap"));
    EditorManager.setLineNumbers(get("lineNumbers"));
    EditorManager.setHighlightLine(get("highlightLine"));
    EditorManager.setInsertSpaces(get("useSpaces"));
    EditorManager.setAutoClosePairs(get("autoPair"));
    EditorManager.setMinimap(get("minimap"));
    EditorManager.setLigatures(get("ligatures"));
    EditorManager.setCursorStyle(get("cursorStyle"));
    EditorManager.setLineHeight(parseFloat(get("lineHeight")));
    EditorManager.setRenderWhitespace(get("renderWhitespace"));
    document.body.style.fontSize = `${get("uiScale") / 100 * 13}px`;
    const ac = get("accentColor");
    document.documentElement.style.setProperty("--accent", ac);
    document.documentElement.style.setProperty("--accent-hover", lightenColor(ac, 15));
    document.documentElement.style.setProperty("--accent-dim", hexToRgba(ac, 0.12));
    document.documentElement.style.setProperty("--accent-strong", hexToRgba(ac, 0.25));
    StatusBar.toggleVisibility(get("showStatusBar"));
    const tb = document.getElementById("toolbar");
    if (tb) tb.style.display = get("showToolbar") ? "" : "none";
    const anim = get("animations");
    document.body.classList.toggle("no-animations", anim === "none");
  }

  function setupUI() {
    const bind = (id, key, evt, transform) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = get(key);
      else el.value = get(key);
      el.addEventListener(evt, (e) => { set(key, transform ? transform(e.target) : e.target.value); applySettings(); });
    };
    const bindDisplay = (id, display) => {
      const el = document.getElementById(id);
      if (el) el.textContent = get(display) + (typeof get(display) === "number" ? "px" : "");
    };

    document.getElementById("font-size-display").textContent = get("fontSize") + "px";
    document.getElementById("font-decrease").addEventListener("click", () => { const s = Math.max(8, get("fontSize") - 1); set("fontSize", s); document.getElementById("font-size-display").textContent = s + "px"; EditorManager.setFontSize(s); });
    document.getElementById("font-increase").addEventListener("click", () => { const s = Math.min(40, get("fontSize") + 1); set("fontSize", s); document.getElementById("font-size-display").textContent = s + "px"; EditorManager.setFontSize(s); });

    bind("setting-tab-size", "tabSize", "change");
    bind("setting-use-spaces", "useSpaces", "change", (el) => el.checked);
    bind("setting-line-numbers", "lineNumbers", "change", (el) => el.checked);
    bind("setting-word-wrap", "wordWrap", "change", (el) => el.checked);
    bind("setting-highlight-line", "highlightLine", "change", (el) => el.checked);
    bind("setting-auto-indent", "autoIndent", "change", (el) => el.checked);
    bind("setting-auto-pair", "autoPair", "change", (el) => el.checked);
    bind("setting-minimap", "minimap", "change", (el) => el.checked);
    bind("setting-ligatures", "ligatures", "change", (el) => el.checked);
    bind("setting-cursor-style", "cursorStyle", "change");
    bind("setting-line-height", "lineHeight", "change");
    bind("setting-render-whitespace", "renderWhitespace", "change");
    bind("setting-theme", "theme", "change");
    bind("setting-ui-scale", "uiScale", "change");
    bind("setting-search-regex", "searchRegex", "change", (el) => el.checked);
    bind("setting-search-match-case", "searchMatchCase", "change", (el) => el.checked);
    bind("setting-search-whole-word", "searchWholeWord", "change", (el) => el.checked);
    bind("setting-restore-session", "restoreSession", "change", (el) => el.checked);
    bind("setting-restore-cursor", "restoreCursor", "change", (el) => el.checked);
    bind("setting-restore-zoom", "restoreZoom", "change", (el) => el.checked);
    bind("setting-commands-enabled", "commandsEnabled", "change", (el) => { if (typeof LignisCommands !== "undefined") LignisCommands.setEnabled(el.checked); return el.checked; });
    bind("setting-commands-autocomplete", "commandsAutocomplete", "change", (el) => { if (typeof LignisCommands !== "undefined") LignisCommands.setAutocompleteEnabled(el.checked); return el.checked; });
    bind("setting-commands-highlight", "commandsHighlight", "change", (el) => { if (typeof LignisCommands !== "undefined") { LignisCommands.setHighlightEnabled(el.checked); EditorManager.updateCommandsDecorations(); } return el.checked; });
    bind("setting-trim-trailing", "trimTrailing", "change", (el) => el.checked);
    bind("setting-final-newline", "finalNewline", "change", (el) => el.checked);
    bind("setting-format-on-save", "formatOnSave", "change", (el) => el.checked);

    // Animations select
    const animEl = document.getElementById("setting-animations");
    if (animEl) { animEl.value = get("animations"); animEl.addEventListener("change", (e) => { set("animations", e.target.value); applySettings(); }); }

    // Autosave mode
    const asmEl = document.getElementById("setting-autosave-mode");
    if (asmEl) {
      asmEl.value = get("autosaveMode");
      updateAutosaveDelayVisibility(get("autosaveMode"));
      asmEl.addEventListener("change", (e) => { set("autosaveMode", e.target.value); updateAutosaveDelayVisibility(e.target.value); setupAutosave(); });
    }
    const asdEl = document.getElementById("setting-autosave-delay");
    if (asdEl) { asdEl.value = get("autosaveDelay"); asdEl.addEventListener("change", (e) => { set("autosaveDelay", parseInt(e.target.value)); setupAutosave(); }); }

    // Accent colors
    document.querySelectorAll(".accent-btn").forEach((btn) => {
      const color = btn.dataset.color;
      btn.classList.toggle("active", color === get("accentColor"));
      btn.addEventListener("click", () => {
        document.querySelectorAll(".accent-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        set("accentColor", color); applySettings();
      });
    });

    document.getElementById("settings-close-btn").addEventListener("click", closeSettings);
    document.getElementById("settings-overlay").addEventListener("click", (e) => { if (e.target === document.getElementById("settings-overlay")) closeSettings(); });
  }

  function updateAutosaveDelayVisibility(mode) {
    const row = document.querySelector(".autosave-delay-row");
    if (row) row.style.display = mode === "delay" ? "flex" : "none";
  }

  function setupAutosave() {
    if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
    if (get("autosaveMode") === "delay") {
      autosaveTimer = setInterval(() => { if (typeof App !== "undefined") App.saveAllFiles(); }, (get("autosaveDelay") || 3) * 1000);
    }
  }

  function openSettings() { document.getElementById("settings-overlay").classList.remove("hidden"); }
  function closeSettings() { document.getElementById("settings-overlay").classList.add("hidden"); EditorManager.focus(); }
  function isOpened() { return !document.getElementById("settings-overlay").classList.contains("hidden"); }

  function lightenColor(hex, pct) {
    const n = parseInt(hex.replace("#", ""), 16), a = Math.round(2.55 * pct);
    const R = Math.min(255, (n >> 16) + a), G = Math.min(255, ((n >> 8) & 0xFF) + a), B = Math.min(255, (n & 0xFF) + a);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  }
  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  return { init, get, set, getAll, applySettings, openSettings, closeSettings, isOpened, setupAutosave };
})();
