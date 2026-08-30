# Lignis Extension System

O sistema de extensões do Lignis permite que desenvolvedores criem ferramentas para o editor de texto e código.

## Links Rápidos

- [Getting Started](GETTING-STARTED.md) — Comece a criar extensões
- [Manifest](MANIFEST.md) — Referência do manifesto `lignis-extension.json`
- [Lifecycle](LIFECYCLE.md) — Ciclo de vida das extensões
- [Permissions](PERMISSIONS.md) — Sistema de permissões
- [API Reference](API.md) — Referência completa da API

## Visão Geral

O Lignis suporta extensões que rodam de forma isolada da UI principal. As extensões interagem através de APIs documentadas e são controladas por um sistema de permissões.

### Estrutura de uma Extensão

```
minha-extensao/
├── lignis-extension.json    # Manifesto obrigatório
├── extension.js             # Ponto de entrada
└── README.md                # Documentação
```

### Fluxo Básico

1. Criar pasta com nome da extensão
2. Criar `lignis-extension.json`
3. Criar `extension.js` com `activate(context)` e `deactivate()`
4. Copiar para diretório de extensões
5. Reiniciar Lignis ou usar `Exibir > Extensões`

### Exemplo Mínimo

```js
// extension.js
function activate(context) {
  context.lignis.window.showInformationMessage("Olá do Lignis!");
}
function deactivate() {}
module.exports = { activate, deactivate };
```

### Manifesto Mínimo

```json
{
  "name": "minha-extensao",
  "displayName": "Minha Extensão",
  "version": "1.0.0",
  "publisher": "meu-usuario",
  "main": "./extension.js",
  "engines": { "lignis": ">=3.5.0" }
}
```

## Diretório de Extensões

| SO | Caminho |
|----|---------|
| Windows | `%APPDATA%/lignis/extensions/` |
| Linux | `~/.config/lignis/extensions/` |
| macOS | `~/Library/Application Support/lignis/extensions/` |

## Comandos de Extensões

Extensões podem registrar comandos inline `$namespace.command()`:

```js
context.lignis.inlineCommands.register({
  id: "git.branch",
  syntax: "$git.branch()",
  description: "Retorna a branch atual do Git",
  execute: () => "main",
});
```

## Segurança

- Cada extensão declara permissões necessárias
- Permissões sensíveis são transparentes ao usuário
- Extensões quebradas não derrubam o Lignis
- Safe mode disponível via `--disable-extensions`

## Amostras

Veja `sample-extensions/` no repositório para exemplos funcionais:
- `hello-lignis` — Hello World com status bar e comandos
- `workspace-info` — Info do workspace e inline commands
- `status-bar-demo` — Múltiplos itens na barra de status
