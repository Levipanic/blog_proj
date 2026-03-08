(function initAdminPage() {
  const secretInput = document.getElementById("adminSecretInput");
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

  if (!uploadForm || !postForm) {
    return;
  }

  let lastUpload = null;

  function getSecret() {
    return String(secretInput.value || "").trim();
  }

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function setStatus(element, message, isError) {
    element.textContent = message || "";
    element.classList.remove("status-error", "status-ok");
    if (message) {
      element.classList.add(isError ? "status-error" : "status-ok");
    }
  }

  function setResult(preElement, data) {
    preElement.textContent = data ? JSON.stringify(data, null, 2) : "";
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
    const response = await fetch(url, options);
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
      throw new Error(message + details);
    }

    return data;
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(uploadStatus, "Uploading...", false);
    setResult(uploadResult, null);

    const secret = getSecret();
    const file = uploadFileInput.files && uploadFileInput.files[0];

    if (!secret) {
      setStatus(uploadStatus, "Admin secret is required.", true);
      return;
    }

    if (!file) {
      setStatus(uploadStatus, "Choose a file first.", true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const data = await requestJson("/upload", {
        method: "POST",
        headers: {
          "x-admin-secret": secret
        },
        body: formData
      });

      lastUpload = data;
      setResult(uploadResult, data);
      setStatus(uploadStatus, "Upload successful.", false);
      uploadForm.reset();
    } catch (error) {
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

    const secret = getSecret();
    const title = String(postTitleInput.value || "").trim();
    const blocksRaw = String(blocksInput.value || "").trim();

    if (!secret) {
      setStatus(postStatus, "Admin secret is required.", true);
      return;
    }

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
          "Content-Type": "application/json",
          "x-admin-secret": secret
        },
        body: JSON.stringify({
          title,
          blocks
        })
      });

      setResult(postResult, data);
      setStatus(postStatus, "Post created successfully.", false);
    } catch (error) {
      setStatus(postStatus, error.message || "Post creation failed.", true);
    }
  });
})();
