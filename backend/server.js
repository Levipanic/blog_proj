require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const { initDb, run, get, all } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);
const adminSecret = process.env.ADMIN_SECRET || "change-me";

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}${ext || ".jpg"}`);
  }
});

const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "..", "frontend")));

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many comments from this IP. Please try again in a minute." }
});

app.get("/posts", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const items = await all(
      "SELECT id, content, image_url, created_at FROM posts ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const totalRow = await get("SELECT COUNT(*) AS total FROM posts");

    res.json({
      items,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/posts/:id", async (req, res, next) => {
  try {
    const post = await get(
      "SELECT id, content, image_url, created_at FROM posts WHERE id = ?",
      [req.params.id]
    );

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.get("/comments/:post_id", async (req, res, next) => {
  try {
    const requestedOrder = String(req.query.order || "asc").toLowerCase();
    const order = requestedOrder === "desc" ? "DESC" : "ASC";
    const parsedLimit = Number(req.query.limit);
    const hasLimit = Number.isInteger(parsedLimit) && parsedLimit > 0;
    const limit = Math.min(20, parsedLimit);

    let sql =
      "SELECT id, post_id, name, content, created_at FROM comments WHERE post_id = ? ORDER BY datetime(created_at) " +
      order +
      ", id " +
      order;
    const params = [req.params.post_id];

    if (hasLimit) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const comments = await all(sql, params);

    res.json(comments);
  } catch (error) {
    next(error);
  }
});

app.post("/comments", commentLimiter, async (req, res, next) => {
  try {
    const postId = Number(req.body.post_id);
    const name = (req.body.name || "").trim();
    const content = (req.body.content || "").trim();
    const honeypot = (req.body.website || "").trim();

    if (honeypot) {
      return res.status(400).json({ error: "Spam detected." });
    }

    if (!postId || !content) {
      return res.status(400).json({ error: "post_id and content are required." });
    }

    const postExists = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!postExists) {
      return res.status(404).json({ error: "Post not found." });
    }

    await run(
      "INSERT INTO comments (post_id, name, content, created_at) VALUES (?, ?, ?, datetime('now'))",
      [postId, name || null, content]
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/posts", upload.single("image"), async (req, res, next) => {
  try {
    if (req.headers["x-admin-secret"] !== adminSecret) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const content = (req.body.content || "").trim();
    if (!content) {
      return res.status(400).json({ error: "content is required." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "image is required." });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const result = await run(
      "INSERT INTO posts (content, image_url, created_at) VALUES (?, ?, datetime('now'))",
      [content, imageUrl]
    );

    const newPost = await get(
      "SELECT id, content, image_url, created_at FROM posts WHERE id = ?",
      [result.lastID]
    );

    res.status(201).json(newPost);
  } catch (error) {
    next(error);
  }
});

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

async function start() {
  await initDb();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
