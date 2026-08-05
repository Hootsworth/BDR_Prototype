// --- GTM Step-by-Step Workflow Application State ---
let database = {
  contacts: [],         // Raw parsed CSV records
  filteredImport: [],   // Cached filter results for Import tab
  filteredInfluencers: [], // Filtered influencers
  filteredEmail: [],    // Filtered email outbound
  filteredLinkedin: [], // Filtered linkedin outbound
  filteredCall: [],     // Filtered phone numbers
  exploriumApiKey: "",  // Explorium API Key
  llmHelperKey: "",     // OpenAI/Gemini Key
  googleClientId: "",   // Google OAuth Client ID
  googleApiKey: "",     // Google Public API Key
  googleAccessToken: "",// Active Google OAuth Token
  slackWebhookUrl: "",  // Slack Incoming Webhook URL
  selectedContact: null, // Selected contact for right drawer details
  currentImportPage: 1,
  currentInfluencersPage: 1,
  currentEmailPage: 1,
  currentLinkedinPage: 1,
  currentCallPage: 1,
  pageSize: 15,          // Pagination size for performant table rendering

  // Events database
  events: {
    gac_dinner: [],      // Attendees for GAC Dinner
    symwest_booth: [],   // Attendees for SymWest Booth
    executive_meetup: [] // Custom registered attendees
  },

  // Agent mode state
  agentRunning: false,
  agentNodeIndex: 0,
  agentTimer: null,

  // Statistics
  stats: {
    emailsSent: 0,
    linkedinSent: 0,
    callsMade: 0,
    enrichedCount: 0
  },
  meetings: [],
  currentOutboundSubtab: 'prospects',
  autoEnrich: false,
  simulationMode: true,
  workbookMode: false,
  localWorkbookHandle: null,
  workbookName: "",
  localWorkbookLastSaved: "",
  approvals: [],
  workflowRuns: []
};
window.database = database;

function saveDatabaseCache() {
  if (database.workbookMode && database.localWorkbookHandle && typeof saveLocalWorkbook === "function") {
    saveLocalWorkbook().catch(error => addLogConsole("enrich", `[LOCAL WORKBOOK ERROR] ${error.message}`, "error"));
    return;
  }
  const stateSnapshot = {
    contacts: database.contacts,
    events: database.events,
    stats: database.stats,
    meetings: database.meetings || [],
    updatedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem("gtm_cached_database", JSON.stringify({
      contacts: database.contacts,
      events: database.events,
      stats: database.stats
    }));
  } catch (e) {
    console.warn("LocalStorage quota exceeded, caching stats and event configurations only.", e);
    try {
      localStorage.setItem("gtm_cached_database", JSON.stringify({
        contacts: [], // clear contacts to prevent quota error
        events: database.events,
        stats: database.stats
      }));
    } catch (err) {
      console.error("Failed to save even basic configurations to LocalStorage", err);
    }
  }
  // Durable local prototype storage. Browser cache remains a fast fallback only.
  fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: stateSnapshot }) }).catch(() => {});
}
window.saveDatabaseCache = saveDatabaseCache;

// --- SHARED UTILITY FUNCTIONS ---
// These are used across many components and must load before any component controller

function addLogConsole(consoleId, lineText, type = "system") {
  const box = document.getElementById(`${consoleId}-console-box`);
  if (!box) return;
  const line = document.createElement("div");
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${lineText}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;

  // Sync to dashboard feed
  if (!database.recentActivities) database.recentActivities = [];
  let displayTxt = lineText.replace(/^\[[A-Z\s_-]+\]\s*/, '');
  database.recentActivities.unshift({
    type: type === "system" ? "info" : type,
    text: displayTxt,
    time: new Date().toLocaleTimeString()
  });
  if (database.recentActivities.length > 25) {
    database.recentActivities.pop();
  }
  if (window.currentTabId === 'dashboard' && typeof renderDashboard === "function") {
    renderDashboard();
  }
}
window.addLogConsole = addLogConsole;

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
window.getInitials = getInitials;

function getAvatarColor(name) {
  if (!name) return "hsl(0, 0%, 50%)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 50%, 40%)`;
}
window.getAvatarColor = getAvatarColor;
