// ==UserScript==
// @name         ChatGPT EDU Raider
// @namespace    re-kit.local/chatgpt-edu-raider
// @version      1.0.7
// @description  ChatGPT EDU Raider: управление workspace ID, запросами, инвайтами и сессией.
// @author       HardTest
// @updateURL    https://github.com/CriDos/ChatGPT_EDU_Raider/raw/refs/heads/master/chatgpt-edu-raider.user.js
// @downloadURL  https://github.com/CriDos/ChatGPT_EDU_Raider/raw/refs/heads/master/chatgpt-edu-raider.user.js
// @match        https://chatgpt.com/*
// @match        https://*.openai.com/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // App metadata and runtime keys.
  const SCRIPT_VERSION = "1.0.7";
  const APP_TITLE = "ChatGPT EDU Raider";
  const PROJECT_URL = "https://github.com/CriDos/ChatGPT_EDU_Raider";
  const ISSUES_URL = "https://github.com/CriDos/ChatGPT_EDU_Raider/issues";
  const INSTANCE_KEY = "__chatgptEduRaiderCleanup";
  const PANEL_ID = "jr-edu-raider-panel";
  const STYLE_ID = "jr-edu-raider-style";
  const LOG_LIMIT = 200;
  const FIXED_CONCURRENCY = 5;
  const MAX_SKIP_LOG_LINES = 5;

  // Default workspace data and config values.
  const DEFAULT_WORKSPACE_ITEMS = [
    { id: "ae67aa09-f3d3-4895-977d-9ca44ed1d996", comment: "Aniket's Workspace" },
    { id: "c72dcdb4-63a0-40b7-b0bb-ccce3ca54984", comment: "XiTeam-K12" },
    { id: "521ffc8f-9612-4950-84ed-95773138eca6", comment: "XiTeam-K12" },
    { id: "4779b1d7-3109-4ecb-957f-80262f4d7161", comment: "mihoyo" },
    { id: "2b636e76-a87b-4222-b536-2dc4a545109f", comment: "For Teachers" },
    { id: "6daa08c1-59c8-4e06-9bc8-9d7246a63057", comment: "Team-K12" },
    { id: "ff598c4d-ccaf-40c1-bfaa-cb94565764b1", comment: "Beulah Middle School" },
    { id: "47336c9d-7607-4478-b37c-018049af1e46", comment: "Evans STEM" },
    { id: "59208eb6-ec43-4d87-9289-dbd9e250bdd6", comment: "galway" },
    { id: "2c82c020-e1bc-4363-9502-a6794405f793", comment: "ClassPLinix" },
    { id: "9901799e-e832-48b1-9278-9abe73168708", comment: "mktaylor" },
    { id: "cf8e512d-1f3b-4603-950c-3d9758a8b435", comment: "LH Chính Chủ" }
  ];

  const CONFIG_DEFAULTS = {
    delayMs: 300,
    maxRetries: 3,
    retryBackoffMs: 5000,
    sessionPollMs: 10000,
    panelWidth: 500
  };

  const LIMITS = {
    minSessionPollMs: 1000,
    unauthorizedRetryDelayMs: 2000,
    safeFilenamePartLength: 80,
    workspaceIdLength: 64,
    commentLength: 80,
    collapsedIconSize: 44,
    dragStartThresholdPx: 3,
    defaultCookieMaxAgeSec: 31536000,
    expiredCookieMaxAgeSec: 0
  };

  const LOCALE = {
    numbers: "ru",
    time: "en-US",
    defaultLanguage: "en-US"
  };

  const API_PARAMS = {
    refreshAccount: "refresh_account",
    exchangeWorkspaceToken: "exchange_workspace_token",
    workspaceId: "workspace_id",
    reason: "reason",
    setCurrentAccount: "setCurrentAccount",
    clientVersion: "prod",
    defaultResidencyRegion: "no_constraint"
  };

  const HTTP = {
    acceptAll: "*/*",
    contentTypeJson: "application/json",
    credentialsInclude: "include",
    methodPost: "POST",
    modeCors: "cors",
    cacheNoStore: "no-store",
    cacheNoCache: "no-cache"
  };

  const MIME_TYPES = {
    textPlain: "text/plain",
    clipboardText: "text"
  };

  const COOKIE_NAMES = {
    account: "_account",
    residencyRegion: "_account_residency_region",
    routingOverride: "_account_routing_override",
    fedramp: "_account_is_fedramp"
  };

  const COOKIE_OPTIONS = {
    attributes: "; Path=/; Secure; SameSite=Lax"
  };

  const EXPORT_DEFAULTS = {
    userName: "user",
    recordType: "codex"
  };

  // Local storage and ChatGPT API paths.
  const STORAGE_KEYS = {
    config: "edu_raider_config_v1",
    currentAccount: "oai/apps/currentAccount",
    accountSwitchSessions: "oai/apps/accountSwitchSessions"
  };

  const ENDPOINTS = {
    session: "/api/auth/session",
    accounts: "/backend-api/accounts",
    settings: "/settings",
    usersSummary: "/users?limit=1&offset=0",
    invitesSummary: "/invites?limit=1&offset=0",
    invitesPrefix: "/invites/"
  };

  const SESSION_PATHS = {
    token: ["accessToken", "access_token"],
    email: ["user.email", "email"],
    accountId: ["account.id", "account_id", "accountId", "user.account_id", "user.accountId"],
    expires: ["expires", "expired"]
  };

  // Enum-like constants.
  const Route = {
    REQUEST: "request",
    ACCEPT: "accept"
  };

  const ROUTE_TEXT = {
    [Route.REQUEST]: { started: "Запрос", done: "запрошено", ok: "запрошен", fail: "запрос провален" },
    [Route.ACCEPT]: { started: "Принятие", done: "принято", ok: "принят", fail: "принятие провалено" }
  };

  const LogLevel = {
    INFO: "info",
    OK: "ok",
    WARN: "warn",
    ERR: "err"
  };

  const AccountKind = {
    PERSONAL: "personal",
    WORKSPACE: "workspace",
    UNKNOWN: "unknown"
  };

  // DOM selectors owned by the panel.
  const SELECTOR = {
    body: "#jr-body",
    user: "#jr-user",
    run: "#jr-run",
    accept: "#jr-accept",
    info: "#jr-info",
    copyLog: "#jr-copy-log",
    clearLog: "#jr-clear-log",
    personalSwitch: "#jr-personal-switch",
    list: "#jr-list",
    selectedCount: "#jr-selcount",
    all: "#jr-all",
    newId: "#jr-new-id",
    newComment: "#jr-new-cmt",
    add: "#jr-add",
    token: "#jr-token",
    tokenApply: "#jr-tok-apply",
    tokenClear: "#jr-tok-clear",
    exportToken: "#jr-export",
    copySession: "#jr-copy-session",
    importList: "#jr-import-list",
    copySelected: "#jr-copy-selected",
    copyAccessTokens: "#jr-copy-access-tokens",
    addDefaults: "#jr-add-defaults",
    deleteSelected: "#jr-delete-selected",
    minimize: "#jr-min",
    cubik: "#jr-cubik",
    infoClose: "#jr-info-close",
    workspaceName: ".jr-ws",
    infoBody: ".jr-info-body",
    infoAdd: "#jr-info-add"
  };

  const HAS_GM = (typeof GM_getValue === "function" && typeof GM_setValue === "function");

  try {
    const cleanup = window[INSTANCE_KEY];
    if (typeof cleanup === "function") cleanup();
  } catch (_) { }

  function normalizeId(value) {
    return String(value || "").trim().split(/[\s,]+/)[0];
  }

  function splitIds(raw) {
    return [...new Set(String(raw || "").split(/[\s,]+/).map(normalizeId).filter(Boolean))];
  }

  function normalizeItem(item) {
    if (typeof item === "string") return { id: normalizeId(item), comment: "" };
    if (!item || typeof item !== "object") return null;
    return { id: normalizeId(item.id), comment: String(item.comment || "").trim() };
  }

  function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      const normalized = normalizeItem(item);
      if (!normalized || !normalized.id || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      out.push(normalized);
    });
    return out;
  }

  function positiveInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  function intAtLeast(value, fallback, min) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  }

  function parseStoredConfig(value) {
    if (!value) return {};
    if (typeof value === "string") return JSON.parse(value);
    return value && typeof value === "object" ? value : {};
  }

  function readStoredConfig() {
    if (HAS_GM) {
      try {
        const value = GM_getValue(STORAGE_KEYS.config, null);
        if (value != null) return { saved: parseStoredConfig(value), exists: true };
      } catch (_) { }
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.config);
        if (raw != null) return { saved: parseStoredConfig(raw), exists: true };
      } catch (_) { }
    }
    return { saved: {}, exists: false };
  }

  function loadConfig() {
    const stored = readStoredConfig();
    const saved = stored.saved && typeof stored.saved === "object" && !Array.isArray(stored.saved) ? stored.saved : {};
    const cfg = {
      items: dedupeItems(saved.items),
      delayMs: intAtLeast(saved.delayMs, CONFIG_DEFAULTS.delayMs, 0),
      maxRetries: intAtLeast(saved.maxRetries, CONFIG_DEFAULTS.maxRetries, 0),
      retryBackoffMs: intAtLeast(saved.retryBackoffMs, CONFIG_DEFAULTS.retryBackoffMs, 0),
      sessionPollMs: Math.max(LIMITS.minSessionPollMs, positiveInt(saved.sessionPollMs, CONFIG_DEFAULTS.sessionPollMs)),
      panelWidth: CONFIG_DEFAULTS.panelWidth,
      collapsed: saved.collapsed === true,
      collapsedIconPos: clampCollapsedIconPos(saved.collapsedIconPos)
    };
    if (!stored.exists && !cfg.items.length) cfg.items = dedupeItems(DEFAULT_WORKSPACE_ITEMS);
    return cfg;
  }
  function saveConfig() {
    if (HAS_GM) { try { GM_setValue(STORAGE_KEYS.config, CONFIG); return; } catch (_) { } }
    try { localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(CONFIG)); } catch (_) { }
  }

  let CONFIG = loadConfig();

  const STATE = {
    at: "",
    manualSession: null,
    session: null,
    email: "",
    accountId: "",
    deviceId: createDeviceId(),
    running: false,
    loggedSession: false
  };
  let refreshPromise = null;
  let refreshTimerId = 0;
  let domReadyHandler = null;
  let keydownHandler = null;
  let booted = false;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function shortId(id) { return (id || "").slice(0, 8); }
  function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function createDeviceId() {
    const c = window.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
    return hex.slice(0, 4).join("") + "-" + hex.slice(4, 6).join("") + "-" + hex.slice(6, 8).join("") + "-" + hex.slice(8, 10).join("") + "-" + hex.slice(10).join("");
  }
  function hasItem(id) {
    const normalized = normalizeId(id);
    return !!normalized && CONFIG.items.some(item => item.id === normalized);
  }
  function addConfigItem(id, comment) {
    const normalized = normalizeId(id);
    if (!normalized || hasItem(normalized)) return false;
    CONFIG.items.unshift({ id: normalized, comment: String(comment || "").trim() });
    return true;
  }
  function clearSession() {
    STATE.at = "";
    STATE.session = null;
    STATE.email = "";
    STATE.accountId = "";
    STATE.manualSession = null;
    STATE.loggedSession = false;
    if (listEl) renderList();
    updatePersonalSwitchState();
  }
  function syncSelected() {
    const existing = new Set(CONFIG.items.map(item => item.id));
    selected.forEach(id => { if (!existing.has(id)) selected.delete(id); });
  }
  function apiHeaders() {
    return {
      accept: HTTP.acceptAll,
      authorization: "Bearer " + STATE.at,
      "content-type": HTTP.contentTypeJson,
      "oai-device-id": STATE.deviceId,
      "oai-language": navigator.language || LOCALE.defaultLanguage
    };
  }
  function accountUrl(wsId, suffix) {
    return ENDPOINTS.accounts + "/" + encodeURIComponent(normalizeId(wsId)) + suffix;
  }
  function getConcurrencyLimit(total) {
    if (!total) return 0;
    return Math.min(FIXED_CONCURRENCY, total);
  }
  async function runQueue(items, limit, task) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const idx = next++;
        await task(items[idx], idx);
      }
    };
    await Promise.all(Array.from({ length: limit }, () => worker()));
  }
  function formatWorkspaceList(items) {
    return dedupeItems(items).map(item => item.id + (item.comment ? "|" + item.comment : "")).join("\n");
  }
  function parseWorkspaceList(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];
    if (text.charAt(0) === "{" || text.charAt(0) === "[") throw new Error("формат: ID или ID|комментарий");
    const items = [];
    text.split(/\r?\n/).forEach(line => {
      const row = line.trim();
      if (!row) return;
      const sep = row.indexOf("|");
      if (sep >= 0) {
        items.push({ id: normalizeId(row.slice(0, sep)), comment: row.slice(sep + 1).trim() });
        return;
      }
      splitIds(row).forEach(id => items.push({ id: id, comment: "" }));
    });
    return dedupeItems(items);
  }
  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: HTTP.contentTypeJson });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function copyTextFallback(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) { }
    area.remove();
    return copied;
  }
  async function copyText(text, okMessage) {
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text, MIME_TYPES.clipboardText);
        log(okMessage, LogLevel.OK);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        log(okMessage, LogLevel.OK);
        return;
      }
      if (copyTextFallback(text)) {
        log(okMessage, LogLevel.OK);
        return;
      }
      log("Буфер: запись недоступна", LogLevel.WARN);
    } catch (e) {
      if (copyTextFallback(text)) {
        log(okMessage, LogLevel.OK);
        return;
      }
      log("Буфер: " + (e && e.message ? e.message : String(e)), LogLevel.WARN);
    }
  }
  function toIsoDate(value) {
    if (!value || typeof value === "boolean") return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  function safeFilenamePart(value) {
    const cleaned = String(value || EXPORT_DEFAULTS.userName).trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, LIMITS.safeFilenamePartLength);
    return cleaned || EXPORT_DEFAULTS.userName;
  }
  function displayValue(value) {
    if (value == null || value === "") return "";
    if (typeof value !== "object") return String(value);
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }
  function getSelectedIds() {
    syncSelected();
    return CONFIG.items.filter(i => i.id && selected.has(i.id)).map(i => i.id);
  }
  function updateSelCount() {
    if (selCountEl) selCountEl.textContent = selected.size + "/" + CONFIG.items.length;
  }

  function updateAllState() {
    if (!allChkEl) return;
    allChkEl.checked = CONFIG.items.length > 0 && selected.size === CONFIG.items.length;
    allChkEl.indeterminate = selected.size > 0 && selected.size < CONFIG.items.length;
  }

  async function fetchSession() {
    const res = await fetch(ENDPOINTS.session, { headers: { accept: HTTP.acceptAll }, credentials: HTTP.credentialsInclude });
    if (!res.ok) throw new Error("session HTTP " + res.status);
    return res.json();
  }

  async function fetchJsonOrHttpError(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) return { _err: "HTTP " + res.status };
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { _err: "Ответ не JSON" }; }
  }

  function sessionValue(session, keys) {
    for (const key of keys) {
      const parts = key.split(".");
      let cur = session;
      for (const part of parts) cur = cur && cur[part];
      if (cur != null && cur !== "") return cur;
    }
    return "";
  }

  function sessionInfo(session) {
    return {
      token: sessionValue(session, SESSION_PATHS.token),
      email: sessionValue(session, SESSION_PATHS.email),
      account_id: sessionValue(session, SESSION_PATHS.accountId),
      expires: sessionValue(session, SESSION_PATHS.expires)
    };
  }

  function parseSessionInput(raw) {
    raw = (raw || "").trim();
    if (!raw) return { session: null, error: "" };
    if (raw.charAt(0) !== "{") return { session: null, error: "Нужен JSON из " + ENDPOINTS.session };
    try {
      const session = JSON.parse(raw);
      const info = sessionInfo(session);
      if (!info.token) return { session: null, error: "Нет " + SESSION_PATHS.token[0] + " в JSON сессии" };
      return { session: session, error: "" };
    } catch (_) {
      return { session: null, error: "Неверный JSON" };
    }
  }

  function applySession(session, silent) {
    const info = sessionInfo(session);
    if (!info.token) return false;
    const previousAccountId = STATE.accountId;
    STATE.at = info.token;
    STATE.session = session;
    STATE.email = info.email || "";
    STATE.accountId = info.account_id || "";
    updateUserBar({ email: info.email, account_id: info.account_id }, LogLevel.OK);
    if (normalizeId(previousAccountId) !== normalizeId(STATE.accountId) && listEl) renderList();
    if (!silent) log("Сессия применена: " + (info.email || shortId(info.account_id)), LogLevel.OK);
    return true;
  }

  async function doRefreshSession() {
    if (STATE.manualSession) {
      if (!applySession(STATE.manualSession, true)) {
        clearSession();
        updateUserBar(null, LogLevel.WARN);
      }
      return;
    }
    try {
      const s = await fetchSession();
      const info = sessionInfo(s);
      if (info.token) {
        applySession(s, true);
        const wasEmpty = !STATE.loggedSession;
        if (wasEmpty) {
          const ctx = accountContext(STATE.accountId, null);
          log("Сессия: " + (info.email || "?") + " · " + ctx.label + " · " + ctx.name + " · " + shortId(STATE.accountId), LogLevel.OK);
          STATE.loggedSession = true;
        }
      } else {
        if (STATE.loggedSession) { log("Сессия истекла: нет " + SESSION_PATHS.token[0], LogLevel.WARN); STATE.loggedSession = false; }
        clearSession();
        updateUserBar(null, LogLevel.WARN);
      }
    } catch (e) {
      if (STATE.loggedSession) { log("Сессия недоступна: " + e.message, LogLevel.WARN); STATE.loggedSession = false; }
      updateUserBar(null, LogLevel.ERR);
    }
  }

  async function refreshSession() {
    if (!refreshPromise) {
      refreshPromise = doRefreshSession().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  function exportSessionData() {
    if (!STATE.at) { log("Нет сессии", LogLevel.ERR); return; }
    const info = sessionInfo(STATE.session || {});
    const email = String(info.email || EXPORT_DEFAULTS.userName);
    const prefix = safeFilenamePart(email.split("@")[0]);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const expIso = toIsoDate(info.expires);
    const exportData = [{
      id_token: "",
      access_token: STATE.at,
      refresh_token: "",
      account_id: STATE.accountId || "",
      last_refresh: now.toISOString(),
      email: email,
      type: EXPORT_DEFAULTS.recordType,
      expired: expIso
    }];
    const filename = prefix + "_" + today + ".json";
    downloadJson(exportData, filename);
    log("Экспорт: " + filename, LogLevel.OK);
  }

  async function copySessionData() {
    try {
      const session = await fetchSession();
      await copyText(JSON.stringify(session, null, 2), "Сессия скопирована");
    } catch (e) {
      log("Копия сессии: " + (e && e.message ? e.message : String(e)), LogLevel.ERR);
    }
  }

  async function sendOne(wsId, route, attempt) {
    attempt = attempt || 0;
    const routeText = ROUTE_TEXT[route] || ROUTE_TEXT[Route.REQUEST];
    const url = accountUrl(wsId, ENDPOINTS.invitesPrefix + route);
    try {
      const res = await fetch(url, { method: HTTP.methodPost, headers: apiHeaders(), body: "{}", mode: HTTP.modeCors, credentials: HTTP.credentialsInclude });
      if (res.ok) { log(routeText.ok + ": " + shortId(wsId), LogLevel.OK); return true; }
      log(routeText.fail + ": " + shortId(wsId) + " HTTP " + res.status, LogLevel.WARN);
      if (res.status === 401 || res.status === 403) {
        if (!STATE.manualSession) await refreshSession();
        if (attempt < CONFIG.maxRetries) { await sleep(LIMITS.unauthorizedRetryDelayMs); return sendOne(wsId, route, attempt + 1); }
        return false;
      }
      if (attempt < CONFIG.maxRetries) {
        await sleep(CONFIG.retryBackoffMs * (attempt + 1));
        return sendOne(wsId, route, attempt + 1);
      }
      return false;
    } catch (e) {
      if (attempt < CONFIG.maxRetries) { await sleep(CONFIG.retryBackoffMs); return sendOne(wsId, route, attempt + 1); }
      return false;
    }
  }

  async function runAll(route) {
    if (STATE.running) { log("Операция уже выполняется", LogLevel.WARN); return; }
    if (!STATE.at) {
      await refreshSession();
      if (!STATE.at) { log("Нет сессии", LogLevel.ERR); return; }
    }
    const ids = getSelectedIds();
    if (!ids.length) { log("ID не выбраны", LogLevel.ERR); return; }

    const threadLimit = getConcurrencyLimit(ids.length);
    STATE.running = true;
    setBtns(false);
    const routeText = ROUTE_TEXT[route] || ROUTE_TEXT[Route.REQUEST];
    log(routeText.started + ": ID " + ids.length + ", потоков " + threadLimit, LogLevel.INFO);

    let ok = 0;
    try {
      await runQueue(ids, threadLimit, async ws => {
        if (await sendOne(ws, route)) ok++;
        await sleep(CONFIG.delayMs);
      });
      log("Итог: " + ok + "/" + ids.length + " " + routeText.done + (ok === ids.length ? "" : ", ошибок " + (ids.length - ok)), ok === ids.length ? LogLevel.OK : LogLevel.WARN);
    } catch (e) {
      log("Ошибка операции: " + (e && e.message ? e.message : String(e)), LogLevel.ERR);
    } finally {
      STATE.running = false;
      setBtns(true);
    }
  }

  let panelBody, userBarEl, reqBtnEl, accBtnEl, infoBtnEl, copyLogBtnEl, clearLogBtnEl, personalBtnEl, listEl, selCountEl,
    newIdEl, newCmtEl, addBtnEl, allChkEl, tokenEl, applyTokBtn, clearTokBtn,
    importListBtnEl, copySelectedBtnEl, copyAccessTokensBtnEl, addDefaultsBtnEl, deleteSelectedBtnEl;
  let selected = new Set();
  let infoModalBg = null, infoModalData = null;
  let dragIndex = -1;

  function setBtns(enabled) {
    [reqBtnEl, accBtnEl, infoBtnEl, copyLogBtnEl, clearLogBtnEl, personalBtnEl, addBtnEl, applyTokBtn, clearTokBtn,
      importListBtnEl, copySelectedBtnEl, copyAccessTokensBtnEl, addDefaultsBtnEl, deleteSelectedBtnEl].forEach(b => { if (b) b.disabled = !enabled; });
    [newIdEl, newCmtEl, tokenEl, allChkEl].forEach(el => { if (el) el.disabled = !enabled; });
  }
  function clampCollapsedIconPos(pos) {
    if (!pos || typeof pos !== "object") return null;
    const size = LIMITS.collapsedIconSize;
    const maxLeft = Math.max(0, window.innerWidth - size);
    const maxTop = Math.max(0, window.innerHeight - size);
    const left = Math.min(Math.max(parseInt(pos.left, 10) || 0, 0), maxLeft);
    const top = Math.min(Math.max(parseInt(pos.top, 10) || 0, 0), maxTop);
    return { left: left, top: top };
  }
  function applyPanelPosition(panel) {
    if (!panel) return;
    const pos = CONFIG.collapsed ? clampCollapsedIconPos(CONFIG.collapsedIconPos) : null;
    if (pos) {
      panel.style.left = pos.left + "px";
      panel.style.top = pos.top + "px";
      panel.style.right = "auto";
    } else {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
    }
  }
  function setCollapsed(panel, collapsed) {
    CONFIG.collapsed = collapsed;
    panel.classList.toggle("collapsed", collapsed);
    applyPanelPosition(panel);
    saveConfig();
  }
  function bindCollapsedIconDrag(panel, cubik) {
    let dragging = false;
    let moved = false;
    let suppressClick = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    cubik.addEventListener("click", e => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    cubik.addEventListener("pointerdown", e => {
      if (!panel.classList.contains("collapsed") || e.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      cubik.setPointerCapture(e.pointerId);
    });
    cubik.addEventListener("pointermove", e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > LIMITS.dragStartThresholdPx || Math.abs(dy) > LIMITS.dragStartThresholdPx) moved = true;
      if (!moved) return;
      CONFIG.collapsedIconPos = clampCollapsedIconPos({ left: startLeft + dx, top: startTop + dy });
      applyPanelPosition(panel);
    });
    cubik.addEventListener("pointerup", e => {
      if (!dragging) return;
      dragging = false;
      suppressClick = moved;
      if (moved) saveConfig();
      try { cubik.releasePointerCapture(e.pointerId); } catch (_) { }
    });
    cubik.addEventListener("pointercancel", e => {
      dragging = false;
      try { cubik.releasePointerCapture(e.pointerId); } catch (_) { }
    });
  }

  function explicitAccountKind(obj) {
    if (!obj || typeof obj !== "object") return "";
    const boolKeys = ["isPersonal", "is_personal", "personal", "isPersonalAccount", "isPersonalWorkspace", "is_personal_workspace"];
    for (const key of boolKeys) {
      if (obj[key] === true) return AccountKind.PERSONAL;
      if (obj[key] === false) return AccountKind.WORKSPACE;
    }
    const wsKeys = ["isWorkspace", "is_workspace", "workspace", "isWorkspaceAccount"];
    for (const key of wsKeys) {
      if (obj[key] === true) return AccountKind.WORKSPACE;
      if (obj[key] === false) return AccountKind.PERSONAL;
    }
    const textKeys = ["type", "account_type", "accountType", "workspace_type", "workspaceType", "structure"];
    for (const key of textKeys) {
      const value = String(obj[key] || "").trim().toLowerCase();
      if (!value) continue;
      if (["personal", "individual"].indexOf(value) !== -1) return AccountKind.PERSONAL;
      if (["workspace", "team", "enterprise", "business", "organization", "org"].indexOf(value) !== -1) return AccountKind.WORKSPACE;
    }
    return "";
  }

  function getAccountSwitchEntry(accountId) {
    const id = normalizeId(accountId);
    if (!id) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.accountSwitchSessions);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      for (const acc of arr) {
        if (!acc || !Array.isArray(acc.workspaces)) continue;
        for (const ws of acc.workspaces) {
          const wsId = normalizeId(ws && (ws.workspaceAccountId || ws.workspace_account_id || ws.accountId || ws.account_id || ws.id));
          if (wsId === id) return { account: acc, workspace: ws };
        }
        const accId = normalizeId(acc.accountId || acc.account_id || acc.id);
        if (accId === id) return { account: acc, workspace: null };
      }
    } catch (_) { }
    return null;
  }

  function getSwitchWorkspaceMap() {
    const map = new Map();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.accountSwitchSessions);
      if (!raw) return map;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return map;
      for (const acc of arr) {
        if (!acc || !Array.isArray(acc.workspaces)) continue;
        for (const ws of acc.workspaces) {
          const wsId = normalizeId(ws && (ws.workspaceAccountId || ws.workspace_account_id || ws.accountId || ws.account_id || ws.id));
          if (wsId && !map.has(wsId)) map.set(wsId, { account: acc, workspace: ws });
        }
      }
    } catch (_) { }
    return map;
  }

  function switchRefreshUrl() {
    const url = new URL(location.href);
    url.pathname = "/";
    url.search = "";
    url.searchParams.set(API_PARAMS.refreshAccount, "true");
    return url.toString();
  }

  function setCookie(name, value, maxAge) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; Max-Age=" + (maxAge || LIMITS.defaultCookieMaxAgeSec) + COOKIE_OPTIONS.attributes;
  }

  function deleteCookie(name) {
    document.cookie = name + "=; Max-Age=" + LIMITS.expiredCookieMaxAgeSec + COOKIE_OPTIONS.attributes;
  }

  function applyAccountState(storageValue, account) {
    try {
      localStorage.setItem(STORAGE_KEYS.currentAccount, JSON.stringify(storageValue));
    } catch (_) { }
    setCookie(COOKIE_NAMES.account, storageValue);
    if (account && account.workspace && account.workspace.isPersonalWorkspace === true) {
      deleteCookie(COOKIE_NAMES.residencyRegion);
      deleteCookie(COOKIE_NAMES.routingOverride);
      setCookie(COOKIE_NAMES.fedramp, "false");
      return;
    }
    const ws = account && account.workspace ? account.workspace : {};
    setCookie(COOKIE_NAMES.residencyRegion, ws.residencyRegion || ws.residency_region || API_PARAMS.defaultResidencyRegion);
    setCookie(COOKIE_NAMES.fedramp, String(ws.isFedrampCompliantWorkspace === true || ws.is_fedramp_compliant_workspace === true));
  }

  async function exchangeWorkspaceToken(accountId) {
    const id = normalizeId(accountId);
    if (!id) throw new Error("нет account id");
    const url = new URL(ENDPOINTS.session, location.origin);
    url.searchParams.set(API_PARAMS.exchangeWorkspaceToken, "true");
    url.searchParams.set(API_PARAMS.workspaceId, id);
    url.searchParams.set(API_PARAMS.reason, API_PARAMS.setCurrentAccount);
    const headers = {
      accept: HTTP.acceptAll,
      "cache-control": HTTP.cacheNoCache,
      "OAI-Device-Id": STATE.deviceId || createDeviceId(),
      "OAI-Client-Version": API_PARAMS.clientVersion,
      "X-OpenAI-Target-Path": ENDPOINTS.session,
      "X-OpenAI-Target-Route": ENDPOINTS.session
    };
    const res = await fetch(url.toString(), { credentials: HTTP.credentialsInclude, cache: HTTP.cacheNoStore, headers: headers });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (data && data.workspaceTokenExchangeError) {
      throw new Error(data.workspaceTokenExchangeError.message || data.workspaceTokenExchangeError.code || "exchange error");
    }
    if (data && data.error) throw new Error(data.error.message || data.error.code || String(data.error));
    if (!res.ok) throw new Error("exchange HTTP " + res.status);
    if (!data || typeof data.accessToken !== "string" || !data.accessToken) throw new Error("exchange: нет accessToken");
    return data || {};
  }

  async function switchToStoredAccount(storageValue, exchangeAccountId, label) {
    if (STATE.running) { log("Операция уже выполняется", LogLevel.WARN); return; }
    try {
      STATE.running = true;
      setBtns(false);
      log("Переключение: " + label, LogLevel.INFO);
      const entry = getSwitchWorkspaceMap().get(normalizeId(exchangeAccountId));
      await exchangeWorkspaceToken(exchangeAccountId);
      applyAccountState(storageValue, entry);
      location.assign(switchRefreshUrl());
    } catch (e) {
      STATE.running = false;
      log("Переключение: " + (e && e.message ? e.message : String(e)), LogLevel.ERR);
      setBtns(true);
    }
  }

  function switchToWorkspace(wsId) {
    const id = normalizeId(wsId);
    const entry = getSwitchWorkspaceMap().get(id);
    if (!entry || !entry.workspace) {
      log("Аккаунт не подключен к workspace: " + shortId(id), LogLevel.WARN);
      return;
    }
    if (entry.workspace.isDeactivated === true) {
      log("Workspace деактивирован: " + shortId(id), LogLevel.WARN);
      return;
    }
    const name = getWorkspaceName(id) || shortId(id);
    switchToStoredAccount(id, id, name);
  }

  function switchToPersonal() {
    const personal = Array.from(getSwitchWorkspaceMap().values()).find(entry => entry && entry.workspace && entry.workspace.isPersonalWorkspace === true);
    const personalId = normalizeId(personal && personal.workspace && (personal.workspace.workspaceAccountId || personal.workspace.workspace_account_id || personal.workspace.accountId || personal.workspace.account_id || personal.workspace.id));
    if (!personalId) {
      log("Личный аккаунт недоступен для переключения", LogLevel.ERR);
      return;
    }
    const name = (personal.workspace.workspaceName || personal.workspace.workspace_name || "Личка");
    switchToStoredAccount(AccountKind.PERSONAL, personalId, name);
  }

  function updatePersonalSwitchState() {
    if (!personalBtnEl) return;
    const ctx = accountContext(STATE.accountId, null);
    personalBtnEl.classList.toggle("jr-btn-active", ctx.isPersonal);
    personalBtnEl.title = ctx.isPersonal ? "Личный аккаунт активен" : "Переключиться на личный аккаунт";
  }

  function getWorkspaceName(accountId) {
    const entry = getAccountSwitchEntry(accountId);
    if (!entry) return "";
    const ws = entry.workspace || entry.account || {};
    return ws.workspaceName || ws.workspace_name || ws.name || ws.displayName || ws.display_name || "";
  }

  function workspaceLabel(id, workspace, fallback) {
    const ws = workspace || {};
    return ws.workspaceName || ws.workspace_name || ws.name || ws.displayName || ws.display_name || fallback || shortId(id);
  }

  function logSkippedAccessTokenReasons(skipped) {
    skipped.slice(0, MAX_SKIP_LOG_LINES).forEach(reason => log("AccessToken skip: " + reason, LogLevel.WARN));
    if (skipped.length > MAX_SKIP_LOG_LINES) {
      log("AccessToken skip: ещё " + (skipped.length - MAX_SKIP_LOG_LINES), LogLevel.WARN);
    }
  }

  function sessionAccountKind(accountId) {
    const id = normalizeId(accountId);
    const session = STATE.session || {};
    const candidates = [session.account, session.current_account, session.user && session.user.account, session.user];
    for (const obj of candidates) {
      if (!obj || typeof obj !== "object") continue;
      const objId = normalizeId(obj.id || obj.account_id || obj.accountId);
      if (objId && id && objId !== id) continue;
      const kind = explicitAccountKind(obj);
      if (kind) return kind;
    }
    return "";
  }

  function accountContext(accountId, settings) {
    const id = normalizeId(accountId);
    const entry = getAccountSwitchEntry(id) || {};
    const localObj = entry.workspace || entry.account || {};
    const localName = getWorkspaceName(id);
    const settingsName = settings && typeof settings === "object" && !settings._err ? String(settings.public_display_name || "").trim() : "";
    let kind = explicitAccountKind(settings) || explicitAccountKind(localObj) || explicitAccountKind(entry.account) || sessionAccountKind(id);
    if (!kind) kind = AccountKind.UNKNOWN;
    return {
      id: id,
      kind: kind,
      isCurrent: !!id && id === normalizeId(STATE.accountId),
      isPersonal: kind === AccountKind.PERSONAL,
      isWorkspace: kind === AccountKind.WORKSPACE,
      name: settingsName || localName || shortId(id) || "Аккаунт",
      localName: localName,
      settingsName: settingsName,
      icon: kind === AccountKind.PERSONAL ? "⌂" : kind === AccountKind.WORKSPACE ? "▦" : "?",
      label: kind === AccountKind.PERSONAL ? "Личка" : kind === AccountKind.WORKSPACE ? "Workspace" : "Тип неизвестен"
    };
  }

  function updateUserBar(info, status, settings) {
    if (!userBarEl) return;
    if (info && (info.email || info.account_id)) {
      const aid = info.account_id || "";
      const ctx = accountContext(aid, settings || null);
      let html = '<span class="jr-dot jr-dot-ok">●</span> <b>' + escHtml(info.email || "Сессия") + "</b> · " +
        '<code class="jr-account">' + escHtml(shortId(aid)) + "</code>";
      html += ' · <span class="jr-ws jr-ws-' + escHtml(ctx.kind) + '" title="' + escHtml(ctx.label + " · " + aid) + '">' +
        '<span class="jr-kind">' + escHtml(ctx.icon) + '</span>' + escHtml(ctx.name) + '</span>';
      userBarEl.innerHTML = html;
      const wsEl = userBarEl.querySelector(SELECTOR.workspaceName);
      if (wsEl) wsEl.addEventListener("click", () => {
        if (newIdEl) newIdEl.value = aid;
        if (newCmtEl) newCmtEl.value = ctx.name;
        if (newIdEl) newIdEl.focus();
      });
    } else {
      const st = status === LogLevel.ERR ? LogLevel.ERR : LogLevel.WARN;
      userBarEl.innerHTML = '<span class="jr-dot jr-dot-' + st + '">●</span> Нет сессии';
    }
    updatePersonalSwitchState();
  }

  function clearDropMarks() {
    if (!listEl) return;
    listEl.querySelectorAll(".jr-drop-before,.jr-drop-after").forEach(el => {
      el.classList.remove("jr-drop-before", "jr-drop-after");
    });
  }

  function clearDragMarks() {
    clearDropMarks();
    if (!listEl) return;
    listEl.querySelectorAll(".jr-item-dragging").forEach(el => el.classList.remove("jr-item-dragging"));
  }

  function moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= CONFIG.items.length) return false;
    if (toIndex < 0) toIndex = 0;
    if (toIndex > CONFIG.items.length) toIndex = CONFIG.items.length;
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return false;
    const item = CONFIG.items.splice(fromIndex, 1)[0];
    if (fromIndex < toIndex) toIndex--;
    CONFIG.items.splice(toIndex, 0, item);
    saveConfig();
    renderList();
    return true;
  }

  function bindRowDrag(row, handle, idx) {
    handle.draggable = true;
    handle.addEventListener("dragstart", e => {
      dragIndex = idx;
      row.classList.add("jr-item-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(MIME_TYPES.textPlain, String(idx));
      }
    });
    handle.addEventListener("dragend", () => {
      dragIndex = -1;
      clearDragMarks();
    });
    row.addEventListener("dragover", e => {
      if (dragIndex < 0 || dragIndex === idx) return;
      e.preventDefault();
      clearDropMarks();
      const rect = row.getBoundingClientRect();
      row.classList.add(e.clientY > rect.top + rect.height / 2 ? "jr-drop-after" : "jr-drop-before");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", e => {
      if (dragIndex < 0 || dragIndex === idx) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const toIndex = idx + (e.clientY > rect.top + rect.height / 2 ? 1 : 0);
      const fromIndex = dragIndex;
      dragIndex = -1;
      clearDragMarks();
      moveItem(fromIndex, toIndex);
    });
  }

  function renderList() {
    if (!listEl) return;
    syncSelected();
    listEl.innerHTML = "";
    updateAllState();
    const switchMap = getSwitchWorkspaceMap();
    const currentAccountId = normalizeId(STATE.accountId);
    if (!CONFIG.items.length) {
      const empty = document.createElement("div");
      empty.className = "jr-empty";
      empty.textContent = "Список пуст";
      listEl.appendChild(empty);
      updateSelCount();
      return;
    }
    CONFIG.items.forEach((item, idx) => {
      const switchEntry = switchMap.get(item.id);
      const switchWorkspace = switchEntry && switchEntry.workspace;
      const isDeactivated = !!switchWorkspace && switchWorkspace.isDeactivated === true;
      const canSwitch = !!switchWorkspace && switchWorkspace.isDeactivated !== true;
      const isCurrent = !!currentAccountId && currentAccountId === item.id;
      const switchName = switchWorkspace ? (switchWorkspace.workspaceName || switchWorkspace.workspace_name || item.comment || shortId(item.id)) : "";
      const row = document.createElement("div");
      row.className = "jr-item" + (selected.has(item.id) ? " jr-item-sel" : "") + (canSwitch ? " jr-item-switchable" : "") + (isCurrent ? " jr-item-current" : "") + (isDeactivated ? " jr-item-deactivated" : "");

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "jr-chk";
      chk.checked = selected.has(item.id);
      chk.title = "Выбрать";
      chk.addEventListener("change", () => {
        if (chk.checked) selected.add(item.id); else selected.delete(item.id);
        row.classList.toggle("jr-item-sel", chk.checked);
        updateSelCount();
        updateAllState();
      });

      const idEl = document.createElement("span");
      idEl.className = "jr-item-id";
      idEl.title = item.id;
      idEl.textContent = item.id;

      const cmtEl = document.createElement("span");
      cmtEl.className = "jr-item-cmt";
      cmtEl.title = item.comment ? item.comment : "Двойной клик: редактировать";
      cmtEl.textContent = item.comment || "";
      cmtEl.addEventListener("dblclick", () => startEditComment(idx, cmtEl));

      const dragEl = document.createElement("span");
      dragEl.className = "jr-drag";
      dragEl.textContent = "↕";
      dragEl.title = "Перетащить";

      let switchEl;
      if (canSwitch) {
        switchEl = document.createElement("button");
        switchEl.type = "button";
        switchEl.className = "jr-switch-btn" + (isCurrent ? " jr-switch-current" : "");
        switchEl.title = isCurrent ? "Текущий workspace: " + switchName : "Переключиться: " + switchName;
        switchEl.setAttribute("aria-label", switchEl.title);
        switchEl.disabled = isCurrent;
        switchEl.innerHTML = isCurrent
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
        switchEl.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          switchToWorkspace(item.id);
        });
      } else {
        switchEl = document.createElement("span");
        switchEl.className = "jr-switch-missing" + (isDeactivated ? " jr-switch-deactivated" : "");
        switchEl.title = isDeactivated ? "Workspace деактивирован" : "Аккаунт не подключен к workspace";
        switchEl.setAttribute("aria-label", switchEl.title);
        switchEl.innerHTML = isDeactivated
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9 9 15"/><path d="m9 9 6 6"/></svg>';
      }

      row.appendChild(dragEl);
      row.appendChild(chk);
      row.appendChild(switchEl);
      row.appendChild(idEl);
      row.appendChild(cmtEl);
      bindRowDrag(row, dragEl, idx);
      listEl.appendChild(row);
    });
    updateSelCount();
  }

  function startEditComment(idx, cmtEl) {
    const item = CONFIG.items[idx];
    if (!item) return;
    const input = document.createElement("input");
    input.className = "jr-cmt-edit";
    input.type = "text";
    input.value = item.comment || "";
    input.maxLength = LIMITS.commentLength;
    input.placeholder = "Комментарий";
    cmtEl.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      if (save) {
        item.comment = input.value.trim();
        saveConfig();
      }
      renderList();
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
  }

  function addItem() {
    const id = normalizeId(newIdEl.value);
    if (!id) { newIdEl.focus(); return; }
    if (!addConfigItem(id, newCmtEl.value)) {
      log("ID уже есть", LogLevel.WARN);
      return;
    }
    saveConfig();
    renderList();
    newIdEl.value = "";
    newCmtEl.value = "";
    newIdEl.focus();
  }

  function copySelectedItems() {
    syncSelected();
    const items = CONFIG.items.filter(item => item.id && selected.has(item.id));
    if (!items.length) { log("ID не выбраны", LogLevel.WARN); return; }
    copyText(formatWorkspaceList(items), "Скопировано ID: " + items.length);
  }

  async function copySelectedWorkspaceAccessTokens() {
    if (STATE.running) { log("Операция уже выполняется", LogLevel.WARN); return; }
    syncSelected();
    const switchMap = getSwitchWorkspaceMap();
    const selectedItems = CONFIG.items.filter(item => item.id && selected.has(item.id));
    const items = [];
    const skipped = [];
    selectedItems.forEach(item => {
      const entry = switchMap.get(item.id);
      const workspace = entry && entry.workspace;
      const name = workspaceLabel(item.id, workspace, item.comment);
      if (!workspace) {
        skipped.push(name + " · не подключен");
        return;
      }
      if (workspace.isPersonalWorkspace === true) {
        skipped.push(name + " · личный аккаунт");
        return;
      }
      if (workspace.isDeactivated === true) {
        skipped.push(name + " · деактивирован");
        return;
      }
      items.push({ id: item.id, name: name, workspace: workspace });
    });
    if (!items.length) {
      log("AccessToken: выберите доступные workspace" + (skipped.length ? ", пропущено " + skipped.length : ""), LogLevel.WARN);
      logSkippedAccessTokenReasons(skipped);
      return;
    }
    try {
      STATE.running = true;
      setBtns(false);
      log("accessToken: запрос токена для выбранных workspace", LogLevel.INFO);
      logSkippedAccessTokenReasons(skipped);
      const tokens = new Array(items.length);
      let ok = 0;
      let done = 0;
      await runQueue(items.map((item, index) => ({ item: item, index: index })), getConcurrencyLimit(items.length), async task => {
        try {
          const data = await exchangeWorkspaceToken(task.item.id);
          if (!data || typeof data.accessToken !== "string" || !data.accessToken) throw new Error("нет accessToken");
          tokens[task.index] = data.accessToken;
          ok++;
          done++;
          log("AccessToken ok " + done + "/" + items.length + ": " + task.item.name + " · " + shortId(task.item.id), LogLevel.OK);
        } catch (e) {
          done++;
          log("AccessToken err " + done + "/" + items.length + ": " + task.item.name + " · " + (e && e.message ? e.message : String(e)), LogLevel.ERR);
        }
      });
      const text = tokens.filter(Boolean).join("\n");
      if (!text) throw new Error("нет accessToken");
      await copyText(text, "AccessToken скопированы: " + ok + "/" + items.length);
    } catch (e) {
      log("AccessToken: " + (e && e.message ? e.message : String(e)), LogLevel.ERR);
    } finally {
      STATE.running = false;
      setBtns(true);
    }
  }

  function deleteSelectedItems() {
    syncSelected();
    const items = CONFIG.items.filter(item => item.id && selected.has(item.id));
    if (!items.length) { log("ID не выбраны", LogLevel.WARN); return; }
    const ids = new Set(items.map(item => item.id));
    const confirmText = "Удалить выбранные ID?\n\n" + items.map(item => item.id + (item.comment ? " | " + item.comment : "")).join("\n");
    if (!confirm(confirmText)) return;
    CONFIG.items = CONFIG.items.filter(item => !ids.has(item.id));
    selected.clear();
    saveConfig();
    renderList();
    log("Удалено ID: " + ids.size, LogLevel.OK);
  }

  function addDefaultItems() {
    const existing = new Set(CONFIG.items.map(item => item.id));
    const added = [];
    DEFAULT_WORKSPACE_ITEMS.forEach(item => {
      if (existing.has(item.id)) return;
      existing.add(item.id);
      CONFIG.items.push({ id: item.id, comment: item.comment || "" });
      added.push(item);
    });
    if (!added.length) {
      log("Дефолтные ID уже в списке", LogLevel.WARN);
      return;
    }
    saveConfig();
    renderList();
    log("Добавлено дефолтных ID: " + added.length, LogLevel.OK);
  }

  function addImportedItems(raw) {
    const arr = parseWorkspaceList(raw);
    if (!arr.length) throw new Error("нет ID");
    const existing = new Set(CONFIG.items.map(item => item.id));
    const addedItems = [];
    arr.forEach(item => {
      if (existing.has(item.id)) return;
      existing.add(item.id);
      addedItems.push(item);
    });
    if (addedItems.length) {
      CONFIG.items = addedItems.concat(CONFIG.items);
      saveConfig();
      renderList();
    }
    log("Импорт ID: +" + addedItems.length, addedItems.length ? LogLevel.OK : LogLevel.WARN);
  }

  async function importList() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("чтение буфера недоступно");
      const raw = await navigator.clipboard.readText();
      addImportedItems(raw);
    } catch (e) {
      log("Импорт: " + e.message, LogLevel.ERR);
    }
  }

  function getLogText() {
    if (!panelBody) return "";
    return Array.from(panelBody.querySelectorAll(".jr-line"))
      .map(line => line.textContent || "")
      .filter(Boolean)
      .join("\n");
  }

  function copyLogText() {
    const text = getLogText();
    if (!text) {
      log("Лог пуст", LogLevel.WARN);
      return;
    }
    copyText(text, "Лог скопирован");
  }

  function clearLog() {
    if (panelBody) panelBody.textContent = "";
  }

  function fetchGroupInfo(wsId) {
    const base = accountUrl(wsId, "");
    const options = { headers: apiHeaders(), credentials: HTTP.credentialsInclude };
    return Promise.allSettled([
      fetchJsonOrHttpError(base + ENDPOINTS.settings, options),
      fetchJsonOrHttpError(base + ENDPOINTS.usersSummary, options),
      fetchJsonOrHttpError(base + ENDPOINTS.invitesSummary, options)
    ]).then(([s, u, i]) => ({
      settings: s.status === "fulfilled" ? s.value : { _err: String(s.reason) },
      users: u.status === "fulfilled" ? u.value : { _err: String(u.reason) },
      invites: i.status === "fulfilled" ? i.value : { _err: String(i.reason) }
    }));
  }

  function mutedTag() { return '<span class="jr-muted">—</span>'; }
  function boolTag(v) { return v === true ? '<span class="jr-yes">да</span>' : v === false ? '<span class="jr-no">нет</span>' : mutedTag(); }
  function valTag(x) {
    const value = displayValue(x);
    return value ? escHtml(value) : mutedTag();
  }
  function infoWorkspaceName(wsId, settings) {
    return accountContext(wsId, settings).name;
  }
  function responseTotal(data) {
    if (!data || typeof data !== "object") return null;
    if (typeof data.total === "number") return data.total;
    if (typeof data.count === "number") return data.count;
    if (typeof data.total_count === "number") return data.total_count;
    if (data.pagination && typeof data.pagination.total === "number") return data.pagination.total;
    return null;
  }
  function totalTag(data, personal) {
    const total = responseTotal(data);
    if (total != null) return valTag(total.toLocaleString(LOCALE.numbers));
    if (personal) return '<span class="jr-muted">недоступно для лички</span>';
    if (data && data._err) return '<span class="jr-info-err">' + escHtml(String(data._err)) + '</span>';
    return mutedTag();
  }
  function kvRow(k, vHtml) { return '<div class="jr-info-row"><span class="jr-info-k">' + escHtml(k) + '</span><span class="jr-info-v">' + (vHtml || mutedTag()) + '</span></div>'; }
  function section(title, rowsHtml) { return '<div class="jr-info-sec"><div class="jr-info-sec-h">' + escHtml(title) + '</div>' + rowsHtml + '</div>'; }

  function closeInfoModal() {
    if (infoModalBg) { infoModalBg.remove(); infoModalBg = null; infoModalData = null; }
  }

  function openInfoModal(wsId) {
    closeInfoModal();
    const bg = document.createElement("div");
    bg.className = "jr-info-modal-bg";
    bg.innerHTML =
      '<div class="jr-info-modal">' +
      '<div class="jr-info-head">' +
      '<span class="jr-info-title">Обзор · <code class="jr-title-id">' + escHtml(wsId) + '</code></span>' +
      '</div>' +
      '<div class="jr-info-body"><div class="jr-info-spin">Загрузка</div></div>' +
      '<div class="jr-info-actions">' +
      '<button class="jr-info-act" id="jr-info-add">Добавить</button>' +
      '<button class="jr-info-act" id="jr-info-close">Закрыть</button>' +
      '</div>' +
      '</div>';
    bg.addEventListener("click", e => { if (e.target === bg) closeInfoModal(); });
    bg.querySelector(SELECTOR.infoClose).addEventListener("click", closeInfoModal);
    bg.querySelector(SELECTOR.infoAdd).addEventListener("click", () => {
      const d = infoModalData || {};
      const name = infoWorkspaceName(wsId, d.settings || {});
      if (!addConfigItem(wsId, name)) { log("ID уже есть", LogLevel.WARN); return; }
      saveConfig();
      renderList();
      closeInfoModal();
    });
    document.body.appendChild(bg);
    infoModalBg = bg;
  }

  function renderInfoModal(wsId, data) {
    if (!infoModalBg) return;
    infoModalData = data;
    const body = infoModalBg.querySelector(SELECTOR.infoBody);
    if (data._err) {
      body.innerHTML = '<div class="jr-info-sec"><span class="jr-info-err">' + escHtml(String(data._err)) + '</span></div>';
      return;
    }
    const s = data.settings || {};
    const u = data.users || {};
    const inv = data.invites || {};
    const sh = s.share_settings || {};
    const b = s.beta_settings || {};
    const ctx = accountContext(wsId, s);
    let html = "";

    html += section(ctx.label, [
      kvRow("ID", valTag(wsId)),
      kvRow("type", valTag(ctx.kind === AccountKind.UNKNOWN ? "" : ctx.kind)),
      kvRow("public_display_name", valTag(s.public_display_name)),
      kvRow("local_name", valTag(ctx.localName)),
      kvRow("workspace_discoverable", boolTag(s.workspace_discoverable)),
      kvRow("auto_accept_requests", boolTag(s.auto_accept_requests)),
      kvRow("allow_external_domain_invites", boolTag(s.allow_external_domain_invites)),
      kvRow("disable_account_switching", boolTag(s.disable_account_switching)),
      kvRow("search_restrictions", valTag(s.search_restrictions)),
      kvRow("allow_third_party_gpts", valTag(s.allow_third_party_gpts))
    ].join(""));

    html += section("Состав", [
      kvRow("users", totalTag(u, ctx.isPersonal)),
      kvRow("invites", totalTag(inv, ctx.isPersonal)),
      kvRow("default_seat_type", valTag(s.default_seat_type)),
      kvRow("seat_type_credit_limits", valTag(s.seat_type_credit_limits))
    ].join(""));

    html += section("Доступ", [
      kvRow("gpt_share_setting", valTag(sh.gpt_share_setting)),
      kvRow("chat_share_setting", valTag(sh.chat_share_setting)),
      kvRow("workspace_referrals_enabled", boolTag(s.workspace_referrals_enabled))
    ].join(""));

    html += section("Beta", [
      kvRow("canvas", boolTag(b.canvas)),
      kvRow("browsing", boolTag(b.browsing)),
      kvRow("dalle", boolTag(b.dalle)),
      kvRow("code_interpreter", boolTag(b.code_interpreter)),
      kvRow("deep_research", boolTag(b.deep_research)),
      kvRow("hive", boolTag(b.hive)),
      kvRow("hermes", boolTag(b.hermes)),
      kvRow("training_allowed", boolTag(b.training_allowed)),
      kvRow("codex_admin", boolTag(b.codex_admin)),
      kvRow("codex_agent_network_access", boolTag(b.codex_agent_network_access)),
      kvRow("codex_device_code_auth", boolTag(b.codex_device_code_auth)),
      kvRow("codex_remote_control", boolTag(b.codex_remote_control)),
      kvRow("codex_slack_posting", boolTag(b.codex_slack_posting)),
      kvRow("sites", boolTag(b.sites)),
      kvRow("developer_mode", boolTag(b.developer_mode)),
      kvRow("agent_mode", boolTag(b.agent_mode)),
      kvRow("personal_access_tokens", boolTag(b.personal_access_tokens)),
      kvRow("enable_plugins", boolTag(b.enable_plugins)),
      kvRow("project_sharing", boolTag(b.project_sharing))
    ].join(""));

    const perms = Array.isArray(s.permissions) ? s.permissions : [];
    const models = perms.filter(p => p.indexOf(".model.") !== -1).map(p => p.replace("chatgpt.workspace.model.", "").replace(".access", ""));
    if (models.length) {
      html += '<div class="jr-info-sec"><div class="jr-info-sec-h">Модели (' + models.length + ')</div><div>' +
        models.map(m => '<span class="jr-info-tag">' + escHtml(m) + '</span>').join("") + '</div></div>';
    }
    const feats = perms.filter(p => p.indexOf(".feature.") !== -1).map(p => p.replace("chatgpt.workspace.feature.", "").replace(".access", ""));
    if (feats.length) {
      html += '<div class="jr-info-sec"><div class="jr-info-sec-h">Функции (' + feats.length + ')</div><div>' +
        feats.map(m => '<span class="jr-info-tag">' + escHtml(m) + '</span>').join("") + '</div></div>';
    }

    body.innerHTML = html;
  }

  async function showInfo(wsId) {
    wsId = normalizeId(wsId);
    if (!wsId) { log("Нет ID", LogLevel.ERR); return; }
    if (!STATE.at) {
      await refreshSession();
      if (!STATE.at) { log("Нет сессии", LogLevel.ERR); return; }
    }
    openInfoModal(wsId);
    try {
      const data = await fetchGroupInfo(wsId);
      renderInfoModal(wsId, data);
      const s = data.settings || {};
      if (normalizeId(wsId) === normalizeId(STATE.accountId)) {
        updateUserBar({ email: STATE.email, account_id: STATE.accountId }, LogLevel.OK, s);
      }
      const ctx = accountContext(wsId, s);
      const uT = responseTotal(data.users);
      const iT = responseTotal(data.invites);
      if (uT != null || iT != null) {
        log(ctx.name + ": пользователей " + (uT == null ? "—" : uT) + ", инвайтов " + (iT == null ? "—" : iT), LogLevel.OK);
      } else if (ctx.isPersonal) {
        log(ctx.name + ": личка, состав недоступен", LogLevel.OK);
      } else {
        log(ctx.name + ": состав недоступен, тип " + ctx.label, LogLevel.WARN);
      }
    } catch (e) {
      renderInfoModal(wsId, { _err: String(e) });
      log("Обзор: " + e.message, LogLevel.ERR);
    }
  }

  function buildPanel() {
    const css = `
      .jr-panel{position:fixed;top:10px;right:10px;width:${CONFIG.panelWidth}px;max-width:96vw;background:#0d1117;border:1px solid #30363d;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.6);z-index:99999;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Consolas,sans-serif;color:#c9d1d9;overflow:hidden}
      .jr-fill{flex:1}
      .jr-panel.collapsed{width:44px;height:44px;right:10px;background:transparent;border:0;box-shadow:none;overflow:visible}
      .jr-panel.collapsed .jr-head,.jr-panel.collapsed .jr-sub,.jr-panel.collapsed .jr-tok,.jr-panel.collapsed .jr-sec,.jr-panel.collapsed .jr-add,.jr-panel.collapsed .jr-body,.jr-panel.collapsed .jr-foot{display:none}
      .jr-panel.collapsed .jr-cubik{display:flex}
      .jr-cubik{position:relative;display:none;width:44px;height:44px;align-items:center;justify-content:center;cursor:pointer;font:900 22px/1 Consolas,monospace;color:#c9d1d9;background:#161b22;border:1px solid #30363d;border-radius:9px;box-shadow:0 8px 22px rgba(0,0,0,.38);user-select:none;touch-action:none;transition:.14s}.jr-cubik:hover{transform:translateY(-1px);background:#21262d;border-color:#484f58;color:#f0f6fc}.jr-cubik:active{transform:translateY(0)}
      .jr-head{padding:7px 12px;background:#161b22;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;gap:8px;align-items:center}
      .jr-brand-wrap{display:flex;align-items:center;gap:9px;min-width:0}.jr-title{font-size:14px;font-weight:700;line-height:1.05;color:#7ee787;font-family:Consolas,monospace;white-space:nowrap}
      .jr-hbtns{display:flex;gap:8px;align-items:center}
      .jr-ver{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:20px;padding:0 7px;border-radius:4px;font-size:10px;font-weight:700;background:#21262d;color:#8b949e;border:1px solid #30363d}
      .jr-gh,.jr-req{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;border:1px solid #30363d;border-radius:4px;background:#21262d;color:#8b949e;text-decoration:none;flex:0 0 auto;transition:.12s}.jr-gh:hover,.jr-req:hover{background:#30363d;color:#c9d1d9}.jr-gh svg{display:block;width:17px;height:17px;fill:currentColor}.jr-req svg{display:block;width:16px;height:16px;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;fill:none}
      .jr-hbtn{cursor:pointer;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #30363d;border-radius:5px;padding:0;font-size:12px;font-weight:700;line-height:1;background:#21262d;color:#c9d1d9}.jr-hbtn:hover{background:#30363d}.jr-min-btn{border-color:#34445c;background:#243044;color:#d8e7ff}.jr-min-btn:hover{background:#2d3c55;border-color:#4b6385;color:#eef6ff}
      .jr-sub{padding:7px 12px;background:#161b22;border-bottom:1px solid #30363d;font-size:11px;color:#8b949e}
      .jr-dot-ok{color:#3fb950}.jr-dot-warn{color:#d29922}.jr-dot-err{color:#f85149}.jr-account{background:#21262d;padding:2px 7px;border-radius:4px;color:#7ee787;border:1px solid #30363d;font-family:Consolas,monospace}.jr-ws{cursor:pointer;color:#f0883e;border-bottom:1px dotted #f0883e}.jr-kind{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:5px;border:1px solid #30363d;border-radius:4px;background:#21262d;color:#7ee787;font:700 10px/1 Consolas,monospace;vertical-align:middle}.jr-ws-personal .jr-kind{color:#58a6ff}.jr-ws-workspace .jr-kind{color:#7ee787}.jr-ws-unknown .jr-kind{color:#8b949e}
      .jr-tok{padding:9px 12px;border-bottom:1px solid #30363d}
      .jr-tok-row{display:flex;gap:6px;align-items:center}
      .jr-tok-in{flex:1;min-width:0;box-sizing:border-box;border:1px solid #30363d;background:#0d1117;color:#c9d1d9;border-radius:5px;outline:none;padding:6px 9px;font:10px/1.3 Consolas,monospace}.jr-tok-in:focus{border-color:#f0883e}
      .jr-tok-btn{cursor:pointer;border:1px solid #30363d;border-radius:5px;padding:6px 10px;font-size:11px;font-weight:700;color:#c9d1d9;flex:0 0 auto;transition:.12s}.jr-tok-apply{background:#238636;border-color:#238636;color:#fff}.jr-tok-apply:hover{background:#2ea043}.jr-tok-clear{background:#21262d;color:#8b949e}.jr-tok-clear:hover{background:#30363d}
      .jr-btn:disabled,.jr-add-btn:disabled,.jr-tok-btn:disabled{opacity:.5;cursor:not-allowed}
      .jr-sec{padding:4px 12px 11px;border-bottom:1px solid #30363d}
      .jr-list{max-height:182px;overflow:auto;border:1px solid #30363d;border-radius:6px;background:#0d1117}
      .jr-listhead{height:28px;display:grid;grid-template-columns:18px 16px auto 1fr auto;align-items:end;column-gap:8px;margin:0 0 6px 8px;font-size:10px;color:#8b949e;font-weight:700}
      .jr-listhead-title{grid-column:1;align-self:end;justify-self:center;padding-bottom:2px;line-height:1}
      .jr-listhead-chk{grid-column:2;align-self:end;height:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;line-height:1}
      .jr-listhead-chk input{box-sizing:border-box;width:16px;height:16px;margin:0;cursor:pointer;accent-color:#f0883e}
      .jr-selcount{grid-column:3;align-self:end;justify-self:start;min-width:34px;padding-bottom:1px;text-align:left;color:#f0883e;font:700 11px/1 Consolas,monospace}
      .jr-list-actions{grid-column:5;align-self:end;justify-self:end;display:flex;align-items:center;gap:8px}
      .jr-iebtn{cursor:pointer;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #30363d;border-radius:5px;padding:0;font-size:12px;font-weight:700;line-height:1;color:#8b949e;background:#21262d;transition:.12s}.jr-iebtn:hover{background:#30363d;color:#c9d1d9}.jr-iebtn svg{display:block;width:15px;height:15px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}.jr-iebtn-defaults{color:#7ee787}.jr-iebtn-defaults:hover{background:#23863622;border-color:#2f6f46;color:#a6f3b7}.jr-iebtn-danger{color:#e66a63}.jr-iebtn-danger:hover{background:#e66a6318;border-color:#e66a6344;color:#ff8f88}
      .jr-empty{padding:10px;text-align:center;color:#484f58;font-size:11px;font-style:italic}
      .jr-item{box-sizing:border-box;height:36px;display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid #21262d}.jr-item:last-child{border-bottom:0}
      .jr-item:hover{background:#161b22}
      .jr-item-sel{background:#1f6feb18}
      .jr-item-sel:hover{background:#1f6feb26}
      .jr-item-switchable .jr-item-id{color:#7ee787}
      .jr-item-current{box-shadow:inset 3px 0 0 #2ea043}
      .jr-item-deactivated .jr-item-id{color:#b98585}
      .jr-item-dragging{opacity:.55}
      .jr-drop-before{box-shadow:inset 0 2px 0 #f0883e}
      .jr-drop-after{box-shadow:inset 0 -2px 0 #f0883e}
      .jr-chk{box-sizing:border-box;flex:0 0 auto;width:16px;height:16px;margin:0;cursor:pointer;accent-color:#f0883e}
      .jr-switch-missing{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid #30363d;border-radius:5px;background:#21262d;color:#8b949e;flex:0 0 auto}.jr-switch-missing svg{display:block;width:14px;height:14px;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;fill:none}.jr-switch-deactivated{border-color:#4b3336;background:#241b1d;color:#b98585}
      .jr-switch-btn{cursor:pointer;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid #2f6f46;border-radius:5px;padding:0;background:#23863622;color:#7ee787;flex:0 0 auto;transition:.12s}.jr-switch-btn:hover:not(:disabled){background:#23863636;border-color:#3fb950;color:#a6f3b7}.jr-switch-btn:disabled{cursor:default;opacity:1}.jr-switch-btn svg{display:block;width:14px;height:14px;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;fill:none}.jr-switch-current{border-color:#2f6f46;background:#23863626;color:#7ee787}
      .jr-item-id{font:11px/1.25 Consolas,monospace;color:#8b949e;flex:0 1 auto;word-break:break-all}
      .jr-item-cmt{flex:1;min-width:0;font-size:10px;color:#8b949e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:text;padding:1px 3px;border-radius:4px}.jr-item-cmt:hover{background:#21262d}
      .jr-item-cmt:empty::before{content:"Комментарий";color:#484f58;font-style:italic}
      .jr-cmt-edit{flex:1;min-width:0;box-sizing:border-box;border:1px solid #f0883e;background:#161b22;color:#c9d1d9;border-radius:4px;padding:2px 5px;font:11px/1.3 Consolas,sans-serif;outline:none}
      .jr-drag{cursor:grab;display:inline-flex;align-items:center;justify-content:center;width:18px;height:20px;border-radius:4px;color:#8b949e;font-size:13px;font-weight:700;line-height:1;user-select:none;flex:0 0 auto}.jr-drag:hover{background:#21262d;color:#f0883e}.jr-drag:active{cursor:grabbing}
      .jr-add{padding:8px 12px;border-bottom:1px solid #30363d;display:flex;gap:6px;align-items:center}
      .jr-in{box-sizing:border-box;border:1px solid #30363d;background:#0d1117;color:#c9d1d9;border-radius:5px;outline:none;padding:6px 9px;font:11px/1.3 Consolas,sans-serif}.jr-in:focus{border-color:#f0883e}
      .jr-in-id{flex:1 1 180px;min-width:120px}.jr-in-cmt{flex:1 1 80px;min-width:60px}
      .jr-add-btn{cursor:pointer;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #30363d;border-radius:5px;padding:0;font-size:12px;font-weight:700;line-height:1;color:#c9d1d9;background:#21262d;flex:0 0 auto;transition:.12s}.jr-add-btn:hover:not(:disabled){background:#30363d}
      .jr-body{padding:7px 12px;height:110px;overflow:auto;background:#0d1117;color:#c9d1d9}.jr-line{padding:2px 0;border-bottom:1px solid #21262d;word-break:break-word;font-size:11px;font-family:Consolas,monospace}
      .jr-info{color:#58a6ff}.jr-ok{color:#3fb950}.jr-warn{color:#d29922}.jr-err{color:#f85149}
      .jr-foot{display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid #30363d;background:#161b22}
      .jr-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;height:32px;border:1px solid #30363d;border-radius:5px;padding:0 12px;font-size:11px;font-weight:700;line-height:1;color:#c9d1d9;transition:.12s;background:#21262d;flex:0 0 auto}.jr-btn:hover:not(:disabled){background:#30363d}
      .jr-btn-icon{width:32px;padding:0}.jr-btn-icon svg{display:block;width:16px;height:16px;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;fill:none}.jr-btn-active{border-color:#2f6f46;background:#23863626;color:#7ee787}.jr-btn-active:hover:not(:disabled){background:#23863638}.jr-btn-log-clear{color:#b98585}.jr-btn-log-clear:hover:not(:disabled){background:#3a202022;border-color:#4b3336;color:#d29a9a}
      .jr-btn-primary{background:#1f6feb;border-color:#1f6feb;color:#fff}.jr-btn-primary:hover:not(:disabled){background:#388bfd}.jr-btn-green{background:#238636;border-color:#238636;color:#fff}.jr-btn-green:hover:not(:disabled){background:#2ea043}
      .jr-info-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px}
      .jr-info-modal{background:#0d1117;border:1px solid #30363d;border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.7);width:580px;max-width:96vw;max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
      .jr-info-head{padding:11px 14px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:8px}
      .jr-info-title{font-size:12px;font-weight:700;color:#7ee787;font-family:Consolas,monospace;word-break:break-all}
      .jr-title-id{color:#7ee787}
      .jr-info-body{padding:12px 14px;overflow:auto;font-size:11px;line-height:1.6;flex:1}
      .jr-info-sec{margin-bottom:12px}
      .jr-info-sec-h{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8b949e;margin-bottom:5px;border-bottom:1px solid #21262d;padding-bottom:3px}
      .jr-info-row{display:flex;gap:8px;padding:2px 0}
      .jr-info-k{flex:0 0 170px;color:#8b949e;font-size:10.5px}
      .jr-info-v{flex:1;color:#c9d1d9;word-break:break-all;font-family:Consolas,monospace;font-size:10.5px}
      .jr-info-tag{display:inline-block;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:1px 6px;margin:1px;font-size:9.5px;font-family:Consolas,monospace;color:#7ee787}
      .jr-muted{color:#8b949e}.jr-yes{color:#3fb950}.jr-no{color:#f85149}
      .jr-info-spin{padding:30px;text-align:center;color:#8b949e;font-size:12px}
      .jr-info-err{color:#f85149}
      .jr-info-actions{padding:9px 14px;border-top:1px solid #30363d;background:#161b22;display:flex;gap:6px;justify-content:space-between;flex:0 0 auto}
      .jr-info-act{cursor:pointer;border:1px solid #30363d;border-radius:5px;padding:5px 11px;font-size:10px;font-weight:700;background:#21262d;color:#c9d1d9}.jr-info-act:hover{background:#30363d}
    `;
    const oldPanel = document.getElementById(PANEL_ID);
    if (oldPanel) oldPanel.remove();
    const oldStyle = document.getElementById(STYLE_ID);
    if (oldStyle) oldStyle.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);

    const p = document.createElement("div");
    p.id = PANEL_ID;
    p.className = "jr-panel" + (CONFIG.collapsed ? " collapsed" : "");
    p.innerHTML = `
      <div class="jr-head">
        <div class="jr-brand-wrap">
          <div class="jr-title">${APP_TITLE}</div>
          <span class="jr-ver">v${SCRIPT_VERSION}</span>
          <a class="jr-gh" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.35 1.08 2.92.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.93 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.03c.85 0 1.7.11 2.5.33 1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.83-2.34 4.67-4.57 4.92.36.31.68.92.68 1.86v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>
          </a>
          <a class="jr-req" href="${ISSUES_URL}" target="_blank" rel="noopener noreferrer" title="Пожелания и новые workspace ID" aria-label="Пожелания и новые workspace ID">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M12 8v6"/><path d="M9 11h6"/></svg>
          </a>
        </div>
        <div class="jr-hbtns">
          <button class="jr-hbtn" id="jr-export" title="Экспорт сессии">⬇</button>
          <button class="jr-hbtn" id="jr-copy-session" title="Скопировать сессию">⧉</button>
          <button class="jr-hbtn jr-min-btn" id="jr-min" title="Свернуть">−</button>
        </div>
      </div>
      <div class="jr-cubik" id="jr-cubik" title="Развернуть">R</div>
      <div class="jr-sub" id="jr-user">Проверка сессии</div>

      <div class="jr-tok">
        <div class="jr-tok-row">
          <input class="jr-tok-in" id="jr-token" placeholder="Кастом сессия: JSON ${ENDPOINTS.session}" title="JSON из ${ENDPOINTS.session}">
          <button class="jr-tok-btn jr-tok-apply" id="jr-tok-apply">Применить</button>
          <button class="jr-tok-btn jr-tok-clear" id="jr-tok-clear" title="Очистить">✕</button>
        </div>
      </div>

      <div class="jr-sec">
        <div class="jr-listhead">
          <span class="jr-listhead-title">Все</span>
          <label class="jr-listhead-chk" title="Выбрать все"><input type="checkbox" id="jr-all"></label>
          <span class="jr-selcount" id="jr-selcount">0/0</span>
          <span class="jr-list-actions">
            <button class="jr-iebtn" id="jr-import-list" title="Вставить" aria-label="Вставить">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6"/><path d="M9 3a2 2 0 0 0-2 2v1h10V5a2 2 0 0 0-2-2"/><path d="M7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>
            </button>
            <button class="jr-iebtn" id="jr-copy-selected" title="Скопировать" aria-label="Скопировать">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="m11.5 14.5 2 2 4-4"/></svg>
            </button>
            <button class="jr-iebtn jr-iebtn-defaults" id="jr-copy-access-tokens" title="Скопировать accessToken для выбранных workspace" aria-label="Скопировать accessToken для выбранных workspace">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="14.5" r="3.5"/><path d="M10 12 20 2"/><path d="M16 6l2 2"/><path d="M14 8l2 2"/><rect x="11" y="11" width="10" height="10" rx="2"/></svg>
            </button>
            <button class="jr-iebtn jr-iebtn-defaults" id="jr-add-defaults" title="Добавить дефолтные workspace" aria-label="Добавить дефолтные workspace">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M3 12h10"/><path d="M3 18h10"/><path d="M18 11v8"/><path d="M14 15h8"/></svg>
            </button>
            <button class="jr-iebtn jr-iebtn-danger" id="jr-delete-selected" title="Удалить" aria-label="Удалить">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
            </button>
          </span>
        </div>
        <div class="jr-list" id="jr-list"></div>
      </div>

      <div class="jr-add">
        <input class="jr-in jr-in-id" id="jr-new-id" placeholder="Workspace ID" maxlength="${LIMITS.workspaceIdLength}">
        <input class="jr-in jr-in-cmt" id="jr-new-cmt" placeholder="Комментарий" maxlength="${LIMITS.commentLength}">
        <button class="jr-add-btn" id="jr-add" title="Добавить">+</button>
      </div>

      <div class="jr-body" id="jr-body"></div>

      <div class="jr-foot">
        <button class="jr-btn jr-btn-icon" id="jr-personal-switch" title="Переключиться на личный аккаунт" aria-label="Переключиться на личный аккаунт">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
        </button>
        <button class="jr-btn jr-btn-icon" id="jr-info" title="Обзор текущего workspace" aria-label="Обзор текущего workspace">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v7"/><path d="M12 7h.01"/></svg>
        </button>
        <button class="jr-btn jr-btn-icon" id="jr-copy-log" title="Скопировать лог" aria-label="Скопировать лог">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
        </button>
        <button class="jr-btn jr-btn-icon jr-btn-log-clear" id="jr-clear-log" title="Очистить лог" aria-label="Очистить лог">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
        </button>
        <span class="jr-fill"></span>
        <button class="jr-btn jr-btn-primary" id="jr-run">Запросить</button>
        <button class="jr-btn jr-btn-green" id="jr-accept">Принять</button>
      </div>
    `;
    document.body.appendChild(p);
    applyPanelPosition(p);

    panelBody = p.querySelector(SELECTOR.body);
    userBarEl = p.querySelector(SELECTOR.user);
    reqBtnEl = p.querySelector(SELECTOR.run);
    accBtnEl = p.querySelector(SELECTOR.accept);
    infoBtnEl = p.querySelector(SELECTOR.info);
    copyLogBtnEl = p.querySelector(SELECTOR.copyLog);
    clearLogBtnEl = p.querySelector(SELECTOR.clearLog);
    personalBtnEl = p.querySelector(SELECTOR.personalSwitch);
    listEl = p.querySelector(SELECTOR.list);
    selCountEl = p.querySelector(SELECTOR.selectedCount);
    allChkEl = p.querySelector(SELECTOR.all);
    newIdEl = p.querySelector(SELECTOR.newId);
    newCmtEl = p.querySelector(SELECTOR.newComment);
    addBtnEl = p.querySelector(SELECTOR.add);
    tokenEl = p.querySelector(SELECTOR.token);
    applyTokBtn = p.querySelector(SELECTOR.tokenApply);
    clearTokBtn = p.querySelector(SELECTOR.tokenClear);
    importListBtnEl = p.querySelector(SELECTOR.importList);
    copySelectedBtnEl = p.querySelector(SELECTOR.copySelected);
    copyAccessTokensBtnEl = p.querySelector(SELECTOR.copyAccessTokens);
    addDefaultsBtnEl = p.querySelector(SELECTOR.addDefaults);
    deleteSelectedBtnEl = p.querySelector(SELECTOR.deleteSelected);

    tokenEl.value = "";

    renderList();

    addBtnEl.addEventListener("click", addItem);
    newIdEl.addEventListener("keydown", e => { if (e.key === "Enter") addItem(); });
    newCmtEl.addEventListener("keydown", e => { if (e.key === "Enter") addItem(); });

    const applyToken = () => {
      const raw = (tokenEl.value || "").trim();
      if (!raw) {
        clearSession();
        refreshSession();
        return;
      }
      const p = parseSessionInput(raw);
      if (p.error || !p.session) {
        log("Сессия отклонена: " + (p.error || SESSION_PATHS.token[0] + " не найден"), LogLevel.ERR);
        clearSession();
        updateUserBar(null, "err");
        return;
      }
      STATE.manualSession = p.session;
      applySession(p.session, false);
    };
    applyTokBtn.addEventListener("click", applyToken);
    tokenEl.addEventListener("keydown", e => { if (e.key === "Enter") applyToken(); });
    clearTokBtn.addEventListener("click", () => {
      tokenEl.value = "";
      clearSession();
      refreshSession();
    });

    copySelectedBtnEl.addEventListener("click", copySelectedItems);
    copyAccessTokensBtnEl.addEventListener("click", copySelectedWorkspaceAccessTokens);
    addDefaultsBtnEl.addEventListener("click", addDefaultItems);
    deleteSelectedBtnEl.addEventListener("click", deleteSelectedItems);
    importListBtnEl.addEventListener("click", importList);

    allChkEl.addEventListener("change", () => {
      selected = allChkEl.checked ? new Set(CONFIG.items.map(i => i.id).filter(Boolean)) : new Set();
      renderList();
    });

    reqBtnEl.addEventListener("click", () => runAll(Route.REQUEST));
    accBtnEl.addEventListener("click", () => runAll(Route.ACCEPT));
    personalBtnEl.addEventListener("click", switchToPersonal);
    p.querySelector(SELECTOR.info).addEventListener("click", () => {
      if (!STATE.accountId) { log("Нет account_id", LogLevel.ERR); return; }
      showInfo(STATE.accountId);
    });
    p.querySelector(SELECTOR.copyLog).addEventListener("click", copyLogText);
    p.querySelector(SELECTOR.clearLog).addEventListener("click", clearLog);
    p.querySelector(SELECTOR.exportToken).addEventListener("click", exportSessionData);
    p.querySelector(SELECTOR.copySession).addEventListener("click", copySessionData);

    const minBtn = p.querySelector(SELECTOR.minimize);
    minBtn.addEventListener("click", () => setCollapsed(p, true));
    const cubik = p.querySelector(SELECTOR.cubik);
    bindCollapsedIconDrag(p, cubik);
    cubik.addEventListener("click", () => setCollapsed(p, false));
  }

  function log(msg, level) {
    const styles = { [LogLevel.INFO]: "jr-info", [LogLevel.OK]: "jr-ok", [LogLevel.WARN]: "jr-warn", [LogLevel.ERR]: "jr-err" };
    const time = new Date().toLocaleTimeString(LOCALE.time, { hour12: false });
    if (panelBody) {
      const line = document.createElement("div");
      line.className = "jr-line " + (styles[level] || "jr-info");
      line.textContent = "[" + time + "] " + msg;
      panelBody.appendChild(line);
      while (panelBody.children.length > LOG_LIMIT) panelBody.firstChild.remove();
      panelBody.scrollTop = panelBody.scrollHeight;
    }
  }

  function cleanup() {
    if (refreshTimerId) {
      clearInterval(refreshTimerId);
      refreshTimerId = 0;
    }
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
    if (domReadyHandler) {
      document.removeEventListener("DOMContentLoaded", domReadyHandler);
      domReadyHandler = null;
    }
    closeInfoModal();
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    if (window[INSTANCE_KEY] === cleanup) delete window[INSTANCE_KEY];
  }

  function boot() {
    if (booted) return;
    booted = true;
    buildPanel();
    refreshSession();
    refreshTimerId = setInterval(refreshSession, CONFIG.sessionPollMs);
    keydownHandler = e => { if (e.key === "Escape" && infoModalBg) closeInfoModal(); };
    document.addEventListener("keydown", keydownHandler);
  }

  window[INSTANCE_KEY] = cleanup;

  if (document.readyState === "loading") {
    domReadyHandler = boot;
    document.addEventListener("DOMContentLoaded", domReadyHandler);
  } else {
    boot();
  }
})();
