# Lignis v3.0.0

Editor de texto e código desktop moderno, rápido e extensível, focado em produtividade e simplicidade.

## Instalação

```bash
cd novapad
npm install
npm start
```

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build:win    # Windows
npm run build:linux  # Linux
npm run build:mac    # macOS
```

## Recursos v3.0.0

- **Editor Monaco** com syntax highlighting para 25+ linguagens
- **Múltiplas abas** com dirty tracking e reordenação
- **Aba fixada (Pin)** para documentos importantes
- **Sidebar** com explorador de arquivos
- **Quick Open** (Ctrl+P) para navegação rápida entre abas
- **Bookmarks** (Ctrl+F2 / F2 / Shift+F2) para marcar linhas
- **Minimap** do Monaco configurável
- **Próxima ocorrência** (Ctrl+D) para seleção múltipla
- **Múltiplos cursores** (Ctrl+Alt+↑/↓)
- **Salvamento atômico** para evitar corrupção
- **Restauração de sessão** ao reiniciar
- **Salvamento automático** por atraso ou ao perder foco
- **Modo somente leitura**
- **Busca e substituição** com regex, match case, palavra inteira
- **Paleta de comandos** com categorias e fuzzy search
- **Tema escuro e claro** com design tokens e cores de destaque configuráveis
- **Preview Markdown** com marked.js + DOMPurify
- **Pré-visualização HTML** com sandbox de segurança
- **Comandos inline** ($local.datetime(), $uuid(), $random.int(), etc.)
- **Ferramentas de texto**: JSON, Base64, URL encode, HTML escape, UUID, timestamps
- **Conversão de caso**: maiúsculas, minúsculas, título, toggle
- **Operações de linha**: duplicar, excluir, mover, ordenação natural
- **Limpeza de texto**: remover duplicadas, vazias, espaços finais
- **Estatísticas do documento** detalhadas
- **Ctrl+Scroll** para zoom
- **Fechamento automático de pares** (), [], {}, "", '', ``
- **Drag and drop** de arquivos
- **Interface 100% em Português do Brasil**
- **Configurações**: minimap, ligatures, cursor style, line height, render whitespace, format on save

## Atalhos Principais

| Atalho | Ação |
|---|---|
| Ctrl+N | Novo arquivo |
| Ctrl+O | Abrir arquivo |
| Ctrl+P | Quick Open |
| Ctrl+S | Salvar |
| Ctrl+Shift+S | Salvar como |
| Ctrl+W | Fechar aba |
| Ctrl+Z | Desfazer |
| Ctrl+Shift+Z | Refazer |
| Ctrl+D | Próxima ocorrência |
| Ctrl+Shift+D | Duplicar linha |
| Ctrl+F | Localizar |
| Ctrl+H | Substituir |
| Ctrl+G | Ir para linha |
| Ctrl+B | Sidebar |
| Ctrl+Shift+P | Paleta de comandos |
| Ctrl+F2 | Adicionar bookmark |
| F2 | Próximo bookmark |
| Shift+F2 | Bookmark anterior |
| Alt+Z | Quebra de linha |
| Ctrl+Shift+T | Alternar tema |
| Ctrl+/ | Alternar comentário |
| Alt+↑/↓ | Mover linha |
| Ctrl+Enter | Executar comando |
| F11 | Tela cheia |

## Arquitetura

```
lignis/
├── package.json
├── CHANGELOG.md
├── src/
│   ├── main/
│   │   ├── main.js          — Electron BrowserWindow
│   │   ├── ipc.js           — Handlers IPC seguros
│   │   └── menu.js          — Menu da aplicação
│   ├── preload/
│   │   └── preload.js       — API contextBridge
│   ├── renderer/
│   │   ├── index.html       — Interface
│   │   ├── styles.css       — Design tokens + Temas
│   │   ├── locale.js        — Helper de localização
│   │   ├── app.js           — Orquestrador principal
│   │   ├── editor.js        — Wrapper Monaco Editor
│   │   ├── tabs.js          — Sistema de abas
│   │   ├── statusbar.js     — Barra de status
│   │   ├── search.js        — Busca e substituição
│   │   ├── settings.js      — Configurações
│   │   ├── command-palette.js — Paleta de comandos
│   │   ├── commands-engine.js — Motor de comandos inline
│   │   ├── context-menu.js  — Menus de contexto
│   │   ├── icon-service.js  — Serviço de ícones
│   │   └── tools.js         — Ferramentas de texto
│   └── locales/
│       └── pt-BR.js         — Localização PT-BR
```

## Segurança

- `contextIsolation: true`
- `nodeIntegration: false`
- IPC com whitelist de canais
- CSP configurado para origens CDN
- Validação de paths
- Protocolo HTTPS para links externos
- Salvamento atômico
- Preview HTML com iframe sandbox

## Licença

MIT
