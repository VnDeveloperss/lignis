// Status Bar Demo — Sample Extension
// Demonstrates status bar items with commands

function activate(context) {
  const { lignis } = context;

  // Item 1: Clock
  const clockItem = lignis.editor.createStatusBarItem("right", -200);
  const updateClock = () => {
    clockItem.setText(`$(clock) ${new Date().toLocaleTimeString("pt-BR")}`);
  };
  updateClock();
  const timer = setInterval(updateClock, 1000);
  clockItem.show();
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  context.subscriptions.push(clockItem);

  // Item 2: Counter with command
  let count = 0;
  const counterItem = lignis.editor.createStatusBarItem("right", -300);
  counterItem.setText(`$(heart) 0`);
  counterItem.setTooltip("Clique para incrementar");
  counterItem.setCommand("status-bar-demo.increment");
  counterItem.show();
  context.subscriptions.push(counterItem);

  const cmd = lignis.commands.registerCommand("status-bar-demo.increment", () => {
    count++;
    counterItem.setText(`$(heart) ${count}`);
  });
  context.subscriptions.push(cmd);

  // Item 3: Left side
  const leftItem = lignis.editor.createStatusBarItem("left", 50);
  leftItem.setText("$(rocket) Status Bar Demo");
  leftItem.setTooltip("Status Bar Demo está ativo!");
  leftItem.show();
  context.subscriptions.push(leftItem);

  console.log("[Status Bar Demo] Extensão ativada.");
}

function deactivate() {
  console.log("[Status Bar Demo] Extensão desativada.");
}

module.exports = { activate, deactivate };
