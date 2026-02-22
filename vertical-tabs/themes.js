// VerticalTabs - Theme Definitions and Management
// Handles preset themes, light/dark/auto mode, and persistence via chrome.storage.local.

"use strict";

const ThemeManager = (() => {
  const STORAGE_KEY = "verticaltabs_theme";

  // Group color map for Chrome tab groups
  const GROUP_COLORS = {
    grey: "#5F6368",
    blue: "#1A73E8",
    red: "#D93025",
    yellow: "#F9AB00",
    green: "#188038",
    pink: "#D01884",
    purple: "#A142F4",
    cyan: "#007B83",
    orange: "#FA903E",
  };

  // Preset theme definitions
  const PRESETS = [
    {
      id: "teal-forest",
      label: "Teal Forest",
      gradient: "linear-gradient(135deg, #89CDA8, #6BA5A0, #4A8C8C)",
      accent: "#89CDA8",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.15)",
      swatch: "#6BA5A0",
    },
    {
      id: "ocean-blue",
      label: "Ocean Blue",
      gradient: "linear-gradient(135deg, #7BB4D4, #5A8FB4, #3D6E94)",
      accent: "#7BB4D4",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.15)",
      swatch: "#5A8FB4",
    },
    {
      id: "sunset-coral",
      label: "Sunset Coral",
      gradient: "linear-gradient(135deg, #F4A1A1, #E87C7C, #D45757)",
      accent: "#F4A1A1",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.15)",
      swatch: "#E87C7C",
    },
    {
      id: "lavender",
      label: "Lavender",
      gradient: "linear-gradient(135deg, #B8A9E8, #9B89D4, #7E6ABF)",
      accent: "#B8A9E8",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.15)",
      swatch: "#9B89D4",
    },
    {
      id: "rose-pink",
      label: "Rose Pink",
      gradient: "linear-gradient(135deg, #F2B5D4, #E494B8, #D4739D)",
      accent: "#F2B5D4",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.15)",
      swatch: "#E494B8",
    },
    {
      id: "midnight",
      label: "Midnight",
      gradient: "linear-gradient(135deg, #2D3748, #1A2332, #0F1923)",
      accent: "#5A9BCF",
      tabHover: "rgba(255,255,255,0.08)",
      tabActive: "rgba(255,255,255,0.15)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.5)",
      divider: "rgba(255,255,255,0.12)",
      swatch: "#1A2332",
    },
    {
      id: "warm-sand",
      label: "Warm Sand",
      gradient: "linear-gradient(135deg, #E8D5B7, #D4B896, #BF9B74)",
      accent: "#BF9B74",
      tabHover: "rgba(0,0,0,0.06)",
      tabActive: "rgba(0,0,0,0.10)",
      textPrimary: "rgba(0,0,0,0.80)",
      textSecondary: "rgba(0,0,0,0.45)",
      divider: "rgba(0,0,0,0.10)",
      swatch: "#D4B896",
    },
    {
      id: "pure-dark",
      label: "Pure Dark",
      gradient: "#1e1e2e",
      accent: "#89B4FA",
      tabHover: "rgba(255,255,255,0.06)",
      tabActive: "rgba(255,255,255,0.12)",
      textPrimary: "rgba(255,255,255,0.85)",
      textSecondary: "rgba(255,255,255,0.45)",
      divider: "rgba(255,255,255,0.10)",
      swatch: "#1e1e2e",
    },
  ];

  // Light-mode overrides for themes that support it
  const LIGHT_OVERRIDES = {
    tabHover: "rgba(0,0,0,0.06)",
    tabActive: "rgba(0,0,0,0.10)",
    textPrimary: "rgba(0,0,0,0.80)",
    textSecondary: "rgba(0,0,0,0.45)",
    divider: "rgba(0,0,0,0.10)",
  };

  // Light-mode gradient replacements
  const LIGHT_GRADIENTS = {
    "teal-forest": "linear-gradient(135deg, #E0F5EC, #CCE8E0, #B8DBD5)",
    "ocean-blue": "linear-gradient(135deg, #DEEDF6, #C8DDE8, #B0CCDA)",
    "sunset-coral": "linear-gradient(135deg, #FCDEDE, #F5CACA, #EEB6B6)",
    "lavender": "linear-gradient(135deg, #EDE8F8, #DDD5F0, #CCC2E8)",
    "rose-pink": "linear-gradient(135deg, #FCE8F0, #F5D6E2, #EDC4D4)",
    "midnight": "linear-gradient(135deg, #E8EBF0, #D8DCE5, #C8CDD8)",
    "warm-sand": "linear-gradient(135deg, #F8F0E4, #F0E4D0, #E8D8BC)",
    "pure-dark": "linear-gradient(135deg, #F0F0F4, #E8E8EE, #E0E0E8)",
  };

  let currentPresetId = "teal-forest";
  let currentMode = "auto"; // "light" | "dark" | "auto"

  function getPreset(id) {
    return PRESETS.find((p) => p.id === id) || PRESETS[0];
  }

  function isDarkMode() {
    if (currentMode === "dark") return true;
    if (currentMode === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(presetId, mode) {
    if (presetId) currentPresetId = presetId;
    if (mode) currentMode = mode;

    const preset = getPreset(currentPresetId);
    const dark = isDarkMode();
    const root = document.documentElement;

    // Determine if we use light overrides
    const isLightTheme = !dark && currentPresetId !== "midnight" && currentPresetId !== "pure-dark";

    if (isLightTheme) {
      root.style.setProperty("--bg-gradient", LIGHT_GRADIENTS[currentPresetId] || preset.gradient);
      root.style.setProperty("--text-primary", LIGHT_OVERRIDES.textPrimary);
      root.style.setProperty("--text-secondary", LIGHT_OVERRIDES.textSecondary);
      root.style.setProperty("--tab-hover", LIGHT_OVERRIDES.tabHover);
      root.style.setProperty("--tab-active", LIGHT_OVERRIDES.tabActive);
      root.style.setProperty("--divider-color", LIGHT_OVERRIDES.divider);
      root.style.setProperty("--accent-color", preset.accent);
    } else {
      root.style.setProperty("--bg-gradient", preset.gradient);
      root.style.setProperty("--text-primary", preset.textPrimary);
      root.style.setProperty("--text-secondary", preset.textSecondary);
      root.style.setProperty("--tab-hover", preset.tabHover);
      root.style.setProperty("--tab-active", preset.tabActive);
      root.style.setProperty("--divider-color", preset.divider);
      root.style.setProperty("--accent-color", preset.accent);
    }

    root.dataset.theme = currentPresetId;
    root.dataset.mode = dark ? "dark" : "light";
  }

  async function loadSaved() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const saved = result[STORAGE_KEY];
      if (saved) {
        currentPresetId = saved.presetId || "teal-forest";
        currentMode = saved.mode || "auto";
      }
    } catch {
      // Use defaults
    }
    applyTheme();
  }

  async function save() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          presetId: currentPresetId,
          mode: currentMode,
        },
      });
    } catch {
      // Silently fail
    }
  }

  function setPreset(id) {
    applyTheme(id, null);
    save();
  }

  function setMode(mode) {
    applyTheme(null, mode);
    save();
  }

  // Listen for OS theme changes when mode is "auto"
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentMode === "auto") {
      applyTheme();
    }
  });

  return {
    PRESETS,
    GROUP_COLORS,
    get currentPresetId() { return currentPresetId; },
    get currentMode() { return currentMode; },
    getPreset,
    loadSaved,
    setPreset,
    setMode,
    applyTheme,
  };
})();
