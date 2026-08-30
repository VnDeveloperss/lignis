// ========================================
// Lignis v3.5.0 - Extensions Panel
// Professional extensions management UI
// ========================================

const ExtensionsPanel = (function () {
  let currentFilter = "all"; // all | active | inactive | error
  let searchQuery = "";
  let selectedExtId = null;

  function init() {
    // Listen for extension state changes
    const api = window.lignisAPI;
    if (api && api.on) {
      api.on("ext-state-changed", (data) => {
        renderList();
        if (selectedExtId === data.id) renderDetail(data.id);
      });
    }
  }

  function escapeHtml(str) {
    try {
      const d = document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    } catch (_) { return String(str || ""); }
  }

  // ── Load & Render ──────────────────────

  async function open() {
    // Show extensions panel in main area
    let panel = document.getElementById("extensions-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "extensions-panel";
      panel.className = "extensions-panel";
      document.getElementById("editor-area").appendChild(panel);
    }
    panel.style.display = "";
    panel.innerHTML = renderHTML();
    bindEvents();
    await renderList();
    // Hide editor
    const ed = document.getElementById("editor-container");
    if (ed) ed.style.display = "none";
    setTimeout(() => { if (typeof EditorManager !== "undefined") EditorManager.layout(); }, 50);
  }

  function close() {
    const panel = document.getElementById("extensions-panel");
    if (panel) panel.style.display = "none";
    const ed = document.getElementById("editor-container");
    if (ed) ed.style.display = "";
    setTimeout(() => { if (typeof EditorManager !== "undefined") EditorManager.layout(); }, 50);
  }

  function renderHTML() {
    return `
      <div class="ext-header">
        <div class="ext-header-left">
          <h2><i class="fa-solid fa-puzzle-piece"></i> Extensões</h2>
        </div>
        <div class="ext-header-actions">
          <button class="ext-btn ext-btn-secondary" id="ext-import-btn" title="Instalar extensão de pasta">
            <i class="fa-solid fa-folder-plus"></i> Instalar
          </button>
          <button class="ext-btn ext-btn-secondary" id="ext-close-panel-btn" title="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
      <div class="ext-toolbar">
        <div class="ext-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="ext-search-input" placeholder="Buscar extensões..." autocomplete="off" spellcheck="false">
        </div>
        <div class="ext-filters">
          <button class="ext-filter-btn active" data-filter="all">Todas</button>
          <button class="ext-filter-btn" data-filter="active">Ativadas</button>
          <button class="ext-filter-btn" data-filter="inactive">Desativadas</button>
          <button class="ext-filter-btn" data-filter="error">Com erro</button>
        </div>
      </div>
      <div class="ext-body">
        <div class="ext-list" id="ext-list"></div>
        <div class="ext-detail" id="ext-detail" style="display:none;"></div>
      </div>
    `;
  }

  function bindEvents() {
    document.getElementById("ext-close-panel-btn")?.addEventListener("click", close);
    document.getElementById("ext-import-btn")?.addEventListener("click", importExtension);

    // Search
    document.getElementById("ext-search-input")?.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderList();
    });

    // Filters
    document.querySelectorAll(".ext-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll(".ext-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderList();
      });
    });
  }

  // ── List ──────────────────────────────

  async function renderList() {
    const listEl = document.getElementById("ext-list");
    if (!listEl) return;

    const result = await window.lignisAPI.extensionGetAll();
    if (!result.success) return;

    let extensions = result.data || [];

    // Filter
    if (currentFilter === "active") {
      extensions = extensions.filter(e => e.state === "active");
    } else if (currentFilter === "inactive") {
      extensions = extensions.filter(e => e.state === "disabled" || e.state === "installed");
    } else if (currentFilter === "error") {
      extensions = extensions.filter(e => e.state === "failed");
    }

    // Search
    if (searchQuery) {
      extensions = extensions.filter(e =>
        (e.displayName || "").toLowerCase().includes(searchQuery) ||
        (e.name || "").toLowerCase().includes(searchQuery) ||
        (e.publisher || "").toLowerCase().includes(searchQuery) ||
        (e.description || "").toLowerCase().includes(searchQuery) ||
        (e.id || "").toLowerCase().includes(searchQuery)
      );
    }

    if (extensions.length === 0) {
      listEl.innerHTML = `
        <div class="ext-empty">
          <i class="fa-solid fa-puzzle-piece"></i>
          <p>Nenhuma extensão encontrada.</p>
          <button class="ext-btn ext-btn-primary" id="ext-empty-import-btn">
            <i class="fa-solid fa-folder-plus"></i> Instalar extensão
          </button>
        </div>
      `;
      document.getElementById("ext-empty-import-btn")?.addEventListener("click", importExtension);
      return;
    }

    listEl.innerHTML = extensions.map(ext => renderCard(ext)).join("");

    // Bind card events
    listEl.querySelectorAll(".ext-card").forEach(card => {
      const id = card.dataset.extId;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".ext-card-btn")) return;
        selectExtension(id);
      });

      card.querySelectorAll(".ext-card-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          handleCardAction(id, btn.dataset.action);
        });
      });
    });
  }

  function renderCard(ext) {
    const stateClass = {
      active: "ext-state-active",
      installed: "ext-state-installed",
      disabled: "ext-state-disabled",
      failed: "ext-state-failed",
      activating: "ext-state-activating",
    }[ext.state] || "ext-state-installed";

    const stateLabel = {
      active: "Ativada",
      installed: "Instalada",
      disabled: "Desativada",
      failed: "Com erro",
      activating: "Ativando...",
    }[ext.state] || ext.state;

    const actionBtns = [];
    if (ext.state === "active") {
      actionBtns.push(`<button class="ext-card-btn" data-action="disable" title="Desativar"><i class="fa-solid fa-stop"></i></button>`);
      actionBtns.push(`<button class="ext-card-btn" data-action="reload" title="Recarregar"><i class="fa-solid fa-rotate-right"></i></button>`);
    } else if (ext.state === "disabled" || ext.state === "installed") {
      actionBtns.push(`<button class="ext-card-btn" data-action="enable" title="Ativar"><i class="fa-solid fa-play"></i></button>`);
    } else if (ext.state === "failed") {
      actionBtns.push(`<button class="ext-card-btn ext-card-btn-error" data-action="reload" title="Tentar novamente"><i class="fa-solid fa-rotate-right"></i></button>`);
      actionBtns.push(`<button class="ext-card-btn" data-action="disable" title="Desativar"><i class="fa-solid fa-stop"></i></button>`);
    }
    actionBtns.push(`<button class="ext-card-btn" data-action="uninstall" title="Desinstalar"><i class="fa-solid fa-trash"></i></button>`);

    return `
      <div class="ext-card ${stateClass} ${selectedExtId === ext.id ? 'ext-card-selected' : ''}" data-ext-id="${escapeHtml(ext.id)}">
        <div class="ext-card-main">
          <div class="ext-card-info">
            <div class="ext-card-title">
              <span class="ext-card-name">${escapeHtml(ext.displayName || ext.name)}</span>
              <span class="ext-card-version">${escapeHtml(ext.version)}</span>
            </div>
            <div class="ext-card-meta">
              <span class="ext-card-publisher">${escapeHtml(ext.publisher)}</span>
              <span class="ext-card-sep">·</span>
              <span class="ext-card-state ${stateClass}">${stateLabel}</span>
              ${ext.activateTime ? `<span class="ext-card-sep">·</span><span class="ext-card-time">${ext.activateTime}ms</span>` : ""}
            </div>
            <div class="ext-card-desc">${escapeHtml(ext.description || "")}</div>
            ${ext.error ? `<div class="ext-card-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(ext.error)}</div>` : ""}
          </div>
          <div class="ext-card-actions">
            ${actionBtns.join("")}
          </div>
        </div>
      </div>
    `;
  }

  // ── Detail View ──────────────────────

  async function selectExtension(id) {
    selectedExtId = id;
    renderDetail(id);
    renderList(); // update selected state
  }

  async function renderDetail(id) {
    const detailEl = document.getElementById("ext-detail");
    if (!detailEl) return;

    const result = await window.lignisAPI.extensionGet(id);
    if (!result.success || !result.data) {
      detailEl.style.display = "none";
      return;
    }

    const ext = result.data;
    detailEl.style.display = "";

    const stateLabel = {
      active: "Ativada", installed: "Instalada", disabled: "Desativada",
      failed: "Com erro", activating: "Ativando...",
    }[ext.state] || ext.state;

    const permHtml = (ext.permissions || []).map(p => {
      const info = { "workspace.read": "Ler workspace", "workspace.write": "Modificar workspace", "terminal.create": "Criar terminais", "terminal.sendText": "Enviar ao terminal", "network": "Internet", "clipboard": "Clipboard", "notifications": "Notificações", "editor": "Editor", "commands": "Comandos", "settings": "Configurações", "statusbar": "Barra de status", "views": "Painéis", "process.execute": "Executar processos" };
      return `<span class="ext-perm-tag">${info[p] || p}</span>`;
    }).join("");

    const eventsHtml = (ext.activationEvents || []).map(e =>
      `<span class="ext-event-tag">${escapeHtml(e)}</span>`
    ).join("");

    detailEl.innerHTML = `
      <div class="ext-detail-header">
        <button class="ext-btn ext-btn-secondary ext-detail-back" id="ext-detail-back">
          <i class="fa-solid fa-arrow-left"></i> Voltar
        </button>
        <div class="ext-detail-actions">
          ${ext.state === "active" ? `
            <button class="ext-btn ext-btn-secondary" data-action="disable" id="ext-detail-disable"><i class="fa-solid fa-stop"></i> Desativar</button>
            <button class="ext-btn ext-btn-secondary" data-action="reload" id="ext-detail-reload"><i class="fa-solid fa-rotate-right"></i> Recarregar</button>
          ` : `
            <button class="ext-btn ext-btn-primary" data-action="enable" id="ext-detail-enable"><i class="fa-solid fa-play"></i> Ativar</button>
          `}
          <button class="ext-btn ext-btn-secondary" data-action="export" id="ext-detail-export"><i class="fa-solid fa-download"></i> Exportar</button>
          <button class="ext-btn ext-btn-secondary" data-action="validate" id="ext-detail-validate"><i class="fa-solid fa-check-double"></i> Validar</button>
          <button class="ext-btn ext-btn-danger" data-action="uninstall" id="ext-detail-uninstall"><i class="fa-solid fa-trash"></i> Desinstalar</button>
        </div>
      </div>
      <div class="ext-detail-body">
        <div class="ext-detail-main">
          <h3>${escapeHtml(ext.displayName || ext.name)}</h3>
          <p class="ext-detail-desc">${escapeHtml(ext.description || "Sem descrição.")}</p>
          <div class="ext-detail-meta-grid">
            <div class="ext-detail-meta-item"><span class="ext-detail-label">ID</span><span>${escapeHtml(ext.id)}</span></div>
            <div class="ext-detail-meta-item"><span class="ext-detail-label">Versão</span><span>${escapeHtml(ext.version)}</span></div>
            <div class="ext-detail-meta-item"><span class="ext-detail-label">Autor</span><span>${escapeHtml(ext.publisher)}</span></div>
            <div class="ext-detail-meta-item"><span class="ext-detail-label">Status</span><span>${stateLabel}</span></div>
            ${ext.activateTime ? `<div class="ext-detail-meta-item"><span class="ext-detail-label">Ativação</span><span>${ext.activateTime}ms</span></div>` : ""}
            ${ext.homepage ? `<div class="ext-detail-meta-item"><span class="ext-detail-label">Homepage</span><span>${escapeHtml(ext.homepage)}</span></div>` : ""}
            ${ext.license ? `<div class="ext-detail-meta-item"><span class="ext-detail-label">Licença</span><span>${escapeHtml(ext.license)}</span></div>` : ""}
          </div>
        </div>
        <div class="ext-detail-section">
          <h4><i class="fa-solid fa-shield-halved"></i> Permissões</h4>
          <div class="ext-detail-tags">${permHtml || "<span class='ext-detail-muted'>Nenhuma permissão</span>"}</div>
        </div>
        <div class="ext-detail-section">
          <h4><i class="fa-solid fa-bolt"></i> Activation Events</h4>
          <div class="ext-detail-tags">${eventsHtml || "<span class='ext-detail-muted'>Nenhum evento</span>"}</div>
        </div>
        ${ext.error ? `
        <div class="ext-detail-section ext-detail-error-section">
          <h4><i class="fa-solid fa-triangle-exclamation"></i> Último erro</h4>
          <pre class="ext-detail-error">${escapeHtml(ext.error)}</pre>
        </div>
        ` : ""}
      </div>
    `;

    // Bind detail events
    document.getElementById("ext-detail-back")?.addEventListener("click", () => {
      selectedExtId = null;
      detailEl.style.display = "none";
      renderList();
    });

    document.getElementById("ext-detail-enable")?.addEventListener("click", () => handleCardAction(id, "enable"));
    document.getElementById("ext-detail-disable")?.addEventListener("click", () => handleCardAction(id, "disable"));
    document.getElementById("ext-detail-reload")?.addEventListener("click", () => handleCardAction(id, "reload"));
    document.getElementById("ext-detail-export")?.addEventListener("click", () => handleCardAction(id, "export"));
    document.getElementById("ext-detail-validate")?.addEventListener("click", () => handleCardAction(id, "validate"));
    document.getElementById("ext-detail-uninstall")?.addEventListener("click", () => handleCardAction(id, "uninstall"));
  }

  // ── Actions ──────────────────────────

  async function handleCardAction(id, action) {
    const api = window.lignisAPI;
    try {
      switch (action) {
        case "enable":
          await api.extensionEnable(id);
          if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão ativada.", "success");
          break;
        case "disable":
          await api.extensionDisable(id);
          if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão desativada.", "info");
          break;
        case "reload":
          await api.extensionActivate(id);
          if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão recarregada.", "success");
          break;
        case "uninstall":
          if (confirm("Tem certeza que deseja desinstalar esta extensão?")) {
            await api.extensionUninstall(id);
            selectedExtId = null;
            document.getElementById("ext-detail").style.display = "none";
            if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão desinstalada.", "info");
          }
          break;
        case "export":
          if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão exportada.", "success");
          break;
        case "validate":
          const valResult = await api.extensionGet(id);
          if (valResult.success && valResult.data) {
            const v = valResult.data.validation || {};
            if (v.valid) {
              if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão válida.", "success");
            } else {
              if (typeof App !== "undefined" && App.showToast) App.showToast(`Erros: ${(v.errors || []).join(", ")}`, "error", 5000);
            }
          }
          break;
      }
      await renderList();
      if (selectedExtId) renderDetail(selectedExtId);
    } catch (err) {
      if (typeof App !== "undefined" && App.showToast) App.showToast(`Erro: ${err.message}`, "error");
    }
  }

  async function importExtension() {
    try {
      const result = await window.lignisAPI.extensionInstallDialog();
      if (result && result.success) {
        if (typeof App !== "undefined" && App.showToast) App.showToast("Extensão instalada com sucesso!", "success");
        await renderList();
      } else if (result && result.error) {
        if (typeof App !== "undefined" && App.showToast) App.showToast(`Erro: ${result.error}`, "error", 5000);
      }
    } catch (err) {
      if (typeof App !== "undefined" && App.showToast) App.showToast(`Erro ao importar: ${err.message}`, "error");
    }
  }

  return { init, open, close, renderList, handleCardAction };
})();
