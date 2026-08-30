# Guia de Release — Lignis (Desenvolvedores)

Este documento é para desenvolvedores do Lignis. Não é para usuários finais.

---

## Pré-requisitos

### Ferramentas necessárias

- [Node.js](https://nodejs.org/) v20+
- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (opcional, para criar releases automaticamente)

### Autenticação Git

Use SSH ou HTTPS com credenciais configuradas:

```bash
# Verificar autenticação
git remote -v
```

### GitHub CLI (recomendado)

```bash
# Instalar
winget install GitHub.cli

# Autenticar
gh auth login
```

---

## Comandos Disponíveis

### Dry Run (Testar sem executar)

```bash
npm run release:dry
```

Ou:

```bash
node scripts/release.js patch --dry-run
node scripts/release.js minor --dry-run
node scripts/release.js major --dry-run
```

O dry-run:
- ✅ Valida o ambiente
- ✅ Verifica Git
- ✅ Audita segurança
- ✅ Valida arquivos críticos
- ❌ NÃO commita
- ❌ NÃO taggeia
- ❌ NÃO pusha
- ❌ NÃO cria release

### Release Patch (Correção)

```bash
npm run release:patch -- --confirm
# 3.0.0 → 3.0.1
```

### Release Minor (Nova funcionalidade)

```bash
npm run release:minor -- --confirm
# 3.0.1 → 3.1.0
```

### Release Major (Quebra de compatibilidade)

```bash
npm run release:major -- --confirm
# 3.1.0 → 4.0.0
```

---

## O que o script de release faz

1. **Valida ambiente** — Git, Node.js, branch, remote
2. **Audita segurança** — Procura tokens, secrets, paths locais
3. **Valida arquivos** — Verifica arquivos críticos existem
4. **Atualiza versão** — Em `package.json`
5. **Commit** — `release: vX.Y.Z`
6. **Tag** — `vX.Y.Z`
7. **Push** — Branch + tag
8. **GitHub Release** — Se `gh` CLI disponível

---

## Fluxo Manual (sem script)

### 1. Atualizar versão

```bash
# Editar package.json
# Mudar "version": "3.0.0" para "3.0.1"
```

### 2. Atualizar CHANGELOG

Editar `CHANGELOG.md` com as mudanças.

### 3. Commit

```bash
git add package.json CHANGELOG.md
git commit -m "release: v3.0.1"
```

### 4. Tag

```bash
git tag v3.0.1
```

### 5. Push

```bash
git push origin main
git push origin v3.0.1
```

### 6. GitHub Release

```bash
gh release create v3.0.1 --title "Lignis v3.0.1" --notes "..."
```

Ou manualmente em: https://github.com/VnDeveloperss/lignis/releases/new

---

## Build Local

### Windows

```bash
npm run build:win
```

O instalador será gerado em `dist/`.

### Linux

```bash
npm run build:linux
```

### macOS

```bash
npm run build:mac
```

---

## Checklist de Release

Antes de cada release:

- [ ] Código compila sem erros
- [ ] `npm start` funciona
- [ ] Monaco Editor carrega offline
- [ ] Nenhuma credencial no código
- [ ] CHANGELOG atualizado
- [ ] Versão correta no package.json
- [ ] `.gitignore` não inclui arquivos sensíveis
- [ ] Testes manuais básicos passaram

---

## Rollback

Se uma versão tiver problema grave:

1. **NÃO delete a tag** — tags são imutáveis
2. **Crie uma nova versão corrigida**
3. Exemplo: `3.0.1` com problema → `3.0.2` com correção

Para inspecionar uma versão antiga:

```bash
git switch --detach v3.0.0
```

Para criar branch de rollback:

```bash
git switch -c hotfix/v3.0.2 v3.0.1
```

---

## GitHub Actions

O workflow `.github/workflows/release.yml` é acionado quando uma tag `v*` é pushada.

Ele:
1. Faz checkout do código
2. Instala dependências
3. Faz build para Windows
4. Gera checksums
5. Cria GitHub Release com artefatos

O workflow usa `secrets.GITHUB_TOKEN` (fornecido automaticamente pelo GitHub).

---

## Auto Update

O Lignis verifica atualizações em background ao iniciar.

- Configurado via `electron-updater`
- Provider: GitHub Releases
- Repo: `VnDeveloperss/lignis`
- Canal: `stable`

Para testar:
1. Crie uma release com versão maior
2. Abra uma versão antiga do Lignis
3. Aguarde ~5 segundos
4. O modal de atualização deve aparecer

---

## Troubleshooting

### "Release cancelada: branch não é de produção"

Você está em uma branch diferente de `main`/`master`. Mude para a branch correta.

### "Não foi possível criar GitHub Release"

Verifique se `gh auth login` foi executado.

### Build falha

Verifique se `npm install` foi executado e se não há erros de compilação.

### Auto update não funciona

Verifique se:
- A release foi publicada no GitHub
- O `latest.yml` foi gerado e anexado
- O repositório é público
