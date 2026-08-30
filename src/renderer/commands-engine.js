// ========================================
// Lignis v3.1.1 - Commands Engine
// Safe inline command system (NO eval)
// ========================================

const LignisCommands = (function () {
  let enabled = true;
  let autocompleteEnabled = true;
  let highlightEnabled = true;
  let decorationIds = [];

  // ─── Command Registry ─────────────────
  const registry = [];

  function register(cmd) {
    registry.push(cmd);
  }

  function findCommand(id) {
    return registry.find(c => c.id === id);
  }

  // ─── Safe Argument Parser ──────────────
  // Parses: $namespace.command("string", 123, true)
  // Returns { namespace, name, args } or null
  function parse(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("$")) return null;

    // Match $[namespace.]command(args)
    const match = trimmed.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/s);
    if (!match) {
      // Try no-namespace: $command(args)
      const match2 = trimmed.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)\(\)$/);
      if (match2) {
        return { namespace: null, name: match2[1], args: [] };
      }
      return null;
    }

    const namespace = match[1];
    const name = match[2];
    const argsStr = match[3].trim();

    if (!argsStr) return { namespace, name, args: [] };

    const args = parseArgs(argsStr);
    if (args === null) return null;

    return { namespace, name, args };
  }

  function parseArgs(argsStr) {
    const args = [];
    let i = 0;

    while (i < argsStr.length) {
      // Skip whitespace and commas
      while (i < argsStr.length && (argsStr[i] === " " || argsStr[i] === "\t" || argsStr[i] === ",")) i++;
      if (i >= argsStr.length) break;

      const ch = argsStr[i];

      if (ch === '"') {
        // String argument with escaping
        i++; // skip opening quote
        let str = "";
        while (i < argsStr.length) {
          if (argsStr[i] === "\\" && i + 1 < argsStr.length) {
            const next = argsStr[i + 1];
            if (next === '"') { str += '"'; i += 2; }
            else if (next === "\\") { str += "\\"; i += 2; }
            else if (next === "n") { str += "\n"; i += 2; }
            else if (next === "t") { str += "\t"; i += 2; }
            else if (next === "r") { str += "\r"; i += 2; }
            else { str += argsStr[i]; i++; }
          } else if (argsStr[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            str += argsStr[i];
            i++;
          }
        }
        args.push({ type: "string", value: str });
      } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
        // Number argument
        let numStr = "";
        while (i < argsStr.length && argsStr[i] !== "," && argsStr[i] !== ")") {
          numStr += argsStr[i];
          i++;
        }
        const num = Number(numStr);
        if (isNaN(num)) return null;
        args.push({ type: "number", value: num });
      } else if (argsStr.substring(i, i + 4) === "true") {
        args.push({ type: "boolean", value: true });
        i += 4;
      } else if (argsStr.substring(i, i + 5) === "false") {
        args.push({ type: "boolean", value: false });
        i += 5;
      } else if (argsStr[i] === "n" && argsStr.substring(i, i + 4) === "null") {
        args.push({ type: "null", value: null });
        i += 4;
      } else {
        return null; // Unknown token
      }
    }

    return args;
  }

  // ─── Execute Command ──────────────────
  function execute(commandText) {
    if (!enabled) return { success: false, error: "Os comandos estão desativados." };

    const parsed = parse(commandText);
    if (!parsed) {
      return { success: false, error: `Comando inválido: ${commandText}` };
    }

    const cmd = findCommand(parsed.namespace ? `${parsed.namespace}.${parsed.name}` : parsed.name);
    if (!cmd) {
      return { success: false, error: `Comando desconhecido: ${parsed.namespace ? parsed.namespace + "." : ""}${parsed.name}` };
    }

    // Validate args
    if (cmd.argCount !== undefined && parsed.args.length !== cmd.argCount) {
      return { success: false, error: `O comando ${commandText} requer ${cmd.argCount} argumento(s).` };
    }

    try {
      const result = cmd.execute(parsed.args);
      // Handle async commands (return Promises)
      if (result && typeof result.then === "function") {
        return result.then(val => ({ success: true, value: val })).catch(e => ({
          success: false, error: `Erro ao executar ${commandText}: ${e.message}`,
        }));
      }
      return { success: true, value: result };
    } catch (e) {
      return { success: false, error: `Erro ao executar ${commandText}: ${e.message}` };
    }
  }

  // ─── Try Execute in Line ──────────────
  function tryExecuteInLine(lineText) {
    // Find all $command(...) patterns in the line
    const regex = /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\([^)]*\)/g;
    let result = lineText;
    let anyReplaced = false;
    let match;

    while ((match = regex.exec(lineText)) !== null) {
      const cmdText = match[0];
      const execResult = execute(cmdText);
      if (execResult.success) {
        result = result.replace(cmdText, String(execResult.value));
        anyReplaced = true;
      }
    }

    return { text: result, replaced: anyReplaced };
  }

  // ─── Autocomplete Provider ────────────
  function getAutocompleteSuggestions(model, position) {
    if (!enabled || !autocompleteEnabled) return [];

    const line = model.getLineContent(position.lineNumber);
    const textBefore = line.substring(0, position.column - 1);

    // Check if we're typing after $
    const dollarMatch = textBefore.match(/\$([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)?$/);
    if (!dollarMatch) return [];

    const partial = dollarMatch[0]; // e.g., "$local." or "$u"

    const suggestions = registry.map(cmd => {
      const syntax = cmd.syntax;
      if (!syntax.startsWith("$")) return null;

      // Check if the partial matches the beginning of this command
      if (!syntax.toLowerCase().startsWith(partial.toLowerCase())) return null;

      return {
        label: syntax,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: syntax,
        detail: cmd.description,
        documentation: cmd.examples ? cmd.examples.join("\n") : "",
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
      };
    }).filter(Boolean);

    return suggestions;
  }

  // ─── Register Completion Provider ─────
  function registerCompletionProvider(monaco) {
    if (!monaco) return;

    monaco.languages.registerCompletionItemProvider("plaintext", {
      triggerCharacters: ["$"],
      provideCompletionItems: (model, position) => {
        return { suggestions: getAutocompleteSuggestions(model, position) };
      },
    });

    // Also register for all common languages
    const languages = ["javascript", "typescript", "json", "html", "css", "python", "markdown", "xml", "yaml", "sql"];
    languages.forEach(lang => {
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ["$"],
        provideCompletionItems: (model, position) => {
          return { suggestions: getAutocompleteSuggestions(model, position) };
        },
      });
    });
  }

  // ─── Command Decorations ──────────────
  function updateDecorations(editor, model) {
    if (!enabled || !highlightEnabled || !editor || !model) return;

    // Remove old decorations
    if (decorationIds.length > 0) {
      decorationIds = editor.deltaDecorations(decorationIds, []);
    }

    const text = model.getValue();
    if (text.length > 500000) return; // Skip for large files

    const regex = /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\([^)]*\)/g;
    const newDecorations = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);

      // Check if it's a valid command
      const parsed = parse(match[0]);
      const isValid = parsed && findCommand(parsed.namespace ? `${parsed.namespace}.${parsed.name}` : parsed.name);

      newDecorations.push({
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        ),
        options: {
          inlineClassName: isValid ? "cmd-highlight" : "cmd-invalid",
          hoverMessage: isValid
            ? { value: `**NovaCommand**: \`${match[0]}\`` }
            : { value: `**Comando desconhecido**: \`${match[0]}\`` },
        },
      });
    }

    decorationIds = editor.deltaDecorations(decorationIds, newDecorations);
  }

  // ─── Help Dialog ──────────────────────
  function openHelp() {
    const overlay = document.getElementById("commands-help-overlay");
    const list = document.getElementById("commands-help-list");
    const input = document.getElementById("commands-help-input");
    overlay.classList.remove("hidden");
    input.value = "";
    renderHelpList(list, "");
    input.focus();

    input.oninput = () => renderHelpList(list, input.value);
    document.getElementById("commands-help-close-btn").onclick = closeHelp;
    overlay.onclick = (e) => { if (e.target === overlay) closeHelp(); };
  }

  function closeHelp() {
    document.getElementById("commands-help-overlay").classList.add("hidden");
  }

  function renderHelpList(listEl, filter) {
    const filterLower = (filter || "").toLowerCase();

    // Group by category
    const categories = {};
    registry.forEach(cmd => {
      const cat = cmd.category || "Geral";
      if (filterLower && !cmd.syntax.toLowerCase().includes(filterLower) &&
          !cmd.description.toLowerCase().includes(filterLower) &&
          !cat.toLowerCase().includes(filterLower)) return;
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(cmd);
    });

    listEl.innerHTML = "";
    const catIcons = {
      "Data e hora": "fa-clock",
      "Identificadores": "fa-fingerprint",
      "Texto": "fa-font",
      "Codificação": "fa-code",
      "Hash": "fa-shield-halved",
      "Números": "fa-calculator",
      "Seleção": "fa-i-cursor",
      "JSON": "fa-code",
      "URL": "fa-link",
      "Documento": "fa-file-lines",
      "Aplicativo": "fa-circle-info",
    };

    Object.keys(categories).sort().forEach(cat => {
      const catEl = document.createElement("div");
      catEl.className = "commands-help-category";
      catEl.innerHTML = `<i class="fa-solid ${catIcons[cat] || "fa-terminal"}"></i> ${cat}`;
      listEl.appendChild(catEl);

      categories[cat].forEach(cmd => {
        const item = document.createElement("div");
        item.className = "commands-help-item";
        item.innerHTML = `
          <div class="commands-help-item-header">
            <code class="commands-help-syntax">${cmd.syntax}</code>
            <button class="commands-help-copy" title="Copiar sintaxe" aria-label="Copiar sintaxe"><i class="fa-regular fa-copy"></i></button>
            <button class="commands-help-insert" title="Inserir no editor" aria-label="Inserir no editor"><i class="fa-solid fa-arrow-right-to-bracket"></i></button>
          </div>
          <div class="commands-help-desc">${cmd.description}</div>
          ${cmd.examples ? `<div class="commands-help-examples"><strong>Exemplo:</strong> <code>${cmd.examples[0]}</code></div>` : ""}
        `;

        item.querySelector(".commands-help-copy").onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(cmd.syntax).then(() => {
            if (typeof App !== "undefined") App.showToast("Sintaxe copiada.", "success");
          });
        };

        item.querySelector(".commands-help-insert").onclick = (e) => {
          e.stopPropagation();
          if (typeof EditorManager !== "undefined") {
            EditorManager.insertText(cmd.syntax);
            closeHelp();
          }
        };

        listEl.appendChild(item);
      });
    });
  }

  // ─── Settings ─────────────────────────
  function setEnabled(val) { enabled = val; }
  function setAutocompleteEnabled(val) { autocompleteEnabled = val; }
  function setHighlightEnabled(val) { highlightEnabled = val; }
  function isEnabled() { return enabled; }

  // ─── Register All Commands ────────────
  function registerAll() {
    // ─── Data e hora ─────────────────────
    register({
      id: "local.date",
      syntax: "$local.date()",
      description: "Substitui pela data local atual no formato DD/MM/AAAA.",
      category: "Data e hora",
      examples: ["Criado em: $local.date()"],
      argCount: 0,
      execute: () => {
        const n = new Date();
        const pad = v => String(v).padStart(2, "0");
        return `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${n.getFullYear()}`;
      },
    });

    register({
      id: "local.time",
      syntax: "$local.time()",
      description: "Substitui pela hora local atual no formato HH:MM:SS.",
      category: "Data e hora",
      examples: ["Hora: $local.time()"],
      argCount: 0,
      execute: () => {
        const n = new Date();
        const pad = v => String(v).padStart(2, "0");
        return `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
      },
    });

    register({
      id: "local.datetime",
      syntax: "$local.datetime()",
      description: "Substitui pela data e hora local atuais.",
      category: "Data e hora",
      examples: ["Criado em: $local.datetime()"],
      argCount: 0,
      execute: () => {
        const n = new Date();
        const pad = v => String(v).padStart(2, "0");
        return `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${n.getFullYear()} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
      },
    });

    register({
      id: "local.iso",
      syntax: "$local.iso()",
      description: "Substitui pela data/hora local em formato ISO 8601.",
      category: "Data e hora",
      examples: ["Data ISO: $local.iso()"],
      argCount: 0,
      execute: () => new Date().toISOString(),
    });

    // Alias: $local.data(UTF) = $local.datetime()
    register({
      id: "local.data",
      syntax: "$local.data(UTF)",
      description: "Alias compatível para data/hora local. Recomenda-se usar $local.datetime().",
      category: "Data e hora",
      examples: ["Criado em: $local.data(UTF)"],
      argCount: 1,
      execute: () => {
        const n = new Date();
        const pad = v => String(v).padStart(2, "0");
        return `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${n.getFullYear()} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
      },
    });

    register({
      id: "utc.datetime",
      syntax: "$utc.datetime()",
      description: "Substitui pela data e hora UTC atuais.",
      category: "Data e hora",
      examples: ["UTC: $utc.datetime()"],
      argCount: 0,
      execute: () => {
        const n = new Date();
        const pad = v => String(v).padStart(2, "0");
        return `${pad(n.getUTCDate())}/${pad(n.getUTCMonth() + 1)}/${n.getUTCFullYear()} ${pad(n.getUTCHours())}:${pad(n.getUTCMinutes())}:${pad(n.getUTCSeconds())} UTC`;
      },
    });

    register({
      id: "timestamp",
      syntax: "$timestamp()",
      description: "Substitui pelo Unix timestamp (segundos desde 01/01/1970).",
      category: "Data e hora",
      examples: ["Timestamp: $timestamp()"],
      argCount: 0,
      execute: () => Math.floor(Date.now() / 1000).toString(),
    });

    register({
      id: "timestamp.ms",
      syntax: "$timestamp.ms()",
      description: "Substitui pelo Unix timestamp em milissegundos.",
      category: "Data e hora",
      examples: ["Timestamp: $timestamp.ms()"],
      argCount: 0,
      execute: () => Date.now().toString(),
    });

    // ─── Identificadores ─────────────────
    register({
      id: "uuid",
      syntax: "$uuid()",
      description: "Gera um UUID v4 seguro.",
      category: "Identificadores",
      examples: ["ID: $uuid()"],
      argCount: 0,
      execute: () => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
      },
    });

    // ─── Texto ───────────────────────────
    register({
      id: "text.upper",
      syntax: '$text.upper("texto")',
      description: "Converte o texto para maiúsculas.",
      category: "Texto",
      examples: ['$text.upper("lignis") → LIGNIS'],
      argCount: 1,
      execute: (args) => String(args[0].value).toUpperCase(),
    });

    register({
      id: "text.lower",
      syntax: '$text.lower("TEXTO")',
      description: "Converte o texto para minúsculas.",
      category: "Texto",
      examples: ['$text.lower("LIGNIS") → lignis'],
      argCount: 1,
      execute: (args) => String(args[0].value).toLowerCase(),
    });

    register({
      id: "text.length",
      syntax: '$text.length("texto")',
      description: "Retorna o comprimento do texto.",
      category: "Texto",
      examples: ['$text.length("Lignis") → 6'],
      argCount: 1,
      execute: (args) => String(args[0].value).length.toString(),
    });

    // ─── Codificação ─────────────────────
    register({
      id: "base64.encode",
      syntax: '$base64.encode("texto")',
      description: "Codifica o texto em Base64.",
      category: "Codificação",
      examples: ['$base64.encode("Lignis") → TWFuZXM='],
      argCount: 1,
      execute: (args) => btoa(unescape(encodeURIComponent(String(args[0].value)))),
    });

    register({
      id: "base64.decode",
      syntax: '$base64.decode("código")',
      description: "Decodifica uma string Base64.",
      category: "Codificação",
      examples: ['$base64.decode("TWFuZXM=") → Lignis'],
      argCount: 1,
      execute: (args) => decodeURIComponent(escape(atob(String(args[0].value)))),
    });

    register({
      id: "url.encode",
      syntax: '$url.encode("texto")',
      description: "Codifica o texto para uso em URL.",
      category: "URL",
      examples: ['$url.encode("Olá mundo") → Ol%C3%A1%20mundo'],
      argCount: 1,
      execute: (args) => encodeURIComponent(String(args[0].value)),
    });

    register({
      id: "url.decode",
      syntax: '$url.decode("código")',
      description: "Decodifica uma URL codificada.",
      category: "URL",
      examples: ['$url.decode("Ol%C3%A1%20mundo") → Olá mundo'],
      argCount: 1,
      execute: (args) => decodeURIComponent(String(args[0].value)),
    });

    // ─── JSON ────────────────────────────
    register({
      id: "json.escape",
      syntax: '$json.escape("texto")',
      description: "Escapa o texto para uso em JSON string.",
      category: "JSON",
      examples: ['$json.escape(\'Ola "mundo"\') → Ola \\"mundo\\"'],
      argCount: 1,
      execute: (args) => JSON.stringify(String(args[0].value)),
    });

    // ─── Hash ────────────────────────────
    register({
      id: "hash.sha256",
      syntax: '$hash.sha256("texto")',
      description: "Gera o hash SHA-256 do texto.",
      category: "Hash",
      examples: ['$hash.sha256("Lignis") → a3f2...'],
      argCount: 1,
      execute: async (args) => {
        const text = String(args[0].value);
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      },
    });

    // ─── Números / Math ──────────────────
    register({
      id: "math.sum",
      syntax: "$math.sum(10, 20)",
      description: "Soma dois ou mais números.",
      category: "Números",
      examples: ["$math.sum(10, 20) → 30"],
      execute: (args) => {
        const nums = args.map(a => { if (a.type !== "number") throw new Error("Todos os argumentos devem ser números."); return a.value; });
        return nums.reduce((a, b) => a + b, 0).toString();
      },
    });

    register({
      id: "math.subtract",
      syntax: "$math.subtract(10, 5)",
      description: "Subtrai dois números.",
      category: "Números",
      examples: ["$math.subtract(10, 5) → 5"],
      argCount: 2,
      execute: (args) => {
        if (args[0].type !== "number" || args[1].type !== "number") throw new Error("Argumentos devem ser números.");
        return (args[0].value - args[1].value).toString();
      },
    });

    register({
      id: "math.multiply",
      syntax: "$math.multiply(4, 5)",
      description: "Multiplica dois números.",
      category: "Números",
      examples: ["$math.multiply(4, 5) → 20"],
      argCount: 2,
      execute: (args) => {
        if (args[0].type !== "number" || args[1].type !== "number") throw new Error("Argumentos devem ser números.");
        return (args[0].value * args[1].value).toString();
      },
    });

    register({
      id: "math.divide",
      syntax: "$math.divide(10, 2)",
      description: "Divide dois números.",
      category: "Números",
      examples: ["$math.divide(10, 2) → 5"],
      argCount: 2,
      execute: (args) => {
        if (args[0].type !== "number" || args[1].type !== "number") throw new Error("Argumentos devem ser números.");
        if (args[1].value === 0) throw new Error("Divisão por zero não é permitida.");
        return (args[0].value / args[1].value).toString();
      },
    });

    register({
      id: "math.round",
      syntax: "$math.round(4.567, 2)",
      description: "Arredonda um número para N casas decimais.",
      category: "Números",
      examples: ["$math.round(4.567, 2) → 4.57"],
      argCount: 2,
      execute: (args) => {
        if (args[0].type !== "number") throw new Error("Primeiro argumento deve ser um número.");
        const decimals = args[1] && args[1].type === "number" ? args[1].value : 0;
        return Number(Math.round(args[0].value + "e" + decimals) + "e-" + decimals).toString();
      },
    });

    register({
      id: "random.int",
      syntax: "$random.int(1, 100)",
      description: "Gera um número inteiro aleatório entre min e max (inclusive).",
      category: "Números",
      examples: ["$random.int(1, 100) → 42"],
      argCount: 2,
      execute: (args) => {
        if (args[0].type !== "number" || args[1].type !== "number") throw new Error("Argumentos devem ser números.");
        const min = Math.ceil(args[0].value);
        const max = Math.floor(args[1].value);
        if (min > max) throw new Error("O mínimo deve ser menor ou igual ao máximo.");
        return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
      },
    });

    register({
      id: "random.string",
      syntax: "$random.string(16)",
      description: "Gera uma string aleatória de N caracteres (letras e números).",
      category: "Números",
      examples: ["$random.string(8) → a3Bx9kLm"],
      argCount: 1,
      execute: (args) => {
        if (args[0].type !== "number") throw new Error("Argumento deve ser um número.");
        const len = Math.min(Math.max(Math.floor(args[0].value), 1), 4096);
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        const arr = new Uint32Array(len);
        crypto.getRandomValues(arr);
        for (let i = 0; i < len; i++) {
          result += chars[arr[i] % chars.length];
        }
        return result;
      },
    });

    // ─── Seleção ─────────────────────────
    register({
      id: "selection.upper",
      syntax: "$selection.upper()",
      description: "Converte a seleção atual para maiúsculas e substitui o comando.",
      category: "Seleção",
      examples: ["Selecione texto, depois digite $selection.upper()"],
      argCount: 0,
      execute: () => null, // Handled specially by executor
    });

    register({
      id: "selection.lower",
      syntax: "$selection.lower()",
      description: "Converte a seleção atual para minúsculas e substitui o comando.",
      category: "Seleção",
      examples: ["Selecione texto, depois digite $selection.lower()"],
      argCount: 0,
      execute: () => null,
    });

    // ─── Documento ───────────────────────
    register({
      id: "count.lines",
      syntax: "$count.lines()",
      description: "Retorna o número total de linhas do documento.",
      category: "Documento",
      examples: ["Linhas: $count.lines()"],
      argCount: 0,
      execute: () => {
        if (typeof EditorManager === "undefined") return "0";
        return EditorManager.getLineCount().toString();
      },
    });

    register({
      id: "count.words",
      syntax: "$count.words()",
      description: "Retorna o número total de palavras do documento.",
      category: "Documento",
      examples: ["Palavras: $count.words()"],
      argCount: 0,
      execute: () => {
        if (typeof EditorManager === "undefined") return "0";
        return EditorManager.getWordCount().toString();
      },
    });

    register({
      id: "count.characters",
      syntax: "$count.characters()",
      description: "Retorna o número total de caracteres do documento.",
      category: "Documento",
      examples: ["Caracteres: $count.characters()"],
      argCount: 0,
      execute: () => {
        if (typeof EditorManager === "undefined") return "0";
        return EditorManager.getCharacterCount().toString();
      },
    });

    // ─── Informações do arquivo ──────────
    register({
      id: "file.name",
      syntax: "$file.name()",
      description: "Retorna o nome do arquivo ativo (sem caminho).",
      category: "Documento",
      examples: ["Arquivo: $file.name()"],
      argCount: 0,
      execute: () => {
        if (typeof TabManager === "undefined") return "";
        const tab = TabManager.getActiveTab();
        return tab ? tab.name : "(sem arquivo)";
      },
    });

    register({
      id: "file.extension",
      syntax: "$file.extension()",
      description: "Retorna a extensão do arquivo ativo.",
      category: "Documento",
      examples: ["Extensão: $file.extension()"],
      argCount: 0,
      execute: () => {
        if (typeof TabManager === "undefined") return "";
        const tab = TabManager.getActiveTab();
        if (!tab || !tab.name) return "";
        const parts = tab.name.split(".");
        return parts.length > 1 ? parts.pop() : "";
      },
    });

    register({
      id: "file.directory",
      syntax: "$file.directory()",
      description: "Retorna o diretório do arquivo ativo.",
      category: "Documento",
      examples: ["Pasta: $file.directory()"],
      argCount: 0,
      execute: () => {
        if (typeof TabManager === "undefined") return "";
        const tab = TabManager.getActiveTab();
        if (!tab || !tab.path) return "(arquivo não salvo)";
        return tab.path.replace(/[\\/][^\\/]+$/, "");
      },
    });

    // ─── App ─────────────────────────────
    register({
      id: "app.version",
      syntax: "$app.version()",
      description: "Retorna a versão atual do Lignis.",
      category: "Aplicativo",
      examples: ["Lignis v$app.version()"],
      argCount: 0,
      execute: async () => {
        try {
          const result = await window.lignisAPI.getAppInfo();
          if (result.success) return result.data.version;
        } catch (_) {}
        return "3.1.1";
      },
    });
  }

  // ─── Initialize ───────────────────────
  function init() {
    registerAll();
  }

  return {
    init, parse, execute, tryExecuteInLine,
    registerCompletionProvider, updateDecorations,
    openHelp, closeHelp,
    setEnabled, setAutocompleteEnabled, setHighlightEnabled, isEnabled,
    getRegistry: () => registry,
  };
})();
