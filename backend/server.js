require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const { initDb, seedDb, run, get, all } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);
const adminSecret = process.env.ADMIN_SECRET || "change-me";
const isProduction = process.env.NODE_ENV === "production";

function getPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.floor(number);
}

const likeCooldownSeconds = getPositiveInt(process.env.LIKE_COOLDOWN_SECONDS, 10);
const likeCooldownMs = likeCooldownSeconds * 1000;
const likeRateLimitMax = getPositiveInt(process.env.LIKE_RATE_LIMIT_MAX, 20);
const likeIpHashSalt = process.env.LIKE_IP_HASH_SALT || adminSecret;
const adminSessionCookieName = "admin_session";
const adminSessionTtlHours = getPositiveInt(process.env.ADMIN_SESSION_TTL_HOURS, 12);
const adminSessionTtlMs = adminSessionTtlHours * 60 * 60 * 1000;
const adminSessionHashSalt = process.env.ADMIN_SESSION_HASH_SALT || adminSecret;
const adminLoginRateLimitMax = getPositiveInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX, 6);

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use(async (req, res, next) => {
  try {
    req.adminSession = await getAdminSessionFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many comments from this IP. Please try again in a minute." }
});

const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: likeRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many like requests from this IP. Please wait a minute and try again." }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: adminLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many admin login attempts. Please try again in about 15 minutes." }
});

const allowedMediaKinds = new Set(["image", "gif", "video", "audio", "file"]);
const maxUploadSizeBytes = 25 * 1024 * 1024;
const maxPostTitleLength = 160;

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const gifExtensions = new Set([".gif"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov"]);
const audioExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const extension = getSafeExtension(file.originalname);
      const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
      cb(null, storedName);
    }
  }),
  limits: {
    fileSize: maxUploadSizeBytes
  }
});

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMediaSrc(value) {
  const src = asText(value);
  if (!src.startsWith("/uploads/")) {
    return "";
  }
  return src;
}

function getSafeExtension(fileName) {
  const extension = path.extname(asText(fileName)).toLowerCase();
  if (!extension) return "";
  if (!/^\.[a-z0-9]{1,10}$/.test(extension)) return "";
  return extension;
}

function detectMediaKind(fileName) {
  const extension = getSafeExtension(fileName);

  if (gifExtensions.has(extension)) return "gif";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  return "file";
}

function removeFileIfExists(filePath) {
  fs.unlink(filePath, () => {
    return;
  });
}

function getClientIp(req) {
  const forwardedHeader = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedHeader) ? forwardedHeader[0] : asText(forwardedHeader);

  if (forwarded) {
    const [first] = forwarded.split(",");
    return asText(first) || "unknown";
  }

  return asText(req.ip) || "unknown";
}

function hashIpAddress(ipAddress) {
  return crypto.createHash("sha256").update(`${likeIpHashSalt}:${ipAddress}`).digest("hex");
}

function hashAdminSessionToken(token) {
  return crypto.createHash("sha256").update(`${adminSessionHashSalt}:${token}`).digest("hex");
}

function secureSecretsMatch(providedSecret, expectedSecret) {
  const provided = Buffer.from(providedSecret || "", "utf8");
  const expected = Buffer.from(expectedSecret || "", "utf8");
  if (provided.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(provided, expected);
}

function parseCookies(cookieHeader) {
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
    return {};
  }

  const cookies = {};
  cookieHeader.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;

    const rawName = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!rawName) return;

    try {
      const name = decodeURIComponent(rawName);
      const value = decodeURIComponent(rawValue);
      cookies[name] = value;
    } catch (error) {
      return;
    }
  });

  return cookies;
}

function readCookie(req, name) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[name] || "";
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value || "")}`];

  if (typeof options.maxAgeSeconds === "number" && Number.isFinite(options.maxAgeSeconds)) {
    const maxAge = Math.max(0, Math.floor(options.maxAgeSeconds));
    parts.push(`Max-Age=${maxAge}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

function setAdminSessionCookie(res, token) {
  const cookie = serializeCookie(adminSessionCookieName, token, {
    maxAgeSeconds: Math.floor(adminSessionTtlMs / 1000),
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax"
  });
  res.append("Set-Cookie", cookie);
}

function clearAdminSessionCookie(res) {
  const cookie = serializeCookie(adminSessionCookieName, "", {
    maxAgeSeconds: 0,
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax"
  });
  res.append("Set-Cookie", cookie);
}

async function deleteExpiredAdminSessions() {
  await run("DELETE FROM admin_sessions WHERE datetime(expires_at) <= datetime('now')");
}

async function createAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAdminSessionToken(token);
  const expiryModifier = `+${adminSessionTtlHours} hour`;

  await deleteExpiredAdminSessions();
  await run("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, datetime('now', ?))", [
    tokenHash,
    expiryModifier
  ]);

  return token;
}

async function deleteAdminSessionByToken(token) {
  if (!token) {
    return;
  }

  const tokenHash = hashAdminSessionToken(token);
  await run("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash]);
}

async function getAdminSessionFromRequest(req) {
  const token = readCookie(req, adminSessionCookieName);
  if (!token) {
    return null;
  }

  const tokenHash = hashAdminSessionToken(token);
  const session = await get(
    "SELECT id, created_at, expires_at FROM admin_sessions WHERE token_hash = ? AND datetime(expires_at) > datetime('now')",
    [tokenHash]
  );
  return session || null;
}

function requireAdminSession(req, res, next) {
  if (!req.adminSession) {
    return res.status(401).json({ error: "Admin login required." });
  }
  next();
}

function parsePositivePostId(value) {
  const postId = Number(value);
  if (!Number.isInteger(postId) || postId <= 0) {
    return null;
  }
  return postId;
}

function asLikeCount(value) {
  const likes = Number(value);
  if (!Number.isFinite(likes) || likes < 0) {
    return 0;
  }
  return Math.floor(likes);
}

function parseUtcMillis(sqlDateText) {
  const parsed = new Date(String(sqlDateText || "").replace(" ", "T") + "Z");
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function normalizeBlock(rawBlock) {
  if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) {
    return null;
  }

  const type = asText(rawBlock.type);

  if (type === "paragraph") {
    const text = asText(rawBlock.text);
    if (!text) return null;
    return { type: "paragraph", text };
  }

  if (type === "heading") {
    const level = Number(rawBlock.level);
    const text = asText(rawBlock.text);
    if (!text || ![1, 2, 3].includes(level)) return null;
    return { type: "heading", level, text };
  }

  if (type === "quote") {
    const text = asText(rawBlock.text);
    if (!text) return null;
    return { type: "quote", text };
  }

  if (type === "divider") {
    return { type: "divider" };
  }

  if (type === "media") {
    const mediaKind = asText(rawBlock.mediaKind);
    const src = safeMediaSrc(rawBlock.src);
    if (!allowedMediaKinds.has(mediaKind) || !src) return null;

    const block = {
      type: "media",
      mediaKind,
      src
    };

    const name = asText(rawBlock.name);
    const alt = asText(rawBlock.alt);
    const caption = asText(rawBlock.caption);

    if (name) block.name = name;
    if (alt) block.alt = alt;
    if (caption) block.caption = caption;

    return block;
  }

  return null;
}

function validateAndNormalizePostBlock(rawBlock, index) {
  const fieldPrefix = `blocks[${index}]`;

  if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) {
    return { error: `${fieldPrefix} must be an object.` };
  }

  const type = asText(rawBlock.type);
  if (!type) {
    return { error: `${fieldPrefix}.type is required.` };
  }

  if (type === "paragraph" || type === "quote") {
    const text = asText(rawBlock.text);
    if (!text) {
      return { error: `${fieldPrefix}.text is required for ${type}.` };
    }
    return { block: { type, text } };
  }

  if (type === "heading") {
    const text = asText(rawBlock.text);
    const level = Number(rawBlock.level);
    if (!text) {
      return { error: `${fieldPrefix}.text is required for heading.` };
    }
    if (![1, 2, 3].includes(level)) {
      return { error: `${fieldPrefix}.level must be 1, 2, or 3.` };
    }
    return { block: { type: "heading", level, text } };
  }

  if (type === "divider") {
    return { block: { type: "divider" } };
  }

  if (type === "media") {
    const mediaKind = asText(rawBlock.mediaKind);
    const src = safeMediaSrc(rawBlock.src);

    if (!mediaKind) {
      return { error: `${fieldPrefix}.mediaKind is required for media.` };
    }

    if (!allowedMediaKinds.has(mediaKind)) {
      return { error: `${fieldPrefix}.mediaKind is invalid.` };
    }

    if (!src) {
      return { error: `${fieldPrefix}.src must be a local /uploads/... path.` };
    }

    const block = {
      type: "media",
      mediaKind,
      src
    };

    const name = asText(rawBlock.name);
    const alt = asText(rawBlock.alt);
    const caption = asText(rawBlock.caption);

    if (name) block.name = name;
    if (alt) block.alt = alt;
    if (caption) block.caption = caption;

    return { block };
  }

  return { error: `${fieldPrefix}.type is invalid.` };
}

function validateCreatePostPayload(body) {
  const errors = [];
  const title = asText(body && body.title);
  const rawBlocks = body ? body.blocks : undefined;
  const blocks = [];

  if (!title) {
    errors.push("title is required.");
  } else if (title.length > maxPostTitleLength) {
    errors.push(`title must be at most ${maxPostTitleLength} characters.`);
  }

  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    errors.push("blocks must be a non-empty array.");
  } else {
    rawBlocks.forEach((rawBlock, index) => {
      const result = validateAndNormalizePostBlock(rawBlock, index);
      if (result.error) {
        errors.push(result.error);
      } else {
        blocks.push(result.block);
      }
    });
  }

  return {
    errors,
    value: {
      title,
      blocks
    }
  };
}

function parseBlocksJson(rawJson) {
  if (typeof rawJson !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const blocks = parsed
      .map((block) => normalizeBlock(block))
      .filter((block) => block !== null);

    return blocks;
  } catch (error) {
    return [];
  }
}

function getPreviewText(blocks) {
  const firstParagraph = blocks.find((block) => block.type === "paragraph");
  return firstParagraph ? firstParagraph.text : "";
}

function getPreviewMedia(blocks) {
  const block = blocks.find(
    (item) =>
      item.type === "media" && (item.mediaKind === "image" || item.mediaKind === "gif") && item.src
  );

  if (!block) {
    return null;
  }

  return {
    mediaKind: block.mediaKind,
    src: block.src,
    alt: block.alt || "",
    caption: block.caption || "",
    name: block.name || ""
  };
}

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin.html"));
});

app.post("/admin/login", adminLoginLimiter, async (req, res, next) => {
  try {
    const secret = asText(req.body && req.body.secret);
    if (!secret) {
      return res.status(400).json({ error: "Admin secret is required." });
    }

    if (!secureSecretsMatch(secret, adminSecret)) {
      return res.status(401).json({ error: "Invalid admin secret." });
    }

    const token = await createAdminSession();
    setAdminSessionCookie(res, token);

    res.json({
      ok: true,
      authenticated: true,
      expires_in_seconds: Math.floor(adminSessionTtlMs / 1000)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/logout", async (req, res, next) => {
  try {
    const token = readCookie(req, adminSessionCookieName);
    await deleteAdminSessionByToken(token);
    clearAdminSessionCookie(res);
    await deleteExpiredAdminSessions();

    res.json({ ok: true, authenticated: false });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/session", async (req, res, next) => {
  try {
    await deleteExpiredAdminSessions();
    const session = req.adminSession;

    if (!session) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      created_at: session.created_at,
      expires_at: session.expires_at
    });
  } catch (error) {
    next(error);
  }
});

app.get("/posts", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const rows = await all(
      "SELECT id, title, blocks_json, likes_count, created_at FROM posts ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const items = rows.map((row) => {
      const blocks = parseBlocksJson(row.blocks_json);
      return {
        id: row.id,
        title: row.title,
        likes: asLikeCount(row.likes_count),
        created_at: row.created_at,
        preview_text: getPreviewText(blocks),
        preview_media: getPreviewMedia(blocks)
      };
    });
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
    const row = await get(
      "SELECT id, title, blocks_json, likes_count, created_at FROM posts WHERE id = ?",
      [req.params.id]
    );

    if (!row) {
      return res.status(404).json({ error: "Post not found." });
    }

    res.json({
      id: row.id,
      title: row.title,
      likes: asLikeCount(row.likes_count),
      created_at: row.created_at,
      blocks: parseBlocksJson(row.blocks_json)
    });
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

app.get("/posts/:id/likes", async (req, res, next) => {
  try {
    const postId = parsePositivePostId(req.params.id);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const post = await get("SELECT id, likes_count FROM posts WHERE id = ?", [postId]);
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    res.json({
      postId: post.id,
      likes: asLikeCount(post.likes_count)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/posts/:id/like", likeLimiter, async (req, res, next) => {
  try {
    const postId = parsePositivePostId(req.params.id);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const post = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const ipAddress = getClientIp(req);
    const ipHash = hashIpAddress(ipAddress);
    const recentLike = await get(
      "SELECT created_at FROM like_events WHERE post_id = ? AND ip_hash = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
      [postId, ipHash]
    );

    if (recentLike) {
      const recentLikeMillis = parseUtcMillis(recentLike.created_at);
      if (recentLikeMillis > 0) {
        const retryAtMillis = recentLikeMillis + likeCooldownMs;
        if (Date.now() < retryAtMillis) {
          const retryAfterSeconds = Math.max(1, Math.ceil((retryAtMillis - Date.now()) / 1000));
          return res.status(429).json({
            error: `You already liked this post recently. Please wait about ${retryAfterSeconds} seconds.`
          });
        }
      }
    }

    await run("INSERT INTO like_events (post_id, ip_hash, created_at) VALUES (?, ?, datetime('now'))", [
      postId,
      ipHash
    ]);
    await run("UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?", [postId]);
    await run("DELETE FROM like_events WHERE datetime(created_at) < datetime('now', '-14 day')");

    const updatedPost = await get("SELECT likes_count FROM posts WHERE id = ?", [postId]);

    res.json({
      success: true,
      postId,
      likes: asLikeCount(updatedPost && updatedPost.likes_count)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/posts", requireAdminSession, async (req, res, next) => {
  try {
    const payload = validateCreatePostPayload(req.body);
    if (payload.errors.length > 0) {
      return res.status(400).json({
        error: "Invalid post payload.",
        details: payload.errors
      });
    }

    const { title, blocks } = payload.value;

    const result = await run(
      "INSERT INTO posts (title, blocks_json, created_at) VALUES (?, ?, datetime('now'))",
      [title, JSON.stringify(blocks)]
    );

    const newPost = await get(
      "SELECT id, title, blocks_json, likes_count, created_at FROM posts WHERE id = ?",
      [result.lastID]
    );

    res.status(201).json({
      id: newPost.id,
      title: newPost.title,
      likes: asLikeCount(newPost.likes_count),
      created_at: newPost.created_at,
      blocks: parseBlocksJson(newPost.blocks_json)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/upload", requireAdminSession, (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({ error: `File is too large. Max size is ${Math.floor(maxUploadSizeBytes / 1024 / 1024)}MB.` });
      }
      return next(error);
    }

    if (!req.file) {
      return res.status(400).json({ error: "file is required." });
    }

    if (!req.file.size) {
      removeFileIfExists(req.file.path);
      return res.status(400).json({ error: "Empty file uploads are not allowed." });
    }

    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      originalName: asText(req.file.originalname) || "file",
      storedName: req.file.filename,
      mediaKind: detectMediaKind(req.file.filename)
    });
  });
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
  await seedDb();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
