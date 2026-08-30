// ========================================
// Lignis - Search & Replace
// ========================================

const SearchManager = (function () {
  let isOpen = false;
  let isReplaceMode = false;
  let matchCase = false;
  let wholeWord = false;
  let useRegex = false;

  function init() {
    const searchInput = document.getElementById("search-input");
    const replaceInput = document.getElementById("replace-input");

    searchInput.addEventListener("input", () => performSearch());
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.shiftKey ? findPrevious() : findNext();
      } else if (e.key === "Escape") {
        close();
      }
    });

    replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        replaceOne();
      } else if (e.key === "Escape") {
        close();
      }
    });

    document.getElementById("search-prev").addEventListener("click", findPrevious);
    document.getElementById("search-next").addEventListener("click", findNext);
    document.getElementById("search-close").addEventListener("click", close);
    document.getElementById("search-case").addEventListener("click", toggleMatchCase);
    document.getElementById("search-word").addEventListener("click", toggleWholeWord);
    document.getElementById("search-regex").addEventListener("click", toggleRegex);
    document.getElementById("replace-one").addEventListener("click", replaceOne);
    document.getElementById("replace-all").addEventListener("click", replaceAll);

    updateToggleButtons();
  }

  function open(replaceMode = false) {
    isOpen = true;
    isReplaceMode = replaceMode;

    const searchBar = document.getElementById("search-bar");
    const replaceRow = document.getElementById("replace-row");
    const searchInput = document.getElementById("search-input");

    searchBar.classList.remove("hidden");
    replaceRow.style.display = replaceMode ? "flex" : "none";

    const selection = EditorManager.getSelection();
    if (selection && !selection.includes("\n")) {
      searchInput.value = selection;
    }

    searchInput.focus();
    searchInput.select();
    if (searchInput.value) performSearch();
  }

  function close() {
    isOpen = false;
    document.getElementById("search-bar").classList.add("hidden");
    EditorManager.focus();
    clearDecorations();
  }

  function performSearch() {
    const query = document.getElementById("search-input").value;
    const searchCount = document.getElementById("search-count");

    if (!query) {
      searchCount.textContent = "";
      clearDecorations();
      return;
    }

    const editor = EditorManager.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    try {
      if (useRegex) {
        try {
          new RegExp(query, matchCase ? "g" : "gi");
        } catch {
          searchCount.textContent = "Regex inválida";
          return;
        }
      }

      const matches = model.findMatches(
        query, false, useRegex, matchCase, wholeWord ? "true" : null, false
      );

      if (matches.length === 0) {
        searchCount.textContent = "Sem resultados";
        clearDecorations();
        return;
      }

      // Highlight all matches
      const decorations = matches.map((match) => ({
        range: match.range,
        options: { inlineClassName: "find-highlight" },
      }));

      editor.deltaDecorations([], decorations);

      // Find current match nearest to cursor
      const pos = editor.getPosition();
      let currentIdx = 0;
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (m.range.startLineNumber < pos.lineNumber ||
            (m.range.startLineNumber === pos.lineNumber && m.range.startColumn <= pos.column)) {
          currentIdx = i;
        }
      }

      searchCount.textContent = `${currentIdx + 1} / ${matches.length}`;
      window._searchMatches = matches;
      window._searchCurrentIdx = currentIdx;
    } catch {
      searchCount.textContent = "Erro na busca";
    }
  }

  function findNext() {
    const matches = window._searchMatches;
    if (!matches || matches.length === 0) return;
    window._searchCurrentIdx = (window._searchCurrentIdx + 1) % matches.length;
    goToMatch(window._searchCurrentIdx);
  }

  function findPrevious() {
    const matches = window._searchMatches;
    if (!matches || matches.length === 0) return;
    window._searchCurrentIdx = (window._searchCurrentIdx - 1 + matches.length) % matches.length;
    goToMatch(window._searchCurrentIdx);
  }

  function goToMatch(idx) {
    const matches = window._searchMatches;
    if (!matches || !matches[idx]) return;
    const match = matches[idx];
    const editor = EditorManager.getEditor();
    editor.setSelection(match.range);
    editor.revealRangeInCenter(match.range);
    document.getElementById("search-count").textContent = `${idx + 1} / ${matches.length}`;
  }

  function replaceOne() {
    const matches = window._searchMatches;
    const idx = window._searchCurrentIdx;
    if (!matches || !matches[idx]) return;

    const replaceValue = document.getElementById("replace-input").value;
    const editor = EditorManager.getEditor();
    const match = matches[idx];

    editor.executeEdits("replace", [{ range: match.range, text: replaceValue }]);
    setTimeout(performSearch, 0);
  }

  function replaceAll() {
    const query = document.getElementById("search-input").value;
    const replaceValue = document.getElementById("replace-input").value;
    if (!query) return;

    const editor = EditorManager.getEditor();
    const model = editor.getModel();

    let matches;
    try {
      matches = model.findMatches(query, false, useRegex, matchCase, wholeWord ? "true" : null, false);
    } catch {
      return;
    }

    if (matches.length === 0) return;

    // Sort reverse
    matches.sort((a, b) => {
      if (b.range.startLineNumber !== a.range.startLineNumber)
        return b.range.startLineNumber - a.range.startLineNumber;
      return b.range.startColumn - a.range.startColumn;
    });

    const edits = matches.map((match) => ({ range: match.range, text: replaceValue }));
    editor.executeEdits("replace-all", edits);

    const count = matches.length;
    App.showToast(`${count} ocorrência(s) substituída(s).`, "success");

    setTimeout(performSearch, 0);
  }

  function toggleMatchCase() { matchCase = !matchCase; updateToggleButtons(); performSearch(); }
  function toggleWholeWord() { wholeWord = !wholeWord; updateToggleButtons(); performSearch(); }
  function toggleRegex() { useRegex = !useRegex; updateToggleButtons(); performSearch(); }

  function updateToggleButtons() {
    document.getElementById("search-case").classList.toggle("active", matchCase);
    document.getElementById("search-word").classList.toggle("active", wholeWord);
    document.getElementById("search-regex").classList.toggle("active", useRegex);
  }

  function clearDecorations() {
    const editor = EditorManager.getEditor();
    if (editor) editor.deltaDecorations([], []);
    window._searchMatches = null;
    window._searchCurrentIdx = 0;
  }

  function isOpened() { return isOpen; }

  return { init, open, close, performSearch, isOpened };
})();
