// ========================================
// Monaco Environment Setup
// MUST be loaded BEFORE Monaco's loader.js
// Forces web worker mode in Electron (avoids Node.js fs/vm usage)
// ========================================
(function () {
  var monacoBase = "./monaco";

  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
      // Determine which worker module to load based on the language
      var workerModule = "editor"; // default: editor worker
      if (label === "json") workerModule = "json";
      else if (label === "css" || label === "scss" || label === "less") workerModule = "css";
      else if (label === "html" || label === "htm" || label === "handlebars" || label === "razor") workerModule = "html";
      else if (label === "typescript" || label === "javascript" || label === "jsx" || label === "tsx") workerModule = "typescript";

      // Create a blob worker that:
      // 1. Sets MonacoEnvironment.baseUrl so the AMD loader resolves paths correctly
      // 2. Imports the workerMain.js which contains the actual worker logic
      var blobCode = [
        'self.MonacoEnvironment = {',
        '  baseUrl: "' + monacoBase + '"',
        '};',
        'importScripts("' + monacoBase + '/base/worker/workerMain.js");'
      ].join("\n");

      var blob = new Blob([blobCode], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    },
  };

  console.log("[Lignis] MonacoEnvironment configurado.");
})();
