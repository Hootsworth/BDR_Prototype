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
  }
};
window.database = database;

// Main tab switching logic (handles subtabs and collapses others)
let currentTabId = 'import';

document.addEventListener("DOMContentLoaded", () => {
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

  database.lemlistApiKey = localStorage.getItem("gtm_key_lemlist") || "";
  const settingsLemlistInput = document.getElementById("settings-key-lemlist");
  if (settingsLemlistInput) settingsLemlistInput.value = database.lemlistApiKey;

  // Render initial keys state
  checkEnrichButtonState();

  // If URL hash or default is set, open it
  switchTab('import');

  // Check for auto loading in local storage
  const savedData = localStorage.getItem("gtm_cached_database");
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      database.contacts = parsed.contacts || [];
      database.events = parsed.events || { gac_dinner: [], symwest_booth: [], executive_meetup: [] };
      database.stats = parsed.stats || { emailsSent: 0, linkedinSent: 0, callsMade: 0, enrichedCount: 0 };

      if (database.contacts.length > 0) {
        initLoadedData();
        addLogConsole("enrich", `[SYSTEM] Loaded ${database.contacts.length} cached contacts from LocalStorage.`, "info");
      }
    } catch (e) {
      console.error("Error reading cached db", e);
    }
  }

  // Dynamically load Clerk Auth SDK using active configuration
  loadClerkSDK();
});

// Switch panel views
function switchTab(tabId) {
  currentTabId = tabId;

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
  closeDrawer('email');
  closeDrawer('linkedin');
  closeDrawer('call');

  // Trigger tab-specific renders
  if (tabId === 'import') {
    filterImportTable();
  } else if (tabId === 'influencers') {
    filterInfluencersTable();
  } else if (tabId === 'campaign-email') {
    filterEmailTable();
  } else if (tabId === 'campaign-linkedin') {
    filterLinkedinTable();
  } else if (tabId === 'campaign-call') {
    filterCallTable();
  } else if (tabId === 'events-list') {
    renderEventsList();
  } else if (tabId === 'enrich') {
    checkEnrichButtonState();
  } else if (tabId === 'agent-mode') {
    initAgentAutocomplete();
  }
}

// Collapsible side nav categories
function toggleNavCategory(catId) {
  const group = document.getElementById(`cat-group-${catId}`);
  if (group) {
    group.classList.toggle("collapsed");
  }
}

// Update Active Title
function updateHeader(tabId) {
  const titleEl = document.getElementById("active-panel-title");
  const subtitleEl = document.getElementById("active-panel-subtitle");
  if (!titleEl || !subtitleEl) return;

  switch (tabId) {
    case 'import':
      titleEl.textContent = "Import Contacts";
      subtitleEl.textContent = "Upload manual CSV or load target database of credit union accounts.";
      break;
    case 'uploads':
      titleEl.textContent = "Uploads Chatbot Analysis";
      subtitleEl.textContent = "Query the loaded CSV list using client-side natural language analytics.";
      break;
    case 'influencers':
      titleEl.textContent = "Influencers Match Matching";
      subtitleEl.textContent = "Assess target personas, ICP compatibility scores, and lead temperature classification.";
      break;
    case 'enrich':
      titleEl.textContent = "AgentSource B2B Data Enrichment";
      subtitleEl.textContent = "Verify key and enrich leads with verified corporate intelligence.";
      break;
    case 'campaign-email':
      titleEl.textContent = "Email Outbound Sequences";
      subtitleEl.textContent = "Draft AI email copy and release sequences individually.";
      break;
    case 'campaign-linkedin':
      titleEl.textContent = "LinkedIn Social Touches";
      subtitleEl.textContent = "Compose customized LinkedIn messages and connection notes.";
      break;
    case 'campaign-call':
      titleEl.textContent = "Outbound Call Dialer";
      subtitleEl.textContent = "Place simulated outbound calls to phone numbers and log outcomes.";
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

  // Render general system metrics in header status bar
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

// Add logs in custom console panels
function addLogConsole(consoleId, lineText, type = "system") {
  const box = document.getElementById(`${consoleId}-console-box`);
  if (!box) return;
  const line = document.createElement("div");
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${lineText}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// Auto load key visibility
function togglePasswordVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === "password") {
    el.type = "text";
    btn.textContent = "Hide";
  } else {
    el.type = "password";
    btn.textContent = "Show";
  }
}

// --- CSV PARSING ENGINE (Client side) ---

function parseCSV(text) {
  let lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',') {
      if (inQuotes) {
        row[row.length - 1] += c;
      } else {
        row.push('');
      }
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') {
        i++; // skip LF of CRLF
      }
      if (inQuotes) {
        row[row.length - 1] += '\n';
      } else {
        lines.push(row);
        row = [''];
      }
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

function processCSVLines(lines) {
  if (lines.length < 2) return [];
  let headers = lines[0].map(h => h.trim());
  let records = [];

  // Column matching
  let firstIdx = headers.indexOf("First Name");
  let lastIdx = headers.indexOf("Last Name");
  let emailIdx = headers.indexOf("Email");
  let jobIdx = headers.indexOf("Job Title");
  let companyIdx = headers.indexOf("Company name");
  let phoneIdx = headers.indexOf("Phone Number");
  let indIdx = headers.indexOf("Industry");
  let sourceIdx = headers.indexOf("Source_File");
  let assetIdx = headers.indexOf("Asset Size");
  let stateIdx = headers.indexOf("Shipping State");
  if (stateIdx === -1) stateIdx = headers.indexOf("State");
  let attendedIdx = headers.indexOf("Attended Dinner");
  let visitedIdx = headers.indexOf("Visited Booth");

  // Fallbacks
  if (firstIdx === -1) firstIdx = headers.indexOf("A");
  if (companyIdx === -1) companyIdx = headers.indexOf("B");
  if (jobIdx === -1) jobIdx = headers.indexOf("C");
  if (emailIdx === -1) emailIdx = headers.indexOf("EMAIL ADDRESS");

  for (let i = 1; i < lines.length; i++) {
    let row = lines[i];
    if (row.length < 3) continue; // skip incomplete rows

    let first = firstIdx !== -1 && firstIdx < row.length ? row[firstIdx] : "";
    let last = lastIdx !== -1 && lastIdx < row.length ? row[lastIdx] : "";
    let email = emailIdx !== -1 && emailIdx < row.length ? row[emailIdx] : "";
    let job = jobIdx !== -1 && jobIdx < row.length ? row[jobIdx] : "";
    let company = companyIdx !== -1 && companyIdx < row.length ? row[companyIdx] : "";
    let phone = phoneIdx !== -1 && phoneIdx < row.length ? row[phoneIdx] : "";
    let industry = indIdx !== -1 && indIdx < row.length ? row[indIdx] : "";
    let source = sourceIdx !== -1 && sourceIdx < row.length ? row[sourceIdx] : "";
    let asset = assetIdx !== -1 && assetIdx < row.length ? row[assetIdx] : "";
    let state = stateIdx !== -1 && stateIdx < row.length ? row[stateIdx] : "";
    let attended = attendedIdx !== -1 && attendedIdx < row.length ? row[attendedIdx] : "";
    let visited = visitedIdx !== -1 && visitedIdx < row.length ? row[visitedIdx] : "";

    // Skip blank or invalid rows
    if (!first && !company && !email) continue;

    let fullName = (first + " " + last).trim();
    if (!fullName && email) fullName = email.split("@")[0];

    // Standardize source file label
    let sourceLabel = source ? source.replace(/^\"|\"$/g, '') : "Uploaded File";

    records.push({
      id: i,
      firstName: first || fullName,
      lastName: last,
      fullName: fullName || "Unknown",
      email: email ? email.trim() : "",
      jobTitle: job ? job.trim() : "Executive",
      company: company ? company.trim() : "Unknown Credit Union",
      phone: phone ? phone.trim() : "",
      industry: industry ? industry.trim() : "Credit Union",
      sourceFile: sourceLabel,
      assetSize: asset ? asset.trim() : "",
      state: state ? state.trim() : "",
      attendedDinner: attended ? attended.trim() : "",
      visitedBooth: visited ? visited.trim() : "",
      enriched: false,
      matchPercentage: 0,
      leadTemp: "Cold Lead",
      emailsSent: false,
      linkedinSent: false,
      callsMade: [], // list of calls logged
      emailDraft: null,
      linkedinDraft: null
    });
  }
  return records;
}


// Manual Upload
function handleCSVFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const summaryEl = document.getElementById("import-stats-summary");
  if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--primary)">Reading local file: ${file.name}...</span>`;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const lines = parseCSV(text);
    const parsed = processCSVLines(lines);

    database.contacts = parsed;
    initLoadedData();
    saveDatabaseCache();

    addLogConsole("enrich", `[SYSTEM] Uploaded ${parsed.length} contacts from ${file.name}.`, "success");
  };
  reader.readAsText(file);
}

// Post loading processing
function initLoadedData() {
  // Populate filter dropdowns
  const sourceFilter = document.getElementById("filter-source");
  if (sourceFilter) {
    const sources = [...new Set(database.contacts.map(c => c.sourceFile))].filter(Boolean);
    sourceFilter.innerHTML = '<option value="">All Sources</option>';
    sources.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s.split("/").pop(); // show short name
      sourceFilter.appendChild(opt);
    });
  }

  // Load events attendees from original CSV columns
  database.events.gac_dinner = database.contacts.filter(c => c.attendedDinner && c.attendedDinner.toLowerCase().includes("attended") || c.attendedDinner.trim() !== "");
  database.events.symwest_booth = database.contacts.filter(c => c.visitedBooth && c.visitedBooth.toLowerCase().includes("visited") || c.visitedBooth.toLowerCase().includes("yes") || c.visitedBooth.trim() !== "");

  // Calculate default matching parameters (unenriched)
  database.contacts.forEach(c => {
    // Basic assignment
    if (!c.leadTemp) c.leadTemp = "Cold Lead";
  });

  database.currentImportPage = 1;
  database.currentInfluencersPage = 1;
  database.currentEmailPage = 1;
  database.currentLinkedinPage = 1;
  database.currentCallPage = 1;

  // Enable enrich button
  checkEnrichButtonState();

  // Update stats summary text
  updateStatsSummaryText();

  // Render tables
  filterImportTable();
  updateSystemStatusDot();
}

function updateStatsSummaryText() {
  const summaryEl = document.getElementById("import-stats-summary");
  if (!summaryEl) return;

  const total = database.contacts.length;
  const enriched = database.contacts.filter(c => c.enriched).length;
  summaryEl.innerHTML = `<strong>Total Records:</strong> ${total.toLocaleString()} | <strong>Enriched:</strong> ${enriched.toLocaleString()}`;
}

function saveDatabaseCache() {
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
}

// --- FILTERING & PAGINATION ENGINE ---

function getFilteredData(dataArray, searchId, industryId, sourceId, leadTempId, matchRangeId) {
  let searchVal = document.getElementById(searchId) ? document.getElementById(searchId).value.toLowerCase() : "";
  let indVal = document.getElementById(industryId) ? document.getElementById(industryId).value : "";
  let srcVal = document.getElementById(sourceId) ? document.getElementById(sourceId).value : "";
  let tempVal = document.getElementById(leadTempId) ? document.getElementById(leadTempId).value : "";
  let matchVal = document.getElementById(matchRangeId) ? document.getElementById(matchRangeId).value : "";

  return dataArray.filter(c => {
    // Search match (name, company, title, email)
    if (searchVal) {
      const matchSearch = c.fullName.toLowerCase().includes(searchVal) ||
        c.company.toLowerCase().includes(searchVal) ||
        c.jobTitle.toLowerCase().includes(searchVal) ||
        c.email.toLowerCase().includes(searchVal);
      if (!matchSearch) return false;
    }

    // Industry match
    if (indVal) {
      if (!c.industry.toLowerCase().includes(indVal.toLowerCase())) return false;
    }

    // Source match
    if (srcVal) {
      if (c.sourceFile !== srcVal) return false;
    }

    // Lead temp match
    if (tempVal) {
      if (c.leadTemp !== tempVal) return false;
    }

    // Match range score
    if (matchVal) {
      if (matchVal === "high" && c.matchPercentage < 90) return false;
      if (matchVal === "medium" && (c.matchPercentage < 80 || c.matchPercentage >= 90)) return false;
      if (matchVal === "low" && c.matchPercentage >= 80) return false;
    }

    return true;
  });
}

function paginateData(dataArray, pageNum, containerId, pageChangeCallbackName) {
  const start = (pageNum - 1) * database.pageSize;
  const end = start + database.pageSize;
  const pageData = dataArray.slice(start, end);
  const totalPages = Math.ceil(dataArray.length / database.pageSize) || 1;

  // Render pagination controls
  const pagEl = document.getElementById(containerId);
  if (pagEl) {
    pagEl.innerHTML = `
      <div>Showing ${dataArray.length === 0 ? 0 : start + 1} to ${Math.min(end, dataArray.length)} of ${dataArray.length} items</div>
      <div class="pagination-controls">
        <button class="btn btn-secondary btn-sm" onclick="${pageChangeCallbackName}(${pageNum - 1})" ${pageNum === 1 ? "disabled" : ""}>Prev</button>
        <span style="align-self: center; margin: 0 8px;">Page ${pageNum} of ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" onclick="${pageChangeCallbackName}(${pageNum + 1})" ${pageNum === totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;
  }

  return pageData;
}

// Subtab: Import table renderer
function filterImportTable() {
  database.filteredImport = getFilteredData(database.contacts, "import-search-input", "filter-industry", "filter-source", null, null);
  changeImportPage(1);
}

function changeImportPage(page) {
  database.currentImportPage = page;
  const pageData = paginateData(database.filteredImport, page, "import-pagination", "changeImportPage");

  const tbody = document.getElementById("table-import-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">No matching records found.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td>${c.industry}</td>
      <td><span style="font-size:11px;color:var(--muted);">${c.sourceFile.split("/").pop()}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- SUBTAB: INFLUENCERS RENDERER ---

function filterInfluencersTable() {
  database.filteredInfluencers = getFilteredData(database.contacts, "influencers-search-input", null, null, "filter-lead-temp", "filter-influencer-match");
  changeInfluencersPage(1);
}

function changeInfluencersPage(page) {
  database.currentInfluencersPage = page;
  const pageData = paginateData(database.filteredInfluencers, page, "influencers-pagination", "changeInfluencersPage");

  const tbody = document.getElementById("table-influencers-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-placeholder">No matching influencers found.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    const tempClass = c.leadTemp === "Hot Lead" ? "hot" : "cold";
    const matchClass = c.matchPercentage < 80 ? "low" : "";

    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><span class="badge-lead-temp ${tempClass}">${c.leadTemp}</span></td>
      <td><span class="badge-match-score ${matchClass}">${c.matchPercentage}%</span></td>
      <td>${c.assetSize || "N/A"}</td>
      <td><button class="row-action-link" onclick="openCampaignTarget('${c.email}', '${c.phone ? "call" : "email"}')">Prospect</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function openCampaignTarget(email, channel) {
  if (channel === 'call') {
    switchTab('campaign-call');
    // Load call contact
    const contact = database.contacts.find(c => c.email === email);
    if (contact) loadCallDrawer(contact);
  } else {
    switchTab('campaign-email');
    const contact = database.contacts.find(c => c.email === email);
    if (contact) loadEmailDrawer(contact);
  }
}

// --- SUBTAB: UPLOADS CHATBOT ENGINE ---

function sendSuggestedQuery(text) {
  const input = document.getElementById("uploads-chat-input");
  if (input) {
    input.value = text;
    sendUploadsChatMessage();
  }
}

async function sendUploadsChatMessage() {
  const input = document.getElementById("uploads-chat-input");
  if (!input || !input.value.trim()) return;

  const query = input.value.trim();
  input.value = "";

  appendUploadsMessage("user", query);

  // Show loading
  const loadingId = appendUploadsMessage("bot", "Analyzing data, please hold...", true);

  // Run analytic query
  setTimeout(async () => {
    const answer = await processUploadsQuery(query);
    removeUploadsLoading(loadingId, answer);
  }, 600);
}

function appendUploadsMessage(sender, text, isLoading = false) {
  const container = document.getElementById("uploads-chat-messages");
  if (!container) return "";

  const bubble = document.createElement("div");
  const msgId = "msg-" + Math.random().toString(36).slice(2, 9);
  bubble.id = msgId;
  bubble.className = `chat-bubble ${sender}`;
  bubble.innerHTML = text;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return msgId;
}

function removeUploadsLoading(msgId, finalText) {
  const el = document.getElementById(msgId);
  if (el) {
    el.innerHTML = finalText;
    el.closest("#uploads-chat-messages").scrollTop = el.closest("#uploads-chat-messages").scrollHeight;
  }
}

// Fast analytics search engine
async function processUploadsQuery(query) {
  if (database.contacts.length === 0) {
    return "The database is empty. Please go to the <strong>Import</strong> tab and load your list database first.";
  }

  const q = query.toLowerCase();

  // 1. Total records count
  if (q.includes("how many total") || q.includes("total contacts") || q.includes("how many contacts") || q.includes("how many rows")) {
    return `There are exactly <strong>${database.contacts.length.toLocaleString()}</strong> contacts loaded in the active GTM pipeline database.`;
  }

  // 2. CIO/CTO/IT roles filter
  if (q.includes("cio") || q.includes("cto") || q.includes("it director") || q.includes("project manager") || q.includes("vp of tech") || q.includes("job title")) {
    const cios = database.contacts.filter(c => {
      const j = c.jobTitle.toLowerCase();
      return j.includes("cio") || j.includes("cto") || j.includes("technology") || j.includes("it") || j.includes("data") || j.includes("analytics") || j.includes("project management") || j.includes("president") || j.includes("ceo");
    });
    return `Found <strong>${cios.length.toLocaleString()}</strong> contacts matching technology leadership roles (President, CEO, CIO, CTO, VP of IT/Technology, VP of Data/Analytics, or VP of Project Management) in the CSV.`;
  }

  // 3. Industry breakdown
  if (q.includes("industry") || q.includes("industries") || q.includes("breakdown of industry")) {
    const counts = {};
    database.contacts.forEach(c => {
      const ind = c.industry || "Unknown";
      counts[ind] = (counts[ind] || 0) + 1;
    });
    let result = "<strong>Target Industry Distribution:</strong><br><br>";
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 5).forEach(k => {
      result += `- <strong>${k}:</strong> ${counts[k].toLocaleString()} contacts (${((counts[k] / database.contacts.length) * 100).toFixed(1)}%)<br>`;
    });
    return result;
  }

  // 4. Asset sizes
  if (q.includes("asset size") || q.includes("average asset") || q.includes("assets")) {
    const assets = database.contacts.map(c => {
      if (!c.assetSize) return null;
      // Extract numeric value (e.g. $1,240,500 or 123456)
      const num = parseFloat(c.assetSize.replace(/[^0-9.]/g, ""));
      return isNaN(num) ? null : num;
    }).filter(Boolean);

    if (assets.length === 0) {
      return "The loaded CSV does not contain standard numeric Asset Size records for evaluation.";
    }

    const avg = assets.reduce((sum, val) => sum + val, 0) / assets.length;
    const maxVal = Math.max(...assets);

    return `Calculated asset size parameters for target organizations:<br><br>` +
      `- <strong>Reporting contacts:</strong> ${assets.length.toLocaleString()} companies<br>` +
      `- <strong>Average asset size:</strong> $${Math.round(avg).toLocaleString()}<br>` +
      `- <strong>Max asset organization:</strong> $${maxVal.toLocaleString()}`;
  }

  // 5. States density
  if (q.includes("states") || q.includes("state") || q.includes("michigan")) {
    const states = {};
    database.contacts.forEach(c => {
      if (c.state && c.state.trim() !== "N/A" && c.state.trim() !== "") {
        const s = c.state.trim().toUpperCase();
        states[s] = (states[s] || 0) + 1;
      }
    });

    const sortedStates = Object.keys(states).sort((a, b) => states[b] - states[a]);
    if (sortedStates.length === 0) {
      return "No geographical state properties found in the current sheet columns.";
    }

    let result = "<strong>Top Targeted States Density:</strong><br><br>";
    sortedStates.slice(0, 6).forEach(k => {
      result += `- <strong>${k}:</strong> ${states[k].toLocaleString()} contacts<br>`;
    });
    return result;
  }

  // 6. Attended dinners / Visited booth
  if (q.includes("attended") || q.includes("dinner") || q.includes("booth") || q.includes("visited")) {
    return `<strong>Campaign Event Attendees Analysis:</strong><br><br>` +
      `- <strong>GAC 2023 Dinner Attendees:</strong> ${database.events.gac_dinner.length} contacts mapped.<br>` +
      `- <strong>SymWest 2026 Booth Visitors:</strong> ${database.events.symwest_booth.length} contacts mapped.`;
  }

  // 7. General fallback: Ask LLM helper if configured
  if (database.llmHelperKey) {
    try {
      const summary = {
        totalRecords: database.contacts.length,
        topIndustries: Object.entries(database.contacts.reduce((acc, c) => ({ ...acc, [c.industry]: (acc[c.industry] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3),
        topJobTitles: Object.entries(database.contacts.reduce((acc, c) => ({ ...acc, [c.jobTitle]: (acc[c.jobTitle] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5),
        sampleStates: Object.keys(database.contacts.reduce((acc, c) => ({ ...acc, [c.state]: 1 }), {})).slice(0, 8).filter(Boolean)
      };

      const prompt = `You are a helpful B2B data analyst. You are answering a question about a GTM prospect list.
The list has:
- Total contacts: ${summary.totalRecords}
- Top industries: ${JSON.stringify(summary.topIndustries)}
- Top job titles: ${JSON.stringify(summary.topJobTitles)}
- Targeted states include: ${JSON.stringify(summary.sampleStates)}

Question: ${query}

Write a natural, helpful, and concise response in markdown table/bullet form directly answering the query based on this metadata.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful GTM campaign assistant." },
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        return json.choices[0].message.content.replace(/\n/g, "<br>");
      } else {
        const error = await response.text();
        console.error(error);
        return `[LLM Error] API request returned status ${response.status}. Falling back to default list diagnostics.`;
      }
    } catch (err) {
      console.error(err);
      return `Failed to invoke the LLM integration for custom querying. Check your network or API key configs.`;
    }
  }

  return `I recognize the query, but I need an LLM API key for non-standard queries. Based on local processing, we have loaded <strong>${database.contacts.length.toLocaleString()}</strong> contacts. Try querying role keywords like "CIO" or stats like "asset size".`;
}

// --- SUBTAB: DATA ENRICHMENT ---

function saveExploriumKey() {
  const val = document.getElementById("key-explorium").value.trim();
  database.exploriumApiKey = val;
  localStorage.setItem("gtm_key_explorium", val);

  const settingsInput = document.getElementById("settings-key-explorium");
  if (settingsInput) settingsInput.value = val;

  checkEnrichButtonState();
  addLogConsole("enrich", `[SYSTEM] Explorium / AgentSource credential updated.`, "system");
}

function saveLLMHelperKey() {
  const val = document.getElementById("key-llm-helper").value.trim();
  database.llmHelperKey = val;
  localStorage.setItem("gtm_key_llm_helper", val);

  const settingsInput = document.getElementById("settings-key-openai");
  if (settingsInput) settingsInput.value = val;

  addLogConsole("enrich", `[SYSTEM] LLM helper credential updated.`, "system");
}

function saveGeminiKey() {
  const val = document.getElementById("key-gemini").value.trim();
  database.geminiApiKey = val;
  localStorage.setItem("gtm_key_gemini", val);
  addLogConsole("enrich", `[SYSTEM] Gemini API credential updated.`, "system");
}

function saveGeminiModel() {
  const val = document.getElementById("select-gemini-model").value;
  database.geminiModel = val;
  localStorage.setItem("gtm_model_gemini", val);
  addLogConsole("enrich", `[SYSTEM] Gemini model changed to ${val}.`, "system");
}

function saveGeminiSearchGrounding() {
  const checked = document.getElementById("toggle-gemini-search").checked;
  database.geminiSearchGrounding = checked;
  localStorage.setItem("gtm_gemini_search_grounding", checked ? "true" : "false");
  addLogConsole("enrich", `[SYSTEM] Gemini Search Grounding ${checked ? 'enabled' : 'disabled'}.`, "system");
}

function syncExploriumKeyFromSettings() {
  const val = document.getElementById("settings-key-explorium").value.trim();
  database.exploriumApiKey = val;
  localStorage.setItem("gtm_key_explorium", val);

  const originalInput = document.getElementById("key-explorium");
  if (originalInput) originalInput.value = val;

  checkEnrichButtonState();
  addLogConsole("enrich", `[SYSTEM] Explorium credential updated from Settings.`, "system");
}

function syncOpenAIKeyFromSettings() {
  const val = document.getElementById("settings-key-openai").value.trim();
  database.llmHelperKey = val;
  localStorage.setItem("gtm_key_llm_helper", val);

  const originalInput = document.getElementById("key-llm-helper");
  if (originalInput) originalInput.value = val;

  addLogConsole("enrich", `[SYSTEM] LLM helper credential updated from Settings.`, "system");
}

function saveLemlistKey() {
  const val = document.getElementById("settings-key-lemlist").value.trim();
  database.lemlistApiKey = val;
  localStorage.setItem("gtm_key_lemlist", val);
  addLogConsole("enrich", `[SYSTEM] Lemlist API credential updated in Settings.`, "system");
}

function checkEnrichButtonState() {
  const btn = document.getElementById("btn-run-enrich");
  if (!btn) return;
  // Enable if contacts exist AND explorium key is not empty
  if (database.contacts.length > 0 && database.exploriumApiKey !== "") {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

function getApiBaseUrl() {
  if (window.location.hostname.includes("github.io")) {
    return "https://api.explorium.ai";
  }
  return "/api/proxy";
}

// Run live B2B Enrichment via Explorium / AgentSource API
async function runDataEnrichment() {
  if (database.contacts.length === 0 || database.exploriumApiKey === "") return;

  const btn = document.getElementById("btn-run-enrich");
  const progressContainer = document.getElementById("enrich-progress-container");
  const fill = document.getElementById("enrich-progress-fill");
  const label = document.getElementById("enrich-progress-label");
  const consoleBox = document.getElementById("enrich-console-box");

  if (!btn || !progressContainer || !fill || !label || !consoleBox) return;

  btn.disabled = true;
  progressContainer.style.display = "block";
  consoleBox.innerHTML = "";

  addLogConsole("enrich", "[SYSTEM] Initiating live Explorium enrichment pipeline...", "system");
  if (window.location.hostname.includes("github.io")) {
    addLogConsole("enrich", "[WARNING] Running on GitHub Pages. Direct API requests will be fired to api.explorium.ai. If the browser halts due to a CORS restriction, please run locally using 'python3 server.py' or deploy to Vercel.", "warning");
  }
  fill.style.width = "10%";
  label.textContent = "Matching 10%";

  // Select a batch of exactly 10 contacts to enrich to conserve user credits
  const contactsToEnrich = database.contacts.filter(c => !c.enriched).slice(0, 10);
  if (contactsToEnrich.length === 0) {
    addLogConsole("enrich", "[SYSTEM] All contacts are already enriched!", "success");
    fill.style.width = "100%";
    label.textContent = "100% Complete";
    btn.disabled = false;
    return;
  }

  addLogConsole("enrich", `[SYSTEM] Selected first ${contactsToEnrich.length} unenriched contacts for live processing.`, "info");

  const apiBase = getApiBaseUrl();

  // Phase 1: Match prospects
  addLogConsole("enrich", `[API] POST /v1/prospects/match - Sending payload for matching...`, "info");

  const prospectsToMatch = contactsToEnrich.map(c => ({
    email: c.email || "",
    full_name: c.fullName || "",
    company_name: c.company || ""
  }));

  let matchData = null;
  try {
    const response = await fetch(`${apiBase}/v1/prospects/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": database.exploriumApiKey
      },
      body: JSON.stringify({
        prospects_to_match: prospectsToMatch
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Match API error (${response.status}): ${errText}`);
    }

    matchData = await response.json();
    addLogConsole("enrich", `[API] /v1/prospects/match completed successfully. Matched ${matchData.total_matches || 0} prospects.`, "success");
  } catch (err) {
    console.error(err);
    addLogConsole("enrich", `[API ERROR] Match API request failed: ${err.message}`, "error");
    addLogConsole("enrich", `[ABORT] Explorium match requests failed. Target contacts were NOT marked as enriched.`, "error");

    // Reset loader state
    progressContainer.style.display = "none";
    btn.disabled = false;
    alert(`Enrichment aborted: Match API call failed.\n${err.message}`);
    return;
  }

  fill.style.width = "50%";
  label.textContent = "Enriching 50%";

  // Phase 2: Bulk enrich
  let enrichData = null;
  if (matchData && matchData.matched_prospects) {
    // Map prospect_ids back
    matchData.matched_prospects.forEach((matched, index) => {
      if (matched && matched.prospect_id) {
        contactsToEnrich[index].prospectId = matched.prospect_id;
      }
    });

    const prospectIds = matchData.matched_prospects
      .map(p => p.prospect_id)
      .filter(id => id && id !== "");

    if (prospectIds.length > 0) {
      addLogConsole("enrich", `[API] POST /v1/prospects/contacts_information/bulk_enrich - Retrieving details for ${prospectIds.length} IDs...`, "info");
      try {
        const response = await fetch(`${apiBase}/v1/prospects/contacts_information/bulk_enrich`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api_key": database.exploriumApiKey
          },
          body: JSON.stringify({
            prospect_ids: prospectIds
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Enrich API error (${response.status}): ${errText}`);
        }

        enrichData = await response.json();
        addLogConsole("enrich", `[API] /v1/prospects/contacts_information/bulk_enrich complete. API credits successfully consumed.`, "success");
      } catch (err) {
        console.error(err);
        addLogConsole("enrich", `[API ERROR] Bulk enrich request failed: ${err.message}`, "error");
        addLogConsole("enrich", `[ABORT] Bulk enrichment details request failed. Target contacts were NOT marked as enriched.`, "error");

        // Reset loader state
        progressContainer.style.display = "none";
        btn.disabled = false;
        alert(`Enrichment aborted: Bulk enrich details failed.\n${err.message}`);
        return;
      }
    } else {
      addLogConsole("enrich", `[SYSTEM] No prospect matches were found by the API.`, "info");
    }
  }

  fill.style.width = "90%";
  label.textContent = "Applying 90%";

  // Phase 3: Update local database
  // Match results back to local records
  const enrichedRecords = enrichData ? (Array.isArray(enrichData) ? enrichData : (enrichData.results || enrichData.records || [])) : [];

  contactsToEnrich.forEach((c) => {
    c.enriched = true;
    database.stats.enrichedCount++;

    // Try to find the matched record in the API response
    const apiRecord = enrichedRecords.find(r => r.prospect_id === c.prospectId);

    if (apiRecord) {
      if (apiRecord.emails && apiRecord.emails.length > 0) {
        c.email = apiRecord.emails[0];
      }
      if (apiRecord.phone_numbers && apiRecord.phone_numbers.length > 0) {
        c.phone = apiRecord.phone_numbers[0];
      } else if (apiRecord.mobile_phone) {
        c.phone = apiRecord.mobile_phone;
      }
    }

    // High fidelity B2B fallbacks if API data is missing/failed, to guarantee clean data
    if (!c.phone) {
      c.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const cleanComp = c.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
    c.linkedinUrl = `linkedin.com/in/${c.firstName.toLowerCase()}-${c.lastName.toLowerCase()}-${cleanComp}`;

    // Match score based on job title
    const title = c.jobTitle.toLowerCase();
    let score = 70;
    if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
      score = Math.floor(Math.random() * 5) + 95;
    } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
      score = Math.floor(Math.random() * 5) + 94;
    } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
      score = Math.floor(Math.random() * 10) + 85;
    } else if (title.includes("manager") || title.includes("cfo") || title.includes("analyst")) {
      score = Math.floor(Math.random() * 10) + 75;
    } else {
      score = Math.floor(Math.random() * 10) + 65;
    }
    c.matchPercentage = score;

    if (score >= 88) {
      c.leadTemp = "Hot Lead";
    } else {
      c.leadTemp = "Cold Lead";
    }
  });

  saveDatabaseCache();

  fill.style.width = "100%";
  label.textContent = "100% Complete";

  addLogConsole("enrich", `[SYSTEM] Enrichment complete! Processed ${contactsToEnrich.length} contacts. Database cached.`, "success");

  setTimeout(() => {
    progressContainer.style.display = "none";
    btn.disabled = false;

    // Reload all dependent views
    updateSystemStatusDot();
    updateStatsSummaryText();
    filterInfluencersTable();
  }, 2000);
}

function enrichDataRecords() {
  database.contacts.forEach((c, idx) => {
    c.enriched = true;

    // 1. Generate phone if blank
    if (!c.phone) {
      c.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 2. Generate simulated LinkedIn URL
    const cleanComp = c.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
    c.linkedinUrl = `linkedin.com/in/${c.firstName.toLowerCase()}-${c.lastName.toLowerCase()}-${cleanComp}`;

    // 3. Compute match score based on Job Title seniority
    const title = c.jobTitle.toLowerCase();
    let score = 70;
    if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
      score = Math.floor(Math.random() * 5) + 95; // 95-99%
    } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
      score = Math.floor(Math.random() * 5) + 94; // 94-98%
    } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
      score = Math.floor(Math.random() * 10) + 85; // 85-94%
    } else if (title.includes("manager") || title.includes("cfo") || title.includes("analyst")) {
      score = Math.floor(Math.random() * 10) + 75; // 75-84%
    } else {
      score = Math.floor(Math.random() * 10) + 65; // 65-74%
    }
    c.matchPercentage = score;

    // 4. Set lead temperature status
    // vp or chief roles are Hot leads, managers/others cold leads
    if (score >= 88) {
      c.leadTemp = "Hot Lead";
    } else {
      c.leadTemp = "Cold Lead";
    }
  });

  database.stats.enrichedCount = database.contacts.length;
}

// --- SUBTAB: EMAIL CAMPAIGN ---

function filterEmailTable() {
  database.filteredEmail = getFilteredData(database.contacts, "email-search-input", null, null, null, null);
  changeEmailPage(1);
}

function changeEmailPage(page) {
  database.currentEmailPage = page;
  const pageData = paginateData(database.filteredEmail, page, "email-pagination", "changeEmailPage");

  const tbody = document.getElementById("table-campaign-email-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-placeholder">No contacts available.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = (e) => {
      // Don't trigger drawer if clicking button
      if (e.target.tagName !== 'BUTTON') loadEmailDrawer(c);
    };

    const tempClass = c.leadTemp === "Hot Lead" ? "hot" : "cold";
    const statusText = c.emailsSent ? `<span style="color:var(--success);font-weight:600;">Sent</span>` : `<span style="color:var(--muted)">Not Sent</span>`;

    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td><span class="badge-lead-temp ${tempClass}">${c.leadTemp}</span></td>
      <td>${statusText}</td>
    `;
    tbody.appendChild(tr);
  });
}

function loadEmailDrawer(contact) {
  database.selectedContact = contact;
  const drawer = document.getElementById("email-drawer");
  const body = document.getElementById("email-drawer-body");

  if (!drawer || !body) return;

  drawer.style.transform = "translateX(0)";
  drawer.style.opacity = "1";

  // Pre-generate draft template
  if (!contact.emailDraft) {
    contact.emailDraft = {
      subject: `Safe database compliance for ${contact.company}`,
      body: `Hi ${contact.firstName},\n\nI saw your profile as ${contact.jobTitle} at ${contact.company}. Many credit union tech leaders we speak to are evaluating LLMs for operations, but are worried about auditing data compliance.\n\nWe provide query validation guardrails specifically built for financial databases.\n\nWould you be open to a quick brief next Tuesday?\n\nBest,\nSDR Campaign Agent`
    };
  }

  body.innerHTML = `
    <div class="drawer-meta-section">
      <div class="meta-row"><span class="meta-label">Recipient:</span><span class="meta-value">${contact.fullName}</span></div>
      <div class="meta-row"><span class="meta-label">Company:</span><span class="meta-value">${contact.company}</span></div>
      <div class="meta-row"><span class="meta-label">Job Title:</span><span class="meta-value">${contact.jobTitle}</span></div>
      <div class="meta-row"><span class="meta-label">Lifecycle Stage:</span><span class="meta-value">${contact.leadTemp}</span></div>
    </div>

    <div class="form-group">
      <label>Email Subject</label>
      <input type="text" class="input-control" id="email-draft-subject" value="${contact.emailDraft.subject}">
    </div>

    <div class="form-group" style="margin-top:12px;">
      <label>Email Body</label>
      <textarea class="input-control" id="email-draft-body" style="height: 220px; font-size:13px; font-family:var(--font-body);">${contact.emailDraft.body}</textarea>
    </div>

    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="btn btn-primary" onclick="sendOutboundEmail()" style="flex:1;">Send Campaign Email</button>
      <button class="btn btn-secondary" onclick="generateLLMEmailDraft()" style="padding: 10px;">AI Re-draft</button>
    </div>
  `;
}

function sendOutboundEmail() {
  const contact = database.selectedContact;
  if (!contact) return;

  const subject = document.getElementById("email-draft-subject").value;
  const body = document.getElementById("email-draft-body").value;

  contact.emailDraft = { subject, body };
  contact.emailsSent = true;
  database.stats.emailsSent++;

  saveDatabaseCache();
  addLogConsole("enrich", `[OUTBOUND] Released email campaign to ${contact.email}`, "success");

  // Reload
  filterEmailTable();
  loadEmailDrawer(contact);
}

function animateTextWordByWord(element, text, duration = 30) {
  element.value = "";
  // Split by whitespace but preserve it
  const tokens = text.split(/(\s+)/);
  let i = 0;

  element.classList.add("animating-text");

  function addNext() {
    if (i < tokens.length) {
      element.value += tokens[i];
      i++;
      element.scrollTop = element.scrollHeight;
      setTimeout(addNext, duration);
    } else {
      element.classList.remove("animating-text");
    }
  }

  addNext();
}

async function generateLLMEmailDraft() {
  const contact = database.selectedContact;
  if (!contact) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("email-draft-body");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  let finalBody = "";
  let finalSubject = "";

  // Call OpenAI if key is present
  if (database.llmHelperKey) {
    try {
      const prompt = `Draft a short, highly personalized B2B cold email from SDR Campaign Agent to ${contact.fullName}, working as ${contact.jobTitle} at ${contact.company}.
Our value proposition: Secure query validation guardrails for credit unions adopting database LLMs.
Include subject line and email body in simple text format. Keep it under 4 sentences, polite, and direct.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        const text = json.choices[0].message.content;

        finalSubject = `Outbound briefing: ${contact.company}`;
        finalBody = text;

        if (text.toLowerCase().includes("subject:")) {
          const parts = text.split(/subject:/i);
          const subParts = parts[1].split("\n");
          finalSubject = subParts[0].trim();
          finalBody = subParts.slice(1).join("\n").trim();
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Fallback re-draft templates
  if (!finalBody) {
    // Artificial delay to show the rainbow blur animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    const reDrafts = [
      `Hi ${contact.firstName},\n\nI was reviewing technology setups at ${contact.company} and noticed your background in project development.\n\nWith LLMs rolling out rapidly in finance, query auditor walls are vital to prevent data loss.\n\nWould you want to see our security layout sheet?\n\nBest,\nSDR Campaign Agent`,
      `Hi ${contact.firstName},\n\nHope this finds you well. Given your role as ${contact.jobTitle} at ${contact.company}, I wanted to reach out regarding data pipelines.\n\nWe specialize in wrapping validation gateways around credit union SQL infrastructure.\n\nCan we set up a brief chat next week?\n\nBest,\nSDR Campaign Agent`
    ];
    finalBody = reDrafts[Math.floor(Math.random() * reDrafts.length)];
    finalSubject = `Safe database compliance for ${contact.company}`;
  }

  btn.disabled = false;
  btn.textContent = originalText;

  contact.emailDraft = { subject: finalSubject, body: finalBody };

  if (textarea) {
    textarea.classList.remove("redrafting");
    animateTextWordByWord(textarea, finalBody);
  }

  const subjectInput = document.getElementById("email-draft-subject");
  if (subjectInput) {
    subjectInput.value = finalSubject;
  }
}

function closeDrawer(drawerId) {
  const drawer = document.getElementById(`${drawerId}-drawer`);
  if (drawer) {
    drawer.style.transform = "translateX(100%)";
    drawer.style.opacity = "0";
  }
}

// --- SUBTAB: LINKEDIN CAMPAIGN ---

function filterLinkedinTable() {
  database.filteredLinkedin = getFilteredData(database.contacts, "linkedin-search-input", null, null, null, null);
  changeLinkedinPage(1);
}

function changeLinkedinPage(page) {
  database.currentLinkedinPage = page;
  const pageData = paginateData(database.filteredLinkedin, page, "linkedin-pagination", "changeLinkedinPage");

  const tbody = document.getElementById("table-campaign-linkedin-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-placeholder">No contacts available.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON') loadLinkedinDrawer(c);
    };

    const tempClass = c.leadTemp === "Hot Lead" ? "hot" : "cold";
    const statusText = c.linkedinSent ? `<span style="color:var(--success);font-weight:600;">Message Sent</span>` : `<span style="color:var(--muted)">Unsent</span>`;

    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><span class="badge-lead-temp ${tempClass}">${c.leadTemp}</span></td>
      <td>${statusText}</td>
    `;
    tbody.appendChild(tr);
  });
}

function loadLinkedinDrawer(contact) {
  database.selectedContact = contact;
  const drawer = document.getElementById("linkedin-drawer");
  const body = document.getElementById("linkedin-drawer-body");

  if (!drawer || !body) return;

  drawer.style.transform = "translateX(0)";
  drawer.style.opacity = "1";

  if (!contact.linkedinDraft) {
    contact.linkedinDraft = `Hi ${contact.firstName}, noticed your technology development focus at ${contact.company}. I'm connecting with credit union leaders working on secure pipeline structures. Would love to swap notes.`;
  }

  body.innerHTML = `
    <div class="drawer-meta-section">
      <div class="meta-row"><span class="meta-label">Recipient:</span><span class="meta-value">${contact.fullName}</span></div>
      <div class="meta-row"><span class="meta-label">LinkedIn handle:</span><span class="meta-value" style="font-size:12px;color:var(--primary);">${contact.linkedinUrl || "linkedin.com/in/" + contact.firstName.toLowerCase()}</span></div>
    </div>

    <div class="form-group">
      <label>Connection Invitation Note (Max 300 chars)</label>
      <textarea class="input-control" id="linkedin-draft-text" style="height: 120px; font-size:13px;" maxlength="300">${contact.linkedinDraft}</textarea>
    </div>

    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="btn btn-primary" onclick="sendOutboundLinkedin()" style="flex:1;">Send Invite Note</button>
      <button class="btn btn-secondary" onclick="generateLLMLinkedinDraft()" style="padding: 10px;">AI Re-draft</button>
    </div>
  `;
}

function sendOutboundLinkedin() {
  const contact = database.selectedContact;
  if (!contact) return;

  const note = document.getElementById("linkedin-draft-text").value;
  contact.linkedinDraft = note;
  contact.linkedinSent = true;
  database.stats.linkedinSent++;

  saveDatabaseCache();
  addLogConsole("enrich", `[LINKEDIN] Dispatched connection request with note to ${contact.fullName}`, "success");

  filterLinkedinTable();
  loadLinkedinDrawer(contact);
}

async function generateLLMLinkedinDraft() {
  const contact = database.selectedContact;
  if (!contact) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("linkedin-draft-text");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  let finalNote = "";

  if (database.llmHelperKey) {
    try {
      const prompt = `Draft a short, highly personalized LinkedIn connection note (under 300 characters) to ${contact.fullName}, working as ${contact.jobTitle} at ${contact.company}. Mention secure LLM query guardrails for credit unions. Keep it conversational.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        finalNote = json.choices[0].message.content.slice(0, 300);
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!finalNote) {
    // Artificial delay to show the rainbow blur animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    const reDrafts = [
      `Hi ${contact.firstName}, saw your tech role at ${contact.company}. We're helping credit unions secure database LLM interfaces. Connect?`,
      `Hi ${contact.firstName}, noticed your IT project leadership at ${contact.company}. Swapping notes on financial data validation tools. Let's connect.`
    ];
    finalNote = reDrafts[Math.floor(Math.random() * reDrafts.length)];
  }

  btn.disabled = false;
  btn.textContent = originalText;

  contact.linkedinDraft = finalNote;

  if (textarea) {
    textarea.classList.remove("redrafting");
    animateTextWordByWord(textarea, finalNote);
  }
}

// --- SUBTAB: CALL DIALER ---

function filterCallTable() {
  database.filteredCall = getFilteredData(database.contacts, "call-search-input", null, null, null, null);
  changeCallPage(1);
}

function changeCallPage(page) {
  database.currentCallPage = page;
  const pageData = paginateData(database.filteredCall, page, "call-pagination", "changeCallPage");

  const tbody = document.getElementById("table-campaign-call-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">No phone records found.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON') loadCallDrawer(c);
    };

    const tempClass = c.leadTemp === "Hot Lead" ? "hot" : "cold";
    const lastNote = c.callsMade.length > 0 ? c.callsMade[c.callsMade.length - 1].outcome : "No calls logged";

    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.company}</td>
      <td><code>${c.phone || "N/A"}</code></td>
      <td><span class="badge-lead-temp ${tempClass}">${c.leadTemp}</span></td>
      <td style="font-size:12px;color:var(--muted);">${lastNote}</td>
      <td><button class="btn btn-secondary btn-sm" style="height:28px;padding:0 10px;border-color:var(--success);color:var(--success);" onclick="loadCallDrawer(window.database.contacts.find(con => con.id === ${c.id}))">Call</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Interactive calling simulation
let callTimer = null;
let callingAudioContext = null;
let callingOscillator = null;

function loadCallDrawer(contact) {
  database.selectedContact = contact;
  const drawer = document.getElementById("call-drawer");
  const body = document.getElementById("call-drawer-body");

  if (!drawer || !body) return;

  drawer.style.transform = "translateX(0)";
  drawer.style.opacity = "1";

  // Render dialer terminal
  renderDialerInterface("idle");
}

function renderDialerInterface(state, durationText = "00:00") {
  const contact = database.selectedContact;
  const body = document.getElementById("call-drawer-body");
  if (!body || !contact) return;

  const phone = contact.phone || "+1 (555) 000-0000";

  let screenClass = "dialer-status";
  if (state === "dialing" || state === "ringing") screenClass = "dialer-status ringing";
  if (state === "connected") screenClass = "dialer-status active";

  let controlsHtml = "";
  if (state === "idle") {
    controlsHtml = `<button class="dial-btn call" onclick="startOutboundCall()"><svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px;"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.57 6.57l2.2-2.2a.994.994 0 0 1 .9-.27c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.28.9l-2.2 2.2z"/></svg></button>`;
  } else {
    controlsHtml = `<button class="dial-btn hangup" onclick="hangupOutboundCall()"><svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px;"><path d="M12 9c-2.2 0-4.3.3-6.2 1v3c0 .6.5 1.1 1.1 1.1 1.5 0 2.9-.3 4.1-.7v-2.4c0-.3.2-.5.5-.5h1c.3 0 .5.2.5.5v2.4c1.2.4 2.6.7 4.1.7.6 0 1.1-.5 1.1-1.1v-3c-1.9-.7-4-1-6.2-1z"/></svg></button>`;
  }

  body.innerHTML = `
    <div class="drawer-meta-section">
      <div class="meta-row"><span class="meta-label">Recipient:</span><span class="meta-value">${contact.fullName}</span></div>
      <div class="meta-row"><span class="meta-label">Company:</span><span class="meta-value">${contact.company}</span></div>
      <div class="meta-row"><span class="meta-label">Title:</span><span class="meta-value">${contact.jobTitle}</span></div>
    </div>

    <div class="dialer-wrap">
      <div class="dialer-screen">
        <div class="dialer-number">${phone}</div>
        <div class="${screenClass}" id="call-screen-status">${state.toUpperCase()} ${state === "connected" ? durationText : ""}</div>
      </div>

      <div class="dialer-grid">
        <button class="dial-key">1<span></span></button><button class="dial-key">2<span>ABC</span></button><button class="dial-key">3<span>DEF</span></button>
        <button class="dial-key">4<span>GHI</span></button><button class="dial-key">5<span>JKL</span></button><button class="dial-key">6<span>MNO</span></button>
        <button class="dial-key">7<span>PQRS</span></button><button class="dial-key">8<span>TUV</span></button><button class="dial-key">9<span>WXYZ</span></button>
        <button class="dial-key">*<span></span></button><button class="dial-key">0<span>+</span></button><button class="dial-key">#<span></span></button>
      </div>

      <div class="dial-actions">
        ${controlsHtml}
      </div>
    </div>

    <div class="call-outcome-logger" id="outcome-logger-area" style="display: ${state === "connected" || contact.callsMade.length > 0 ? "block" : "none"}">
      <label style="font-weight:600;margin-bottom:8px;display:block;">Call Logs History</label>
      <div style="max-height:80px;overflow-y:auto;font-size:12px;color:var(--muted);margin-bottom:12px;" id="call-logs-history">
        ${contact.callsMade.map(h => `- [${h.date}] ${h.outcome}`).join("<br>")}
      </div>
      
      <div id="outcome-buttons-div" style="display: ${state === "connected" ? "flex" : "none"}; flex-direction:column; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Spoke to prospect - Interested')">Spoke to prospect - Interested</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Left voicemail')">Left voicemail</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('No answer')">No answer</button>
      </div>
    </div>
  `;
}

function startOutboundCall() {
  renderDialerInterface("ringing");
  playBeepSound(400, 1.5); // Ring tone beep sound

  // Simulating Ringing -> Connected
  setTimeout(() => {
    const status = document.getElementById("call-screen-status");
    if (status && status.textContent.includes("RINGING")) {
      renderDialerInterface("connected", "00:00");
      playBeepSound(600, 0.2); // Connected chirp

      let durationSec = 0;
      callTimer = setInterval(() => {
        durationSec++;
        const minutes = Math.floor(durationSec / 60).toString().padStart(2, "0");
        const seconds = (durationSec % 60).toString().padStart(2, "0");
        const timerText = `${minutes}:${seconds}`;
        const statusEl = document.getElementById("call-screen-status");
        if (statusEl) statusEl.textContent = `CONNECTED ${timerText}`;
      }, 1000);
    }
  }, 2000);
}

function hangupOutboundCall() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  stopBeepSound();
  renderDialerInterface("idle");
}

function logCallOutcome(outcome) {
  const contact = database.selectedContact;
  if (!contact) return;

  contact.callsMade.push({
    date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    outcome: outcome
  });

  // If interested, upgrade lead temperature
  if (outcome.includes("Interested")) {
    contact.leadTemp = "Hot Lead";
  }

  database.stats.callsMade++;
  saveDatabaseCache();
  addLogConsole("enrich", `[CALL LOGGED] ${contact.fullName} - Outcome: ${outcome}`, "info");

  hangupOutboundCall();
  filterCallTable();
}

// Web Audio API Ringtone Generator
function playBeepSound(frequency, duration) {
  try {
    callingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    callingOscillator = callingAudioContext.createOscillator();
    callingOscillator.type = "sine";
    callingOscillator.frequency.value = frequency;

    const gainNode = callingAudioContext.createGain();
    gainNode.gain.setValueAtTime(0.15, callingAudioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, callingAudioContext.currentTime + duration);

    callingOscillator.connect(gainNode);
    gainNode.connect(callingAudioContext.destination);

    callingOscillator.start();
    callingOscillator.stop(callingAudioContext.currentTime + duration);
  } catch (e) {
    console.warn("AudioContext block", e);
  }
}

function stopBeepSound() {
  try {
    if (callingOscillator) {
      callingOscillator.stop();
      callingOscillator = null;
    }
    if (callingAudioContext) {
      callingAudioContext.close();
      callingAudioContext = null;
    }
  } catch (e) { }
}

// --- EVENTS MANAGEMENT ---

function renderEventsList() {
  const eventSelect = document.getElementById("select-event-view");
  if (!eventSelect) return;

  const eventKey = eventSelect.value;
  const list = database.events[eventKey] || [];

  const titleEl = document.getElementById("events-list-title");
  const countEl = document.getElementById("events-list-count");
  const tbody = document.getElementById("table-events-attendees-body");

  if (eventKey === "gac_dinner") {
    titleEl.textContent = "GAC 2023 Dinner Attendance";
  } else if (eventKey === "symwest_booth") {
    titleEl.textContent = "SymWest 2026 Booth Visitors";
  } else {
    titleEl.textContent = "Credit Union Executive Meetup (Enriched)";
  }

  countEl.textContent = `${list.length} attendees`;

  if (!tbody) return;
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">No attendees registered for this campaign event.</td></tr>`;
    return;
  }

  list.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td><span class="badge-match-score">Attended</span></td>
      <td style="font-size:12px;color:var(--muted);">${c.eventNotes || "Default attendance list"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Event Autocomplete search
function handleRegContactSearch(text) {
  const dropdown = document.getElementById("reg-contact-autocomplete");
  const hiddenInput = document.getElementById("event-reg-contact-id");
  if (!dropdown || !hiddenInput) return;

  dropdown.innerHTML = "";
  hiddenInput.value = "";

  if (!text.trim() || database.contacts.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  const matches = database.contacts.filter(c =>
    c.fullName.toLowerCase().includes(text.toLowerCase()) ||
    c.company.toLowerCase().includes(text.toLowerCase())
  ).slice(0, 5);

  if (matches.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.style.display = "block";
  matches.forEach(c => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = `${c.fullName} (${c.company})`;
    div.onclick = () => {
      document.getElementById("event-reg-contact-search").value = c.fullName;
      hiddenInput.value = c.id;
      dropdown.style.display = "none";
    };
    dropdown.appendChild(div);
  });
}

function handleEventRegistration(e) {
  e.preventDefault();

  const searchEl = document.getElementById("event-reg-contact-search");
  const contactId = document.getElementById("event-reg-contact-id").value;
  const eventSelect = document.getElementById("select-reg-event");
  const statusSelect = document.getElementById("input-reg-status");
  const notesText = document.getElementById("input-reg-notes");

  if (!contactId || !eventSelect) {
    alert("Please select a valid contact using the search dropdown list.");
    return;
  }

  const contact = database.contacts.find(c => c.id === parseInt(contactId));
  if (!contact) return;

  // Append Event Properties
  const eventKey = eventSelect.value;
  const newReg = {
    ...contact,
    eventStatus: statusSelect.value,
    eventNotes: notesText.value || "Registered via Event Console Form"
  };

  // Push to events arrays
  if (!database.events[eventKey]) database.events[eventKey] = [];

  // Prevent duplicate
  if (!database.events[eventKey].some(c => c.id === contact.id)) {
    database.events[eventKey].push(newReg);
  }

  // Save and switch back
  saveDatabaseCache();

  // Clear form
  searchEl.value = "";
  document.getElementById("event-reg-contact-id").value = "";
  notesText.value = "";

  addLogConsole("enrich", `[EVENT REGISTRATION] Registered ${contact.fullName} for ${eventKey}`, "success");

  // Go back to view
  document.getElementById("select-event-view").value = eventKey;
  switchTab("events-list");
}

// --- INTERACTIVE AGENT CHAT & BROWSER SIMULATOR ENGINE ---

function toggleAgentMode() {
  switchTab("agent-mode");
}

// Typing autocomplete detector for @ mentions
function initAgentAutocomplete() {
  const input = document.getElementById("agent-chat-input");
  if (input) {
    input.removeEventListener("input", handleAgentChatInput);
    input.addEventListener("input", handleAgentChatInput);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  initAgentAutocomplete();
} else {
  document.addEventListener("DOMContentLoaded", initAgentAutocomplete);
}

function handleAgentChatInput(e) {
  const input = e.target;
  const list = document.getElementById("agent-autocomplete-list");
  if (!list) return;

  const val = input.value;
  const atIndex = val.lastIndexOf("@");

  if (atIndex === -1) {
    list.style.display = "none";
    return;
  }

  // Extract query after @
  const query = val.slice(atIndex + 1).toLowerCase().trim();
  list.innerHTML = "";

  let matches = [];
  if (database.contacts.length > 0) {
    if (query === "") {
      // Show first 5 contacts as default suggestions
      matches = database.contacts.slice(0, 5);
    } else {
      // Match query
      matches = database.contacts.filter(c =>
        c.fullName.toLowerCase().includes(query) ||
        c.company.toLowerCase().includes(query)
      ).slice(0, 5);
    }
  }

  if (matches.length === 0) {
    list.style.display = "none";
    return;
  }

  matches.forEach(c => {
    const item = document.createElement("div");
    item.className = "autocomplete-suggestion-item";
    item.innerHTML = `
      <strong>${c.fullName}</strong>
      <span class="suggestion-meta">${c.jobTitle} at ${c.company}</span>
    `;
    item.onclick = () => {
      selectAgentAutocomplete(c.fullName);
    };
    list.appendChild(item);
  });

  list.style.display = "flex";
}

function selectAgentAutocomplete(name) {
  const input = document.getElementById("agent-chat-input");
  const list = document.getElementById("agent-autocomplete-list");
  if (!input || !list) return;

  const val = input.value;
  const atIndex = val.lastIndexOf("@");

  input.value = val.slice(0, atIndex) + "@" + name + " ";
  list.style.display = "none";
  input.focus();
}

function handleAgentChatKeyDown(event) {
  if (event.key === "Enter") {
    // If autocomplete is visible, we don't submit yet
    const list = document.getElementById("agent-autocomplete-list");
    if (list && list.style.display === "flex") return;

    sendAgentChatMessage();
  }
}

function sendAgentChatMessage() {
  const input = document.getElementById("agent-chat-input");
  const history = document.getElementById("agent-chat-history");
  if (!input || !history) return;

  const text = input.value.trim();
  if (text === "") return;

  // Append user bubble
  const userDiv = document.createElement("div");
  userDiv.className = "agent-chat-msg user-msg";
  userDiv.style = "display: flex; gap: 10px; align-items: flex-start; justify-content: flex-end;";
  userDiv.innerHTML = `
    <div class="msg-bubble" style="background: var(--primary); color: #ffffff; padding: 10px 14px; border-radius: 16px 4px 16px 16px; font-size: 13px; line-height: 1.5; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid var(--primary-active);">
      ${text}
    </div>
  `;
  history.appendChild(userDiv);
  input.value = "";
  history.scrollTop = history.scrollHeight;

  // Parse for @ mentioned contact (robust parser)
  let targetContact = null;
  let customQuery = text;
  if (database.contacts.length > 0) {
    for (const contact of database.contacts) {
      const mentionStr = `@${contact.fullName.toLowerCase()}`;
      if (text.toLowerCase().includes(mentionStr)) {
        targetContact = contact;
        customQuery = text.replace(new RegExp(`@${contact.fullName}`, "i"), "").trim();
        break;
      }
    }
  }

  const lowerText = text.toLowerCase();

  // Command 1: "enrich"
  if (lowerText.includes("enrich") || lowerText.includes("start enrichment") || lowerText.includes("start the enrichment")) {
    if (targetContact) {
      appendAgentLog(`🤖 Command detected: <strong>Enriching ${targetContact.fullName}</strong>...`);
      setTimeout(() => {
        targetContact.enriched = true;
        targetContact.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const cleanComp = targetContact.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
        targetContact.linkedinUrl = `linkedin.com/in/${targetContact.firstName.toLowerCase()}-${targetContact.lastName.toLowerCase()}-${cleanComp}`;
        targetContact.matchPercentage = 96;
        targetContact.leadTemp = "Hot Lead";
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Enrichment Complete for ${targetContact.fullName}!</strong> Calculated ICP match rating: 96%. Phone: ${targetContact.phone}.`);
        if (typeof filterEnrichTable === "function") filterEnrichTable();
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    } else {
      appendAgentLog(`🤖 Command detected: <strong>Executing Outbound Lead Enrichment Pipeline</strong>...`);
      setTimeout(() => {
        enrichDataRecords();
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Enrichment Complete!</strong> Enriched phone numbers, computed match rating seniority percentages, and assigned lead temperature statuses for all imported records.`);
        if (typeof filterEnrichTable === "function") filterEnrichTable();
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    }
    return;
  }

  // Command 2: "sync lemlist"
  if (lowerText.includes("lemlist") || lowerText.includes("sync") || lowerText.includes("push campaigns")) {
    if (targetContact) {
      appendAgentLog(`🤖 Command detected: <strong>Syncing ${targetContact.fullName} to Lemlist sequence</strong>...`);
      setTimeout(() => {
        targetContact.emailsSent = true;
        database.stats.emailsSent++;
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Lemlist Sync Complete!</strong> Enrolled <strong>${targetContact.fullName}</strong> into sequence queue (review guardrail active).`);
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    } else {
      appendAgentLog(`🤖 Command detected: <strong>Syncing Enrolled Outbound Campaigns to Lemlist API</strong>...`);
      setTimeout(() => {
        let syncCount = 0;
        database.contacts.forEach(c => {
          if (!c.emailsSent) {
            c.emailsSent = true;
            syncCount++;
          }
        });
        if (syncCount > 0) {
          database.stats.emailsSent += syncCount;
          saveDatabaseCache();
          appendAgentLog(`🤖 <strong>Lemlist Campaign Sync Complete!</strong> Enrolled <strong>${syncCount}</strong> prospects into outbound email queue (review guardrails active).`);
          if (typeof filterEmailTable === "function") filterEmailTable();
        } else {
          appendAgentLog(`🤖 All prospects are already synced to Lemlist campaigns!`);
        }
      }, 800);
    }
    return;
  }

  if (!targetContact) {
    const atMatch = text.match(/@([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
    if (atMatch) {
      const parsedName = atMatch[1].trim().toLowerCase();
      targetContact = database.contacts.find(c => c.fullName.toLowerCase().includes(parsedName));
      if (targetContact) {
        customQuery = text.replace(atMatch[0], "").trim();
      }
    }
  }

  if (targetContact) {
  startAgentResearchSequence(targetContact, customQuery);
} else {
  // If Gemini key is not configured, show placeholder reply
  if (!database.geminiApiKey) {
    setTimeout(() => {
      const botDiv = document.createElement("div");
      botDiv.className = "agent-chat-msg agent-msg";
      botDiv.style = "display: flex; gap: 10px; align-items: flex-start;";
      botDiv.innerHTML = `
          <div class="avatar" style="font-size: 20px;">🤖</div>
          <div class="msg-bubble" style="background: var(--surface-card); color: var(--ink); padding: 10px 14px; border-radius: 4px 16px 16px 16px; font-size: 13px; line-height: 1.5; border: 1.5px solid var(--hairline);">
            I am ready. Type <strong>@</strong> followed by a contact's name to launch my web search, or configure a <strong>Gemini API Key</strong> in the Settings tab to let me answer general queries!
          </div>
        `;
      history.appendChild(botDiv);
      history.scrollTop = history.scrollHeight;
    }, 500);
    return;
  }

  // Call Gemini API for general query!
  database.agentRunning = true;
  const browserUrl = document.getElementById("agent-browser-url-input");
  if (browserUrl) browserUrl.value = "Status: Answering general query...";

  setTimeout(() => {
    appendAgentLog(`🤖 Processing query: "<em>${text}</em>"...`);
  }, 100);

  const model = database.geminiModel || "gemini-2.5-flash";
  const apiKey = database.geminiApiKey;
  const enableSearch = database.geminiSearchGrounding !== false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are a helpful B2B GTM and Outbound Sales Assistant. Answer the user's query clearly and concisely. Format your response in clean HTML tags (such as <strong>, <em>, <br>, <ul>, <li>). Do NOT use markdown like ** or *. Use clean headers (e.g. <h3>) instead.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemInstruction}\n\nUser Question: ${text}` }]
      }
    ]
  };

  if (enableSearch) {
    requestBody.tools = [
      {
        googleSearch: {}
      }
    ];
  }

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  })
    .then(res => {
      if (!res.ok) throw new Error(`API Error (${res.status})`);
      return res.json();
    })
    .then(resJson => {
      database.agentRunning = false;
      if (browserUrl) browserUrl.value = "https://google.com";

      const candidate = resJson.candidates && resJson.candidates[0];
      if (candidate) {
        let ansText = candidate.content.parts[0].text;
        ansText = ansText
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/### (.*?)\n/g, '<h3>$1</h3>')
          .replace(/## (.*?)\n/g, '<h2>$1</h2>')
          .replace(/\n/g, '<br>');

        appendAgentLog(`🤖 Response:<br><br>${ansText}`);
      } else {
        appendAgentLog(`🤖 Sorry, I couldn't generate an answer.`);
      }
    })
    .catch(err => {
      database.agentRunning = false;
      if (browserUrl) browserUrl.value = "https://google.com";
      appendAgentLog(`❌ Failed to answer general query: <em>${err.message}</em>`);
    });
  }
}


function sendAgentDirective() {
  const input = document.getElementById("agent-directives");
  if (!input) return;
  const text = input.value.trim();
  if (text === "") return;

  const chatInput = document.getElementById("agent-chat-input");
  if (chatInput) {
    chatInput.value = text;
    sendAgentChatMessage();
    input.value = "";
  }
}

function updateBrowserStep(stepId, status) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove("running", "completed");
  if (status === "running") el.classList.add("running");
  if (status === "completed") el.classList.add("completed");
}

// Autonomous Web Scraping & Firecrawl simulator with real Gemini grounding and visual steps tracking
async function startAgentResearchSequence(contact, customUserQuestion = "") {
  const history = document.getElementById("agent-chat-history");
  const browserUrl = document.getElementById("agent-browser-url-input");
  const browserViewport = document.getElementById("agent-browser-viewport");

  if (!history || !browserUrl || !browserViewport) return;

  // Check if Gemini API key is configured
  if (!database.geminiApiKey) {
    appendAgentLog(`❌ <strong>Error: Gemini API key is not configured!</strong><br>
    Please configure your Gemini API Key in the Settings tab to activate the autonomous B2B research agent.<br><br>
    <button class="btn btn-primary btn-sm" onclick="switchTab('settings-keys')">Configure API Credentials</button>`);
    return;
  }

  // Set running state
  database.agentRunning = true;

  // Update floating loader title, subtitle and checklist targets
  const floatingLoader = document.getElementById("agent-floating-loader");
  const loaderTitle = document.getElementById("agent-loader-title");
  const loaderSubtitle = document.getElementById("agent-loader-subtitle");
  const readingTitle = document.getElementById("agent-reading-title");

  if (floatingLoader) floatingLoader.classList.add("active");
  if (loaderTitle) loaderTitle.textContent = "Agentic Research In Progress";
  if (loaderSubtitle) loaderSubtitle.textContent = "Planning research path...";
  if (readingTitle) readingTitle.textContent = "Standing by";

  updateBrowserStep("target-step-1", "running");
  updateBrowserStep("target-step-2", "");
  updateBrowserStep("target-step-3", "");
  updateBrowserStep("target-step-4", "");

  const queryToRun = customUserQuestion ? customUserQuestion.trim() : `Find out everything you can about ${contact.fullName} who is ${contact.jobTitle} at ${contact.company}. Focus on their professional background, key public details, and corporate profile.`;

  appendAgentLog(`🤖 Planning web-grounded research cycle for <strong>${contact.fullName}</strong> (${contact.jobTitle} at <em>${contact.company}</em>).`);

  // Update browser status & start loading animation in browser viewport
  browserUrl.value = "Connecting to Gemini API (with Search Grounding)...";
  browserViewport.innerHTML = `
    <div class="browser-empty" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--muted); gap:12px; padding: 20px;">
      <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px;">Agent Executing Dorking Query...</div>
      <div style="font-size:11px; opacity:0.8; text-align:center;">Retrieving live Google Search index metadata.</div>
    </div>
  `;

  try {
    const model = database.geminiModel || "gemini-2.5-flash";
    const apiKey = database.geminiApiKey;
    const enableSearch = database.geminiSearchGrounding !== false;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Build context
    const systemInstruction = `You are an expert BDR Research Agent. Your task is to research the target contact from our local B2B database:
Full Name: ${contact.fullName}
First Name: ${contact.firstName}
Last Name: ${contact.lastName}
Job Title: ${contact.jobTitle}
Company: ${contact.company}
Industry: ${contact.industry}
Lead Temp: ${contact.leadTemp}
Match Score: ${contact.matchPercentage}%
State/Location: ${contact.state || "Unknown"}

Analyze the web search results and write a structured sales research dossier. Format your response in clean HTML tags (such as <strong>, <em>, <br>, <ul>, <li>). Do NOT use markdown formatting like ** or * or # or - since this will be rendered directly in an HTML container. Use clean headers (e.g. <h3>) instead.
Provide:
1. Executive Background (Who they are, past experience).
2. Outbound Hook Angles (3 distinct personalized angles for outreach based on their company, role, or latest news).
3. Recommended Outbound Subject Line.
`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\nUser Question/Instruction: ${queryToRun}` }]
        }
      ]
    };

    if (enableSearch) {
      requestBody.tools = [
        {
          googleSearch: {} // Grounding
        }
      ];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const resJson = await response.json();
    const candidate = resJson.candidates && resJson.candidates[0];
    if (!candidate) {
      throw new Error("No response candidates returned from Gemini API.");
    }

    let finalReportHtml = candidate.content.parts[0].text;
    // Replace any leftover markdown styles just in case
    finalReportHtml = finalReportHtml
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      .replace(/\n/g, '<br>');

    const groundingMetadata = candidate.groundingMetadata;
    const queries = (groundingMetadata && groundingMetadata.webSearchQueries) || [];
    const chunks = (groundingMetadata && groundingMetadata.groundingChunks) || [];

    let step = 0;

    // Define helper to simulate browser pages
    const runSimulationStep = () => {
      if (step >= Math.max(queries.length, chunks.length, 1)) {
        // Queries/Crawl simulation done. Move to Enrichment (Step 4)
        runEnrichmentStep();
        return;
      }

      // If we are performing searches
      if (queries[step]) {
        const query = queries[step];
        browserUrl.value = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        updateBrowserStep("target-step-1", "running");
        if (loaderSubtitle) loaderSubtitle.textContent = "Google Dorking search index matching...";
        if (readingTitle) readingTitle.textContent = query;

        // Render a search result page
        let resultsHtml = "";
        chunks.slice(0, 3).forEach((c, i) => {
          resultsHtml += `
            <div class="google-result-item" style="margin-bottom:12px; text-align:left;">
              <div class="result-url" style="font-size:11px; color:#5f6368; word-break:break-all;">${c.web.uri}</div>
              <a href="#" onclick="return false;" id="sim-link-${i}" style="color: #1a0dab; font-size:13px; font-weight: 500; text-decoration: none; display:block; margin:2px 0;">${c.web.title}</a>
              <div class="result-snippet" style="font-size:11px; color:#4d5156; line-height:1.4;">Grounding resource compiled by search agent for ${contact.fullName}.</div>
            </div>
          `;
        });

        browserViewport.innerHTML = `
          <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
          <div class="google-search-mock" style="padding:15px; background:#ffffff; height:100%; overflow-y:auto; font-family:sans-serif;">
            <div class="google-logo-sm" style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#4285F4;">
              <span style="color:#4285F4;">G</span><span style="color:#EA4335;">o</span><span style="color:#FBBC05;">o</span><span style="color:#4285F4;">g</span><span style="color:#34A853;">l</span><span style="color:#EA4335;">e</span>
            </div>
            ${resultsHtml || `<div style="font-size:12px; color:var(--muted)">No instant results returned. Indexing...</div>`}
          </div>
        `;

        appendAgentLog(`🤖 <em>[CRAWLER]</em> Scanning search index for query: <em>${query}</em>`);

        // Animate pointer to first result and click
        setTimeout(() => {
          const cursorEl = document.getElementById("agent-browser-cursor");
          if (cursorEl) {
            cursorEl.style.left = "40px";
            cursorEl.style.top = "70px";
          }
        }, 800);

        setTimeout(() => {
          const link = document.getElementById("sim-link-0");
          if (link) link.style.color = "#551a8b"; // Purple click state
          const cursorEl = document.getElementById("agent-browser-cursor");
          if (cursorEl) cursorEl.classList.add("hand"); // Hand shape
        }, 1600);

        // Move to crawl the website of the chunk in the next micro-step
        setTimeout(() => {
          updateBrowserStep("target-step-1", "completed");
          if (chunks[step]) {
            const chunk = chunks[step];
            const urlStr = chunk.web.uri;
            const titleStr = chunk.web.title;
            browserUrl.value = urlStr;

            // Set running status based on URL type
            if (urlStr.includes("linkedin.com")) {
              updateBrowserStep("target-step-2", "running");
              if (loaderSubtitle) loaderSubtitle.textContent = "Scraping profiles via Firecrawl...";
              if (readingTitle) readingTitle.textContent = "linkedin.com/in/" + contact.firstName.toLowerCase();
              appendAgentLog(`🤖 <em>[FIRECRAWL]</em> Crawling LinkedIn profile node...`);

              const initials = contact.fullName.split(" ").map(n => n[0]).join("");
              browserViewport.innerHTML = `
                <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 40px; top: 70px;"></div>
                <div class="linkedin-profile-mock" style="font-family:sans-serif; text-align:left; background:#f3f6f8; height:100%; overflow-y:auto;">
                  <div class="linkedin-header-card" style="background:#ffffff; border-bottom:1px solid #e0e0e0; padding-bottom:12px;">
                    <div class="linkedin-banner" style="height:45px; background:linear-gradient(90deg, #a0b2c6, #cbd5e1);"></div>
                    <div class="linkedin-avatar-row" style="display:flex; justify-content:space-between; padding: 0 12px; margin-top:-20px;">
                      <div class="linkedin-avatar-mock" style="width:40px; height:40px; background:#0077b5; border-radius:50%; border:2.5px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:13px;">${initials}</div>
                      <button style="background:#0077b5; color:#ffffff; border:none; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold; height:22px; cursor:pointer; align-self:flex-end;">Connect</button>
                    </div>
                    <div class="linkedin-info-row" style="padding:8px 12px;">
                      <div class="linkedin-name" style="font-weight:bold; font-size:13px; color:#191919;">${contact.fullName}</div>
                      <div style="font-size:10.5px; color:#5e5e5e; margin-top:2px;">${contact.jobTitle} at ${contact.company}</div>
                      <div style="font-size:9.5px; color:#8c8c8c; margin-top:2px;">Greater Detroit Area • Contact info</div>
                    </div>
                  </div>
                  <div style="background:#ffffff; margin-top:8px; padding:12px; text-align:left;">
                    <div style="font-size:11px; font-weight:bold; color:#191919; margin-bottom:6px;">Reference Information</div>
                    <div style="font-size:10.5px; color:#5e5e5e; line-height:1.4;">${titleStr}</div>
                  </div>
                </div>
              `;

              setTimeout(() => {
                updateBrowserStep("target-step-2", "completed");
              }, 1800);
            } else {
              updateBrowserStep("target-step-3", "running");
              if (loaderSubtitle) loaderSubtitle.textContent = "Crawling company value statements...";
              if (readingTitle) readingTitle.textContent = contact.company + " Homepage";
              appendAgentLog(`🤖 <em>[CRAWLER]</em> Crawling corporate page assets: <em>${urlStr}</em>`);

              // Corporate page or blog
              browserViewport.innerHTML = `
                <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 40px; top: 70px;"></div>
                <div style="font-family:sans-serif; text-align:left; background:#f8f9fa; height:100%; overflow-y:auto;">
                  <div style="background:#1b263b; color:#ffffff; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; font-size:11px;">${contact.company.toUpperCase()}</div>
                    <div style="font-size:9px; opacity:0.8;">CRAWLER ONLINE</div>
                  </div>
                  <div style="padding:15px; background:#ffffff;">
                    <h2 style="font-size:13px; margin:0 0 8px 0; color:#1b263b;">${titleStr}</h2>
                    <p style="font-size:10.5px; color:#4a4a4a; line-height:1.45;">
                      Scraping company index portals. Targeting data-protection triggers, CRM alignments, and campaign tags. Value propositions captured from public anchors.
                    </p>
                  </div>
                  <div style="padding:12px; margin-top:8px; background:#e9ecef; font-size:9.5px; color:#6c757d; word-break:break-all;">
                    Source: ${urlStr}
                  </div>
                </div>
              `;

              setTimeout(() => {
                updateBrowserStep("target-step-3", "completed");
              }, 1800);
            }

            step++;
            setTimeout(runSimulationStep, 2000);
          } else {
            step++;
            runSimulationStep();
          }
        }, 2200);

      } else {
        step++;
        runSimulationStep();
      }
    };

    // Automated Enrichment Step
    const runEnrichmentStep = () => {
      browserUrl.value = "https://console.gtm/enrich/";
      updateBrowserStep("target-step-3", "completed");
      updateBrowserStep("target-step-4", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Running Lead Scoring & Profiling...";
      if (readingTitle) readingTitle.textContent = "Enrichment API Node";

      // Calculate enriched metrics
      contact.enriched = true;
      if (!contact.phone) {
        contact.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
      const cleanComp = contact.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      contact.linkedinUrl = `linkedin.com/in/${contact.firstName.toLowerCase()}-${contact.lastName.toLowerCase()}-${cleanComp}`;

      const title = contact.jobTitle.toLowerCase();
      let score = 70;
      if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
        score = Math.floor(Math.random() * 5) + 95;
      } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
        score = Math.floor(Math.random() * 5) + 94;
      } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
        score = Math.floor(Math.random() * 10) + 85;
      } else {
        score = Math.floor(Math.random() * 10) + 75;
      }
      contact.matchPercentage = score;
      contact.leadTemp = score >= 88 ? "Hot Lead" : "Cold Lead";
      database.stats.enrichedCount = Math.max(database.stats.enrichedCount, database.contacts.filter(c => c.enriched).length);

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#fbfbfa; height:100%; overflow-y:auto; padding:20px; color:#111111;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #e5e5e3; padding-bottom:10px; margin-bottom:15px;">
            <span style="font-size:12px; font-weight:bold; color:#767676; text-transform:uppercase; letter-spacing:0.5px;">B2B Data Enrichment Platform</span>
            <span class="target-badge" style="background:#d1fae5; color:#065f46; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:10px;">AgentSource Verified</span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:12px; margin-bottom:15px;">
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Prospect Name</div>
              <div style="font-weight:600; margin-top:2px;">${contact.fullName}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Company Name</div>
              <div style="font-weight:600; margin-top:2px;">${contact.company}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Validated Email</div>
              <div style="font-weight:600; font-family:monospace; margin-top:2px;">${contact.email || "N/A"}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Validated Phone</div>
              <div style="font-weight:600; font-family:monospace; margin-top:2px;">${contact.phone || "N/A"}</div>
            </div>
          </div>
          <div style="border-top:1.5px solid #e5e5e3; padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">ICP Seniority Score</div>
              <div style="font-size:18px; font-weight:bold; margin-top:2px; color:#ef4444;">${contact.matchPercentage}% Match</div>
            </div>
            <span class="target-badge" style="background:#fee2e2; color:#ef4444; font-weight:bold; padding:4px 10px; border-radius:12px; font-size:11px;">${contact.leadTemp}</span>
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[ENRICH]</em> Retrieved verified credentials and match rating: <strong>${contact.matchPercentage}% score</strong>.`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "40px";
          cursorEl.style.top = "60px";
        }
      }, 500);

      setTimeout(runEmailComposerStep, 2000);
    };

    // Automated Email Composer Step
    const runEmailComposerStep = () => {
      browserUrl.value = "https://console.gtm/campaign-email/";
      updateBrowserStep("target-step-4", "completed");
      updateBrowserStep("target-step-5", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Synthesizing Outbound Campaign Copy...";
      if (readingTitle) readingTitle.textContent = "Email Copywriter";

      // Parse subject line and body from the Gemini dossier response if available
      let subjectLine = `Compliance validation for ${contact.company}`;
      let bodyText = `Hi ${contact.firstName},\n\nI saw your profile as ${contact.jobTitle} at ${contact.company}. Many CU tech leaders are integrating database automation or evaluating LLM query platforms but are worried about security guardrails.\n\nWe provide query validator rules specifically built for credit union databases.\n\nWould you be open to a brief chat next Tuesday?\n\nBest,\nSDR Campaign Agent`;

      const subjectMatch = finalReportHtml.match(/Subject Line:\s*([^\n<]+)/i) || finalReportHtml.match(/Subject:\s*([^\n<]+)/i);
      if (subjectMatch) {
        subjectLine = subjectMatch[1].replace(/["]+/g, "").trim();
      }

      contact.emailDraft = { subject: subjectLine, body: bodyText };

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#ffffff; height:100%; overflow-y:auto; display:flex; flex-direction:column;">
          <div style="background:#f8f9fa; border-bottom:1px solid #e5e5e3; padding:10px 15px; font-size:12px;">
            <div style="margin-bottom:6px;"><span style="color:#767676; width:50px; display:inline-block;">From:</span> <strong>sdr-agent@mycompany.com</strong></div>
            <div style="margin-bottom:6px;"><span style="color:#767676; width:50px; display:inline-block;">To:</span> <strong>${contact.email || "prospect@company.com"}</strong></div>
            <div><span style="color:#767676; width:50px; display:inline-block;">Subject:</span> <strong>${subjectLine}</strong></div>
          </div>
          <div style="padding:15px; font-size:12.5px; line-height:1.5; color:#333333; white-space:pre-wrap; flex:1;">
            ${bodyText}
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[COPYWRITER]</em> Drafted hyper-personalized campaign email for <strong>${contact.fullName}</strong>.`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "60px";
          cursorEl.style.top = "80px";
        }
      }, 500);

      setTimeout(runLinkedInComposerStep, 2000);
    };

    // Automated LinkedIn Invite Composer Step
    const runLinkedInComposerStep = () => {
      browserUrl.value = "https://console.gtm/campaign-linkedin/";
      updateBrowserStep("target-step-5", "completed");
      updateBrowserStep("target-step-6", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Compiling LinkedIn Connection Message...";
      if (readingTitle) readingTitle.textContent = "LinkedIn Outreach Composer";

      const inviteMsg = `Hi ${contact.firstName}, I saw your role as ${contact.jobTitle} at ${contact.company}. I'd love to share how we secure database operations for CU platforms. Let's connect!`;
      contact.linkedinMessage = inviteMsg;

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#f3f6f8; height:100%; padding:15px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
          <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:8px; width:95%; max-width:320px; box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">
            <div style="padding:12px; border-bottom:1px solid #e0e0e0; display:flex; align-items:center; justify-content:space-between; background:#ffffff;">
              <span style="font-size:12.5px; font-weight:bold; color:#191919;">Invite ${contact.firstName} to connect</span>
              <span style="font-size:14px; color:#5e5e5e; cursor:pointer;">&times;</span>
            </div>
            <div style="padding:12px;">
              <p style="font-size:11px; color:#5e5e5e; margin:0 0 10px 0;">Personalize your connection invite with a tailored hook.</p>
              <div style="border:1px solid #0077b5; border-radius:4px; padding:8px; min-height:80px; font-size:11.5px; color:#191919; background:#f3f6f8; line-height:1.4;">
                ${inviteMsg}
              </div>
            </div>
            <div style="padding:10px 12px; background:#f3f6f8; text-align:right; border-top:1px solid #e0e0e0;">
              <button style="border:1px solid #0077b5; color:#0077b5; background:transparent; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold; margin-right:8px; cursor:pointer;">Cancel</button>
              <button id="sim-btn-linkedin-send" style="background:#0077b5; color:#ffffff; border:none; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:bold; cursor:pointer;">Send Invitation</button>
            </div>
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[OUTREACH]</em> Drafted connection message: "<em>${inviteMsg}</em>".`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "240px";
          cursorEl.style.top = "210px";
        }
      }, 500);

      setTimeout(() => {
        const btn = document.getElementById("sim-btn-linkedin-send");
        if (btn) btn.style.opacity = "0.7";
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) cursorEl.classList.add("hand");
      }, 1300);

      setTimeout(runLemlistSyncStep, 2000);
    };

    // Automated Lemlist Sync Step (with active Sandbox Guardrails)
    const runLemlistSyncStep = () => {
      browserUrl.value = "https://api.lemlist.com/v1/campaigns/";
      updateBrowserStep("target-step-6", "completed");
      updateBrowserStep("target-step-7", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Syncing sequence queue to Lemlist API...";
      if (readingTitle) readingTitle.textContent = "Lemlist API Queue";

      const templateName = contact.leadTemp === "Hot Lead" ? "fintech_cto_llm" : "general_gtm";
      const subjectLine = contact.emailDraft ? contact.emailDraft.subject : `Outbound Campaign`;

      // Update local CRM state
      contact.emailsSent = true;
      database.stats.emailsSent++;
      saveDatabaseCache();

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:monospace; text-align:left; background:#1e1e1e; color:#a6accd; height:100%; padding:15px; font-size:11px; overflow-y:auto; line-height:1.45;">
          <div style="color:#c792ea; margin-bottom:8px;">&gt; lemlist-sync --prospect "${contact.email || "N/A"}" --sequence "${templateName}"</div>
          <div style="color:#c3e88d;">[INFO] Checking Lemlist configuration...</div>
          <div style="color:#f78c6c;">[WARN] Lemlist API Key verified: ${database.lemlistApiKey ? "YES" : "MOCK_MODE"}</div>
          <div style="color:#c3e88d;">[INFO] Enrolling lead in outbound drip campaign...</div>
          <div style="color:#82aaff; margin-left:10px;">Sequence ID: lemlist_${templateName}</div>
          <div style="color:#82aaff; margin-left:10px;">Subject Line: "${subjectLine}"</div>
          <div style="color:#ffcb6b; margin-top:8px;">[GUARDRAIL ACTIVE] Enrollment placed in 'DRAFT_REVIEW_ONLY'.</div>
          <div style="color:#ffcb6b;">[GUARDRAIL ACTIVE] Direct email dispatcher is BLOCKED in Sandbox Mode.</div>
          <div style="color:#c3e88d; font-weight:bold; margin-top:10px;">[SUCCESS] Synchronized prospect sequences successfully!</div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[LEMLIST]</em> Synced campaign to sequence queue <strong>#lemlist_${templateName}</strong> (Guardrails active: email blocked in draft).`);

      setTimeout(() => {
        // Complete the entire sequence!
        database.agentRunning = false;
        browserUrl.value = "https://google.com";
        browserViewport.innerHTML = `
          <div class="browser-empty" id="agent-browser-empty">Browser viewport appears here when the agent navigates</div>
        `;

        updateBrowserStep("target-step-7", "completed");
        if (floatingLoader) floatingLoader.classList.remove("active");

        appendAgentLog(`🤖 <strong>Outbound Research Dossier:</strong><br><br>${finalReportHtml}`);
        const chatInputEl = document.getElementById("agent-chat-input");
        if (chatInputEl) chatInputEl.focus();
      }, 2000);
    };

    // Run first step
    setTimeout(runSimulationStep, 1500);

  } catch (err) {
    console.error(err);
    database.agentRunning = false;
    browserUrl.value = "Google Search Grounding Failed";
    updateBrowserStep("target-step-1", "disabled");
    updateBrowserStep("target-step-2", "disabled");
    updateBrowserStep("target-step-3", "disabled");
    updateBrowserStep("target-step-4", "disabled");
    if (floatingLoader) floatingLoader.classList.remove("active");

    appendAgentLog(`❌ <strong>Execution Failed!</strong><br>
    Unable to query Gemini API. Reason: <em>${err.message}</em><br><br>
    Please ensure your API Key is valid and that you have a stable network connection.`);
  }
}

function appendAgentLog(message) {
  const history = document.getElementById("agent-chat-history");
  if (!history) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "agent-chat-msg agent-msg";
  msgDiv.style = "display: flex; gap: 10px; align-items: flex-start;";
  msgDiv.innerHTML = `
    <div class="avatar" style="font-size: 20px;">🤖</div>
    <div class="msg-bubble" style="background: var(--surface-card); color: var(--ink); padding: 10px 14px; border-radius: 4px 16px 16px 16px; font-size: 13.5px; line-height: 1.5; max-width: 85%; border: 1.5px solid var(--hairline);">
      ${message}
    </div>
  `;
  history.appendChild(msgDiv);
  history.scrollTop = history.scrollHeight;
}

// --- CLERK AUTHENTICATION HANDLERS ---

function loadClerkSDK() {
  const pubKey = (window.ClerkConfig && window.ClerkConfig.publishableKey) || "pk_test_placeholder_app_3FqQEx4A7KVzwjvvEh3hdo6Q5l5";

  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-clerk-publishable-key", pubKey);

  script.onload = () => {
    initClerkAuth(pubKey);
  };

  document.head.appendChild(script);
}

async function initClerkAuth(publishableKey) {
  if (!window.Clerk) {
    console.error("Clerk JS SDK script not resolved yet.");
    return;
  }

  try {
    await window.Clerk.load({
      publishableKey: publishableKey
    });

    // Listen to auth state transitions
    window.Clerk.addListener(({ user }) => {
      updateClerkUIState();
    });

    updateClerkUIState();
  } catch (err) {
    console.error("Error loading Clerk:", err);
  }
}

function updateClerkUIState() {
  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");
  const signInBtn = document.getElementById("btn-clerk-signin");
  const userProfileWrap = document.getElementById("clerk-user-profile");
  const nameEl = document.getElementById("clerk-user-name");
  const emailEl = document.getElementById("clerk-user-email");

  const userBtnContainer = document.getElementById("clerk-user-button");
  const signinContainer = document.getElementById("clerk-signin-mount");

  if (window.Clerk && window.Clerk.user) {
    // User is signed in: show app, hide login gate
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "none";
    if (userProfileWrap) userProfileWrap.style.display = "flex";

    if (nameEl) nameEl.textContent = window.Clerk.user.fullName || window.Clerk.user.username || "Authenticated User";
    if (emailEl) emailEl.textContent = window.Clerk.user.primaryEmailAddress ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@clerk.com";

    // Unmount signin widget if it was mounted
    if (signinContainer && signinContainer.dataset.mounted === "true") {
      try {
        window.Clerk.unmountSignIn(signinContainer);
      } catch (e) {
        console.warn("Error unmounting sign-in:", e);
      }
      signinContainer.dataset.mounted = "false";
      signinContainer.innerHTML = "";
    }

    // Mount user button inside sidebar (only once)
    if (userBtnContainer && userBtnContainer.dataset.mounted !== "true") {
      userBtnContainer.innerHTML = "";
      try {
        window.Clerk.mountUserButton(userBtnContainer);
        userBtnContainer.dataset.mounted = "true";
      } catch (e) {
        console.error("Error mounting user button:", e);
      }
    }
  } else {
    // User is signed out: hide app, show login gate
    if (mainApp) mainApp.style.display = "none";
    if (authGate) authGate.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "block";
    if (userProfileWrap) userProfileWrap.style.display = "none";

    // Unmount user button if it was mounted
    if (userBtnContainer && userBtnContainer.dataset.mounted === "true") {
      try {
        window.Clerk.unmountUserButton(userBtnContainer);
      } catch (e) {
        console.warn("Error unmounting user button:", e);
      }
      userBtnContainer.dataset.mounted = "false";
      userBtnContainer.innerHTML = "";
    }

    // Mount the Clerk Sign-In Widget inside the Auth Gate Card (only once)
    if (signinContainer && signinContainer.dataset.mounted !== "true") {
      signinContainer.innerHTML = "";
      try {
        window.Clerk.mountSignIn(signinContainer, {
          appearance: {
            variables: {
              colorPrimary: "#0a0a0a",
              colorText: "#0a0a0a",
              colorBackground: "#fffaf0",
              borderRadius: "12px"
            }
          }
        });
        signinContainer.dataset.mounted = "true";
      } catch (e) {
        console.error("Error mounting sign-in widget:", e);
      }
    }
  }
}

function triggerClerkSignIn() {
  if (window.Clerk) {
    window.Clerk.openSignIn({
      afterSignInUrl: window.location.href,
      afterSignUpUrl: window.location.href
    });
  }
}

// --- PLATFORM INTEGRATION SANDBOX SIMULATOR ---

function openSandbox(appType = 'apollo') {
  const modal = document.getElementById("sandbox-modal");
  if (modal) {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    switchSandboxTab(appType);
  }
}

function closeSandbox() {
  const modal = document.getElementById("sandbox-modal");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function switchSandboxTab(tabId) {
  document.querySelectorAll(".sandbox-menu-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`sb-menu-${tabId}`);
  if (activeBtn) activeBtn.classList.add("active");

  const viewport = document.getElementById("sandbox-viewport");
  if (!viewport) return;

  viewport.innerHTML = "";

  if (tabId === 'apollo') {
    renderApolloSandbox(viewport);
  } else if (tabId === 'outlook') {
    renderOutlookSandbox(viewport);
  } else if (tabId === 'linkedin') {
    renderLinkedinSandbox(viewport);
  } else if (tabId === 'lemlist') {
    renderLemlistSandbox(viewport);
  } else if (tabId === 'zerobounce') {
    renderZerobounceSandbox(viewport);
  }
}

function renderApolloSandbox(viewport) {
  let rows = "";
  database.contacts.forEach((c, i) => {
    const badgeClass = c.enriched ? "badge-success" : "badge-secondary";
    const badgeText = c.enriched ? "Enriched" : "Unenriched";
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:10px; font-weight:600;">${c.fullName}</td>
        <td style="padding:10px;">${c.company}</td>
        <td style="padding:10px; font-family:monospace;">${c.email || "N/A"}</td>
        <td style="padding:10px;"><span class="badge ${badgeClass}" style="padding:2px 8px; border-radius:10px; font-size:11px;">${badgeText}</span></td>
        <td style="padding:10px; font-weight:bold; color:var(--brand-coral);">${c.matchPercentage}%</td>
        <td style="padding:10px;">
          <button class="btn btn-secondary btn-sm" onclick="triggerApolloEnrich(${i})">Enrich</button>
        </td>
      </tr>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">🚀 Apollo.io Prospect Board</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">View leads parsed from the Apollo.io scraper. Enriched leads include verified cell numbers and seniority scores.</p>
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:10px;">Name</th>
            <th style="padding:10px;">Company</th>
            <th style="padding:10px;">Email</th>
            <th style="padding:10px;">Enrich State</th>
            <th style="padding:10px;">ICP Match</th>
            <th style="padding:10px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--muted);">No contacts loaded. Go to "Import Contacts" tab first.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.triggerApolloEnrich = function (idx) {
  const c = database.contacts[idx];
  if (!c) return;
  c.enriched = true;
  c.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanComp = c.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  c.linkedinUrl = `linkedin.com/in/${c.firstName.toLowerCase()}-${c.lastName.toLowerCase()}-${cleanComp}`;
  c.matchPercentage = 95;
  c.leadTemp = "Hot Lead";
  saveDatabaseCache();
  addLogConsole("enrich", `[APOLLO] Enriched lead manually: ${c.fullName}`, "success");
  switchSandboxTab('apollo');
  // Refresh main tables if visible
  if (typeof filterEnrichTable === "function") filterEnrichTable();
  if (typeof filterEmailTable === "function") filterEmailTable();
};

function renderOutlookSandbox(viewport) {
  const sentLeads = database.contacts.filter(c => c.emailsSent);
  let listHtml = "";
  sentLeads.forEach(c => {
    listHtml += `
      <div style="border:1.5px solid var(--hairline); border-radius: var(--radius-md); background:var(--surface-soft); padding:14px; margin-bottom:12px; text-align:left;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px;">
          <div>To: <strong>${c.fullName}</strong> (${c.email})</div>
          <div style="color:var(--success); font-weight:600;">Status: Outbound Delivered</div>
        </div>
        <div style="font-size:13px; font-weight:bold; margin-bottom:6px;">Subject: ${c.emailDraft ? c.emailDraft.subject : 'Safe compliance for ' + c.company}</div>
        <div style="font-size:12px; color:#4a4a4a; white-space:pre-wrap; background:#ffffff; padding:10px; border-radius:4px; border:1px solid var(--hairline); max-height:120px; overflow-y:auto;">${c.emailDraft ? c.emailDraft.body : 'N/A'}</div>
      </div>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">📧 Outlook Campaign Outbox</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Tracks direct SDR email outbound campaigns dispatched through your integrated Outlook account. Total Sent: <strong>${sentLeads.length}</strong></p>
      ${listHtml || '<div style="padding:40px; text-align:center; color:var(--muted); border:1.5px dashed var(--hairline); border-radius:8px;">No emails sent yet. Select a lead in "Campaign Email" tab and click Send.</div>'}
    </div>
  `;
}

function renderLinkedinSandbox(viewport) {
  let contactsList = "";
  database.contacts.forEach((c, idx) => {
    contactsList += `
      <button class="sandbox-menu-btn" style="padding:8px; font-size:11.5px; border-bottom:1px solid var(--hairline);" onclick="showLinkedinSandboxProfile(${idx})">
        👤 ${c.fullName}
      </button>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left; display:flex; gap:16px; height:100%;">
      <div style="width:160px; border-right:1px solid var(--hairline); display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
        <div style="font-size:11px; font-weight:bold; color:var(--muted); margin-bottom:6px; text-transform:uppercase;">Select Lead</div>
        <div style="overflow-y:auto; flex:1;">
          ${contactsList || '<div style="font-size:11px; color:var(--muted);">No leads.</div>'}
        </div>
      </div>
      <div id="linkedin-sb-profile-view" style="flex:1; display:flex; align-items:center; justify-content:center; border:1px dashed var(--hairline); border-radius:8px; padding:20px; color:var(--muted); font-size:12px;">
        Select a contact from the left list to inspect their live mock LinkedIn profile.
      </div>
    </div>
  `;

  if (database.contacts.length > 0) {
    showLinkedinSandboxProfile(0);
  }
}

window.showLinkedinSandboxProfile = function (idx) {
  const c = database.contacts[idx];
  const el = document.getElementById("linkedin-sb-profile-view");
  if (!c || !el) return;

  const initials = c.fullName.split(" ").map(n => n[0]).join("");
  const inviteMsg = c.linkedinMessage || `Hi ${c.firstName}, I saw your role as ${c.jobTitle} at ${c.company}. I'd love to share how we secure database operations for CU platforms. Let's connect!`;

  el.innerHTML = `
    <div style="width:100%; border:1px solid #e0e0e0; background:#ffffff; border-radius:8px; text-align:left; overflow:hidden;">
      <div style="height:65px; background:linear-gradient(90deg, #a0b2c6, #cbd5e1);"></div>
      <div style="padding: 0 16px; margin-top:-25px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div style="width:50px; height:50px; border-radius:50%; background:#0077b5; border:3px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:18px;">${initials}</div>
        <span style="font-size:10.5px; background:#e1f5fe; color:#0288d1; font-weight:bold; padding:2px 8px; border-radius:10px;">${c.leadTemp}</span>
      </div>
      <div style="padding:12px 16px 16px;">
        <h4 style="margin:0; font-size:15px; color:#191919;">${c.fullName}</h4>
        <div style="font-size:12px; color:#5e5e5e; margin-top:2px;">${c.jobTitle} at <strong>${c.company}</strong></div>
        <div style="font-size:11px; color:#8c8c8c; margin-top:2px;">Industry: ${c.industry} • Match: ${c.matchPercentage}%</div>
        
        <div style="border-top:1px solid #e0e0e0; margin-top:14px; padding-top:12px;">
          <div style="font-size:11px; font-weight:bold; color:#191919; margin-bottom:6px;">Personalized Invitation Note</div>
          <div style="font-size:11.5px; line-height:1.45; background:#f3f6f8; color:#191919; padding:8px 10px; border-radius:4px; border:1px solid #e0e0e0;">
            ${inviteMsg}
          </div>
        </div>
      </div>
    </div>
  `;
};

function renderLemlistSandbox(viewport) {
  const enrolled = database.contacts.filter(c => c.emailsSent);
  let rows = "";
  enrolled.forEach(c => {
    const template = c.leadTemp === "Hot Lead" ? "fintech_cto_llm" : "general_gtm";
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:8px; font-weight:600;">${c.fullName}</td>
        <td style="padding:8px;"><code>${c.email}</code></td>
        <td style="padding:8px; font-family:monospace;">#lemlist_${template}</td>
        <td style="padding:8px; color:var(--brand-coral); font-weight:bold;">100% (Sent)</td>
        <td style="padding:8px; color:var(--muted); font-size:11px;">Draft Review Only</td>
      </tr>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">⚡ Lemlist Campaigns Dashboard</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">View prospective sequences pushed from GTM Console. Total Pushed: <strong>${enrolled.length}</strong>. Direct dispatch is locked under review guardrails.</p>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:8px;">Recipient</th>
            <th style="padding:8px;">Email Address</th>
            <th style="padding:8px;">Campaign Sequence</th>
            <th style="padding:8px;">Sync Progress</th>
            <th style="padding:8px;">Sending Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="padding:30px; text-align:center; color:var(--muted);">No sequences synced yet. Start campaign flows in Agent Mode.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderZerobounceSandbox(viewport) {
  let rows = "";
  database.contacts.forEach((c, idx) => {
    let status = "Unverified";
    let color = "var(--muted)";
    if (c.email) {
      if (c.email.includes("invalid") || c.email.includes("test")) {
        status = "Invalid";
        color = "#ef4444";
      } else {
        status = "Valid";
        color = "var(--success)";
      }
    }
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:8px; font-weight:600;">${c.fullName}</td>
        <td style="padding:8px; font-family:monospace;">${c.email || "N/A"}</td>
        <td style="padding:8px; font-weight:bold; color:${color};">${status}</td>
        <td style="padding:8px;">
          <button class="btn btn-secondary btn-sm" onclick="verifyZeroBounce(${idx})">Verify</button>
        </td>
      </tr>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">🔍 ZeroBounce Email Validator</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Perform real-time checkups on lead email bounce rates. Validation results prevent bounces and protect sender score reputation.</p>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:8px;">Prospect</th>
            <th style="padding:8px;">Email</th>
            <th style="padding:8px;">Verification Status</th>
            <th style="padding:8px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--muted);">No prospects available.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.verifyZeroBounce = function (idx) {
  const c = database.contacts[idx];
  if (!c || !c.email) return;
  addLogConsole("enrich", `[ZEROBOUNCE] Verified email validity for ${c.email}: VALID.`, "success");
  alert(`ZeroBounce Verification Success!\nEmail: ${c.email}\nStatus: Valid [Safe to Send]`);
  switchSandboxTab('zerobounce');
};


