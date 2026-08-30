// ========================================
// Lignis v3.2.0 - Floating UI Manager
// Centralized overlay/popup/modal management
// Handles click-outside, Escape, z-index, focus restore
// ========================================

const FloatingUIManager = (function () {
  // Z-index scale (ascending)
  const Z = {
    EDITOR: 0,
    SIDEBAR: 100,
    TOOLBAR: 200,
    STATUSBAR: 200,
    DROPDOWN: 5000,
    POPOVER: 5500,
    CONTEXT_MENU: 6000,
    COMMAND_PALETTE: 7000,
    MODAL_BACKDROP: 8000,
    MODAL: 8500,
    TOAST: 9000,
  };

  // Stack of currently open floating elements (bottom = oldest, top = newest)
  let stack = [];
  let previousFocusElement = null;
  let escapeHandlerRegistered = false;
  let clickOutsideHandlerRegistered = false;

  /**
   * Register an overlay as open.
   * @param {string} id - unique identifier (e.g. "context-menu", "zoom-picker")
   * @param {HTMLElement} element - the floating DOM element
   * @param {object} options
   * @param {boolean} options.closeOnClickOutside - default true
   * @param {boolean} options.closeOnEscape - default true
   * @param {boolean} options.persistFocus - don't restore focus on close (e.g. modal with action)
   * @param {Function} options.onClose - callback when closed
   * @param {HTMLElement} options.anchor - element to restore focus to
   */
  function open(id, element, options = {}) {
    if (!element) return;

    const entry = {
      id,
      element,
      closeOnClickOutside: options.closeOnClickOutside !== false,
      closeOnEscape: options.closeOnEscape !== false,
      persistFocus: options.persistFocus || false,
      onClose: options.onClose || null,
      anchor: options.anchor || null,
    };

    // Close previous same-id overlay
    const existingIdx = stack.findIndex(e => e.id === id);
    if (existingIdx !== -1) {
      stack.splice(existingIdx, 1);
    }

    // Close the topmost element that allows auto-close
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.closeOnClickOutside) {
        closeById(top.id);
      }
    }

    // Save focus for restore
    if (stack.length === 0) {
      previousFocusElement = document.activeElement;
    }

    stack.push(entry);
    ensureGlobalListeners();
  }

  /**
   * Close a specific overlay by id.
   */
  function closeById(id) {
    const idx = stack.findIndex(e => e.id === id);
    if (idx === -1) return;

    const entry = stack[idx];
    if (entry.element) {
      entry.element.classList.add("hidden");
    }
    if (entry.onClose) {
      try { entry.onClose(); } catch (_) {}
    }
    stack.splice(idx, 1);
    restoreFocus(entry);
  }

  /**
   * Close the topmost overlay.
   */
  function closeTop() {
    if (stack.length === 0) return false;
    const top = stack[stack.length - 1];
    closeById(top.id);
    return true;
  }

  /**
   * Close all overlays.
   */
  function closeAll() {
    while (stack.length > 0) {
      closeTop();
    }
    restoreFocus(null);
  }

  /**
   * Check if any overlay is open.
   */
  function hasOpen() {
    return stack.length > 0;
  }

  /**
   * Get current top overlay id.
   */
  function topId() {
    return stack.length > 0 ? stack[stack.length - 1].id : null;
  }

  /**
   * Get z-index for a new overlay type.
   */
  function getZIndex(type) {
    return Z[type] || Z.DROPDOWN;
  }

  /**
   * Restore focus to the anchor element or previously focused element.
   */
  function restoreFocus(entry) {
    const target = (entry && entry.anchor) || previousFocusElement;
    if (target && typeof target.focus === "function") {
      try { target.focus(); } catch (_) {}
    }
  }

  function ensureGlobalListeners() {
    if (!escapeHandlerRegistered) {
      escapeHandlerRegistered = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.closeOnEscape) {
            e.preventDefault();
            e.stopPropagation();
            closeTop();
          }
        }
      }, true); // capture phase so it fires before editor handlers
    }

    if (!clickOutsideHandlerRegistered) {
      clickOutsideHandlerRegistered = true;
      document.addEventListener("mousedown", (e) => {
        if (stack.length === 0) return;
        const top = stack[stack.length - 1];
        if (!top.closeOnClickOutside) return;
        if (top.element && !top.element.contains(e.target)) {
          closeTop();
        }
      }, true);
    }
  }

  return { open, closeById, closeTop, closeAll, hasOpen, topId, getZIndex, Z };
})();
