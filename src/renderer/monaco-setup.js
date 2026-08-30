// ========================================
// Monaco Environment Setup
// MUST be loaded BEFORE Monaco's loader.js
// Forces web worker mode in Electron (avoids Node.js fs/vm usage)
// ========================================
(function () {
  // Absolute URL of the page root (e.g. lignis://app/). Workers base every
  // "vs/..." module resolution on this, matching Monaco's standard layout.
  var pageRoot;
  try {
    pageRoot = new URL(".", document.baseURI || location.href).href;
  } catch (e) {
    pageRoot = "./";
  }
  // Ensure trailing slash so "vs/..." concatenates cleanly
  if (!pageRoot.endsWith("/")) pageRoot += "/";

  var workerMainUrl = pageRoot + "vs/base/worker/workerMain.js";

  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
      var workerModule = "editor";
      if (label === "json") workerModule = "json";
      else if (label === "css" || label === "scss" || label === "less") workerModule = "css";
      else if (label === "html" || label === "htm" || label === "handlebars" || label === "razor") workerModule = "html";
      else if (label === "typescript" || label === "javascript" || label === "jsx" || label === "tsx") workerModule = "typescript";

      var blobCode = [
        'self.MonacoEnvironment = {',
        '  baseUrl: "' + pageRoot + '"',
        '};',
        'importScripts("' + workerMainUrl + '");'
      ].join("\n");

      var blob = new Blob([blobCode], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    },
  };

  console.log("[STARTUP] MonacoEnvironment configurado. Root:", pageRoot, "Worker:", workerMainUrl);
})();