// Local-first workbook persistence.
// gtm-console-database.xlsx (next to server.py) is the durable source of truth.
// The Python backend reads/writes it directly on disk; the browser just talks
// to /api/workbook/state, so this works with zero manual file picking, in any browser.

let autoSaveTimer = null;
let isAutoSaveRunning = false;

function workbookStateSlice() {
  return {
    contacts: database.contacts || [],
    events: database.events || {},
    stats: database.stats || {},
    meetings: database.meetings || [],
    approvals: database.approvals || [],
    workflowRuns: database.workflowRuns || database.runs || [],
    currentOutboundSubtab: database.currentOutboundSubtab || "prospects",
    autoEnrich: Boolean(database.autoEnrich)
  };
}

async function loadWorkbookFromServer() {
  const response = await fetch("/api/workbook/state");
  if (!response.ok) throw new Error(`Server responded with ${response.status}`);
  const payload = await response.json();
  const state = payload.state || {};

  database.contacts = state.contacts || [];
  database.events = state.events || { gac_dinner: [], symwest_booth: [], executive_meetup: [] };
  database.stats = state.stats || { emailsSent: 0, linkedinSent: 0, callsMade: 0, enrichedCount: 0 };
  database.meetings = state.meetings || [];
  database.approvals = state.approvals || [];
  database.workflowRuns = state.workflowRuns || [];
  database.currentOutboundSubtab = state.currentOutboundSubtab || "prospects";
  database.autoEnrich = Boolean(state.autoEnrich);

  database.workbookMode = true;
  database.workbookName = "gtm-console-database.xlsx";
  database.workbookPath = payload.path || database.workbookName;

  initLoadedData();
  updateLocalWorkbookStatus();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
  addLogConsole("enrich", `[LOCAL WORKBOOK] Loaded ${database.contacts.length} contacts from ${database.workbookName}. Auto-saving is active.`, "success");
  return database.contacts.length;
}

// Chained so saves always run one at a time, in submission order: an older save
// can never finish after a newer one and clobber it back on disk.
let workbookSaveQueue = Promise.resolve();

function saveWorkbookToServer() {
  if (!database.workbookMode) {
    return Promise.reject(new Error("The workbook hasn't finished loading yet. Try again in a moment."));
  }
  const run = workbookSaveQueue.then(async () => {
    // Snapshot the state now, at execution time, so a save that was queued behind
    // an earlier one still sends the freshest data instead of a stale capture.
    const response = await fetch("/api/workbook/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: workbookStateSlice() })
    });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    database.localWorkbookLastSaved = new Date().toISOString();
    updateLocalWorkbookStatus();
    return true;
  });
  // Keep the queue alive even if this save fails, so later saves still run.
  workbookSaveQueue = run.catch(() => {});
  return run;
}

function startWorkbookAutoSaveDaemon() {
  if (isAutoSaveRunning) return;
  isAutoSaveRunning = true;

  // Auto-save every 3 seconds as a safety net alongside the per-mutation saves in saveDatabaseCache().
  autoSaveTimer = setInterval(async () => {
    if (!database.workbookMode) return;
    try {
      await saveWorkbookToServer();
    } catch (err) {
      console.warn("[AUTO-SAVE DAEMON]", err.message);
    }
  }, 3000);
}

function saveWorkbookBeforeUnload() {
  // Last-resort flush for an actual tab close. The visibilitychange handler above
  // already saved via a normal awaited fetch (no payload-size limit) just before this
  // fires in the usual close sequence, so this is a backstop, not the primary path.
  if (!database.workbookMode || !navigator.sendBeacon) return;
  const blob = new Blob([JSON.stringify({ state: workbookStateSlice() })], { type: "application/json" });
  const queued = navigator.sendBeacon("/api/workbook/state", blob);
  if (!queued) {
    // Most commonly hit when the payload exceeds the browser's sendBeacon size cap
    // (workbooks with a lot of enrichment/campaign data). Nothing more we can do
    // synchronously on unload, but at least surface it instead of failing silently.
    console.warn("[LOCAL WORKBOOK] sendBeacon could not queue the closing save (payload may be too large).");
  }
}

async function exportLocalWorkbook() {
  if (!window.XLSX) throw new Error("The workbook engine has not loaded yet.");
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
  window.XLSX.writeFile(workbook, database.workbookName || "gtm-console-database.xlsx");
}

function updateLocalWorkbookStatus(message) {
  const status = document.getElementById("local-workbook-status");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (database.workbookMode && database.workbookName) {
    const saved = database.localWorkbookLastSaved ? ` · Auto-saved ${new Date(database.localWorkbookLastSaved).toLocaleTimeString()}` : " · Auto-save active";
    status.textContent = `Connected database: ${database.workbookPath || database.workbookName} (auto-managed by the local server)${saved}.`;
  } else {
    status.textContent = "Workbook unavailable. Confirm the local server is running.";
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && database.workbookMode) {
    saveWorkbookToServer().catch(() => {});
  }
});
window.addEventListener("pagehide", saveWorkbookBeforeUnload);

window.loadWorkbookFromServer = loadWorkbookFromServer;
window.saveWorkbookToServer = saveWorkbookToServer;
window.exportLocalWorkbook = exportLocalWorkbook;
window.updateLocalWorkbookStatus = updateLocalWorkbookStatus;
window.startWorkbookAutoSaveDaemon = startWorkbookAutoSaveDaemon;
