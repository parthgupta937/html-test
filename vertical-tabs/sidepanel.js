// VerticalTabs v1.0.0 — Side Panel Tab Management
// Features: pinned tabs grid, tab groups, keyboard nav, context menu, themes

(function () {
  "use strict";

  // ── DOM references ──────────────────────────────────────────────────
  const searchEl = document.getElementById("search");
  const scrollArea = document.getElementById("scroll-area");
  const pinnedSection = document.getElementById("pinned-section");
  const pinnedGrid = document.getElementById("pinned-grid");
  const tabsContainer = document.getElementById("tabs-container");
  const contextMenu = document.getElementById("context-menu");
  const themePanel = document.getElementById("theme-panel");
  const newTabBtn = document.getElementById("new-tab");
  const settingsBtn = document.getElementById("settings-btn");
  const themeCloseBtn = document.getElementById("theme-close");

  // ── State ───────────────────────────────────────────────────────────
  const tabCache = new Map();       // tabId -> tab object
  const groupCache = new Map();     // groupId -> group object
  const collapsedGroups = new Set(); // groupIds that are collapsed
  let currentWindowId = null;
  let searchQuery = "";
  let searchDebounceTimer = null;
  let contextTabId = null;          // tab targeted by context menu
  let keyboardFocusIndex = -1;      // index in visible tab list

  // ── Favicon helper ──────────────────────────────────────────────────
  function faviconUrl(tab) {
    if (tab.favIconUrl && tab.favIconUrl.startsWith("http")) {
      return tab.favIconUrl;
    }
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url || "")}&size=16`;
  }

  const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' rx='3' fill='%23888'/%3E%3C/svg%3E";

  // ── Search helpers ──────────────────────────────────────────────────
  function matchesSearch(tab) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (tab.title && tab.title.toLowerCase().includes(q)) ||
      (tab.url && tab.url.toLowerCase().includes(q))
    );
  }

  // ── Sorted tab helpers ──────────────────────────────────────────────
  function getSortedTabs() {
    return Array.from(tabCache.values()).sort((a, b) => a.index - b.index);
  }

  function getPinnedTabs() {
    return getSortedTabs().filter((t) => t.pinned && matchesSearch(t));
  }

  function getUnpinnedTabs() {
    return getSortedTabs().filter((t) => !t.pinned && matchesSearch(t));
  }

  // ── Pinned tabs rendering ──────────────────────────────────────────
  function renderPinnedTabs() {
    const pinned = getPinnedTabs();
    pinnedSection.hidden = pinned.length === 0;
    pinnedGrid.textContent = "";

    for (const tab of pinned) {
      const el = document.createElement("div");
      el.className = "pinned-tab";
      el.dataset.tabId = tab.id;
      if (tab.active) el.classList.add("active");
      if (tab.audible) el.classList.add("audible");
      el.title = tab.title || "New Tab";

      const img = document.createElement("img");
      img.src = faviconUrl(tab);
      img.width = 20;
      img.height = 20;
      img.alt = "";
      img.onerror = function () { this.src = FALLBACK_ICON; };
      el.appendChild(img);

      const audioIcon = document.createElement("span");
      audioIcon.className = "pinned-audio";
      audioIcon.textContent = "\u266B";
      el.appendChild(audioIcon);

      pinnedGrid.appendChild(el);
    }
  }

  // ── Tab element creation ────────────────────────────────────────────
  function createTabElement(tab) {
    const el = document.createElement("div");
    el.className = "tab-item";
    el.dataset.tabId = tab.id;
    el.draggable = true;

    if (tab.active) el.classList.add("active");
    if (tab.status === "loading") el.classList.add("loading");
    if (tab.audible) el.classList.add("audible");

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.width = 16;
    favicon.height = 16;
    favicon.src = faviconUrl(tab);
    favicon.alt = "";
    favicon.onerror = function () { this.src = FALLBACK_ICON; };
    el.appendChild(favicon);

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";
    el.appendChild(title);

    const audio = document.createElement("span");
    audio.className = "tab-audio";
    audio.textContent = "\u{1F50A}";
    audio.title = "Playing audio";
    el.appendChild(audio);

    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "\u00D7";
    close.title = "Close tab";
    close.setAttribute("aria-label", "Close tab");
    el.appendChild(close);

    return el;
  }

  // ── Tab groups rendering ────────────────────────────────────────────
  function renderTabs() {
    tabsContainer.textContent = "";
    const unpinned = getUnpinnedTabs();

    if (unpinned.length === 0 && getPinnedTabs().length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = searchQuery ? "No matching tabs" : "No open tabs";
      tabsContainer.appendChild(empty);
      return;
    }

    if (unpinned.length === 0 && getPinnedTabs().length > 0) {
      if (searchQuery) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No matching tabs";
        tabsContainer.appendChild(empty);
      }
      return;
    }

    // Separate grouped and ungrouped
    const grouped = new Map(); // groupId -> tabs[]
    const ungrouped = [];

    for (const tab of unpinned) {
      if (tab.groupId && tab.groupId !== -1 && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        if (!grouped.has(tab.groupId)) grouped.set(tab.groupId, []);
        grouped.get(tab.groupId).push(tab);
      } else {
        ungrouped.push(tab);
      }
    }

    // Render groups
    for (const [groupId, tabs] of grouped) {
      const group = groupCache.get(groupId);
      const groupEl = document.createElement("div");
      groupEl.className = "tab-group";
      groupEl.dataset.groupId = groupId;
      if (collapsedGroups.has(groupId)) groupEl.classList.add("collapsed");

      // Group header
      const header = document.createElement("div");
      header.className = "group-header";
      header.dataset.groupId = groupId;

      const dot = document.createElement("span");
      dot.className = "group-dot";
      const color = group ? (ThemeManager.GROUP_COLORS[group.color] || "#5F6368") : "#5F6368";
      dot.style.background = color;
      header.appendChild(dot);

      const titleEl = document.createElement("span");
      titleEl.className = "group-title";
      titleEl.textContent = (group && group.title) || "Untitled Group";
      header.appendChild(titleEl);

      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = tabs.length;
      header.appendChild(count);

      const chevron = document.createElement("span");
      chevron.className = "group-chevron";
      chevron.innerHTML = '<svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4"/></svg>';
      header.appendChild(chevron);

      groupEl.appendChild(header);

      // Group tabs container
      const tabsEl = document.createElement("div");
      tabsEl.className = "group-tabs";
      for (const tab of tabs) {
        tabsEl.appendChild(createTabElement(tab));
      }
      // Set max-height for animation
      if (!collapsedGroups.has(groupId)) {
        tabsEl.style.maxHeight = (tabs.length * 38 + 10) + "px";
      }
      groupEl.appendChild(tabsEl);

      tabsContainer.appendChild(groupEl);
    }

    // Render ungrouped tabs
    if (ungrouped.length > 0) {
      if (grouped.size > 0) {
        const label = document.createElement("div");
        label.className = "ungrouped-header";
        label.textContent = "Tabs";
        tabsContainer.appendChild(label);
      }
      for (const tab of ungrouped) {
        tabsContainer.appendChild(createTabElement(tab));
      }
    }
  }

  // ── Full render ─────────────────────────────────────────────────────
  function renderFullList() {
    renderPinnedTabs();
    renderTabs();
    keyboardFocusIndex = -1;
  }

  // ── Efficient single-tab update ─────────────────────────────────────
  function updateTabInPlace(tabId) {
    const tab = tabCache.get(tabId);

    // Update in pinned grid
    const pinnedEl = pinnedGrid.querySelector(`[data-tab-id="${tabId}"]`);
    if (pinnedEl) {
      if (!tab || !tab.pinned || !matchesSearch(tab)) {
        renderFullList();
        return;
      }
      pinnedEl.classList.toggle("active", !!tab.active);
      pinnedEl.classList.toggle("audible", !!tab.audible);
      pinnedEl.title = tab.title || "New Tab";
      const img = pinnedEl.querySelector("img");
      if (img) {
        const newSrc = faviconUrl(tab);
        if (img.src !== newSrc) img.src = newSrc;
      }
      return;
    }

    // Update in tab list
    const el = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (!tab) {
      if (el) el.remove();
      return;
    }
    if (tab.pinned) {
      // Tab was pinned — needs full re-render
      renderFullList();
      return;
    }
    if (!matchesSearch(tab)) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      renderFullList();
      return;
    }

    el.classList.toggle("active", !!tab.active);
    el.classList.toggle("loading", tab.status === "loading");
    el.classList.toggle("audible", !!tab.audible);

    const favicon = el.querySelector(".tab-favicon");
    if (favicon) {
      const newSrc = faviconUrl(tab);
      if (favicon.src !== newSrc) favicon.src = newSrc;
    }

    const title = el.querySelector(".tab-title");
    if (title && title.textContent !== (tab.title || "New Tab")) {
      title.textContent = tab.title || "New Tab";
    }
  }

  // ── Init ────────────────────────────────────────────────────────────
  async function init() {
    const win = await chrome.windows.getCurrent();
    currentWindowId = win.id;

    // Load tabs
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    for (const tab of tabs) {
      tabCache.set(tab.id, tab);
    }

    // Load groups
    try {
      const groups = await chrome.tabGroups.query({ windowId: currentWindowId });
      for (const g of groups) {
        groupCache.set(g.id, g);
      }
    } catch {
      // tabGroups might not be available
    }

    // Load theme
    await ThemeManager.loadSaved();

    // Render theme panel swatches
    renderThemePanel();

    renderFullList();
  }

  init();

  // ── Theme panel ─────────────────────────────────────────────────────
  function renderThemePanel() {
    const presetsContainer = themePanel.querySelector(".theme-presets");
    presetsContainer.textContent = "";

    for (const preset of ThemeManager.PRESETS) {
      const swatch = document.createElement("button");
      swatch.className = "theme-swatch";
      swatch.dataset.themeId = preset.id;
      swatch.style.background = preset.swatch;
      swatch.title = preset.label;
      swatch.setAttribute("aria-label", preset.label + " theme");
      if (preset.id === ThemeManager.currentPresetId) swatch.classList.add("active");
      presetsContainer.appendChild(swatch);
    }

    // Update mode buttons
    updateModeButtons();
  }

  function updateModeButtons() {
    const btns = themePanel.querySelectorAll(".mode-btn");
    btns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === ThemeManager.currentMode);
    });
  }

  function updateThemeSwatches() {
    const swatches = themePanel.querySelectorAll(".theme-swatch");
    swatches.forEach((s) => {
      s.classList.toggle("active", s.dataset.themeId === ThemeManager.currentPresetId);
    });
  }

  settingsBtn.addEventListener("click", () => {
    const isOpen = themePanel.classList.contains("open");
    if (isOpen) {
      themePanel.classList.remove("open");
      setTimeout(() => { themePanel.hidden = true; }, 200);
    } else {
      themePanel.hidden = false;
      // Force reflow to trigger animation
      themePanel.offsetHeight;
      themePanel.classList.add("open");
      updateThemeSwatches();
      updateModeButtons();
    }
  });

  themeCloseBtn.addEventListener("click", () => {
    themePanel.classList.remove("open");
    setTimeout(() => { themePanel.hidden = true; }, 200);
  });

  // Theme preset clicks
  themePanel.querySelector(".theme-presets").addEventListener("click", (e) => {
    const swatch = e.target.closest(".theme-swatch");
    if (!swatch) return;
    ThemeManager.setPreset(swatch.dataset.themeId);
    updateThemeSwatches();
  });

  // Mode toggle clicks
  themePanel.querySelector(".theme-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;
    ThemeManager.setMode(btn.dataset.mode);
    updateModeButtons();
  });

  // ── Event delegation: pinned tabs ───────────────────────────────────
  pinnedGrid.addEventListener("click", (e) => {
    const pinned = e.target.closest(".pinned-tab");
    if (!pinned) return;
    const tabId = parseInt(pinned.dataset.tabId, 10);
    chrome.tabs.update(tabId, { active: true });
  });

  pinnedGrid.addEventListener("contextmenu", (e) => {
    const pinned = e.target.closest(".pinned-tab");
    if (!pinned) return;
    e.preventDefault();
    const tabId = parseInt(pinned.dataset.tabId, 10);
    showContextMenu(e.clientX, e.clientY, tabId);
  });

  // ── Event delegation: tab list clicks ───────────────────────────────
  tabsContainer.addEventListener("click", (e) => {
    // Group header click
    const groupHeader = e.target.closest(".group-header");
    if (groupHeader) {
      const groupId = parseInt(groupHeader.dataset.groupId, 10);
      toggleGroup(groupId);
      return;
    }

    // Close button
    const closeBtn = e.target.closest(".tab-close");
    if (closeBtn) {
      const item = closeBtn.closest(".tab-item");
      if (item) {
        const tabId = parseInt(item.dataset.tabId, 10);
        chrome.tabs.remove(tabId);
      }
      return;
    }

    // Tab click
    const item = e.target.closest(".tab-item");
    if (item) {
      const tabId = parseInt(item.dataset.tabId, 10);
      chrome.tabs.update(tabId, { active: true });
    }
  });

  // Middle-click to close
  tabsContainer.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const item = e.target.closest(".tab-item");
    if (item) {
      e.preventDefault();
      const tabId = parseInt(item.dataset.tabId, 10);
      chrome.tabs.remove(tabId);
    }
  });

  // New tab
  newTabBtn.addEventListener("click", () => {
    chrome.tabs.create({});
  });

  // ── Group collapse/expand ───────────────────────────────────────────
  function toggleGroup(groupId) {
    const groupEl = tabsContainer.querySelector(`[data-group-id="${groupId}"].tab-group`);
    if (!groupEl) return;

    if (collapsedGroups.has(groupId)) {
      collapsedGroups.delete(groupId);
      groupEl.classList.remove("collapsed");
      const tabsEl = groupEl.querySelector(".group-tabs");
      if (tabsEl) {
        tabsEl.style.maxHeight = tabsEl.scrollHeight + "px";
      }
    } else {
      collapsedGroups.add(groupId);
      const tabsEl = groupEl.querySelector(".group-tabs");
      if (tabsEl) {
        tabsEl.style.maxHeight = tabsEl.scrollHeight + "px";
        // Force reflow then collapse
        tabsEl.offsetHeight;
      }
      groupEl.classList.add("collapsed");
    }
  }

  // ── Context menu ────────────────────────────────────────────────────
  tabsContainer.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".tab-item");
    if (!item) return;
    e.preventDefault();
    const tabId = parseInt(item.dataset.tabId, 10);
    showContextMenu(e.clientX, e.clientY, tabId);
  });

  function showContextMenu(x, y, tabId) {
    contextTabId = tabId;
    const tab = tabCache.get(tabId);
    if (!tab) return;

    // Update labels based on tab state
    const pinBtn = contextMenu.querySelector('[data-action="pin"]');
    pinBtn.textContent = tab.pinned ? "Unpin Tab" : "Pin Tab";

    const muteBtn = contextMenu.querySelector('[data-action="mute"]');
    const isMuted = tab.mutedInfo && tab.mutedInfo.muted;
    muteBtn.textContent = isMuted ? "Unmute Tab" : "Mute Tab";

    contextMenu.hidden = false;

    // Position clamped to panel bounds
    const rect = contextMenu.getBoundingClientRect();
    const panelW = document.body.clientWidth;
    const panelH = document.body.clientHeight;
    let left = x;
    let top = y;
    if (left + rect.width > panelW) left = panelW - rect.width - 4;
    if (top + rect.height > panelH) top = panelH - rect.height - 4;
    if (left < 4) left = 4;
    if (top < 4) top = 4;

    contextMenu.style.left = left + "px";
    contextMenu.style.top = top + "px";
  }

  function hideContextMenu() {
    contextMenu.hidden = true;
    contextTabId = null;
  }

  // Context menu action handler
  contextMenu.addEventListener("click", async (e) => {
    const btn = e.target.closest(".ctx-item");
    if (!btn || contextTabId === null) return;

    const action = btn.dataset.action;
    const tabId = contextTabId;
    const tab = tabCache.get(tabId);
    hideContextMenu();

    if (!tab) return;

    switch (action) {
      case "pin":
        await chrome.tabs.update(tabId, { pinned: !tab.pinned });
        break;
      case "mute": {
        const muted = tab.mutedInfo && tab.mutedInfo.muted;
        await chrome.tabs.update(tabId, { muted: !muted });
        break;
      }
      case "duplicate":
        await chrome.tabs.duplicate(tabId);
        break;
      case "new-window":
        await chrome.windows.create({ tabId: tabId });
        break;
      case "close":
        await chrome.tabs.remove(tabId);
        break;
      case "close-others": {
        const allTabs = getSortedTabs().filter((t) => !t.pinned);
        const toClose = allTabs.filter((t) => t.id !== tabId).map((t) => t.id);
        if (toClose.length > 0) await chrome.tabs.remove(toClose);
        break;
      }
      case "close-right": {
        const allTabs = getSortedTabs().filter((t) => !t.pinned);
        const idx = allTabs.findIndex((t) => t.id === tabId);
        if (idx >= 0) {
          const toClose = allTabs.slice(idx + 1).map((t) => t.id);
          if (toClose.length > 0) await chrome.tabs.remove(toClose);
        }
        break;
      }
    }
  });

  // Close context menu on click outside or Escape
  document.addEventListener("click", (e) => {
    if (!contextMenu.hidden && !contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !contextMenu.hidden) {
      hideContextMenu();
      return;
    }
  });

  // ── Search (debounced) ──────────────────────────────────────────────
  searchEl.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = searchEl.value.trim();
      renderFullList();
    }, 150);
  });

  // ── Keyboard navigation ─────────────────────────────────────────────
  function getVisibleTabItems() {
    return Array.from(tabsContainer.querySelectorAll(".tab-item"));
  }

  function clearKeyboardFocus() {
    const focused = tabsContainer.querySelector(".keyboard-focused");
    if (focused) focused.classList.remove("keyboard-focused");
    keyboardFocusIndex = -1;
  }

  document.addEventListener("keydown", (e) => {
    // Slash to focus search
    if (e.key === "/" && document.activeElement !== searchEl) {
      e.preventDefault();
      searchEl.focus();
      return;
    }

    // Escape to clear search
    if (e.key === "Escape" && document.activeElement === searchEl) {
      searchEl.value = "";
      searchQuery = "";
      searchEl.blur();
      renderFullList();
      return;
    }

    // Arrow navigation (only when search is not focused)
    if (document.activeElement === searchEl) return;

    const items = getVisibleTabItems();
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      clearKeyboardFocus();
      keyboardFocusIndex = Math.min(keyboardFocusIndex + 1, items.length - 1);
      items[keyboardFocusIndex].classList.add("keyboard-focused");
      items[keyboardFocusIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      clearKeyboardFocus();
      keyboardFocusIndex = Math.max(keyboardFocusIndex - 1, 0);
      items[keyboardFocusIndex].classList.add("keyboard-focused");
      items[keyboardFocusIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && keyboardFocusIndex >= 0 && keyboardFocusIndex < items.length) {
      e.preventDefault();
      const tabId = parseInt(items[keyboardFocusIndex].dataset.tabId, 10);
      chrome.tabs.update(tabId, { active: true });
    } else if ((e.key === "Delete" || e.key === "Backspace") && keyboardFocusIndex >= 0 && keyboardFocusIndex < items.length) {
      e.preventDefault();
      const tabId = parseInt(items[keyboardFocusIndex].dataset.tabId, 10);
      chrome.tabs.remove(tabId);
      clearKeyboardFocus();
    }
  });

  // ── Drag and Drop ───────────────────────────────────────────────────
  let dragTabId = null;

  tabsContainer.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".tab-item");
    if (!item) return;
    dragTabId = parseInt(item.dataset.tabId, 10);
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    // Apply ghost styles after a tick
    requestAnimationFrame(() => {
      item.classList.add("drag-ghost");
    });
  });

  tabsContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Clear previous indicators
    tabsContainer.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    tabsContainer.querySelectorAll(".drop-target").forEach((el) =>
      el.classList.remove("drop-target")
    );

    // Check if hovering over a group header (for group drop)
    const groupHeader = e.target.closest(".group-header");
    if (groupHeader) {
      groupHeader.classList.add("drop-target");
      return;
    }

    const item = e.target.closest(".tab-item");
    if (item) item.classList.add("drag-over");
  });

  tabsContainer.addEventListener("dragleave", (e) => {
    const item = e.target.closest(".tab-item");
    if (item) item.classList.remove("drag-over");
    const groupHeader = e.target.closest(".group-header");
    if (groupHeader) groupHeader.classList.remove("drop-target");
  });

  tabsContainer.addEventListener("drop", async (e) => {
    e.preventDefault();
    tabsContainer.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    tabsContainer.querySelectorAll(".drop-target").forEach((el) =>
      el.classList.remove("drop-target")
    );

    if (dragTabId === null) return;

    // Check if dropped on group header
    const groupHeader = e.target.closest(".group-header");
    if (groupHeader) {
      const groupId = parseInt(groupHeader.dataset.groupId, 10);
      try {
        await chrome.tabs.group({ tabIds: dragTabId, groupId: groupId });
      } catch {
        // Silently fail
      }
      return;
    }

    const item = e.target.closest(".tab-item");
    if (!item) return;

    const targetTabId = parseInt(item.dataset.tabId, 10);
    const targetTab = tabCache.get(targetTabId);
    if (targetTab) {
      chrome.tabs.move(dragTabId, { index: targetTab.index });
    }
  });

  tabsContainer.addEventListener("dragend", () => {
    tabsContainer.querySelectorAll(".dragging, .drag-ghost").forEach((el) => {
      el.classList.remove("dragging");
      el.classList.remove("drag-ghost");
    });
    tabsContainer.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    tabsContainer.querySelectorAll(".drop-target").forEach((el) =>
      el.classList.remove("drop-target")
    );
    dragTabId = null;
  });

  // ── Chrome tab events ───────────────────────────────────────────────
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.windowId !== currentWindowId) return;
    tabCache.set(tab.id, tab);
    renderFullList();
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (removeInfo.windowId !== currentWindowId) return;
    tabCache.delete(tabId);
    renderFullList();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.windowId !== currentWindowId) return;
    const cached = tabCache.get(tabId);
    if (cached) {
      Object.assign(cached, changeInfo);
    } else {
      tabCache.set(tabId, tab);
    }
    updateTabInPlace(tabId);
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo.windowId !== currentWindowId) return;
    for (const [id, tab] of tabCache) {
      if (tab.active) {
        tab.active = false;
        updateTabInPlace(id);
      }
    }
    const tab = tabCache.get(activeInfo.tabId);
    if (tab) {
      tab.active = true;
      updateTabInPlace(activeInfo.tabId);
    }
  });

  chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) => {
    if (moveInfo.windowId !== currentWindowId) return;
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    tabCache.clear();
    for (const tab of tabs) tabCache.set(tab.id, tab);
    renderFullList();
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    if (detachInfo.oldWindowId !== currentWindowId) return;
    tabCache.delete(tabId);
    renderFullList();
  });

  chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
    if (attachInfo.newWindowId !== currentWindowId) return;
    const tab = await chrome.tabs.get(tabId);
    tabCache.set(tabId, tab);
    renderFullList();
  });

  // ── Chrome tab group events ─────────────────────────────────────────
  try {
    chrome.tabGroups.onCreated.addListener((group) => {
      if (group.windowId !== currentWindowId) return;
      groupCache.set(group.id, group);
      renderFullList();
    });

    chrome.tabGroups.onUpdated.addListener((group) => {
      if (group.windowId !== currentWindowId) return;
      groupCache.set(group.id, group);
      renderFullList();
    });

    chrome.tabGroups.onRemoved.addListener((group) => {
      if (group.windowId !== currentWindowId) return;
      groupCache.delete(group.id);
      collapsedGroups.delete(group.id);
      renderFullList();
    });

    chrome.tabGroups.onMoved.addListener((group) => {
      if (group.windowId !== currentWindowId) return;
      renderFullList();
    });
  } catch {
    // tabGroups API may not be available
  }
})();
