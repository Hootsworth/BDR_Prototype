// --- MAIN BOOTSTRAP AND TEMPLATE LOADER ---

const componentsList = {
  'dashboard': 'components/dashboard.html',
  'upload': 'components/upload.html',
  'analyse': 'components/analytics.html',
  'influencers': 'components/influencers.html',
  'influencer-portal': 'components/influencer-portal.html',
  'enrich': 'components/enrich.html',
  'campaign-outbound': 'components/campaign-outbound.html',
  'campaign-schedule': 'components/campaign-schedule.html',
  'events-list': 'components/events-list.html',
  'events-register': 'components/events-register.html',
  'settings-keys': 'components/settings-keys.html',
  'agent-mode': 'components/agent-mode.html'
};

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
      // Append dialogs to body
      document.body.appendChild(tempDiv);
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

  // Load saved API Keys
  database.exploriumApiKey = localStorage.getItem("gtm_key_explorium") || "";
  database.llmHelperKey = localStorage.getItem("gtm_key_llm_helper") || "";
  database.geminiApiKey = localStorage.getItem("gtm_key_gemini") || "";
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
  database.googleAccessToken = localStorage.getItem("gtm_google_access_token") || "";
  database.slackWebhookUrl = localStorage.getItem("gtm_slack_webhook_url") || "";

  const googleClientIdInput = document.getElementById("settings-google-client-id");
  if (googleClientIdInput) googleClientIdInput.value = database.googleClientId;

  const googleApiKeyInput = document.getElementById("settings-google-api-key");
  if (googleApiKeyInput) googleApiKeyInput.value = database.googleApiKey;

  const slackWebhookInput = document.getElementById("settings-slack-webhook-url");
  if (slackWebhookInput) slackWebhookInput.value = database.slackWebhookUrl;

  if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();

  // Render initial keys state
  if (typeof checkEnrichButtonState === "function") checkEnrichButtonState();

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

      if (database.contacts.length > 0) {
        initLoadedData();
        addLogConsole("enrich", `[SYSTEM] Loaded ${database.contacts.length} cached contacts from LocalStorage.`, "info");
        loadedFromCache = true;
      }
    } catch (e) {
      console.error("Error reading cached db", e);
    }
  }

  if (!loadedFromCache) {
    // Populate default database with rich mock data so it looks premium and working on first load!
    database.contacts = [
      {
        id: 101,
        firstName: "Sarah",
        lastName: "Jenkins",
        fullName: "Sarah Jenkins",
        email: "sjenkins@apexfcu.org",
        jobTitle: "Chief Information Officer",
        company: "Apex Federal Credit Union",
        phone: "+1 (555) 345-6789",
        industry: "Credit Union",
        sourceFile: "mock_gtm_pipeline_leads.csv",
        assetSize: "$450M",
        state: "MI",
        attendedDinner: "Attended",
        visitedBooth: "Yes",
        enriched: true,
        matchPercentage: 96,
        leadTemp: "Hot Lead",
        emailsSent: true,
        linkedinSent: false,
        callsMade: [{ date: "07/06/2026 10:30 AM", outcome: "Spoke to prospect - Interested" }],
        emailDraft: {
          subject: "Safe database compliance for Apex Federal Credit Union",
          body: "Hi Sarah,\n\nI saw your profile as Chief Information Officer at Apex Federal Credit Union. Tech leaders are adopting database LLMs but worry about data compliance.\n\nWe provide query validation guardrails built for credit unions.\n\nWould you be open to a quick brief next Tuesday?\n\nBest,\nSDR Campaign Agent"
        },
        linkedinDraft: null,
        isInfluencer: false,
        referredBy: "Bob Miller"
      },
      {
        id: 102,
        firstName: "Alex",
        lastName: "Patel",
        fullName: "Alex Patel",
        email: "apatel@summitmutual.com",
        jobTitle: "Director of IT Security",
        company: "Summit Mutual Credit Union",
        phone: "+1 (555) 789-0123",
        industry: "Credit Union",
        sourceFile: "mock_gtm_pipeline_leads.csv",
        assetSize: "$250M",
        state: "CO",
        attendedDinner: "",
        visitedBooth: "",
        enriched: false,
        matchPercentage: 90,
        leadTemp: "Cold Lead",
        emailsSent: false,
        linkedinSent: false,
        callsMade: [],
        emailDraft: null,
        linkedinDraft: null,
        isInfluencer: false,
        referredBy: "Sarah Vance"
      },
      {
        id: 201,
        firstName: "Bob",
        lastName: "Miller",
        fullName: "Bob Miller",
        email: "bob.miller@milleradvisory.com",
        jobTitle: "B2B Consultant",
        company: "Miller Advisory Group",
        phone: "+1 (555) 987-6543",
        industry: "Consulting",
        sourceFile: "mock_influencers.csv",
        assetSize: "",
        state: "NY",
        attendedDinner: "",
        visitedBooth: "",
        enriched: false,
        matchPercentage: 95,
        leadTemp: "Hot Lead",
        emailsSent: false,
        linkedinSent: false,
        callsMade: [],
        emailDraft: null,
        linkedinDraft: null,
        isInfluencer: true,
        referrals: [
          {
            fullName: "Sarah Jenkins",
            jobTitle: "Chief Information Officer",
            company: "Apex Federal Credit Union",
            email: "sjenkins@apexfcu.org",
            credits: 10,
            date: "07/07/2026"
          }
        ],
        referralCredits: 10
      },
      {
        id: 202,
        firstName: "Sarah",
        lastName: "Vance",
        fullName: "Sarah Vance",
        email: "svance@vanceconsulting.net",
        jobTitle: "Senior Advisor",
        company: "Vance Consulting Group",
        phone: "+1 (555) 123-4567",
        industry: "Consulting",
        sourceFile: "mock_influencers.csv",
        assetSize: "",
        state: "IL",
        enriched: false,
        matchPercentage: 92,
        leadTemp: "Cold Lead",
        emailsSent: false,
        linkedinSent: false,
        callsMade: [],
        isInfluencer: true,
        referrals: [
          {
            fullName: "Alex Patel",
            jobTitle: "Director of IT Security",
            company: "Summit Mutual Credit Union",
            email: "apatel@summitmutual.com",
            credits: 20,
            date: "07/07/2026"
          }
        ],
        referralCredits: 20
      }
    ];

    initLoadedData();
    saveDatabaseCache();
    addLogConsole("enrich", "[SYSTEM] No cached database. Initialized with sandbox mock data.", "info");
  }

  // Initialize autocomplete typing
  if (typeof initAgentAutocomplete === "function") initAgentAutocomplete();

  // Dynamically load Clerk Auth SDK
  if (typeof loadClerkSDK === "function") loadClerkSDK();
}

function switchTab(tabId) {
  window.currentTabId = tabId;

  // Toggle active tab buttons in navigation
  document.querySelectorAll(".subtab-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add("active");
    // Ensure parent category group is expanded
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
  } else if (tabId === 'influencer-portal' && typeof renderInfluencerPortal === "function") {
    renderInfluencerPortal();
  } else if (tabId === 'campaign-outbound' && typeof filterOutboundTable === "function") {
    filterOutboundTable();
  } else if (tabId === 'campaign-schedule' && typeof renderScheduleMeetings === "function") {
    renderScheduleMeetings();
  } else if (tabId === 'events-list' && typeof renderEventsList === "function") {
    renderEventsList();
  } else if (tabId === 'enrich' && typeof checkEnrichButtonState === "function") {
    checkEnrichButtonState();
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
    case 'analyse':
      titleEl.textContent = "Analyse List Data";
      subtitleEl.textContent = "Query the loaded CSV list using client-side natural language analytics.";
      break;
    case 'influencers':
      titleEl.textContent = "Influencers Match Matching";
      subtitleEl.textContent = "Assess target personas, ICP compatibility scores, and lead temperature classification.";
      break;
    case 'influencer-portal':
      titleEl.textContent = "Influencer Rewards & Referral Portal";
      subtitleEl.textContent = "Submit network contacts, track earned reward credits, redeem perks, and connect LinkedIn.";
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
      subtitleEl.textContent = "Simulate autonomous planning loops and agent coordination.";
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
    if (c.isInfluencer === undefined) c.isInfluencer = true;
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
  const badge = document.getElementById("notification-badge-dot");
  if (list) {
    list.innerHTML = `<div class="feed-empty-state" style="border:none; background:transparent;">No new notifications.</div>`;
  }
  if (badge) {
    badge.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", bootstrapApp);

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
