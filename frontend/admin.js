(function initAdminPage() {
  const body = document.body;
  if (!body || body.dataset.page !== "admin") {
    return;
  }

  const adminEntryLink = document.getElementById("adminEntryLink");
  const adminLogoutButton = document.getElementById("adminLogoutButton");
  const adminSessionStatus = document.getElementById("adminSessionStatus");
  const adminLoginView = document.getElementById("adminLoginView");
  const adminEditorView = document.getElementById("adminEditorView");
  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminSecretInput = document.getElementById("adminSecretInput");
  const adminLoginStatus = document.getElementById("adminLoginStatus");
  const uploadForm = document.getElementById("uploadForm");
  const uploadFileInput = document.getElementById("uploadFileInput");
  const uploadStatus = document.getElementById("uploadStatus");
  const uploadResult = document.getElementById("uploadResult");
  const insertMediaBlockButton = document.getElementById("insertMediaBlockButton");
  const postForm = document.getElementById("postForm");
  const postTitleInput = document.getElementById("postTitleInput");
  const blocksInput = document.getElementById("blocksInput");
  const blockEditorList = document.getElementById("blockEditorList");
  const blockEditorEmpty = document.getElementById("blockEditorEmpty");
  const clearDraftButton = document.getElementById("clearDraftButton");
  const postStatus = document.getElementById("postStatus");
  const postResult = document.getElementById("postResult");
  const postPreviewTitle = document.getElementById("postPreviewTitle");
  const postPreviewBlocks = document.getElementById("postPreviewBlocks");
  const antispamRefreshButton = document.getElementById("antispamRefreshButton");
  const antispamStatus = document.getElementById("antispamStatus");
  const antispamPanel = document.getElementById("antispamPanel");
  const addBlockButtons = Array.from(document.querySelectorAll("[data-add-block]"));

  if (
    !adminLoginForm ||
    !uploadForm ||
    !postForm ||
    !blocksInput ||
    !blockEditorList ||
    !clearDraftButton
  ) {
    return;
  }

  const ALLOWED_MEDIA_KINDS = new Set(["image", "gif", "video", "audio", "file"]);
  const DRAFT_STORAGE_KEY = "stereodamage_admin_post_draft_v1";
  const LONG_BLOCK_COLLAPSE_LENGTH = 520;
  let lastUpload = null;
  let draftBlocks = [];
  let draggedBlockIndex = -1;
  let draftDirty = false;
  let adminCsrfToken = "";
  let previewRenderQueued = false;
  const collapsedBlocks = new WeakSet();

  function t(key, params, fallback) {
    if (window.i18n && typeof window.i18n.t === "function") {
      return window.i18n.t(key, params);
    }
    return fallback || String(key || "");
  }

  function translateErrorMessage(error, fallbackKey, fallbackText) {
    const rawMessage = error && error.message ? error.message : "";
    if (window.i18n && typeof window.i18n.translateError === "function") {
      const translated = window.i18n.translateError(rawMessage);
      if (translated) {
        return translated;
      }
    }
    if (rawMessage) {
      return rawMessage;
    }
    return t(fallbackKey, null, fallbackText);
  }

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function asHeadingLevel(value) {
    const level = Number(value);
    return [1, 2, 3].includes(level) ? level : 2;
  }

  function setStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message || "";
    element.classList.remove("status-error", "status-ok");
    if (message) {
      element.classList.add(isError ? "status-error" : "status-ok");
    }
  }

  function setResult(preElement, data) {
    if (!preElement) return;
    preElement.textContent = data ? JSON.stringify(data, null, 2) : "";
  }

  function formatAdminDate(dateString) {
    const date = new Date(String(dateString || "").replace(" ", "T") + "Z");
    if (Number.isNaN(date.getTime())) return "";
    const language = window.i18n && typeof window.i18n.getLanguage === "function" ? window.i18n.getLanguage() : "ru";
    return date.toLocaleString(language === "ru" ? "ru-RU" : "en-US");
  }

  function buildSessionMessage(message, sessionData) {
    const expiresText = formatAdminDate(sessionData && sessionData.expires_at);
    if (!expiresText) return message;
    return message + " " + t("admin.sessionExpiresAt", { time: expiresText }, "Session expires at " + expiresText + ".");
  }

  function truncateText(value, maxLength) {
    const text = String(value || "");
    const limit = Math.max(10, Number(maxLength) || 120);
    return text.length > limit ? text.slice(0, limit - 1) + "..." : text;
  }

  function createSmallActionButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-button admin-button-secondary admin-antispam-action";
    button.textContent = label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await onClick();
        await loadAntispam();
      } catch (error) {
        setStatus(antispamStatus, translateErrorMessage(error, "admin.antispamActionFailed", "Action failed."), true);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function createAntispamSection(title, emptyText) {
    const section = document.createElement("section");
    section.className = "admin-antispam-section";
    const heading = document.createElement("h3");
    heading.className = "admin-antispam-title";
    heading.textContent = title;
    section.appendChild(heading);
    section.dataset.emptyText = emptyText;
    return section;
  }

  function appendAntispamEmpty(section) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.textContent = section.dataset.emptyText || t("admin.antispamEmpty", null, "Nothing here.");
    section.appendChild(empty);
  }

  function renderPendingComments(container, comments) {
    const section = createAntispamSection(
      t("admin.antispamPending", null, "Pending comments"),
      t("admin.antispamNoPending", null, "No pending comments.")
    );
    if (!Array.isArray(comments) || comments.length === 0) {
      appendAntispamEmpty(section);
      container.appendChild(section);
      return;
    }

    comments.forEach((comment) => {
      const card = document.createElement("article");
      card.className = "admin-antispam-card";

      const meta = document.createElement("p");
      meta.className = "meta-line";
      meta.textContent =
        "#" +
        String(comment.id) +
        " | post #" +
        String(comment.post_id) +
        " | " +
        formatAdminDate(comment.created_at);
      card.appendChild(meta);

      const content = document.createElement("p");
      content.className = "admin-antispam-content";
      content.textContent = truncateText(comment.content, 260);
      card.appendChild(content);

      if (comment.moderation_reason) {
        const reason = document.createElement("p");
        reason.className = "admin-antispam-reason";
        reason.textContent = String(comment.moderation_reason);
        card.appendChild(reason);
      }

      const actions = document.createElement("div");
      actions.className = "admin-antispam-actions";
      actions.appendChild(
        createSmallActionButton(t("admin.antispamApprove", null, "Approve"), () =>
          requestJson("/admin/comments/" + encodeURIComponent(comment.id) + "/approve", { method: "POST" })
        )
      );
      actions.appendChild(
        createSmallActionButton(t("admin.antispamReject", null, "Reject"), () =>
          requestJson("/admin/comments/" + encodeURIComponent(comment.id) + "/reject", { method: "POST" })
        )
      );
      actions.appendChild(
        createSmallActionButton(t("admin.delete", null, "Delete"), () =>
          requestJson("/comments/" + encodeURIComponent(comment.id), { method: "DELETE" })
        )
      );
      card.appendChild(actions);
      section.appendChild(card);
    });
    container.appendChild(section);
  }

  function renderActiveMutes(container, mutes) {
    const section = createAntispamSection(
      t("admin.antispamMutes", null, "Active mutes"),
      t("admin.antispamNoMutes", null, "No active mutes.")
    );
    if (!Array.isArray(mutes) || mutes.length === 0) {
      appendAntispamEmpty(section);
      container.appendChild(section);
      return;
    }

    mutes.forEach((mute) => {
      const row = document.createElement("article");
      row.className = "admin-antispam-card";
      const text = document.createElement("p");
      text.textContent =
        "#" +
        String(mute.id) +
        " | ip_hash " +
        String(mute.ip_hash_short || "") +
        " | until " +
        formatAdminDate(mute.muted_until) +
        " | " +
        String(mute.reason || "mute");
      row.appendChild(text);
      const actions = document.createElement("div");
      actions.className = "admin-antispam-actions";
      actions.appendChild(
        createSmallActionButton(t("admin.antispamUnmute", null, "Unmute"), () =>
          requestJson("/admin/comment-mutes/" + encodeURIComponent(mute.id), { method: "DELETE" })
        )
      );
      row.appendChild(actions);
      section.appendChild(row);
    });
    container.appendChild(section);
  }

  function renderRecentAttempts(container, attempts) {
    const section = createAntispamSection(
      t("admin.antispamAttempts", null, "Recent attempts"),
      t("admin.antispamNoAttempts", null, "No comment attempts yet.")
    );
    if (!Array.isArray(attempts) || attempts.length === 0) {
      appendAntispamEmpty(section);
      container.appendChild(section);
      return;
    }

    attempts.forEach((attempt) => {
      const row = document.createElement("article");
      row.className = "admin-antispam-card admin-antispam-attempt";
      const meta = document.createElement("p");
      meta.className = "meta-line";
      meta.textContent =
        "#" +
        String(attempt.id) +
        " | " +
        String(attempt.status || "") +
        " | post #" +
        String(attempt.post_id || "-") +
        " | ip_hash " +
        String(attempt.ip_hash_short || "") +
        " | " +
        formatAdminDate(attempt.created_at);
      row.appendChild(meta);
      const reason = document.createElement("p");
      reason.className = "admin-antispam-reason";
      reason.textContent = String(attempt.reason || "-");
      row.appendChild(reason);
      if (attempt.content) {
        const content = document.createElement("p");
        content.className = "admin-antispam-content";
        content.textContent = truncateText(attempt.content, 180);
        row.appendChild(content);
      }
      section.appendChild(row);
    });
    container.appendChild(section);
  }

  function renderAntispamPanel(data) {
    if (!antispamPanel) return;
    antispamPanel.innerHTML = "";
    renderPendingComments(antispamPanel, data && data.pending_comments);
    renderActiveMutes(antispamPanel, data && data.mutes);
    renderRecentAttempts(antispamPanel, data && data.attempts);
  }

  async function loadAntispam() {
    if (!antispamPanel) return;
    setStatus(antispamStatus, t("admin.antispamLoading", null, "Loading antispam data..."), false);
    if (!(await ensureActiveAdminSession())) {
      return;
    }
    const data = await requestJson("/admin/antispam");
    renderAntispamPanel(data);
    setStatus(antispamStatus, t("admin.antispamLoaded", null, "Antispam data loaded."), false);
  }

  function readStoredDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeStoredDraft() {
    try {
      const title = postTitleInput ? postTitleInput.value : "";
      const hasContent = asText(title) || draftBlocks.length > 0;
      if (!hasContent) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        draftDirty = false;
        return;
      }

      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          title,
          blocks: draftBlocks,
          updated_at: new Date().toISOString()
        })
      );
      draftDirty = true;
    } catch (error) {
      draftDirty = Boolean(asText(postTitleInput && postTitleInput.value) || draftBlocks.length > 0);
    }
  }

  function clearStoredDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (error) {
      return;
    }
  }

  function loadStoredDraft() {
    const storedDraft = readStoredDraft();
    if (!storedDraft) return false;

    const storedBlocks = Array.isArray(storedDraft.blocks)
      ? storedDraft.blocks.map((block) => createDefaultBlock(asText(block && block.type), block)).filter(Boolean)
      : [];
    const storedTitle = typeof storedDraft.title === "string" ? storedDraft.title : "";

    if (!storedTitle && storedBlocks.length === 0) return false;

    postTitleInput.value = storedTitle;
    draftBlocks = storedBlocks;
    draftDirty = true;
    return true;
  }

  function setHeaderAdminUi(isAuthenticated) {
    if (adminEntryLink) {
      adminEntryLink.textContent = isAuthenticated
        ? t("nav.adminPanel", null, "Admin Panel")
        : t("nav.admin", null, "Admin");
    }
    if (adminLogoutButton) {
      adminLogoutButton.hidden = !isAuthenticated;
    }
  }

  function showLoginView(sessionMessage, isError) {
    adminCsrfToken = "";
    adminLoginView.hidden = false;
    adminEditorView.hidden = true;
    setStatus(
      adminSessionStatus,
      sessionMessage || t("admin.sessionNeedLogin", null, "Log in to access admin tools."),
      Boolean(isError)
    );
    setHeaderAdminUi(false);
  }

  function showEditorView(sessionMessage, sessionData) {
    if (sessionData && typeof sessionData.csrf_token === "string") {
      adminCsrfToken = sessionData.csrf_token;
    }
    adminLoginView.hidden = true;
    adminEditorView.hidden = false;
    setStatus(adminLoginStatus, "", false);
    setStatus(
      adminSessionStatus,
      buildSessionMessage(
        sessionMessage || t("admin.sessionActive", null, "Admin session active."),
        sessionData
      ),
      false
    );
    setHeaderAdminUi(true);
    schedulePostPreviewRender();
    loadAntispam().catch((error) => {
      setStatus(antispamStatus, translateErrorMessage(error, "admin.antispamLoadFailed", "Could not load antispam data."), true);
    });
  }

  function deriveFileName(src) {
    const parts = String(src || "").split("/");
    const filename = parts[parts.length - 1] || t("common.file", null, "file");
    try {
      return decodeURIComponent(filename);
    } catch (error) {
      return filename;
    }
  }

  function normalizeDraftBlock(rawBlock) {
    if (typeof window.normalizeClientBlock !== "function") {
      return null;
    }

    try {
      return window.normalizeClientBlock(rawBlock);
    } catch (error) {
      return null;
    }
  }

  function renderSharedPostBlock(block) {
    if (typeof window.renderPostBlock !== "function") {
      return null;
    }

    try {
      return window.renderPostBlock(block);
    } catch (error) {
      return null;
    }
  }

  function createDefaultBlock(type, initialValues) {
    const initial = initialValues && typeof initialValues === "object" ? initialValues : {};

    if (type === "paragraph") {
      return {
        type: "paragraph",
        text: typeof initial.text === "string" ? initial.text : ""
      };
    }

    if (type === "heading") {
      return {
        type: "heading",
        level: asHeadingLevel(initial.level),
        text: typeof initial.text === "string" ? initial.text : ""
      };
    }

    if (type === "quote") {
      return {
        type: "quote",
        text: typeof initial.text === "string" ? initial.text : ""
      };
    }

    if (type === "divider") {
      return {
        type: "divider"
      };
    }

    if (type === "media") {
      const mediaKind = asText(initial.mediaKind);
      return {
        type: "media",
        mediaKind: ALLOWED_MEDIA_KINDS.has(mediaKind) ? mediaKind : "image",
        src: typeof initial.src === "string" ? initial.src : "",
        name: typeof initial.name === "string" ? initial.name : "",
        alt: typeof initial.alt === "string" ? initial.alt : "",
        caption: typeof initial.caption === "string" ? initial.caption : ""
      };
    }

    return null;
  }

  function humanBlockType(type) {
    if (type === "paragraph") return t("admin.blockTypeParagraph", null, "Paragraph");
    if (type === "heading") return t("admin.blockTypeHeading", null, "Heading");
    if (type === "quote") return t("admin.blockTypeQuote", null, "Quote");
    if (type === "divider") return t("admin.blockTypeDivider", null, "Divider");
    if (type === "media") return t("admin.blockTypeMedia", null, "Media");
    return t("admin.blockTypeFallback", null, "Block");
  }

  function createPreviewMessage(message, className) {
    const text = document.createElement("p");
    text.className = className || "admin-preview-placeholder";
    text.textContent = message;
    return text;
  }

  function syncBlocksJson() {
    blocksInput.value = JSON.stringify(draftBlocks, null, 2);
  }

  function syncEmptyState() {
    if (!blockEditorEmpty) {
      return;
    }
    blockEditorEmpty.hidden = draftBlocks.length > 0;
  }

  function schedulePostPreviewRender() {
    if (previewRenderQueued) {
      return;
    }

    previewRenderQueued = true;
    const runRender = () => {
      previewRenderQueued = false;
      renderPostPreview();
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(runRender);
    } else {
      window.setTimeout(runRender, 0);
    }
  }

  function syncDraftOutputs() {
    syncBlocksJson();
    writeStoredDraft();
    schedulePostPreviewRender();
  }

  function createBlockField(labelText, controlElement) {
    const label = document.createElement("label");
    label.className = "admin-block-field";

    const title = document.createElement("span");
    title.className = "admin-block-field-label";
    title.textContent = labelText;
    label.appendChild(title);

    label.appendChild(controlElement);
    return label;
  }

  function createBlockControlButton(label, isDisabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-block-control";
    button.textContent = label;
    button.disabled = Boolean(isDisabled);
    button.addEventListener("click", onClick);
    return button;
  }

  function focusBlockField(index, fieldName) {
    if (index < 0 || !fieldName) {
      return;
    }

    const selector =
      "[data-block-index='" +
      String(index) +
      "'] [data-field='" +
      String(fieldName).replaceAll("'", "\\'") +
      "']";
    const field = blockEditorList.querySelector(selector);
    if (field && typeof field.focus === "function") {
      field.focus();
    }
  }

  function addBlock(type, initialValues, focusField) {
    const block = createDefaultBlock(type, initialValues);
    if (!block) {
      return;
    }

    draftBlocks.push(block);
    renderBlockEditor();
    syncDraftOutputs();

    if (focusField) {
      window.setTimeout(() => {
        focusBlockField(draftBlocks.length - 1, focusField);
      }, 0);
    }
  }

  function deleteBlock(index) {
    if (index < 0 || index >= draftBlocks.length) {
      return;
    }
    draftBlocks.splice(index, 1);
    renderBlockEditor();
    syncDraftOutputs();
  }

  function moveBlock(index, direction) {
    const target = index + direction;
    if (index < 0 || index >= draftBlocks.length || target < 0 || target >= draftBlocks.length) {
      return;
    }

    const current = draftBlocks[index];
    draftBlocks[index] = draftBlocks[target];
    draftBlocks[target] = current;
    renderBlockEditor();
    syncDraftOutputs();
    window.setTimeout(() => {
      focusBlockField(target, "text");
    }, 0);
  }

  function reorderBlock(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= draftBlocks.length ||
      toIndex < 0 ||
      toIndex >= draftBlocks.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const moved = draftBlocks.splice(fromIndex, 1)[0];
    draftBlocks.splice(toIndex, 0, moved);
    renderBlockEditor();
    syncDraftOutputs();
  }

  function isLongEditableBlock(block) {
    if (!block || typeof block !== "object") return false;
    if (block.type === "paragraph" || block.type === "quote") {
      return String(block.text || "").length >= LONG_BLOCK_COLLAPSE_LENGTH;
    }
    if (block.type === "media") {
      return [block.src, block.name, block.alt, block.caption].join(" ").length >= LONG_BLOCK_COLLAPSE_LENGTH;
    }
    return false;
  }

  function updateBlockTextField(index, fieldName, value) {
    if (!draftBlocks[index] || typeof draftBlocks[index] !== "object") {
      return;
    }
    draftBlocks[index][fieldName] = typeof value === "string" ? value : "";
    syncDraftOutputs();
  }

  function renderBlockFields(block, index) {
    const fields = document.createElement("div");
    fields.className = "admin-block-fields";

    if (block.type === "paragraph") {
      const text = document.createElement("textarea");
      text.rows = 4;
      text.value = typeof block.text === "string" ? block.text : "";
      text.dataset.field = "text";
      text.addEventListener("input", () => updateBlockTextField(index, "text", text.value));
      fields.appendChild(createBlockField(t("admin.fieldText", null, "Text"), text));
      return fields;
    }

    if (block.type === "heading") {
      const level = document.createElement("select");
      level.dataset.field = "level";
      [1, 2, 3].forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = String(optionValue);
        option.textContent = "H" + optionValue;
        option.selected = asHeadingLevel(block.level) === optionValue;
        level.appendChild(option);
      });
      level.addEventListener("change", () => {
        if (!draftBlocks[index]) return;
        draftBlocks[index].level = asHeadingLevel(level.value);
        syncDraftOutputs();
      });
      fields.appendChild(createBlockField(t("admin.fieldHeadingLevel", null, "Heading level"), level));

      const text = document.createElement("input");
      text.type = "text";
      text.value = typeof block.text === "string" ? block.text : "";
      text.dataset.field = "text";
      text.addEventListener("input", () => updateBlockTextField(index, "text", text.value));
      fields.appendChild(createBlockField(t("admin.fieldText", null, "Text"), text));
      return fields;
    }

    if (block.type === "quote") {
      const text = document.createElement("textarea");
      text.rows = 3;
      text.value = typeof block.text === "string" ? block.text : "";
      text.dataset.field = "text";
      text.addEventListener("input", () => updateBlockTextField(index, "text", text.value));
      fields.appendChild(createBlockField(t("admin.fieldQuoteText", null, "Quote text"), text));
      return fields;
    }

    if (block.type === "divider") {
      const info = document.createElement("p");
      info.className = "admin-block-hint";
      info.textContent = t("admin.dividerNoFields", null, "Divider has no extra fields.");
      fields.appendChild(info);
      return fields;
    }

    if (block.type === "media") {
      const mediaKind = document.createElement("select");
      mediaKind.dataset.field = "mediaKind";
      ["image", "gif", "video", "audio", "file"].forEach((kind) => {
        const option = document.createElement("option");
        option.value = kind;
        option.textContent = kind;
        option.selected = asText(block.mediaKind) === kind;
        mediaKind.appendChild(option);
      });
      mediaKind.addEventListener("change", () => {
        if (!draftBlocks[index]) return;
        draftBlocks[index].mediaKind = mediaKind.value;
        syncDraftOutputs();
      });
      fields.appendChild(createBlockField(t("admin.fieldMediaKind", null, "Media kind"), mediaKind));

      const src = document.createElement("input");
      src.type = "text";
      src.placeholder = "/uploads/your-file.ext";
      src.value = typeof block.src === "string" ? block.src : "";
      src.dataset.field = "src";
      src.addEventListener("input", () => updateBlockTextField(index, "src", src.value));
      fields.appendChild(createBlockField(t("admin.fieldSource", null, "Source URL"), src));

      const name = document.createElement("input");
      name.type = "text";
      name.value = typeof block.name === "string" ? block.name : "";
      name.dataset.field = "name";
      name.addEventListener("input", () => updateBlockTextField(index, "name", name.value));
      fields.appendChild(createBlockField(t("admin.fieldName", null, "Name"), name));

      const alt = document.createElement("input");
      alt.type = "text";
      alt.value = typeof block.alt === "string" ? block.alt : "";
      alt.dataset.field = "alt";
      alt.addEventListener("input", () => updateBlockTextField(index, "alt", alt.value));
      fields.appendChild(createBlockField(t("admin.fieldAlt", null, "Alt text"), alt));

      const caption = document.createElement("input");
      caption.type = "text";
      caption.value = typeof block.caption === "string" ? block.caption : "";
      caption.dataset.field = "caption";
      caption.addEventListener("input", () => updateBlockTextField(index, "caption", caption.value));
      fields.appendChild(createBlockField(t("admin.fieldCaption", null, "Caption"), caption));
      return fields;
    }

    const unsupported = document.createElement("p");
    unsupported.className = "admin-block-hint";
    unsupported.textContent = t("admin.unsupportedBlock", null, "Unsupported block type.");
    fields.appendChild(unsupported);
    return fields;
  }

  function renderBlockEditor() {
    blockEditorList.textContent = "";

    draftBlocks.forEach((block, index) => {
      const card = document.createElement("article");
      card.className = "admin-block-card";
      card.dataset.blockIndex = String(index);

      card.addEventListener("dragover", (event) => {
        if (draggedBlockIndex < 0 || draggedBlockIndex === index) return;
        event.preventDefault();
        card.classList.add("admin-block-card-drop-target");
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("admin-block-card-drop-target");
      });
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("admin-block-card-drop-target");
        reorderBlock(draggedBlockIndex, index);
        draggedBlockIndex = -1;
      });

      const head = document.createElement("div");
      head.className = "admin-block-head";

      const titleWrap = document.createElement("div");
      titleWrap.className = "admin-block-title-wrap";

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "admin-block-drag-handle";
      dragHandle.textContent = "↕";
      dragHandle.draggable = true;
      dragHandle.title = t("admin.dragBlock", null, "Drag block");
      dragHandle.setAttribute("aria-label", t("admin.dragBlock", null, "Drag block"));
      dragHandle.addEventListener("dragstart", (event) => {
        draggedBlockIndex = index;
        card.classList.add("admin-block-card-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(index));
        }
      });
      dragHandle.addEventListener("dragend", () => {
        draggedBlockIndex = -1;
        Array.from(blockEditorList.querySelectorAll(".admin-block-card")).forEach((item) => {
          item.classList.remove("admin-block-card-dragging", "admin-block-card-drop-target");
        });
      });
      titleWrap.appendChild(dragHandle);

      const indexLabel = document.createElement("p");
      indexLabel.className = "admin-block-index";
      indexLabel.textContent = t("admin.block", { index: index + 1 }, "Block " + String(index + 1));
      titleWrap.appendChild(indexLabel);

      const typeLabel = document.createElement("p");
      typeLabel.className = "admin-block-type";
      typeLabel.textContent = humanBlockType(block.type);
      titleWrap.appendChild(typeLabel);

      head.appendChild(titleWrap);

      const controls = document.createElement("div");
      controls.className = "admin-block-controls";
      controls.appendChild(
        createBlockControlButton(t("admin.moveUp", null, "Move Up"), index === 0, () => {
          moveBlock(index, -1);
        })
      );
      controls.appendChild(
        createBlockControlButton(
          t("admin.moveDown", null, "Move Down"),
          index === draftBlocks.length - 1,
          () => {
            moveBlock(index, 1);
          }
        )
      );
      if (isLongEditableBlock(block)) {
        const collapsed = collapsedBlocks.has(block);
        controls.appendChild(
          createBlockControlButton(
            collapsed ? t("admin.expand", null, "Expand") : t("admin.collapse", null, "Collapse"),
            false,
            () => {
              if (collapsedBlocks.has(block)) {
                collapsedBlocks.delete(block);
              } else {
                collapsedBlocks.add(block);
              }
              renderBlockEditor();
            }
          )
        );
      }
      controls.appendChild(
        createBlockControlButton(t("admin.delete", null, "Delete"), false, () => {
          deleteBlock(index);
        })
      );
      head.appendChild(controls);

      card.appendChild(head);
      const fields = renderBlockFields(block, index);
      if (collapsedBlocks.has(block)) {
        fields.hidden = true;
      }
      card.classList.toggle("admin-block-card-collapsed", collapsedBlocks.has(block));
      card.appendChild(fields);
      blockEditorList.appendChild(card);
    });

    syncEmptyState();
  }

  function renderPostPreview() {
    if (!postPreviewTitle || !postPreviewBlocks) {
      return;
    }

    postPreviewTitle.textContent = asText(postTitleInput.value) || t("admin.previewUntitled", null, "Untitled post");
    postPreviewBlocks.textContent = "";

    if (draftBlocks.length === 0) {
      postPreviewBlocks.appendChild(
        createPreviewMessage(t("admin.previewNeedBlocks", null, "Add blocks to preview post content."))
      );
      return;
    }

    if (
      typeof window.normalizeClientBlock !== "function" ||
      typeof window.renderPostBlock !== "function"
    ) {
      postPreviewBlocks.appendChild(
        createPreviewMessage(
          t("admin.previewUnavailable", null, "Preview renderer unavailable."),
          "admin-preview-invalid"
        )
      );
      return;
    }

    let renderedCount = 0;

    draftBlocks.forEach((rawBlock, index) => {
      const normalizedBlock = normalizeDraftBlock(rawBlock);
      if (!normalizedBlock) {
        postPreviewBlocks.appendChild(
          createPreviewMessage(
            t(
              "admin.previewIncomplete",
              { index: index + 1 },
              "Block " + (index + 1) + " is incomplete and not shown yet."
            ),
            "admin-preview-invalid"
          )
        );
        return;
      }

      const blockElement = renderSharedPostBlock(normalizedBlock);
      if (!blockElement) {
        postPreviewBlocks.appendChild(
          createPreviewMessage(
            t(
              "admin.previewCannot",
              { index: index + 1 },
              "Block " + (index + 1) + " cannot be previewed yet."
            ),
            "admin-preview-invalid"
          )
        );
        return;
      }

      postPreviewBlocks.appendChild(blockElement);
      renderedCount += 1;
    });

    if (renderedCount === 0 && postPreviewBlocks.children.length === 0) {
      postPreviewBlocks.appendChild(
        createPreviewMessage(t("admin.previewNoReadable", null, "No readable blocks yet."))
      );
    }
  }

  async function requestJson(url, options) {
    const requestOptions = Object.assign({ credentials: "same-origin" }, options || {});
    const method = String(requestOptions.method || "GET").toUpperCase();
    const isAdminMutation = !["GET", "HEAD", "OPTIONS"].includes(method) && url !== "/admin/login";
    if (isAdminMutation && adminCsrfToken) {
      const headers = new Headers(requestOptions.headers || {});
      headers.set("X-CSRF-Token", adminCsrfToken);
      requestOptions.headers = headers;
    }

    const response = await fetch(url, requestOptions);
    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.error ? data.error : t("common.requestFailed", null, "Request failed.");
      const details =
        data && Array.isArray(data.details) && data.details.length
          ? " " + data.details.join(" ")
          : "";
      const requestError = new Error(message + details);
      requestError.status = response.status;
      requestError.payload = data;
      if ((response.status === 401 || response.status === 403) && url !== "/admin/session" && url !== "/admin/login") {
        adminCsrfToken = "";
        await forceLogoutUi(t("admin.sessionExpired", null, "Session expired. Log in again."));
      }
      throw requestError;
    }

    return data;
  }

  async function refreshSessionUi() {
    try {
      const data = await requestJson("/admin/session");
      if (data && data.authenticated) {
        showEditorView(t("admin.loggedInMessage", null, "Logged in. You can upload files and publish posts."), data);
      } else {
        showLoginView(
          t("admin.loginPrompt", null, "Log in with the admin key to access admin tools."),
          false
        );
      }
    } catch (error) {
      showLoginView(t("admin.sessionCheckFailed", null, "Could not check admin session. Try again."), true);
    }
  }

  async function forceLogoutUi(message) {
    adminCsrfToken = "";
    setHeaderAdminUi(false);
    adminEditorView.hidden = true;
    adminLoginView.hidden = false;
    setStatus(adminSessionStatus, message || t("admin.forceLogin", null, "Please log in as admin."), true);
    setStatus(adminLoginStatus, "", false);
    if (adminSecretInput) {
      adminSecretInput.focus();
    }
  }

  async function ensureActiveAdminSession() {
    try {
      const data = await requestJson("/admin/session");
      if (data && data.authenticated) {
        if (typeof data.csrf_token === "string") {
          adminCsrfToken = data.csrf_token;
        }
        return true;
      }
    } catch (error) {
      // Fall through to the shared forced-login UI.
    }

    await forceLogoutUi(t("admin.sessionExpired", null, "Session expired. Log in again to continue."));
    return false;
  }

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const secret = asText(adminSecretInput.value);

    if (!secret) {
      setStatus(adminLoginStatus, t("admin.secretRequired", null, "Admin key is required."), true);
      return;
    }

    setStatus(adminLoginStatus, t("admin.loggingIn", null, "Logging in..."), false);

    try {
      const data = await requestJson("/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ secret })
      });

      adminLoginForm.reset();
      setStatus(adminLoginStatus, "", false);
      showEditorView(t("admin.loggedInMessage", null, "Logged in. You can upload files and publish posts."), data);
    } catch (error) {
      setStatus(adminLoginStatus, translateErrorMessage(error, "admin.loginFailed", "Login failed."), true);
      showLoginView(t("admin.loginRequired", null, "Admin login required."), true);
    }
  });

  if (adminLogoutButton) {
    adminLogoutButton.addEventListener("click", async () => {
      adminLogoutButton.disabled = true;
      try {
        await requestJson("/admin/logout", { method: "POST" });
        adminCsrfToken = "";
        showLoginView(t("admin.loggedOut", null, "Logged out."), false);
      } catch (error) {
        setStatus(adminSessionStatus, translateErrorMessage(error, "admin.logoutFailed", "Logout failed."), true);
      } finally {
        adminLogoutButton.disabled = false;
      }
    });
  }

  if (antispamRefreshButton) {
    antispamRefreshButton.addEventListener("click", () => {
      loadAntispam().catch((error) => {
        setStatus(antispamStatus, translateErrorMessage(error, "admin.antispamLoadFailed", "Could not load antispam data."), true);
      });
    });
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(uploadStatus, t("admin.uploading", null, "Uploading..."), false);
    setResult(uploadResult, null);

    const file = uploadFileInput.files && uploadFileInput.files[0];
    if (!file) {
      setStatus(uploadStatus, t("admin.chooseFile", null, "Choose a file first."), true);
      return;
    }

    if (!(await ensureActiveAdminSession())) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const data = await requestJson("/upload", {
        method: "POST",
        body: formData
      });

      lastUpload = data;
      setResult(uploadResult, data);
      setStatus(uploadStatus, t("admin.uploadSuccess", null, "Upload successful."), false);
      uploadForm.reset();
    } catch (error) {
      if (error && error.status === 401) {
        await forceLogoutUi(t("admin.sessionExpired", null, "Session expired. Log in again to continue."));
        return;
      }
      setStatus(uploadStatus, translateErrorMessage(error, "admin.uploadFailed", "Upload failed."), true);
    }
  });

  insertMediaBlockButton.addEventListener("click", () => {
    if (!lastUpload || !lastUpload.url || !lastUpload.mediaKind) {
      setStatus(uploadStatus, t("admin.uploadFirst", null, "Upload a file first."), true);
      return;
    }

    addBlock(
      "media",
      {
        mediaKind: lastUpload.mediaKind,
        src: lastUpload.url,
        name: asText(lastUpload.originalName) || deriveFileName(lastUpload.url)
      },
      "caption"
    );

    setStatus(
      uploadStatus,
      t("admin.mediaAdded", null, "Added new media block from latest upload."),
      false
    );
  });

  addBlockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const blockType = asText(button.dataset.addBlock);
      const focusField =
        blockType === "heading"
          ? "text"
          : blockType === "media"
            ? "src"
            : blockType === "divider"
              ? ""
              : "text";
      addBlock(blockType, null, focusField);
    });
  });

  clearDraftButton.addEventListener("click", () => {
    draftBlocks = [];
    postTitleInput.value = "";
    draftDirty = false;
    clearStoredDraft();
    setStatus(postStatus, t("admin.draftCleared", null, "Draft cleared."), false);
    setResult(postResult, null);
    renderBlockEditor();
    syncBlocksJson();
    schedulePostPreviewRender();
  });

  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(postStatus, t("admin.creatingPost", null, "Creating post..."), false);
    setResult(postResult, null);

    const title = asText(postTitleInput.value);

    if (!title) {
      setStatus(postStatus, t("admin.postTitleRequired", null, "Post title is required."), true);
      return;
    }

    if (draftBlocks.length === 0) {
      setStatus(postStatus, t("admin.needBlock", null, "Add at least one block before publishing."), true);
      return;
    }

    if (typeof window.normalizeClientBlock !== "function") {
      setStatus(
        postStatus,
        t(
          "admin.validatorMissing",
          null,
          "Block validator unavailable. Reload the page and try again."
        ),
        true
      );
      return;
    }

    if (!(await ensureActiveAdminSession())) {
      return;
    }

    const normalizedBlocks = [];
    for (let index = 0; index < draftBlocks.length; index += 1) {
      const normalized = normalizeDraftBlock(draftBlocks[index]);
      if (!normalized) {
        setStatus(
          postStatus,
          t(
            "admin.blockIncomplete",
            { index: index + 1 },
            "Block " + (index + 1) + " is incomplete. Fill required fields before publishing."
          ),
          true
        );
        return;
      }
      normalizedBlocks.push(normalized);
    }

    try {
      const data = await requestJson("/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          blocks: normalizedBlocks
        })
      });

      setResult(postResult, data);
      setStatus(postStatus, t("admin.postCreated", null, "Post created successfully."), false);
      draftBlocks = [];
      postTitleInput.value = "";
      draftDirty = false;
      clearStoredDraft();
      renderBlockEditor();
      syncBlocksJson();
      schedulePostPreviewRender();
    } catch (error) {
      if (error && error.status === 401) {
        await forceLogoutUi(t("admin.sessionExpired", null, "Session expired. Log in again to continue."));
        return;
      }
      setStatus(postStatus, translateErrorMessage(error, "admin.postCreateFailed", "Post creation failed."), true);
    }
  });

  postTitleInput.addEventListener("input", syncDraftOutputs);
  postTitleInput.addEventListener("change", syncDraftOutputs);

  window.addEventListener("beforeunload", (event) => {
    if (!draftDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  const restoredDraft = loadStoredDraft();
  renderBlockEditor();
  syncBlocksJson();
  schedulePostPreviewRender();
  if (restoredDraft) {
    setStatus(postStatus, t("admin.draftRestored", null, "Draft restored."), false);
  }
  refreshSessionUi();
})();
