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
    throw new Error(message);
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

function previewText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

function createThreadUrl(postId) {
  return "/post.html?id=" + encodeURIComponent(postId);
}

function wireCardNavigation(cardEl, href) {
  cardEl.tabIndex = 0;
  cardEl.setAttribute("role", "link");
  cardEl.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, textarea")) return;
    window.location.href = href;
  });
  cardEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = href;
    }
  });
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

    const text = document.createElement("p");
    text.className = "tweet-text";
    text.textContent = previewText(post.content, 240);

    card.appendChild(header);
    card.appendChild(text);

    if (post.image_url) {
      const image = document.createElement("img");
      image.className = "tweet-image";
      image.src = post.image_url;
      image.alt = "Post image";
      card.appendChild(image);
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
        item.textContent =
          (comment.name || "Anonymous") + ": " + previewText(comment.content || "", 90);
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
  document.title = "Pixel Notebook - Post #" + postId;

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

  const text = document.createElement("p");
  text.className = "tweet-text tweet-text-full";
  text.textContent = post.content || "";

  card.appendChild(header);
  card.appendChild(text);

  if (post.image_url) {
    const image = document.createElement("img");
    image.className = "tweet-image";
    image.src = post.image_url;
    image.alt = "Post image";
    card.appendChild(image);
  }

  postViewEl.appendChild(card);
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
    meta.textContent = (comment.name || "Anonymous") + " | " + formatDate(comment.created_at);

    const body = document.createElement("p");
    body.className = "comment-body";
    body.textContent = comment.content || "";

    li.appendChild(meta);
    li.appendChild(body);
    commentListEl.appendChild(li);
  });
}
