const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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

  await run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  initDb,
  run,
  get,
  all
};
