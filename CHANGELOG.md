# Changelog — Lignis

## Em desenvolvimento (pós 3.1.1)

> Nota: as correções listadas na versão 3.1.1 abaixo foram aplicadas no modo "band-aid" e **substituídas** pelas correções definitivas das Fases 2 e 3 a seguir.

### Fase 2 — Estabilização da inicialização
- **Causa raiz do loader infinito corrigida**: Havia um erro de sintaxe em `app.js` (string de ícone com aspas quebradas) que impedia o parse do arquivo inteiro e, portanto, a inicialização do Monaco. Com a causa real resolvida, os watchdogs e timeouts artificiais foram removidos.
- **Inicialização única do Monaco**: `EditorManager.init()` agora é *single-flight* (a mesma Promise é retornada em chamadas simultâneas) e falhas são reportadas pelo *errback* real do loader AMD — removido o timeout falso de 20s.
- **Inicialização do app sem watchdog global**: `App.start()` chama `EditorManager.init()` uma única vez e aguarda a Promise real; removidos o watchdog de 5s e o timeout artificial de 3s da detecção de plataforma.
- **Configurações sem timeout fake**: Removido o timeout de 5s do carregamento via IPC em `settings.js`.
- **Atualização pós download mais segura**: `update-install` agora instala no evento `closed` da janela (com flag para evitar dupla instalação), em vez de espera fixa de 2s.
- **Menu Exibir → Tema funcionando**: canal `set-theme` adicionado à whitelist de `ipcRenderer` do preload.

### Fase 3 — Higiene e operação totalmente offline
- **Layout padrão `vs/` restaurado para o Monaco**: A pasta `src/renderer/monaco` (achatada) virou `src/renderer/vs`, o layout canônico que o Monaco espera internamente. Isso corrige a falha de carregamento das strings de idioma nos workers web (`Failed trying to load default language strings [DOMException]`), que ocorria porque o worker resolvia módulos em `vs/...` fisicamente.
- **Carregamento de libs UMD antes do AMD**: `xterm`, `marked` e `DOMPurify` são carregados **antes** do `loader.js` do Monaco, evitando que seus factories UMD caiam no `define` global do AMD — eliminando os erros "Can only have one anonymous define call per script file" e "Duplicate definition of module".
- **Loader AMD do Monaco restaurado ao original**: Removido o patch anterior que forçava `define` global (36 patches do 3d47477), agora desnecessário e incorreto.
- **Protocolo `lignis://` para toda a interface**: `loadURL("lignis://app/index.html")` com `protocol.handle` + `net.fetch`, CSP atualizada (sem CDN, sem `file:`), permitindo caminhos absolutos estáveis (`lignis://app/vs/...`) para Monaco e workers em build empacotado.
- **Dependências de renderer vendored localmente**: `@xterm/xterm`, `@xterm/addon-fit`, `marked`, `dompurify` copiados para `src/renderer/vendor/` — sem CDN, 100% offline.
- **Canais IPC mortos removidos**: limpeza de `menu-close-right`, `menu-word-count`, `menu-toggle-comment`, `check-unsaved-before-close`, `window-fullscreen-changed` (preload e main).

---

## Versão 3.1.0

### Novidades
- **Terminal integrado**: Terminal real integrado ao editor, acessível via Ctrl+` ou Exibir → Terminal.
- **Explorador de pastas funcional**: Abra e navegue por pastas reais com árvore de arquivos, abrindo arquivos com um clique.
- **Abrir pasta via menu**: Adicionado "Abrir pasta..." no menu Arquivo (Ctrl+Shift+O).
- **Auto-execução de comandos**: Digite comandos do Lignis (como `$app.version()`) em modo Texto simples e pressione Espaço ou Enter para executar automaticamente.
- **Comandos no terminal**: Comandos do Lignis são reconhecidos no terminal integrado e executados localmente antes de serem enviados ao shell.
- **Atalho do terminal**: Ctrl+` para abrir/fechar o terminal integrado.

### Melhorias
- **Janela nativa do sistema**: Controles customizados de minimizar/maximizar/fechar removidos. O Lignis agora utiliza os controles nativos do sistema operacional.
- **Menus restaurados**: Menus Arquivo, Editar, Pesquisar, Formatar, Exibir, Configurações e Ajuda agora funcionam corretamente com a janela nativa.
- **Ícone dinâmico por tipo de arquivo**: Arquivos no explorador exibem ícones específicos por linguagem (JS, TS, Python, etc.).
- **Tratamento de traduções ausentes**: Fallbacks garante que nenhum texto interno apareça ao usuário quando uma tradução não estiver disponível.

### Correções
- **Corrigida referência à titlebar removida**: Removidas referências a elementos HTML que não existem mais.
- **Corrigida variável duplicada**: Removida declaração duplicada de workspacePath que poderia causar erro de inicialização.
- **Corrigido carregamento duplicado de xterm.js**: Removido comentário e script duplicados.
- **Adicionada chave de tradução faltante**: "editorCtx.toggleComment" adicionada ao locale pt-BR.

---

## Versão 3.0.0

### Novidades
- **Nova identidade**: NovaPad agora é **Lignis** — um editor de texto e código desktop moderno, rápido e extensível.
- **Pré-visualização HTML integrada**: Ao abrir um arquivo `.html` ou `.htm`, ative a pré-visualização ao vivo com sandbox de segurança.
- **Sistema de comandos inline**: Execute comandos úteis diretamente no editor com `$` (ex: `$local.datetime()`, `$uuid()`).
- **Comando de pré-visualização HTML**: Ative/desative a pré-visualização pela paleta de comandos ou menu Exibir.

### Novidades (atualização)
- **Sistema de atualização automática**: O Lignis verifica novas versões em background e permite baixar e instalar diretamente pelo aplicativo.
- **Monaco Editor instalado localmente**: O editor não depende mais de CDN para funcionar. Funciona completamente offline.
- **Scripts de release**: Comandos `npm run release:patch`, `npm run release:minor` e `npm run release:major` para publicar versões.
- **GitHub Actions**: Workflow automático para build e publicação de releases no GitHub.
- **Repositório preparado para publicação**: `.gitignore`, auditoria de segurança, e documentação interna incluídos.

### Melhorias
- **Inicialização do editor completamente reescrita**: O processo de abertura agora é real, com tratamento de erros, timeouts e estados claros.
- **Carregamento mais rápido e confiável**: Etapas de inicialização são sequenciais e verificáveis — não mais espera indefinida.
- **Tela de erro recuperável**: Se o editor não puder iniciar, uma tela com opção de tentar novamente ou fechar é exibida.
- **Migração segura de dados**: Configurações do NovaPad são migradas automaticamente para o novo formato.
- **Pré-visualização HTML isolada**: O iframe de preview usa sandbox com permissões mínimas para máxima segurança.
- **Autocomplete HTML melhorado**: Tags auto-close e linked editing habilitados para HTML.
- **Suporte a mais linguagens**: Melhorias gerais em syntax highlighting e autocomplete para todas as linguagens suportadas.
- **Comportamento offline**: O aplicativo funciona corretamente sem conexão à internet.
- **Dependências opcionais não bloqueiam**: Bibliotecas de animação e preview são carregadas de forma assíncrona.

### Correções
- **Corrigido problema que poderia manter o aplicativo preso na tela de carregamento**: O loader agora reflete o estado real da inicialização.
- **Corrigida inicialização do editor em ambientes sem internet**: Monaco tem timeout e fallback apropriados.
- **Corrigida exibição de ícones em toda a interface**: Font Awesome agora é carregado localmente, eliminando quadrados vazios causados por restrições de segurança de rede.
- **Corrigidos ícones em tema claro e escuro**: Fontes de ícones garantidas em ambos os temas com configuração explícita de font-family.
- **Corrigidas inconsistências na restauração de sessões**: Sessões com arquivos inexistente são tratadas corretamente.
- **Corrigidos problemas visuais na interface**: Ajustes de layout e estilos para maior consistência.
- **Corrigidos nomes de tema**: Nomes internos dos temas foram padronizados.

### Segurança
- **Pré-visualização HTML com sandbox restritivo**: Scripts do usuário rodam isolados do restante da aplicação.
- **Scripts bloqueados por padrão no preview HTML**: Opção disponível para ativar quando necessário.
- **Comandos inline sem execução de código arbitrário**: Parser determinístico sem `eval()` ou `new Function()`.
- **Reforçados controles de acesso a arquivos e comunicação interna**.

### Desempenho
- **Inicialização otimizada**: Etapas críticas são executadas em paralelo quando possível.
- **Preview HTML com debounce**: Atualizações do preview são espaçadas para evitar custo excessivo.
- **Gerenciamento de modelos do editor**: Cada documento possui modelo próprio, evitando recriação desnecessária.

---

## Versão 2.6.0

### Novidades
- Sistema de comandos inline seguros digitados diretamente no editor
- Ajuda → Comandos com pesquisa, categorias, cópia e inserção
- Execução via menu de contexto

### Melhorias
- Substituição completa de ícones por Font Awesome 6.5.1
- Configurações para comandos (ativar/desativar, autocomplete, destaques)
- Paleta de comandos expandida

### Correções
- Corrigidos ícones que apareciam como quadrados vazios
- Corrigidos ícones dinâmicos ausentes
- Corrigida compatibilidade com tema claro/escuro

### Segurança
- Parser de comandos sem eval() ou new Function()
- Comandos limitados a operações locais seguras

## Versão 2.5.1

### Correções
- Removida duplicação dos controles da janela
- Corrigido maximizar/restaurar
- Corrigido fechamento com documentos não salvos

### Melhorias
- Barra superior refinada
- Sistema centralizado de ícones

## Versão 2.5.0

### Novidades
- Sidebar/Explorador com Ctrl+B
- Quick Open com Ctrl+P
- Minimap toggle
- Bookmarks com Ctrl+F2 / F2 / Shift+F2
- Próxima ocorrência com Ctrl+D
- Codificação Base64, URL, HTML escape
- Inserir data, hora, ISO 8601, copiar UUID
- Ordenação natural
- Zoom picker e indentation picker na status bar
- Design tokens CSS
- Anime.js para microanimações
- 11 novas configurações do editor

## Versão 2.0.0

### Novidades
- Restauração de sessão
- Salvamento atômico
- Aba fixada (pin)
- Modo somente leitura
- Reordenação de abas
- Estatísticas do documento
- Autosave
- Tela de atalhos
- Seletor de linguagem
- Fuzzy search na paleta de comandos
- Interface 100% em PT-BR
