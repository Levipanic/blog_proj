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
const globalApiRateLimitWindowSeconds = getPositiveInt(process.env.GLOBAL_API_RATE_LIMIT_WINDOW_SECONDS, 60);
const globalApiRateLimitMax = getPositiveInt(process.env.GLOBAL_API_RATE_LIMIT_MAX, 240);
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
const commentBurstMax = getPositiveInt(process.env.COMMENT_BURST_MAX, 6);
const commentDuplicateWindowSeconds = getPositiveInt(process.env.COMMENT_DUPLICATE_WINDOW_SECONDS, 180);
const commentDuplicateWindowMs = commentDuplicateWindowSeconds * 1000;
const maxCommentUrlCount = getPositiveInt(process.env.COMMENT_MAX_URL_COUNT, 4);
const maxCommentTokenLength = getPositiveInt(process.env.COMMENT_MAX_TOKEN_LENGTH, 120);
const maxRepeatedCharacterRun = getPositiveInt(process.env.COMMENT_MAX_REPEATED_CHAR_RUN, 18);
const maxRepeatedSymbolRun = Math.min(
  maxRepeatedCharacterRun,
  getPositiveInt(process.env.COMMENT_MAX_REPEATED_SYMBOL_RUN, 10)
);
const maxRepeatedTokenRun = getPositiveInt(process.env.COMMENT_MAX_REPEATED_TOKEN_RUN, 12);
const commentRandomTextMinLength = getPositiveInt(process.env.COMMENT_RANDOM_TEXT_MIN_LENGTH, 120);
const commentRandomTokenMinLength = getPositiveInt(process.env.COMMENT_RANDOM_TOKEN_MIN_LENGTH, 12);
const commentRandomTokenMinCount = getPositiveInt(process.env.COMMENT_RANDOM_TOKEN_MIN_COUNT, 4);
const commentRandomTokenMinShare = Math.min(
  1,
  getPositiveNumber(process.env.COMMENT_RANDOM_TOKEN_MIN_SHARE, 0.5)
);
const repetitiveDominanceMinTokenCount = 20;
const repetitiveDominanceThreshold = 0.72;
const lowTokenDiversityMinTokenCount = getPositiveInt(
  process.env.COMMENT_LOW_TOKEN_DIVERSITY_MIN_TOKEN_COUNT,
  24
);
const lowTokenDiversityContentMinLength = getPositiveInt(
  process.env.COMMENT_LOW_TOKEN_DIVERSITY_CONTENT_MIN_LENGTH,
  180
);
const lowTokenDiversityThreshold = Math.min(
  1,
  getPositiveNumber(process.env.COMMENT_LOW_TOKEN_DIVERSITY_THRESHOLD, 0.14)
);
const lowDiversityCheckMinLength = 120;
const lowDiversityThreshold = 0.08;
const visualNoiseCheckMinLength = 60;
const visualNoiseSymbolThreshold = 0.85;
const commentSoftLimitError = "Too many messages in a row. Please try a bit later.";
const commentChallengeTtlSeconds = getPositiveInt(process.env.COMMENT_CHALLENGE_TTL_SECONDS, 30 * 60);
const commentChallengeTtlMs = commentChallengeTtlSeconds * 1000;
const commentChallengeClockSkewSeconds = getPositiveInt(process.env.COMMENT_CHALLENGE_CLOCK_SKEW_SECONDS, 60);
const commentChallengeSalt = process.env.COMMENT_CHALLENGE_SALT || adminSecret;
const commentMuteSeconds = getPositiveInt(process.env.COMMENT_MUTE_SECONDS, 30 * 60);
const commentHoneypotMuteThreshold = getPositiveInt(process.env.COMMENT_HONEYPOT_MUTE_THRESHOLD, 2);
const commentRejectedMuteThreshold = getPositiveInt(process.env.COMMENT_REJECTED_MUTE_THRESHOLD, 12);
const commentAttemptContentMaxLength = getPositiveInt(process.env.COMMENT_ATTEMPT_CONTENT_MAX_LENGTH, 500);
const commentAdminListLimit = getPositiveInt(process.env.COMMENT_ADMIN_LIST_LIMIT, 40);
const commentPostRateLimitWindowSeconds = getPositiveInt(
  process.env.COMMENT_POST_RATE_LIMIT_WINDOW_SECONDS,
  120
);
const commentPostRateLimitMax = getPositiveInt(process.env.COMMENT_POST_RATE_LIMIT_MAX, 30);
const commentGlobalRateLimitWindowSeconds = getPositiveInt(
  process.env.COMMENT_GLOBAL_RATE_LIMIT_WINDOW_SECONDS,
  60
);
const commentGlobalRateLimitMax = getPositiveInt(process.env.COMMENT_GLOBAL_RATE_LIMIT_MAX, 120);
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
app.get("/admin.html", (req, res) => {
  res.redirect(302, "/admin");
});
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use(async (req, res, next) => {
  try {
    req.adminSession = await getAdminSessionFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
});

const globalApiLimiter = rateLimit({
  windowMs: globalApiRateLimitWindowSeconds * 1000,
  max: globalApiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many requests from this IP. Please wait a moment and try again." }
});

app.use(["/posts", "/comments", "/upload", "/admin"], globalApiLimiter);

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
  message: { error: commentSoftLimitError }
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

function hashCommentToken(value) {
  return crypto.createHash("sha256").update(`${commentChallengeSalt}:${String(value || "")}`).digest("hex");
}

function createCommentChallenge(postId) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(12).toString("hex");
  const honeypotField = `hp_${crypto.randomBytes(6).toString("hex")}`;
  const payload = `${postId}.${issuedAt}.${nonce}.${honeypotField}`;
  const signature = crypto.createHmac("sha256", commentChallengeSalt).update(payload).digest("hex");

  return {
    token: `${payload}.${signature}`,
    honeypot_field: honeypotField,
    expires_in_seconds: commentChallengeTtlSeconds
  };
}

function parseCommentChallengeToken(token) {
  const value = String(token || "").trim();
  const parts = value.split(".");
  if (parts.length !== 5) {
    return { valid: false, reason: "invalid_challenge_format" };
  }

  const [postIdText, issuedAtText, nonce, honeypotField, signature] = parts;
  const postId = Number(postIdText);
  const issuedAt = Number(issuedAtText);
  if (!Number.isInteger(postId) || postId <= 0) {
    return { valid: false, reason: "invalid_challenge_post" };
  }
  if (!Number.isInteger(issuedAt) || issuedAt <= 0) {
    return { valid: false, reason: "invalid_challenge_time" };
  }
  if (!/^[a-f0-9]{24}$/i.test(nonce)) {
    return { valid: false, reason: "invalid_challenge_nonce" };
  }
  if (!/^hp_[a-f0-9]{12}$/i.test(honeypotField)) {
    return { valid: false, reason: "invalid_challenge_honeypot" };
  }
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, reason: "invalid_challenge_signature" };
  }

  const payload = `${postIdText}.${issuedAtText}.${nonce}.${honeypotField}`;
  const expectedSignature = crypto
    .createHmac("sha256", commentChallengeSalt)
    .update(payload)
    .digest("hex");
  if (!secureSecretsMatch(signature, expectedSignature)) {
    return { valid: false, reason: "bad_challenge_signature" };
  }

  const issuedAtMillis = issuedAt * 1000;
  const now = Date.now();
  if (issuedAtMillis > now + commentChallengeClockSkewSeconds * 1000) {
    return { valid: false, reason: "future_challenge" };
  }
  if (now - issuedAtMillis > commentChallengeTtlMs) {
    return { valid: false, reason: "expired_challenge" };
  }

  return {
    valid: true,
    postId,
    issuedAt,
    honeypotField,
    tokenHash: hashCommentToken(value),
    ageSeconds: Math.max(0, Math.floor((now - issuedAtMillis) / 1000))
  };
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

function countTokenVowels(token) {
  const matches = String(token || "").match(/[aeiouyаеёиоуыэюя]/giu);
  return matches ? matches.length : 0;
}

function isLikelyRandomSpamToken(token) {
  const value = String(token || "");
  if (!value || value.length < commentRandomTokenMinLength) {
    return false;
  }

  if (/^[\p{L}]{2,}$/u.test(value)) {
    return false;
  }

  if (!/[\p{L}]/u.test(value)) {
    return false;
  }

  const hasDigit = /\d/u.test(value);
  const hasMixedCase = /[a-z]/u.test(value) && /[A-Z]/u.test(value);
  const hasConnector = /[_\-]/u.test(value);
  const symbolCount = (value.match(/[^\p{L}\p{N}]/gu) || []).length;
  const symbolRatio = symbolCount / value.length;
  const uniqueRatio = new Set(Array.from(value.toLowerCase())).size / value.length;
  const vowelRatio = countTokenVowels(value) / value.length;

  if (uniqueRatio < 0.45) {
    return false;
  }

  if (vowelRatio > 0.45) {
    return false;
  }

  return hasDigit || hasMixedCase || hasConnector || symbolRatio > 0.18;
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

  const whitespaceTokens = content
    .split(/\s+/u)
    .map((token) => String(token || "").trim())
    .filter((token) => token.length > 0);

  const longestTokenLength = whitespaceTokens.reduce(
    (longest, token) => Math.max(longest, token.length),
    0
  );
  if (longestTokenLength > maxCommentTokenLength) {
    return { error: "Comment has an excessively long token. Please shorten it." };
  }

  if (content.length >= commentRandomTextMinLength && whitespaceTokens.length >= commentRandomTokenMinCount) {
    const randomTokenCount = whitespaceTokens.reduce(
      (count, token) => count + (isLikelyRandomSpamToken(token) ? 1 : 0),
      0
    );
    if (
      randomTokenCount >= commentRandomTokenMinCount &&
      randomTokenCount / whitespaceTokens.length >= commentRandomTokenMinShare
    ) {
      return { error: "Comment looks like automated text spam. Please rewrite it in normal words." };
    }
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

  const wordTokens = tokens.filter((token) => isWordLikeToken(token));
  const dominanceTokens =
    wordTokens.length >= repetitiveDominanceMinTokenCount ? wordTokens : tokens;

  if (dominanceTokens.length >= repetitiveDominanceMinTokenCount) {
    const tokenCounts = new Map();
    let dominantToken = "";
    let dominantCount = 0;

    dominanceTokens.forEach((token) => {
      const nextCount = (tokenCounts.get(token) || 0) + 1;
      tokenCounts.set(token, nextCount);
      if (nextCount > dominantCount) {
        dominantCount = nextCount;
        dominantToken = token;
      }
    });

    if (dominantCount / dominanceTokens.length >= repetitiveDominanceThreshold) {
      if (isEmojiOrSymbolToken(dominantToken)) {
        return { error: "Please reduce repeated symbols or emoji." };
      }
      return { error: "Comment is too repetitive." };
    }
  }

  if (
    content.length >= lowTokenDiversityContentMinLength &&
    wordTokens.length >= lowTokenDiversityMinTokenCount
  ) {
    const tokenDiversityRatio = new Set(wordTokens).size / wordTokens.length;
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

function normalizeCommentText(content) {
  return asText(content)
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function getCommentTextHash(content) {
  return crypto.createHash("sha256").update(normalizeCommentText(content)).digest("hex");
}

function getCommentTextFingerprint(content) {
  const normalized = normalizeCommentText(content)
    .replace(/(?:https?:\/\/|www\.)\S+/giu, " <url> ")
    .replace(/\d+/gu, "0")
    .replace(/[^\p{L}\p{N}<>\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .slice(0, 300);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function isSpamValidationError(message) {
  return [
    "Comment looks like automated text spam. Please rewrite it in normal words.",
    "Comment is too repetitive.",
    "Please reduce repeated symbols or emoji."
  ].includes(String(message || ""));
}

function countCommentUrls(content) {
  const matches = String(content || "").match(/(?:https?:\/\/|www\.)/giu);
  return matches ? matches.length : 0;
}

function sqlSecondsWindow(seconds) {
  return `-${Math.max(1, Math.floor(Number(seconds) || 1))} seconds`;
}

function formatSqlDatetimeFromMillis(millis) {
  const date = new Date(millis);
  if (!Number.isFinite(millis) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function asCount(row) {
  const count = Number(row && row.count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function getRetryAfterSecondsFromSqlDate(sqlDateText) {
  const millis = parseUtcMillis(sqlDateText);
  if (!millis) return 1;
  return Math.max(1, Math.ceil((millis - Date.now()) / 1000));
}

async function cleanupExpiredCommentMutes() {
  await run("DELETE FROM comment_mutes WHERE datetime(muted_until) <= datetime('now')");
}

async function getActiveCommentMute(ipHash) {
  await cleanupExpiredCommentMutes();
  return get(
    "SELECT id, reason, muted_until, mute_count FROM comment_mutes WHERE ip_hash = ? AND datetime(muted_until) > datetime('now')",
    [ipHash]
  );
}

async function muteCommentIp(ipHash, reason, seconds = commentMuteSeconds) {
  const mutedUntil = formatSqlDatetimeFromMillis(Date.now() + Math.max(1, seconds) * 1000);
  if (!mutedUntil) return null;

  await run(
    `
      INSERT INTO comment_mutes (ip_hash, reason, muted_until, mute_count, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(ip_hash) DO UPDATE SET
        reason = excluded.reason,
        muted_until = excluded.muted_until,
        mute_count = comment_mutes.mute_count + 1
    `,
    [ipHash, reason, mutedUntil]
  );
  return mutedUntil;
}

async function recordCommentAttempt({ ipHash, postId, status, reason, content, textHash, fingerprint }) {
  await run(
    `
      INSERT INTO comment_attempts (ip_hash, post_id, status, reason, content, text_hash, fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    [
      ipHash,
      Number.isInteger(postId) && postId > 0 ? postId : null,
      status || "rejected",
      reason || null,
      content ? String(content).slice(0, commentAttemptContentMaxLength) : null,
      textHash || null,
      fingerprint || null
    ]
  );
}

async function cleanupCommentChallenges() {
  await run("DELETE FROM comment_challenge_uses WHERE datetime(last_used_at) < datetime('now', ?)", [
    sqlSecondsWindow(commentChallengeTtlSeconds * 2)
  ]);
}

async function consumeCommentChallenge(challenge) {
  await cleanupCommentChallenges();
  const existing = await get(
    "SELECT used_count FROM comment_challenge_uses WHERE token_hash = ? AND post_id = ?",
    [challenge.tokenHash, challenge.postId]
  );

  if (existing && Number(existing.used_count) > 0) {
    return { ok: false, reason: "challenge_replay" };
  }

  if (existing) {
    await run(
      "UPDATE comment_challenge_uses SET used_count = 1, last_used_at = datetime('now') WHERE token_hash = ?",
      [challenge.tokenHash]
    );
  } else {
    await run(
      `
        INSERT INTO comment_challenge_uses (token_hash, post_id, used_count, first_used_at, last_used_at)
        VALUES (?, ?, 1, datetime('now'), datetime('now'))
      `,
      [challenge.tokenHash, challenge.postId]
    );
  }

  return { ok: true, reason: "" };
}

async function getCommentAttemptStats(ipHash, postId, textHash, fingerprint) {
  const [lastAttempt, ipRecent, ipRejected, postRecent, globalRecent, duplicate, fingerprintRecent] =
    await Promise.all([
      get(
        "SELECT created_at FROM comment_attempts WHERE ip_hash = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
        [ipHash]
      ),
      get(
        "SELECT COUNT(*) AS count FROM comment_attempts WHERE ip_hash = ? AND datetime(created_at) >= datetime('now', ?)",
        [ipHash, sqlSecondsWindow(commentBurstWindowSeconds)]
      ),
      get(
        "SELECT COUNT(*) AS count FROM comment_attempts WHERE ip_hash = ? AND status IN ('rejected', 'muted') AND datetime(created_at) >= datetime('now', ?)",
        [ipHash, sqlSecondsWindow(commentBurstWindowSeconds)]
      ),
      get(
        "SELECT COUNT(*) AS count FROM comment_attempts WHERE post_id = ? AND status IN ('visible', 'pending') AND datetime(created_at) >= datetime('now', ?)",
        [postId, sqlSecondsWindow(commentPostRateLimitWindowSeconds)]
      ),
      get(
        "SELECT COUNT(*) AS count FROM comment_attempts WHERE status IN ('visible', 'pending') AND datetime(created_at) >= datetime('now', ?)",
        [sqlSecondsWindow(commentGlobalRateLimitWindowSeconds)]
      ),
      get(
        `
          SELECT created_at
          FROM comment_attempts
          WHERE ip_hash = ?
            AND post_id = ?
            AND text_hash = ?
            AND status IN ('visible', 'pending')
            AND datetime(created_at) >= datetime('now', ?)
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 1
        `,
        [ipHash, postId, textHash, sqlSecondsWindow(commentDuplicateWindowSeconds)]
      ),
      get(
        `
          SELECT COUNT(*) AS count
          FROM comment_attempts
          WHERE ip_hash = ?
            AND post_id = ?
            AND fingerprint = ?
            AND text_hash <> ?
            AND status IN ('visible', 'pending')
            AND datetime(created_at) >= datetime('now', ?)
        `,
        [ipHash, postId, fingerprint, textHash, sqlSecondsWindow(commentDuplicateWindowSeconds)]
      )
    ]);

  return {
    lastAttemptAt: lastAttempt && lastAttempt.created_at ? lastAttempt.created_at : "",
    ipRecentCount: asCount(ipRecent),
    ipRejectedCount: asCount(ipRejected),
    postRecentCount: asCount(postRecent),
    globalRecentCount: asCount(globalRecent),
    duplicateCreatedAt: duplicate && duplicate.created_at ? duplicate.created_at : "",
    fingerprintRecentCount: asCount(fingerprintRecent)
  };
}

function getPersistentCommentRateLimit(stats) {
  const lastAttemptMillis = parseUtcMillis(stats.lastAttemptAt);
  if (lastAttemptMillis > 0) {
    const elapsedMs = Date.now() - lastAttemptMillis;
    if (elapsedMs < commentCooldownMs) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((commentCooldownMs - elapsedMs) / 1000)),
        reason: "cooldown"
      };
    }
  }

  if (stats.ipRecentCount >= commentBurstMax) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, commentBurstWindowSeconds),
      reason: "ip_burst"
    };
  }

  if (stats.postRecentCount >= commentPostRateLimitMax) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, commentPostRateLimitWindowSeconds),
      reason: "post_flood"
    };
  }

  if (stats.globalRecentCount >= commentGlobalRateLimitMax) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, commentGlobalRateLimitWindowSeconds),
      reason: "global_flood"
    };
  }

  if (stats.duplicateCreatedAt) {
    const retryAfterSeconds = getRetryAfterSecondsFromSqlDate(
      formatSqlDatetimeFromMillis(parseUtcMillis(stats.duplicateCreatedAt) + commentDuplicateWindowMs)
    );
    return {
      limited: true,
      retryAfterSeconds,
      reason: "duplicate"
    };
  }

  return { limited: false, retryAfterSeconds: 0, reason: "" };
}

function requestUrlHostMatches(value, host) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.host.toLowerCase() === String(host || "").toLowerCase();
  } catch (error) {
    return false;
  }
}

function getCommentRequestSourceSignals(req) {
  const host = asText(req.get("host"));
  const origin = asText(req.get("origin"));
  const referer = asText(req.get("referer"));
  const signals = [];

  if (!host) {
    return signals;
  }

  if (origin && !requestUrlHostMatches(origin, host)) {
    signals.push({ reason: "cross_origin", score: 3 });
  }

  if (referer && !requestUrlHostMatches(referer, host)) {
    signals.push({ reason: "cross_referer", score: 2 });
  }

  if (!origin && !referer) {
    signals.push({ reason: "missing_origin_referer", score: 1 });
  }

  return signals;
}

function scoreCommentForModeration(req, { name, content, stats }) {
  let score = 0;
  const reasons = [];

  getCommentRequestSourceSignals(req).forEach((signal) => {
    score += signal.score;
    reasons.push(signal.reason);
  });

  const urlCount = countCommentUrls(content);
  if (urlCount >= 2) {
    score += 2;
    reasons.push("multiple_links");
  }

  if (urlCount >= 1 && content.length < 80) {
    score += 2;
    reasons.push("short_link_comment");
  }

  if (/(?:https?:\/\/|www\.)/iu.test(name)) {
    score += 2;
    reasons.push("link_in_name");
  }

  if (stats.fingerprintRecentCount > 0) {
    score += 3;
    reasons.push("similar_recent_comment");
  }

  if (stats.ipRecentCount >= Math.max(2, commentBurstMax - 2)) {
    score += 2;
    reasons.push("near_ip_burst_limit");
  }

  if (stats.ipRejectedCount >= 3) {
    score += 3;
    reasons.push("recent_rejections");
  }

  return {
    score,
    reasons
  };
}

function formatCommentModerationReason(score, reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return "";
  }
  return `score:${score}; ${reasons.join(",")}`;
}

function requireJsonRequest(req, res, next) {
  if (req.is(["application/json", "application/*+json"])) {
    return next();
  }
  return res.status(415).json({ error: "Unsupported content type. Please send JSON." });
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

function hashAdminSessionToken(token) {
  const value = String(token || "");
  if (!/^[a-f0-9]{64}$/i.test(value)) return "";
  return crypto.createHash("sha256").update(`${adminSessionHashSalt}:${value}`).digest("hex");
}

function createAdminCsrfToken(session) {
  const tokenHash = session && session.token_hash ? String(session.token_hash) : "";
  if (!tokenHash) return "";
  return crypto
    .createHmac("sha256", adminSessionHashSalt)
    .update(`csrf:${tokenHash}`)
    .digest("hex");
}

async function deleteExpiredAdminSessions() {
  return run("DELETE FROM admin_sessions WHERE datetime(expires_at) <= datetime('now')");
}

async function createAdminSession() {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + Math.floor(adminSessionTtlMs / 1000);
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAdminSessionToken(token);
  const createdAt = formatSqlDatetimeFromUnixSeconds(issuedAtSeconds);
  const expiresAt = formatSqlDatetimeFromUnixSeconds(expiresAtSeconds);

  await deleteExpiredAdminSessions();
  await run(
    "INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)",
    [tokenHash, createdAt, expiresAt]
  );

  return {
    token,
    tokenHash,
    createdAt,
    expiresAt
  };
}

async function deleteAdminSessionByToken(token) {
  const tokenHash = hashAdminSessionToken(token);
  if (!tokenHash) return null;
  return run("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash]);
}

async function getAdminSessionFromRequest(req) {
  const rawToken = readCookie(req, adminSessionCookieName);
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashAdminSessionToken(rawToken);
  if (!tokenHash) {
    return null;
  }

  const session = await get(
    "SELECT token_hash, created_at, expires_at FROM admin_sessions WHERE token_hash = ?",
    [tokenHash]
  );
  if (!session) {
    return null;
  }

  const expiresAtMillis = parseUtcMillis(session.expires_at);
  if (!expiresAtMillis || expiresAtMillis <= Date.now()) {
    await run("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }

  const createdAtMillis = parseUtcMillis(session.created_at);
  if (createdAtMillis && createdAtMillis > Date.now() + adminSessionClockSkewSeconds * 1000) {
    return null;
  }

  return {
    token_hash: session.token_hash,
    created_at: session.created_at,
    expires_at: session.expires_at
  };
}

function requireAdminSession(req, res, next) {
  if (!req.adminSession) {
    return res.status(401).json({ error: "Admin login required." });
  }
  next();
}

function requireAdminCsrf(req, res, next) {
  const expectedToken = createAdminCsrfToken(req.adminSession);
  const providedToken = String(req.get("X-CSRF-Token") || "");
  if (!expectedToken || !providedToken || !secureSecretsMatch(providedToken, expectedToken)) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }
  next();
}

function requireAdminWrite(req, res, next) {
  requireAdminSession(req, res, (sessionError) => {
    if (sessionError) return next(sessionError);
    requireAdminCsrf(req, res, next);
  });
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

    const spoiler = rawBlock.spoiler === true;

    const block = {
      type: "media",
      mediaKind,
      src,
      spoiler
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

const ALLOWED_MEDIA_KINDS = new Set(["image", "video", "audio", "unknown"]);

function validatePreviewMedia(value) {
  if (value === null || value === undefined) return null;

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "preview_media must be an object or null." };
  }

  const src = asText(value.src);
  const mediaKind = asText(value.mediaKind);
  if (!src || !mediaKind) {
    return { error: "preview_media must include src and mediaKind." };
  }

  if (!ALLOWED_MEDIA_KINDS.has(mediaKind)) {
    return { error: `preview_media mediaKind '${mediaKind}' is not allowed.` };
  }

  return {
    value: {
      src,
      mediaKind,
      alt: asText(value.alt) || "",
      caption: asText(value.caption) || "",
      name: asText(value.name) || ""
    }
  };
}

function validateCreatePostPayload(body) {
  const errors = [];
  const title = asText(body && body.title);
  const rawBlocks = body ? body.blocks : undefined;
  const rawPreviewMedia = body ? body.preview_media : undefined;
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

  const previewMediaResult = validatePreviewMedia(rawPreviewMedia);
  if (previewMediaResult && previewMediaResult.error) {
    errors.push(previewMediaResult.error);
  }

  return {
    errors,
    value: {
      title,
      blocks,
      preview_media: previewMediaResult ? previewMediaResult.value : null
    }
  };
}

function parsePreviewMediaJson(rawJson) {
  if (typeof rawJson !== "string") return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      src: asText(parsed.src) || "",
      mediaKind: asText(parsed.mediaKind) || "",
      alt: asText(parsed.alt) || "",
      caption: asText(parsed.caption) || "",
      name: asText(parsed.name) || ""
    };
  } catch (error) {
    return null;
  }
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

function getReadingText(blocks) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return asText(block.text);
      }
      if (block.type === "media") {
        return [asText(block.name), asText(block.alt), asText(block.caption)].filter(Boolean).join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function getReadingMinutes(blocks) {
  const text = getReadingText(blocks);
  if (!text) return 0;

  const tokens = text.match(/[\p{L}\p{N}]+/gu) || [];
  const approximateWords = tokens.length || Math.ceil(text.length / 5);
  return Math.max(1, Math.ceil(approximateWords / 180));
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
      return res.status(400).json({ error: "Admin key is required." });
    }

    if (!secureSecretsMatch(secret, adminSecret)) {
      return res.status(401).json({ error: "Invalid admin key." });
    }

    const session = await createAdminSession();
    setAdminSessionCookie(res, session.token);

    res.json({
      ok: true,
      authenticated: true,
      expires_in_seconds: Math.floor(adminSessionTtlMs / 1000),
      created_at: session.createdAt,
      expires_at: session.expiresAt,
      csrf_token: createAdminCsrfToken({ token_hash: session.tokenHash })
    });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/logout", requireAdminWrite, async (req, res, next) => {
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
      expires_at: session.expires_at,
      csrf_token: createAdminCsrfToken(session)
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
      "SELECT id, title, blocks_json, preview_media, likes_count, created_at FROM posts ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const items = rows.map((row) => {
      const blocks = parseBlocksJson(row.blocks_json);
      const savedPreview = row.preview_media ? parsePreviewMediaJson(row.preview_media) : null;
      return {
        id: row.id,
        title: row.title,
        likes: asLikeCount(row.likes_count),
        created_at: row.created_at,
        reading_minutes: getReadingMinutes(blocks),
        preview_text: getPreviewText(blocks),
        preview_media: savedPreview || getPreviewMedia(blocks)
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
      "SELECT id, title, blocks_json, preview_media, likes_count, created_at FROM posts WHERE id = ?",
      [req.params.id]
    );

    if (!row) {
      return res.status(404).json({ error: "Post not found." });
    }

    const blocks = parseBlocksJson(row.blocks_json);

    res.json({
      id: row.id,
      title: row.title,
      likes: asLikeCount(row.likes_count),
      created_at: row.created_at,
      reading_minutes: getReadingMinutes(blocks),
      preview_media: row.preview_media ? parsePreviewMediaJson(row.preview_media) : getPreviewMedia(blocks),
      blocks
    });
  } catch (error) {
    next(error);
  }
});

app.get("/comments/challenge/:post_id", async (req, res, next) => {
  try {
    const postId = parsePositivePostId(req.params.post_id);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const postExists = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!postExists) {
      return res.status(404).json({ error: "Post not found." });
    }

    res.json(createCommentChallenge(postId));
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
      "SELECT id, post_id, parent_id, name, content, likes_count, created_at FROM comments WHERE post_id = ? AND status = 'visible' ORDER BY datetime(created_at) " +
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
    const clientIp = getClientIp(req);
    const ipHash = hashIpAddress(clientIp);
    const rawContent = asText(req.body.content);
    const challengeToken = asText(req.body.challenge_token);
    const staticHoneypot = asText(req.body.website);

    const activeMute = await getActiveCommentMute(ipHash);
    if (activeMute) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "muted",
        reason: activeMute.reason || "active_mute",
        content: rawContent
      });
      res.set("Retry-After", String(getRetryAfterSecondsFromSqlDate(activeMute.muted_until)));
      return res.status(429).json({ error: commentSoftLimitError });
    }

    if (!postId) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: "invalid_post_id",
        content: rawContent
      });
      return res.status(400).json({ error: "Invalid post id." });
    }

    const challenge = parseCommentChallengeToken(challengeToken);
    if (!challenge.valid || challenge.postId !== postId) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: challenge.reason || "invalid_challenge",
        content: rawContent
      });
      return res.status(429).json({ error: commentSoftLimitError });
    }

    const dynamicHoneypot = asText(req.body[challenge.honeypotField]);
    if (staticHoneypot || dynamicHoneypot) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: "honeypot",
        content: rawContent
      });

      const honeypotHits = await get(
        "SELECT COUNT(*) AS count FROM comment_attempts WHERE ip_hash = ? AND reason = 'honeypot' AND datetime(created_at) >= datetime('now', ?)",
        [ipHash, sqlSecondsWindow(commentBurstWindowSeconds)]
      );
      if (asCount(honeypotHits) >= commentHoneypotMuteThreshold) {
        await muteCommentIp(ipHash, "honeypot");
      }

      return res.status(429).json({ error: commentSoftLimitError });
    }

    if (name.length > maxCommentNameLength) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: "name_too_long",
        content: rawContent
      });
      return res
        .status(400)
        .json({ error: `Comment name is too long. Maximum is ${maxCommentNameLength} characters.` });
    }

    const commentValidation = validateCommentContent(req.body.content);
    if (commentValidation.error) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: `validation:${commentValidation.error}`,
        content: rawContent
      });
      return res.status(400).json({
        error: isSpamValidationError(commentValidation.error)
          ? commentSoftLimitError
          : commentValidation.error
      });
    }
    const content = commentValidation.content;
    const textHash = getCommentTextHash(content);
    const fingerprint = getCommentTextFingerprint(content);

    let parentId = null;
    const hasParentId = rawParentId !== undefined && rawParentId !== null && String(rawParentId).trim() !== "";
    if (hasParentId) {
      parentId = Number(rawParentId);
      if (!Number.isInteger(parentId) || parentId <= 0) {
        await recordCommentAttempt({
          ipHash,
          postId,
          status: "rejected",
          reason: "invalid_parent_comment_id",
          content,
          textHash,
          fingerprint
        });
        return res.status(400).json({ error: "Invalid parent comment id." });
      }
    }

    const postExists = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!postExists) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: "post_not_found",
        content,
        textHash,
        fingerprint
      });
      return res.status(404).json({ error: "Post not found." });
    }

    if (parentId !== null) {
      const parentComment = await get(
        "SELECT id, post_id FROM comments WHERE id = ? AND status = 'visible'",
        [parentId]
      );
      if (!parentComment || Number(parentComment.post_id) !== postId) {
        await recordCommentAttempt({
          ipHash,
          postId,
          status: "rejected",
          reason: "parent_comment_not_found",
          content,
          textHash,
          fingerprint
        });
        return res.status(404).json({ error: "Parent comment not found." });
      }
    }

    const consumedChallenge = await consumeCommentChallenge(challenge);
    if (!consumedChallenge.ok) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: consumedChallenge.reason || "challenge_replay",
        content,
        textHash,
        fingerprint
      });
      return res.status(429).json({ error: commentSoftLimitError });
    }

    const stats = await getCommentAttemptStats(ipHash, postId, textHash, fingerprint);
    const persistentRateLimit = getPersistentCommentRateLimit(stats);
    if (persistentRateLimit.limited) {
      await recordCommentAttempt({
        ipHash,
        postId,
        status: "rejected",
        reason: `rate:${persistentRateLimit.reason}`,
        content,
        textHash,
        fingerprint
      });

      if (stats.ipRejectedCount + 1 >= commentRejectedMuteThreshold) {
        await muteCommentIp(ipHash, `rate:${persistentRateLimit.reason}`);
      }

      res.set("Retry-After", String(persistentRateLimit.retryAfterSeconds));
      return res.status(429).json({ error: commentSoftLimitError });
    }

    const moderationScore = scoreCommentForModeration(req, { name, content, stats });
    const commentStatus = moderationScore.score >= 5 ? "pending" : "visible";
    const moderationReason =
      commentStatus === "pending"
        ? formatCommentModerationReason(moderationScore.score, moderationScore.reasons)
        : "";

    await run(
      `
        INSERT INTO comments (
          post_id,
          parent_id,
          name,
          content,
          status,
          moderation_reason,
          text_hash,
          text_fingerprint,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      [
        postId,
        parentId,
        name || null,
        content,
        commentStatus,
        moderationReason || null,
        textHash,
        fingerprint
      ]
    );
    await recordCommentAttempt({
      ipHash,
      postId,
      status: commentStatus,
      reason: moderationReason || null,
      content,
      textHash,
      fingerprint
    });

    res.status(commentStatus === "pending" ? 202 : 201).json({ ok: true, status: commentStatus });
  } catch (error) {
    next(error);
  }
});

app.delete("/comments/:id", requireAdminWrite, async (req, res, next) => {
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

app.post("/admin/comments/:id/approve", requireAdminWrite, async (req, res, next) => {
  try {
    const commentId = parsePositiveCommentId(req.params.id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment id." });
    }

    const existingComment = await get("SELECT id FROM comments WHERE id = ?", [commentId]);
    if (!existingComment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    await run("UPDATE comments SET status = 'visible', moderation_reason = NULL WHERE id = ?", [commentId]);
    res.json({ ok: true, id: commentId, status: "visible" });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/comments/:id/reject", requireAdminWrite, async (req, res, next) => {
  try {
    const commentId = parsePositiveCommentId(req.params.id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment id." });
    }

    const existingComment = await get("SELECT id FROM comments WHERE id = ?", [commentId]);
    if (!existingComment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    await run("UPDATE comments SET status = 'rejected', moderation_reason = 'admin_rejected' WHERE id = ?", [
      commentId
    ]);
    res.json({ ok: true, id: commentId, status: "rejected" });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/antispam", requireAdminSession, async (req, res, next) => {
  try {
    await cleanupExpiredCommentMutes();
    const limit = Math.max(1, Math.min(100, commentAdminListLimit));
    const pendingComments = await all(
      `
        SELECT id, post_id, parent_id, name, content, moderation_reason, created_at
        FROM comments
        WHERE status = 'pending'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
      [limit]
    );
    const attempts = await all(
      `
        SELECT
          id,
          post_id,
          status,
          reason,
          substr(ip_hash, 1, 12) AS ip_hash_short,
          content,
          created_at
        FROM comment_attempts
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
      [limit]
    );
    const mutes = await all(
      `
        SELECT
          id,
          substr(ip_hash, 1, 12) AS ip_hash_short,
          reason,
          muted_until,
          mute_count,
          created_at
        FROM comment_mutes
        WHERE datetime(muted_until) > datetime('now')
        ORDER BY datetime(muted_until) DESC, id DESC
        LIMIT ?
      `,
      [limit]
    );

    res.json({
      pending_comments: pendingComments,
      attempts,
      mutes
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/admin/comment-mutes/:id", requireAdminWrite, async (req, res, next) => {
  try {
    const muteId = Number(req.params.id);
    if (!Number.isInteger(muteId) || muteId <= 0) {
      return res.status(400).json({ error: "Invalid mute id." });
    }

    const existingMute = await get("SELECT id FROM comment_mutes WHERE id = ?", [muteId]);
    if (!existingMute) {
      return res.status(404).json({ error: "Mute not found." });
    }

    await run("DELETE FROM comment_mutes WHERE id = ?", [muteId]);
    res.json({ ok: true, id: muteId });
  } catch (error) {
    next(error);
  }
});

app.post("/comments/:id/like", likeLimiter, async (req, res, next) => {
  try {
    const commentId = parsePositiveCommentId(req.params.id);
    if (!commentId) {
      return res.status(400).json({ error: "Invalid comment id." });
    }

    const comment = await get("SELECT id FROM comments WHERE id = ? AND status = 'visible'", [commentId]);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    const ipAddress = getClientIp(req);
    const ipHash = hashIpAddress(ipAddress);
    const recentLike = await get(
      "SELECT created_at FROM comment_like_events WHERE comment_id = ? AND ip_hash = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
      [commentId, ipHash]
    );

    if (recentLike) {
      const recentLikeMillis = parseUtcMillis(recentLike.created_at);
      if (recentLikeMillis > 0) {
        const retryAtMillis = recentLikeMillis + likeCooldownMs;
        if (Date.now() < retryAtMillis) {
          const retryAfterSeconds = Math.max(1, Math.ceil((retryAtMillis - Date.now()) / 1000));
          return res.status(429).json({
            error: `You already liked this comment recently. Please wait about ${retryAfterSeconds} seconds.`
          });
        }
      }
    }

    await run("INSERT INTO comment_like_events (comment_id, ip_hash, created_at) VALUES (?, ?, datetime('now'))", [
      commentId,
      ipHash
    ]);
    await run("UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?", [commentId]);
    await run("DELETE FROM comment_like_events WHERE datetime(created_at) < datetime('now', '-14 day')");

    const updatedComment = await get("SELECT likes_count FROM comments WHERE id = ?", [commentId]);

    res.json({
      success: true,
      commentId,
      likes: asLikeCount(updatedComment && updatedComment.likes_count)
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

app.post("/posts", requireAdminWrite, adminPostLimiter, async (req, res, next) => {
  try {
    const payload = validateCreatePostPayload(req.body);
    if (payload.errors.length > 0) {
      return res.status(400).json({
        error: "Invalid post payload.",
        details: payload.errors
      });
    }

    const { title, blocks, preview_media } = payload.value;

    const previewMediaJson = preview_media ? JSON.stringify(preview_media) : null;

    const result = await run(
      "INSERT INTO posts (title, blocks_json, preview_media, created_at) VALUES (?, ?, ?, datetime('now'))",
      [title, JSON.stringify(blocks), previewMediaJson]
    );

    const newPost = await get(
      "SELECT id, title, blocks_json, preview_media, likes_count, created_at FROM posts WHERE id = ?",
      [result.lastID]
    );

    const savedBlocks = parseBlocksJson(newPost.blocks_json);

    res.status(201).json({
      id: newPost.id,
      title: newPost.title,
      likes: asLikeCount(newPost.likes_count),
      created_at: newPost.created_at,
      reading_minutes: getReadingMinutes(savedBlocks),
      preview_media: newPost.preview_media ? parsePreviewMediaJson(newPost.preview_media) : getPreviewMedia(savedBlocks),
      blocks: savedBlocks
    });
  } catch (error) {
    next(error);
  }
});

app.put("/posts/:id", requireAdminWrite, async (req, res, next) => {
  try {
    const postId = parsePositivePostId(req.params.id);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post id." });
    }

    const existing = await get("SELECT id FROM posts WHERE id = ?", [postId]);
    if (!existing) {
      return res.status(404).json({ error: "Post not found." });
    }

    const payload = validateCreatePostPayload(req.body);
    if (payload.errors.length > 0) {
      return res.status(400).json({
        error: "Invalid post payload.",
        details: payload.errors
      });
    }

    const { title, blocks, preview_media } = payload.value;
    const previewMediaJson = preview_media ? JSON.stringify(preview_media) : null;
    await run(
      "UPDATE posts SET title = ?, blocks_json = ?, preview_media = ? WHERE id = ?",
      [title, JSON.stringify(blocks), previewMediaJson, postId]
    );

    const updated = await get(
      "SELECT id, title, blocks_json, preview_media, likes_count, created_at FROM posts WHERE id = ?",
      [postId]
    );

    const savedBlocks = parseBlocksJson(updated.blocks_json);

    res.json({
      id: updated.id,
      title: updated.title,
      likes: asLikeCount(updated.likes_count),
      created_at: updated.created_at,
      reading_minutes: getReadingMinutes(savedBlocks),
      preview_media: updated.preview_media ? parsePreviewMediaJson(updated.preview_media) : getPreviewMedia(savedBlocks),
      blocks: savedBlocks
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/posts/:id", requireAdminWrite, async (req, res, next) => {
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

app.post("/upload", requireAdminWrite, (req, res, next) => {
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
  res.status(404).sendFile(path.join(__dirname, "..", "frontend", "404.html"));
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
