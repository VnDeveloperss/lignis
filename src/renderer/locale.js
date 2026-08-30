// ========================================
// Lignis - Localização Helper
// ========================================

const Locale = (function () {
  let currentLocale = null;
  const locales = {};

  function register(name, data) {
    locales[name] = data;
  }

  function set(name) {
    if (locales[name]) {
      currentLocale = locales[name];
    }
  }

  // Fallback map: if a key is missing from locale, return a readable PT-BR string
  const FALLBACKS = {
    "tabCtx.save": "Salvar",
    "tabCtx.saveAs": "Salvar como...",
    "tabCtx.reload": "Recarregar do disco",
    "tabCtx.close": "Fechar",
    "tabCtx.closeOthers": "Fechar outras",
    "tabCtx.closeRight": "Fechar à direita",
    "tabCtx.closeAll": "Fechar todas",
    "tabCtx.pin": "Fixar aba",
    "tabCtx.unpin": "Desfixar aba",
    "tabCtx.readOnly": "Modo somente leitura",
    "tabCtx.copyPath": "Copiar caminho completo",
    "tabCtx.copyName": "Copiar nome do arquivo",
    "tabCtx.copyDir": "Copiar diretório",
    "tabCtx.openFolder": "Abrir pasta do arquivo",
    "tabCtx.moveToLeft": "Mover para esquerda",
    "tabCtx.moveToRight": "Mover para direita",
    "editorCtx.undo": "Desfazer",
    "editorCtx.redo": "Refazer",
    "editorCtx.cut": "Recortar",
    "editorCtx.copy": "Copiar",
    "editorCtx.paste": "Colar",
    "editorCtx.selectAll": "Selecionar tudo",
    "editorCtx.duplicateLine": "Duplicar linha",
    "editorCtx.deleteLine": "Excluir linha",
    "editorCtx.toggleComment": "Alternar comentário",
    "editorCtx.searchSelection": "Buscar seleção",
    "editorCtx.uppercase": "Converter para MAIÚSCULAS",
    "editorCtx.lowercase": "Converter para minúsculas",
    "editorCtx.copyAsJSON": "Copiar como JSON String",
    "editorCtx.insertTimestamp": "Inserir data e hora",
    "editorCtx.insertUUID": "Inserir UUID",
  };

  function t(key, params) {
    let text = currentLocale ? currentLocale[key] : undefined;
    if (!text) {
      text = FALLBACKS[key] || key;
    }

    // Replace {param} placeholders
    if (params) {
      Object.keys(params).forEach((p) => {
        text = text.replace(new RegExp(`\\{${p}\\}`, "g"), params[p]);
      });
    }
    return text;
  }

  function getCurrentLang() {
    // Always PT-BR for now; architecture ready for future locales
    return "pt-BR";
  }

  return { register, set, t, getCurrentLang };
})();
