// --- MAIN BOOTSTRAP AND TEMPLATE LOADER ---

const componentsList = {
  'dashboard': 'components/dashboard.html',
  'upload': 'components/upload.html',
  'analyse': 'components/analytics.html',
  'influencers': 'components/influencers.html',
  'enrich': 'components/enrich.html',
  'campaign-outbound': 'components/campaign-outbound.html',
  'campaign-schedule': 'components/campaign-schedule.html',
  'events-list': 'components/events-list.html',
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

let currentTabId = 'upload';
window.currentTabId = currentTabId;

async function bootstrapApp() {
  // 1. Fetch & inject templates first
  await loadComponentTemplates();

  const savedGoogleBrowserClientId = localStorage.getItem("gtm_google_browser_client_id");
  if (savedGoogleBrowserClientId && window.GoogleConfig) window.GoogleConfig.clientId = savedGoogleBrowserClientId;
  const googleBrowserClientInput = document.getElementById("settings-google-browser-client-id");
  if (googleBrowserClientInput) googleBrowserClientInput.value = window.GoogleConfig?.clientId || "";
  if (typeof updateLocalWorkbookStatus === "function") updateLocalWorkbookStatus();

  // Load saved API Keys
  // Provider secrets are session-only and are never restored from browser storage.
  database.exploriumApiKey = "";
  database.llmHelperKey = "";
  database.geminiApiKey = "";
  database.geminiModel = localStorage.getItem("gtm_model_gemini") || "gemini-2.5-flash";
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

  // If URL hash or default is set, open it
  switchTab('dashboard');

  // Restore sidebar collapse state
  if (localStorage.getItem("gtm_sidebar_collapsed") === "true") {
    const sidebar = document.getElementById("sidebar-panel");
    if (sidebar) sidebar.classList.add("collapsed");
  }

  // Check for auto loading in local storage
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

  // Prefer the durable local backend snapshot when it contains data.
  try {
    const durableResponse = await fetch("/api/state");
    const durable = await durableResponse.json();
    const durableState = durable.state || {};
    if (durableState.contacts && durableState.contacts.length > 0 && !isDemoSeededContactList(durableState.contacts)) {
      database.contacts = durableState.contacts;
      database.events = durableState.events || database.events;
      database.stats = durableState.stats || database.stats;
      database.meetings = durableState.meetings || database.meetings || [];
      initLoadedData();
      addLogConsole("enrich", `[SYSTEM] Loaded ${database.contacts.length} contacts from durable local storage.`, "info");
    } else if (durableState.contacts && durableState.contacts.length > 0) {
      addLogConsole("enrich", "[SYSTEM] Ignored legacy demo records from durable storage.", "warning");
    }
  } catch (error) {
    addLogConsole("enrich", "[SYSTEM] Durable storage unavailable; browser cache remains active.", "warning");
  }

  // Restore the selected workbook when the browser grants the saved file handle.
  // Workbook data wins over browser cache and the optional local API snapshot.
  if (typeof restoreLocalWorkbook === "function") {
    try { await restoreLocalWorkbook(); } catch (error) {
      addLogConsole("enrich", `[LOCAL WORKBOOK] Could not restore the workbook: ${error.message}`, "warning");
    }
  }

  // Initialize autocomplete typing
  if (typeof initAgentAutocomplete === "function") initAgentAutocomplete();

  // Dynamically load Clerk Auth SDK
  if (typeof loadClerkSDK === "function") loadClerkSDK();
}

let lastActiveTabId = 'dashboard';

function switchTab(tabId) {
  if (window.currentTabId && window.currentTabId !== 'settings-keys') {
    lastActiveTabId = window.currentTabId;
  }
  window.currentTabId = tabId;

  const sidebar = document.getElementById("sidebar-panel");
  const mainHeader = document.querySelector(".main-content-wrapper > header");

  if (tabId === 'settings-keys') {
    if (sidebar) sidebar.style.display = "none";
    if (mainHeader) mainHeader.style.display = "none";
  } else {
    if (sidebar) sidebar.style.display = "flex";
    if (mainHeader) mainHeader.style.display = "flex";
  }

  // Toggle active tab buttons in navigation
  document.querySelectorAll(".subtab-btn, .astryx-sidenav-item").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    const categoryGroup = activeBtn.closest(".nav-category-group");
    if (categoryGroup && !categoryGroup.classList.contains("expanded")) {
      categoryGroup.classList.add("expanded");
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
  } else if (tabId === 'upload' && typeof filterUploadTable === "function") {
    filterUploadTable();
  } else if (tabId === 'influencers' && typeof filterInfluencersTable === "function") {
    filterInfluencersTable();
  } else if (tabId === 'campaign-outbound' && typeof filterOutboundTable === "function") {
    filterOutboundTable();
  } else if (tabId === 'campaign-schedule' && typeof renderScheduleMeetings === "function") {
    renderScheduleMeetings();
  } else if (tabId === 'events-list' && typeof renderEventsList === "function") {
    renderEventsList();
  } else if (tabId === 'enrich' && typeof checkEnrichButtonState === "function") {
    checkEnrichButtonState();
  } else if (tabId === 'analyse' && typeof filterFunnelSegment === "function") {
    filterFunnelSegment(document.getElementById("funnel-industry-filter")?.value || "all");
  } else if (tabId === 'agent-mode' && typeof initAgentAutocomplete === "function") {
    initAgentAutocomplete();
  }
}

function toggleNavCategory(catId) {
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
      titleEl.textContent = "GTM Orchestrator Dashboard";
      subtitleEl.textContent = "Monitor campaign metrics, agent execution progress, and meeting conversion rates.";
      break;
    case 'upload':
      titleEl.textContent = "Upload Contacts";
      subtitleEl.textContent = "Upload manual CSV or load target database of credit union accounts.";
      break;
    case 'enrich':
      titleEl.textContent = "AgentSource B2B Data Enrichment";
      subtitleEl.textContent = "Verify key and enrich leads with verified corporate intelligence.";
      break;
    case 'influencers':
      titleEl.textContent = "Influencers Match Matching";
      subtitleEl.textContent = "Assess target personas, ICP compatibility scores, and lead temperature classification.";
      break;
    case 'enrich':
      titleEl.textContent = "AgentSource B2B Data Enrichment";
      subtitleEl.textContent = "Verify key and enrich leads with verified corporate intelligence.";
      break;
    case 'campaign-outbound':
      titleEl.textContent = "Omnichannel Campaign Outbound";
      subtitleEl.textContent = "Engage prospects across Email, LinkedIn, and Phone channels in one console.";
      break;
    case 'campaign-schedule':
      titleEl.textContent = "Campaign Briefings & Meetings";
      subtitleEl.textContent = "Track scheduled appointments, review briefs, and launch briefings.";
      break;
    case 'events-list':
      titleEl.textContent = "Events Lists & Attendances";
      subtitleEl.textContent = "Review registered attendees for credit union dinners and booth visits.";
      break;
    case 'events-register':
      titleEl.textContent = "Register Event Attendee";
      subtitleEl.textContent = "Register any targeted contact into event lists.";
      break;
    case 'agent-mode':
      titleEl.textContent = "Agent Mode Orchestrator";
      subtitleEl.textContent = "Run approved workflow steps against the active contacts and connected providers.";
      break;
    case 'settings-keys':
      titleEl.textContent = "Global Credentials & Settings";
      subtitleEl.textContent = "Manage API configurations, model selection, and credentials for autonomous agents.";
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
  updateSystemStatusDot();
  if (typeof renderDashboard === "function") renderDashboard();
}

function updateStatsSummaryText() {
  const summaryEl = document.getElementById("upload-stats-summary");
  if (!summaryEl) return;

  const total = database.contacts.length;
  const enriched = database.contacts.filter(c => c.enriched).length;
  summaryEl.innerHTML = `<strong>Total Records:</strong> ${total.toLocaleString()} | <strong>Enriched:</strong> ${enriched.toLocaleString()}`;
}

function toggleSidebarCollapse() {
  const sidebar = document.getElementById("sidebar-panel");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
    const isCollapsed = sidebar.classList.contains("collapsed");
    localStorage.setItem("gtm_sidebar_collapsed", isCollapsed ? "true" : "false");
  }
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
  const targetTab = lastActiveTabId || 'dashboard';
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
    { title: "Dashboard", subtitle: "Jump to main GTM metrics & campaign status", tab: "dashboard", icon: "📊" },
    { title: "Agent Control Mode", subtitle: "Autonomous 12-node GTM orchestrator & DAG visualizer", tab: "agent-mode", icon: "🤖" },
    { title: "Data Enrichment", subtitle: "Bulk enrich contacts via Explorium API", tab: "enrich", icon: "⚡" },
    { title: "Outbound Sequences", subtitle: "Build and dispatch multi-channel outreach campaigns", tab: "campaign-outbound", icon: "📧" },
    { title: "Analytics & Funnel", subtitle: "Full-funnel conversion attribution & velocity reports", tab: "analytics", icon: "📈" },
    { title: "Influencer Portal", subtitle: "Affiliate rewards, referrals, and LinkedIn matching", tab: "influencers", icon: "🌟" },
    { title: "Global Settings & Keys", subtitle: "Manage API keys, models, and CRM integrations", tab: "settings-keys", icon: "⚙️" }
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
              <span style="font-size: 16px;">👤</span>
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
    switchTab("influencers");
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
window.toggleNavCategory = toggleNavCategory;
window.updateHeader = updateHeader;
window.updateSystemStatusDot = updateSystemStatusDot;
window.initLoadedData = initLoadedData;
window.updateStatsSummaryText = updateStatsSummaryText;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.toggleNotificationDropdown = toggleNotificationDropdown;
window.clearNotifications = clearNotifications;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.handleCommandPaletteSearch = handleCommandPaletteSearch;
window.runCommandPaletteAction = runCommandPaletteAction;
