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
  let lastUpload = null;
  let draftBlocks = [];
  let previewRenderQueued = false;

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

  function setHeaderAdminUi(isAuthenticated) {
    if (adminEntryLink) {
      adminEntryLink.textContent = isAuthenticated ? "Admin Panel" : "Admin";
    }
    if (adminLogoutButton) {
      adminLogoutButton.hidden = !isAuthenticated;
    }
  }

  function showLoginView(sessionMessage, isError) {
    adminLoginView.hidden = false;
    adminEditorView.hidden = true;
    setStatus(adminSessionStatus, sessionMessage || "Log in to access admin tools.", Boolean(isError));
    setHeaderAdminUi(false);
  }

  function showEditorView(sessionMessage) {
    adminLoginView.hidden = true;
    adminEditorView.hidden = false;
    setStatus(adminLoginStatus, "", false);
    setStatus(adminSessionStatus, sessionMessage || "Admin session active.", false);
    setHeaderAdminUi(true);
    schedulePostPreviewRender();
  }

  function deriveFileName(src) {
    const parts = String(src || "").split("/");
    const filename = parts[parts.length - 1] || "file";
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
    if (type === "paragraph") return "Paragraph";
    if (type === "heading") return "Heading";
    if (type === "quote") return "Quote";
    if (type === "divider") return "Divider";
    if (type === "media") return "Media";
    return "Block";
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
      fields.appendChild(createBlockField("Text", text));
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
      fields.appendChild(createBlockField("Heading level", level));

      const text = document.createElement("input");
      text.type = "text";
      text.value = typeof block.text === "string" ? block.text : "";
      text.dataset.field = "text";
      text.addEventListener("input", () => updateBlockTextField(index, "text", text.value));
      fields.appendChild(createBlockField("Text", text));
      return fields;
    }

    if (block.type === "quote") {
      const text = document.createElement("textarea");
      text.rows = 3;
      text.value = typeof block.text === "string" ? block.text : "";
      text.dataset.field = "text";
      text.addEventListener("input", () => updateBlockTextField(index, "text", text.value));
      fields.appendChild(createBlockField("Quote text", text));
      return fields;
    }

    if (block.type === "divider") {
      const info = document.createElement("p");
      info.className = "admin-block-hint";
      info.textContent = "Divider has no extra fields.";
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
      fields.appendChild(createBlockField("Media kind", mediaKind));

      const src = document.createElement("input");
      src.type = "text";
      src.placeholder = "/uploads/your-file.ext";
      src.value = typeof block.src === "string" ? block.src : "";
      src.dataset.field = "src";
      src.addEventListener("input", () => updateBlockTextField(index, "src", src.value));
      fields.appendChild(createBlockField("Source URL", src));

      const name = document.createElement("input");
      name.type = "text";
      name.value = typeof block.name === "string" ? block.name : "";
      name.dataset.field = "name";
      name.addEventListener("input", () => updateBlockTextField(index, "name", name.value));
      fields.appendChild(createBlockField("Name", name));

      const alt = document.createElement("input");
      alt.type = "text";
      alt.value = typeof block.alt === "string" ? block.alt : "";
      alt.dataset.field = "alt";
      alt.addEventListener("input", () => updateBlockTextField(index, "alt", alt.value));
      fields.appendChild(createBlockField("Alt text", alt));

      const caption = document.createElement("input");
      caption.type = "text";
      caption.value = typeof block.caption === "string" ? block.caption : "";
      caption.dataset.field = "caption";
      caption.addEventListener("input", () => updateBlockTextField(index, "caption", caption.value));
      fields.appendChild(createBlockField("Caption", caption));
      return fields;
    }

    const unsupported = document.createElement("p");
    unsupported.className = "admin-block-hint";
    unsupported.textContent = "Unsupported block type.";
    fields.appendChild(unsupported);
    return fields;
  }

  function renderBlockEditor() {
    blockEditorList.textContent = "";

    draftBlocks.forEach((block, index) => {
      const card = document.createElement("article");
      card.className = "admin-block-card";
      card.dataset.blockIndex = String(index);

      const head = document.createElement("div");
      head.className = "admin-block-head";

      const titleWrap = document.createElement("div");
      titleWrap.className = "admin-block-title-wrap";

      const indexLabel = document.createElement("p");
      indexLabel.className = "admin-block-index";
      indexLabel.textContent = "Block " + String(index + 1);
      titleWrap.appendChild(indexLabel);

      const typeLabel = document.createElement("p");
      typeLabel.className = "admin-block-type";
      typeLabel.textContent = humanBlockType(block.type);
      titleWrap.appendChild(typeLabel);

      head.appendChild(titleWrap);

      const controls = document.createElement("div");
      controls.className = "admin-block-controls";
      controls.appendChild(
        createBlockControlButton("Move Up", index === 0, () => {
          moveBlock(index, -1);
        })
      );
      controls.appendChild(
        createBlockControlButton("Move Down", index === draftBlocks.length - 1, () => {
          moveBlock(index, 1);
        })
      );
      controls.appendChild(
        createBlockControlButton("Delete", false, () => {
          deleteBlock(index);
        })
      );
      head.appendChild(controls);

      card.appendChild(head);
      card.appendChild(renderBlockFields(block, index));
      blockEditorList.appendChild(card);
    });

    syncEmptyState();
  }

  function renderPostPreview() {
    if (!postPreviewTitle || !postPreviewBlocks) {
      return;
    }

    postPreviewTitle.textContent = asText(postTitleInput.value) || "Untitled post";
    postPreviewBlocks.textContent = "";

    if (draftBlocks.length === 0) {
      postPreviewBlocks.appendChild(createPreviewMessage("Add blocks to preview post content."));
      return;
    }

    if (
      typeof window.normalizeClientBlock !== "function" ||
      typeof window.renderPostBlock !== "function"
    ) {
      postPreviewBlocks.appendChild(
        createPreviewMessage("Preview renderer unavailable.", "admin-preview-invalid")
      );
      return;
    }

    let renderedCount = 0;

    draftBlocks.forEach((rawBlock, index) => {
      const normalizedBlock = normalizeDraftBlock(rawBlock);
      if (!normalizedBlock) {
        postPreviewBlocks.appendChild(
          createPreviewMessage(
            "Block " + (index + 1) + " is incomplete and not shown yet.",
            "admin-preview-invalid"
          )
        );
        return;
      }

      const blockElement = renderSharedPostBlock(normalizedBlock);
      if (!blockElement) {
        postPreviewBlocks.appendChild(
          createPreviewMessage(
            "Block " + (index + 1) + " cannot be previewed yet.",
            "admin-preview-invalid"
          )
        );
        return;
      }

      postPreviewBlocks.appendChild(blockElement);
      renderedCount += 1;
    });

    if (renderedCount === 0 && postPreviewBlocks.children.length === 0) {
      postPreviewBlocks.appendChild(createPreviewMessage("No readable blocks yet."));
    }
  }

  async function requestJson(url, options) {
    const requestOptions = Object.assign({ credentials: "same-origin" }, options || {});
    const response = await fetch(url, requestOptions);
    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.error ? data.error : "Request failed.";
      const details =
        data && Array.isArray(data.details) && data.details.length
          ? " " + data.details.join(" ")
          : "";
      const requestError = new Error(message + details);
      requestError.status = response.status;
      requestError.payload = data;
      throw requestError;
    }

    return data;
  }

  async function refreshSessionUi() {
    try {
      const data = await requestJson("/admin/session");
      if (data && data.authenticated) {
        showEditorView("Logged in. You can upload files and publish posts.");
      } else {
        showLoginView("Log in with ADMIN_SECRET to access admin tools.", false);
      }
    } catch (error) {
      showLoginView("Could not check admin session. Try again.", true);
    }
  }

  async function forceLogoutUi(message) {
    setHeaderAdminUi(false);
    adminEditorView.hidden = true;
    adminLoginView.hidden = false;
    setStatus(adminSessionStatus, message || "Please log in as admin.", true);
    setStatus(adminLoginStatus, "", false);
    if (adminSecretInput) {
      adminSecretInput.focus();
    }
  }

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const secret = asText(adminSecretInput.value);

    if (!secret) {
      setStatus(adminLoginStatus, "Admin secret is required.", true);
      return;
    }

    setStatus(adminLoginStatus, "Logging in...", false);

    try {
      await requestJson("/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ secret })
      });

      adminLoginForm.reset();
      setStatus(adminLoginStatus, "", false);
      showEditorView("Logged in. You can upload files and publish posts.");
    } catch (error) {
      setStatus(adminLoginStatus, error.message || "Login failed.", true);
      showLoginView("Admin login required.", true);
    }
  });

  if (adminLogoutButton) {
    adminLogoutButton.addEventListener("click", async () => {
      adminLogoutButton.disabled = true;
      try {
        await requestJson("/admin/logout", { method: "POST" });
        showLoginView("Logged out.", false);
      } catch (error) {
        setStatus(adminSessionStatus, error.message || "Logout failed.", true);
      } finally {
        adminLogoutButton.disabled = false;
      }
    });
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(uploadStatus, "Uploading...", false);
    setResult(uploadResult, null);

    const file = uploadFileInput.files && uploadFileInput.files[0];
    if (!file) {
      setStatus(uploadStatus, "Choose a file first.", true);
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
      setStatus(uploadStatus, "Upload successful.", false);
      uploadForm.reset();
    } catch (error) {
      if (error && error.status === 401) {
        await forceLogoutUi("Session expired. Log in again to continue.");
        return;
      }
      setStatus(uploadStatus, error.message || "Upload failed.", true);
    }
  });

  insertMediaBlockButton.addEventListener("click", () => {
    if (!lastUpload || !lastUpload.url || !lastUpload.mediaKind) {
      setStatus(uploadStatus, "Upload a file first.", true);
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

    setStatus(uploadStatus, "Added new media block from latest upload.", false);
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
    setStatus(postStatus, "Draft cleared.", false);
    setResult(postResult, null);
    renderBlockEditor();
    syncDraftOutputs();
  });

  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(postStatus, "Creating post...", false);
    setResult(postResult, null);

    const title = asText(postTitleInput.value);

    if (!title) {
      setStatus(postStatus, "Post title is required.", true);
      return;
    }

    if (draftBlocks.length === 0) {
      setStatus(postStatus, "Add at least one block before publishing.", true);
      return;
    }

    if (typeof window.normalizeClientBlock !== "function") {
      setStatus(postStatus, "Block validator unavailable. Reload the page and try again.", true);
      return;
    }

    const normalizedBlocks = [];
    for (let index = 0; index < draftBlocks.length; index += 1) {
      const normalized = normalizeDraftBlock(draftBlocks[index]);
      if (!normalized) {
        setStatus(
          postStatus,
          "Block " + (index + 1) + " is incomplete. Fill required fields before publishing.",
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
      setStatus(postStatus, "Post created successfully.", false);
    } catch (error) {
      if (error && error.status === 401) {
        await forceLogoutUi("Session expired. Log in again to continue.");
        return;
      }
      setStatus(postStatus, error.message || "Post creation failed.", true);
    }
  });

  postTitleInput.addEventListener("input", schedulePostPreviewRender);
  postTitleInput.addEventListener("change", schedulePostPreviewRender);

  renderBlockEditor();
  syncDraftOutputs();
  refreshSessionUi();
})();
