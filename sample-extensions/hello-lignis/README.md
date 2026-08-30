# Hello Lignis — Sample Extension

Este é um exemplo de extensão para o Lignis.

## O que esta extensão faz

1. **Status Bar**: Adiciona um item "Hello" à barra de status.
2. **Comando**: Registra `hello-lignis.greet` na Command Palette.
3. **Comando Inline**: Registra `$hello.world()` e `$hello.time()` para uso no editor.

## Como instalar

1. Copie a pasta `hello-lignis` para o diretório de extensões do Lignis:
   - Windows: `%APPDATA%/lignis/extensions/`
   - Linux: `~/.config/lignis/extensions/`
   - macOS: `~/Library/Application Support/lignis/extensions/`

2. Reinicie o Lignis.

## Como usar

- No editor, digite `$hello.world()` em Plain Text e pressione Espaço.
- Ou use Ctrl+Shift+P e busque "Hello Lignis".

## API utilizada

- `context.lignis.editor.createStatusBarItem()`
- `context.lignis.commands.registerCommand()`
- `context.lignis.window.showInformationMessage()`
- `context.lignis.inlineCommands.register()`
