// Hello Lignis — Sample Extension
// Demonstrates the Lignis Extension API

function activate(context) {
  const { lignis } = context;

  // ── Status Bar Item ──
  const statusItem = lignis.editor.createStatusBarItem("left", 100);
  statusItem.setText("$(heart) Hello");
  statusItem.setTooltip("Hello Lignis está ativo!");
  statusItem.show();
  context.subscriptions.push(statusItem);

  // ── Command Registration ──
  const cmd = lignis.commands.registerCommand("hello-lignis.greet", () => {
    lignis.window.showInformationMessage("Olá do Lignis! 👋");
  });
  context.subscriptions.push(cmd);

  // ── Inline Command ($hello.world()) ──
  const inlineCmd = lignis.inlineCommands.register({
    id: "hello.world",
    namespace: "hello",
    syntax: "$hello.world()",
    description: "Retorna uma mensagem de boas-vindas do Lignis",
    execute: () => "Olá, mundo! 🌍",
  });
  context.subscriptions.push(inlineCmd);

  // ── Command: $hello.time() ──
  const timeCmd = lignis.inlineCommands.register({
    id: "hello.time",
    namespace: "hello",
    syntax: "$hello.time()",
    description: "Retorna a hora atual",
    execute: () => new Date().toLocaleTimeString("pt-BR"),
  });
  context.subscriptions.push(timeCmd);

  console.log("[Hello Lignis] Extensão ativada com sucesso!");
}

function deactivate() {
  console.log("[Hello Lignis] Extensão desativada.");
}

module.exports = { activate, deactivate };
