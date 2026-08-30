// ========================================
// Lignis v3.6.0 - DatabaseService
// SQLite-based persistent state management
// ========================================

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const CURRENT_VERSION = 1;

class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = path.join(app.getPath("userData"), "lignis.db");
  }

  /**
   * Initialize database. If corrupted, backup and recreate.
   */
  init() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");

      this._runMigrations();
      console.log("[DB] Initialized:", this.dbPath);
    } catch (err) {
      console.error("[DB] Failed to initialize, backing up and recreating:", err.message);
      this._backupCorrupted();
      try {
        this.db = new Database(this.dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this._runMigrations();
        console.log("[DB] Recreated successfully.");
      } catch (retryErr) {
        console.error("[DB] FATAL: Cannot create database:", retryErr.message);
        // Continue without DB — app must still work
        this.db = null;
      }
    }
  }

  _backupCorrupted() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const backupPath = this.dbPath + `.backup.${Date.now()}.db`;
        fs.copyFileSync(this.dbPath, backupPath);
        fs.unlinkSync(this.dbPath);
        // Also remove WAL/SHM files
        [".db-wal", ".db-shm"].forEach(ext => {
          const f = this.dbPath + ext.replace(".db", "");
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });
      }
    } catch (_) {}
  }

  _runMigrations() {
    if (!this.db) return;

    // Create migrations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const applied = new Set(
      this.db.prepare("SELECT version FROM _migrations").all().map(r => r.version)
    );

    const migrations = this._getMigrations();
    for (const [version, sql] of migrations) {
      if (!applied.has(version)) {
        this.db.transaction(() => {
          this.db.exec(sql);
          this.db.prepare("INSERT INTO _migrations (version) VALUES (?)").run(version);
        })();
        console.log(`[DB] Migration ${version} applied.`);
      }
    }
  }

  _getMigrations() {
    return [
      [1, `
        -- Extension registry
        CREATE TABLE IF NOT EXISTS extensions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          display_name TEXT,
          version TEXT,
          publisher TEXT,
          description TEXT,
          install_path TEXT,
          engine_version TEXT,
          enabled INTEGER DEFAULT 1,
          status TEXT DEFAULT 'installed',
          last_error TEXT,
          last_activated_at TEXT,
          installed_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Extension permissions (snapshot at install time)
        CREATE TABLE IF NOT EXISTS extension_permissions (
          extension_id TEXT NOT NULL,
          permission TEXT NOT NULL,
          granted INTEGER DEFAULT 0,
          PRIMARY KEY (extension_id, permission),
          FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
        );

        -- Extension state (key-value per extension)
        CREATE TABLE IF NOT EXISTS extension_state (
          extension_id TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'global',
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (extension_id, scope, key),
          FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
        );

        -- Recent files
        CREATE TABLE IF NOT EXISTS recent_files (
          path TEXT PRIMARY KEY,
          opened_at TEXT DEFAULT (datetime('now'))
        );

        -- Recent workspaces
        CREATE TABLE IF NOT EXISTS recent_workspaces (
          path TEXT PRIMARY KEY,
          opened_at TEXT DEFAULT (datetime('now'))
        );

        -- Sessions (for session restore)
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Command history
        CREATE TABLE IF NOT EXISTS command_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command TEXT NOT NULL,
          executed_at TEXT DEFAULT (datetime('now'))
        );

        -- Extension logs
        CREATE TABLE IF NOT EXISTS extension_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          extension_id TEXT NOT NULL,
          level TEXT DEFAULT 'info',
          message TEXT,
          timestamp TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
        );
      `],
    ];
  }

  // ═══════════════════════════════════════
  // Extension Registry
  // ═══════════════════════════════════════

  upsertExtension(ext) {
    if (!this.db) return;
    this.db.prepare(`
      INSERT INTO extensions (id, name, display_name, version, publisher, description, install_path, engine_version, enabled, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, display_name=excluded.display_name, version=excluded.version,
        publisher=excluded.publisher, description=excluded.description, install_path=excluded.install_path,
        engine_version=excluded.engine_version, enabled=excluded.enabled, status=excluded.status,
        updated_at=datetime('now')
    `).run(ext.id, ext.name, ext.displayName || ext.name, ext.version, ext.publisher || "unknown",
      ext.description || "", ext.installPath || "", ext.engineVersion || "", ext.enabled ? 1 : 0, ext.status || "installed");
  }

  getExtension(id) {
    if (!this.db) return null;
    return this.db.prepare("SELECT * FROM extensions WHERE id = ?").get(id);
  }

  getAllExtensions() {
    if (!this.db) return [];
    return this.db.prepare("SELECT * FROM extensions ORDER BY display_name").all();
  }

  setExtensionEnabled(id, enabled) {
    if (!this.db) return;
    this.db.prepare("UPDATE extensions SET enabled = ?, updated_at = datetime('now') WHERE id = ?").run(enabled ? 1 : 0, id);
  }

  setExtensionStatus(id, status, error) {
    if (!this.db) return;
    this.db.prepare("UPDATE extensions SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, error || null, id);
  }

  setExtensionActivated(id) {
    if (!this.db) return;
    this.db.prepare("UPDATE extensions SET last_activated_at = datetime('now') WHERE id = ?").run(id);
  }

  removeExtension(id) {
    if (!this.db) return;
    this.db.prepare("DELETE FROM extensions WHERE id = ?").run(id);
  }

  // ═══════════════════════════════════════
  // Extension Permissions
  // ═══════════════════════════════════════

  setExtensionPermissions(extensionId, permissions) {
    if (!this.db) return;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM extension_permissions WHERE extension_id = ?").run(extensionId);
      const ins = this.db.prepare("INSERT INTO extension_permissions (extension_id, permission, granted) VALUES (?, ?, 1)");
      for (const perm of permissions) {
        ins.run(extensionId, perm);
      }
    })();
  }

  getExtensionPermissions(extensionId) {
    if (!this.db) return [];
    return this.db.prepare("SELECT permission, granted FROM extension_permissions WHERE extension_id = ?").all(extensionId);
  }

  // ═══════════════════════════════════════
  // Extension State (globalState / workspaceState)
  // ═══════════════════════════════════════

  getExtensionState(extensionId, scope, key) {
    if (!this.db) return null;
    const row = this.db.prepare("SELECT value FROM extension_state WHERE extension_id = ? AND scope = ? AND key = ?")
      .get(extensionId, scope || "global", key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
  }

  setExtensionState(extensionId, scope, key, value) {
    if (!this.db) return;
    const jsonValue = typeof value === "string" ? value : JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO extension_state (extension_id, scope, key, value) VALUES (?, ?, ?, ?)
      ON CONFLICT(extension_id, scope, key) DO UPDATE SET value = excluded.value
    `).run(extensionId, scope || "global", key, jsonValue);
  }

  deleteExtensionState(extensionId, scope, key) {
    if (!this.db) return;
    this.db.prepare("DELETE FROM extension_state WHERE extension_id = ? AND scope = ? AND key = ?")
      .run(extensionId, scope || "global", key);
  }

  // ═══════════════════════════════════════
  // Recent Files / Workspaces
  // ═══════════════════════════════════════

  addRecentFile(filePath) {
    if (!this.db) return;
    this.db.prepare(`
      INSERT INTO recent_files (path, opened_at) VALUES (?, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET opened_at = datetime('now')
    `).run(filePath);
  }

  getRecentFiles(limit = 30) {
    if (!this.db) return [];
    return this.db.prepare("SELECT path FROM recent_files ORDER BY opened_at DESC LIMIT ?").all(limit).map(r => r.path);
  }

  clearRecentFiles() {
    if (!this.db) return;
    this.db.prepare("DELETE FROM recent_files").run();
  }

  addRecentWorkspace(workspacePath) {
    if (!this.db) return;
    this.db.prepare(`
      INSERT INTO recent_workspaces (path, opened_at) VALUES (?, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET opened_at = datetime('now')
    `).run(workspacePath);
  }

  getRecentWorkspaces(limit = 20) {
    if (!this.db) return [];
    return this.db.prepare("SELECT path FROM recent_workspaces ORDER BY opened_at DESC LIMIT ?").all(limit).map(r => r.path);
  }

  // ═══════════════════════════════════════
  // Sessions
  // ═══════════════════════════════════════

  saveSession(data) {
    if (!this.db) return;
    this.db.prepare("INSERT INTO sessions (data) VALUES (?)").run(JSON.stringify(data));
  }

  getLastSession() {
    if (!this.db) return null;
    const row = this.db.prepare("SELECT data FROM sessions ORDER BY id DESC LIMIT 1").get();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch (_) { return null; }
  }

  // ═══════════════════════════════════════
  // Extension Logs
  // ═══════════════════════════════════════

  addExtensionLog(extensionId, level, message) {
    if (!this.db) return;
    this.db.prepare("INSERT INTO extension_logs (extension_id, level, message) VALUES (?, ?, ?)")
      .run(extensionId, level || "info", message);
  }

  getExtensionLogs(extensionId, limit = 100) {
    if (!this.db) return [];
    return this.db.prepare("SELECT * FROM extension_logs WHERE extension_id = ? ORDER BY id DESC LIMIT ?")
      .all(extensionId, limit);
  }

  clearExtensionLogs(extensionId) {
    if (!this.db) return;
    this.db.prepare("DELETE FROM extension_logs WHERE extension_id = ?").run(extensionId);
  }

  // ═══════════════════════════════════════
  // Command History
  // ═══════════════════════════════════════

  addCommandHistory(command) {
    if (!this.db) return;
    this.db.prepare("INSERT INTO command_history (command) VALUES (?)").run(command);
  }

  getCommandHistory(limit = 50) {
    if (!this.db) return [];
    return this.db.prepare("SELECT command FROM command_history ORDER BY id DESC LIMIT ?").all(limit).map(r => r.command);
  }

  // ═══════════════════════════════════════
  // Health Check
  // ═══════════════════════════════════════

  healthCheck() {
    if (!this.db) return { ok: false, error: "Database not initialized" };
    try {
      this.db.prepare("SELECT 1").get();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch (_) {}
      this.db = null;
    }
  }
}

// Singleton
const db = new DatabaseService();
module.exports = { DatabaseService, db };
