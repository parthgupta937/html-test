// VerticalTabs - Side Panel Tab Management

(function () {
  "use strict";

  const tabListEl = document.getElementById("tab-list");
  const searchEl = document.getElementById("search");
  const newTabBtn = document.getElementById("new-tab");

  // In-memory map of tabId -> tab data for efficient updates.
  const tabCache = new Map();
  let currentWindowId = null;
  let searchQuery = "";

  // ── Favicon helper ──────────────────────────────────────────────────
  function faviconUrl(tab) {
    if (tab.favIconUrl && tab.favIconUrl.startsWith("http")) {
      return tab.favIconUrl;
    }
    // Use Chrome's built-in favicon service for chrome:// pages and fallbacks.
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=16`;
  }

  // ── DOM creation ────────────────────────────────────────────────────
  function createTabElement(tab) {
    const el = document.createElement("div");
    el.className = "tab-item";
    el.dataset.tabId = tab.id;
    el.draggable = true;

    if (tab.active) el.classList.add("active");
    if (tab.pinned) el.classList.add("pinned");
    if (tab.status === "loading") el.classList.add("loading");
    if (tab.audible) el.classList.add("audible");

    // Loading spinner (shown when loading, favicon hidden via CSS)
    const spinner = document.createElement("div");
    spinner.className = "tab-loading-spinner";
    el.appendChild(spinner);

    // Favicon
    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.width = 16;
    favicon.height = 16;
    favicon.src = faviconUrl(tab);
    favicon.alt = "";
    favicon.onerror = function () {
      this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' rx='3' fill='%23ccc'/%3E%3C/svg%3E";
    };
    el.appendChild(favicon);

    // Title
    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";
    el.appendChild(title);

    // Audio indicator
    const audio = document.createElement("span");
    audio.className = "tab-audio";
    audio.textContent = "\u{1F50A}";
    audio.title = "Playing audio";
    el.appendChild(audio);

    // Close button
    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "\u00D7";
    close.title = "Close tab";
    el.appendChild(close);

    return el;
  }

  // ── Render helpers ──────────────────────────────────────────────────
  function matchesSearch(tab) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (tab.title && tab.title.toLowerCase().includes(q)) ||
      (tab.url && tab.url.toLowerCase().includes(q))
    );
  }

  function renderFullList() {
    tabListEl.innerHTML = "";
    const tabs = Array.from(tabCache.values()).sort(
      (a, b) => a.index - b.index
    );

    if (tabs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No open tabs";
      tabListEl.appendChild(empty);
      return;
    }

    let anyVisible = false;
    for (const tab of tabs) {
      if (!matchesSearch(tab)) continue;
      anyVisible = true;
      tabListEl.appendChild(createTabElement(tab));
    }

    if (!anyVisible) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No matching tabs";
      tabListEl.appendChild(empty);
    }
  }

  // Update a single tab element in place rather than rebuilding everything.
  function updateTabElement(tabId) {
    const tab = tabCache.get(tabId);
    const el = tabListEl.querySelector(`[data-tab-id="${tabId}"]`);
    if (!tab) {
      if (el) el.remove();
      return;
    }
    if (!matchesSearch(tab)) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      // Tab now matches search or is new — rebuild is simplest.
      renderFullList();
      return;
    }

    // Update classes
    el.classList.toggle("active", !!tab.active);
    el.classList.toggle("pinned", !!tab.pinned);
    el.classList.toggle("loading", tab.status === "loading");
    el.classList.toggle("audible", !!tab.audible);

    // Update favicon
    const favicon = el.querySelector(".tab-favicon");
    if (favicon) {
      const newSrc = faviconUrl(tab);
      if (favicon.src !== newSrc) favicon.src = newSrc;
    }

    // Update title
    const title = el.querySelector(".tab-title");
    if (title && title.textContent !== (tab.title || "New Tab")) {
      title.textContent = tab.title || "New Tab";
    }
  }

  // ── Initial load ───────────────────────────────────────────────────
  async function init() {
    const win = await chrome.windows.getCurrent();
    currentWindowId = win.id;

    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    for (const tab of tabs) {
      tabCache.set(tab.id, tab);
    }
    renderFullList();
  }

  init();

  // ── Event delegation for clicks ────────────────────────────────────
  tabListEl.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".tab-close");
    if (closeBtn) {
      const item = closeBtn.closest(".tab-item");
      if (item) {
        const tabId = parseInt(item.dataset.tabId, 10);
        chrome.tabs.remove(tabId);
      }
      return;
    }

    const item = e.target.closest(".tab-item");
    if (item) {
      const tabId = parseInt(item.dataset.tabId, 10);
      chrome.tabs.update(tabId, { active: true });
    }
  });

  // Middle-click to close
  tabListEl.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const item = e.target.closest(".tab-item");
    if (item) {
      e.preventDefault();
      const tabId = parseInt(item.dataset.tabId, 10);
      chrome.tabs.remove(tabId);
    }
  });

  // New Tab button
  newTabBtn.addEventListener("click", () => {
    chrome.tabs.create({});
  });

  // ── Search ─────────────────────────────────────────────────────────
  searchEl.addEventListener("input", () => {
    searchQuery = searchEl.value.trim();
    renderFullList();
  });

  // ── Drag and Drop ──────────────────────────────────────────────────
  let dragTabId = null;

  tabListEl.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".tab-item");
    if (!item) return;
    dragTabId = parseInt(item.dataset.tabId, 10);
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  tabListEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const item = e.target.closest(".tab-item");
    // Clear previous indicators
    tabListEl.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    if (item) item.classList.add("drag-over");
  });

  tabListEl.addEventListener("dragleave", (e) => {
    const item = e.target.closest(".tab-item");
    if (item) item.classList.remove("drag-over");
  });

  tabListEl.addEventListener("drop", (e) => {
    e.preventDefault();
    tabListEl.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    const item = e.target.closest(".tab-item");
    if (!item || dragTabId === null) return;

    const targetTabId = parseInt(item.dataset.tabId, 10);
    const targetTab = tabCache.get(targetTabId);
    if (targetTab) {
      chrome.tabs.move(dragTabId, { index: targetTab.index });
    }
  });

  tabListEl.addEventListener("dragend", () => {
    tabListEl.querySelectorAll(".dragging").forEach((el) =>
      el.classList.remove("dragging")
    );
    tabListEl.querySelectorAll(".drag-over").forEach((el) =>
      el.classList.remove("drag-over")
    );
    dragTabId = null;
  });

  // ── Chrome tab events (real-time updates) ──────────────────────────

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.windowId !== currentWindowId) return;
    tabCache.set(tab.id, tab);
    renderFullList();
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (removeInfo.windowId !== currentWindowId) return;
    tabCache.delete(tabId);
    const el = tabListEl.querySelector(`[data-tab-id="${tabId}"]`);
    if (el) el.remove();
    if (tabCache.size === 0) renderFullList();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.windowId !== currentWindowId) return;
    const cached = tabCache.get(tabId);
    if (cached) {
      Object.assign(cached, changeInfo);
    } else {
      tabCache.set(tabId, tab);
    }
    updateTabElement(tabId);
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo.windowId !== currentWindowId) return;
    // Clear previous active
    for (const [id, tab] of tabCache) {
      if (tab.active) {
        tab.active = false;
        updateTabElement(id);
      }
    }
    const tab = tabCache.get(activeInfo.tabId);
    if (tab) {
      tab.active = true;
      updateTabElement(activeInfo.tabId);
    }
  });

  chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
    if (moveInfo.windowId !== currentWindowId) return;
    // Re-query all tabs to get correct indices after a move.
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    tabCache.clear();
    for (const tab of tabs) tabCache.set(tab.id, tab);
    renderFullList();
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    if (detachInfo.oldWindowId !== currentWindowId) return;
    tabCache.delete(tabId);
    const el = tabListEl.querySelector(`[data-tab-id="${tabId}"]`);
    if (el) el.remove();
    if (tabCache.size === 0) renderFullList();
  });

  chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
    if (attachInfo.newWindowId !== currentWindowId) return;
    const tab = await chrome.tabs.get(tabId);
    tabCache.set(tabId, tab);
    renderFullList();
  });
})();
