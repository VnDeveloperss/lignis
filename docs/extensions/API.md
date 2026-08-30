# Lignis Extension API v1.0

Referência completa da API disponível para extensões.

## Context Object

Ao ativar uma extensão, a função `activate(context)` recebe:

```js
{
  subscriptions: [],        // Array de disposables
  extensionPath: "/...",    // Caminho da extensão
  extensionUri: "/...",     // URI da extensão
  extensionMode: "production" | "development",
  storagePath: "/...",      // Diretório isolado de storage
  lignis: { ... }          // API principal
}
```

## lignis.window

```js
// Mensagens ao usuário
lignis.window.showInformationMessage(msg)
lignis.window.showWarningMessage(msg)
lignis.window.showErrorMessage(msg)

// Quick Pick
const result = await lignis.window.showQuickPick(items)
// items: string[] ou { label, description, detail }[]
// result: item selecionado ou null

// Input Box
const value = await lignis.window.showInputBox({ prompt, placeHolder, value })
// value: string digitado ou null

// Progress
lignis.window.showProgress(message)
```

## lignis.commands

```js
// Registrar comando (aparece na Command Palette)
const cmd = lignis.commands.registerCommand(id, callback)
context.subscriptions.push(cmd)

// Executar comando
await lignis.commands.executeCommand(id, ...args)

// Listar comandos registrados
const commands = lignis.commands.getCommands()
// string[]

// Exemplo
context.subscriptions.push(
  lignis.commands.registerCommand("ext.digitar", (msg) => {
    lignis.window.showInformationMessage(msg || "Olá!");
  })
);
```

## lignis.workspace

```js
// Pastas do workspace
const folders = await lignis.workspace.getWorkspaceFolders()
// [{ uri: "/path", name: "pasta" }]

// Configuração da extensão
const config = await lignis.workspace.getConfiguration(section)
// section: "minhaExtensao" → { enabled: true, ... }

// Buscar arquivos
const files = await lignis.workspace.findFiles(pattern)
// glob pattern: "**\/*.js"

// Abrir documento
await lignis.workspace.openTextDocument({ content: "texto", language: "plaintext" })

// Escutar mudanças no workspace
const sub = lignis.workspace.onDidChangeWorkspaceFolders((event) => { ... })
context.subscriptions.push(sub)
```

## lignis.editor

```js
// Editor ativo
const editor = await lignis.editor.getActiveTextEditor()
// { document: { text, fileName, languageId, lineCount }, selection: { start, end } }

// Barra de status
const item = lignis.editor.createStatusBarItem(alignment?, priority?)
// alignment: "left" | "right"
// priority: número (maior = mais à esquerda/direita)

item.text = "$(icon) Texto"
item.tooltip = "Dica"
item.command = "ext.command"
item.show()
item.hide()
item.dispose()

context.subscriptions.push(item)

// Decorações no editor
lignis.editor.setDecorations(uri, decorations)
```

## lignis.document

```js
// Obter dados do documento ativo
const text = await lignis.document.getText()
const fileName = await lignis.document.getFileName()
const languageId = await lignis.document.getLanguageId()
const lineCount = await lignis.document.getLineCount()
```

## lignis.terminal

```js
// Criar terminal
const terminal = await lignis.terminal.createTerminal("Nome")
// { id: "term_1" }

// Enviar texto
lignis.terminal.sendText(terminal.id, "echo Olá")

// Escutar eventos
const sub1 = lignis.terminal.onDidOpenTerminal((t) => { ... })
const sub2 = lignis.terminal.onDidCloseTerminal((t) => { ... })
context.subscriptions.push(sub1, sub2)
```

## lignis.inlineCommands

Registrar comandos `$namespace.command()` inline:

```js
const cmd = lignis.inlineCommands.register({
  id: "git.branch",           // ID único
  namespace: "git",           // Namespace para autocomplete
  syntax: "$git.branch()",    // Texto exato para reconhecimento
  description: "Branch atual", // Descrição para ajuda
  execute: async () => {      // Função executada
    return "main";
  },
})
context.subscriptions.push(cmd)
```

### Comandos Core do Lignis

| Comando | Descrição |
|---------|-----------|
| `$app.version()` | Versão do Lignis |
| `$app.platform()` | Plataforma (win32, darwin, linux) |
| `$app.arch()` | Arquitetura (x64, arm64) |
| `$local.date()` | Data atual |
| `$local.time()` | Hora atual |
| `$local.datetime()` | Data e hora |
| `$timestamp()` | Unix timestamp |
| `$timestamp.ms()` | Unix timestamp em ms |
| `$uuid()` | UUID v4 |
| `$random.int(min,max)` | Número aleatório |

## lignis.fs

Requer permissão `workspace.read` ou `fs.read`/`fs.write`:

```js
const content = lignis.fs.readFile("/path/file.txt")
lignis.fs.writeFile("/path/file.txt", "conteúdo")
const stat = lignis.fs.stat("/path/file.txt")
const entries = lignis.fs.readDirectory("/path/dir")
lignis.fs.createDirectory("/path/new-dir")
lignis.fs.delete("/path/file.txt")
lignis.fs.rename("/path/old.txt", "/path/new.txt")
```

## lignis.languages

```js
// Completion Provider
lignis.languages.registerCompletionItemProvider(selector, {
  provideCompletionItems: (model, position) => ({
    suggestions: [{
      label: "minha-sugestao",
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: "meu-codigo",
      detail: "Descrição",
    }]
  })
})
```

## lignis.storage

Storage isolado por extensão:

```js
lignis.storage.set("chave", valor)
const valor = lignis.storage.get("chave")
```

## lignis.util

```js
const version = lignis.util.getExtensionVersion()
const apiVersion = lignis.util.getLignisApiVersion()
```
