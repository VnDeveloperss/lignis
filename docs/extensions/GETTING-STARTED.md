# Lignis Extensions — Getting Started

## Visão Geral

O Lignis suporta um sistema de extensões que permite a desenvolvedores criarem ferramentas para o editor. As extensões rodam isoladas da UI principal e interagem através de APIs documentadas.

## Estrutura de uma Extensão

```
minha-extensao/
├── lignis-extension.json    # Manifesto obrigatório
├── extension.js             # Ponto de entrada
└── README.md                # Documentação
```

## Manifesto (`lignis-extension.json`)

```json
{
  "name": "minha-extensao",
  "displayName": "Minha Extensão",
  "version": "1.0.0",
  "publisher": "meu-usuario",
  "description": "Descrição da extensão",
  "main": "./extension.js",
  "activationEvents": ["onStartupFinished"],
  "permissions": ["commands", "statusbar"],
  "engines": {
    "lignis": ">=3.4.0"
  }
}
```

### Campos Obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | string | Nome único da extensão |
| `version` | string | Versão semântica |
| `main` | string | Caminho relativo ao arquivo principal |

### Campos Opcionais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `displayName` | string | Nome amigável |
| `publisher` | string | Nome do autor |
| `description` | string | Descrição |
| `activationEvents` | string[] | Eventos de ativação |
| `permissions` | string[] | Permissões necessárias |
| `engines` | object | Versão mínima do Lignis |

## Lifecycle

### `activate(context)`

Chamado quando a extensão é ativada. O `context` fornece:

- `context.subscriptions[]` — Array para registrar disposables
- `context.extensionPath` — Caminho da extensão
- `context.lignis` — API do Lignis

### `deactivate()`

Chamado quando a extensão é desativada.

## Permissões

| Permissão | Descrição | Sensível |
|-----------|-----------|----------|
| `workspace.read` | Ler arquivos do workspace | Não |
| `workspace.write` | Modificar arquivos do workspace | Sim |
| `terminal.create` | Criar terminais | Não |
| `terminal.sendText` | Enviar comandos ao terminal | Sim |
| `network` | Acessar a internet | Sim |
| `clipboard` | Acessar a área de transferência | Não |
| `notifications` | Exibir notificações | Não |
| `editor` | Modificar o editor | Não |
| `commands` | Registrar comandos | Não |
| `settings` | Ler configurações | Não |
| `statusbar` | Adicionar itens à barra de status | Não |
| `views` | Criar painéis laterais | Não |
| `process.execute` | Executar processos locais | Sim |

## APIs Disponíveis

### `context.lignis.window`

```js
// Mensagens
lignis.window.showInformationMessage("Mensagem");
lignis.window.showWarningMessage("Aviso");
lignis.window.showErrorMessage("Erro");

// Quick Pick
const item = await lignis.window.showQuickPick(["Opção 1", "Opção 2"]);

// Input Box
const value = await lignis.window.showInputBox({ prompt: "Digite algo:" });
```

### `context.lignis.commands`

```js
// Registrar comando
const cmd = lignis.commands.registerCommand("ext.comando", () => {
  console.log("Comando executado!");
});
context.subscriptions.push(cmd);

// Executar comando
await lignis.commands.executeCommand("ext.comando");
```

### `context.lignis.workspace`

```js
// Pastas do workspace
const folders = await lignis.workspace.workspaceFolders;

// Configuração
const config = await lignis.workspace.getConfiguration("minha-extensao");

// Abrir documento
await lignis.workspace.openTextDocument({ content: "Olá" });
```

### `context.lignis.editor`

```js
// Editor ativo
const editor = await lignis.editor.activeTextEditor;

// Status Bar
const item = lignis.editor.createStatusBarItem("left", 100);
item.setText("Meu Item");
item.setTooltip("Dica");
item.show();
context.subscriptions.push(item);
```

### `context.lignis.inlineCommands`

```js
// Registrar comando inline ($ext.comando())
const cmd = lignis.inlineCommands.register({
  id: "ext.comando",
  namespace: "ext",
  syntax: "$ext.comando()",
  description: "Descrição do comando",
  execute: () => "Resultado",
});
context.subscriptions.push(cmd);
```

### `context.lignis.terminal`

```js
// Criar terminal
const terminal = await lignis.terminal.createTerminal("Meu Terminal");

// Enviar texto
lignis.terminal.sendText(terminal.id, "echo Olá");

// Eventos
lignis.terminal.onDidOpenTerminal((t) => console.log("Terminal aberto:", t));
lignis.terminal.onDidCloseTerminal((t) => console.log("Terminal fechado:", t));
```

### `context.lignis.fs` (requer permissão)

```js
// Ler arquivo
const content = lignis.fs.readFile("/caminho/arquivo.txt");

// Escrever arquivo
lignis.fs.writeFile("/caminho/novo.txt", "Conteúdo");

// Ler diretório
const entries = lignis.fs.readDirectory("/caminho");
```

### `context.lignis.languages`

```js
// Registrar provedor de autocomplete
lignis.languages.registerCompletionItemProvider("plaintext", {
  provideCompletionItems: (model, position) => {
    return { suggestions: [...] };
  }
});
```

## Activation Events

| Evento | Quando ativar |
|--------|---------------|
| `onStartupFinished` | Após o Lignis iniciar |
| `onLanguage:html` | Ao abrir arquivo HTML |
| `onCommand:ext.comando` | Ao executar comando |
| `onView:explorer` | Ao abrir Explorer |

## Exemplo Completo

```js
// extension.js
function activate(context) {
  const { lignis } = context;

  // Status bar
  const item = lignis.editor.createStatusBarItem();
  item.setText("🚀 Ativo");
  context.subscriptions.push(item);

  // Comando
  context.subscriptions.push(
    lignis.commands.registerCommand("ext.hello", () => {
      lignis.window.showInformationMessage("Hello from ext!");
    })
  );

  // Comando inline
  context.subscriptions.push(
    lignis.inlineCommands.register({
      id: "ext.now",
      syntax: "$ext.now()",
      description: "Data/hora atual",
      execute: () => new Date().toISOString(),
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
```

## Instalação

1. Crie uma pasta com o nome da extensão no diretório de extensões:
   - `%APPDATA%/lignis/extensions/` (Windows)
   - `~/.config/lignis/extensions/` (Linux)
   - `~/Library/Application Support/lignis/extensions/` (macOS)

2. Coloque o `lignis-extension.json` e o `extension.js` na pasta.

3. Reinicie o Lignis.

Ou use `Arquivo > Instalar extensão de arquivo` no menu.

## Diretório de Extensões

O Lignis usa o diretório de dados do usuário:

```js
app.getPath("userData") + "/extensions/"
```

As extensões ficam isoladas da instalação principal do Lignis.
