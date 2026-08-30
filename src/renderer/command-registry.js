// ========================================
// Command Registry — Lignis
// Unique source of truth for parser, autocomplete, execution, help,
// editor integration, and terminal command support.
//========================================

/**
 * Parse a `$command()` token from editor input.
 * Returns { namespace, command, args } or null if not a Lignis command.
 */
function parseLignisCommand(text) {
  // Must start with $ and have the pattern $namespace.command(args)
  // We do NOT intercept $env:PATH or other PowerShell-native expressions.
  const match = text.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]*)\)$/;
  if (!match) return null;

  const [, namespace, command, argsStr] = match;
  const args = argsStr.split(',').map(a => a.trim()).filter(a => a.length > 0);

  return { namespace, command, args };
}

/**
 * Registry of internal Lignis commands.
 * Each entry: { execute, help, terminalSupport, editorSupport }.
 */
const commandRegistry = {

  // --- Version ---
  version: {
    execute: () => { try { return require('electron').app.getVersion(); } catch (_) { return 'unknown'; } },
    help: 'Mostra a versão do aplicativo.',
    terminalSupport: true,
    editorSupport: true,
  },

  // --- Local date/time ---
  date: {
    execute: () => new Date().toLocaleDateString(),
    help: 'Mostra a data local.',
    terminalSupport: true,
    editorSupport: true,
  },

  time: {
    execute: () => new Date().toLocaleTimeString(),
    help: 'Mostra a hora local.',
    terminalSupport: true,
    editorSupport: true,
  },

  datetime: {
    execute: () => new Date().toLocaleString(),
    help: 'Mostra data e hora local.',
    terminalSupport: true,
    editorSupport: true,
  },

  // --- UUID ---
  uuid: {
    execute: () => {
      // Simple UUID v4-like generation (6 hex bytes + dashes)
      const S4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
      return `${S4()}${S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}`;
    },
    help: 'Gera um UUID aleatório.',
    terminalSupport: true,
    editorSupport: true,
  },

  // --- Random integer ---
  'random.int': {
    execute: (min, max) => {
      const lo = parseInt(min, 10) || 1;
      const hi = parseInt(max, 10) || 100;
      if (isNaN(lo) || isNaN(hi)) return null;
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    },
    help: 'Número aleatório inteiro entre min e max.',
    terminalSupport: true,
    editorSupport: true,
  },

  // --- Commands list ---
  commands: {
    execute: () => {
      const items = [];
      for (const key of Object.keys(commandRegistry)) {
        const info = commandRegistry[key];
        items.push(`${key}: ${info.help || ''}`);
      }
      return { success: true, data: items.join('\n') };
    },
    help: 'Lista todos os comandos Lignis disponíveis.',
    terminalSupport: true,
    editorSupport: true,
  },

  // --- Help ---
  help: {
    execute: () => {
      const lines = [];
      for (const key of Object.keys(commandRegistry)) {
        const info = commandRegistry[key];
        lines.push(`$${key}() — ${info.help || 'sem descrição'}`);
      }
      return { success: true, data: lines.join('\n') };
    },
    help: 'Mostra ajuda resumida dos comandos Lignis.',
    terminalSupport: true,
    editorSupport: true,
  },
};

/**
 * Executa um comando Lignis parsed.
 * Retorna o resultado para o caller (editor ou terminal).
 */
function executeCommand({ namespace, command, args }) {
  const cmd = commandRegistry[command];
  if (!cmd) return null; // não é comando Lignis -> seguir para shell

  // Verificar suporte ao editor
  if (cmd.editorSupport !== false) {
    try {
      const result = cmd.execute(...args);
      return { success: true, value: result, type: 'editor' };
    } catch (e) {
      return { success: false, error: e.message, type: 'editor' };
    }
  }

  // Se só tem suporte terminal
  if (cmd.terminalSupport) {
    return { success: true, value: cmd.execute(...args), type: 'terminal' };
  }

  return null;
}

/**
 * Verifica se uma linha digitada deve ser tratada como comando Lignis
 * ou enviada integralmente ao shell (especialmente importante no PowerShell).
 */
function shouldIntercept(text) {
  // Se NÃO começar com $, não é comando Lignis
  if (text.length === 0 || text[0] !== '$') return false;

  const parsed = parseLignisCommand(text);
  if (!parsed) return false; // $ sozinho ou $sem-formato -> shell

  const { namespace, command } = parsed;

  // Bloquear comandos que colidem com PowerShell nativo APENAS se não for exatamente
  // um comando Lignis cadastrado. Qualquer $outro.goza() vai para o shell.
  // O CommandRegistry é a fonte única de verdade.
  return commandRegistry[command] !== undefined;
}

/**
 * Obtém a lista de todos os comandos disponíveis (para o Command Palette / Ajuda).
 */
function getAllCommands() {
  const result = [];
  for (const key of Object.keys(commandRegistry)) {
    const info = commandRegistry[key];
    result.push({ key, help: info.help });
  }
  return result;
}

/* Export for preload/main */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseLignisCommand,
    executeCommand,
    shouldIntercept,
    getAllCommands,
    commandRegistry,
  };
}

// Expor globalmente para o renderer (compatibilidade com window.lignisAPI)
if (typeof window !== 'undefined') {
  window.lignisAPI = window.lignisAPI || {};
  window.lignisAPI.CommandRegistry = {
    parse: parseLignisCommand,
    execute: executeCommand,
    intercept: shouldIntercept,
    list: getAllCommands,
  };
}