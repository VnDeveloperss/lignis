// ========================================
// Lignis v3.1.1 - Monaco Editor Wrapper
// Local Monaco (no CDN dependency)
// ========================================

const EditorManager = (function () {
  let editor = null;
  let models = new Map();
  let currentModel = null;
  let currentTabId = null;
  let monacoState = "NOT_STARTED"; // NOT_STARTED | LOADING | READY | FAILED
  let monacoError = null;
  let initPromise = null;

  const LANG_MAP = {
    txt: "plaintext", text: "plaintext", log: "plaintext",
    md: "markdown", json: "json", jsonc: "json",
    js: "javascript", mjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript",
    html: "html", htm: "html",
    css: "css", scss: "scss", less: "less",
    xml: "xml", yaml: "yaml", yml: "yaml",
    py: "python", java: "java",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp",
    cs: "csharp", gd: "gdscript", sql: "sql",
    sh: "shell", bash: "shell", zsh: "shell",
    bat: "bat", ps1: "powershell", rb: "ruby",
    go: "go", rs: "rust", swift: "swift", kt: "kotlin",
    lua: "lua", r: "r", toml: "ini", ini: "ini", cfg: "ini",
    env: "plaintext", diff: "plaintext", patch: "plaintext",
    vue: "html", svelte: "html",
  };

  const LANG_NAMES = {
    plaintext: "Plain Text", javascript: "JavaScript", typescript: "TypeScript",
    html: "HTML", css: "CSS", json: "JSON", markdown: "Markdown",
    python: "Python", java: "Java", c: "C", cpp: "C++", csharp: "C#",
    gdscript: "GDScript", sql: "SQL", xml: "XML", yaml: "YAML",
    shell: "Shell", bat: "Batch", powershell: "PowerShell", ruby: "Ruby",
    go: "Go", rust: "Rust", swift: "Swift", kotlin: "Kotlin", lua: "Lua",
    r: "R", scss: "SCSS", less: "LESS", ini: "INI",
  };

  const COMMENT_TOKENS = {
    javascript: "//", typescript: "//", jsx: "//", tsx: "//",
    python: "#", gdscript: "#",
    c: "//", cpp: "//", h: "//", hpp: "//", cc: "//",
    csharp: "//", java: "//", go: "//", rust: "//",
    swift: "//", kotlin: "//", r: "#",
    ruby: "#", shell: "#", bash: "#", zsh: "#", lua: "--",
    sql: "--", css: "/*", scss: "/*", less: "/*",
    html: "<!--", xml: "<!--", vue: "<!--", svelte: "<!--",
    json: null, plaintext: null, markdown: null, yaml: "#",
  };

  function getLanguageFromFilename(filename) {
    if (!filename) return "plaintext";
    const ext = filename.split(".").pop().toLowerCase();
    return LANG_MAP[ext] || "plaintext";
  }

  function detectLanguage(filename) {
    if (!filename) return "Plain Text";
    const ext = filename.split(".").pop().toLowerCase();
    const lang = LANG_MAP[ext] || "plaintext";
    return LANG_NAMES[lang] || "Plain Text";
  }

  function getCommentToken(languageId) { return COMMENT_TOKENS[languageId] || null; }

  /**
   * Determine the base URL for Monaco's `vs/` directory.
   * The standard Monaco AMD layout lives at src/renderer/vs/ (page-relative "vs").
   * This is the SAME layout the workers expect, so workerMain.js can resolve
   * "vs/..." modules (loader, nls, language services) without special-casing.
   */
  function getMonacoBase() {
    return "vs";
  }

  /**
   * Initialize Monaco editor. Returns a Promise that resolves when ready.
   * The Promise is cached: calling init() again while loading or ready
   * returns the same Promise (single-flight, no double editor creation).
   * MonacoEnvironment must be configured BEFORE this is called (see monaco-setup.js).
   * Failures reject immediately via the AMD loader error callback — no fake timeout.
   */
  function init() {
    if (monacoState === "READY") return Promise.resolve(editor);
    if (initPromise) return initPromise;

    monacoState = "LOADING";
    initPromise = new Promise((resolve, reject) => {
      let settled = false;

      function markDone() {
        if (!settled) {
          settled = true;
          monacoState = "READY";
          console.log("[STARTUP] Monaco Editor PRONTO.");
          resolve(editor);
        }
      }
      function markFail(err) {
        if (!settled) {
          settled = true;
          monacoState = "FAILED";
          monacoError = err;
          console.error("[STARTUP] Monaco FALHOU:", err);
          initPromise = null; // allow a later retry
          reject(err);
        }
      }

      // Configure AMD loader to use local Monaco files
      // preferScriptTags: force HTML <script> tag loading (avoids NodeScriptLoader which needs Node.js require)
      try {
        require.config({
          paths: { vs: getMonacoBase() },
          preferScriptTags: true,
        });
        console.log("[STARTUP] Monaco AMD loader configurado.");
      } catch (err) {
        markFail(new Error(`Falha ao configurar Monaco: ${err.message}`));
        return;
      }

      // Load Monaco
      console.log("[STARTUP] Monaco iniciando carregamento...");
      try {
        require(["vs/editor/editor.main"], function () {
          console.log("[STARTUP] Monaco callback disparado.");
          if (settled) return; // Already resolved or failed

          // ── Validate Monaco actually loaded ──
          if (typeof monaco === "undefined" || !monaco.editor || typeof monaco.editor.create !== "function") {
            markFail(new Error("Monaco carregou mas API do editor não está disponível."));
            return;
          }

          console.log("[Lignis] Monaco API validada com sucesso.");

          // ── Custom dark theme ──
          monaco.editor.defineTheme("lignis-dark", {
            base: "vs-dark", inherit: true,
            rules: [
              { token: "comment", foreground: "6A9955", fontStyle: "italic" },
              { token: "keyword", foreground: "569CD6" },
              { token: "string", foreground: "CE9178" },
              { token: "number", foreground: "B5CEA8" },
              { token: "type", foreground: "4EC9B0" },
              { token: "function", foreground: "DCDCAA" },
              { token: "variable", foreground: "9CDCFE" },
              { token: "operator", foreground: "D4D4D4" },
            ],
            colors: {
              "editor.background": "#171821",
              "editor.foreground": "#d4d4d4",
              "editor.lineHighlightBackground": "#1e2030",
              "editor.selectionBackground": "#264f78",
              "editorCursor.foreground": "#dcdcaa",
              "editorLineNumber.foreground": "#4a4a5a",
              "editorLineNumber.activeForeground": "#8888aa",
              "editorIndentGuide.background": "#252535",
              "editorIndentGuide.activeBackground": "#4040aa",
              "editorWidget.background": "#1e1f28",
              "editorWidget.border": "#2e2f38",
              "editorGutter.background": "#171821",
              "input.background": "#1e1f28",
              "input.border": "#2e2f38",
              "input.foreground": "#cccccc",
              "focusBorder": "#4a9eff",
              "list.hoverBackground": "#1e2030",
              "scrollbarSlider.background": "rgba(121,121,121,0.3)",
              "scrollbarSlider.hoverBackground": "rgba(100,100,100,0.6)",
              "scrollbarSlider.activeBackground": "rgba(191,191,191,0.35)",
              "editor.findMatchBackground": "#ff963288",
              "editor.findMatchHighlightBackground": "#ff963233",
              "minimap.background": "#141520",
            },
          });

          // ── Custom light theme ──
          monaco.editor.defineTheme("lignis-light", {
            base: "vs", inherit: true,
            rules: [
              { token: "comment", foreground: "008000", fontStyle: "italic" },
              { token: "keyword", foreground: "0000FF" },
              { token: "string", foreground: "A31515" },
              { token: "number", foreground: "098658" },
              { token: "type", foreground: "267F99" },
              { token: "function", foreground: "795E26" },
            ],
            colors: {
              "editor.background": "#fafafa",
              "editor.foreground": "#1a1a1a",
              "editor.lineHighlightBackground": "#f0f0f0",
              "editor.selectionBackground": "#add6ff",
              "editorLineNumber.foreground": "#237893",
              "editorLineNumber.activeForeground": "#000000",
              "editorIndentGuide.background": "#d3d3d3",
              "editorIndentGuide.activeBackground": "#939393",
              "editorWidget.background": "#f3f3f3",
              "editorWidget.border": "#d4d4d4",
            },
          });

          // ── Create editor ──
          const SM = typeof SettingsManager !== "undefined" ? SettingsManager : null;
          const opts = {
            value: "", language: "plaintext", theme: "lignis-dark",
            fontSize: SM ? SM.get("fontSize") : 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            fontLigatures: SM ? SM.get("ligatures") : false,
            lineNumbers: "on",
            wordWrap: "off",
            minimap: { enabled: SM ? SM.get("minimap") : false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: SM ? SM.get("tabSize") : 4,
            insertSpaces: SM ? SM.get("useSpaces") : true,
            renderWhitespace: SM ? SM.get("renderWhitespace") || "selection" : "selection",
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            cursorStyle: SM ? SM.get("cursorStyle") || "line" : "line",
            padding: { top: 8 },
            suggest: { showWords: false },
            quickSuggestions: false,
            fixedOverflowWidgets: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoClosingOvertype: "always",
            autoIndent: "advanced",
            formatOnPaste: false,
            formatOnType: false,
            links: true,
            occurrencesHighlight: "singleFile",
            selectionHighlight: true,
            folding: true,
            foldingStrategy: "auto",
            showFoldingControls: "mouseover",
            renderLineHighlight: "all",
            lineHeight: SM ? parseFloat(SM.get("lineHeight")) || 1.5 : 1.5,
            multiCursorModifier: "alt",
            columnSelection: false,
            contextmenu: false,
          };

          try {
            editor = monaco.editor.create(document.getElementById("editor"), opts);
          } catch (err) {
            markFail(new Error(`Falha ao criar editor: ${err.message}`));
            return;
          }

          // ── Validate editor was created ──
          if (!editor || !editor.getModel()) {
            markFail(new Error("Editor criado mas model não está disponível."));
            return;
          }

          // ── Ctrl+Scroll zoom ──
          editor.onMouseWheel((e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault(); e.stopPropagation();
              const delta = e.deltaY > 0 ? -2 : 2;
              const cs = editor.getOption(monaco.editor.EditorOption.fontSize);
              const ns = Math.max(8, Math.min(40, cs + delta));
              if (ns !== cs) {
                editor.updateOptions({ fontSize: ns });
                if (typeof SettingsManager !== "undefined") SettingsManager.set("fontSize", ns);
                if (typeof StatusBar !== "undefined") StatusBar.updateZoom(Math.round((ns / 14) * 100));
                const d = document.getElementById("font-size-display");
                if (d) d.textContent = ns + "px";
              }
            }
          });

          // Register LignisCommands completion provider
          if (typeof LignisCommands !== "undefined") {
            LignisCommands.registerCompletionProvider(monaco);
          }

          // Register HTML auto-close and linked editing
          registerHtmlLanguageFeatures(monaco);

          markDone();
        }, function (err) {
          console.error("[STARTUP] Monaco falhou ao carregar módulos:", err);
          markFail(new Error("Monaco Editor não pôde ser carregado. Reinstale o Lignis ou verifique os arquivos do editor."));
        });
      } catch (err) {
        console.error("[STARTUP] require() threw synchronously:", err);
        markFail(err);
      }

    });
    return initPromise;
  }

  /** Register enhanced HTML language features: auto-close tags, linked editing */
  function registerHtmlLanguageFeatures(monaco) {
    if (!monaco) return;
    try {
      monaco.languages.html.htmlDefaults.options = {
        ...monaco.languages.html.htmlDefaults.options,
        autoClosingTags: true,
        autoClosingQuotes: "always",
        autoClosingBrackets: "always",
        linkedEditing: true,
      };
    } catch (_) { /* HTML language may not be registered yet */ }
  }

  function createModel(tabId, content, language, filename) {
    const lang = filename ? getLanguageFromFilename(filename) : (language || "plaintext");
    const uri = monaco.Uri.parse(`inmemory://model/${tabId}`);
    const model = monaco.editor.createModel(content || "", lang, uri);
    models.set(tabId, model);
    return model;
  }

  function switchToModel(tabId) {
    if (!editor) return;
    const model = models.get(tabId);
    if (model) { editor.setModel(model); currentModel = model; currentTabId = tabId; editor.focus(); }
  }

  function removeModel(tabId) {
    const model = models.get(tabId);
    if (model) {
      if (currentModel === model) { currentModel = null; currentTabId = null; }
      model.dispose(); models.delete(tabId);
    }
  }

  function getValue() { return currentModel ? currentModel.getValue() : ""; }
  function setValue(content) { if (currentModel) currentModel.setValue(content); }
  function getModel() { return currentModel; }
  function getEditor() { return editor; }

  function setTheme(theme) { if (editor) editor.updateOptions({ theme: theme === "light" ? "lignis-light" : "lignis-dark" }); }
  function setFontSize(size) { if (editor) editor.updateOptions({ fontSize: size }); }
  function setTabSize(size) { if (editor) { editor.updateOptions({ tabSize: size }); if (currentModel) currentModel.updateOptions({ tabSize: size }); } }
  function setWordWrap(enabled) { if (editor) editor.updateOptions({ wordWrap: enabled ? "on" : "off" }); }
  function setLineNumbers(enabled) { if (editor) editor.updateOptions({ lineNumbers: enabled ? "on" : "off" }); }
  function setHighlightLine(enabled) { if (editor) editor.updateOptions({ renderLineHighlight: enabled ? "all" : "none" }); }
  function setInsertSpaces(enabled) { if (editor) editor.updateOptions({ insertSpaces: enabled }); }
  function setReadOnly(enabled) { if (editor) editor.updateOptions({ readOnly: enabled }); }
  function setMinimap(enabled) { if (editor) editor.updateOptions({ minimap: { enabled } }); }
  function setLigatures(enabled) { if (editor) editor.updateOptions({ fontLigatures: enabled }); }
  function setCursorStyle(style) { if (editor) editor.updateOptions({ cursorStyle: style }); }
  function setLineHeight(ratio) { if (editor) editor.updateOptions({ lineHeight: ratio }); }
  function setRenderWhitespace(mode) { if (editor) editor.updateOptions({ renderWhitespace: mode }); }
  function setAutoClosePairs(enabled) {
    if (editor) editor.updateOptions({ autoClosingBrackets: enabled ? "always" : "never", autoClosingQuotes: enabled ? "always" : "never" });
  }

  function updateLanguage(tabId, filename) {
    const model = models.get(tabId);
    if (model && filename) { monaco.editor.setModelLanguage(model, getLanguageFromFilename(filename)); }
  }

  function focus() { if (editor) editor.focus(); }
  function undo() { if (editor) editor.trigger("keyboard", "undo"); }
  function redo() { if (editor) editor.trigger("keyboard", "redo"); }
  function find() { if (editor) editor.trigger("keyboard", "actions.find"); }

  function getSelection() { return editor ? editor.getModel().getValueInRange(editor.getSelection()) : ""; }
  function hasSelection() { return editor ? !editor.getSelection().isEmpty() : false; }
  function replaceSelection(text) { if (editor) editor.executeEdits("replace", [{ range: editor.getSelection(), text }]); }
  function insertText(text) {
    if (!editor) return;
    const p = editor.getPosition();
    editor.executeEdits("insert", [{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text }]);
  }

  function goToLine(lineNumber) {
    if (!editor) return;
    const lc = editor.getModel().getLineCount();
    lineNumber = Math.max(1, Math.min(lineNumber, lc));
    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column: 1 });
    editor.focus();
  }

  function goToPosition(lineNumber, column) {
    if (!editor) return;
    const m = editor.getModel(), lc = m.getLineCount();
    lineNumber = Math.max(1, Math.min(lineNumber, lc));
    column = Math.max(1, Math.min(column, m.getLineMaxColumn(lineNumber)));
    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column });
    editor.focus();
  }

  function duplicateLine() {
    if (!editor) return;
    const s = editor.getSelection(), m = editor.getModel(), ops = [];
    for (let l = s.startLineNumber; l <= s.endLineNumber; l++) {
      ops.push({ range: new monaco.Range(l, m.getLineMaxColumn(l), l, m.getLineMaxColumn(l)), text: "\n" + m.getLineContent(l) });
    }
    editor.executeEdits("duplicate-line", ops);
  }

  function deleteLine() {
    if (!editor) return;
    const s = editor.getSelection(), m = editor.getModel();
    let r;
    if (s.endLineNumber < m.getLineCount()) r = new monaco.Range(s.startLineNumber, 1, s.endLineNumber + 1, 1);
    else if (s.startLineNumber > 1) r = new monaco.Range(s.startLineNumber - 1, m.getLineMaxColumn(s.startLineNumber - 1), s.endLineNumber, m.getLineMaxColumn(s.endLineNumber));
    else r = new monaco.Range(s.startLineNumber, 1, s.endLineNumber, m.getLineMaxColumn(s.endLineNumber));
    editor.executeEdits("delete-line", [{ range: r, text: "" }]);
  }

  function moveLineUp() { if (editor) editor.trigger("keyboard", "editor.action.moveLinesUpAction"); }
  function moveLineDown() { if (editor) editor.trigger("keyboard", "editor.action.moveLinesDownAction"); }
  function toggleComment() { if (editor) editor.trigger("keyboard", "editor.action.commentLine"); }

  function selectNextOccurrence() { if (editor) editor.trigger("keyboard", "editor.action.addSelectionToNextFindMatch"); }

  function zoomIn() { if (!editor) return; const s = editor.getOption(monaco.editor.EditorOption.fontSize); editor.updateOptions({ fontSize: Math.min(s + 2, 40) }); return editor.getOption(monaco.editor.EditorOption.fontSize); }
  function zoomOut() { if (!editor) return; const s = editor.getOption(monaco.editor.EditorOption.fontSize); editor.updateOptions({ fontSize: Math.max(s - 2, 8) }); return editor.getOption(monaco.editor.EditorOption.fontSize); }
  function zoomReset() { if (!editor) return; editor.updateOptions({ fontSize: 14 }); return 14; }

  function getCursorPosition() { return editor ? editor.getPosition() : { lineNumber: 1, column: 1 }; }
  function getLineCount() { return currentModel ? currentModel.getLineCount() : 0; }
  function getCharacterCount() { return currentModel ? currentModel.getValueLength() : 0; }
  function getWordCount() { if (!currentModel) return 0; const t = currentModel.getValue(); return t.trim() ? t.trim().split(/\s+/).length : 0; }
  function getSelectedCharCount() { if (!editor) return 0; const s = editor.getSelection(); return s && !s.isEmpty() ? editor.getModel().getValueInRange(s).length : 0; }
  function getModelForTab(tabId) { return models.get(tabId); }
  function executeEdits(source, edits) { if (editor) editor.executeEdits(source, edits); }
  function onDidChangeCursorSelection(cb) { if (editor) editor.onDidChangeCursorSelection(cb); }
  function onDidChangeModelContent(cb) { if (editor) editor.onDidChangeModelContent(cb); }
  function layout() { if (editor) editor.layout(); }
  function getIndentationInfo() { if (!currentModel) return { type: "spaces", size: 4 }; const t = currentModel.getValue(); const tabCount = (t.match(/\t/g) || []).length; const spaceMatch = t.match(/^ {2,}/gm); const avgSpace = spaceMatch ? Math.round(spaceMatch.reduce((a, b) => a + b.length, 0) / spaceMatch.length) : 4; return tabCount > spaceMatch?.length ? { type: "tabs", size: 1 } : { type: "spaces", size: avgSpace }; }

  function updateCommandsDecorations() {
    if (editor && currentModel && typeof LignisCommands !== "undefined") {
      LignisCommands.updateDecorations(editor, currentModel);
    }
  }

  function getMonacoState() { return monacoState; }
  function getMonacoError() { return monacoError; }

  return {
    init, createModel, switchToModel, removeModel,
    getValue, setValue, getModel, getEditor,
    setTheme, setFontSize, setTabSize, setWordWrap,
    setLineNumbers, setHighlightLine, setInsertSpaces,
    setAutoClosePairs, setReadOnly,
    setMinimap, setLigatures, setCursorStyle, setLineHeight, setRenderWhitespace,
    updateLanguage, detectLanguage, getLanguageFromFilename,
    focus, undo, redo, find, getSelection, hasSelection,
    replaceSelection, insertText,
    goToLine, goToPosition,
    duplicateLine, deleteLine, moveLineUp, moveLineDown, toggleComment, selectNextOccurrence,
    zoomIn, zoomOut, zoomReset,
    getCursorPosition, getLineCount, getCharacterCount, getWordCount, getSelectedCharCount, getIndentationInfo,
    getModelForTab, executeEdits,
    onDidChangeCursorSelection, onDidChangeModelContent, layout,
    updateCommandsDecorations,
    getMonacoState, getMonacoError,
  };
})();
