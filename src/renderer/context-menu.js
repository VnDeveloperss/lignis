// ========================================
// Lignis - Context Menus
// ========================================

const ContextMenuManager = (function () {
  function init() {
    const editorContainer = document.getElementById("editor-container");
    editorContainer.addEventListener("contextmenu", (e) => {
      if (e.target.closest("#markdown-preview")) return;
      e.preventDefault();
      showEditorContextMenu(e.clientX, e.clientY);
    });

    document.addEventListener("click", () => hideAllMenus());
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".menu-popup")) hideAllMenus();
    });
  }

  function showEditorContextMenu(x, y) {
    const menu = document.getElementById("context-menu");
    const items = document.getElementById("context-menu-items");
    const L = typeof Locale !== "undefined" ? Locale : { t: (k) => k };
    const hasSelection = EditorManager.hasSelection();

    items.innerHTML = `
      <div class="menu-item" data-action="undo"><span class="menu-item-label">${L.t("editorCtx.undo")}</span><span class="menu-item-shortcut">Ctrl+Z</span></div>
      <div class="menu-item" data-action="redo"><span class="menu-item-label">${L.t("editorCtx.redo")}</span><span class="menu-item-shortcut">Ctrl+Shift+Z</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="cut"><span class="menu-item-label">${L.t("editorCtx.cut")}</span><span class="menu-item-shortcut">Ctrl+X</span></div>
      <div class="menu-item" data-action="copy"><span class="menu-item-label">${L.t("editorCtx.copy")}</span><span class="menu-item-shortcut">Ctrl+C</span></div>
      <div class="menu-item" data-action="paste"><span class="menu-item-label">${L.t("editorCtx.paste")}</span><span class="menu-item-shortcut">Ctrl+V</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="selectAll"><span class="menu-item-label">${L.t("editorCtx.selectAll")}</span><span class="menu-item-shortcut">Ctrl+A</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="duplicateLine"><span class="menu-item-label">${L.t("editorCtx.duplicateLine")}</span><span class="menu-item-shortcut">Ctrl+D</span></div>
      <div class="menu-item" data-action="deleteLine"><span class="menu-item-label">${L.t("editorCtx.deleteLine")}</span><span class="menu-item-shortcut">Ctrl+Shift+K</span></div>
      <div class="menu-item" data-action="toggleComment"><span class="menu-item-label">${L.t("editorCtx.toggleComment")}</span><span class="menu-item-shortcut">Ctrl+/</span></div>
      <div class="menu-separator"></div>
      ${hasSelection ? `
      <div class="menu-item" data-action="searchSelection"><span class="menu-item-label">${L.t("editorCtx.searchSelection")}</span><span class="menu-item-shortcut">Ctrl+F</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="uppercase"><span class="menu-item-label">${L.t("editorCtx.uppercase")}</span></div>
      <div class="menu-item" data-action="lowercase"><span class="menu-item-label">${L.t("editorCtx.lowercase")}</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="copyJsonString"><span class="menu-item-label">${L.t("editorCtx.copyAsJSON")}</span></div>
      ` : ""}
      <div class="menu-separator"></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="executeNovaCommand"><span class="menu-item-label"><i class="fa-solid fa-terminal menu-item-icon"></i> Executar comando Lignis</span><span class="menu-item-shortcut">Ctrl+Enter</span></div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="insertTimestamp"><span class="menu-item-label">${L.t("editorCtx.insertTimestamp")}</span></div>
      <div class="menu-item" data-action="insertUUID"><span class="menu-item-label">${L.t("editorCtx.insertUUID")}</span></div>
    `;

    showMenu(menu, x, y);

    const handler = (e) => {
      const item = e.target.closest(".menu-item");
      if (!item) return;
      const action = item.dataset.action;
      hideMenu(menu);
      document.removeEventListener("click", handler);

      switch (action) {
        case "undo": EditorManager.undo(); break;
        case "redo": EditorManager.redo(); break;
        case "cut": document.execCommand("cut"); break;
        case "copy": document.execCommand("copy"); break;
        case "paste": document.execCommand("paste"); break;
        case "selectAll": {
          const ed = EditorManager.getEditor();
          if (ed) ed.setSelection(ed.getModel().getFullModelRange());
          break;
        }
        case "duplicateLine": EditorManager.duplicateLine(); break;
        case "deleteLine": EditorManager.deleteLine(); break;
        case "toggleComment": EditorManager.toggleComment(); break;
        case "searchSelection": SearchManager.open(false); break;
        case "uppercase": TextTools.toUpperCase(); break;
        case "lowercase": TextTools.toLowerCase(); break;
        case "copyJsonString": TextTools.copyAsJSONString(); break;
        case "executeNovaCommand": App.executeCommand(); break;
        case "insertTimestamp": TextTools.insertTimestamp(); break;
        case "insertUUID": TextTools.insertUUID(); break;
      }
    };

    setTimeout(() => {
      document.addEventListener("click", handler, { once: true });
    }, 0);
  }

  function showMenu(menu, x, y) {
    menu.classList.remove("hidden");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.zIndex = (typeof FloatingUIManager !== "undefined") ? FloatingUIManager.getZIndex("CONTEXT_MENU") : 6000;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + "px";
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + "px";
    });
  }

  function hideMenu(menu) { menu.classList.add("hidden"); }

  function hideAllMenus() {
    document.querySelectorAll(".menu-popup").forEach((m) => m.classList.add("hidden"));
  }

  return { init };
})();
