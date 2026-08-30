const { Menu, shell, app } = require("electron");
const path = require("path");
const fs = require("fs");

function buildMenu(mainWindow, store) {
  const template = [
    // ─── Arquivo ──────────────────────────
    {
      label: "Arquivo",
      submenu: [
        {
          label: "Novo arquivo",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow.webContents.send("menu-new-file"),
        },
        {
          label: "Abrir arquivo...",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow.webContents.send("menu-open-file"),
        },
        {
          label: "Abrir pasta...",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => mainWindow.webContents.send("menu-open-folder-dialog"),
        },
        {
          label: "Abrir recente",
          id: "recent-files",
          submenu: [
            { label: "Nenhum arquivo recente", enabled: false },
          ],
        },
        { type: "separator" },
        {
          label: "Salvar",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow.webContents.send("menu-save-file"),
        },
        {
          label: "Salvar como...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow.webContents.send("menu-save-as"),
        },
        {
          label: "Salvar tudo",
          accelerator: "CmdOrCtrl+Alt+S",
          click: () => mainWindow.webContents.send("menu-save-all"),
        },
        { type: "separator" },
        {
          label: "Recarregar do disco",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => mainWindow.webContents.send("menu-reload"),
        },
        { type: "separator" },
        {
          label: "Fechar aba",
          accelerator: "CmdOrCtrl+W",
          click: () => mainWindow.webContents.send("menu-close-tab"),
        },
        {
          label: "Fechar outras abas",
          click: () => mainWindow.webContents.send("menu-close-others"),
        },
        {
          label: "Fechar todas as abas",
          click: () => mainWindow.webContents.send("menu-close-all"),
        },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    },
    // ─── Editar ───────────────────────────
    {
      label: "Editar",
      submenu: [
        {
          label: "Desfazer",
          accelerator: "CmdOrCtrl+Z",
          click: () => mainWindow.webContents.send("menu-undo"),
        },
        {
          label: "Refazer",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => mainWindow.webContents.send("menu-redo"),
        },
        { type: "separator" },
        {
          label: "Recortar",
          accelerator: "CmdOrCtrl+X",
          role: "cut",
        },
        {
          label: "Copiar",
          accelerator: "CmdOrCtrl+C",
          role: "copy",
        },
        {
          label: "Colar",
          accelerator: "CmdOrCtrl+V",
          role: "paste",
        },
        { type: "separator" },
        {
          label: "Selecionar tudo",
          accelerator: "CmdOrCtrl+A",
          role: "selectAll",
        },
        { type: "separator" },
        {
          label: "Duplicar linha",
          accelerator: "CmdOrCtrl+D",
          click: () => mainWindow.webContents.send("menu-duplicate-line"),
        },
        {
          label: "Excluir linha",
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => mainWindow.webContents.send("menu-delete-line"),
        },
        {
          label: "Mover linha para cima",
          accelerator: "Alt+Up",
          click: () => mainWindow.webContents.send("menu-move-line-up"),
        },
        {
          label: "Mover linha para baixo",
          accelerator: "Alt+Down",
          click: () => mainWindow.webContents.send("menu-move-line-down"),
        },
        { type: "separator" },
        {
          label: "Converter para MAIÚSCULAS",
          click: () => mainWindow.webContents.send("menu-uppercase"),
        },
        {
          label: "Converter para minúsculas",
          click: () => mainWindow.webContents.send("menu-lowercase"),
        },
        {
          label: "Capitalizar palavras",
          click: () => mainWindow.webContents.send("menu-title-case"),
        },
      ],
    },
    // ─── Pesquisar ────────────────────────
    {
      label: "Pesquisar",
      submenu: [
        {
          label: "Localizar",
          accelerator: "CmdOrCtrl+F",
          click: () => mainWindow.webContents.send("menu-find"),
        },
        {
          label: "Substituir",
          accelerator: "CmdOrCtrl+H",
          click: () => mainWindow.webContents.send("menu-replace"),
        },
        { type: "separator" },
        {
          label: "Ir para linha",
          accelerator: "CmdOrCtrl+G",
          click: () => mainWindow.webContents.send("menu-goto-line"),
        },
      ],
    },
    // ─── Formatar ─────────────────────────
    {
      label: "Formatar",
      submenu: [
        {
          label: "Formatar JSON",
          click: () => mainWindow.webContents.send("menu-json-format"),
        },
        {
          label: "Compactar JSON",
          click: () => mainWindow.webContents.send("menu-json-minify"),
        },
        {
          label: "Validar JSON",
          click: () => mainWindow.webContents.send("menu-json-validate"),
        },
        { type: "separator" },
        {
          label: "Ordenar linhas A-Z",
          click: () => mainWindow.webContents.send("menu-sort-az"),
        },
        {
          label: "Ordenar linhas Z-A",
          click: () => mainWindow.webContents.send("menu-sort-za"),
        },
        { type: "separator" },
        {
          label: "Remover linhas duplicadas",
          click: () => mainWindow.webContents.send("menu-remove-duplicates"),
        },
        {
          label: "Remover linhas vazias",
          click: () => mainWindow.webContents.send("menu-remove-empty-lines"),
        },
        {
          label: "Remover espaços no fim das linhas",
          click: () => mainWindow.webContents.send("menu-trim-trailing"),
        },
        { type: "separator" },
        {
          label: "Converter tabs para espaços",
          click: () => mainWindow.webContents.send("menu-tabs-to-spaces"),
        },
        {
          label: "Converter espaços para tabs",
          click: () => mainWindow.webContents.send("menu-spaces-to-tabs"),
        },
      ],
    },
    // ─── Exibir ───────────────────────────
    {
      label: "Exibir",
      submenu: [
        {
          label: "Quebra automática de linha",
          type: "checkbox",
          checked: store.get("wordWrap"),
          accelerator: "Alt+Z",
          click: (item) => {
            store.set("wordWrap", item.checked);
            mainWindow.webContents.send("toggle-word-wrap", item.checked);
          },
        },
        {
          label: "Números de linha",
          type: "checkbox",
          checked: store.get("lineNumbers"),
          click: (item) => {
            store.set("lineNumbers", item.checked);
            mainWindow.webContents.send("toggle-line-numbers", item.checked);
          },
        },
        {
          label: "Barra de status",
          type: "checkbox",
          checked: store.get("showStatusBar"),
          click: (item) => {
            store.set("showStatusBar", item.checked);
            mainWindow.webContents.send("toggle-status-bar", item.checked);
          },
        },
        {
          label: "Barra de ferramentas",
          type: "checkbox",
          checked: store.get("showToolbar"),
          click: (item) => {
            store.set("showToolbar", item.checked);
            mainWindow.webContents.send("toggle-toolbar", item.checked);
          },
        },
        {
          label: "Explorador",
          accelerator: "CmdOrCtrl+B",
          click: () => mainWindow.webContents.send("toggle-sidebar"),
        },
        {
          label: "Terminal",
          accelerator: "CmdOrCtrl+`",
          click: () => mainWindow.webContents.send("toggle-terminal"),
        },
        {
          label: "Extensões",
          click: () => mainWindow.webContents.send("open-extensions"),
        },
        { type: "separator" },
        {
          label: "Modo foco",
          click: () => mainWindow.webContents.send("toggle-focus-mode"),
        },
        {
          label: "Tela cheia",
          accelerator: "F11",
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
        { type: "separator" },
        {
          label: "Preview Markdown",
          click: () => mainWindow.webContents.send("toggle-markdown-preview"),
        },
        {
          label: "Pré-visualização HTML",
          click: () => mainWindow.webContents.send("toggle-html-preview"),
        },
        { type: "separator" },
        {
          label: "Aumentar zoom",
          accelerator: "CmdOrCtrl+=",
          click: () => mainWindow.webContents.send("zoom-in"),
        },
        {
          label: "Diminuir zoom",
          accelerator: "CmdOrCtrl+-",
          click: () => mainWindow.webContents.send("zoom-out"),
        },
        {
          label: "Restaurar zoom",
          accelerator: "CmdOrCtrl+0",
          click: () => mainWindow.webContents.send("zoom-reset"),
        },
        { type: "separator" },
        {
          label: "Tema escuro",
          type: "radio",
          checked: store.get("theme") === "dark",
          click: () => {
            store.set("theme", "dark");
            mainWindow.webContents.send("set-theme", "dark");
          },
        },
        {
          label: "Tema claro",
          type: "radio",
          checked: store.get("theme") === "light",
          click: () => {
            store.set("theme", "light");
            mainWindow.webContents.send("set-theme", "light");
          },
        },
        { type: "separator" },
        {
          label: "Paleta de comandos",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => mainWindow.webContents.send("open-command-palette"),
        },
      ],
    },
    // ─── Configurações ────────────────────
    {
      label: "Configurações",
      submenu: [
        {
          label: "Preferências",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow.webContents.send("open-settings"),
        },
        {
          label: "Atalhos de teclado",
          click: () => mainWindow.webContents.send("menu-shortcuts"),
        },
        {
          label: "Aparência",
          click: () => mainWindow.webContents.send("open-settings"),
        },
      ],
    },
    // ─── Ajuda ────────────────────────────
    {
      label: "Ajuda",
      submenu: [
        {
          label: "Comandos",
          click: () => mainWindow.webContents.send("menu-open-commands-help"),
        },
        {
          label: "Atalhos de teclado",
          click: () => mainWindow.webContents.send("menu-shortcuts"),
        },
        { type: "separator" },
        {
          label: "Desenvolvimento de Extensões",
          click: () => mainWindow.webContents.send("open-extension-docs"),
        },
        {
          label: "Verificar atualizações",
          click: () => mainWindow.webContents.send("open-update-check"),
        },
        {
          label: "Sobre o Lignis",
          click: () => mainWindow.webContents.send("open-about"),
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: "about", label: `Sobre ${app.getName()}` },
        { type: "separator" },
        { role: "services", label: "Serviços" },
        { type: "separator" },
        { role: "hide", label: `Ocultar ${app.getName()}` },
        { role: "hideOthers", label: "Ocultar outros" },
        { role: "unhide", label: "Mostrar tudo" },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  updateRecentFilesMenu(menu, store);
  return menu;
}

function updateRecentFilesMenu(menu, store) {
  const recentFiles = store.get("recentFiles") || [];
  const recentMenu = menu.getMenuItemById("recent-files");
  if (!recentMenu) return;

  if (recentFiles.length === 0) {
    recentMenu.submenu = [
      { label: "Nenhum arquivo recente", enabled: false },
    ];
  } else {
    const items = recentFiles.map((fp) => ({
      label: path.basename(fp),
      toolTip: fp,
      click: () => {
        const { BrowserWindow } = require("electron");
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
          win.webContents.send("open-recent-file", fp);
        }
      },
    }));
    items.push({ type: "separator" });
    items.push({
      label: "Limpar recentes",
      click: () => {
        store.set("recentFiles", []);
        const { BrowserWindow } = require("electron");
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
          win.webContents.send("recent-files-updated");
        }
      },
    });
    recentMenu.submenu = items;
  }
}

module.exports = { buildMenu, updateRecentFilesMenu };
