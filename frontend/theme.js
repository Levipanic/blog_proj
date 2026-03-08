(function initTheme() {
  const STORAGE_KEY = "stereoDamageTheme";
  const THEMES = new Set(["light", "dark"]);
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");

  function t(key, params, fallback) {
    if (window.i18n && typeof window.i18n.t === "function") {
      return window.i18n.t(key, params);
    }
    return fallback || "";
  }

  function readSavedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return THEMES.has(value) ? value : "";
    } catch (error) {
      return "";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // Ignore storage failures so the toggle still works in memory.
    }
  }

  function getSystemTheme() {
    if (!window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getCurrentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    const safeTheme = THEMES.has(theme) ? theme : "light";
    root.setAttribute("data-theme", safeTheme);
    return safeTheme;
  }

  function updateToggle(theme) {
    if (!toggle) return;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const currentThemeLabel =
      theme === "dark"
        ? t("theme.dark", null, "Dark")
        : t("theme.light", null, "Light");
    const nextThemeLabel =
      nextTheme === "dark"
        ? t("theme.dark", null, "Dark")
        : t("theme.light", null, "Light");

    toggle.textContent = t("theme.label", { theme: currentThemeLabel }, "Theme: " + currentThemeLabel);
    toggle.setAttribute(
      "aria-label",
      t("theme.switchTo", { theme: nextThemeLabel }, "Switch to " + nextThemeLabel + " theme")
    );
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  }

  const initialTheme = applyTheme(readSavedTheme() || getSystemTheme() || "light");
  updateToggle(initialTheme);

  if (toggle) {
    toggle.addEventListener("click", () => {
      const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
      const appliedTheme = applyTheme(nextTheme);
      saveTheme(appliedTheme);
      updateToggle(appliedTheme);
    });
  }

  window.addEventListener("languagechange", () => {
    updateToggle(getCurrentTheme());
  });

  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => {
      if (readSavedTheme()) return;
      const appliedTheme = applyTheme(event.matches ? "dark" : "light");
      updateToggle(appliedTheme);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
    }
  }
})();
