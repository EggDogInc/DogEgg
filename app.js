const BASE_CATEGORIES = [
  { id: "new", label: "New", short: "New", color: "var(--cat-new)", builtin: true, locked: true },
  { id: "needs_doug", label: "❓ Needs Doug", short: "❓ Needs Doug", color: "var(--cat-high)", builtin: true, locked: true },
  { id: "test_later", label: "Test Later", short: "Test Later", color: "var(--cat-unsorted)", builtin: true, locked: false },
  { id: "dont_understand", label: "Don't Understand", short: "Don't Understand", color: "var(--cat-doubtful)", builtin: true, locked: false },
  { id: "confirmed", label: "Confirmed", short: "Confirmed", color: "var(--cat-confirmed)", builtin: true, locked: false },
  { id: "widely_known", label: "Widely Known", short: "Widely Known", color: "var(--cat-known)", builtin: true, locked: false },
  { id: "not_a_bug", label: "Not a Bug", short: "Not a Bug", color: "var(--muted)", builtin: true, locked: false },
  { id: "debunked", label: "Debunked", short: "Debunked", color: "var(--cat-debunked)", builtin: true, locked: false },
];

const LEGACY_CAT_MAP = {
  high_priority: "new",
  unsorted: "test_later",
  doubtful: "test_later",
};

const CUSTOM_CAT_PALETTE = ["#38bdf8", "#f472b6", "#a3e635", "#fb923c", "#818cf8", "#34d399"];
const USER_CONFIRMED_TAG = "User Confirmed";
const PW_STORAGE_KEY = "factory_bugs_pw_v2";
const STATE_STORAGE_KEY = "factory_bugs_local_state_v2";
const GH_SYNC_STORAGE_KEY = "doug_gh_sync_v1";

let seedItems = [];
let maxSprint = 1;
let baselineState = {};
let userState = {
  categories: {},
  notes: {},
  dougAnswers: {},
  customItems: [],
  itemTags: {},
  exploreDeeply: [],
  customTagDefs: [USER_CONFIRMED_TAG],
  customCategoryDefs: [],
  hiddenCategories: [],
  updatedAt: null,
};

let vaultUnlocked = false;
let viewMode = "list";
let focusCat = "new"; // Always open on New first!
let sortOrder = "newest";
let searchQuery = "";
let tagFilter = "ALL";
let openTagPopoverId = null;
let pendingCatItemId = null;
let noteTimers = {};
let answerTimers = {};
let ghPushTimer = null;
let ghRemoteSha = null;
let ghSyncInFlight = false;

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const pwInput = document.getElementById("password-input");
const togglePwBtn = document.getElementById("toggle-pw-btn");
const rememberCheckbox = document.getElementById("remember-checkbox");
const loginError = document.getElementById("login-error");
const loginSubmitBtn = document.getElementById("login-submit-btn");

const sourceMeta = document.getElementById("source-meta");
const searchInput = document.getElementById("search-input");
const tagSelect = document.getElementById("tag-filter");
const sortSelect = document.getElementById("sort-select");
const newTagBtn = document.getElementById("new-tag-btn");
const newCatBtn = document.getElementById("new-cat-btn");
const viewListBtn = document.getElementById("view-list-btn");
const viewBoardBtn = document.getElementById("view-board-btn");
const newItemBtn = document.getElementById("new-item-btn");
const syncSnapshotBtn = document.getElementById("sync-snapshot-btn");
const saveStatus = document.getElementById("save-status");
const lockBtn = document.getElementById("lock-btn");
const focusTabs = document.getElementById("focus-tabs");
const activeFilterBar = document.getElementById("active-filter-bar");
const boardContainer = document.getElementById("board-container");

const modalBackdrop = document.getElementById("modal-backdrop");
const newItemForm = document.getElementById("new-item-form");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");

const tagModalBackdrop = document.getElementById("tag-modal-backdrop");
const newTagForm = document.getElementById("new-tag-form");
const tagNameInput = document.getElementById("tag-name-input");
const tagModalCloseBtn = document.getElementById("tag-modal-close-btn");
const existingTagsList = document.getElementById("existing-tags-list");

const catModalBackdrop = document.getElementById("cat-modal-backdrop");
const newCatForm = document.getElementById("new-cat-form");
const catNameInput = document.getElementById("cat-name-input");
const catModalCloseBtn = document.getElementById("cat-modal-close-btn");
const existingCatsList = document.getElementById("existing-cats-list");
const hiddenCatsWrap = document.getElementById("hidden-cats-wrap");
const hiddenCatsList = document.getElementById("hidden-cats-list");

const syncModalBackdrop = document.getElementById("sync-modal-backdrop");
const syncModalCloseBtn = document.getElementById("sync-modal-close-btn");
const syncBanner = document.getElementById("sync-banner");
const ghSyncForm = document.getElementById("gh-sync-form");
const ghRepoInput = document.getElementById("gh-repo-input");
const ghBranchInput = document.getElementById("gh-branch-input");
const ghPathInput = document.getElementById("gh-path-input");
const ghTokenInput = document.getElementById("gh-token-input");
const ghClearBtn = document.getElementById("gh-clear-btn");
const ghPullBtn = document.getElementById("gh-pull-btn");
const copySnapshotBtn = document.getElementById("copy-snapshot-btn");
const importSnapshotArea = document.getElementById("import-snapshot-area");
const importSnapshotBtn = document.getElementById("import-snapshot-btn");
const resetLocalBtn = document.getElementById("reset-local-btn");
const toastEl = document.getElementById("toast");

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2300);
}

function setSaveStatus(state, text) {
  saveStatus.className = "save-pill" + (state ? ` ${state}` : "");
  saveStatus.textContent = text;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const clean = b64.replace(/\s+/g, "");
  const bytes = b64ToBytes(clean);
  return new TextDecoder().decode(bytes);
}

async function decryptVault(password) {
  const resp = await fetch(`./vault.enc.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Unable to fetch encrypted feed.");
  const env = await resp.json();

  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBytes(env.salt),
      iterations: env.iter,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(env.iv) },
      aesKey,
      b64ToBytes(env.ct)
    );
    return JSON.parse(new TextDecoder().decode(plainBuf));
  } catch {
    throw new Error("Incorrect password.");
  }
}

function mergeStates(base, local) {
  const b = base || {};
  const l = local || {};
  const customTags = Array.from(
    new Set([USER_CONFIRMED_TAG, ...(b.customTagDefs || []), ...(l.customTagDefs || [])])
  );
  const catMap = new Map();
  for (const c of [...(b.customCategoryDefs || []), ...(l.customCategoryDefs || [])]) {
    if (c && c.id) catMap.set(c.id, c);
  }
  const itemMap = new Map();
  for (const it of [...(b.customItems || []), ...(l.customItems || [])]) {
    if (it && it.id) itemMap.set(it.id, it);
  }
  const hidden = Array.from(
    new Set([...(b.hiddenCategories || []), ...(l.hiddenCategories || [])])
  );

  return {
    categories: { ...(b.categories || {}), ...(l.categories || {}) },
    notes: { ...(b.notes || {}), ...(l.notes || {}) },
    dougAnswers: { ...(b.dougAnswers || {}), ...(l.dougAnswers || {}) },
    itemTags: { ...(b.itemTags || {}), ...(l.itemTags || {}) },
    exploreDeeply: Array.isArray(l.exploreDeeply)
      ? l.exploreDeeply
      : Array.isArray(b.exploreDeeply)
      ? b.exploreDeeply
      : [],
    customItems: Array.from(itemMap.values()),
    customTagDefs: customTags,
    customCategoryDefs: Array.from(catMap.values()),
    hiddenCategories: hidden,
    updatedAt: l.updatedAt || b.updatedAt || null,
  };
}

function getGhSyncConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(GH_SYNC_STORAGE_KEY) || "{}");
    return {
      repo: (raw.repo || "").trim(),
      branch: (raw.branch || "main").trim() || "main",
      path: (raw.path || "data/user_state.json").trim() || "data/user_state.json",
      token: (raw.token || "").trim(),
    };
  } catch {
    return { repo: "", branch: "main", path: "data/user_state.json", token: "" };
  }
}

function isGhSyncConfigured() {
  const cfg = getGhSyncConfig();
  return Boolean(cfg.repo && cfg.token && cfg.repo.includes("/"));
}

function updateSyncBanner() {
  const cfg = getGhSyncConfig();
  if (isGhSyncConfigured()) {
    syncBanner.textContent = `Connected to ${cfg.repo} (${cfg.branch}:${cfg.path}). Edits push live within ~1.5s.`;
  } else {
    syncBanner.textContent = "Not configured — edits save locally in this browser only. Friends without a token stay read-only.";
  }
}

async function pullRemoteUserState(silent = false) {
  const cfg = getGhSyncConfig();
  if (!isGhSyncConfigured()) {
    if (!silent) setSaveStatus("", "Local Only");
    return false;
  }
  setSaveStatus("saving", "☁️ Syncing...");
  try {
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}&_=${Date.now()}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`GitHub GET ${resp.status}`);
    const payload = await resp.json();
    ghRemoteSha = payload.sha;
    const remoteJson = JSON.parse(b64ToUtf8(payload.content || ""));
    const baseTime = Date.parse(remoteJson.updatedAt || 0) || 0;
    const localTime = Date.parse(userState.updatedAt || 0) || 0;
    userState = baseTime >= localTime ? mergeStates(userState, remoteJson) : mergeStates(remoteJson, userState);
    ensureTagState();
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(userState));
    setSaveStatus("saved", "☁️ Synced");
    populateTagDropdown();
    populateNewItemCategorySelect();
    render();
    if (!silent) showToast("Pulled latest state from GitHub!");
    return true;
  } catch (err) {
    setSaveStatus("", "⚠️ Pull Error");
    if (!silent) showToast(`Sync pull failed: ${err.message}`);
    return false;
  }
}

async function pushRemoteUserState(retried = false) {
  const cfg = getGhSyncConfig();
  if (!isGhSyncConfigured()) {
    setSaveStatus("saved", "Saved Locally");
    return;
  }
  if (ghSyncInFlight) {
    scheduleGhPush();
    return;
  }
  ghSyncInFlight = true;
  setSaveStatus("saving", "☁️ Syncing...");
  try {
    const apiBase = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`;
    if (!ghRemoteSha) {
      const r0 = await fetch(`${apiBase}?ref=${encodeURIComponent(cfg.branch)}&_=${Date.now()}`, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (r0.ok) {
        const j0 = await r0.json();
        ghRemoteSha = j0.sha;
      }
    }
    const contentText = JSON.stringify(userState, null, 2) + "\n";
    const body = {
      message: "Update triage state & answers",
      content: utf8ToB64(contentText),
      branch: cfg.branch,
    };
    if (ghRemoteSha) body.sha = ghRemoteSha;

    const putResp = await fetch(apiBase, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (putResp.status === 409 && !retried) {
      // Fetch remote SHA, merge local edits on top, and retry once
      const r1 = await fetch(`${apiBase}?ref=${encodeURIComponent(cfg.branch)}&_=${Date.now()}`, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (r1.ok) {
        const j1 = await r1.json();
        ghRemoteSha = j1.sha;
        const remoteObj = JSON.parse(b64ToUtf8(j1.content || ""));
        userState = mergeStates(remoteObj, userState);
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(userState));
        ghSyncInFlight = false;
        return await pushRemoteUserState(true);
      }
    }

    if (!putResp.ok) throw new Error(`GitHub PUT ${putResp.status}`);
    const saved = await putResp.json();
    ghRemoteSha = saved.content?.sha || ghRemoteSha;
    setSaveStatus("saved", "☁️ Synced");
  } catch (err) {
    setSaveStatus("", "⚠️ Sync Error");
    showToast(`GitHub sync failed (${err.message}); saved locally.`);
  } finally {
    ghSyncInFlight = false;
  }
}

function scheduleGhPush() {
  clearTimeout(ghPushTimer);
  ghPushTimer = setTimeout(() => {
    pushRemoteUserState();
  }, 1500);
}

function persistLocalState() {
  userState.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(userState));
  } catch {
    // ignore quota issues
  }
  if (isGhSyncConfigured()) {
    setSaveStatus("saving", "☁️ Queued...");
    scheduleGhPush();
  } else {
    setSaveStatus("saved", "Saved Locally");
    setTimeout(() => {
      if (saveStatus.textContent === "Saved Locally") setSaveStatus("", "Local Only");
    }, 1400);
  }
}

function ensureTagState() {
  if (!Array.isArray(userState.customTagDefs)) userState.customTagDefs = [USER_CONFIRMED_TAG];
  if (!userState.customTagDefs.includes(USER_CONFIRMED_TAG)) userState.customTagDefs.unshift(USER_CONFIRMED_TAG);
  if (!userState.itemTags || typeof userState.itemTags !== "object") userState.itemTags = {};
  if (!userState.dougAnswers || typeof userState.dougAnswers !== "object") userState.dougAnswers = {};
  if (!Array.isArray(userState.exploreDeeply)) userState.exploreDeeply = [];
  if (!Array.isArray(userState.customCategoryDefs)) userState.customCategoryDefs = [];
  if (!Array.isArray(userState.hiddenCategories)) userState.hiddenCategories = [];
}

function getAllCategories() {
  const hidden = new Set(userState.hiddenCategories || []);
  const builtins = BASE_CATEGORIES.filter((c) => c.locked || !hidden.has(c.id));
  const customs = (userState.customCategoryDefs || []).map((c, idx) => ({
    id: c.id,
    label: c.label,
    short: c.label,
    color: c.color || CUSTOM_CAT_PALETTE[idx % CUSTOM_CAT_PALETTE.length],
    builtin: false,
    locked: false,
  }));
  return [...builtins, ...customs];
}

function populateNewItemCategorySelect() {
  const sel = document.getElementById("new-category");
  if (!sel) return;
  const cur = sel.value || "new";
  sel.innerHTML = "";
  for (const c of getAllCategories()) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }
  sel.value = getAllCategories().some((c) => c.id === cur) ? cur : "new";
}

function slugifyCatId(rawLabel) {
  return "cat_" + rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function openCategoryModal(applyToItemId = null) {
  pendingCatItemId = applyToItemId;
  catNameInput.value = "";
  renderExistingCatsModal();
  catModalBackdrop.classList.remove("hidden");
  catNameInput.focus();
}

function createNewCategoryDef(rawLabel, applyToItemId = null) {
  const label = rawLabel.trim();
  if (!label) return;
  ensureTagState();
  const existing = getAllCategories().find((c) => c.label.toLowerCase() === label.toLowerCase());
  if (existing) {
    if (applyToItemId) moveItemToCategory(applyToItemId, existing.id);
    catModalBackdrop.classList.add("hidden");
    return;
  }
  let id = slugifyCatId(label);
  if (id === "cat_") id = `cat_${Date.now()}`;
  if (getAllCategories().some((c) => c.id === id)) id = `${id}_${Date.now() % 1000}`;

  const color = CUSTOM_CAT_PALETTE[userState.customCategoryDefs.length % CUSTOM_CAT_PALETTE.length];
  userState.customCategoryDefs.push({ id, label, color });
  if (applyToItemId) {
    userState.categories = { ...(userState.categories || {}), [applyToItemId]: id };
  }
  persistLocalState();
  populateNewItemCategorySelect();
  renderExistingCatsModal();
  render();
  showToast(`Added category "${label}"`);
  if (applyToItemId) catModalBackdrop.classList.add("hidden");
}

function removeOrHideCategory(cat) {
  if (cat.locked) return;
  const msg = cat.builtin
    ? `Remove "${cat.label}" from your category tabs? Any items inside will move back to New (you can restore it anytime).`
    : `Delete category "${cat.label}"? Any items inside will move back to New.`;
  if (!confirm(msg)) return;

  if (cat.builtin) {
    if (!userState.hiddenCategories.includes(cat.id)) userState.hiddenCategories.push(cat.id);
  } else {
    userState.customCategoryDefs = userState.customCategoryDefs.filter((c) => c.id !== cat.id);
  }

  if (userState.categories) {
    for (const k of Object.keys(userState.categories)) {
      if (userState.categories[k] === cat.id) userState.categories[k] = "new";
    }
  }
  if (focusCat === cat.id) focusCat = "new";
  persistLocalState();
  populateNewItemCategorySelect();
  renderExistingCatsModal();
  render();
}

function getAllItems() {
  const merged = [...seedItems, ...(userState.customItems || [])];
  merged.sort((a, b) => {
    if (sortOrder === "oldest") return (a.sortOrder || 0) - (b.sortOrder || 0);
    if (sortOrder === "code") return (a.code || "").localeCompare(b.code || "");
    return (b.sortOrder || 0) - (a.sortOrder || 0);
  });
  return merged;
}

function getEffectiveCategory(item) {
  const raw = (userState.categories && userState.categories[item.id]) || item.defaultCategory || "new";
  const mapped = LEGACY_CAT_MAP[raw] || raw;
  const validIds = new Set(getAllCategories().map((c) => c.id));
  return validIds.has(mapped) ? mapped : "new";
}

function getEffectiveNote(item) {
  return (userState.notes && userState.notes[item.id]) || "";
}

function getDougAnswer(item) {
  return (userState.dougAnswers && userState.dougAnswers[item.id]) || "";
}

function getUserTagsForItem(item) {
  const arr = (userState.itemTags && userState.itemTags[item.id]) || [];
  return Array.isArray(arr) ? arr : [];
}

function isExploreDeeply(item) {
  return Array.isArray(userState.exploreDeeply) && userState.exploreDeeply.includes(item.id);
}

function toggleExploreDeeply(itemId) {
  ensureTagState();
  const idx = userState.exploreDeeply.indexOf(itemId);
  if (idx >= 0) userState.exploreDeeply.splice(idx, 1);
  else userState.exploreDeeply.push(itemId);
  persistLocalState();
  render();
}

function getAllTagsForItem(item) {
  const base = item.tag ? [item.tag] : [];
  return Array.from(new Set([...base, ...getUserTagsForItem(item)]));
}

function populateTagDropdown() {
  const tags = new Set();
  for (const it of getAllItems()) {
    if (it.tag) tags.add(it.tag);
  }
  for (const t of userState.customTagDefs || []) tags.add(t);
  const current = tagSelect.value || "ALL";
  tagSelect.innerHTML = `<option value="ALL">All Tags</option>`;
  for (const t of Array.from(tags).sort()) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagSelect.appendChild(opt);
  }
  if (current === "ALL" || tags.has(current)) tagSelect.value = current;
}

function toggleTagOnItem(itemId, tagName) {
  ensureTagState();
  const cur = new Set(userState.itemTags[itemId] || []);
  if (cur.has(tagName)) cur.delete(tagName);
  else cur.add(tagName);
  userState.itemTags[itemId] = Array.from(cur);
  persistLocalState();
  populateTagDropdown();
  render();
}

function createNewTagDef(rawName, applyToItemId = null) {
  const name = rawName.trim();
  if (!name) return;
  ensureTagState();
  if (!userState.customTagDefs.includes(name)) userState.customTagDefs.push(name);
  if (applyToItemId) {
    const cur = new Set(userState.itemTags[applyToItemId] || []);
    cur.add(name);
    userState.itemTags[applyToItemId] = Array.from(cur);
  }
  persistLocalState();
  populateTagDropdown();
  renderExistingTagsModal();
  render();
}

function matchesFilters(item) {
  if (tagFilter !== "ALL" && !getAllTagsForItem(item).includes(tagFilter)) return false;
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const hay = `${item.code || ""} ${item.title || ""} ${item.outcome || item.howTo || ""} ${item.setupSteps || item.stepByStep || ""} ${item.whyItWorks || ""} ${item.proof || ""} ${getAllTagsForItem(item).join(" ")} ${getEffectiveNote(item)} ${getDougAnswer(item)}`.toLowerCase();
  return hay.includes(q);
}

function moveItemToCategory(itemId, newCategory) {
  userState.categories = { ...(userState.categories || {}), [itemId]: newCategory };
  persistLocalState();
  render();
}

function confidenceBadgeInfo(item, curCat) {
  const conf = item.confidence || "";
  if (curCat === "debunked" || String(item.code || "").startsWith("DEAD-") || String(item.code || "").startsWith("AUDIT-")) {
    return { cls: "conf-needs-doug", label: "✗ Debunked", outcomeHeading: "✗ Debunked Claim" };
  }
  if (conf === "NEEDS_DOUG_CHECK" || curCat === "needs_doug") {
    return { cls: "conf-needs-doug", label: "❓ Needs In-Game Check", outcomeHeading: "🔬 Unverified Lead — Needs In-Game Check" };
  }
  if (conf === "IN_GAME_CONFIRMED" || curCat === "confirmed") {
    return { cls: "conf-in-game", label: "✓ Confirmed In-Game", outcomeHeading: "✨ Expected Outcome" };
  }
  return { cls: "conf-binary", label: "⚙️ Code Verified", outcomeHeading: "✨ Expected Outcome" };
}

function createCardElement(item) {
  const curCat = getEffectiveCategory(item);
  const noteVal = getEffectiveNote(item);
  const dougAns = getDougAnswer(item);
  const itemUserTags = getUserTagsForItem(item);
  const isConfirmed = itemUserTags.includes(USER_CONFIRMED_TAG);
  const isExplore = isExploreDeeply(item);
  const confInfo = confidenceBadgeInfo(item, curCat);

  const card = document.createElement("article");
  card.className = "card" + (isExplore ? " explore-flagged" : "");
  card.dataset.id = item.id;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const badges = document.createElement("div");
  badges.className = "card-badges";

  if (viewMode === "board") {
    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.effectAllowed = "move";
    });
    badges.appendChild(dragHandle);
  }

  const codeSpan = document.createElement("span");
  codeSpan.className = "code-badge";
  codeSpan.textContent = item.code || "LEAD";
  badges.appendChild(codeSpan);

  if (item.chapter) {
    const chSpan = document.createElement("span");
    chSpan.className = "sprint-badge";
    chSpan.textContent = item.chapter;
    badges.appendChild(chSpan);
  } else if (item.sprint) {
    const sp = document.createElement("span");
    sp.className = "sprint-badge" + (item.sprint >= maxSprint - 1 ? " sprint-latest" : "");
    sp.textContent = `Sprint ${item.sprint}`;
    badges.appendChild(sp);
  }

  const confSpan = document.createElement("span");
  confSpan.className = `conf-badge ${confInfo.cls}`;
  confSpan.textContent = confInfo.label;
  badges.appendChild(confSpan);

  if (item.splitFrom) {
    const sfSpan = document.createElement("span");
    sfSpan.className = "split-badge";
    sfSpan.textContent = `Split from ${item.splitFrom}`;
    badges.appendChild(sfSpan);
  }

  if (item.tag) {
    const tagSpan = document.createElement("span");
    tagSpan.className = "tag-badge clickable-tag";
    tagSpan.title = `Filter feed by "${item.tag}"`;
    tagSpan.textContent = item.tag;
    tagSpan.addEventListener("click", () => {
      tagFilter = tagFilter === item.tag ? "ALL" : item.tag;
      tagSelect.value = tagFilter;
      render();
    });
    badges.appendChild(tagSpan);
  }

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "confirm-toggle-btn" + (isConfirmed ? " active" : "");
  confirmBtn.textContent = isConfirmed ? "✓ User Confirmed" : "+ User Confirmed";
  confirmBtn.addEventListener("click", () => toggleTagOnItem(item.id, USER_CONFIRMED_TAG));
  badges.appendChild(confirmBtn);

  const exploreBtn = document.createElement("button");
  exploreBtn.type = "button";
  exploreBtn.className = "explore-toggle-btn" + (isExplore ? " active" : "");
  exploreBtn.textContent = isExplore ? "🔬 Explore Deeply ✓" : "🔬 Explore Deeply";
  exploreBtn.addEventListener("click", () => toggleExploreDeeply(item.id));
  badges.appendChild(exploreBtn);

  for (const ut of itemUserTags) {
    if (ut === USER_CONFIRMED_TAG) continue;
    const chip = document.createElement("span");
    chip.className = "user-tag-chip";
    chip.title = "Click to remove tag";
    chip.textContent = `${ut} ✕`;
    chip.addEventListener("click", () => toggleTagOnItem(item.id, ut));
    badges.appendChild(chip);
  }

  const adderWrap = document.createElement("div");
  adderWrap.className = "tag-adder-wrap";
  const addTagBtn = document.createElement("button");
  addTagBtn.type = "button";
  addTagBtn.className = "tag-add-btn";
  addTagBtn.textContent = "+ Tag";
  addTagBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openTagPopoverId = openTagPopoverId === item.id ? null : item.id;
    render();
  });
  adderWrap.appendChild(addTagBtn);

  if (openTagPopoverId === item.id) {
    const pop = document.createElement("div");
    pop.className = "tag-popover";
    pop.addEventListener("click", (e) => e.stopPropagation());
    const listDiv = document.createElement("div");
    listDiv.className = "tag-popover-list";
    for (const defTag of userState.customTagDefs) {
      const opt = document.createElement("label");
      opt.className = "tag-popover-opt";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = itemUserTags.includes(defTag);
      cb.addEventListener("change", () => toggleTagOnItem(item.id, defTag));
      const sp = document.createElement("span");
      sp.textContent = defTag;
      opt.appendChild(cb);
      opt.appendChild(sp);
      listDiv.appendChild(opt);
    }
    pop.appendChild(listDiv);
    const newRow = document.createElement("div");
    newRow.className = "tag-popover-new";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = "New tag name...";
    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "btn btn-primary btn-xs";
    createBtn.textContent = "Add";
    const submitNew = () => {
      if (inp.value.trim()) {
        openTagPopoverId = null;
        createNewTagDef(inp.value, item.id);
      }
    };
    createBtn.addEventListener("click", submitNew);
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        submitNew();
      }
    });
    newRow.appendChild(inp);
    newRow.appendChild(createBtn);
    pop.appendChild(newRow);
    adderWrap.appendChild(pop);
  }
  badges.appendChild(adderWrap);
  meta.appendChild(badges);

  if (item.isCustom) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delete-custom-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete custom lead "${item.title}"?`)) return;
      userState.customItems = (userState.customItems || []).filter((x) => x.id !== item.id);
      persistLocalState();
      render();
    });
    meta.appendChild(delBtn);
  }
  card.appendChild(meta);

  const titleEl = document.createElement("h3");
  titleEl.className = "card-title";
  titleEl.textContent = item.title;
  card.appendChild(titleEl);

  // LAYER 1: Expected Outcome / Lead Preview (Always visible first)
  const outcomeText = item.outcome || item.howTo || "";
  if (outcomeText) {
    const outBox = document.createElement("div");
    outBox.className = "layer-box outcome-box" + (curCat === "debunked" ? " outcome-debunked" : "");
    const outLbl = document.createElement("div");
    outLbl.className = "layer-label";
    outLbl.textContent = confInfo.outcomeHeading;
    const outP = document.createElement("p");
    outP.className = "outcome-text";
    outP.textContent = outcomeText;
    outBox.appendChild(outLbl);
    outBox.appendChild(outP);
    card.appendChild(outBox);
  }

  // Needs Doug Question & Quick-Reply Box
  const questions = Array.isArray(item.questionsForDoug) ? item.questionsForDoug : [];
  if (questions.length > 0 || curCat === "needs_doug") {
    const qBox = document.createElement("div");
    qBox.className = "doug-question-box";
    const qTitle = document.createElement("div");
    qTitle.className = "doug-question-title";
    qTitle.textContent = "❓ Question / In-Game Check for Doug";
    qBox.appendChild(qTitle);

    const ul = document.createElement("ul");
    ul.className = "doug-question-list";
    for (const q of questions.length ? questions : ["Please test this in-game or share what happens from memory."]) {
      const li = document.createElement("li");
      li.textContent = q;
      ul.appendChild(li);
    }
    qBox.appendChild(ul);

    const ansArea = document.createElement("textarea");
    ansArea.className = "doug-reply-input";
    ansArea.placeholder = "Type your answer or in-game test result here (auto-syncs live)...";
    ansArea.value = dougAns;
    ansArea.addEventListener("input", () => {
      userState.dougAnswers = { ...(userState.dougAnswers || {}), [item.id]: ansArea.value };
      clearTimeout(answerTimers[item.id]);
      answerTimers[item.id] = setTimeout(() => persistLocalState(), 400);
    });
    qBox.appendChild(ansArea);

    const vRow = document.createElement("div");
    vRow.className = "doug-verdict-row";
    for (const [label, targetCat] of [
      ["✓ Confirmed", "confirmed"],
      ["🕒 Test Later", "test_later"],
      ["✗ Debunked", "debunked"],
      ["🚫 Not a Bug", "not_a_bug"],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-xs";
      b.textContent = label;
      b.addEventListener("click", () => moveItemToCategory(item.id, targetCat));
      vRow.appendChild(b);
    }
    qBox.appendChild(vRow);
    card.appendChild(qBox);
  }

  // LAYER 2: Human Setup Steps (Visible immediately)
  const stepsText = item.setupSteps || item.stepByStep || "";
  if (stepsText) {
    const setupBox = document.createElement("div");
    setupBox.className = "layer-box setup-box";
    const sHead = document.createElement("div");
    sHead.className = "layer-label";
    const sLbl = document.createElement("span");
    sLbl.textContent = "🛠️ Human Setup Steps";
    const copyStepsBtn = document.createElement("button");
    copyStepsBtn.type = "button";
    copyStepsBtn.className = "btn btn-xs";
    copyStepsBtn.textContent = "📋 Copy Steps";
    copyStepsBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(stepsText);
      showToast("Copied setup steps!");
    });
    sHead.appendChild(sLbl);
    sHead.appendChild(copyStepsBtn);
    setupBox.appendChild(sHead);

    const sBody = document.createElement("p");
    sBody.className = "setup-text";
    sBody.textContent = stepsText;
    setupBox.appendChild(sBody);
    card.appendChild(setupBox);
  }

  // LAYER 3: Instructional Visual Diagram (Visible right on card when present)
  if (item.demo && Array.isArray(item.demo.steps) && item.demo.steps.length > 0) {
    const diagPanel = document.createElement("div");
    diagPanel.className = "layer-box diagram-panel";

    const dHead = document.createElement("div");
    dHead.className = "layer-label";
    const dLbl = document.createElement("span");
    dLbl.textContent = "📐 Visual Setup Diagram";
    const viewBadge = document.createElement("span");
    viewBadge.className = "demo-view-badge";
    viewBadge.textContent = item.demo.view || "Diagram";
    dHead.appendChild(dLbl);
    dHead.appendChild(viewBadge);
    diagPanel.appendChild(dHead);

    const demoWrap = document.createElement("div");
    demoWrap.className = "demo-wrap";
    const stepCnt = item.demo.steps.length;
    const controlsRow = document.createElement("div");
    controlsRow.className = "demo-controls";
    const stepBtns = document.createElement("div");
    stepBtns.className = "demo-step-btns";

    const svgWrap = document.createElement("div");
    svgWrap.className = "demo-svg-box";
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("viewBox", item.demo.viewBox || "0 0 720 250");
    svgEl.classList.add("demo-svg");
    svgWrap.appendChild(svgEl);

    const captionEl = document.createElement("div");
    captionEl.className = "demo-caption";

    let activeStep = typeof item.demo.initialStep === "number"
      ? Math.min(Math.max(0, item.demo.initialStep), stepCnt - 1)
      : stepCnt - 1;

    const renderDemoStep = () => {
      const st = item.demo.steps[activeStep] || item.demo.steps[0];
      svgEl.innerHTML = st.svg || "";
      captionEl.textContent = st.caption || "";
      if (st.view) viewBadge.textContent = st.view;
      Array.from(stepBtns.children).forEach((b, idx) => {
        b.classList.toggle("active", idx === activeStep);
      });
    };

    if (stepCnt > 1) {
      item.demo.steps.forEach((st, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "demo-step-btn" + (idx === activeStep ? " active" : "");
        btn.textContent = st.label || `Step ${idx + 1}`;
        btn.addEventListener("click", () => {
          activeStep = idx;
          renderDemoStep();
        });
        stepBtns.appendChild(btn);
      });
      controlsRow.appendChild(stepBtns);
      demoWrap.appendChild(controlsRow);
    }

    demoWrap.appendChild(svgWrap);
    if (item.demo.steps.some((s) => s.caption)) demoWrap.appendChild(captionEl);
    diagPanel.appendChild(demoWrap);
    renderDemoStep();
    card.appendChild(diagPanel);
  }

  // LAYER 4: Why It Works (Plain English)
  if (item.whyItWorks) {
    const whyBox = document.createElement("div");
    whyBox.className = "layer-box why-box";
    const whyLbl = document.createElement("div");
    whyLbl.className = "layer-label";
    whyLbl.textContent = "💡 Why It Works (Plain English)";
    const whyP = document.createElement("p");
    whyP.className = "why-text";
    whyP.textContent = item.whyItWorks;
    whyBox.appendChild(whyLbl);
    whyBox.appendChild(whyP);
    card.appendChild(whyBox);
  }

  if (Array.isArray(item.copySnippets) && item.copySnippets.length > 0) {
    const snipRow = document.createElement("div");
    snipRow.className = "snippet-row";
    for (const snip of item.copySnippets) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "snippet-btn";
      btn.textContent = `📋 ${snip.label}`;
      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(snip.text || snip.value || "");
        showToast(`Copied: ${snip.label}`);
      });
      snipRow.appendChild(btn);
    }
    card.appendChild(snipRow);
  }

  // LAYER 5: Collapsed Technical & Binary Proof + Notes
  const proofDetails = document.createElement("details");
  proofDetails.className = "card-details";
  if (noteVal) proofDetails.open = true;
  const proofSummary = document.createElement("summary");
  proofSummary.textContent = noteVal
    ? "🔬 Technical & Binary Proof + Personal Notes (has note)"
    : "🔬 Technical & Binary Proof + Personal Notes (click to expand)";
  proofDetails.appendChild(proofSummary);

  if (item.proof) {
    const proofToolbar = document.createElement("div");
    proofToolbar.className = "details-toolbar";
    const copyProofBtn = document.createElement("button");
    copyProofBtn.type = "button";
    copyProofBtn.className = "btn btn-xs";
    copyProofBtn.textContent = "📋 Copy Proof";
    copyProofBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.proof);
      showToast("Copied technical proof!");
    });
    proofToolbar.appendChild(copyProofBtn);
    proofDetails.appendChild(proofToolbar);

    const proofBox = document.createElement("div");
    proofBox.className = "proof-box";
    proofBox.textContent = item.proof;
    proofDetails.appendChild(proofBox);
  }

  if (Array.isArray(item.vas) && item.vas.length > 0) {
    const vaRow = document.createElement("div");
    vaRow.className = "va-chip-row";
    for (const va of item.vas) {
      const vc = document.createElement("span");
      vc.className = "code-badge";
      vc.textContent = va;
      vaRow.appendChild(vc);
    }
    proofDetails.appendChild(vaRow);
  }

  const noteWrap = document.createElement("div");
  noteWrap.className = "note-box";
  noteWrap.style.marginTop = "8px";
  const noteArea = document.createElement("textarea");
  noteArea.placeholder = "Add personal test notes / video ideas...";
  noteArea.value = noteVal;
  noteArea.addEventListener("input", () => {
    userState.notes = { ...(userState.notes || {}), [item.id]: noteArea.value };
    clearTimeout(noteTimers[item.id]);
    noteTimers[item.id] = setTimeout(() => persistLocalState(), 350);
  });
  noteWrap.appendChild(noteArea);
  proofDetails.appendChild(noteWrap);
  card.appendChild(proofDetails);

  // Category Move Strip
  const strip = document.createElement("div");
  strip.className = "cat-strip";
  const moveLbl = document.createElement("span");
  moveLbl.className = "cat-strip-label";
  moveLbl.textContent = "Category:";
  strip.appendChild(moveLbl);

  for (const cat of getAllCategories()) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "cat-pill" + (curCat === cat.id ? " active" : "");
    pill.dataset.cat = cat.id;
    pill.textContent = cat.short;
    if (!cat.builtin && curCat === cat.id) {
      pill.style.borderColor = cat.color;
      pill.style.color = cat.color;
    }
    pill.addEventListener("click", () => {
      if (curCat !== cat.id) moveItemToCategory(item.id, cat.id);
    });
    strip.appendChild(pill);
  }

  const addCatPill = document.createElement("button");
  addCatPill.type = "button";
  addCatPill.className = "cat-pill cat-add-pill";
  addCatPill.textContent = "+ Category";
  addCatPill.addEventListener("click", () => openCategoryModal(item.id));
  strip.appendChild(addCatPill);

  card.appendChild(strip);
  return card;
}

function renderFocusTabs(filteredItems) {
  if (viewMode !== "list") {
    focusTabs.classList.add("hidden");
    return;
  }
  focusTabs.classList.remove("hidden");
  focusTabs.innerHTML = "";

  const allCats = getAllCategories();
  if (focusCat !== "ALL" && focusCat !== "EXPLORE" && !allCats.some((c) => c.id === focusCat)) {
    focusCat = "new";
  }

  const orderedCats = [];
  const newCat = allCats.find((c) => c.id === "new");
  const dougCat = allCats.find((c) => c.id === "needs_doug");
  const restCats = allCats.filter((c) => c.id !== "new" && c.id !== "needs_doug");
  if (newCat) orderedCats.push(newCat);
  if (dougCat) orderedCats.push(dougCat);

  const makeCatBtn = (cat) => {
    const count = filteredItems.filter((i) => getEffectiveCategory(i) === cat.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    const isAlert = cat.id === "needs_doug" && count > 0;
    btn.className = "focus-tab" + (focusCat === cat.id ? " active" : "") + (isAlert ? " focus-tab-alert" : "");
    btn.textContent = `${cat.label} (${count})`;
    btn.addEventListener("click", () => {
      focusCat = cat.id;
      render();
    });
    return btn;
  };

  for (const c of orderedCats) focusTabs.appendChild(makeCatBtn(c));

  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = "focus-tab" + (focusCat === "ALL" ? " active" : "");
  allTab.textContent = `📰 All (${filteredItems.length})`;
  allTab.addEventListener("click", () => {
    focusCat = "ALL";
    render();
  });
  focusTabs.appendChild(allTab);

  const expCount = filteredItems.filter((i) => isExploreDeeply(i)).length;
  const expTab = document.createElement("button");
  expTab.type = "button";
  expTab.className = "focus-tab" + (focusCat === "EXPLORE" ? " active" : "");
  expTab.textContent = `🔬 Explore Deeply (${expCount})`;
  expTab.addEventListener("click", () => {
    focusCat = "EXPLORE";
    render();
  });
  focusTabs.appendChild(expTab);

  for (const c of restCats) focusTabs.appendChild(makeCatBtn(c));

  const addTabBtn = document.createElement("button");
  addTabBtn.type = "button";
  addTabBtn.className = "focus-tab focus-tab-add";
  addTabBtn.textContent = "+ Category";
  addTabBtn.addEventListener("click", () => openCategoryModal(null));
  focusTabs.appendChild(addTabBtn);
}

function renderActiveFilterBar() {
  if (tagFilter === "ALL") {
    activeFilterBar.classList.add("hidden");
    activeFilterBar.innerHTML = "";
    return;
  }
  activeFilterBar.classList.remove("hidden");
  activeFilterBar.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = `Filtered by tag: "${tagFilter}"`;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn btn-xs";
  clearBtn.textContent = "Clear ✕";
  clearBtn.addEventListener("click", () => {
    tagFilter = "ALL";
    tagSelect.value = "ALL";
    render();
  });
  activeFilterBar.appendChild(span);
  activeFilterBar.appendChild(clearBtn);
}

function render() {
  boardContainer.innerHTML = "";
  const filtered = getAllItems().filter(matchesFilters);
  const allCats = getAllCategories();
  renderFocusTabs(filtered);
  renderActiveFilterBar();

  if (viewMode === "board") {
    boardContainer.className = "board-columns";
    for (const cat of allCats) {
      const colItems = filtered.filter((i) => getEffectiveCategory(i) === cat.id);
      const col = document.createElement("section");
      col.className = "column";
      col.dataset.cat = cat.id;

      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("drag-over");
        const droppedId = e.dataTransfer.getData("text/plain");
        if (droppedId) moveItemToCategory(droppedId, cat.id);
      });

      const header = document.createElement("div");
      header.className = "col-header";
      header.innerHTML = `
        <div class="col-title-row">
          <span class="col-dot" style="background:${cat.color}"></span>
          <span>${cat.label}</span>
        </div>
        <span class="col-count">${colItems.length}</span>
      `;
      col.appendChild(header);

      const cardsWrap = document.createElement("div");
      cardsWrap.className = "col-cards";
      if (colItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-col";
        empty.textContent = "Empty";
        cardsWrap.appendChild(empty);
      } else {
        for (const item of colItems) cardsWrap.appendChild(createCardElement(item));
      }
      col.appendChild(cardsWrap);
      boardContainer.appendChild(col);
    }
  } else {
    boardContainer.className = "board-list";
    let listItems = filtered;
    if (focusCat === "EXPLORE") {
      listItems = filtered.filter((i) => isExploreDeeply(i));
    } else if (focusCat !== "ALL") {
      listItems = filtered.filter((i) => getEffectiveCategory(i) === focusCat);
    }

    if (listItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-col";
      empty.textContent =
        focusCat === "needs_doug"
          ? "No open questions right now — you're all caught up!"
          : focusCat === "EXPLORE"
          ? "Click '🔬 Explore Deeply' on any card to queue it for a deeper sprint."
          : "No items in this category yet.";
      boardContainer.appendChild(empty);
    } else {
      for (const item of listItems) boardContainer.appendChild(createCardElement(item));
    }
  }
}

function renderExistingTagsModal() {
  ensureTagState();
  existingTagsList.innerHTML = "";
  for (const t of userState.customTagDefs) {
    const chip = document.createElement("span");
    chip.className = "existing-tag-item";
    const lbl = document.createElement("span");
    lbl.textContent = t;
    chip.appendChild(lbl);
    if (t !== USER_CONFIRMED_TAG) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "existing-tag-del";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        if (!confirm(`Remove tag "${t}" from all items?`)) return;
        userState.customTagDefs = userState.customTagDefs.filter((x) => x !== t);
        for (const k of Object.keys(userState.itemTags)) {
          userState.itemTags[k] = (userState.itemTags[k] || []).filter((x) => x !== t);
        }
        persistLocalState();
        populateTagDropdown();
        renderExistingTagsModal();
        render();
      });
      chip.appendChild(del);
    }
    existingTagsList.appendChild(chip);
  }
}

function renderExistingCatsModal() {
  ensureTagState();
  existingCatsList.innerHTML = "";
  for (const cat of getAllCategories()) {
    const chip = document.createElement("span");
    chip.className = "existing-tag-item";

    const dot = document.createElement("span");
    dot.className = "col-dot";
    dot.style.background = cat.color;
    chip.appendChild(dot);

    const lbl = document.createElement("span");
    lbl.textContent = cat.label;
    chip.appendChild(lbl);

    if (!cat.builtin) {
      const ren = document.createElement("button");
      ren.type = "button";
      ren.className = "existing-cat-action";
      ren.title = "Rename category";
      ren.textContent = "✎";
      ren.addEventListener("click", () => {
        const nextName = prompt("Rename category:", cat.label);
        if (!nextName || !nextName.trim()) return;
        const idx = userState.customCategoryDefs.findIndex((c) => c.id === cat.id);
        if (idx >= 0) {
          userState.customCategoryDefs[idx].label = nextName.trim();
          persistLocalState();
          populateNewItemCategorySelect();
          renderExistingCatsModal();
          render();
        }
      });
      chip.appendChild(ren);
    }

    if (!cat.locked) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "existing-tag-del";
      del.title = cat.builtin ? "Remove from tabs (restorable)" : "Delete category";
      del.textContent = "✕";
      del.addEventListener("click", () => removeOrHideCategory(cat));
      chip.appendChild(del);
    }
    existingCatsList.appendChild(chip);
  }

  const hiddenIds = userState.hiddenCategories || [];
  if (hiddenIds.length > 0) {
    hiddenCatsWrap.classList.remove("hidden");
    hiddenCatsList.innerHTML = "";
    for (const hid of hiddenIds) {
      const def = BASE_CATEGORIES.find((c) => c.id === hid);
      if (!def) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "btn btn-xs";
      chip.textContent = `+ Restore ${def.label}`;
      chip.addEventListener("click", () => {
        userState.hiddenCategories = (userState.hiddenCategories || []).filter((x) => x !== hid);
        persistLocalState();
        populateNewItemCategorySelect();
        renderExistingCatsModal();
        render();
      });
      hiddenCatsList.appendChild(chip);
    }
  } else {
    hiddenCatsWrap.classList.add("hidden");
    hiddenCatsList.innerHTML = "";
  }
}

async function unlockWithPassword(pw, remember) {
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Decrypting...";
  loginError.classList.add("hidden");

  try {
    const data = await decryptVault(pw);
    if (remember) {
      localStorage.setItem(PW_STORAGE_KEY, pw);
    } else {
      localStorage.removeItem(PW_STORAGE_KEY);
      sessionStorage.setItem(PW_STORAGE_KEY, pw);
    }

    seedItems = data.seed?.items || [];
    maxSprint = seedItems.reduce((m, x) => Math.max(m, x.sprint || 1), 1);
    baselineState = data.userState || {};
    vaultUnlocked = true;

    let localSaved = {};
    try {
      localSaved = JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || "{}");
    } catch {
      localSaved = {};
    }
    userState = mergeStates(baselineState, localSaved);
    ensureTagState();

    sourceMeta.textContent = `${data.seed?.sourceVersion || "v1.2.5.1"} • ${getAllItems().length} Entries`;
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    populateTagDropdown();
    populateNewItemCategorySelect();
    render();
    setSaveStatus("", isGhSyncConfigured() ? "☁️ Ready" : "Local Only");
    if (isGhSyncConfigured()) {
      pullRemoteUserState(true);
    }
  } catch (err) {
    loginError.textContent = err.message || "Failed to unlock.";
    loginError.classList.remove("hidden");
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "Unlock Feed";
  }
}

document.addEventListener("click", () => {
  if (openTagPopoverId !== null) {
    openTagPopoverId = null;
    render();
  }
});

togglePwBtn.addEventListener("click", () => {
  const isPw = pwInput.type === "password";
  pwInput.type = isPw ? "text" : "password";
  togglePwBtn.textContent = isPw ? "Hide" : "Show";
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  unlockWithPassword(pwInput.value, rememberCheckbox.checked);
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  render();
});

tagSelect.addEventListener("change", () => {
  tagFilter = tagSelect.value;
  render();
});

sortSelect.addEventListener("change", () => {
  sortOrder = sortSelect.value;
  render();
});

viewListBtn.addEventListener("click", () => {
  viewMode = "list";
  viewListBtn.classList.add("active");
  viewBoardBtn.classList.remove("active");
  render();
});

viewBoardBtn.addEventListener("click", () => {
  viewMode = "board";
  viewBoardBtn.classList.add("active");
  viewListBtn.classList.remove("active");
  render();
});

lockBtn.addEventListener("click", () => {
  if (vaultUnlocked) {
    localStorage.removeItem(PW_STORAGE_KEY);
    sessionStorage.removeItem(PW_STORAGE_KEY);
    vaultUnlocked = false;
    seedItems = [];
  }
  boardContainer.innerHTML = "";
  pwInput.value = "";
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  pwInput.focus();
});

function closeModal() {
  modalBackdrop.classList.add("hidden");
}
newItemBtn.addEventListener("click", () => {
  populateNewItemCategorySelect();
  modalBackdrop.classList.remove("hidden");
});
modalCloseBtn.addEventListener("click", closeModal);
modalCancelBtn.addEventListener("click", closeModal);

newItemForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("new-title").value.trim();
  if (!title) return;
  const cat = document.getElementById("new-category").value;
  const tag = document.getElementById("new-tag").value.trim() || "Custom Lead";
  const outcome = document.getElementById("new-howto").value.trim();
  const setupSteps = document.getElementById("new-steps").value.trim();

  const item = {
    id: `custom-${Date.now()}`,
    code: "CUSTOM",
    sprint: maxSprint,
    sortOrder: 9500,
    confidence: "NEEDS_DOUG_CHECK",
    title,
    tag,
    defaultCategory: cat,
    outcome,
    setupSteps,
    howTo: outcome,
    stepByStep: setupSteps,
    whyItWorks: "",
    proof: "",
    copySnippets: [],
    isCustom: true,
  };

  userState.customItems = [item, ...(userState.customItems || [])];
  userState.categories = { ...(userState.categories || {}), [item.id]: cat };
  newItemForm.reset();
  document.getElementById("new-tag").value = "Custom Lead";
  closeModal();
  persistLocalState();
  populateTagDropdown();
  render();
});

newTagBtn.addEventListener("click", () => {
  renderExistingTagsModal();
  tagModalBackdrop.classList.remove("hidden");
  tagNameInput.focus();
});
tagModalCloseBtn.addEventListener("click", () => tagModalBackdrop.classList.add("hidden"));

newTagForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = tagNameInput.value.trim();
  if (!val) return;
  tagNameInput.value = "";
  createNewTagDef(val, null);
});

newCatBtn.addEventListener("click", () => openCategoryModal(null));
catModalCloseBtn.addEventListener("click", () => {
  pendingCatItemId = null;
  catModalBackdrop.classList.add("hidden");
});

newCatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = catNameInput.value.trim();
  if (!val) return;
  catNameInput.value = "";
  const targetId = pendingCatItemId;
  pendingCatItemId = null;
  createNewCategoryDef(val, targetId);
});

syncSnapshotBtn.addEventListener("click", () => {
  const cfg = getGhSyncConfig();
  ghRepoInput.value = cfg.repo;
  ghBranchInput.value = cfg.branch;
  ghPathInput.value = cfg.path;
  ghTokenInput.value = cfg.token;
  importSnapshotArea.value = "";
  updateSyncBanner();
  syncModalBackdrop.classList.remove("hidden");
});
syncModalCloseBtn.addEventListener("click", () => syncModalBackdrop.classList.add("hidden"));

ghSyncForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nextCfg = {
    repo: ghRepoInput.value.trim(),
    branch: ghBranchInput.value.trim() || "main",
    path: ghPathInput.value.trim() || "data/user_state.json",
    token: ghTokenInput.value.trim(),
  };
  localStorage.setItem(GH_SYNC_STORAGE_KEY, JSON.stringify(nextCfg));
  ghRemoteSha = null;
  updateSyncBanner();
  if (isGhSyncConfigured()) {
    const ok = await pullRemoteUserState(false);
    if (ok) syncModalBackdrop.classList.add("hidden");
  } else {
    showToast("Saved local settings (add repo + token to enable live sync).");
  }
});

ghPullBtn.addEventListener("click", () => pullRemoteUserState(false));

ghClearBtn.addEventListener("click", () => {
  localStorage.removeItem(GH_SYNC_STORAGE_KEY);
  ghRepoInput.value = "";
  ghTokenInput.value = "";
  ghRemoteSha = null;
  updateSyncBanner();
  setSaveStatus("", "Local Only");
  showToast("Disconnected live GitHub sync.");
});

copySnapshotBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(userState, null, 2));
  showToast("Copied your edits snapshot!");
});

importSnapshotBtn.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(importSnapshotArea.value.trim());
    userState = mergeStates(userState, parsed);
    persistLocalState();
    populateTagDropdown();
    populateNewItemCategorySelect();
    render();
    syncModalBackdrop.classList.add("hidden");
    showToast("Imported snapshot!");
  } catch {
    showToast("Invalid JSON snapshot.");
  }
});

resetLocalBtn.addEventListener("click", () => {
  if (!confirm("Reset browser overrides back to the repository baseline?")) return;
  localStorage.removeItem(STATE_STORAGE_KEY);
  userState = mergeStates(baselineState, {});
  persistLocalState();
  populateTagDropdown();
  populateNewItemCategorySelect();
  render();
  syncModalBackdrop.classList.add("hidden");
  showToast("Reset to repo baseline.");
});

const savedPw =
  localStorage.getItem(PW_STORAGE_KEY) ||
  sessionStorage.getItem(PW_STORAGE_KEY) ||
  localStorage.getItem("factory_bugs_pw");
if (savedPw) {
  pwInput.value = savedPw;
  unlockWithPassword(savedPw, true);
}
