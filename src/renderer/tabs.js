// ========================================
// Lignis - Tab Management System
// ========================================

const TabManager = (function () {
  let tabs = [];
  let activeTabId = null;
  let untitledCounter = 0;
  const onTabChangeCallbacks = [];

  function generateId() {
    return "tab_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  }

  function createTab(options = {}) {
    const id = generateId();
    const tab = {
      id,
      path: options.path || null,
      name: options.name || getNextUntitledName(),
      content: options.content || "",
      savedContent: options.content || "",
      isDirty: false,
      encoding: options.encoding || "utf-8",
      lineEnding: options.lineEnding || "LF",
      language: options.language || null,
      pinned: false,
      readOnly: false,
      lastMtime: null,
    };

    tabs.push(tab);
    EditorManager.createModel(id, tab.content, tab.language, tab.name);
    renderTab(tab);
    switchToTab(id);
    notifyTabChange();
    return tab;
  }

  function getNextUntitledName() {
    untitledCounter++;
    if (untitledCounter === 1) return "Sem título";
    return `Sem título ${untitledCounter}`;
  }

  function renderTab(tab) {
    const container = document.getElementById("tabs-container");
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.id = `tab-${tab.id}`;
    tabEl.dataset.tabId = tab.id;

    tabEl.innerHTML = `
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      <span class="tab-dirty"></span>
      <button class="tab-close" title="Fechar" aria-label="Fechar aba">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/>
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    `;

    // Tooltip with full path
    tabEl.title = tab.path || tab.name;

    // Click to switch
    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close")) return;
      switchToTab(tab.id);
    });

    // Middle click to close
    tabEl.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    // Double click to pin/unpin
    tabEl.addEventListener("dblclick", (e) => {
      if (e.target.closest(".tab-close")) return;
      togglePin(tab.id);
    });

    // Right click context menu
    tabEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      switchToTab(tab.id);
      showTabContextMenu(e, tab.id);
    });

    // Close button
    tabEl.querySelector(".tab-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    // Drag and drop reordering
    tabEl.draggable = true;
    tabEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", tab.id);
      e.dataTransfer.effectAllowed = "move";
      tabEl.classList.add("dragging");
    });
    tabEl.addEventListener("dragend", () => {
      tabEl.classList.remove("dragging");
      document.querySelectorAll(".tab.drag-over").forEach(el => el.classList.remove("drag-over"));
    });
    tabEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      tabEl.classList.add("drag-over");
    });
    tabEl.addEventListener("dragleave", () => {
      tabEl.classList.remove("drag-over");
    });
    tabEl.addEventListener("drop", (e) => {
      e.preventDefault();
      tabEl.classList.remove("drag-over");
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId && draggedId !== tab.id) {
        reorderTab(draggedId, tab.id);
      }
    });

    container.appendChild(tabEl);
  }

  function reorderTab(draggedId, targetId) {
    const dragIdx = tabs.findIndex(t => t.id === draggedId);
    const targetIdx = tabs.findIndex(t => t.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;

    const [draggedTab] = tabs.splice(dragIdx, 1);
    tabs.splice(targetIdx, 0, draggedTab);

    // Reorder DOM elements
    const container = document.getElementById("tabs-container");
    const draggedEl = document.getElementById(`tab-${draggedId}`);
    const targetEl = document.getElementById(`tab-${targetId}`);
    if (draggedEl && targetEl) {
      if (dragIdx < targetIdx) {
        container.insertBefore(draggedEl, targetEl.nextSibling);
      } else {
        container.insertBefore(draggedEl, targetEl);
      }
    }
  }

  function moveTabLeft(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx <= 0) return;
    const prevTab = tabs[idx - 1];
    reorderTab(tabId, prevTab.id);
  }

  function moveTabRight(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1 || idx >= tabs.length - 1) return;
    const nextTab = tabs[idx + 1];
    reorderTab(tabId, nextTab.id);
  }

  function togglePin(tabId) {
    const tab = getTab(tabId);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (tabEl) tabEl.classList.toggle("pinned", tab.pinned);
    App.showToast(tab.pinned ? "Aba fixada." : "Aba desfixada.", "info");
  }

  function toggleReadOnly(tabId) {
    const tab = getTab(tabId || activeTabId);
    if (!tab) return;
    tab.readOnly = !tab.readOnly;
    if (tabId === activeTabId || !tabId) {
      EditorManager.setReadOnly(tab.readOnly);
    }
    const readonlyEl = document.getElementById("status-readonly");
    if (readonlyEl) {
      readonlyEl.classList.toggle("hidden", !tab.readOnly);
    }
    App.showToast(tab.readOnly ? "Modo somente leitura ativado." : "Modo somente leitura desativado.", "info");
  }

  function showTabContextMenu(e, tabId) {
    const menu = document.getElementById("tab-context-menu");
    const items = document.getElementById("tab-context-menu-items");
    const tab = getTab(tabId);
    if (!tab) return;

    const L = typeof Locale !== "undefined" ? Locale : { t: (k) => k };

    items.innerHTML = `
      <div class="menu-item" data-action="save"><span class="menu-item-label">${L.t("tabCtx.save")}</span><span class="menu-item-shortcut">Ctrl+S</span></div>
      <div class="menu-item" data-action="save-as"><span class="menu-item-label">${L.t("tabCtx.saveAs")}</span><span class="menu-item-shortcut">Ctrl+Shift+S</span></div>
      <div class="menu-item" data-action="reload"><span class="menu-item-label">${L.t("tabCtx.reload")}</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="close"><span class="menu-item-label">${L.t("tabCtx.close")}</span><span class="menu-item-shortcut">Ctrl+W</span></div>
      <div class="menu-item" data-action="close-others"><span class="menu-item-label">${L.t("tabCtx.closeOthers")}</span></div>
      <div class="menu-item" data-action="close-right"><span class="menu-item-label">${L.t("tabCtx.closeRight")}</span></div>
      <div class="menu-item" data-action="close-all"><span class="menu-item-label">${L.t("tabCtx.closeAll")}</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="pin"><span class="menu-item-label">${tab.pinned ? L.t("tabCtx.unpin") : L.t("tabCtx.pin")}</span></div>
      <div class="menu-item" data-action="readonly"><span class="menu-item-label">${tab.readOnly ? "Modo edição" : L.t("tabCtx.readOnly")}</span></div>
      <div class="menu-item" data-action="move-left"><span class="menu-item-label">${L.t("tabCtx.moveToLeft")}</span></div>
      <div class="menu-item" data-action="move-right"><span class="menu-item-label">${L.t("tabCtx.moveToRight")}</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="copy-path"><span class="menu-item-label">${L.t("tabCtx.copyPath")}</span></div>
      <div class="menu-item" data-action="copy-name"><span class="menu-item-label">${L.t("tabCtx.copyName")}</span></div>
      <div class="menu-item" data-action="copy-dir"><span class="menu-item-label">${L.t("tabCtx.copyDir")}</span></div>
      ${tab.path ? `<div class="menu-item" data-action="open-folder"><span class="menu-item-label">${L.t("tabCtx.openFolder")}</span></div>` : ""}
    `;

    menu.classList.remove("hidden");
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.style.zIndex = (typeof FloatingUIManager !== "undefined") ? FloatingUIManager.getZIndex("CONTEXT_MENU") : 6000;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + "px";
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + "px";
    });

    const handler = (ev) => {
      const item = ev.target.closest(".menu-item");
      if (!item || item.classList.contains("disabled")) return;
      const action = item.dataset.action;
      menu.classList.add("hidden");
      document.removeEventListener("click", handler);

      switch (action) {
        case "save": App.saveCurrentFile(); break;
        case "save-as": App.saveFileAs(); break;
        case "reload": App.reloadFile(tabId); break;
        case "close": closeTab(tabId); break;
        case "close-others": closeOtherTabs(tabId); break;
        case "close-right": closeTabsToRight(tabId); break;
        case "close-all": closeAllTabs(); break;
        case "pin": togglePin(tabId); break;
        case "readonly": toggleReadOnly(tabId); break;
        case "move-left": moveTabLeft(tabId); break;
        case "move-right": moveTabRight(tabId); break;
        case "copy-path":
          if (tab && tab.path) {
            navigator.clipboard.writeText(tab.path);
            App.showToast("Caminho copiado.", "success");
          }
          break;
        case "copy-name":
          if (tab) {
            navigator.clipboard.writeText(tab.name);
            App.showToast("Nome copiado.", "success");
          }
          break;
        case "copy-dir":
          if (tab && tab.path) {
            const dir = tab.path.replace(/[\\/][^\\/]+$/, "");
            navigator.clipboard.writeText(dir);
            App.showToast("Diretório copiado.", "success");
          }
          break;
        case "open-folder":
          if (tab && tab.path) window.lignisAPI.openPath(tab.path);
          break;
      }
    };

    setTimeout(() => {
      document.addEventListener("click", handler, { once: true });
      document.addEventListener("mousedown", (ev) => {
        if (!menu.contains(ev.target)) {
          menu.classList.add("hidden");
          document.removeEventListener("click", handler);
        }
      }, { once: true });
    }, 0);
  }

  function switchToTab(tabId) {
    const tab = getTab(tabId);
    if (!tab) return;

    if (activeTabId && activeTabId !== tabId) {
      saveCurrentTabState();
    }

    activeTabId = tabId;
    EditorManager.switchToModel(tabId);

    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.tabId === tabId);
    });

    // Sync readonly state
    EditorManager.setReadOnly(tab.readOnly);
    const readonlyEl = document.getElementById("status-readonly");
    if (readonlyEl) readonlyEl.classList.toggle("hidden", !tab.readOnly);

    updateWindowTitle(tab);
    notifyTabChange();
    EditorManager.focus();
  }

  function saveCurrentTabState() {
    if (!activeTabId) return;
    const tab = getTab(activeTabId);
    if (tab) tab.content = EditorManager.getValue();
  }

  function closeTab(tabId, force = false) {
    const tab = getTab(tabId);
    if (!tab) return;

    if (!force && tab.isDirty) {
      if (tabId === activeTabId) saveCurrentTabState();
      showUnsavedDialog(tab).then((result) => {
        if (result === "save") {
          App.saveFile(tabId).then((saved) => { if (saved) performClose(tabId); });
        } else if (result === "discard") {
          performClose(tabId);
        }
      });
      return;
    }
    performClose(tabId);
  }

  function performClose(tabId) {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    EditorManager.removeModel(tabId);
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (tabEl) tabEl.remove();
    tabs.splice(idx, 1);

    if (activeTabId === tabId) {
      activeTabId = null;
      if (tabs.length > 0) {
        const nextIdx = Math.min(idx, tabs.length - 1);
        switchToTab(tabs[nextIdx].id);
      } else {
        createTab();
      }
    }
    notifyTabChange();
  }

  function closeOtherTabs(keepTabId) {
    const toClose = tabs.filter((t) => t.id !== keepTabId && !t.pinned);
    toClose.forEach((t) => closeTab(t.id, true));
  }

  function closeTabsToRight(keepTabId) {
    const idx = tabs.findIndex((t) => t.id === keepTabId);
    if (idx === -1) return;
    const toClose = tabs.slice(idx + 1);
    toClose.forEach((t) => closeTab(t.id, true));
  }

  function closeAllTabs(force = false) {
    if (!force) {
      const dirtyTabs = tabs.filter((t) => t.isDirty);
      if (dirtyTabs.length > 0) {
        showUnsavedDialogMultiple(dirtyTabs).then((result) => {
          if (result === "save") {
            App.saveAllFiles().then(() => {
              while (tabs.length > 0) performClose(tabs[0].id);
              createTab();
            });
          } else if (result === "discard") {
            while (tabs.length > 0) performClose(tabs[0].id);
            createTab();
          }
        });
        return;
      }
    }
    while (tabs.length > 0) performClose(tabs[0].id);
    createTab();
  }

  function markDirty(tabId, isDirty) {
    const tab = getTab(tabId || activeTabId);
    if (!tab) return;
    tab.isDirty = isDirty;
    const dirtyEl = document.querySelector(`#tab-${tab.id} .tab-dirty`);
    if (dirtyEl) dirtyEl.classList.toggle("visible", isDirty);
    updateWindowTitle(tab);
  }

  function updateTabContent(tabId, content) {
    const tab = getTab(tabId || activeTabId);
    if (!tab) return;
    tab.content = content;
    tab.isDirty = content !== tab.savedContent;
    markDirty(tab.id, tab.isDirty);
  }

  function updateTabName(tabId, name, path) {
    const tab = getTab(tabId || activeTabId);
    if (!tab) return;
    tab.name = name;
    if (path !== undefined) tab.path = path;

    const nameEl = document.querySelector(`#tab-${tab.id} .tab-name`);
    if (nameEl) nameEl.textContent = name;

    const tabEl = document.getElementById(`tab-${tab.id}`);
    if (tabEl) tabEl.title = tab.path || tab.name;

    updateWindowTitle(tab);
  }

  function updateWindowTitle(tab) {
    if (!tab) tab = getActiveTab();
    if (!tab) return;
    const dirty = tab.isDirty ? " * " : " ";
    const title = `${tab.name}${dirty}— Lignis`;
    document.title = title;
  }

  function getActiveTab() { return getTab(activeTabId); }
  function getTab(tabId) { return tabs.find((t) => t.id === tabId); }
  function getAllTabs() { return tabs; }
  function getActiveTabId() { return activeTabId; }

  function markSaved(tabId) {
    const tab = getTab(tabId);
    if (!tab) return;
    tab.savedContent = tab.content;
    tab.isDirty = false;
    markDirty(tab.id, false);
  }

  function hasUnsavedChanges() { return tabs.some((t) => t.isDirty); }

  function getTabByPath(filePath) {
    return tabs.find(t => t.path && t.path === filePath);
  }

  function showUnsavedDialog(tab) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "unsaved-overlay";
      overlay.innerHTML = `
        <div class="unsaved-dialog">
          <div class="unsaved-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="var(--warning)" stroke-width="2" fill="none"/>
              <line x1="24" y1="12" x2="24" y2="28" stroke="var(--warning)" stroke-width="3" stroke-linecap="round"/>
              <circle cx="24" cy="34" r="2" fill="var(--warning)"/>
            </svg>
          </div>
          <h3>Deseja salvar as alterações?</h3>
          <p class="unsaved-filename">${escapeHtml(tab.name)}</p>
          <p class="unsaved-desc">O arquivo foi modificado mas não salvo.</p>
          <div class="unsaved-buttons">
            <button class="btn-primary" data-result="save">Salvar</button>
            <button class="btn-secondary" data-result="discard">Não salvar</button>
            <button class="btn-secondary" data-result="cancel">Cancelar</button>
          </div>
        </div>
      `;
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10002;
        display: flex; align-items: center; justify-content: center;
      `;
      const style = document.createElement("style");
      style.textContent = `
        .unsaved-dialog { background: var(--bg-secondary); border: 1px solid var(--border-light);
          border-radius: 10px; padding: 28px; text-align: center; min-width: 340px; box-shadow: var(--shadow-lg); }
        .unsaved-icon { margin-bottom: 12px; }
        .unsaved-dialog h3 { font-size: 16px; margin-bottom: 8px; color: var(--text-primary); }
        .unsaved-filename { color: var(--accent); font-weight: 500; margin-bottom: 4px; }
        .unsaved-desc { color: var(--text-muted); font-size: 12px; margin-bottom: 20px; }
        .unsaved-buttons { display: flex; gap: 8px; justify-content: center; }
      `;
      overlay.prepend(style);
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-result]");
        if (btn) { overlay.remove(); resolve(btn.dataset.result); }
      });

      const keyHandler = (e) => {
        if (e.key === "Escape") {
          overlay.remove();
          document.removeEventListener("keydown", keyHandler);
          resolve("cancel");
        }
      };
      document.addEventListener("keydown", keyHandler);
    });
  }

  function showUnsavedDialogMultiple(dirtyTabs) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      const fileNames = dirtyTabs.map((t) => `<li>${escapeHtml(t.name)}</li>`).join("");
      overlay.innerHTML = `
        <div class="unsaved-dialog">
          <div class="unsaved-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="var(--warning)" stroke-width="2" fill="none"/>
              <line x1="24" y1="12" x2="24" y2="28" stroke="var(--warning)" stroke-width="3" stroke-linecap="round"/>
              <circle cx="24" cy="34" r="2" fill="var(--warning)"/>
            </svg>
          </div>
          <h3>Existem ${dirtyTabs.length} arquivo(s) não salvo(s)</h3>
          <ul style="text-align:left;margin:8px 0 16px;padding-left:20px;color:var(--text-secondary)">${fileNames}</ul>
          <div class="unsaved-buttons">
            <button class="btn-primary" data-result="save">Salvar tudo</button>
            <button class="btn-secondary" data-result="discard">Não salvar</button>
            <button class="btn-secondary" data-result="cancel">Cancelar</button>
          </div>
        </div>
      `;
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10002;
        display: flex; align-items: center; justify-content: center;
      `;
      const style = document.createElement("style");
      style.textContent = `
        .unsaved-dialog { background: var(--bg-secondary); border: 1px solid var(--border-light);
          border-radius: 10px; padding: 28px; text-align: center; min-width: 340px; box-shadow: var(--shadow-lg); }
        .unsaved-icon { margin-bottom: 12px; }
        .unsaved-dialog h3 { font-size: 16px; margin-bottom: 8px; color: var(--text-primary); }
        .unsaved-buttons { display: flex; gap: 8px; justify-content: center; }
      `;
      overlay.prepend(style);
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-result]");
        if (btn) { overlay.remove(); resolve(btn.dataset.result); }
      });
    });
  }

  function onTabChange(callback) { onTabChangeCallbacks.push(callback); }
  function notifyTabChange() { onTabChangeCallbacks.forEach((cb) => cb(getActiveTab())); }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Session support
  function getSessionData() {
    return tabs.map(t => ({
      path: t.path,
      name: t.name,
      pinned: t.pinned,
      readOnly: t.readOnly,
      encoding: t.encoding,
      lineEnding: t.lineEnding,
    }));
  }

  return {
    createTab, switchToTab, closeTab, closeOtherTabs, closeTabsToRight,
    closeAllTabs, markDirty, markSaved, updateTabContent, updateTabName,
    updateWindowTitle, getActiveTab, getActiveTabId, getTab, getAllTabs,
    getTabByPath, hasUnsavedChanges, saveCurrentTabState,
    showUnsavedDialog, showUnsavedDialogMultiple,
    togglePin, toggleReadOnly, moveTabLeft, moveTabRight,
    onTabChange, getSessionData, escapeHtml,
  };
})();
