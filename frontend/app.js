(function bootstrap() {
  const page = document.body && document.body.dataset ? document.body.dataset.page : "";

  if (page === "feed") {
    initFeedPage().catch((error) => {
      console.error(error);
      const statusEl = document.getElementById("feedStatus");
      if (statusEl) statusEl.textContent = "Failed to load timeline.";
    });
    return;
  }

  if (page === "post") {
    initPostPage().catch((error) => {
      console.error(error);
      const postStatusEl = document.getElementById("postStatus");
      if (postStatusEl) postStatusEl.textContent = "Failed to load post.";
    });
  }
})();

const PLACEHOLDER_IMAGE = "/uploads/missingno.png";
const ALLOWED_MEDIA_KINDS = new Set(["image", "gif", "video", "audio", "file"]);

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : "Request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString();
}

function toMillis(dateString) {
  const date = new Date((dateString || "").replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function previewText(text, maxLength) {
  const value = asText(text);
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd() + "...";
}

function safeMediaSrc(value) {
  const src = asText(value);
  if (!src.startsWith("/uploads/")) return "";
  return src;
}

function deriveFileNameFromSrc(src) {
  const safeSrc = safeMediaSrc(src);
  if (!safeSrc) return "file";

  const parts = safeSrc.split("/");
  const lastPart = parts[parts.length - 1] || "file";

  try {
    return decodeURIComponent(lastPart);
  } catch (error) {
    return lastPart;
  }
}

function normalizeClientBlock(rawBlock) {
  if (!rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) return null;

  const type = asText(rawBlock.type);

  if (type === "paragraph") {
    const text = asText(rawBlock.text);
    return text ? { type: "paragraph", text } : null;
  }

  if (type === "heading") {
    const level = Number(rawBlock.level);
    const text = asText(rawBlock.text);
    if (![1, 2, 3].includes(level) || !text) return null;
    return { type: "heading", level, text };
  }

  if (type === "quote") {
    const text = asText(rawBlock.text);
    return text ? { type: "quote", text } : null;
  }

  if (type === "divider") {
    return { type: "divider" };
  }

  if (type === "media") {
    const mediaKind = asText(rawBlock.mediaKind);
    const src = safeMediaSrc(rawBlock.src);
    if (!ALLOWED_MEDIA_KINDS.has(mediaKind) || !src) return null;

    return {
      type: "media",
      mediaKind,
      src,
      name: asText(rawBlock.name),
      alt: asText(rawBlock.alt),
      caption: asText(rawBlock.caption)
    };
  }

  return null;
}

function createThreadUrl(postId) {
  return "/post.html?id=" + encodeURIComponent(postId);
}

function attachPlaceholderFallback(imageEl) {
  imageEl.addEventListener("error", () => {
    if (imageEl.dataset.fallbackApplied === "1") return;
    imageEl.dataset.fallbackApplied = "1";
    imageEl.src = PLACEHOLDER_IMAGE;
  });
}

function wireCardNavigation(cardEl, href) {
  cardEl.tabIndex = 0;
  cardEl.setAttribute("role", "link");
  cardEl.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, textarea")) return;
    window.location.href = href;
  });
  cardEl.addEventListener("keydown", (event) => {
    if (event.target.closest("a, button, input, textarea")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = href;
    }
  });
}

function normalizeLikeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function formatLikeText(likes) {
  return likes + " like" + (likes === 1 ? "" : "s");
}

function createLikeControl(postId, initialLikes) {
  const wrap = document.createElement("div");
  wrap.className = "like-row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "like-button";
  button.textContent = "Like";
  button.setAttribute("aria-label", "Like this post");
  wrap.appendChild(button);

  const count = document.createElement("p");
  count.className = "like-count";
  let likes = normalizeLikeCount(initialLikes);
  count.textContent = formatLikeText(likes);
  wrap.appendChild(count);

  const status = document.createElement("p");
  status.className = "like-status";
  status.setAttribute("aria-live", "polite");
  wrap.appendChild(status);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = "Sending...";

    try {
      const result = await fetchJson("/posts/" + encodeURIComponent(postId) + "/like", {
        method: "POST"
      });
      likes = normalizeLikeCount(result && result.likes);
      count.textContent = formatLikeText(likes);
      status.textContent = "Thanks! Like saved.";

      window.setTimeout(() => {
        if (status.textContent === "Thanks! Like saved.") {
          status.textContent = "";
        }
      }, 1800);
    } catch (error) {
      if (error && error.status === 429) {
        status.textContent = error.message || "Please wait before liking again.";
      } else if (error && error.status === 404) {
        status.textContent = "This post no longer exists.";
      } else {
        status.textContent = "Failed to save like.";
      }
    } finally {
      button.disabled = false;
    }
  });

  return wrap;
}

async function loadCommentPreview(postId) {
  try {
    const comments = await fetchJson(
      "/comments/" + encodeURIComponent(postId) + "?limit=2&order=desc"
    );
    return Array.isArray(comments) ? comments : [];
  } catch (error) {
    return [];
  }
}

function renderFeedPreviewMedia(post) {
  if (!post || !post.preview_media || typeof post.preview_media !== "object") {
    return null;
  }

  const src = safeMediaSrc(post.preview_media.src);
  const mediaKind = asText(post.preview_media.mediaKind);
  if (!src || (mediaKind !== "image" && mediaKind !== "gif")) {
    return null;
  }

  const image = document.createElement("img");
  image.className = "tweet-thumb";
  image.src = src;
  image.alt = asText(post.preview_media.alt) || asText(post.title) || "Post media";
  attachPlaceholderFallback(image);
  return image;
}

async function initFeedPage() {
  const feedListEl = document.getElementById("feedList");
  const feedStatusEl = document.getElementById("feedStatus");

  const data = await fetchJson("/posts?limit=30&page=1");
  const posts = Array.isArray(data.items) ? data.items.slice() : [];

  posts.sort((a, b) => {
    const byDate = toMillis(b.created_at) - toMillis(a.created_at);
    if (byDate !== 0) return byDate;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  if (posts.length === 0) {
    feedStatusEl.textContent = "No posts yet.";
    feedListEl.innerHTML = "";
    return;
  }

  const previewEntries = await Promise.all(
    posts.map(async (post) => [post.id, await loadCommentPreview(post.id)])
  );
  const commentPreviewByPostId = new Map(previewEntries);

  feedStatusEl.textContent = posts.length + " post(s), newest first.";
  feedListEl.innerHTML = "";

  posts.forEach((post) => {
    const li = document.createElement("li");
    li.className = "feed-item";

    const card = document.createElement("article");
    card.className = "tweet-card";
    wireCardNavigation(card, createThreadUrl(post.id));

    const header = document.createElement("div");
    header.className = "tweet-head";

    const author = document.createElement("strong");
    author.className = "tweet-user";
    author.textContent = "Pixel Notebook";

    const handle = document.createElement("span");
    handle.className = "tweet-handle";
    handle.textContent = "@microblog";

    const dot = document.createElement("span");
    dot.className = "tweet-sep";
    dot.textContent = "·";

    const date = document.createElement("span");
    date.className = "tweet-date";
    date.textContent = formatDate(post.created_at);

    header.appendChild(author);
    header.appendChild(handle);
    header.appendChild(dot);
    header.appendChild(date);
    card.appendChild(header);

    const title = document.createElement("h2");
    title.className = "tweet-title";
    title.textContent = asText(post.title) || "Untitled post";
    card.appendChild(title);

    card.appendChild(createLikeControl(post.id, post.likes));

    const text = document.createElement("p");
    text.className = "tweet-text";
    text.textContent = previewText(post.preview_text, 240) || "No paragraph preview.";
    card.appendChild(text);

    const previewMedia = renderFeedPreviewMedia(post);
    if (previewMedia) {
      card.appendChild(previewMedia);
    }

    const comments = commentPreviewByPostId.get(post.id) || [];
    const previewWrap = document.createElement("div");
    previewWrap.className = "reply-preview";

    if (comments.length === 0) {
      const empty = document.createElement("p");
      empty.className = "reply-empty";
      empty.textContent = "No replies yet.";
      previewWrap.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "reply-list";

      comments.forEach((comment) => {
        const item = document.createElement("li");
        item.className = "reply-item";
        const safeName = escapeHtml(comment.name || "Anonymous");
        const safePreview = escapeHtml(previewText(comment.content || "", 90));
        item.innerHTML = safeName + ": " + safePreview;
        list.appendChild(item);
      });

      previewWrap.appendChild(list);
    }

    const openLink = document.createElement("a");
    openLink.className = "inline-link";
    openLink.href = createThreadUrl(post.id);
    openLink.textContent = "Open full post and all comments";

    previewWrap.appendChild(openLink);
    card.appendChild(previewWrap);

    li.appendChild(card);
    feedListEl.appendChild(li);
  });
}

async function initPostPage() {
  const params = new URLSearchParams(window.location.search);
  const postId = Number(params.get("id"));
  const postStatusEl = document.getElementById("postStatus");
  const postViewEl = document.getElementById("postView");
  const commentListEl = document.getElementById("commentList");
  const commentFormEl = document.getElementById("commentForm");
  const commentStatusEl = document.getElementById("commentStatus");

  if (!Number.isInteger(postId) || postId <= 0) {
    postStatusEl.textContent = "Invalid post id.";
    commentFormEl.querySelector("button[type='submit']").disabled = true;
    return;
  }

  let post;
  let comments;
  try {
    [post, comments] = await Promise.all([
      fetchJson("/posts/" + encodeURIComponent(postId)),
      fetchJson("/comments/" + encodeURIComponent(postId))
    ]);
  } catch (error) {
    postStatusEl.textContent = error.message || "Failed to load post.";
    commentFormEl.querySelector("button[type='submit']").disabled = true;
    return;
  }

  renderPost(postViewEl, post);
  renderComments(commentListEl, comments);
  postStatusEl.textContent = "";
  document.title = "Pixel Notebook - " + (asText(post.title) || "Post #" + postId);

  commentFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    commentStatusEl.textContent = "Sending...";

    const payload = {
      post_id: postId,
      name: String(commentFormEl.elements.name.value || "").trim(),
      content: String(commentFormEl.elements.content.value || "").trim(),
      website: String(commentFormEl.elements.website.value || "").trim()
    };

    try {
      await fetchJson("/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      commentFormEl.reset();
      commentStatusEl.textContent = "Comment posted.";
      const updatedComments = await fetchJson("/comments/" + encodeURIComponent(postId));
      renderComments(commentListEl, updatedComments);
    } catch (error) {
      commentStatusEl.textContent = error.message || "Failed to post comment.";
    }
  });
}

function renderPost(postViewEl, post) {
  postViewEl.innerHTML = "";

  const card = document.createElement("article");
  card.className = "tweet-card tweet-card-full";

  const header = document.createElement("div");
  header.className = "tweet-head";

  const author = document.createElement("strong");
  author.className = "tweet-user";
  author.textContent = "Pixel Notebook";

  const handle = document.createElement("span");
  handle.className = "tweet-handle";
  handle.textContent = "@microblog";

  const dot = document.createElement("span");
  dot.className = "tweet-sep";
  dot.textContent = "·";

  const date = document.createElement("span");
  date.className = "tweet-date";
  date.textContent = formatDate(post.created_at);

  header.appendChild(author);
  header.appendChild(handle);
  header.appendChild(dot);
  header.appendChild(date);
  card.appendChild(header);

  const title = document.createElement("h1");
  title.className = "tweet-title tweet-title-full";
  title.textContent = asText(post.title) || "Untitled post";
  card.appendChild(title);
  card.appendChild(createLikeControl(post.id, post.likes));

  const blocksWrap = document.createElement("div");
  blocksWrap.className = "post-blocks";

  const rawBlocks = Array.isArray(post.blocks) ? post.blocks : [];
  const blocks = rawBlocks.map((block) => normalizeClientBlock(block)).filter((block) => block);

  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tweet-text tweet-text-full";
    empty.textContent = "This post has no readable blocks.";
    blocksWrap.appendChild(empty);
  } else {
    blocks.forEach((block) => {
      const blockElement = renderPostBlock(block);
      if (blockElement) {
        blocksWrap.appendChild(blockElement);
      }
    });
  }

  card.appendChild(blocksWrap);
  postViewEl.appendChild(card);
}

function renderPostBlock(block) {
  if (block.type === "paragraph") {
    const text = document.createElement("p");
    text.className = "tweet-text tweet-text-full post-paragraph";
    text.textContent = block.text;
    return text;
  }

  if (block.type === "heading") {
    const heading = document.createElement("h" + block.level);
    heading.className = "post-heading post-heading-" + block.level;
    heading.textContent = block.text;
    return heading;
  }

  if (block.type === "quote") {
    const quote = document.createElement("blockquote");
    quote.className = "post-quote";
    quote.textContent = block.text;
    return quote;
  }

  if (block.type === "divider") {
    const divider = document.createElement("hr");
    divider.className = "post-divider";
    return divider;
  }

  if (block.type === "media") {
    return renderMediaBlock(block);
  }

  return null;
}

function renderMediaBlock(block) {
  const src = safeMediaSrc(block.src);
  if (!src) return null;

  const captionText = asText(block.caption);

  const figure = document.createElement("figure");
  figure.className = "post-media";

  if (block.mediaKind === "image" || block.mediaKind === "gif") {
    const image = document.createElement("img");
    image.className = "tweet-image";
    image.src = src;
    image.alt = asText(block.alt) || asText(block.name) || "Post media";
    attachPlaceholderFallback(image);
    figure.appendChild(image);

    const figcaption = document.createElement("figcaption");
    figcaption.className = "post-caption";
    figcaption.textContent = captionText;
    figure.appendChild(figcaption);
    return figure;
  } else if (block.mediaKind === "video") {
    const video = document.createElement("video");
    video.className = "post-video";
    video.controls = true;
    video.preload = "metadata";
    video.src = src;
    figure.appendChild(video);

    const figcaption = document.createElement("figcaption");
    figcaption.className = "post-caption";
    figcaption.textContent = captionText;
    figure.appendChild(figcaption);
    return figure;
  } else if (block.mediaKind === "audio") {
    const audio = document.createElement("audio");
    audio.className = "post-audio";
    audio.controls = true;
    audio.src = src;
    figure.appendChild(audio);

    const figcaption = document.createElement("figcaption");
    figcaption.className = "post-caption";
    figcaption.textContent = captionText;
    figure.appendChild(figcaption);
    return figure;
  } else if (block.mediaKind === "file") {
    const fileName = asText(block.name) || deriveFileNameFromSrc(src);

    const fileBlock = document.createElement("div");
    fileBlock.className = "post-file-block";

    const label = document.createElement("p");
    label.className = "post-file-label";
    label.textContent = "Attached file";
    fileBlock.appendChild(label);

    const link = document.createElement("a");
    link.className = "inline-link post-file-link";
    link.href = src;
    link.setAttribute("download", fileName);
    link.textContent = fileName;
    fileBlock.appendChild(link);

    if (captionText) {
      const caption = document.createElement("p");
      caption.className = "post-caption";
      caption.textContent = captionText;
      fileBlock.appendChild(caption);
    }

    return fileBlock;
  }

  return null;
}

function renderComments(commentListEl, comments) {
  commentListEl.innerHTML = "";

  if (!Array.isArray(comments) || comments.length === 0) {
    const li = document.createElement("li");
    li.className = "comment-card";
    li.textContent = "No comments yet. Be the first visitor to write one.";
    commentListEl.appendChild(li);
    return;
  }

  comments.forEach((comment) => {
    const li = document.createElement("li");
    li.className = "comment-card";

    const meta = document.createElement("p");
    meta.className = "meta-line";
    const safeName = escapeHtml(comment.name || "Anonymous");
    const safeDate = escapeHtml(formatDate(comment.created_at));
    meta.innerHTML = safeName + " | " + safeDate;

    const body = document.createElement("p");
    body.className = "comment-body";
    body.innerHTML = escapeHtml(comment.content || "");

    li.appendChild(meta);
    li.appendChild(body);
    commentListEl.appendChild(li);
  });
}
