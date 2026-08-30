// ========================================
// Lignis v3.0.0 - Text Tools
// ========================================

const TextTools = (function () {

  // ─── JSON ────────────────────────────────
  function formatJSON() {
    const sel = EditorManager.getSelection();
    let text = sel || EditorManager.getValue();
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, SettingsManager.get("tabSize") || 4);
      sel ? EditorManager.replaceSelection(formatted) : EditorManager.setValue(formatted);
      App.showToast("JSON formatado.", "success");
    } catch (e) {
      App.showToast(`JSON inválido. ${e.message}`, "error");
    }
  }

  function minifyJSON() {
    const sel = EditorManager.getSelection();
    let text = sel || EditorManager.getValue();
    try {
      const minified = JSON.stringify(JSON.parse(text));
      sel ? EditorManager.replaceSelection(minified) : EditorManager.setValue(minified);
      App.showToast("JSON minificado.", "success");
    } catch (e) { App.showToast(`JSON inválido. ${e.message}`, "error"); }
  }

  function validateJSON() {
    const sel = EditorManager.getSelection();
    let text = sel || EditorManager.getValue();
    try {
      JSON.parse(text);
      App.showToast("JSON válido ✓", "success");
    } catch (e) {
      let msg = e.message;
      const m = msg.match(/position\s+(\d+)/i);
      if (m) { const pos = parseInt(m[1]); const lines = text.substring(0, pos).split("\n"); msg += ` (linha ${lines.length}, coluna ${lines[lines.length - 1].length + 1})`; }
      App.showToast(`JSON inválido: ${msg}`, "error");
    }
  }

  // ─── Case ────────────────────────────────
  function toUpperCase() { const s = EditorManager.getSelection(); if (s) EditorManager.replaceSelection(s.toUpperCase()); }
  function toLowerCase() { const s = EditorManager.getSelection(); if (s) EditorManager.replaceSelection(s.toLowerCase()); }
  function toTitleCase() {
    const s = EditorManager.getSelection();
    if (s) EditorManager.replaceSelection(s.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
  }
  function toggleCase() {
    const s = EditorManager.getSelection();
    if (s) EditorManager.replaceSelection(s.split("").map(c => c === c.toUpperCase() && c !== c.toLowerCase() ? c.toLowerCase() : c === c.toLowerCase() && c !== c.toUpperCase() ? c.toUpperCase() : c).join(""));
  }

  // ─── Sorting ─────────────────────────────
  function sortLinesAZ() { _sortLines((a, b) => a.localeCompare(b, "pt-BR")); App.showToast("Linhas ordenadas A-Z.", "success"); }
  function sortLinesZA() { _sortLines((a, b) => b.localeCompare(a, "pt-BR")); App.showToast("Linhas ordenadas Z-A.", "success"); }
  function sortLinesNumeric(asc) {
    const sel = EditorManager.getSelection();
    const text = sel || (EditorManager.getModel() ? EditorManager.getValue() : "");
    if (!text) return;
    const lines = text.split("\n");
    const num = lines.filter(l => l.trim() !== "" && !isNaN(parseFloat(l.trim()))).sort((a, b) => asc ? parseFloat(a) - parseFloat(b) : parseFloat(b) - parseFloat(a));
    const non = lines.filter(l => l.trim() === "" || isNaN(parseFloat(l.trim())));
    const result = [...num, ...non];
    sel ? EditorManager.replaceSelection(result.join("\n")) : EditorManager.setValue(result.join("\n"));
    App.showToast(`Ordenado numericamente (${asc ? "crescente" : "decrescente"}).`, "success");
  }
  function sortLinesNatural(asc) {
    _sortLines((a, b) => {
      const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      return asc ? cmp : -cmp;
    });
    App.showToast(`Ordenação natural ${asc ? "crescente" : "decrescente"}.`, "success");
  }
  function _sortLines(cmp) {
    const sel = EditorManager.getSelection();
    if (sel) { EditorManager.replaceSelection(sel.split("\n").sort(cmp).join("\n")); }
    else { const m = EditorManager.getModel(); if (m) EditorManager.setValue(m.getValue().split("\n").sort(cmp).join("\n")); }
  }

  // ─── Line Operations ─────────────────────
  function removeDuplicateLines() {
    const sel = EditorManager.getSelection();
    if (sel) {
      const seen = new Set();
      const unique = sel.split("\n").filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
      EditorManager.replaceSelection(unique.join("\n"));
      App.showToast(`${sel.split("\n").length - unique.length} linha(s) duplicada(s) removida(s).`, "success");
    } else {
      const m = EditorManager.getModel(); if (!m) return;
      const seen = new Set();
      EditorManager.setValue(m.getValue().split("\n").filter(l => { if (seen.has(l)) return false; seen.add(l); return true; }).join("\n"));
      App.showToast("Linhas duplicadas removidas.", "success");
    }
  }
  function removeEmptyLines() {
    const sel = EditorManager.getSelection();
    if (sel) { EditorManager.replaceSelection(sel.split("\n").filter(l => l.trim() !== "").join("\n")); }
    else { const m = EditorManager.getModel(); if (m) EditorManager.setValue(m.getValue().split("\n").filter(l => l.trim() !== "").join("\n")); }
    App.showToast("Linhas vazias removidas.", "success");
  }
  function trimTrailingSpaces() {
    const sel = EditorManager.getSelection();
    if (sel) { EditorManager.replaceSelection(sel.split("\n").map(l => l.replace(/\s+$/, "")).join("\n")); }
    else { const m = EditorManager.getModel(); if (m) EditorManager.setValue(m.getValue().split("\n").map(l => l.replace(/\s+$/, "")).join("\n")); }
    App.showToast("Espaços extras removidos.", "success");
  }
  function tabsToSpaces() {
    const sp = " ".repeat(SettingsManager.get("tabSize") || 4);
    const sel = EditorManager.getSelection();
    if (sel) EditorManager.replaceSelection(sel.replace(/\t/g, sp));
    else { const m = EditorManager.getModel(); if (m) EditorManager.setValue(m.getValue().replace(/\t/g, sp)); }
    App.showToast("Tabs convertidos em espaços.", "success");
  }
  function spacesToTabs() {
    const p = new RegExp(` {${SettingsManager.get("tabSize") || 4}}`, "g");
    const sel = EditorManager.getSelection();
    if (sel) EditorManager.replaceSelection(sel.replace(p, "\t"));
    else { const m = EditorManager.getModel(); if (m) EditorManager.setValue(m.getValue().replace(p, "\t")); }
    App.showToast("Espaços convertidos em tabs.", "success");
  }
  function trimFinalNewline() {
    const m = EditorManager.getModel(); if (!m) return;
    let t = m.getValue();
    if (!t.endsWith("\n")) { EditorManager.setValue(t + "\n"); App.showToast("Nova linha final adicionada.", "success"); }
    else App.showToast("Documento já termina com nova linha.", "info");
  }
  function normalizeLineEndings() {
    const m = EditorManager.getModel(); if (!m) return;
    EditorManager.setValue(m.getValue().replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
    App.showToast("Quebras de linha normalizadas.", "success");
  }

  // ─── Escape / Unescape ───────────────────
  function escapeText() {
    const s = EditorManager.getSelection();
    if (s) EditorManager.replaceSelection(s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"));
  }
  function unescapeText() {
    const s = EditorManager.getSelection();
    if (s) EditorManager.replaceSelection(s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }

  // ─── Base64 ──────────────────────────────
  function encodeBase64() {
    const s = EditorManager.getSelection();
    if (!s) return;
    try { EditorManager.replaceSelection(btoa(unescape(encodeURIComponent(s)))); App.showToast("Codificado em Base64.", "success"); }
    catch (e) { App.showToast("Erro ao codificar Base64.", "error"); }
  }
  function decodeBase64() {
    const s = EditorManager.getSelection();
    if (!s) return;
    try { EditorManager.replaceSelection(decodeURIComponent(escape(atob(s)))); App.showToast("Decodificado de Base64.", "success"); }
    catch (e) { App.showToast("Base64 inválido.", "error"); }
  }

  // ─── URL Encode/Decode ───────────────────
  function encodeURL() {
    const s = EditorManager.getSelection();
    if (s) { EditorManager.replaceSelection(encodeURIComponent(s)); App.showToast("URL codificado.", "success"); }
  }
  function decodeURL() {
    const s = EditorManager.getSelection();
    if (s) try { EditorManager.replaceSelection(decodeURIComponent(s)); App.showToast("URL decodificado.", "success"); }
    catch (e) { App.showToast("URL inválido.", "error"); }
  }

  // ─── HTML Escape/Unescape ────────────────
  function escapeHTML() {
    const s = EditorManager.getSelection();
    if (s) EditorManager.replaceSelection(s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"));
  }
  function unescapeHTML() {
    const s = EditorManager.getSelection();
    if (s) { const d = document.createElement("div"); d.innerHTML = s; EditorManager.replaceSelection(d.textContent); }
  }

  // ─── Insert Utilities ────────────────────
  function insertTimestamp() {
    const n = new Date(); const pad = v => String(v).padStart(2, "0");
    EditorManager.insertText(`${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`);
    App.showToast("Data e hora inseridas.", "success");
  }
  function insertDate() {
    const n = new Date(); const pad = v => String(v).padStart(2, "0");
    EditorManager.insertText(`${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`);
    App.showToast("Data inserida.", "success");
  }
  function insertTime() {
    const n = new Date(); const pad = v => String(v).padStart(2, "0");
    EditorManager.insertText(`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`);
    App.showToast("Hora inserida.", "success");
  }
  function insertISO() { EditorManager.insertText(new Date().toISOString()); App.showToast("ISO 8601 inserido.", "success"); }
  function insertUUID() {
    const uuid = crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
    EditorManager.insertText(uuid);
    App.showToast("UUID inserido.", "success");
  }
  function copyUUID() {
    const uuid = crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
    navigator.clipboard.writeText(uuid).then(() => App.showToast("UUID copiado.", "success"));
  }

  function copyAsJSONString() {
    const s = EditorManager.getSelection();
    if (s) navigator.clipboard.writeText(JSON.stringify(s)).then(() => App.showToast("Copiado como JSON String.", "success"));
  }

  // ─── Bookmarks ───────────────────────────
  const bookmarks = [];
  function toggleBookmark() {
    const pos = EditorManager.getCursorPosition();
    const idx = bookmarks.findIndex(b => b.line === pos.lineNumber);
    if (idx >= 0) { bookmarks.splice(idx, 1); App.showToast(`Bookmark removido da linha ${pos.lineNumber}.`, "info"); }
    else { bookmarks.push({ line: pos.lineNumber, tabId: TabManager.getActiveTabId() }); App.showToast(`Bookmark adicionado na linha ${pos.lineNumber}.`, "info"); }
  }
  function nextBookmark() {
    const currentLine = EditorManager.getCursorPosition().lineNumber;
    const tabId = TabManager.getActiveTabId();
    const tabBookmarks = bookmarks.filter(b => b.tabId === tabId).sort((a, b) => a.line - b.line);
    const next = tabBookmarks.find(b => b.line > currentLine) || tabBookmarks[0];
    if (next) EditorManager.goToLine(next.line);
  }
  function prevBookmark() {
    const currentLine = EditorManager.getCursorPosition().lineNumber;
    const tabId = TabManager.getActiveTabId();
    const tabBookmarks = bookmarks.filter(b => b.tabId === tabId).sort((a, b) => b.line - a.line);
    const prev = tabBookmarks.find(b => b.line < currentLine) || tabBookmarks[0];
    if (prev) EditorManager.goToLine(prev.line);
  }
  function getBookmarks() { return bookmarks; }

  return {
    formatJSON, minifyJSON, validateJSON,
    toUpperCase, toLowerCase, toTitleCase, toggleCase,
    sortLinesAZ, sortLinesZA, sortLinesNumeric, sortLinesNatural,
    removeDuplicateLines, removeEmptyLines, trimTrailingSpaces,
    tabsToSpaces, spacesToTabs, trimFinalNewline, normalizeLineEndings,
    escapeText, unescapeText,
    encodeBase64, decodeBase64, encodeURL, decodeURL,
    escapeHTML, unescapeHTML,
    insertTimestamp, insertDate, insertTime, insertISO,
    insertUUID, copyUUID, copyAsJSONString,
    toggleBookmark, nextBookmark, prevBookmark, getBookmarks,
  };
})();
