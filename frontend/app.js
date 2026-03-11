function bootstrap() {
  const page = document.body && document.body.dataset ? document.body.dataset.page : "";
  const isPublicPage = page === "feed" || page === "post";

  if (isPublicPage) {
    initPersistentAudioUi();
    audioPlayback.restoreFromSession();
    initTopbarAdminUi().catch((error) => {
      console.error(error);
    });
  }

  if (page === "feed") {
    initFeedPage().catch((error) => {
      console.error(error);
      const statusEl = document.getElementById("feedStatus");
      if (statusEl) statusEl.textContent = t("feed.loadError", null, "Failed to load timeline.");
    });
    return;
  }

  if (page === "post") {
    initPostPage().catch((error) => {
      console.error(error);
      const postStatusEl = document.getElementById("postStatus");
      if (postStatusEl) postStatusEl.textContent = t("post.loadError", null, "Failed to load post.");
    });
  }
}

const BLOG_NAME = "StereoDamage";
const BLOG_HANDLE = "@stereodamage";
const PLACEHOLDER_IMAGE = "/uploads/missingno.png";
const ALLOWED_MEDIA_KINDS = new Set(["image", "gif", "video", "audio", "file"]);
const AUDIO_SESSION_STORAGE_KEY = "stereodamage_audio_session_v1";
const AUDIO_WAVEFORM_BAR_COUNT = 56;
const audioPlayback = createGlobalAudioPlayback();

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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : t("common.requestFailed", null, "Request failed.");
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

const adminUiState = {
  checked: false,
  authenticated: false
};

function setAdminUiState(authenticated) {
  const nextAuthenticated = Boolean(authenticated);
  const changed =
    !adminUiState.checked || adminUiState.authenticated !== nextAuthenticated;

  adminUiState.checked = true;
  adminUiState.authenticated = nextAuthenticated;

  if (changed) {
    window.dispatchEvent(
      new CustomEvent("adminauthchange", {
        detail: {
          authenticated: adminUiState.authenticated
        }
      })
    );
  }
}

function isAdminAuthenticated() {
  return Boolean(adminUiState.checked && adminUiState.authenticated);
}

async function refreshAdminUiState() {
  try {
    const session = await fetchJson("/admin/session");
    setAdminUiState(Boolean(session && session.authenticated));
  } catch (error) {
    setAdminUiState(false);
  }
  return isAdminAuthenticated();
}

async function initTopbarAdminUi() {
  const adminEntryLink = document.getElementById("adminEntryLink");
  const adminLogoutButton = document.getElementById("adminLogoutButton");

  if (!adminEntryLink && !adminLogoutButton) {
    return;
  }

  function applyAdminUi(authenticated) {
    setAdminUiState(authenticated);

    if (adminEntryLink) {
      adminEntryLink.textContent = authenticated
        ? t("nav.adminPanel", null, "Admin Panel")
        : t("nav.admin", null, "Admin");
    }
    if (adminLogoutButton) {
      adminLogoutButton.hidden = !authenticated;
    }
  }

  async function refreshAdminUi() {
    const authenticated = await refreshAdminUiState();
    applyAdminUi(authenticated);
  }

  if (adminLogoutButton) {
    adminLogoutButton.addEventListener("click", async () => {
      adminLogoutButton.disabled = true;

      try {
        await fetchJson("/admin/logout", { method: "POST" });
        applyAdminUi(false);
      } catch (error) {
        console.error(error);
      } finally {
        adminLogoutButton.disabled = false;
      }
    });
  }

  await refreshAdminUi();
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return dateString;
  const language =
    window.i18n && typeof window.i18n.getLanguage === "function" ? window.i18n.getLanguage() : "en";
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return date.toLocaleString(locale);
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
  if (!safeSrc) return t("common.file", null, "file");

  const parts = safeSrc.split("/");
  const lastPart = parts[parts.length - 1] || t("common.file", null, "file");

  try {
    return decodeURIComponent(lastPart);
  } catch (error) {
    return lastPart;
  }
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

function formatAudioTime(secondsValue) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }

  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const tailSeconds = rounded % 60;
  const paddedSeconds = String(tailSeconds).padStart(2, "0");

  if (hours > 0) {
    return hours + ":" + String(minutes).padStart(2, "0") + ":" + paddedSeconds;
  }

  return minutes + ":" + paddedSeconds;
}

function getPointerFraction(event, targetElement) {
  if (!targetElement) return 0;
  const rect = targetElement.getBoundingClientRect();
  if (!rect || rect.width <= 0) return 0;
  const pointerX = typeof event.clientX === "number" ? event.clientX : rect.left;
  return clamp01((pointerX - rect.left) / rect.width);
}

function createAudioTrackDescriptor(rawTrack) {
  const src = safeMediaSrc(rawTrack && rawTrack.src);
  if (!src) return null;

  const fallbackTitle = t("audio.trackFallback", null, "Audio attachment");
  const title = asText(rawTrack && rawTrack.title) || deriveFileNameFromSrc(src) || fallbackTitle;

  return {
    id: "audio:" + src,
    src,
    title
  };
}

function decodeAudioArrayBuffer(audioContext, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function resolveOnce(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      reject(error || new Error("Failed to decode audio."));
    }

    try {
      const copied = arrayBuffer.slice(0);
      const maybePromise = audioContext.decodeAudioData(copied, resolveOnce, rejectOnce);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolveOnce).catch(rejectOnce);
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function buildWaveformBarsFromAudio(audioBuffer, barCount) {
  if (!audioBuffer || typeof audioBuffer.length !== "number" || audioBuffer.length <= 0) {
    return [];
  }

  const safeBarCount = Math.max(16, Number(barCount) || AUDIO_WAVEFORM_BAR_COUNT);
  const totalSamples = audioBuffer.length;
  const channels = [];

  for (let index = 0; index < audioBuffer.numberOfChannels; index += 1) {
    channels.push(audioBuffer.getChannelData(index));
  }

  if (channels.length === 0) {
    return [];
  }

  const samplesPerBar = Math.max(1, Math.floor(totalSamples / safeBarCount));
  const rawBars = [];
  const samplesPerWindow = 512;

  for (let barIndex = 0; barIndex < safeBarCount; barIndex += 1) {
    const start = barIndex * samplesPerBar;
    if (start >= totalSamples) {
      rawBars.push(0);
      continue;
    }

    const end = barIndex === safeBarCount - 1 ? totalSamples : Math.min(totalSamples, start + samplesPerBar);
    let peak = 0;

    const sampleWindowSize = Math.max(1, end - start);
    const sampleStep = Math.max(1, Math.floor(sampleWindowSize / samplesPerWindow));

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += sampleStep) {
      let samplePeak = 0;
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        const sampleValue = Math.abs(channels[channelIndex][sampleIndex] || 0);
        if (sampleValue > samplePeak) {
          samplePeak = sampleValue;
        }
      }
      if (samplePeak > peak) {
        peak = samplePeak;
      }
    }

    rawBars.push(peak);
  }

  const maxPeak = Math.max(...rawBars, 0);
  if (maxPeak <= 0) {
    return rawBars.map(() => 0.06);
  }

  return rawBars.map((value) => Math.max(0.06, Math.pow(value / maxPeak, 0.7)));
}

function createGlobalAudioPlayback() {
  const audioElement = new Audio();
  audioElement.preload = "metadata";

  const listeners = new Set();
  const waveformCache = new Map();
  const waveformRequests = new Map();

  let waveformContext = null;
  let lastPersistWriteAt = 0;
  let lastPersistSignature = "";
  let emitScheduled = false;
  let pendingForcePersist = false;
  let state = {
    trackId: "",
    src: "",
    title: "",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    metadataStatus: "idle",
    errorMessage: ""
  };

  function clearPersistedPlayback() {
    try {
      sessionStorage.removeItem(AUDIO_SESSION_STORAGE_KEY);
    } catch (error) {
      return;
    }
  }

  function persistPlaybackState(snapshot, force) {
    if (!snapshot || !snapshot.src) {
      clearPersistedPlayback();
      lastPersistSignature = "";
      lastPersistWriteAt = 0;
      return;
    }

    const roundedTime = Math.round(Number(snapshot.currentTime || 0) * 4) / 4;
    const roundedDuration = Math.round(Number(snapshot.duration || 0) * 4) / 4;
    const signature = [
      snapshot.src,
      snapshot.isPlaying ? "1" : "0",
      String(roundedTime),
      String(roundedDuration)
    ].join("|");

    const now = Date.now();
    const minIntervalMs = snapshot.isPlaying ? 550 : 200;
    if (!force) {
      if (signature === lastPersistSignature) {
        if (now - lastPersistWriteAt < minIntervalMs) {
          return;
        }
      } else if (snapshot.isPlaying && now - lastPersistWriteAt < minIntervalMs) {
        return;
      }
    }

    try {
      sessionStorage.setItem(
        AUDIO_SESSION_STORAGE_KEY,
        JSON.stringify({
          src: snapshot.src,
          title: snapshot.title,
          currentTime: roundedTime,
          duration: roundedDuration,
          isPlaying: snapshot.isPlaying,
          savedAt: now
        })
      );
      lastPersistSignature = signature;
      lastPersistWriteAt = now;
    } catch (error) {
      return;
    }
  }

  function readPersistedPlayback() {
    try {
      const raw = sessionStorage.getItem(AUDIO_SESSION_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;

      const src = safeMediaSrc(parsed.src);
      if (!src) return null;

      return {
        src,
        title: asText(parsed.title),
        currentTime: Number(parsed.currentTime),
        duration: Number(parsed.duration),
        isPlaying: Boolean(parsed.isPlaying)
      };
    } catch (error) {
      return null;
    }
  }

  function getWaveformEntry(src) {
    const safeSrc = safeMediaSrc(src);
    if (!safeSrc) {
      return {
        status: "error",
        bars: [],
        duration: 0,
        error: t("audio.waveformFallback", null, "Waveform unavailable. Showing progress bar.")
      };
    }
    return (
      waveformCache.get(safeSrc) || {
        status: "idle",
        bars: [],
        duration: 0,
        error: ""
      }
    );
  }

  function getReadableDuration() {
    if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
      return audioElement.duration;
    }
    if (Number.isFinite(state.duration) && state.duration > 0) {
      return state.duration;
    }
    return 0;
  }

  function rememberDuration(src, durationSeconds) {
    const safeSrc = safeMediaSrc(src);
    if (!safeSrc || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return;
    }

    const previous = getWaveformEntry(safeSrc);
    waveformCache.set(safeSrc, {
      status: previous.status,
      bars: previous.bars,
      duration: durationSeconds,
      error: previous.error
    });
  }

  function getActiveState() {
    if (!state.src) return null;

    const waveform = getWaveformEntry(state.src);
    const duration = state.duration > 0 ? state.duration : waveform.duration || 0;
    const currentTime = Math.min(state.currentTime, duration || state.currentTime);

    return {
      trackId: state.trackId,
      src: state.src,
      title: state.title,
      isPlaying: state.isPlaying,
      currentTime,
      duration,
      progress: duration > 0 ? clamp01(currentTime / duration) : 0,
      metadataStatus: state.metadataStatus,
      errorMessage: state.errorMessage,
      waveformStatus: waveform.status,
      waveformBars: waveform.bars,
      waveformError: waveform.error || ""
    };
  }

  function dispatchSnapshot(snapshot, forcePersist) {
    persistPlaybackState(snapshot, forcePersist);
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function emit(options) {
    pendingForcePersist = pendingForcePersist || Boolean(options && options.forcePersist);
    if (emitScheduled) {
      return;
    }

    emitScheduled = true;
    const flush = () => {
      emitScheduled = false;
      const snapshot = getActiveState();
      const forcePersist = pendingForcePersist;
      pendingForcePersist = false;
      dispatchSnapshot(snapshot, forcePersist);
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(flush);
    } else {
      setTimeout(flush, 0);
    }
  }

  async function buildWaveformForSrc(src) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error("Waveform fetch failed.");
    }

    const sourceArrayBuffer = await response.arrayBuffer();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext is unavailable.");
    }

    if (!waveformContext) {
      waveformContext = new AudioContextCtor();
    }

    const decoded = await decodeAudioArrayBuffer(waveformContext, sourceArrayBuffer);
    const bars = buildWaveformBarsFromAudio(decoded, AUDIO_WAVEFORM_BAR_COUNT);

    return {
      bars,
      duration: Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : 0
    };
  }

  function ensureWaveform(src) {
    const safeSrc = safeMediaSrc(src);
    if (!safeSrc) {
      return;
    }

    if (waveformRequests.has(safeSrc)) {
      return;
    }

    const existing = waveformCache.get(safeSrc);
    if (existing && (existing.status === "ready" || existing.status === "error")) {
      return;
    }

    waveformCache.set(safeSrc, {
      status: "loading",
      bars: existing ? existing.bars : [],
      duration: existing && existing.duration ? existing.duration : 0,
      error: ""
    });
    emit();

    const request = buildWaveformForSrc(safeSrc)
      .then((waveform) => {
        waveformCache.set(safeSrc, {
          status: "ready",
          bars: waveform.bars,
          duration: waveform.duration,
          error: ""
        });
        emit();
      })
      .catch(() => {
        const previous = waveformCache.get(safeSrc);
        waveformCache.set(safeSrc, {
          status: "error",
          bars: [],
          duration: previous && previous.duration ? previous.duration : 0,
          error: t("audio.waveformFallback", null, "Waveform unavailable. Showing progress bar.")
        });
        emit();
      })
      .finally(() => {
        waveformRequests.delete(safeSrc);
      });

    waveformRequests.set(safeSrc, request);
  }

  function applyTrack(rawTrack) {
    const track = createAudioTrackDescriptor(rawTrack);
    if (!track) {
      return null;
    }

    const srcChanged = state.src !== track.src;
    const titleChanged = state.title !== track.title;

    if (srcChanged) {
      audioElement.pause();
      state = {
        trackId: track.id,
        src: track.src,
        title: track.title,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        metadataStatus: "loading",
        errorMessage: ""
      };
      audioElement.src = track.src;
      audioElement.load();
      ensureWaveform(track.src);
      emit();
      return track;
    }

    if (titleChanged) {
      state.title = track.title;
      emit();
    }

    ensureWaveform(track.src);
    return track;
  }

  async function play(rawTrack) {
    const track = applyTrack(rawTrack);
    if (!track) return false;

    try {
      await audioElement.play();
      return true;
    } catch (error) {
      state.isPlaying = false;
      state.errorMessage = t("audio.playFailed", null, "Unable to start playback.");
      emit();
      return false;
    }
  }

  async function resume() {
    if (!state.src) return false;

    try {
      await audioElement.play();
      return true;
    } catch (error) {
      state.isPlaying = false;
      state.errorMessage = t("audio.playFailed", null, "Unable to start playback.");
      emit();
      return false;
    }
  }

  function pause() {
    if (!state.src) return;
    audioElement.pause();
  }

  async function toggle(rawTrack) {
    const track = createAudioTrackDescriptor(rawTrack);
    if (!track) return false;

    if (state.src && state.src === track.src) {
      if (state.isPlaying) {
        pause();
        return true;
      }
      return resume();
    }

    return play(track);
  }

  function stopAndClear() {
    audioElement.pause();
    audioElement.removeAttribute("src");
    audioElement.load();
    state = {
      trackId: "",
      src: "",
      title: "",
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      metadataStatus: "idle",
      errorMessage: ""
    };
    clearPersistedPlayback();
    emit();
  }

  function seekToFraction(rawFraction) {
    if (!state.src) return;
    const duration = getReadableDuration();
    if (duration <= 0) return;

    const targetTime = clamp01(rawFraction) * duration;
    audioElement.currentTime = targetTime;
    state.currentTime = targetTime;
    emit();
  }

  function getTrackState(rawTrack) {
    const track = createAudioTrackDescriptor(rawTrack);
    if (!track) {
      const unavailableMessage = t("audio.unavailable", null, "Audio unavailable.");
      return {
        track: null,
        isActive: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        progress: 0,
        metadataStatus: "error",
        errorMessage: unavailableMessage,
        waveformStatus: "error",
        waveformBars: [],
        waveformError: unavailableMessage
      };
    }

    const waveform = getWaveformEntry(track.src);
    const isActive = state.src === track.src;
    const duration = isActive && state.duration > 0 ? state.duration : waveform.duration || 0;
    const currentTime = isActive ? Math.min(state.currentTime, duration || state.currentTime) : 0;

    return {
      track,
      isActive,
      isPlaying: isActive && state.isPlaying,
      currentTime,
      duration,
      progress: duration > 0 ? clamp01(currentTime / duration) : 0,
      metadataStatus: isActive ? state.metadataStatus : duration > 0 ? "ready" : "idle",
      errorMessage: isActive ? state.errorMessage : "",
      waveformStatus: waveform.status,
      waveformBars: waveform.bars,
      waveformError: waveform.error || ""
    };
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners.add(listener);
    listener(getActiveState());
    return () => {
      listeners.delete(listener);
    };
  }

  function restoreFromSession() {
    if (state.src) {
      return;
    }

    const persisted = readPersistedPlayback();
    if (!persisted || !persisted.src) {
      return;
    }

    const restoredTrack = createAudioTrackDescriptor({
      src: persisted.src,
      title: persisted.title
    });

    if (!restoredTrack) {
      clearPersistedPlayback();
      return;
    }

    state = {
      trackId: restoredTrack.id,
      src: restoredTrack.src,
      title: restoredTrack.title,
      isPlaying: false,
      currentTime: Number.isFinite(persisted.currentTime) && persisted.currentTime > 0 ? persisted.currentTime : 0,
      duration: Number.isFinite(persisted.duration) && persisted.duration > 0 ? persisted.duration : 0,
      metadataStatus: "loading",
      errorMessage: ""
    };

    audioElement.src = restoredTrack.src;
    audioElement.load();
    ensureWaveform(restoredTrack.src);
    emit();

    const applyRestoredPositionAndPlay = () => {
      if (state.src !== restoredTrack.src) {
        return;
      }

      if (Number.isFinite(persisted.currentTime) && persisted.currentTime > 0) {
        const duration = getReadableDuration();
        const safeTime =
          duration > 0
            ? Math.min(persisted.currentTime, Math.max(0, duration - 0.05))
            : Math.max(0, persisted.currentTime);

        try {
          audioElement.currentTime = safeTime;
          state.currentTime = safeTime;
          emit();
        } catch (error) {
          return;
        }
      }

      if (persisted.isPlaying) {
        audioElement.play().catch(() => {
          state.isPlaying = false;
          emit();
        });
      }
    };

    if (audioElement.readyState >= 1) {
      applyRestoredPositionAndPlay();
    } else {
      audioElement.addEventListener("loadedmetadata", applyRestoredPositionAndPlay, { once: true });
    }
  }

  audioElement.addEventListener("loadedmetadata", () => {
    const duration = getReadableDuration();
    state.duration = duration;
    if (state.metadataStatus !== "error") {
      state.metadataStatus = duration > 0 ? "ready" : "loading";
    }
    rememberDuration(state.src, duration);
    emit();
  });

  audioElement.addEventListener("durationchange", () => {
    const duration = getReadableDuration();
    state.duration = duration;
    if (state.metadataStatus !== "error" && duration > 0) {
      state.metadataStatus = "ready";
    }
    rememberDuration(state.src, duration);
    emit();
  });

  audioElement.addEventListener("timeupdate", () => {
    if (!state.src) return;
    state.currentTime = Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0;
    emit();
  });

  audioElement.addEventListener("play", () => {
    state.isPlaying = true;
    state.errorMessage = "";
    emit();
  });

  audioElement.addEventListener("pause", () => {
    state.isPlaying = false;
    emit();
  });

  audioElement.addEventListener("ended", () => {
    state.isPlaying = false;
    state.currentTime = getReadableDuration();
    emit();
  });

  audioElement.addEventListener("error", () => {
    state.isPlaying = false;
    state.metadataStatus = "error";
    state.errorMessage = t("audio.unavailable", null, "Audio unavailable.");
    emit();
  });

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      persistPlaybackState(getActiveState(), true);
    });
  }

  return {
    ensureWaveform,
    subscribe,
    getTrackState,
    getActiveState,
    play,
    pause,
    resume,
    toggle,
    seekToFraction,
    stopAndClear,
    restoreFromSession
  };
}

function observeElementDisconnect(element, onDisconnect) {
  if (!element || typeof onDisconnect !== "function" || typeof MutationObserver !== "function") {
    return () => {};
  }

  const root = document.body;
  if (!root) {
    return () => {};
  }

  let wasConnected = root.contains(element);
  let disconnected = false;

  const observer = new MutationObserver(() => {
    if (disconnected) return;
    const isConnected = root.contains(element);

    if (!wasConnected) {
      wasConnected = isConnected;
      return;
    }

    if (!isConnected) {
      disconnected = true;
      observer.disconnect();
      onDisconnect();
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });

  return () => {
    disconnected = true;
    observer.disconnect();
  };
}

function renderWaveformBars(container, bars) {
  container.innerHTML = "";

  if (!Array.isArray(bars) || bars.length === 0) {
    return;
  }

  bars.forEach((barValue) => {
    const bar = document.createElement("span");
    bar.className = "audio-waveform-bar";
    const heightPercent = Math.round(Math.max(0.06, Math.min(1, Number(barValue) || 0.06)) * 100);
    bar.style.setProperty("--bar-height", heightPercent + "%");
    container.appendChild(bar);
  });
}

function updateWaveformProgress(container, progress) {
  const bars = Array.from(container.children);
  if (bars.length === 0) return;

  const threshold = clamp01(progress);
  bars.forEach((bar, index) => {
    const ratio = (index + 1) / bars.length;
    bar.classList.toggle("is-played", ratio <= threshold);
  });
}

function renderAudioMediaBlock(block, src, captionText) {
  const track = createAudioTrackDescriptor({
    src,
    title: asText(block.name) || deriveFileNameFromSrc(src)
  });
  if (!track) return null;

  const figure = document.createElement("figure");
  figure.className = "post-media";

  const card = document.createElement("section");
  card.className = "post-audio-card";
  figure.appendChild(card);

  const head = document.createElement("div");
  head.className = "audio-player-head";
  card.appendChild(head);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "audio-play-toggle";
  head.appendChild(toggleButton);

  const meta = document.createElement("div");
  meta.className = "audio-meta";
  head.appendChild(meta);

  const title = document.createElement("p");
  title.className = "audio-title";
  title.textContent = track.title;
  meta.appendChild(title);

  const durationBadge = document.createElement("span");
  durationBadge.className = "audio-duration-badge";
  durationBadge.textContent = "--:--";
  head.appendChild(durationBadge);

  const waveformButton = document.createElement("button");
  waveformButton.type = "button";
  waveformButton.className = "audio-waveform-button";
  waveformButton.setAttribute("aria-label", t("audio.seekAria", null, "Seek playback position"));
  card.appendChild(waveformButton);

  const waveformBars = document.createElement("div");
  waveformBars.className = "audio-waveform-bars";
  waveformButton.appendChild(waveformBars);

  const fallbackProgress = document.createElement("div");
  fallbackProgress.className = "audio-fallback-progress";
  const fallbackFill = document.createElement("span");
  fallbackFill.className = "audio-fallback-progress-fill";
  fallbackProgress.appendChild(fallbackFill);
  waveformButton.appendChild(fallbackProgress);

  const foot = document.createElement("div");
  foot.className = "audio-player-foot";
  card.appendChild(foot);

  const timeLabel = document.createElement("span");
  timeLabel.className = "audio-time-label";
  timeLabel.textContent = "--:-- / --:--";
  foot.appendChild(timeLabel);

  const statusLabel = document.createElement("span");
  statusLabel.className = "audio-status-label";
  foot.appendChild(statusLabel);

  if (captionText) {
    const figcaption = document.createElement("figcaption");
    figcaption.className = "post-caption";
    figcaption.textContent = captionText;
    figure.appendChild(figcaption);
  }

  let lastWaveformStatus = "";
  let lastWaveformBars = null;
  let lastRenderKey = "";
  let lastPlayedBarCount = -1;
  let waveformRequested = false;
  let stopWatchingVisibility = () => {};

  function requestWaveform() {
    if (waveformRequested) {
      return;
    }
    waveformRequested = true;
    audioPlayback.ensureWaveform(track.src);
  }

  function watchWaveformVisibility() {
    if (waveformRequested || typeof IntersectionObserver !== "function") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!Array.isArray(entries) || entries.length === 0) {
          return;
        }

        if (entries.some((entry) => entry.isIntersecting)) {
          requestWaveform();
          observer.disconnect();
          stopWatchingVisibility = () => {};
        }
      },
      {
        root: null,
        rootMargin: "180px 0px",
        threshold: 0.01
      }
    );

    observer.observe(figure);
    stopWatchingVisibility = () => {
      observer.disconnect();
      stopWatchingVisibility = () => {};
    };
  }

  function buildRenderKey(trackState) {
    const durationBucket = Math.round((trackState.duration || 0) * 2) / 2;
    const timeBucket = trackState.isActive ? Math.round((trackState.currentTime || 0) * 12) / 12 : 0;
    return [
      trackState.isActive ? "1" : "0",
      trackState.isPlaying ? "1" : "0",
      trackState.metadataStatus,
      trackState.errorMessage || "",
      trackState.waveformStatus,
      String(trackState.waveformBars.length),
      String(durationBucket),
      String(timeBucket)
    ].join("|");
  }

  function updateWaveformProgressFast(progress) {
    const bars = waveformBars.children;
    const total = bars.length;
    if (total === 0) {
      lastPlayedBarCount = -1;
      return;
    }

    const nextPlayedCount = Math.max(0, Math.min(total, Math.round(clamp01(progress) * total)));
    if (nextPlayedCount === lastPlayedBarCount) {
      return;
    }

    if (lastPlayedBarCount < 0) {
      for (let index = 0; index < total; index += 1) {
        bars[index].classList.toggle("is-played", index < nextPlayedCount);
      }
      lastPlayedBarCount = nextPlayedCount;
      return;
    }

    if (nextPlayedCount > lastPlayedBarCount) {
      for (let index = lastPlayedBarCount; index < nextPlayedCount; index += 1) {
        bars[index].classList.add("is-played");
      }
    } else {
      for (let index = nextPlayedCount; index < lastPlayedBarCount; index += 1) {
        bars[index].classList.remove("is-played");
      }
    }

    lastPlayedBarCount = nextPlayedCount;
  }

  function updateUi() {
    const trackState = audioPlayback.getTrackState(track);
    const renderKey = buildRenderKey(trackState);
    if (renderKey === lastRenderKey) {
      return;
    }
    lastRenderKey = renderKey;

    const isPlaying = Boolean(trackState.isActive && trackState.isPlaying);

    card.classList.toggle("is-active", Boolean(trackState.isActive));
    card.classList.toggle("is-playing", isPlaying);

    toggleButton.textContent = isPlaying ? "❚❚" : "▶";
    toggleButton.setAttribute(
      "aria-label",
      isPlaying
        ? t("audio.pauseAria", null, "Pause audio playback")
        : t("audio.playAria", null, "Play audio")
    );
    toggleButton.title = isPlaying ? t("audio.pause", null, "Pause") : t("audio.play", null, "Play");

    durationBadge.textContent = formatAudioTime(trackState.duration);
    timeLabel.textContent =
      formatAudioTime(trackState.currentTime) + " / " + formatAudioTime(trackState.duration);

    const progressPercent = clamp01(trackState.progress) * 100;
    fallbackFill.style.width = progressPercent.toFixed(2) + "%";

    if (
      trackState.waveformStatus !== lastWaveformStatus ||
      trackState.waveformBars !== lastWaveformBars
    ) {
      if (trackState.waveformStatus === "ready" && trackState.waveformBars.length > 0) {
        renderWaveformBars(waveformBars, trackState.waveformBars);
        lastPlayedBarCount = -1;
      } else {
        waveformBars.innerHTML = "";
        lastPlayedBarCount = -1;
      }

      lastWaveformStatus = trackState.waveformStatus;
      lastWaveformBars = trackState.waveformBars;
    }

    const waveformReady = trackState.waveformStatus === "ready" && trackState.waveformBars.length > 0;
    waveformButton.classList.toggle("is-fallback", !waveformReady);
    fallbackProgress.hidden = waveformReady;
    updateWaveformProgressFast(trackState.progress);

    if (trackState.metadataStatus === "error") {
      statusLabel.textContent =
        trackState.errorMessage || t("audio.unavailable", null, "Audio unavailable.");
      card.classList.add("is-error");
    } else if (trackState.metadataStatus === "loading" && trackState.isActive) {
      statusLabel.textContent = t("audio.loadingMetadata", null, "Loading audio...");
      card.classList.remove("is-error");
    } else if (trackState.waveformStatus === "loading") {
      statusLabel.textContent = t("audio.preparingWaveform", null, "Preparing waveform...");
      card.classList.remove("is-error");
    } else if (trackState.waveformStatus === "error") {
      statusLabel.textContent = t(
        "audio.waveformFallback",
        null,
        "Waveform unavailable. Showing progress bar."
      );
      card.classList.remove("is-error");
    } else {
      statusLabel.textContent = "";
      card.classList.remove("is-error");
    }
  }

  toggleButton.addEventListener("click", () => {
    requestWaveform();
    audioPlayback.toggle(track);
  });

  waveformButton.addEventListener("click", (event) => {
    requestWaveform();
    const fraction = getPointerFraction(event, waveformButton);
    const trackState = audioPlayback.getTrackState(track);

    if (!trackState.isActive) {
      audioPlayback.play(track).then(() => {
        audioPlayback.seekToFraction(fraction);
      });
      return;
    }

    audioPlayback.seekToFraction(fraction);
  });
  watchWaveformVisibility();

  const unsubscribe = audioPlayback.subscribe(() => {
    updateUi();
  });

  const stopObserving = observeElementDisconnect(figure, () => {
    unsubscribe();
    stopWatchingVisibility();
    stopObserving();
  });

  updateUi();
  return figure;
}

let persistentAudioUiInitialized = false;

function initPersistentAudioUi() {
  if (persistentAudioUiInitialized) return;
  persistentAudioUiInitialized = true;

  const body = document.body;
  if (!body) {
    return;
  }

  const miniPlayer = document.createElement("section");
  miniPlayer.className = "mini-audio-player";
  miniPlayer.hidden = true;

  const mainRow = document.createElement("div");
  mainRow.className = "mini-audio-main";
  miniPlayer.appendChild(mainRow);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "mini-audio-toggle";
  mainRow.appendChild(toggleButton);

  const meta = document.createElement("div");
  meta.className = "mini-audio-meta";
  mainRow.appendChild(meta);

  const title = document.createElement("p");
  title.className = "mini-audio-title";
  meta.appendChild(title);

  const time = document.createElement("p");
  time.className = "mini-audio-time";
  meta.appendChild(time);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "mini-audio-close";
  closeButton.setAttribute("aria-label", t("audio.closePlayer", null, "Close player"));
  closeButton.textContent = "x";
  mainRow.appendChild(closeButton);

  const progressButton = document.createElement("button");
  progressButton.type = "button";
  progressButton.className = "mini-audio-progress";
  progressButton.setAttribute("aria-label", t("audio.seekAria", null, "Seek playback position"));
  miniPlayer.appendChild(progressButton);

  const progressFill = document.createElement("span");
  progressFill.className = "mini-audio-progress-fill";
  progressButton.appendChild(progressFill);

  body.appendChild(miniPlayer);

  let activeState = null;
  let lastMiniRenderKey = "";

  function resetMiniPlayerUi() {
    title.textContent = t("audio.trackFallback", null, "Audio attachment");
    time.textContent = "--:-- / --:--";
    progressFill.style.width = "0";
    progressButton.disabled = true;
    toggleButton.textContent = "▶";
    toggleButton.setAttribute("aria-label", t("audio.playAria", null, "Play audio"));
    toggleButton.title = t("audio.play", null, "Play");
    miniPlayer.classList.remove("is-error");
  }

  function updateMiniPlayer(snapshot) {
    activeState = snapshot;
    const hasMeaningfulProgress =
      Boolean(snapshot) &&
      Number.isFinite(snapshot.currentTime) &&
      snapshot.currentTime > 0.05 &&
      (!Number.isFinite(snapshot.duration) || snapshot.duration <= 0 || snapshot.currentTime < snapshot.duration - 0.05);
    const shouldShowPlayer = Boolean(snapshot && snapshot.src && (snapshot.isPlaying || hasMeaningfulProgress));

    if (!shouldShowPlayer) {
      resetMiniPlayerUi();
      miniPlayer.hidden = true;
      body.classList.remove("has-mini-audio-player");
      lastMiniRenderKey = "";
      return;
    }

    const renderKey = [
      snapshot.src,
      snapshot.isPlaying ? "1" : "0",
      String(Math.round((snapshot.currentTime || 0) * 8) / 8),
      String(Math.round((snapshot.duration || 0) * 2) / 2),
      snapshot.metadataStatus || ""
    ].join("|");

    if (renderKey === lastMiniRenderKey) {
      return;
    }
    lastMiniRenderKey = renderKey;

    miniPlayer.hidden = false;
    body.classList.add("has-mini-audio-player");

    title.textContent = snapshot.title || t("audio.trackFallback", null, "Audio attachment");
    time.textContent = formatAudioTime(snapshot.currentTime) + " / " + formatAudioTime(snapshot.duration);
    progressFill.style.width = (clamp01(snapshot.progress) * 100).toFixed(2) + "%";
    progressButton.disabled = !(snapshot.duration > 0);

    const playing = Boolean(snapshot.isPlaying);
    toggleButton.textContent = playing ? "❚❚" : "▶";
    toggleButton.setAttribute(
      "aria-label",
      playing
        ? t("audio.pauseAria", null, "Pause audio playback")
        : t("audio.playAria", null, "Play audio")
    );
    toggleButton.title = playing ? t("audio.pause", null, "Pause") : t("audio.play", null, "Play");

    miniPlayer.classList.toggle("is-error", snapshot.metadataStatus === "error");
  }

  toggleButton.addEventListener("click", () => {
    if (!activeState || !activeState.src) return;
    if (activeState.isPlaying) {
      audioPlayback.pause();
      return;
    }
    audioPlayback.resume();
  });

  closeButton.addEventListener("click", () => {
    activeState = null;
    resetMiniPlayerUi();
    miniPlayer.hidden = true;
    body.classList.remove("has-mini-audio-player");
    lastMiniRenderKey = "";
    audioPlayback.stopAndClear();
  });

  progressButton.addEventListener("click", (event) => {
    if (!activeState || !(activeState.duration > 0)) return;
    const fraction = getPointerFraction(event, progressButton);
    audioPlayback.seekToFraction(fraction);
  });

  audioPlayback.subscribe((snapshot) => {
    updateMiniPlayer(snapshot);
  });
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
  return t("feed.likeCount", { count: likes }, likes + " like" + (likes === 1 ? "" : "s"));
}

async function deletePostAsAdmin(postId) {
  return fetchJson("/posts/" + encodeURIComponent(postId), {
    method: "DELETE"
  });
}

async function deleteCommentAsAdmin(commentId) {
  return fetchJson("/comments/" + encodeURIComponent(commentId), {
    method: "DELETE"
  });
}

function createAdminDeleteButton({ label, ariaLabel, title, confirmText, onDelete, onError }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-delete-button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel || label);
  button.title = title || label;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (button.disabled) {
      return;
    }

    if (!window.confirm(confirmText)) {
      return;
    }

    button.disabled = true;

    try {
      await onDelete();
    } catch (error) {
      if (typeof onError === "function") {
        onError(error);
      } else {
        window.alert(translateErrorMessage(error, "common.requestFailed", "Request failed."));
      }
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function createPostDeleteButton(postId, onDeleted, onError) {
  return createAdminDeleteButton({
    label: t("admin.deletePost", null, "Delete post"),
    ariaLabel: t("admin.deletePostAria", { id: postId }, "Delete post #" + String(postId)),
    title: t("admin.deletePost", null, "Delete post"),
    confirmText: t("admin.confirmDeletePost", null, "Delete this post and all its comments?"),
    onDelete: async () => {
      await deletePostAsAdmin(postId);
      if (typeof onDeleted === "function") {
        await onDeleted();
      }
    },
    onError
  });
}

function createCommentDeleteButton(commentId, onDeleted, onError) {
  return createAdminDeleteButton({
    label: t("admin.deleteComment", null, "Delete comment"),
    ariaLabel: t("admin.deleteCommentAria", { id: commentId }, "Delete comment #" + String(commentId)),
    title: t("admin.deleteComment", null, "Delete comment"),
    confirmText: t("admin.confirmDeleteComment", null, "Delete this comment?"),
    onDelete: async () => {
      await deleteCommentAsAdmin(commentId);
      if (typeof onDeleted === "function") {
        await onDeleted();
      }
    },
    onError
  });
}

function createLikeControl(postId, initialLikes) {
  const wrap = document.createElement("div");
  wrap.className = "like-row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "like-button";
  button.textContent = t("feed.like", null, "Like");
  button.setAttribute("aria-label", t("feed.likeAria", null, "Like this post"));
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
    status.textContent = t("feed.sending", null, "Sending...");

    try {
      const result = await fetchJson("/posts/" + encodeURIComponent(postId) + "/like", {
        method: "POST"
      });
      likes = normalizeLikeCount(result && result.likes);
      count.textContent = formatLikeText(likes);
      const successMessage = t("feed.likeSuccess", null, "Thanks! Like saved.");
      status.textContent = successMessage;

      window.setTimeout(() => {
        if (status.textContent === successMessage) {
          status.textContent = "";
        }
      }, 1800);
    } catch (error) {
      if (error && error.status === 429) {
        status.textContent = translateErrorMessage(
          error,
          "feed.likeTooFast",
          "Please wait before liking again."
        );
      } else if (error && error.status === 404) {
        status.textContent = t("feed.likeMissing", null, "This post no longer exists.");
      } else {
        status.textContent = translateErrorMessage(error, "feed.likeError", "Failed to save like.");
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

function createFeedMediaBadge(labelText, detailText) {
  const wrap = document.createElement("div");
  wrap.className = "feed-media-badge";

  const label = document.createElement("span");
  label.className = "feed-media-badge-label";
  label.textContent = labelText;
  wrap.appendChild(label);

  if (detailText) {
    const detail = document.createElement("span");
    detail.className = "feed-media-badge-name";
    detail.textContent = detailText;
    wrap.appendChild(detail);
  }

  return wrap;
}

function renderFeedPreviewMedia(post) {
  if (!post || !post.preview_media || typeof post.preview_media !== "object") {
    return null;
  }

  const src = safeMediaSrc(post.preview_media.src);
  const mediaKind = asText(post.preview_media.mediaKind);
  if (!src || !ALLOWED_MEDIA_KINDS.has(mediaKind)) {
    return null;
  }

  if (mediaKind === "image" || mediaKind === "gif") {
    const image = document.createElement("img");
    image.className = "tweet-thumb";
    image.src = src;
    image.alt =
      asText(post.preview_media.alt) || asText(post.title) || t("common.postMedia", null, "Post media");
    attachPlaceholderFallback(image);
    return image;
  }

  if (mediaKind === "audio") {
    const audioBlock = {
      type: "media",
      mediaKind: "audio",
      src,
      name:
        asText(post.preview_media.name) ||
        asText(post.title) ||
        t("audio.trackFallback", null, "Audio attachment"),
      caption: ""
    };

    const audioPreview = renderAudioMediaBlock(audioBlock, src, "");
    if (audioPreview) {
      audioPreview.classList.add("feed-audio-preview");
      return audioPreview;
    }
  }

  if (mediaKind === "video") {
    const videoName = asText(post.preview_media.name) || "";
    return createFeedMediaBadge(
      t("feed.mediaVideo", null, "Video attachment"),
      videoName
    );
  }

  if (mediaKind === "file") {
    const fileName = asText(post.preview_media.name) || deriveFileNameFromSrc(src);
    return createFeedMediaBadge(
      t("feed.mediaFile", null, "File attachment"),
      fileName
    );
  }

  return createFeedMediaBadge(
    t("feed.mediaAttachment", null, "Attachment"),
    asText(post.preview_media.name)
  );
}

async function initFeedPage() {
  const feedListEl = document.getElementById("feedList");
  const feedStatusEl = document.getElementById("feedStatus");
  const adminAuthenticated = await refreshAdminUiState();

  function showDeleteError(error) {
    feedStatusEl.textContent = translateErrorMessage(error, "admin.deleteFailed", "Delete failed.");
  }

  const data = await fetchJson("/posts?limit=30&page=1");
  const posts = Array.isArray(data.items) ? data.items.slice() : [];

  posts.sort((a, b) => {
    const byDate = toMillis(b.created_at) - toMillis(a.created_at);
    if (byDate !== 0) return byDate;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  if (posts.length === 0) {
    feedStatusEl.textContent = t("feed.empty", null, "No posts yet.");
    feedListEl.innerHTML = "";
    return;
  }

  const previewEntries = await Promise.all(
    posts.map(async (post) => [post.id, await loadCommentPreview(post.id)])
  );
  const commentPreviewByPostId = new Map(previewEntries);

  feedStatusEl.textContent = t("feed.summary", { count: posts.length }, posts.length + " post(s), newest first.");
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
    author.textContent = BLOG_NAME;

    const handle = document.createElement("span");
    handle.className = "tweet-handle";
    handle.textContent = BLOG_HANDLE;

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

    if (adminAuthenticated) {
      const deletePostButton = createPostDeleteButton(
        post.id,
        async () => {
          feedStatusEl.textContent = t("admin.postDeleted", null, "Post deleted.");
          await initFeedPage();
        },
        showDeleteError
      );
      header.appendChild(deletePostButton);
    }

    card.appendChild(header);

    const title = document.createElement("h2");
    title.className = "tweet-title";
    title.textContent = asText(post.title) || t("feed.untitled", null, "Untitled post");
    card.appendChild(title);

    card.appendChild(createLikeControl(post.id, post.likes));

    const text = document.createElement("p");
    text.className = "tweet-text";
    text.textContent = previewText(post.preview_text, 240) || t("feed.noPreview", null, "No paragraph preview.");
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
      empty.textContent = t("feed.noReplies", null, "No replies yet.");
      previewWrap.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "reply-list";

      comments.forEach((comment) => {
        const item = document.createElement("li");
        item.className = "reply-item";
        const safeName = escapeHtml(comment.name || t("common.anonymous", null, "Anonymous"));
        const safePreview = escapeHtml(previewText(comment.content || "", 90));
        if (adminAuthenticated) {
          const text = document.createElement("span");
          text.className = "reply-item-text";
          text.innerHTML = safeName + ": " + safePreview;
          item.appendChild(text);

          const deleteCommentButton = createCommentDeleteButton(
            comment.id,
            async () => {
              feedStatusEl.textContent = t("admin.commentDeleted", null, "Comment deleted.");
              await initFeedPage();
            },
            showDeleteError
          );
          item.appendChild(deleteCommentButton);
        } else {
          item.innerHTML = safeName + ": " + safePreview;
        }
        list.appendChild(item);
      });

      previewWrap.appendChild(list);
    }

    const openLink = document.createElement("a");
    openLink.className = "inline-link";
    openLink.href = createThreadUrl(post.id);
    openLink.textContent = t(
      "feed.openFull",
      null,
      "Open full post and all comments"
    );

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
    postStatusEl.textContent = t("post.invalidId", null, "Invalid post id.");
    commentFormEl.querySelector("button[type='submit']").disabled = true;
    return;
  }

  const adminAuthenticated = await refreshAdminUiState();

  function showDeleteError(error) {
    const message = translateErrorMessage(error, "admin.deleteFailed", "Delete failed.");
    postStatusEl.textContent = message;
    commentStatusEl.textContent = message;
  }

  async function refreshComments() {
    const updatedComments = await fetchJson("/comments/" + encodeURIComponent(postId));
    renderComments(commentListEl, updatedComments, {
      adminAuthenticated,
      onCommentDeleted: refreshComments,
      onDeleteError: showDeleteError
    });
  }

  let post;
  let comments;
  try {
    [post, comments] = await Promise.all([
      fetchJson("/posts/" + encodeURIComponent(postId)),
      fetchJson("/comments/" + encodeURIComponent(postId))
    ]);
  } catch (error) {
    postStatusEl.textContent = translateErrorMessage(error, "post.loadError", "Failed to load post.");
    commentFormEl.querySelector("button[type='submit']").disabled = true;
    return;
  }

  renderPost(postViewEl, post, {
    adminAuthenticated,
    onPostDeleted: () => {
      window.location.href = "/";
    },
    onDeleteError: showDeleteError
  });
  renderComments(commentListEl, comments, {
    adminAuthenticated,
    onCommentDeleted: refreshComments,
    onDeleteError: showDeleteError
  });
  postStatusEl.textContent = "";
  document.title = t(
    "title.postWithName",
    {
      title: asText(post.title) || t("feed.untitled", null, "Post #" + postId)
    },
    BLOG_NAME + " - " + (asText(post.title) || "Post #" + postId)
  );

  commentFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    commentStatusEl.textContent = t("post.commentSending", null, "Sending...");

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
      commentStatusEl.textContent = t("post.commentPosted", null, "Comment posted.");
      await refreshComments();
    } catch (error) {
      commentStatusEl.textContent = translateErrorMessage(
        error,
        "post.commentError",
        "Failed to post comment."
      );
    }
  });
}

function renderPost(postViewEl, post, options) {
  const renderOptions = options && typeof options === "object" ? options : {};
  const adminAuthenticated = Boolean(renderOptions.adminAuthenticated);

  postViewEl.innerHTML = "";

  const card = document.createElement("article");
  card.className = "tweet-card tweet-card-full";

  const header = document.createElement("div");
  header.className = "tweet-head";

  const author = document.createElement("strong");
  author.className = "tweet-user";
  author.textContent = BLOG_NAME;

  const handle = document.createElement("span");
  handle.className = "tweet-handle";
  handle.textContent = BLOG_HANDLE;

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
  title.textContent = asText(post.title) || t("feed.untitled", null, "Untitled post");
  card.appendChild(title);
  card.appendChild(createLikeControl(post.id, post.likes));

  if (adminAuthenticated) {
    const actions = document.createElement("div");
    actions.className = "admin-inline-actions";
    actions.appendChild(
      createPostDeleteButton(
        post.id,
        renderOptions.onPostDeleted,
        renderOptions.onDeleteError
      )
    );
    card.appendChild(actions);
  }

  const blocksWrap = document.createElement("div");
  blocksWrap.className = "post-blocks";

  const rawBlocks = Array.isArray(post.blocks) ? post.blocks : [];
  const blocks = rawBlocks.map((block) => normalizeClientBlock(block)).filter((block) => block);

  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tweet-text tweet-text-full";
    empty.textContent = t("post.emptyBlocks", null, "This post has no readable blocks.");
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
    image.alt = asText(block.alt) || asText(block.name) || t("common.postMedia", null, "Post media");
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
    return renderAudioMediaBlock(block, src, captionText);
  } else if (block.mediaKind === "file") {
    const fileName = asText(block.name) || deriveFileNameFromSrc(src) || t("common.file", null, "file");

    const fileBlock = document.createElement("div");
    fileBlock.className = "post-file-block";

    const label = document.createElement("p");
    label.className = "post-file-label";
    label.textContent = t("post.fileAttached", null, "Attached file");
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

function renderComments(commentListEl, comments, options) {
  const renderOptions = options && typeof options === "object" ? options : {};
  const adminAuthenticated = Boolean(renderOptions.adminAuthenticated);

  commentListEl.innerHTML = "";

  if (!Array.isArray(comments) || comments.length === 0) {
    const li = document.createElement("li");
    li.className = "comment-card";
    li.textContent = t(
      "post.noComments",
      null,
      "No comments yet. Be the first visitor to write one."
    );
    commentListEl.appendChild(li);
    return;
  }

  comments.forEach((comment) => {
    const li = document.createElement("li");
    li.className = "comment-card";

    const head = document.createElement("div");
    head.className = "comment-head";

    const meta = document.createElement("p");
    meta.className = "meta-line";
    const safeName = escapeHtml(comment.name || t("common.anonymous", null, "Anonymous"));
    const safeDate = escapeHtml(formatDate(comment.created_at));
    meta.innerHTML = safeName + " | " + safeDate;
    head.appendChild(meta);

    if (adminAuthenticated) {
      head.appendChild(
        createCommentDeleteButton(
          comment.id,
          renderOptions.onCommentDeleted,
          renderOptions.onDeleteError
        )
      );
    }

    const body = document.createElement("p");
    body.className = "comment-body";
    body.innerHTML = escapeHtml(comment.content || "");

    li.appendChild(head);
    li.appendChild(body);
    commentListEl.appendChild(li);
  });
}

bootstrap();
