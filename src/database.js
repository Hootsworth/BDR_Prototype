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
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFromNumber: "",
  linkedinClientId: "",
  linkedinClientSecret: "",
  linkedinAccessToken: "",
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
  eventsMeta: [],        // Metadata for events (title, date, location, type, description)

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
  currentOutboundSubtab: 'influencers',
  autoEnrich: false,
  simulationMode: true,
  workbookMode: false,
  workbookName: "",
  workbookPath: "",
  localWorkbookLastSaved: "",
  approvals: [],
  workflowRuns: []
};
window.database = database;

function saveDatabaseCache() {
  database._dirty = true;
  if (database.workbookMode && typeof saveWorkbookToServer === "function") {
    saveWorkbookToServer().catch(error => addLogConsole("enrich", `[DATABASE SYNC ERROR] ${error.message}`, "error"));
    return;
  }
  const stateSnapshot = {
    contacts: database.contacts,
    events: database.events,
    eventsMeta: database.eventsMeta || [],
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
  fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: stateSnapshot }) })
    .then(response => {
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    })
    .catch(error => {
      console.error("[DATABASE SYNC ERROR]", error.message);
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (!localHost) updateLocalWorkbookStatus?.("Remote persistence is unavailable in this deployment. Changes may not survive a reload.");
    });
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
  if (window.currentTabId === 'dashboard' && typeof renderDashboard === "function") renderDashboard();
  else if (document.getElementById("set-panel-view-developer")?.classList.contains("active") && typeof renderDashboardActivityFeed === "function") renderDashboardActivityFeed();
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

function normalizeLinkedinUrl(rawUrl) {
  const val = String(rawUrl || "").trim();
  if (!val) return "";
  if (/^linkedin\.com\//i.test(val)) return "https://www." + val;
  if (/^www\.linkedin\.com\//i.test(val)) return "https://" + val;
  return val;
}
window.normalizeLinkedinUrl = normalizeLinkedinUrl;

function isValidLinkedinProfileUrl(rawUrl) {
  const val = normalizeLinkedinUrl(rawUrl);
  if (!val) return false;
  return /^https?:\/\/(www\.)?linkedin\.com\/(in|sales|pub)\/[a-zA-Z0-9\-_%]+\/?/i.test(val);
}
window.isValidLinkedinProfileUrl = isValidLinkedinProfileUrl;

function getCustomerCalendlyUrl() {
  return (
    database.calendlyUrl ||
    localStorage.getItem("gtm_calendly_url") ||
    "https://calendly.com/gtm-console/executive-briefing"
  ).trim();
}
window.getCustomerCalendlyUrl = getCustomerCalendlyUrl;

function computeContactReferralCredits(contact) {
  if (!contact) return 10;
  const hasTaken = Boolean(
    contact.hasTakenCall ||
    (Array.isArray(contact.callsMade) && contact.callsMade.some(cm => cm && (cm.status === "taken" || /interested|taken|spoke/i.test(cm.outcome || ""))))
  );
  if (hasTaken) return 25;
  const hasScheduled = Boolean(
    contact.hasScheduledCall ||
    (Array.isArray(contact.callsMade) && contact.callsMade.length > 0) ||
    (Array.isArray(database.meetings) && database.meetings.some(m => m.contactEmail === contact.email || String(m.contactId) === String(contact.id)))
  );
  if (hasScheduled) return 15;
  return 10;
}
window.computeContactReferralCredits = computeContactReferralCredits;

function getInfluencerEarningsSummary(influencer) {
  if (!influencer) {
    return {
      totalReferrals: 0,
      contactsOnlyCount: 0,
      callsScheduledCount: 0,
      callsCompletedCount: 0,
      totalCredits: 0,
      pendingCredits: 0,
      approvedCredits: 0,
      creditDollarRate: 10,
      estimatedPayoutUsd: 0,
      ledger: []
    };
  }
  const infId = String(influencer.id || "");
  const infEmail = String(influencer.email || "").toLowerCase();
  const infName = String(influencer.fullName || "").toLowerCase();
  const referrals = (database.contacts || []).filter(c =>
    !c.isInfluencer && !c.archivedAt && (
      (infId && String(c.influencerId || "") === infId) ||
      (infEmail && String(c.influencerEmail || "").toLowerCase() === infEmail) ||
      (infName && String(c.referredBy || "").toLowerCase() === infName)
    )
  );

  let contactsOnlyCount = 0;
  let callsScheduledCount = 0;
  let callsCompletedCount = 0;
  let totalCredits = 0;
  let approvedCredits = 0;
  let pendingCredits = 0;

  const ledger = referrals.map(ref => {
    const credits = computeContactReferralCredits(ref);
    let stage = "Contact Shared (+10 cr)";
    let stageCode = "contact_shared";
    if (credits === 25) {
      stage = "GTM Call Completed (+10 cr bonus)";
      stageCode = "call_completed";
      callsCompletedCount++;
      callsScheduledCount++;
      approvedCredits += credits;
    } else if (credits === 15) {
      stage = "GTM Call Scheduled (+5 cr bonus)";
      stageCode = "call_scheduled";
      callsScheduledCount++;
      approvedCredits += 10;
      pendingCredits += 5;
    } else if (credits === 10) {
      contactsOnlyCount++;
      approvedCredits += 10;
    } else {
      contactsOnlyCount++;
      approvedCredits += credits;
    }
    totalCredits += credits;
    return {
      id: ref.id,
      fullName: ref.fullName || "Contact",
      email: ref.email || "",
      company: ref.company || "Organization",
      jobTitle: ref.jobTitle || "",
      date: ref.referredDate || ref.date || "Active",
      stage,
      stageCode,
      credits
    };
  });

  const creditDollarRate = 10; // $10 per partner credit placeholder
  return {
    totalReferrals: referrals.length,
    contactsOnlyCount,
    callsScheduledCount,
    callsCompletedCount,
    totalCredits,
    approvedCredits,
    pendingCredits,
    creditDollarRate,
    estimatedPayoutUsd: totalCredits * creditDollarRate,
    ledger
  };
}
window.getInfluencerEarningsSummary = getInfluencerEarningsSummary;
