// --- MAIN BOOTSTRAP AND TEMPLATE LOADER ---

const componentsList = {
  'dashboard': 'components/dashboard.html',
  'upload': 'components/upload.html',
  'analyse': 'components/analytics.html',
  'campaign-outbound': 'components/campaign-outbound.html',
  'email': 'components/email.html',
  // [PARTNERS TAB DISCONNECTED]: Preserved in codebase. Uncomment below to reconnect:
  // 'influencers': 'components/influencers.html',
  'settings-keys': 'components/settings-keys.html',
  'agent-mode': 'components/agent-mode.html'
};

function isDemoSeededContactList(records) {
  return (records || []).some(contact => String(contact.sourceFile || "").toLowerCase().startsWith("mock_")
    || ["sjenkins@apexfcu.org", "apatel@summitmutual.com", "bob.miller@milleradvisory.com", "svance@vanceconsulting.net"].includes(String(contact.email || "").toLowerCase()));
}

async function loadComponentTemplates() {
  // Load each main tab-panel template asynchronously
  for (const [tabId, path] of Object.entries(componentsList)) {
    const section = document.getElementById(`tab-panel-${tabId}`);
    if (section) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          section.innerHTML = await response.text();
        } else {
          console.error(`Failed to fetch component template: ${path}`);
        }
      } catch (err) {
        console.error(`Error loading component ${tabId}:`, err);
      }
    }
  }

  // Load dialogs and modals overlays at the bottom of the body
  try {
    const response = await fetch('components/dialogs.html');
    if (response.ok) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = await response.text();
      while (tempDiv.firstChild) {
        document.body.appendChild(tempDiv.firstChild);
      }
    }
  } catch (err) {
    console.error('Error loading dialog templates:', err);
  }
}

let currentTabId = 'dashboard';
window.currentTabId = currentTabId;
window.currentImportContactsMode = 'csv';

async function bootstrapApp() {
  // Clerk must be ready before the first protected database request. Otherwise
  // hosted startup falls back to browser cache and never enables autosave.
  if (typeof loadClerkSDK === "function") {
    try { await loadClerkSDK(); }
    catch (error) { console.warn("Clerk initialization failed; hosted data access remains unavailable.", error); }
  }

  // 1. Fetch & inject templates first
  await loadComponentTemplates();

  const savedGoogleBrowserClientId = localStorage.getItem("gtm_google_browser_client_id");
  if (savedGoogleBrowserClientId && window.GoogleConfig) window.GoogleConfig.clientId = savedGoogleBrowserClientId;
  const googleBrowserClientInput = document.getElementById("settings-google-browser-client-id");
  if (googleBrowserClientInput) googleBrowserClientInput.value = window.GoogleConfig?.clientId || "";

  // Load saved API Keys
  // Provider secrets are session-only and are never restored from browser storage.
  database.exploriumApiKey = "";
  database.llmHelperKey = "";
  database.geminiApiKey = "";
  const savedGeminiModel = localStorage.getItem("gtm_model_gemini");
  database.geminiModel = ["gemini-3.5-flash", "gemini-3.5-flash-lite"].includes(savedGeminiModel)
    ? savedGeminiModel
    : "gemini-3.5-flash";
  database.geminiSearchGrounding = localStorage.getItem("gtm_gemini_search_grounding") !== "false";

  const exploriumInput = document.getElementById("key-explorium");
  if (exploriumInput) exploriumInput.value = database.exploriumApiKey;

  const llmInput = document.getElementById("key-llm-helper");
  if (llmInput) llmInput.value = database.llmHelperKey;

  const geminiInput = document.getElementById("key-gemini");
  if (geminiInput) geminiInput.value = database.geminiApiKey;

  const geminiModelSelect = document.getElementById("select-gemini-model");
  if (geminiModelSelect) geminiModelSelect.value = database.geminiModel;

  const geminiSearchCheckbox = document.getElementById("toggle-gemini-search");
  if (geminiSearchCheckbox) geminiSearchCheckbox.checked = database.geminiSearchGrounding;

  const settingsExploriumInput = document.getElementById("settings-key-explorium");
  if (settingsExploriumInput) settingsExploriumInput.value = database.exploriumApiKey;

  const settingsOpenAIInput = document.getElementById("settings-key-openai");
  if (settingsOpenAIInput) settingsOpenAIInput.value = database.llmHelperKey;
  if (typeof loadProviderKeysFromServer === "function") await loadProviderKeysFromServer();

  database.lemlistMcpCommand = localStorage.getItem("gtm_lemlist_mcp_command") || "npx";
  database.lemlistMcpArgs = localStorage.getItem("gtm_lemlist_mcp_args") || "mcp-remote https://app.lemlist.com/mcp";
  
  const settingsLemlistCmdInput = document.getElementById("settings-lemlist-mcp-command");
  if (settingsLemlistCmdInput) settingsLemlistCmdInput.value = database.lemlistMcpCommand;
  
  const settingsLemlistArgsInput = document.getElementById("settings-lemlist-mcp-args");
  if (settingsLemlistArgsInput) settingsLemlistArgsInput.value = database.lemlistMcpArgs;

  // Load Calendly & Calendar settings
  database.calendlyUrl = localStorage.getItem("gtm_calendly_url") || "https://calendly.com/aditya-dixit/30min";
  database.calendarSyncService = localStorage.getItem("gtm_calendar_sync_service") || "google";

  const calendlyInput = document.getElementById("settings-calendly-url");
  if (calendlyInput) calendlyInput.value = database.calendlyUrl;

  const calendarSyncSelect = document.getElementById("settings-calendar-sync");
  if (calendarSyncSelect) calendarSyncSelect.value = database.calendarSyncService;

  // Load Google Calendar & Slack settings
  database.googleClientId = localStorage.getItem("gtm_google_client_id") || "";
  database.googleApiKey = localStorage.getItem("gtm_google_api_key") || "";
  // Google access and refresh tokens are server-managed; never restore them from browser storage.
  database.googleAccessToken = "";
  database.slackWebhookUrl = "";

  const googleClientIdInput = document.getElementById("settings-google-client-id");
  if (googleClientIdInput) googleClientIdInput.value = database.googleClientId;

  const googleApiKeyInput = document.getElementById("settings-google-api-key");
  if (googleApiKeyInput) googleApiKeyInput.value = database.googleApiKey;

  const slackWebhookInput = document.getElementById("settings-slack-webhook-url");
  if (slackWebhookInput) slackWebhookInput.value = database.slackWebhookUrl;

  if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();

  // Render initial keys state
  if (typeof checkEnrichButtonState === "function") checkEnrichButtonState();
  if (typeof renderEnrichmentFieldOptions === "function") renderEnrichmentFieldOptions();

  database.autoEnrich = localStorage.getItem("gtm_auto_enrich") === "true";
  const autoEnrichCheckbox = document.getElementById("toggle-auto-enrich");
  if (autoEnrichCheckbox) autoEnrichCheckbox.checked = database.autoEnrich;

  // Open Directory as the primary main screen by default
  switchTab('dashboard');

  // Sidebar is permanently pinned open
  database.sidebarPosition = "left";
  database.sidebarCollapsible = false;
  applySidebarLayoutPreferences();

  // gtm-console-database.xlsx (server-managed) is the authoritative source. Always load from it first.
  // A single failed attempt would otherwise leave auto-save permanently disabled for the whole
  // session (every save path is gated on database.workbookMode, which only a successful load sets),
  // so retry a few times with backoff before giving up - this is almost always a transient blip.
  let loadedFromWorkbook = false;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const canAttemptInitialLoad = isLocalHost || Boolean(window.Clerk?.user);
  if (typeof loadWorkbookFromServer === "function" && canAttemptInitialLoad) {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts && !loadedFromWorkbook; attempt++) {
      try {
        const res = await loadWorkbookFromServer();
        if (res !== false) loadedFromWorkbook = true;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
    if (!loadedFromWorkbook) {
      const message = `Database not connected after ${maxAttempts} attempts (${lastError?.message || "unknown error"}). Sign in and confirm the hosted database configuration before adding records.`;
      addLogConsole("enrich", `[DATABASE] ${message}`, "error");
      if (typeof updateLocalWorkbookStatus === "function") updateLocalWorkbookStatus(message);
    }
  }

  // Offline/network-failure fallback only: browser cache, then the durable local SQLite snapshot.
  if (!loadedFromWorkbook) {
    const savedData = localStorage.getItem("gtm_cached_database");
    let loadedFromCache = false;
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        database.contacts = parsed.contacts || [];
        database.events = parsed.events || { gac_dinner: [], symwest_booth: [], executive_meetup: [] };
        database.stats = parsed.stats || { emailsSent: 0, linkedinSent: 0, callsMade: 0, enrichedCount: 0 };

        if (database.contacts.length > 0 && !isDemoSeededContactList(database.contacts)) {
          initLoadedData();
          addLogConsole("enrich", `[SYSTEM] Loaded ${database.contacts.length} cached contacts from LocalStorage.`, "info");
          loadedFromCache = true;
        } else if (database.contacts.length > 0) {
          database.contacts = [];
          database.meetings = [];
          localStorage.removeItem("gtm_cached_database");
          addLogConsole("enrich", "[SYSTEM] Ignored legacy demo records. Import real contacts or open a workbook to begin.", "warning");
        }
      } catch (e) {
        console.error("Error reading cached db", e);
      }
    }

    if (!loadedFromCache) {
      database.contacts = [];
      database.meetings = [];
      initLoadedData();
      addLogConsole("enrich", "[SYSTEM] Ready for a real workflow. Import contacts or open a local workbook to begin.", "info");
    }

    if (localPersistenceAvailable()) {
      try {
      const idToken = await window.getFirebaseIdToken?.();
      const durableResponse = await fetch("/api/state", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
      });
      if (!durableResponse.ok) throw new Error(`Durable state unavailable (${durableResponse.status})`);
      const durable = await durableResponse.json();
      const durableState = durable.state || {};
      if (durableState.contacts && durableState.contacts.length > 0 && !isDemoSeededContactList(durableState.contacts)) {
        database.contacts = durableState.contacts;
        database.events = durableState.events || database.events;
        database.stats = durableState.stats || database.stats;
        database.meetings = durableState.meetings || database.meetings || [];
        initLoadedData();
        addLogConsole("enrich", `[SYSTEM] Loaded ${database.contacts.length} contacts from durable storage.`, "info");
      } else if (durableState.contacts && durableState.contacts.length > 0) {
        addLogConsole("enrich", "[SYSTEM] Ignored legacy demo records from durable storage.", "warning");
      }
      } catch (error) {
        addLogConsole("enrich", "[SYSTEM] Durable storage unavailable; browser cache remains active.", "warning");
      }
    }
  }

  const entryParams = new URLSearchParams(window.location.search);
  // [PARTNERS TAB DISCONNECTED]: Clean URL parameters and hash to prevent accessing disconnected tab
  if (entryParams.get("tab") === "influencers") {
    entryParams.delete("tab");
    const cleanSearch = entryParams.toString() ? '?' + entryParams.toString() : '';
    const cleanHash = (window.location.hash === '#influencers' || window.location.hash === '#tab-panel-influencers') ? '' : window.location.hash;
    window.history.replaceState(null, '', window.location.pathname + cleanSearch + cleanHash);
  }
  if (window.location.hash === '#influencers' || window.location.hash === '#tab-panel-influencers') {
    window.location.hash = '#dashboard';
  }

  if (typeof startWorkbookAutoSaveDaemon === "function") startWorkbookAutoSaveDaemon();

  // Initialize autocomplete typing
  if (typeof initAgentAutocomplete === "function") initAgentAutocomplete();

  // Check for GitHub updates non-blockingly
  checkForAppUpdates();
}

let lastActiveTabId = 'campaign-outbound';

function openImportContactsTab(mode = 'csv') {
  window.currentImportContactsMode = mode === 'events' ? 'events' : 'csv';
  switchTab('upload');
  switchImportContactsMode(window.currentImportContactsMode);
}

function switchImportContactsMode(mode = 'csv') {
  const activeMode = mode === 'events' ? 'events' : 'csv';
  window.currentImportContactsMode = activeMode;

  const csvPanel = document.getElementById("import-contacts-mode-csv");
  const eventsPanel = document.getElementById("import-contacts-mode-events");
  const btnCsv = document.getElementById("btn-import-mode-csv");
  const btnEvents = document.getElementById("btn-import-mode-events");

  if (csvPanel) csvPanel.style.display = activeMode === 'csv' ? "block" : "none";
  if (eventsPanel) eventsPanel.style.display = activeMode === 'events' ? "block" : "none";

  if (btnCsv) {
    btnCsv.className = activeMode === 'csv' ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
  }
  if (btnEvents) {
    btnEvents.className = activeMode === 'events' ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
  }

  if (activeMode === 'events' && typeof renderEventsList === "function") {
    renderEventsList();
  } else if (typeof filterUploadTable === "function") {
    filterUploadTable();
  }
}

function switchTab(tabId) {
  // [PARTNERS TAB DISCONNECTED]: The 'influencers' tab is disconnected per admin requirements.
  // To reconnect, see docs/PARTNERS_TAB_RECONNECTION_GUIDE.md
  if (tabId === 'influencers') {
    console.info("[Navigation Guard] Partners tab is disconnected. Redirecting to Directory.");
    tabId = 'dashboard';
  }

  if (tabId === 'events-list') {
    openImportContactsTab('events');
    return;
  }

  if (window.currentTabId && window.currentTabId !== 'settings-keys') {
    lastActiveTabId = window.currentTabId;
  }
  window.currentTabId = tabId;

  const sidebar = document.getElementById("sidebar-panel");
  const edgePill = document.getElementById("sidebar-edge-proximity-pill");
  const mainHeader = document.querySelector(".main-content-wrapper > header");

  if (tabId === 'settings-keys') {
    if (sidebar) sidebar.style.display = "none";
    if (edgePill) edgePill.style.display = "none";
    if (mainHeader) mainHeader.style.display = "none";
    syncSidebarSettingsInputs();
  } else {
    if (sidebar) sidebar.style.display = "flex";
    if (mainHeader) mainHeader.style.display = "flex";
    applySidebarLayoutPreferences();
  }

  // Toggle active tab buttons in navigation
  document.querySelectorAll(".subtab-btn, .astryx-sidenav-item").forEach(btn => {
    btn.classList.remove("active");
  });
  document.querySelectorAll(".nav-category-header").forEach(hdr => {
    hdr.classList.remove("active");
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    const categoryGroup = activeBtn.closest(".nav-category-group");
    if (categoryGroup) {
      if (!categoryGroup.classList.contains("expanded")) {
        categoryGroup.classList.add("expanded");
      }
      const catHdr = categoryGroup.querySelector(".nav-category-header");
      if (catHdr) catHdr.classList.add("active");
    }
  }

  // Toggle active main sections
  document.querySelectorAll(".tab-content").forEach(panel => {
    panel.classList.remove("active");
  });
  const activePanel = document.getElementById(`tab-panel-${tabId}`);
  if (activePanel) {
    activePanel.classList.add("active");
  }

  // Update headers
  updateHeader(tabId);

  // Close any open drawers
  if (typeof closeDrawer === "function") {
    closeDrawer('email');
    closeDrawer('linkedin');
    closeDrawer('call');
    closeDrawer('outbound');
  }

  // Trigger tab-specific renders
  if (tabId === 'dashboard' && typeof renderDashboard === "function") {
    renderDashboard();
  } else if (tabId === 'upload') {
    switchImportContactsMode(window.currentImportContactsMode || 'csv');
    if (typeof filterUploadTable === "function") filterUploadTable();
    if (typeof renderEventsList === "function") renderEventsList();
    if (typeof checkEnrichButtonState === "function") checkEnrichButtonState();
    if (typeof renderEnrichmentFieldOptions === "function") renderEnrichmentFieldOptions();
    if (typeof updateUploadEnrichKPIs === "function") updateUploadEnrichKPIs();
  } else if (tabId === 'campaign-outbound') {
    if (typeof switchOutboundSubtab === "function") {
      switchOutboundSubtab(database.currentOutboundSubtab || 'influencers');
    } else if (typeof filterOutboundTable === "function") {
      filterOutboundTable();
    }
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const isAuthenticated = isLocal || Boolean(window.Clerk?.user);
    if (typeof loadWorkbookFromServer === "function" && isAuthenticated) {
      loadWorkbookFromServer().then(() => {
        if (typeof initLoadedData === "function") initLoadedData();
        if (typeof filterOutboundTable === "function") filterOutboundTable();
      }).catch(err => console.warn("Failed background refresh of outbound data:", err));
    }
  } else if (tabId === 'email' && typeof initEmailPage === 'function') {
    initEmailPage();
  } else if (tabId === 'influencers') {
    if (typeof renderInfluencersTable === "function") renderInfluencersTable();
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const isAuthenticated = isLocal || Boolean(window.Clerk?.user);
    if (typeof loadWorkbookFromServer === "function" && isAuthenticated) {
      loadWorkbookFromServer().then(() => {
        if (typeof renderInfluencersTable === "function") renderInfluencersTable();
      }).catch(() => {});
    }
  } else if (tabId === 'analyse' && typeof filterFunnelSegment === "function") {
    filterFunnelSegment(document.getElementById("funnel-industry-filter")?.value || "all");
  } else if (tabId === 'agent-mode' && typeof initAgentAutocomplete === "function") {
    initAgentAutocomplete();
  } else if (tabId === 'settings-keys' && typeof checkSettingsUpdates === "function") {
    checkSettingsUpdates();
  }
}

function toggleNavCategory(catId) {
  const sidebar = document.getElementById("sidebar-panel");
  if (sidebar && sidebar.classList.contains("collapsed")) {
    if (catId === 'contacts') openImportContactsTab('csv');
    else if (catId === 'campaign') switchTab('campaign-outbound');
    else if (catId === 'events') openImportContactsTab('events');
    else if (catId === 'influencers') switchTab('dashboard'); // Disconnected
    return;
  }
  const group = document.getElementById(`cat-group-${catId}`);
  if (group) {
    group.classList.toggle("collapsed");
  }
}

function updateHeader(tabId) {
  const titleEl = document.getElementById("active-panel-title");
  const subtitleEl = document.getElementById("active-panel-subtitle");
  if (!titleEl || !subtitleEl) return;

  switch (tabId) {
    case 'dashboard':
      titleEl.textContent = "Directory";
      subtitleEl.textContent = "Search accounts, inspect warm introductions, and track verified partner attribution.";
      break;
    case 'upload':
      titleEl.textContent = "Import";
      subtitleEl.textContent = "Add & enrich contacts or influencers directly, or capture attendees and influencers from field events.";
      break;
    case 'campaign-outbound':
      titleEl.textContent = "Campaign Outbound";
      subtitleEl.textContent = "Engage prospects and partners across Email, LinkedIn, and Phone — and manage scheduled briefings.";
      break;
    case 'email':
      titleEl.textContent = "Email";
      subtitleEl.textContent = "Manage your connected Gmail inbox and send messages from your account.";
      break;
    case 'events-list':
      titleEl.textContent = "Import — Events";
      subtitleEl.textContent = "Review registered attendees and capture new contacts or influencers from field events.";
      break;
    case 'influencers':
      titleEl.textContent = "Partners";
      subtitleEl.textContent = "Manage executive advisors, review warm introductions, and dispatch login invitations.";
      break;
    case 'events-register':
      titleEl.textContent = "Register Event Attendee";
      subtitleEl.textContent = "Register any targeted contact into event lists.";
      break;
    case 'agent-mode':
      titleEl.textContent = "Agent Mode Orchestrator";
      subtitleEl.textContent = "Run approved workflow steps against active contacts and connected providers.";
      break;
    case 'settings-keys':
      titleEl.textContent = "Settings & Telemetry";
      subtitleEl.textContent = "Manage API configurations, credentials, live dispatch telemetry, and system preferences.";
      break;
  }

  updateSystemStatusDot();
}

function updateSystemStatusDot() {
  const dot = document.getElementById("system-status-dot");
  const text = document.getElementById("system-status-text");
  if (!dot || !text) return;

  if (database.agentRunning) {
    dot.className = "status-dot active";
    text.textContent = "STATUS: AGENT MODE ACTIVE";
    text.style.color = "var(--success)";
  } else if (database.contacts.length === 0) {
    dot.className = "status-dot";
    text.textContent = "STATUS: STANDBY (AWAITING DATA)";
    text.style.color = "var(--muted)";
  } else if (database.contacts.some(c => c.enriched)) {
    dot.className = "status-dot active";
    text.textContent = "STATUS: ENRICHED - CAMPAIGN READY";
    text.style.color = "var(--primary)";
  } else {
    dot.className = "status-dot waiting";
    text.textContent = "STATUS: DATA LOADED (AWAITING ENRICHMENT)";
    text.style.color = "var(--warning)";
  }
}

function initLoadedData() {
  database.contacts.forEach(c => {
    if (!c.leadTemp) c.leadTemp = "Cold Lead";
    if (c.isInfluencer === undefined) c.isInfluencer = false;
    if (!c.referrals) c.referrals = [];
    if (c.referralCredits === undefined) c.referralCredits = 0;
  });

  database.currentImportPage = 1;
  database.currentInfluencersPage = 1;
  database.currentEmailPage = 1;
  database.currentLinkedinPage = 1;
  database.currentCallPage = 1;

  if (typeof checkEnrichButtonState === "function") checkEnrichButtonState();

  updateStatsSummaryText();
  
  if (typeof filterImportTable === "function") filterImportTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderEventsList === "function") renderEventsList();
  updateSystemStatusDot();
  if (typeof renderDashboard === "function") renderDashboard();
}

function updateStatsSummaryText() {
  const summaryEl = document.getElementById("upload-stats-summary");
  if (!summaryEl) return;

  const total = database.contacts.length;
  const enriched = database.contacts.filter(c => c.enriched).length;
  summaryEl.innerHTML = `<strong>Total Records:</strong> ${total.toLocaleString()} | <strong>Enriched:</strong> ${enriched.toLocaleString()}`;
  if (typeof updateUploadEnrichKPIs === "function") updateUploadEnrichKPIs();
}

let sidebarProximityTimer = null;
let sidebarProximityBound = false;

function syncSidebarSettingsInputs() {
  const posSelect = document.getElementById("settings-sidebar-position");
  const colSelect = document.getElementById("settings-sidebar-collapsible");
  if (posSelect) posSelect.value = database.sidebarPosition || "left";
  if (colSelect) colSelect.value = database.sidebarCollapsible !== false ? "true" : "false";
}

function applySidebarLayoutPreferences() {
  const appLayout = document.getElementById("app-layout-main");
  const sidebar = document.getElementById("sidebar-panel");
  const edgePill = document.getElementById("sidebar-edge-proximity-pill");
  if (!appLayout || !sidebar) return;

  database.sidebarPosition = "left";
  database.sidebarCollapsible = false;

  appLayout.classList.remove("sidebar-pos-right");
  appLayout.classList.remove("sidebar-collapsible-mode");
  sidebar.classList.remove("collapsed");
  sidebar.classList.remove("proximity-open");

  if (edgePill) edgePill.style.display = "none";
  syncSidebarSettingsInputs();
}

function updateSidebarPreferencesFromSettings() {
  database.sidebarPosition = "left";
  database.sidebarCollapsible = false;
  applySidebarLayoutPreferences();
}

function revealSidebarOverlayNow() {
  // Pinned sidebar does not require proximity reveals
}

function initSidebarProximityController() {
  // Disabled: sidebar is permanently pinned
}

function toggleSidebarCollapse() {
  // Disabled: sidebar is permanently pinned
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById("notification-dropdown");
  if (dropdown) {
    dropdown.classList.toggle("active");
  }
}

function clearNotifications() {
  const list = document.getElementById("notification-list");
  const countBadge = document.getElementById("notification-count");
  if (list) list.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--color-text-secondary); text-align: center;">No new notifications</div>`;
  if (countBadge) countBadge.textContent = "0";
}

function returnFromSettings() {
  const targetTab = lastActiveTabId || 'campaign-outbound';
  switchTab(targetTab);
}

// --- CATEGORY 2: GLOBAL COMMAND PALETTE (CMD+K) ---
function initCommandPaletteKeyListeners() {
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === "Escape") {
      closeCommandPalette();
    }
  });
}

function openCommandPalette() {
  const modal = document.getElementById("command-palette-modal");
  const input = document.getElementById("cmd-palette-input");
  if (!modal || !input) return;

  modal.style.display = "flex";
  input.value = "";
  input.focus();
  handleCommandPaletteSearch("");
}

function closeCommandPalette() {
  const modal = document.getElementById("command-palette-modal");
  if (modal) modal.style.display = "none";
}

function handleCommandPaletteSearch(query) {
  const resultsContainer = document.getElementById("cmd-palette-results");
  if (!resultsContainer) return;

  const q = query.trim().toLowerCase();

  const tabCommands = [
    { title: "Connectem AI", subtitle: "Main workspace for prospects, influencers, and scheduled calls", tab: "campaign-outbound", icon: "" },
    { title: "Search", subtitle: "Natural language & relational search across all contacts, referrals, and events", tab: "dashboard", icon: "" },
    { title: "Import Contacts (Add & Enrich)", subtitle: "Add contacts directly, upload CSV datasets, and run AI enrichment", tab: "upload", icon: "" },
    { title: "Import Contacts via Events", subtitle: "Manage field events and capture event attendees into the database", tab: "events-list", icon: "" },
    // [PARTNERS TAB DISCONNECTED]: Removed from command palette. Uncomment to restore:
    // { title: "Influencer Portal", subtitle: "Partner referral workspace, bulk add, and private shareable portal links", tab: "influencers", icon: "" },
    { title: "Agent Control Mode", subtitle: "Autonomous 12-node GTM orchestrator & DAG visualizer", tab: "agent-mode", icon: "" },
    { title: "Global Settings & Keys", subtitle: "Manage API keys, models, and CRM integrations", tab: "settings-keys", icon: "" }
  ];

  let html = "";

  // 1. Filter Tab Navigations
  const matchingTabs = tabCommands.filter(t => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q));
  if (matchingTabs.length > 0) {
    html += `<div style="padding: 6px 16px; font-size: 11px; font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Navigation & Tools</div>`;
    matchingTabs.forEach(t => {
      html += `
        <div onclick="runCommandPaletteAction('nav', '${t.tab}')" style="padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--color-border);" onmouseover="this.style.background='var(--surface-soft, #f0efed)'" onmouseout="this.style.background='transparent'">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 16px;">${t.icon}</span>
            <div>
              <strong style="font-size: 13.5px; color: var(--color-text-primary); display: block;">${t.title}</strong>
              <span style="font-size: 11.5px; color: var(--color-text-secondary);">${t.subtitle}</span>
            </div>
          </div>
          <span style="font-size: 11px; color: var(--color-text-secondary); background: var(--surface-card); border: 1px solid var(--color-border); padding: 2px 6px; border-radius: 4px;">Jump</span>
        </div>
      `;
    });
  }

  // 2. Filter Database Leads
  if (database.contacts && database.contacts.length > 0 && q.length > 0) {
    const matchingLeads = database.contacts.filter(c => c.fullName.toLowerCase().includes(q) || (c.company && c.company.toLowerCase().includes(q))).slice(0, 5);
    if (matchingLeads.length > 0) {
      html += `<div style="padding: 8px 16px 4px 16px; font-size: 11px; font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Matched Lead Records (${matchingLeads.length})</div>`;
      matchingLeads.forEach(c => {
        html += `
          <div onclick="runCommandPaletteAction('lead', '${c.fullName}')" style="padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--color-border);" onmouseover="this.style.background='var(--surface-soft, #f0efed)'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 16px;"></span>
              <div>
                <strong style="font-size: 13.5px; color: var(--color-text-primary); display: block;">${c.fullName}</strong>
                <span style="font-size: 11.5px; color: var(--color-text-secondary);">${c.jobTitle || 'Lead'} at ${c.company || 'Credit Union'}</span>
              </div>
            </div>
            <span class="badge badge-success" style="font-size: 10px;">${c.enriched ? 'Enriched' : 'Unenriched'}</span>
          </div>
        `;
      });
    }
  }

  if (!html) {
    html = `<div style="padding: 2rem; text-align: center; font-size: 13px; color: var(--color-text-secondary);">No matching commands or leads found for "${query}".</div>`;
  }

  resultsContainer.innerHTML = html;
}

function runCommandPaletteAction(actionType, targetVal) {
  closeCommandPalette();
  if (actionType === "nav") {
    switchTab(targetVal);
  } else if (actionType === "lead") {
    switchTab("dashboard");
  }
}

// --- AUTO-UPDATE ENGINE ---
async function checkForAppUpdates() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (!isLocal) {
    const banner = document.getElementById("system-update-banner");
    if (banner) banner.style.display = "none";
    return;
  }
  try {
    const res = await fetch("/api/system/update-check");
    if (!res.ok) return;
    const data = await res.json();
    const banner = document.getElementById("system-update-banner");
    if (data && data.update_available) {
      const tag = document.getElementById("update-banner-tag");
      const msg = document.getElementById("update-banner-msg");
      if (banner) {
        banner.style.display = "flex";
        if (tag) tag.textContent = data.latest_commit || "New Commit";
        if (msg) msg.textContent = `Update from ${data.author || "GitHub"}: "${data.commit_message || "Latest enhancements"}"`;
      }
    } else if (banner) {
      banner.style.display = "none";
    }
    if (typeof checkSettingsUpdates === "function") {
      checkSettingsUpdates();
    }
  } catch (_) {
    // Non-blocking background check
  }
}

function dismissUpdateBanner() {
  const banner = document.getElementById("system-update-banner");
  if (banner) banner.style.display = "none";
}

async function triggerOneClickUpdate() {
  const btn = document.getElementById("btn-run-auto-update");
  const btnText = document.getElementById("btn-update-text");
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "Updating Application...";

  try {
    const res = await fetch("/api/system/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const result = await res.json();
    if (res.ok && result.status === "success") {
      if (btnText) btnText.textContent = " Updated! Reloading...";
      setTimeout(() => {
        window.location.reload();
      }, 2800);
    } else {
      alert("Update failed: " + (result.error || "Unknown error occurred"));
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "1-Click Update";
    }
  } catch (err) {
    alert("Update request error: " + err.message);
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "1-Click Update";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrapApp();
  initCommandPaletteKeyListeners();
});

window.returnFromSettings = returnFromSettings;
window.loadComponentTemplates = loadComponentTemplates;
window.bootstrapApp = bootstrapApp;
window.switchTab = switchTab;
window.openImportContactsTab = openImportContactsTab;
window.switchImportContactsMode = switchImportContactsMode;
window.toggleNavCategory = toggleNavCategory;
window.updateHeader = updateHeader;
window.updateSystemStatusDot = updateSystemStatusDot;
window.initLoadedData = initLoadedData;
window.updateStatsSummaryText = updateStatsSummaryText;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.syncSidebarSettingsInputs = syncSidebarSettingsInputs;
window.applySidebarLayoutPreferences = applySidebarLayoutPreferences;
window.updateSidebarPreferencesFromSettings = updateSidebarPreferencesFromSettings;
window.revealSidebarOverlayNow = revealSidebarOverlayNow;
window.initSidebarProximityController = initSidebarProximityController;
window.toggleNotificationDropdown = toggleNotificationDropdown;
window.clearNotifications = clearNotifications;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.handleCommandPaletteSearch = handleCommandPaletteSearch;
window.runCommandPaletteAction = runCommandPaletteAction;
window.checkForAppUpdates = checkForAppUpdates;
window.dismissUpdateBanner = dismissUpdateBanner;
window.triggerOneClickUpdate = triggerOneClickUpdate;
