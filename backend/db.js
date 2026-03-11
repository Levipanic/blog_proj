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
const dbFileExistedBeforeOpen = fs.existsSync(dbPath);
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

function createSilentWavBuffer({ sampleRate = 8000, seconds = 0.5 } = {}) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Math.floor(sampleRate * seconds));
  const dataSize = sampleCount * channels * bytesPerSample;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function ensureSeedFile(fileName, contentOrBuffer) {
  const filePath = path.join(uploadsDir, fileName);
  if (fs.existsSync(filePath)) {
    return;
  }
  fs.writeFileSync(filePath, contentOrBuffer);
}

function ensureSeedMediaFiles() {
  ensureSeedFile(
    "seed-sky.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#8fd3ff" />
      <stop offset="100%" stop-color="#f9fdff" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)" />
  <circle cx="70" cy="55" r="22" fill="#fff5b2" />
  <rect x="0" y="128" width="320" height="52" fill="#7cb0d8" />
  <rect x="0" y="142" width="320" height="38" fill="#5f8ead" />
</svg>`
  );

  ensureSeedFile(
    "seed-loop.gif",
    Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")
  );

  ensureSeedFile(
    "seed-guide.md",
    "# Seed Guide\n\nThis markdown file is used by the seeded file media block.\n"
  );

  ensureSeedFile("seed-tone.wav", createSilentWavBuffer());
}

async function seedDb() {
  if (dbFileExistedBeforeOpen) {
    return;
  }

  ensureSeedMediaFiles();

  const countRow = await get("SELECT COUNT(*) AS total FROM posts");
  if ((countRow && countRow.total) > 0) {
    return;
  }

  const posts = [
    {
      title: "Studio Log: First Light",
      createdAtExpr: "datetime('now', '-2 day')",
      blocks: [
        { type: "heading", level: 2, text: "Warmup Session" },
        {
          type: "paragraph",
          text: "I started this morning with a short sketch walk and wrote down quick color notes."
        },
        {
          type: "paragraph",
          text: "The main goal today is to keep the process simple, post often, and track progress."
        },
        {
          type: "quote",
          text: "Small steady notes beat one perfect entry."
        },
        { type: "divider" },
        {
          type: "media",
          mediaKind: "image",
          src: "/uploads/seed-sky.svg",
          alt: "Simple gradient sky placeholder image",
          caption: "Tiny placeholder image used by seed data."
        }
      ],
      comments: [
        { name: "Visitor", content: "Love the diary style." },
        { name: "Anon", content: "Nice clean layout." }
      ]
    },
    {
      title: "Loop Check",
      createdAtExpr: "datetime('now', '-1 day')",
      blocks: [
        { type: "heading", level: 3, text: "Media Check" },
        {
          type: "paragraph",
          text: "This post confirms mixed media blocks between text sections."
        },
        {
          type: "media",
          mediaKind: "gif",
          src: "/uploads/seed-loop.gif",
          alt: "One pixel transparent gif",
          caption: "A tiny looping GIF placeholder."
        },
        {
          type: "media",
          mediaKind: "audio",
          src: "/uploads/seed-tone.wav",
          name: "seed-tone.wav",
          caption: "Half-second silent WAV placeholder."
        },
        {
          type: "paragraph",
          text: "If audio controls appear and remain inside the card, rendering works."
        }
      ],
      comments: [{ name: "Reader", content: "Audio block works on my phone." }]
    },
    {
      title: "Reference Shelf",
      createdAtExpr: "datetime('now', '-6 hour')",
      blocks: [
        { type: "heading", level: 2, text: "Useful Attachments" },
        {
          type: "paragraph",
          text: "This entry demonstrates a generic downloadable file block."
        },
        {
          type: "media",
          mediaKind: "file",
          src: "/uploads/seed-guide.md",
          name: "seed-guide.md",
          caption: "Open or download this markdown file."
        },
        { type: "divider" },
        {
          type: "quote",
          text: "Structured blocks make future formatting safer and easier."
        },
        {
          type: "paragraph",
          text: "Next iteration can add archive navigation and richer post metadata."
        }
      ],
      comments: [{ name: "Newcomer", content: "File block preview is clear." }]
    }
  ];

  for (const post of posts) {
    const insertResult = await run(
      `INSERT INTO posts (title, blocks_json, created_at) VALUES (?, ?, ${post.createdAtExpr})`,
      [post.title, JSON.stringify(post.blocks)]
    );

    for (const comment of post.comments) {
      await run(
        "INSERT INTO comments (post_id, name, content, created_at) VALUES (?, ?, ?, datetime('now'))",
        [insertResult.lastID, comment.name || null, comment.content]
      );
    }
  }
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
  seedDb,
  run,
  get,
  all
};
