// ========================================
// Lignis Extension API v1.x - Type Definitions
// For IntelliSense in Monaco Editor
// ========================================

/**
 * Context object passed to activate(context)
 */
interface LignisExtensionContext {
  /** Subscriptions to be disposed when extension deactivates */
  subscriptions: Disposable[];

  /** Path to the extension directory */
  extensionPath: string;

  /** URI of the extension */
  extensionUri: string;

  /** Extension mode: "production" or "development" */
  extensionMode: "production" | "development";

  /** Isolated storage path for this extension */
  storagePath: string;

  /** Lignis API */
  lignis: LignisAPI;
}

/**
 * Main Lignis API namespace
 */
interface LignisAPI {
  /** Window operations */
  window: WindowAPI;

  /** Command registration */
  commands: CommandsAPI;

  /** Workspace operations */
  workspace: WorkspaceAPI;

  /** Editor operations */
  editor: EditorAPI;

  /** Document operations */
  document: DocumentAPI;

  /** Terminal operations */
  terminal: TerminalAPI;

  /** Inline commands ($namespace.command()) */
  inlineCommands: InlineCommandsAPI;

  /** Language providers */
  languages: LanguagesAPI;

  /** File system operations */
  fs: FileSystemAPI;

  /** Key-value storage */
  storage: StorageAPI;

  /** Utility functions */
  util: UtilAPI;
}

/**
 * Disposable pattern
 */
interface Disposable {
  dispose(): void | Promise<void>;
}

/**
 * Window API
 */
interface WindowAPI {
  /** Show information message to user */
  showInformationMessage(message: string): void;

  /** Show warning message to user */
  showWarningMessage(message: string): void;

  /** Show error message to user */
  showErrorMessage(message: string): void;

  /** Show quick pick (single selection) */
  showQuickPick(items: (string | QuickPickItem)[]): Promise<QuickPickItem | null | undefined>;

  /** Show input box */
  showInputBox(options?: InputBoxOptions): Promise<string | null | undefined>;

  /** Show progress indicator */
  showProgress(message: string): void;

  /** Create output channel */
  createOutputChannel?(name: string): OutputChannel;
}

interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

interface InputBoxOptions {
  prompt?: string;
  placeHolder?: string;
  value?: string;
  password?: boolean;
}

interface OutputChannel {
  appendLine(line: string): void;
  append(text: string): void;
  clear(): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

/**
 * Commands API
 */
interface CommandsAPI {
  /** Register a command that appears in Command Palette */
  registerCommand(commandId: string, callback: (...args: any[]) => any): Disposable;

  /** Execute a registered command */
  executeCommand(commandId: string, ...args: any[]): Promise<any>;

  /** Get all registered command IDs */
  getCommands(): string[];
}

/**
 * Workspace API
 */
interface WorkspaceAPI {
  /** Get workspace folders */
  getWorkspaceFolders(): Promise<WorkspaceFolder[]>;

  /** Get configuration for a section */
  getConfiguration(section?: string): Promise<any>;

  /** Find files matching a glob pattern */
  findFiles(pattern: string): Promise<string[]>;

  /** Open a text document */
  openTextDocument(options?: { content?: string; language?: string }): Promise<void>;

  /** Listen for workspace folder changes */
  onDidChangeWorkspaceFolders(callback: (event: any) => void): Disposable;
}

interface WorkspaceFolder {
  uri: string;
  name: string;
}

/**
 * Editor API
 */
interface EditorAPI {
  /** Get the active text editor */
  getActiveTextEditor(): Promise<TextEditor | null>;

  /** Create a status bar item */
  createStatusBarItem(alignment?: "left" | "right", priority?: number): StatusBarItem;

  /** Set decorations (highlights) on the editor */
  setDecorations(uri: string, decorations: any[]): void;
}

interface TextEditor {
  document: TextDocument;
  selection: Range;
  selections: Range[];
}

interface TextDocument {
  text: string;
  fileName: string;
  languageId: string;
  lineCount: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Position {
  lineNumber: number;
  column: number;
}

interface StatusBarItem {
  text: string;
  tooltip: string;
  command: string | null;
  show(): void;
  hide(): void;
  setText(text: string): void;
  setTooltip(tooltip: string): void;
  setCommand(command: string | null): void;
  dispose(): void;
}

/**
 * Document API
 */
interface DocumentAPI {
  /** Get text of the active document */
  getText(): Promise<string>;

  /** Get filename of the active document */
  getFileName(): Promise<string>;

  /** Get language ID of the active document */
  getLanguageId(): Promise<string>;

  /** Get line count of the active document */
  getLineCount(): Promise<number>;
}

/**
 * Terminal API
 */
interface TerminalAPI {
  /** Create a new terminal */
  createTerminal(name?: string): Promise<Terminal | null>;

  /** Send text to a terminal */
  sendText(terminalId: string, text: string): void;

  /** Listen for terminal open events */
  onDidOpenTerminal(callback: (terminal: Terminal) => void): Disposable;

  /** Listen for terminal close events */
  onDidCloseTerminal(callback: (terminal: Terminal) => void): Disposable;
}

interface Terminal {
  id: string;
}

/**
 * Inline Commands API
 */
interface InlineCommandsAPI {
  /** Register an inline command ($namespace.command()) */
  register(command: InlineCommand): Disposable;
}

interface InlineCommand {
  /** Unique command ID */
  id: string;

  /** Namespace for autocomplete (e.g., "git") */
  namespace: string;

  /** Exact syntax for recognition (e.g., "$git.branch()") */
  syntax: string;

  /** Human-readable description */
  description: string;

  /** Execute function */
  execute: (...args: any[]) => any | Promise<any>;
}

/**
 * Languages API
 */
interface LanguagesAPI {
  /** Register a completion item provider */
  registerCompletionItemProvider(selector: string, provider: CompletionItemProvider): Disposable;

  /** Register a hover provider */
  registerHoverProvider(selector: string, provider: HoverProvider): Disposable;
}

interface CompletionItemProvider {
  provideCompletionItems(model: any, position: any): Promise<{ suggestions: any[] }>;
}

interface HoverProvider {
  provideHover(model: any, position: any): Promise<any>;
}

/**
 * File System API
 */
interface FileSystemAPI {
  /** Read file contents */
  readFile(filePath: string): string;

  /** Write file contents */
  writeFile(filePath: string, content: string): void;

  /** Get file stats */
  stat(filePath: string): any;

  /** Read directory entries */
  readDirectory(dirPath: string): Array<{ name: string; isDirectory: boolean }>;

  /** Create a directory */
  createDirectory(dirPath: string): void;

  /** Delete a file */
  delete(filePath: string): void;

  /** Rename a file */
  rename(oldPath: string, newPath: string): void;
}

/**
 * Storage API
 */
interface StorageAPI {
  /** Get a value from extension storage */
  get(key: string): any;

  /** Set a value in extension storage */
  set(key: string, value: any): void;
}

/**
 * Util API
 */
interface UtilAPI {
  /** Get the extension version */
  getExtensionVersion(): string;

  /** Get the Lignis API version */
  getLignisApiVersion(): string;
}

/**
 * Extension activation function
 */
declare function activate(context: LignisExtensionContext): void | Promise<void>;

/**
 * Extension deactivation function
 */
declare function deactivate(): void | Promise<void>;
