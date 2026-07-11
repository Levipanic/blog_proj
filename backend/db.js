const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, "blog.db");
const db = new Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(sql).run(params);
      resolve({
        lastID: result.lastInsertRowid,
        changes: result.changes
      });
    } catch (err) {
      reject(err);
    }
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare(sql).get(params);
      resolve(row);
    } catch (err) {
      reject(err);
    }
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(sql).all(params);
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  });
}

async function initDb() {
  db.pragma("foreign_keys = ON");

  const postsTable = await get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'posts'"
  );

  if (postsTable) {
    const postColumns = await all("PRAGMA table_info(posts)");
    const postColumnNames = postColumns.map((column) => column.name);
    const requiredColumns = ["id", "title", "blocks_json", "created_at"];
    const hasRequiredSchema = requiredColumns.every((columnName) =>
      postColumnNames.includes(columnName)
    );

    if (!hasRequiredSchema) {
      await run("DROP TABLE IF EXISTS like_events");
      await run("DROP TABLE IF EXISTS comments");
      await run("DROP TABLE IF EXISTS posts");
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      blocks_json TEXT NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const postColumnsAfterCreate = await all("PRAGMA table_info(posts)");
  const hasLikesCountColumn = postColumnsAfterCreate.some((column) => column.name === "likes_count");
  if (!hasLikesCountColumn) {
    await run("ALTER TABLE posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0");
  }

  const hasPreviewMediaColumn = postColumnsAfterCreate.some((column) => column.name === "preview_media");
  if (!hasPreviewMediaColumn) {
    await run("ALTER TABLE posts ADD COLUMN preview_media TEXT DEFAULT NULL");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    )
  `);

  const commentColumnsAfterCreate = await all("PRAGMA table_info(comments)");
  const hasParentIdColumn = commentColumnsAfterCreate.some((column) => column.name === "parent_id");
  if (!hasParentIdColumn) {
    await run("ALTER TABLE comments ADD COLUMN parent_id INTEGER");
  }

  const hasCommentLikesCountColumn = commentColumnsAfterCreate.some((column) => column.name === "likes_count");
  if (!hasCommentLikesCountColumn) {
    await run("ALTER TABLE comments ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0");
  }

  const hasCommentStatusColumn = commentColumnsAfterCreate.some((column) => column.name === "status");
  if (!hasCommentStatusColumn) {
    await run("ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'visible'");
  }

  const hasModerationReasonColumn = commentColumnsAfterCreate.some((column) => column.name === "moderation_reason");
  if (!hasModerationReasonColumn) {
    await run("ALTER TABLE comments ADD COLUMN moderation_reason TEXT");
  }

  const hasTextHashColumn = commentColumnsAfterCreate.some((column) => column.name === "text_hash");
  if (!hasTextHashColumn) {
    await run("ALTER TABLE comments ADD COLUMN text_hash TEXT");
  }

  const hasTextFingerprintColumn = commentColumnsAfterCreate.some((column) => column.name === "text_fingerprint");
  if (!hasTextFingerprintColumn) {
    await run("ALTER TABLE comments ADD COLUMN text_fingerprint TEXT");
  }

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comments_post_parent
    ON comments(post_id, parent_id, id)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comments_status_created
    ON comments(status, created_at)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS like_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_like_events_post_ip_created
    ON like_events(post_id, ip_hash, created_at)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comment_like_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_like_events_comment_ip_created
    ON comment_like_events(comment_id, ip_hash, created_at)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comment_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL,
      post_id INTEGER,
      status TEXT NOT NULL,
      reason TEXT,
      content TEXT,
      text_hash TEXT,
      fingerprint TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_attempts_ip_time
    ON comment_attempts(ip_hash, created_at)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_attempts_post_time
    ON comment_attempts(post_id, created_at)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_attempts_ip_post_hash_time
    ON comment_attempts(ip_hash, post_id, text_hash, created_at)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_attempts_ip_status_time
    ON comment_attempts(ip_hash, status, created_at)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comment_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL UNIQUE,
      reason TEXT,
      muted_until TEXT NOT NULL,
      mute_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_mutes_until
    ON comment_mutes(muted_until)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comment_challenge_uses (
      token_hash TEXT PRIMARY KEY,
      post_id INTEGER NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      first_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
    ON admin_sessions(expires_at)
  `);
}

module.exports = {
  initDb,
  run,
  get,
  all
};
