// Workspace Info — Sample Extension
// Demonstrates workspace API, inline commands, and status bar

function activate(context) {
  const { lignis } = context;

  // Status bar item showing workspace info
  const statusItem = lignis.editor.createStatusBarItem("right", -100);
  statusItem.setText("$(folder) Workspace");
  statusItem.setTooltip("Workspace Info ativo");
  statusItem.show();
  context.subscriptions.push(statusItem);

  // Command: workspace-info.show
  const cmd = lignis.commands.registerCommand("workspace-info.show", async () => {
    const folders = await lignis.workspace.getWorkspaceFolders();
    if (folders && folders.length > 0) {
      lignis.window.showInformationMessage(`Workspace: ${folders[0].name}\nCaminho: ${folders[0].uri}`);
    } else {
      lignis.window.showWarningMessage("Nenhum workspace aberto.");
    }
  });
  context.subscriptions.push(cmd);

  // Inline command: $workspace.info()
  const inlineCmd = lignis.inlineCommands.register({
    id: "workspace.info",
    namespace: "workspace",
    syntax: "$workspace.info()",
    description: "Retorna o nome do workspace atual",
    execute: async () => {
      const folders = await lignis.workspace.getWorkspaceFolders();
      return folders && folders.length > 0 ? folders[0].name : "(nenhum workspace)";
    },
  });
  context.subscriptions.push(inlineCmd);

  // Inline command: $workspace.root()
  const rootCmd = lignis.inlineCommands.register({
    id: "workspace.root",
    namespace: "workspace",
    syntax: "$workspace.root()",
    description: "Retorna o caminho raiz do workspace",
    execute: async () => {
      const folders = await lignis.workspace.getWorkspaceFolders();
      return folders && folders.length > 0 ? folders[0].uri : "(nenhum workspace)";
    },
  });
  context.subscriptions.push(rootCmd);

  console.log("[Workspace Info] Extensão ativada.");
}

function deactivate() {
  console.log("[Workspace Info] Extensão desativada.");
}

module.exports = { activate, deactivate };
