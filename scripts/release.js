#!/usr/bin/env node

/**
 * Lignis Release Script
 *
 * Usage:
 *   node scripts/release.js [patch|minor|major] [--dry-run]
 *
 * Examples:
 *   node scripts/release.js patch          # 3.0.0 → 3.0.1
 *   node scripts/release.js minor          # 3.0.1 → 3.1.0
 *   node scripts/release.js major          # 3.1.0 → 4.0.0
 *   node scripts/release.js patch --dry-run  # Validate without committing
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const REPO_URL = "https://github.com/VnDeveloperss/lignis.git";
const PRODUCTION_BRANCHES = ["main", "master"];

// Parse arguments
const args = process.argv.slice(2);
const bumpType = args[0];
const dryRun = args.includes("--dry-run");

// Validate arguments
if (!bumpType || !["patch", "minor", "major"].includes(bumpType)) {
  console.error("Uso: node scripts/release.js [patch|minor|major] [--dry-run]");
  console.error("  patch  - Incrementa versão de correção (3.0.0 → 3.0.1)");
  console.error("  minor  - Incrementa versão menor (3.0.1 → 3.1.0)");
  console.error("  major  - Incrementa versão maior (3.1.0 → 4.0.0)");
  process.exit(1);
}

// Helpers
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", ...opts }).trim();
  } catch (err) {
    return null;
  }
}

function runOrDie(cmd, message) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch (err) {
    console.error(`❌ ${message}`);
    console.error(err.message);
    process.exit(1);
  }
}

function incrementVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`❌ Versão inválida: ${version}`);
    process.exit(1);
  }

  switch (type) {
    case "patch": parts[2]++; break;
    case "minor": parts[2] = 0; parts[1]++; break;
    case "major": parts[2] = 0; parts[1] = 0; parts[0]++; break;
  }
  return parts.join(".");
}

// ═══════════════════════════════════════
// STEP 1: Validate environment
// ═══════════════════════════════════════
console.log("\n🔍 Validando ambiente...\n");

// Check Git
const gitVersion = run("git --version");
if (!gitVersion) {
  console.error("❌ Git não encontrado. Instale Git primeiro.");
  process.exit(1);
}
console.log(`  ✓ Git: ${gitVersion}`);

// Check Node
const nodeVersion = run("node --version");
console.log(`  ✓ Node: ${nodeVersion}`);

// ═══════════════════════════════════════
// STEP 2: Check Git status
// ═══════════════════════════════════════
console.log("\n📋 Verificando Git...\n");

const currentBranch = run("git rev-parse --abbrev-ref HEAD");
if (!currentBranch) {
  console.error("❌ Não foi possível detectar branch atual.");
  process.exit(1);
}
console.log(`  ✓ Branch: ${currentBranch}`);

if (!PRODUCTION_BRANCHES.includes(currentBranch)) {
  console.error(`❌ Release cancelada: branch "${currentBranch}" não é branch de produção.`);
  console.error(`  Branches permitidas: ${PRODUCTION_BRANCHES.join(", ")}`);
  if (!dryRun) process.exit(1);
  console.log("  ⚠️  Continuando em modo dry-run...");
}

// Check remote
const remote = run("git remote get-url origin");
if (remote) {
  console.log(`  ✓ Remote: ${remote}`);
} else {
  console.log("  ⚠️  Nenhum remote configurado.");
}

// Check clean working tree
const status = run("git status --porcelain");
if (status && status.length > 0) {
  console.log("  ⚠️  Existem alterações não commitadas:");
  status.split("\n").forEach((line) => {
    console.log(`     ${line}`);
  });
  if (!dryRun) {
    console.error("\n❌ Commit ou stash suas alterações antes de fazer release.");
    process.exit(1);
  }
  console.log("\n  ⚠️  Continuando em modo dry-run...");
}

// ═══════════════════════════════════════
// STEP 3: Read current version
// ═══════════════════════════════════════
console.log("\n📦 Versão atual...\n");

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf-8"));
const currentVersion = pkg.version;
const newVersion = incrementVersion(currentVersion, bumpType);

console.log(`  Atual:  ${currentVersion}`);
console.log(`  Nova:   ${newVersion}`);
console.log(`  Tipo:   ${bumpType}`);

// Validate semver format
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`❌ Versão resultante inválida: ${newVersion}`);
  process.exit(1);
}

// ═══════════════════════════════════════
// STEP 4: Security audit
// ═══════════════════════════════════════
console.log("\n🔒 Auditoria de segurança...\n");

const sensitivePatterns = [
  { pattern: /token/i, desc: "Token" },
  { pattern: /secret/i, desc: "Secret" },
  { pattern: /password/i, desc: "Password" },
  { pattern: /api_key/i, desc: "API Key" },
  { pattern: /GITHUB_TOKEN/i, desc: "GitHub Token" },
  { pattern: /PRIVATE KEY/i, desc: "Private Key" },
  { pattern: /Bearer /i, desc: "Bearer Token" },
];

const sourceFiles = run("git ls-files --cached -- '*.js' '*.json' '*.html' '*.css' '*.md' '*.yml' '*.yaml'");
if (sourceFiles) {
  let securityIssues = 0;
  sourceFiles.split("\n").forEach((file) => {
    if (!file || file.includes("node_modules") || file.includes(".git")) return;
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    sensitivePatterns.forEach(({ pattern, desc }) => {
      if (pattern.test(content) && !file.includes("CHANGELOG") && !file.includes("RELEASING")) {
        // Filter out false positives in comments/docs
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (pattern.test(line) && !line.includes("//") && !line.includes("desc:") && !line.includes("description")) {
            // Only flag if it looks like an actual credential
            if (/['"]([A-Za-z0-9_\-]{20,})['"]/.test(line) || /ghp_|gho_|github_pat_/.test(line)) {
              console.log(`  ⚠️  Possível credencial em ${file}:${idx + 1}`);
              securityIssues++;
            }
          }
        });
      }
    });
  });

  if (securityIssues > 0) {
    console.error(`\n❌ ${securityIssues} possível(is) credencial(is) encontrada(s).`);
    if (!dryRun) process.exit(1);
  } else {
    console.log("  ✓ Nenhuma credencial encontrada.");
  }
}

// Check for local paths
const localPathPattern = /C:\\\\Users\\\\|\/home\/|\/Users\//;
if (sourceFiles) {
  sourceFiles.split("\n").forEach((file) => {
    if (!file) return;
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    if (localPathPattern.test(content) && !file.includes("CHANGELOG") && !file.includes("RELEASING")) {
      console.log(`  ⚠️  Possível path local em ${file}`);
    }
  });
}

// ═══════════════════════════════════════
// STEP 5: Build validation
// ═══════════════════════════════════════
console.log("\n🔨 Validando build...\n");

// Check if electron-builder is available
const ebAvailable = run("npx electron-builder --version");
if (ebAvailable) {
  console.log(`  ✓ electron-builder: ${ebAvailable}`);
} else {
  console.log("  ⚠️  electron-builder não encontrado.");
}

// Check if all source files exist
const criticalFiles = [
  "src/main/main.js",
  "src/renderer/index.html",
  "src/renderer/app.js",
  "src/renderer/editor.js",
  "src/renderer/monaco/loader.js",
  "src/renderer/monaco-setup.js",
];

let missingFiles = false;
criticalFiles.forEach((file) => {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ Arquivo ausente: ${file}`);
    missingFiles = true;
  } else {
    console.log(`  ✓ ${file}`);
  }
});

if (missingFiles && !dryRun) {
  process.exit(1);
}

// ═══════════════════════════════════════
// STEP 6: Summary
// ═══════════════════════════════════════
console.log("\n" + "═".repeat(50));
console.log("\n  📋 RESUMO DO RELEASE\n");
console.log(`  Versão:    ${currentVersion} → ${newVersion}`);
console.log(`  Branch:    ${currentBranch}`);
console.log(`  Remote:    ${remote || "Nenhum"}`);
console.log(`  Tipo:      ${bumpType}`);
console.log(`  Dry-run:   ${dryRun ? "Sim" : "Não"}`);
console.log(`  Repo:      ${REPO_URL}`);
console.log("\n" + "═".repeat(50));

// ═══════════════════════════════════════
// STEP 7: Confirmation (non dry-run)
// ═══════════════════════════════════════
if (!dryRun) {
  console.log("\n⚠️  Esta ação irá:");
  console.log("  1. Atualizar versão no package.json");
  console.log("  2. Criar commit: release: v" + newVersion);
  console.log("  3. Criar tag: v" + newVersion);
  console.log("  4. Push para origin/" + currentBranch);
  console.log("  5. Push tag v" + newVersion);
  console.log("  6. Criar GitHub Release (se gh CLI disponível)");
  console.log("\n");

  // In a real script, we'd use readline for confirmation
  // For now, require --confirm flag
  const confirmed = args.includes("--confirm");
  if (!confirmed) {
    console.log("  Para confirmar, adicione --confirm ao comando:");
    console.log(`    node scripts/release.js ${bumpType} --confirm`);
    console.log("\n  Ou use --dry-run para testar sem executar:");
    console.log(`    node scripts/release.js ${bumpType} --dry-run`);
    process.exit(0);
  }
}

// ═══════════════════════════════════════
// STEP 8: Execute release
// ═══════════════════════════════════════
if (dryRun) {
  console.log("\n✅ Dry-run concluído com sucesso.");
  console.log("  Nenhuma alteração foi feita.");
  process.exit(0);
}

console.log("\n🚀 Executando release...\n");

// Update version
console.log("  → Atualizando versão...");
pkg.version = newVersion;
fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");

// Run npm install to update package-lock.json
console.log("  → Atualizando package-lock.json...");
try {
  execSync("npm install --package-lock-only", { cwd: ROOT, stdio: "pipe" });
} catch (err) {
  console.log("  ⚠️  Falha ao atualizar package-lock.json, continuando...");
}

// Commit
console.log("  → Criando commit...");
runOrDie(`git add package.json package-lock.json`, "Falha ao adicionar arquivos.");
runOrDie(`git commit -m "release: v${newVersion}"`, "Falha ao criar commit.");

// Tag
console.log("  → Criando tag...");
runOrDie(`git tag v${newVersion}`, "Falha ao criar tag.");

// Push
console.log("  → Push para remote...");
runOrDie(`git push origin ${currentBranch}`, "Falha ao pushar branch.");
runOrDie(`git push origin v${newVersion}`, "Falha ao pushar tag.");

// GitHub Release (if gh CLI available)
const ghAvailable = run("gh --version");
if (ghAvailable) {
  console.log("  → Criando GitHub Release...");
  try {
    const releaseNotes = `Lignis v${newVersion}\n\nConsulte o CHANGELOG.md para detalhes completos.`;
    execSync(
      `gh release create v${newVersion} --title "Lignis v${newVersion}" --notes "${releaseNotes}"`,
      { cwd: ROOT, stdio: "pipe" }
    );
    console.log("  ✓ GitHub Release criado.");
  } catch (err) {
    console.log("  ⚠️  Não foi possível criar GitHub Release automaticamente.");
    console.log("    Crie manualmente: gh release create v" + newVersion);
  }
} else {
  console.log("\n  ℹ️  GitHub CLI (gh) não encontrado.");
  console.log("    Crie a release manualmente:");
  console.log(`    gh release create v${newVersion} --title "Lignis v${newVersion}" --notes "..."`);
}

console.log("\n" + "═".repeat(50));
console.log(`\n  ✅ Release v${newVersion} concluído com sucesso!\n`);
console.log(`  🔗 https://github.com/VnDeveloperss/lignis/releases/tag/v${newVersion}\n`);
console.log("═".repeat(50));
