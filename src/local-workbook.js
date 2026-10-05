// Local-first Relational & Graph Database persistence.
// .prototype-data/gtm.sqlite3 is the durable searchable source of truth (moving away from Excel workbook format).
// The Python backend maintains normalized relational tables (contacts, referrals_edges, events_meta, event_attendees)
// and provides natural-language + structured SQL search at /api/db/search.

let autoSaveTimer = null;
let isAutoSaveRunning = false;

function workbookStateSlice() {
  return {
    contacts: database.contacts || [],
    events: database.events || {},
    eventsMeta: database.eventsMeta || [],
    stats: database.stats || {},
    meetings: database.meetings || [],
    approvals: database.approvals || [],
    workflowRuns: database.workflowRuns || database.runs || [],
    vendors: database.vendors || [],
    marketplaceRequests: database.marketplaceRequests || [],
    currentOutboundSubtab: database.currentOutboundSubtab || "influencers",
    autoEnrich: Boolean(database.autoEnrich),
    calendlyUrl: database.calendlyUrl || localStorage.getItem("gtm_calendly_url") || ""
  };
}

async function loadWorkbookFromServer() {
  if (!localPersistenceAvailable()) {
    updateLocalWorkbookStatus("Remote database storage is unavailable in this deployment.");
    throw new Error("Durable database storage is available only from the local app server.");
  }
  const response = await fetch("/api/db/state");
  if (!response.ok) throw new Error(`Server responded with ${response.status}`);
  const payload = await response.json();
  const state = payload.state || {};

  database.contacts = state.contacts || [];
  database.events = state.events || { gac_dinner: [], symwest_booth: [], executive_meetup: [] };
  database.eventsMeta = state.eventsMeta || [
    { eventKey: "gac_dinner", title: "GAC 2026 Executive VIP Dinner", date: "2026-10-14", location: "Washington, D.C.", type: "Executive Dinner", description: "Private C-suite dinner for Credit Union CIOs and Advisory Partners." },
    { eventKey: "symwest_booth", title: "SymWest 2026 Booth #412 Visitors", date: "2026-10-22", location: "San Diego, CA", type: "Conference Booth", description: "Symitar & Jack Henry ecosystem leaders visiting the live LLM Query Guardrails demo booth." },
    { eventKey: "executive_meetup", title: "Credit Union AI & Compliance Roundtable", date: "2026-11-05", location: "Chicago, IL / Hybrid", type: "VIP Roundtable", description: "Interactive executive briefing on zero-trust LLM database gateways." }
  ];
  database.stats = state.stats || { emailsSent: 0, linkedinSent: 0, callsMade: 0, enrichedCount: 0 };
  database.meetings = state.meetings || [];
  database.approvals = state.approvals || [];
  database.workflowRuns = state.workflowRuns || [];
  database.vendors = state.vendors || [];
  database.marketplaceRequests = state.marketplaceRequests || [];
  database.currentOutboundSubtab = state.currentOutboundSubtab || "influencers";
  database.autoEnrich = Boolean(state.autoEnrich);
  if (state.calendlyUrl) {
    database.calendlyUrl = state.calendlyUrl;
    localStorage.setItem("gtm_calendly_url", state.calendlyUrl);
  }
  database._dirty = false;

  database.workbookMode = true;
  database.workbookName = "gtm.sqlite3 (SQLite Relational + Graph DB)";
  database.workbookPath = payload.path || ".prototype-data/gtm.sqlite3";

  initLoadedData();
  updateLocalWorkbookStatus();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderEventsTable === "function") renderEventsTable();
  if (typeof renderInfluencersPortal === "function") renderInfluencersPortal();
  addLogConsole("enrich", `[SQLITE GRAPH DB] Loaded ${database.contacts.length} contacts (30 Influencers × 30 Referrals) from ${database.workbookName}.`, "success");
  return database.contacts.length;
}

let workbookSaveQueue = Promise.resolve();

function saveWorkbookToServer() {
  if (!database.workbookMode) {
    return Promise.reject(new Error("The database hasn't finished loading yet. Try again in a moment."));
  }
  if (!localPersistenceAvailable()) {
    return Promise.reject(new Error("Durable database storage is available only from the local app server."));
  }
  const run = workbookSaveQueue.then(async () => {
    const snapshot = workbookStateSlice();
    const savedDirtyState = database._dirty;
    const response = await fetch("/api/db/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: snapshot })
    });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    // Mutations can happen while the request is in flight. Only clear the dirty
    // flag if the current state still matches the snapshot we just persisted.
    if (savedDirtyState && JSON.stringify(workbookStateSlice()) === JSON.stringify(snapshot)) {
      database._dirty = false;
    }
    database.localWorkbookLastSaved = new Date().toISOString();
    updateLocalWorkbookStatus();
    return true;
  }).catch(error => {
    database._dirty = true;
    throw error;
  });
  workbookSaveQueue = run.catch(() => {});
  return run;
}

function startWorkbookAutoSaveDaemon() {
  if (isAutoSaveRunning) return;
  isAutoSaveRunning = true;

  autoSaveTimer = setInterval(async () => {
    if (!database.workbookMode || !database._dirty) return;
    try {
      await saveWorkbookToServer();
    } catch (err) {
      console.warn("[AUTO-SAVE DAEMON]", err.message);
    }
  }, 4000);
}

function saveWorkbookBeforeUnload() {
  if (!database.workbookMode || !database._dirty || !navigator.sendBeacon) return;
  if (!localPersistenceAvailable()) return;
  const blob = new Blob([JSON.stringify({ state: workbookStateSlice() })], { type: "application/json" });
  navigator.sendBeacon("/api/db/state", blob);
}

async function searchDatabaseContacts(queryText = "", filters = {}) {
  const response = await fetch("/api/db/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: queryText, filters })
  });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  return response.json();
}

function localPersistenceAvailable() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function reseedSyntheticDatabase() {
  let response;
  try {
    response = await fetch("/api/db/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true })
    });
  } catch (error) {
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (localHost) {
      throw new Error("Cannot reach the local app server. Restart it with run_local.sh or run_local.bat, then reopen http://localhost:8001.");
    }
    throw new Error(`Cannot reach the database API: ${error.message}`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.error ? `: ${payload.error}` : "";
    } catch (_) {}
    throw new Error(`Seed failed (${response.status})${detail}`);
  }
  await loadWorkbookFromServer();
  return true;
}

async function exportLocalWorkbook() {
  if (!window.XLSX) throw new Error("The export engine has not loaded yet.");
  const contacts = database.contacts || [];
  const workbook = window.XLSX.utils.book_new();
  const sheet = window.XLSX.utils.json_to_sheet(contacts.map(record => {
    const row = { ...record };
    Object.keys(row).forEach(key => {
      if (row[key] && typeof row[key] === "object") row[key] = JSON.stringify(row[key]);
    });
    return row;
  }));
  window.XLSX.utils.book_append_sheet(workbook, sheet, "Contacts");
  window.XLSX.writeFile(workbook, "gtm-console-export.xlsx");
}

function updateLocalWorkbookStatus(message) {
  const status = document.getElementById("local-workbook-status");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (database.workbookMode && database.workbookName) {
    const saved = database.localWorkbookLastSaved ? ` · Synced ${new Date(database.localWorkbookLastSaved).toLocaleTimeString()}` : " · Real-time SQLite sync active";
    const infCount = (database.contacts || []).filter(c => c.isInfluencer).length;
    const prosCount = (database.contacts || []).length - infCount;
    status.textContent = `Connected SQLite Relational & Graph DB: ${database.workbookPath} (${infCount} Influencers, ${prosCount} Prospects)${saved}.`;
  } else {
    status.textContent = "Database unavailable. Confirm the local server is running.";
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && database.workbookMode && database._dirty) {
    saveWorkbookToServer().catch(() => {});
  }
});
window.addEventListener("pagehide", saveWorkbookBeforeUnload);

window.loadWorkbookFromServer = loadWorkbookFromServer;
window.saveWorkbookToServer = saveWorkbookToServer;
window.searchDatabaseContacts = searchDatabaseContacts;
window.reseedSyntheticDatabase = reseedSyntheticDatabase;
window.exportLocalWorkbook = exportLocalWorkbook;
window.updateLocalWorkbookStatus = updateLocalWorkbookStatus;
window.startWorkbookAutoSaveDaemon = startWorkbookAutoSaveDaemon;
window.localPersistenceAvailable = localPersistenceAvailable;
