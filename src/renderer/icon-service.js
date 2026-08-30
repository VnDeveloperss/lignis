// ========================================
// Lignis v3.0.0 - Icon Service (Font Awesome)
// ========================================

const IconService = (function () {
  let faAvailable = false;

  function init() {
    // Font Awesome is loaded via CSS — just check if it's available
    faAvailable = true;
    // Font Awesome via CSS doesn't need createIcons — icons render automatically
  }

  function refresh(root) {
    // Font Awesome icons render via CSS classes — no dynamic init needed
    // This is kept for compatibility with call sites that previously used IconManager.refresh()
  }

  function refreshFor(element) {
    // Same — no-op for Font Awesome
  }

  function isAvailable() {
    return faAvailable;
  }

  return { init, refresh, refreshFor, isAvailable };
})();
