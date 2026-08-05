// Local-first workbook persistence.
// The selected .xlsx file is the durable source of truth in workbook mode.
const WORKBOOK_SHEETS = [
  "Contacts", "Companies", "Enrichment", "Campaigns", "Activities",
  "Approvals", "Events", "Settings", "Runs", "Metadata"
];
const WORKBOOK_IDB_NAME = "gtm-console-local-workbook";
const WORKBOOK_IDB_STORE = "handles";
const WORKBOOK_IDB_KEY = "active-workbook";

function workbookRows(records) {
  return (records || []).map(record => {
    const row = { ...record };
    Object.keys(row).forEach(key => {
      if (row[key] && typeof row[key] === "object") row[key] = JSON.stringify(row[key]);
    });
    return row;
  });
}

function workbookRecords(sheet) {
  if (!sheet || !window.XLSX) return [];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map(row => {
    const record = { ...row };
    Object.keys(record).forEach(key => {
      if (typeof record[key] !== "string") return;
      const value = record[key].trim();
      if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
        try { record[key] = JSON.parse(value); } catch (_) { /* keep the original text */ }
      }
    });
    return record;
  });
}

function jsonSetting(key, value) {
  return { key, value: JSON.stringify(value ?? null) };
}

function workbookSnapshot() {
  const contacts = database.contacts || [];
  const companies = [...new Map(
    contacts.filter(c => c.company).map(c => [c.company, {
      company: c.company,
      industry: c.industry || "",
      contacts: contacts.filter(x => x.company === c.company).length
    }])
  ).values()];
  const enrichment = contacts
    .filter(c => c.aiEnrichment || c.enrichmentStatus || c.enriched)
    .map(c => ({
      contactId: c.id,
      email: c.email,
      enriched: Boolean(c.enriched),
      enrichmentStatus: c.enrichmentStatus || "",
      enrichmentSources: c.enrichmentSources || [],
      enrichmentFields: c.enrichmentFields || [],
      aiEnrichment: c.aiEnrichment || {},
      enrichedAt: c.enrichedAt || ""
    }));
  const campaigns = contacts
    .filter(c => c.emailDraft || c.emailsSent || c.linkedinDraft || c.linkedinSent || c.callsMade?.length)
    .map(c => ({
      contactId: c.id,
      email: c.email,
      emailDraft: c.emailDraft || {},
      emailsSent: Boolean(c.emailsSent),
      emailSentAt: c.emailSentAt || "",
      emailProviderId: c.emailProviderId || "",
      linkedinDraft: c.linkedinDraft || null,
      linkedinSent: Boolean(c.linkedinSent),
      callsMade: c.callsMade || []
    }));
  const activities = contacts.flatMap(c => (c.replyHistory || []).map(reply => ({
    contactId: c.id, email: c.email, type: "gmail_reply", ...reply
  })));
  const settings = [
    jsonSetting("events", database.events || {}),
    jsonSetting("stats", database.stats || {}),
    jsonSetting("meetings", database.meetings || []),
    jsonSetting("currentOutboundSubtab", database.currentOutboundSubtab || "prospects"),
    jsonSetting("autoEnrich", Boolean(database.autoEnrich)),
    jsonSetting("savedAt", new Date().toISOString())
  ];
  const runs = database.workflowRuns || database.runs || [];
  return {
    Contacts: contacts,
    Companies: companies,
    Enrichment: enrichment,
    Campaigns: campaigns,
    Activities: activities,
    Approvals: database.approvals || [],
    Events: Object.entries(database.events || {}).flatMap(([eventName, attendees]) =>
      (attendees || []).map(attendee => ({ eventName, ...attendee }))
    ),
    Settings: settings,
    Runs: runs,
    Metadata: [{ schema: "gtm-console-workbook-v2", exportedAt: new Date().toISOString() }]
  };
}

function buildWorkbook() {
  const workbook = window.XLSX.utils.book_new();
  const snapshot = workbookSnapshot();
  WORKBOOK_SHEETS.forEach(name => {
    const sheet = window.XLSX.utils.json_to_sheet(workbookRows(snapshot[name] || []));
    window.XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  return workbook;
}

function openHandleStore(mode = "readonly") {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open(WORKBOOK_IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(WORKBOOK_IDB_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction(WORKBOOK_IDB_STORE, mode).objectStore(WORKBOOK_IDB_STORE));
  });
}

async function rememberWorkbookHandle(handle) {
  try {
    const store = await openHandleStore("readwrite");
    if (!store) return;
    await new Promise((resolve, reject) => {
      const request = store.put(handle, WORKBOOK_IDB_KEY);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    // File access still works if IndexedDB is disabled; the user can reopen manually.
  }
}

async function rememberedWorkbookHandle() {
  try {
    const store = await openHandleStore();
    if (!store) return null;
    return await new Promise((resolve, reject) => {
      const request = store.get(WORKBOOK_IDB_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    return null;
  }
}

function settingsFromWorkbook(workbook) {
  const settings = workbook.Sheets.Settings ? workbookRecords(workbook.Sheets.Settings) : [];
  const values = {};
  settings.forEach(row => {
    if (!row.key) return;
    try { values[row.key] = JSON.parse(String(row.value)); } catch (_) { values[row.key] = row.value; }
  });
  if (values.events) database.events = values.events;
  if (values.stats) database.stats = values.stats;
  if (values.meetings) database.meetings = values.meetings;
  if (values.currentOutboundSubtab) database.currentOutboundSubtab = values.currentOutboundSubtab;
  if (typeof values.autoEnrich === "boolean") database.autoEnrich = values.autoEnrich;
}

function contactForWorkbookRecord(contactRows, record) {
  return contactRows.find(contact => String(contact.id) === String(record.contactId))
    || contactRows.find(contact => contact.email && contact.email === record.email);
}

async function loadWorkbookHandle(handle, announce = true) {
  if (!window.XLSX) throw new Error("The workbook engine has not loaded yet.");
  const file = await handle.getFile();
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const contacts = workbook.Sheets.Contacts ? workbookRecords(workbook.Sheets.Contacts) : [];
  database.localWorkbookHandle = handle;
  database.workbookMode = true;
  database.workbookName = file.name;
  database.contacts = contacts;
  database.approvals = workbook.Sheets.Approvals ? workbookRecords(workbook.Sheets.Approvals) : [];
  database.workflowRuns = workbook.Sheets.Runs ? workbookRecords(workbook.Sheets.Runs) : [];
  settingsFromWorkbook(workbook);

  (workbook.Sheets.Enrichment ? workbookRecords(workbook.Sheets.Enrichment) : []).forEach(enrichment => {
    const contact = contactForWorkbookRecord(database.contacts, enrichment);
    if (!contact) return;
    Object.assign(contact, {
      enriched: enrichment.enriched,
      enrichmentStatus: enrichment.enrichmentStatus,
      enrichmentSources: enrichment.enrichmentSources,
      enrichmentFields: enrichment.enrichmentFields,
      aiEnrichment: enrichment.aiEnrichment,
      enrichedAt: enrichment.enrichedAt
    });
  });

  (workbook.Sheets.Campaigns ? workbookRecords(workbook.Sheets.Campaigns) : []).forEach(campaign => {
    const contact = contactForWorkbookRecord(database.contacts, campaign);
    if (contact) Object.assign(contact, campaign);
  });

  (workbook.Sheets.Activities ? workbookRecords(workbook.Sheets.Activities) : []).forEach(activity => {
    const contact = contactForWorkbookRecord(database.contacts, activity);
    if (contact && activity.type === "gmail_reply") {
      if (!contact.replyHistory) contact.replyHistory = [];
      if (!contact.replyHistory.some(reply => reply.messageId === activity.messageId)) contact.replyHistory.push(activity);
    }
  });

  if (workbook.Sheets.Events) {
    database.events = {};
    workbookRecords(workbook.Sheets.Events).forEach(row => {
      const { eventName, ...attendee } = row;
      if (!eventName) return;
      if (!database.events[eventName]) database.events[eventName] = [];
      database.events[eventName].push(attendee);
    });
  }

  await rememberWorkbookHandle(handle);
  database.meetings = database.meetings || [];
  initLoadedData();
  updateLocalWorkbookStatus();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
  if (announce) addLogConsole("enrich", `[LOCAL WORKBOOK] Opened ${file.name}; workbook is the local database.`, "success");
  return file.name;
}

async function saveLocalWorkbook() {
  if (!database.localWorkbookHandle || !window.XLSX) return false;
  const bytes = window.XLSX.write(buildWorkbook(), { bookType: "xlsx", type: "array" });
  const writable = await database.localWorkbookHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
  database.localWorkbookLastSaved = new Date().toISOString();
  updateLocalWorkbookStatus();
  return true;
}

async function openLocalWorkbook() {
  if (!window.XLSX) throw new Error("The workbook engine has not loaded yet.");
  if (!window.showOpenFilePicker) throw new Error("Use Chrome or Edge for direct local workbook access.");
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
    multiple: false
  });
  return loadWorkbookHandle(handle);
}

async function restoreLocalWorkbook() {
  if (!window.showOpenFilePicker || !window.XLSX) return false;
  const handle = await rememberedWorkbookHandle();
  if (!handle) return false;
  try {
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      updateLocalWorkbookStatus("Workbook remembered. Click Open .xlsx once to re-authorize access.");
      return false;
    }
    await loadWorkbookHandle(handle, false);
    addLogConsole("enrich", `[LOCAL WORKBOOK] Reopened ${handle.name} automatically.`, "success");
    return true;
  } catch (_) {
    updateLocalWorkbookStatus("Workbook remembered. Click Open .xlsx to reconnect it.");
    return false;
  }
}

async function saveLocalWorkbookAs() {
  if (!window.showSaveFilePicker) throw new Error("Use Chrome or Edge for direct local workbook access.");
  database.localWorkbookHandle = await window.showSaveFilePicker({
    suggestedName: database.workbookName || "gtm-console-data.xlsx",
    types: [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }]
  });
  database.workbookMode = true;
  database.workbookName = database.localWorkbookHandle.name || "gtm-console-data.xlsx";
  await rememberWorkbookHandle(database.localWorkbookHandle);
  await saveLocalWorkbook();
  addLogConsole("enrich", `[LOCAL WORKBOOK] Created ${database.workbookName}.`, "success");
  return database.workbookName;
}

async function exportLocalWorkbook() {
  if (!window.XLSX) throw new Error("The workbook engine has not loaded yet.");
  window.XLSX.writeFile(buildWorkbook(), database.workbookName || "gtm-console-data.xlsx");
}

function updateLocalWorkbookStatus(message) {
  const status = document.getElementById("local-workbook-status");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (database.workbookMode && database.workbookName) {
    const saved = database.localWorkbookLastSaved ? ` · saved ${new Date(database.localWorkbookLastSaved).toLocaleTimeString()}` : "";
    status.textContent = `Connected: ${database.workbookName}. The workbook is the local database${saved}.`;
  } else {
    status.textContent = "No workbook open. Create or open an .xlsx to make it the local database.";
  }
}

window.saveLocalWorkbook = saveLocalWorkbook;
window.openLocalWorkbook = openLocalWorkbook;
window.restoreLocalWorkbook = restoreLocalWorkbook;
window.saveLocalWorkbookAs = saveLocalWorkbookAs;
window.exportLocalWorkbook = exportLocalWorkbook;
window.updateLocalWorkbookStatus = updateLocalWorkbookStatus;
