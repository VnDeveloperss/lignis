// ========================================
// Monaco Environment Setup
// MUST be loaded BEFORE Monaco's loader.js
// Forces web worker mode in Electron (avoids Node.js fs/vm usage)
// ========================================
(function () {
  // Compute absolute base URL for workers (blob workers can't resolve relative URLs)
  var monacoBase;
  try {
    monacoBase = new URL("./monaco", document.baseURI || location.href).href;
    // Remove trailing slash if present
    if (monacoBase.endsWith("/")) monacoBase = monacoBase.slice(0, -1);
  } catch (e) {
    monacoBase = "./monaco";
  }

  var workerMainUrl = monacoBase + "/base/worker/workerMain.js";

  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
      var workerModule = "editor";
      if (label === "json") workerModule = "json";
      else if (label === "css" || label === "scss" || label === "less") workerModule = "css";
      else if (label === "html" || label === "htm" || label === "handlebars" || label === "razor") workerModule = "html";
      else if (label === "typescript" || label === "javascript" || label === "jsx" || label === "tsx") workerModule = "typescript";

      var blobCode = [
        'self.MonacoEnvironment = {',
        '  baseUrl: "' + monacoBase + '"',
        '};',
        'importScripts("' + workerMainUrl + '");'
      ].join("\n");

      var blob = new Blob([blobCode], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    },
  };

  console.log("[STARTUP] MonacoEnvironment configurado. Base:", monacoBase);
})();
