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
  const postStatus = document.getElementById("postStatus");
  const postResult = document.getElementById("postResult");

  if (!adminLoginForm || !uploadForm || !postForm) {
    return;
  }

  let lastUpload = null;

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
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

    let blocks = [];
    const currentValue = String(blocksInput.value || "").trim();

    if (currentValue) {
      try {
        const parsed = JSON.parse(currentValue);
        if (!Array.isArray(parsed)) {
          setStatus(uploadStatus, "Blocks JSON must be an array to insert media.", true);
          return;
        }
        blocks = parsed;
      } catch (error) {
        setStatus(uploadStatus, "Blocks JSON is invalid. Fix it before inserting.", true);
        return;
      }
    }

    const mediaBlock = {
      type: "media",
      mediaKind: lastUpload.mediaKind,
      src: lastUpload.url,
      name: asText(lastUpload.originalName) || deriveFileName(lastUpload.url)
    };

    blocks.push(mediaBlock);
    blocksInput.value = JSON.stringify(blocks, null, 2);
    setStatus(uploadStatus, "Media block inserted into JSON.", false);
  });

  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(postStatus, "Creating post...", false);
    setResult(postResult, null);

    const title = String(postTitleInput.value || "").trim();
    const blocksRaw = String(blocksInput.value || "").trim();

    if (!title) {
      setStatus(postStatus, "Post title is required.", true);
      return;
    }

    if (!blocksRaw) {
      setStatus(postStatus, "Blocks JSON is required.", true);
      return;
    }

    let blocks;
    try {
      blocks = JSON.parse(blocksRaw);
    } catch (error) {
      setStatus(postStatus, "Blocks JSON is invalid.", true);
      return;
    }

    if (!Array.isArray(blocks) || blocks.length === 0) {
      setStatus(postStatus, "Blocks must be a non-empty JSON array.", true);
      return;
    }

    try {
      const data = await requestJson("/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          blocks
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

  refreshSessionUi();
})();
