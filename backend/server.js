require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const { initDb, run, get, all } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);
const adminSecret = process.env.ADMIN_SECRET || "change-me";
const isProduction = process.env.NODE_ENV === "production";
const hasDefaultAdminSecret = adminSecret === "change-me";

function getPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.floor(number);
}

function getBooleanFlag(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }

  return fallback;
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return number;
}

const likeCooldownSeconds = getPositiveInt(process.env.LIKE_COOLDOWN_SECONDS, 10);
const likeCooldownMs = likeCooldownSeconds * 1000;
const likeRateLimitMax = getPositiveInt(process.env.LIKE_RATE_LIMIT_MAX, 20);
const likeIpHashSalt = process.env.LIKE_IP_HASH_SALT || adminSecret;
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "256kb";
const urlencodedBodyLimit = process.env.URLENCODED_BODY_LIMIT || "64kb";
const urlencodedParameterLimit = getPositiveInt(process.env.URLENCODED_PARAMETER_LIMIT, 100);
const trustProxy = getBooleanFlag(process.env.TRUST_PROXY, false);
const maxCommentNameLength = getPositiveInt(process.env.COMMENT_MAX_NAME_LENGTH, 80);
const maxCommentLength = getPositiveInt(process.env.COMMENT_MAX_LENGTH, 1000);
const commentAttemptRateLimitWindowSeconds = getPositiveInt(
  process.env.COMMENT_ATTEMPT_RATE_LIMIT_WINDOW_SECONDS,
  60
);
const commentAttemptRateLimitMax = getPositiveInt(process.env.COMMENT_ATTEMPT_RATE_LIMIT_MAX, 40);
const commentCooldownSeconds = getPositiveInt(process.env.COMMENT_COOLDOWN_SECONDS, 12);
const commentCooldownMs = commentCooldownSeconds * 1000;
const commentBurstWindowSeconds = getPositiveInt(process.env.COMMENT_BURST_WINDOW_SECONDS, 60);
const commentBurstWindowMs = commentBurstWindowSeconds * 1000;
const commentBurstMax = getPositiveInt(process.env.COMMENT_BURST_MAX, 6);
const commentDuplicateWindowSeconds = getPositiveInt(process.env.COMMENT_DUPLICATE_WINDOW_SECONDS, 180);
const commentDuplicateWindowMs = commentDuplicateWindowSeconds * 1000;
const maxCommentUrlCount = getPositiveInt(process.env.COMMENT_MAX_URL_COUNT, 4);
const maxRepeatedCharacterRun = getPositiveInt(process.env.COMMENT_MAX_REPEATED_CHAR_RUN, 18);
const maxRepeatedSymbolRun = Math.min(
  maxRepeatedCharacterRun,
  getPositiveInt(process.env.COMMENT_MAX_REPEATED_SYMBOL_RUN, 10)
);
const maxRepeatedTokenRun = getPositiveInt(process.env.COMMENT_MAX_REPEATED_TOKEN_RUN, 12);
const repetitiveDominanceMinTokenCount = 20;
const repetitiveDominanceThreshold = 0.72;
const lowTokenDiversityMinTokenCount = getPositiveInt(
  process.env.COMMENT_LOW_TOKEN_DIVERSITY_MIN_TOKEN_COUNT,
  24
);
const lowTokenDiversityThreshold = Math.min(
  1,
  getPositiveNumber(process.env.COMMENT_LOW_TOKEN_DIVERSITY_THRESHOLD, 0.2)
);
const lowDiversityCheckMinLength = 120;
const lowDiversityThreshold = 0.08;
const visualNoiseCheckMinLength = 60;
const visualNoiseSymbolThreshold = 0.85;
const commentRateStateByIp = new Map();
const commentDuplicateStateByIp = new Map();
const maxPostBlocks = getPositiveInt(process.env.POST_MAX_BLOCKS, 60);
const maxPostTextLength = getPositiveInt(process.env.POST_MAX_TEXT_LENGTH, 4000);
const maxPostMediaTextLength = getPositiveInt(process.env.POST_MAX_MEDIA_TEXT_LENGTH, 500);
const adminPostRateLimitWindowSeconds = getPositiveInt(
  process.env.ADMIN_POST_RATE_LIMIT_WINDOW_SECONDS,
  300
);
const adminPostRateLimitMax = getPositiveInt(process.env.ADMIN_POST_RATE_LIMIT_MAX, 12);
const adminSessionCookieName = "admin_session";
const adminSessionTtlHours = getPositiveInt(process.env.ADMIN_SESSION_TTL_HOURS, 12);
const adminSessionTtlMs = adminSessionTtlHours * 60 * 60 * 1000;
const adminSessionHashSalt = process.env.ADMIN_SESSION_HASH_SALT || adminSecret;
const adminSessionClockSkewSeconds = getPositiveInt(process.env.ADMIN_SESSION_CLOCK_SKEW_SECONDS, 60);
const adminLoginRateLimitMax = getPositiveInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX, 6);
const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.disable("x-powered-by");
app.set("trust proxy", trustProxy);
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: jsonBodyLimit }));
app.use(
  express.urlencoded({
    extended: true,
    limit: urlencodedBodyLimit,
    parameterLimit: urlencodedParameterLimit
  })
);
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

const commentAttemptLimiter = rateLimit({
  windowMs: commentAttemptRateLimitWindowSeconds * 1000,
  max: commentAttemptRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many comment attempts from this IP. Please slow down and try again." }
});

const adminPostLimiter = rateLimit({
  windowMs: adminPostRateLimitWindowSeconds * 1000,
  max: adminPostRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many post creation attempts. Please wait a few minutes and try again." }
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
  const expressIp = asText(req.ip);
  if (expressIp) {
    return expressIp;
  }

  const socketIp = asText(req.socket && req.socket.remoteAddress);
  return socketIp || "unknown";
}

function hashIpAddress(ipAddress) {
  return crypto.createHash("sha256").update(`${likeIpHashSalt}:${ipAddress}`).digest("hex");
}

function toGraphemes(value) {
  const text = String(value || "");
  if (!text) {
    return [];
  }

  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (item) => item.segment);
  }

  return Array.from(text);
}

function isWhitespaceToken(token) {
  return /^\s+$/u.test(token);
}

function isWordLikeToken(token) {
  return /[\p{L}\p{N}]/u.test(token);
}

function isEmojiOrSymbolToken(token) {
  if (isWordLikeToken(token)) {
    return false;
  }
  return /[\p{Extended_Pictographic}\p{S}]/u.test(token);
}

function tokenizeCommentForDominance(content) {
  const graphemes = toGraphemes(content);
  const tokens = [];
  let wordBuffer = "";

  function flushWordBuffer() {
    if (!wordBuffer) {
      return;
    }
    tokens.push(wordBuffer.toLowerCase());
    wordBuffer = "";
  }

  graphemes.forEach((token) => {
    if (isWhitespaceToken(token)) {
      flushWordBuffer();
      return;
    }

    if (isWordLikeToken(token)) {
      wordBuffer += token;
      return;
    }

    flushWordBuffer();

    if (token.trim()) {
      tokens.push(token);
    }
  });

  flushWordBuffer();
  return tokens;
}

function validateCommentContent(rawContent) {
  const content = asText(rawContent);

  if (!content) {
    return { error: "Comment cannot be empty." };
  }

  if (content.length > maxCommentLength) {
    return { error: `Comment is too long. Maximum is ${maxCommentLength} characters.` };
  }

  const urlMatches = content.match(/(?:https?:\/\/|www\.)/giu);
  if (urlMatches && urlMatches.length > maxCommentUrlCount) {
    return { error: "Comment has too many links. Please reduce links in your message." };
  }

  const graphemes = toGraphemes(content).filter((token) => !isWhitespaceToken(token));

  if (graphemes.length === 0) {
    return { error: "Comment cannot be empty." };
  }

  let repeatedRunLength = 1;
  for (let index = 1; index < graphemes.length; index += 1) {
    const current = graphemes[index];
    const previous = graphemes[index - 1];

    if (current === previous) {
      repeatedRunLength += 1;

      if (isEmojiOrSymbolToken(current) && repeatedRunLength > maxRepeatedSymbolRun) {
        return { error: "Please reduce repeated symbols or emoji." };
      }

      if (repeatedRunLength > maxRepeatedCharacterRun) {
        return { error: "Comment is too repetitive." };
      }
    } else {
      repeatedRunLength = 1;
    }
  }

  const tokens = tokenizeCommentForDominance(content);
  if (tokens.length > 1) {
    let repeatedTokenRun = 1;
    for (let index = 1; index < tokens.length; index += 1) {
      if (tokens[index] === tokens[index - 1]) {
        repeatedTokenRun += 1;
        if (repeatedTokenRun > maxRepeatedTokenRun) {
          const token = tokens[index];
          if (isEmojiOrSymbolToken(token)) {
            return { error: "Please reduce repeated symbols or emoji." };
          }
          return { error: "Comment is too repetitive." };
        }
      } else {
        repeatedTokenRun = 1;
      }
    }
  }

  if (tokens.length >= repetitiveDominanceMinTokenCount) {
    const tokenCounts = new Map();
    let dominantToken = "";
    let dominantCount = 0;

    tokens.forEach((token) => {
      const nextCount = (tokenCounts.get(token) || 0) + 1;
      tokenCounts.set(token, nextCount);
      if (nextCount > dominantCount) {
        dominantCount = nextCount;
        dominantToken = token;
      }
    });

    if (dominantCount / tokens.length >= repetitiveDominanceThreshold) {
      if (isEmojiOrSymbolToken(dominantToken)) {
        return { error: "Please reduce repeated symbols or emoji." };
      }
      return { error: "Comment is too repetitive." };
    }
  }

  if (tokens.length >= lowTokenDiversityMinTokenCount) {
    const tokenDiversityRatio = new Set(tokens).size / tokens.length;
    if (tokenDiversityRatio < lowTokenDiversityThreshold) {
      return { error: "Comment is too repetitive." };
    }
  }

  if (graphemes.length >= lowDiversityCheckMinLength) {
    const diversityRatio = new Set(graphemes).size / graphemes.length;
    if (diversityRatio < lowDiversityThreshold) {
      return { error: "Comment is too repetitive." };
    }
  }

  if (graphemes.length >= visualNoiseCheckMinLength) {
    let symbolCount = 0;
    let wordLikeCount = 0;

    graphemes.forEach((token) => {
      if (isWordLikeToken(token)) {
        wordLikeCount += 1;
      } else if (isEmojiOrSymbolToken(token)) {
        symbolCount += 1;
      }
    });

    if (symbolCount / graphemes.length >= visualNoiseSymbolThreshold && wordLikeCount < 8) {
      return { error: "Please reduce repeated symbols or emoji." };
    }
  }

  return {
    content
  };
}

function readCommentRateState(ipAddress, now) {
  const state = commentRateStateByIp.get(ipAddress);
  if (!state) {
    return { lastPostedAt: 0, postedAt: [] };
  }

  if (!Number.isFinite(state.lastPostedAt)) {
    state.lastPostedAt = 0;
  }

  const postedAt = Array.isArray(state.postedAt) ? state.postedAt : [];
  const recentPostedAt = postedAt.filter(
    (timestamp) => Number.isFinite(timestamp) && now - timestamp < commentBurstWindowMs
  );

  if (!Array.isArray(state.postedAt) || recentPostedAt.length !== postedAt.length) {
    state.postedAt = recentPostedAt;
    commentRateStateByIp.set(ipAddress, state);
  }

  return state;
}

function cleanupCommentRateState(now = Date.now()) {
  if (commentRateStateByIp.size <= 2048) {
    return;
  }

  const staleThreshold = now - commentBurstWindowMs * 2;
  for (const [ip, entry] of commentRateStateByIp.entries()) {
    const lastPostedAt = Number(entry && entry.lastPostedAt);
    const postedAt = Array.isArray(entry && entry.postedAt) ? entry.postedAt : [];
    const hasRecentActivity =
      lastPostedAt > staleThreshold || postedAt.some((timestamp) => timestamp > staleThreshold);

    if (!hasRecentActivity) {
      commentRateStateByIp.delete(ip);
    }
  }
}

function consumeCommentRateSlot(ipAddress, now = Date.now()) {
  const state = readCommentRateState(ipAddress, now);

  if (state.lastPostedAt > 0) {
    const elapsedMs = now - state.lastPostedAt;
    if (elapsedMs < commentCooldownMs) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((commentCooldownMs - elapsedMs) / 1000)),
        error: "You are commenting too quickly. Please wait a moment."
      };
    }
  }

  if (state.postedAt.length >= commentBurstMax) {
    const oldestPostedAt = state.postedAt[0] || now;
    const retryAfterMs = Math.max(1000, commentBurstWindowMs - (now - oldestPostedAt));
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      error: "You are commenting too quickly. Please wait a moment."
    };
  }

  state.lastPostedAt = now;
  state.postedAt.push(now);
  commentRateStateByIp.set(ipAddress, state);
  cleanupCommentRateState(now);

  return { limited: false, retryAfterSeconds: 0, error: "" };
}

function normalizeCommentForDuplicateSignature(content) {
  return asText(content)
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function pruneDuplicateCommentMapEntries(entryMap, now = Date.now()) {
  const threshold = now - commentDuplicateWindowMs;
  for (const [signature, timestamp] of entryMap.entries()) {
    if (!Number.isFinite(timestamp) || timestamp <= threshold) {
      entryMap.delete(signature);
    }
  }
}

function getDuplicateCommentSignature(postId, content) {
  const normalized = normalizeCommentForDuplicateSignature(content);
  return crypto.createHash("sha256").update(`${postId}:${normalized}`).digest("hex");
}

function readDuplicateCommentState(ipAddress, now = Date.now()) {
  const state = commentDuplicateStateByIp.get(ipAddress);
  if (!(state instanceof Map)) {
    return new Map();
  }

  pruneDuplicateCommentMapEntries(state, now);
  if (state.size === 0) {
    commentDuplicateStateByIp.delete(ipAddress);
  }
  return state;
}

function cleanupDuplicateCommentState(now = Date.now()) {
  if (commentDuplicateStateByIp.size <= 2048) {
    return;
  }

  for (const [ipAddress, state] of commentDuplicateStateByIp.entries()) {
    if (!(state instanceof Map)) {
      commentDuplicateStateByIp.delete(ipAddress);
      continue;
    }
    pruneDuplicateCommentMapEntries(state, now);
    if (state.size === 0) {
      commentDuplicateStateByIp.delete(ipAddress);
    }
  }
}

function checkDuplicateComment(ipAddress, postId, content, now = Date.now()) {
  const state = readDuplicateCommentState(ipAddress, now);
  const signature = getDuplicateCommentSignature(postId, content);
  const previousPostedAt = Number(state.get(signature) || 0);
  if (!Number.isFinite(previousPostedAt) || previousPostedAt <= 0) {
    return { duplicate: false, retryAfterSeconds: 0 };
  }

  const elapsedMs = now - previousPostedAt;
  if (elapsedMs >= commentDuplicateWindowMs) {
    return { duplicate: false, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((commentDuplicateWindowMs - elapsedMs) / 1000));
  return { duplicate: true, retryAfterSeconds };
}

function rememberDuplicateComment(ipAddress, postId, content, now = Date.now()) {
  const existing = readDuplicateCommentState(ipAddress, now);
  const state = existing instanceof Map ? existing : new Map();
  const signature = getDuplicateCommentSignature(postId, content);
  state.set(signature, now);
  commentDuplicateStateByIp.set(ipAddress, state);
  cleanupDuplicateCommentState(now);
}

function requireJsonRequest(req, res, next) {
  if (req.is(["application/json", "application/*+json"])) {
    return next();
  }
  return res.status(415).json({ error: "Unsupported content type. Please send JSON." });
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) {
    return Buffer.alloc(0);
  }

  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

function signAdminSessionPayload(encodedPayload) {
  return toBase64Url(
    crypto
      .createHmac("sha256", adminSessionHashSalt)
      .update(String(encodedPayload || ""))
      .digest()
  );
}

function formatSqlDatetimeFromUnixSeconds(unixSeconds) {
  const millis = Number(unixSeconds) * 1000;
  const date = new Date(millis);
  if (!Number.isFinite(millis) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
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
  return;
}

async function createAdminSession() {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + Math.floor(adminSessionTtlMs / 1000);
  const payload = {
    v: 1,
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
    nonce: crypto.randomBytes(16).toString("hex")
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signAdminSessionPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    createdAt: formatSqlDatetimeFromUnixSeconds(issuedAtSeconds),
    expiresAt: formatSqlDatetimeFromUnixSeconds(expiresAtSeconds)
  };
}

async function deleteAdminSessionByToken(token) {
  return;
}

async function getAdminSessionFromRequest(req) {
  const rawToken = readCookie(req, adminSessionCookieName);
  if (!rawToken) {
    return null;
  }

  const parts = String(rawToken).split(".");
  if (parts.length !== 2) {
    return null;
  }

  const encodedPayload = parts[0];
  const signature = parts[1];
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signAdminSessionPayload(encodedPayload);
  if (!secureSecretsMatch(signature, expectedSignature)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const issuedAtSeconds = Number(payload.iat);
  const expiresAtSeconds = Number(payload.exp);
  if (!Number.isInteger(issuedAtSeconds) || !Number.isInteger(expiresAtSeconds)) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (issuedAtSeconds > nowSeconds + adminSessionClockSkewSeconds) {
    return null;
  }
  if (expiresAtSeconds <= nowSeconds - adminSessionClockSkewSeconds) {
    return null;
  }

  const maxSessionDurationSeconds = Math.floor(adminSessionTtlMs / 1000);
  if (expiresAtSeconds - issuedAtSeconds > maxSessionDurationSeconds + adminSessionClockSkewSeconds) {
    return null;
  }

  const createdAt = formatSqlDatetimeFromUnixSeconds(issuedAtSeconds);
  const expiresAt = formatSqlDatetimeFromUnixSeconds(expiresAtSeconds);
  if (!createdAt || !expiresAt) {
    return null;
  }

  return {
    created_at: createdAt,
    expires_at: expiresAt
  };
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

function parsePositiveCommentId(value) {
  const commentId = Number(value);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return null;
  }
  return commentId;
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
    if (text.length > maxPostTextLength) {
      return { error: `${fieldPrefix}.text must be at most ${maxPostTextLength} characters.` };
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
    if (text.length > maxPostTextLength) {
      return { error: `${fieldPrefix}.text must be at most ${maxPostTextLength} characters.` };
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

    if (name.length > maxPostMediaTextLength) {
      return { error: `${fieldPrefix}.name must be at most ${maxPostMediaTextLength} characters.` };
    }
    if (alt.length > maxPostMediaTextLength) {
      return { error: `${fieldPrefix}.alt must be at most ${maxPostMediaTextLength} characters.` };
    }
    if (caption.length > maxPostMediaTextLength) {
      return { error: `${fieldPrefix}.caption must be at most ${maxPostMediaTextLength} characters.` };
    }

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
  } else if (rawBlocks.length > maxPostBlocks) {
    errors.push(`blocks must contain at most ${maxPostBlocks} items.`);
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
  const audioBlock = blocks.find(
    (item) => item.type === "media" && item.mediaKind === "audio" && item.src
  );

  const block =
    audioBlock ||
    blocks.find(
      (item) =>
        item.type === "media" && allowedMediaKinds.has(item.mediaKind) && item.src
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

    const session = await createAdminSession();
    setAdminSessionCookie(res, session.token);

    res.json({
      ok: true,
      authenticated: true,
      expires_in_seconds: Math.floor(adminSessionTtlMs / 1000),
      created_at: session.createdAt,
      expires_at: session.expiresAt
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
      "SELECT id, post_id, parent_id, name, content, created_at FROM comments WHERE post_id = ? ORDER BY datetime(created_at) " +
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

app.post("/comments", requireJsonRequest, commentAttemptLimiter, async (req, res, next) => {
  try {
    const parsedPostId = Number(req.body.post_id);
    const postId = Number.isInteger(parsedPostId) && parsedPostId > 0 ? parsedPostId : null;
    const rawParentId = req.body.parent_id;
    const name = asText(req.body.name);
    const honeypot = asText(req.body.website);

    if (honeypot) {
      return res.status(400).json({ error: "Spam detected." });
    }

    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    if (name.length > maxCommentNameLength) {
      return res
        .status(400)
        .json({ error: `Comment name is too long. Maximum is ${maxCommentNameLength} characters.` });
    }

    const commentValidation = validateCommentContent(req.body.content);
    if (commentValidation.error) {
      return res.status(400).json({ error: commentValidation.error });
    }
    const content = commentValidation.content;

    let parentId = null;
    const hasParentId = rawParentId !== undefined && rawParentId !== null && String(rawParentId).trim() !== "";
    if (hasParentId) {
      parentId = Number(rawParentId);
      if (!Number.isInteger(parentId) || parentId <= 0) {
        return res.status(400).json({ error: "Invalid parent comment id." });
      }
    }

    const clientIp = getClientIp(req);
    const now = Date.now();
    const duplicateComment = checkDuplicateComment(clientIp, postId, content, now);
    if (duplicateComment.duplicate) {
      res.set("Retry-After", String(duplicateComment.retryAfterSeconds));
      return res.status(429).json({
        error: "You posted the same comment very recently. Please wait or edit it."
      });
    }

    const commentRateLimit = consumeCommentRateSlot(clientIp, now);
    if (commentRateLimit.limited) {
      res.set("Retry-After", String(commentRateLimit.retryAfterSeconds));
      return res.status(429).json({ error: commentRateLimit.error });
    }

    const postExists = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!postExists) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (parentId !== null) {
      const parentComment = await get("SELECT id, post_id FROM comments WHERE id = ?", [parentId]);
      if (!parentComment || Number(parentComment.post_id) !== postId) {
        return res.status(404).json({ error: "Parent comment not found." });
      }
    }

    await run(
      "INSERT INTO comments (post_id, parent_id, name, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
      [postId, parentId, name || null, content]
    );
    rememberDuplicateComment(clientIp, postId, content, now);

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/comments/:id", requireAdminSession, async (req, res, next) => {
  try {
    const commentId = parsePositiveCommentId(req.params.id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment id." });
    }

    const existingComment = await get("SELECT id, post_id FROM comments WHERE id = ?", [commentId]);
    if (!existingComment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    await run(
      `
        WITH RECURSIVE comment_tree(id) AS (
          SELECT id FROM comments WHERE id = ?
          UNION ALL
          SELECT comments.id
          FROM comments
          JOIN comment_tree ON comments.parent_id = comment_tree.id
        )
        DELETE FROM comments
        WHERE id IN (SELECT id FROM comment_tree)
      `,
      [commentId]
    );
    res.json({
      ok: true,
      id: existingComment.id,
      post_id: existingComment.post_id
    });
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

app.post("/posts", requireAdminSession, adminPostLimiter, async (req, res, next) => {
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

app.delete("/posts/:id", requireAdminSession, async (req, res, next) => {
  try {
    const postId = parsePositivePostId(req.params.id);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const existingPost = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!existingPost) {
      return res.status(404).json({ error: "Post not found." });
    }

    await run("DELETE FROM posts WHERE id = ?", [postId]);
    res.json({ ok: true, id: postId });
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
  const statusCode = Number(err && (err.status || err.statusCode)) || 0;
  const errorType = String((err && err.type) || "").toLowerCase();

  if (errorType === "entity.too.large" || statusCode === 413) {
    if (req.path === "/comments" && req.method === "POST") {
      return res
        .status(413)
        .json({ error: "Comment request is too large. Please shorten your name or comment." });
    }
    return res.status(413).json({ error: "Request is too large." });
  }

  if (errorType === "entity.parse.failed") {
    if (req.path === "/comments" && req.method === "POST") {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
    return res.status(400).json({ error: "Invalid request payload." });
  }

  if (statusCode === 415) {
    return res.status(415).json({ error: "Unsupported content type. Please send JSON." });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error." });
});

async function start() {
  if (hasDefaultAdminSecret) {
    if (isProduction) {
      throw new Error("ADMIN_SECRET must be changed from the default value in production.");
    }
    console.warn("Warning: ADMIN_SECRET uses the default value. Set a strong secret before deployment.");
  }

  await initDb();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
