# Changelog — Lignis

## Versão 3.6.1

### Correções
- Corrigido travamento na inicialização causado pelo SQLite bloqueando o event loop do Electron.
- DatabaseService agora é inicializado de forma diferida (deferred) após a criação da janela.
- Corrigido registro duplicado de handlers IPC durante startup.
- Melhorada instrumentação de startup com logs claros em cada etapa.
- Adicionados handlers de erro para uncaughtException e unhandledRejection no processo principal.
- Adicionado monitoramento de falhas do renderer (did-fail-load, render-process-gone, preload-error).
- Fallback de timeout para ready-to-show (8s) garante que a janela sempre apareça.
- Módulos não críticos (SQLite, ExtensionManager, DevMode) são carregados de forma segura com try/catch.
- A mensagem crashpad_client_win.cc(867): not connected é apenas o reporter de crashes do Chromium não conectado — não afeta o funcionamento.
- Verificado: 10/10 inicializações completam com sucesso.

## Versão 3.6.0

### Novidades
- **SQLite integrado**: Armazenamento persistente e estruturado para extensões, sessões, arquivos recentes e logs.
- **DevMode Extension Window**: Janela separada completa para criação e desenvolvimento de extensões.
- **Templates de extensão**: Hello World, Command, Status Bar, Inline Command, Terminal, Workspace e Full.
- **IntelliSense para extensões**: Arquivo lignis.d.ts com tipos completos da API para autocomplete no Monaco.
- **Extension Inspector**: Visualização de status, logs e problemas de extensões.
- **Criar Extensão**: Botão no painel de extensões para criar nova extensão com wizard.
- **Abrir no DevMode**: Abre extensão existente na janela de desenvolvimento.

### Melhorias
- DatabaseService com migrations versionadas e fallback de corrupção.
- Extensões persistidas no SQLite com registro completo.
- Storage isolado por extensão via SQLite (globalState/workspaceState).
- Logs de extensão armazenados no banco de dados.
- DevMode window com Monaco Editor, file explorer, terminal e documentação.
- DevMode menu específico: Arquivo, Editar, Executar, Extensão, Ajuda.
- DevMode keyboard shortcuts: F5 (executar), Shift+F5 (parar), Ctrl+Shift+B (build).
- Painel de documentação integrado na janela DevMode.
- File tree com ícones por tipo de arquivo.
- Toolbar de ações: Executar, Parar, Recarregar, Validar, Build, Exportar.
- Status indicator com cores (idle, running, error).

### Correções
- Terminal: listener registrado antes da criação do PTY.
- Comandos Lignis no terminal com fallback para window.lignisAPI.CommandRegistry.
- Extension handlers movidos para dentro do escopo correto do setupIpc.

## Versão 3.5.1

### Novidades
- Documentação de extensões integrada ao aplicativo (Ajuda > Desenvolvimento de Extensões).
- Visualizador de documentação com navegação lateral, busca e renderização Markdown.

### Melhorias
- Terminal: listener de output registrado antes da criação do PTY para evitar perda do prompt inicial.
- Terminal: comandos Lignis agora são interceptados corretamente no terminal integrado.
- IPC: handlers de extensões movidos para dentro do escopo correto do setupIpc.

### Correções
- Corrigido erro ao usar Instalar Extensão (dialog de seleção de pasta).
- Corrigida referência de mainWindow inacessível em handlers de extensão.
- Corrigida interceptação de comandos Lignis no terminal (CommandRegistry não era encontrado).

## Versão 3.5.0

### Novidades
- **Painel completo de Extensões**: Visualizar, buscar, filtrar, ativar, desativar, recarregar, exportar, validar e desinstalar extensões.
- **Validação de Manifesto**: Validação automática de `lignis-extension.json` com semver, campos obrigatórios e compatibilidade de engine.
- **Validação de Arquivos**: Verificação de arquivos obrigatórios antes da instalação.
- **Importar/Exportar Extensões**: Importar de pasta local, exportar extensão para compartilhamento.
- **Rollback de Extensões**: Restaurar versão anterior automaticamente antes de atualização.
- **Crash Isolation**: Extensões quebradas não derrubam o Lignis. Erros são capturados e registrados.
- **Safe Mode**: Iniciar com extensões desativadas via `--disable-extensions`.
- **Activation Timeout**: Extensões que travam na ativação são marcadas com erro após 15 segundos.
- **Extension Storage**: Storage isolado por extensão via `lignis.storage`.
- **Conflict Detection**: Detecção de conflitos quando múltiplas extensões registram o mesmo comando.
- **Crash Log**: Registro de erros de ativação para diagnóstico.
- **Detalhes da Extensão**: Visualização completa de permissões, activation events, contributes e erros.
- **Documentação de Extensões**: Getting Started, API Reference, Manifest, Permissions, Lifecycle.
- **Exemplos de Extensões**: hello-lignis, workspace-info, status-bar-demo.

### Melhorias
- Reescrita completa do ExtensionManager com arquitetura robusta.
- Permissões estendidas: `workspace.watch`, `editor.read`, `editor.write`, `fs.read`, `fs.write`, `clipboard.read`, `clipboard.write`.
- API de Storage isolado por extensão.
- API de Document para ler dados do documento ativo.
- Menu Exibir > Extensões adicionado.
- Preload com canais completos para todas as operações de extensão.
- CSS profissional para o painel de extensões.
- Validação de semver e engine compatibility.

### Correções
- Extensões com erros agora são marcadas visualmente com borda vermelha.
- Subscriptions são dispose corretamente ao desativar extensão.
- Comandos registrados são limpos ao desativar extensão.
- Itens da barra de status são removidos ao desativar extensão.

## Versão 3.4.0

### Novidades
- **Sistema de Extensões do Lignis**: Arquitetura profissional de extensões com lifecycle, permissões e API documentada.
- **Extension API v1.0**: APIs para `window`, `commands`, `workspace`, `editor`, `terminal`, `inlineCommands`, `fs`, `languages`, `statusbar`.
- **Permissões de Extensões**: Cada extensão declara permissões necessárias. Permissões sensíveis são transparentes ao usuário.
- **Activation Events**: Extensões podem ser ativadas sob demanda (lazy activation) para não afetar a performance.
- **Extension UI**: Painel de extensões com ações: Instalar, Ativar, Desativar, Desinstalar.
- **Instalação de Extensões Locais**: Suporte a instalação de extensões a partir de diretórios locais.
- **Lignis Commands 2.0**: Comandos inline registrados por extensões com namespace próprio.

### Melhorias
- Caminho do ícone do aplicativo verificado antes de carregar (evita erro se ausente).
- Diagnóstico de caminhos no processo principal para facilitar resolução de problemas.
- Canal IPC de extensões adicionado ao preload com whitelist de segurança.
- Channels de extensão segregados dos canais da aplicação principal.
- Lignis API exposta via `lignisAPI.extensionActivate`, `extensionDeactivate`, etc.

### Correções
- Corrigido erro `net::ERR_FILE_NOT_FOUND` causado por `locales/pt-BR.js` em diretório incorreto.
- Arquivo de localização movido para `src/renderer/locales/` onde o protocolo `lignis://` consegue resolvê-lo.
- Ícone do aplicativo verificado com `fs.existsSync()` antes de configurar no BrowserWindow.

## Versão 3.3.0

### Novidades
- FloatingUIManager: sistema centralizado de overlays com click-outside, Escape e z-index.
- Explorer context menu: Abrir, Copiar caminho, Copiar nome, Atualizar.
- Language picker com busca de texto.
- Terminal com cleanup de processos e ResizeObserver.
- Comandos Lignis executáveis no terminal e auto-execução em Plain Text.

### Melhorias
- Seleção de texto corrigida: `columnSelection: false`, `multiCursorModifier: "alt"`.
- Shell detection no Windows: PowerShell 7+ > Windows PowerShell > CMD.
- Escape key hierarchy para popups e overlays.
- Z-index scale consistente no CSS.

### Correções
- Memory leak no terminal (listener stacking a cada initTerminal).
- Preload.js quebrado com `require()` no contexto de preload.
- Inconsistentes de Escape e click-outside em popups.

## Versão 3.1.2

### Correções
- Loader infinito eliminado — overlay de loading removido, app inicia imediatamente.
- Monaco carrega em background sem bloquear a abertura da janela.

## Versão 3.1.1

### Correções
- Causa raiz do loader infinito: Monaco AMD loader não expunha `window.define` em Electron Renderer.
- Timeout IPC adicionado para Settings e Platform para evitar travamento.
- Watchdog global de 5 segundos como safety net.

## Versão 3.1.0

### Novidades
- Janela nativa do sistema operacional restaurada (frame: true).
- Menu nativo: Arquivo, Editar, Pesquisar, Formatar, Exibir, Configurações, Ajuda.
- Explorer funcional com árvore lazy-loading.
- Terminal integrado com xterm.js e shell real.
- Comandos Lignis auto-executáveis em Plain Text.

### Melhorias
- i18n: fallback comprehensivo para chaves não encontradas.
- CSP atualizado para xterm.js e Monaco workers.
