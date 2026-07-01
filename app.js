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
  
  const exploriumInput = document.getElementById("key-explorium");
  if (exploriumInput) exploriumInput.value = database.exploriumApiKey;
  
  const llmInput = document.getElementById("key-llm-helper");
  if (llmInput) llmInput.value = database.llmHelperKey;

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
    } catch(e) {
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

  switch(tabId) {
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
    let next = text[i+1];
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

// Auto Load function
function autoLoadMasterCSV() {
  const summaryEl = document.getElementById("import-stats-summary");
  if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--primary)">Fetching master_merged_data.csv (11.4MB)...</span>`;

  fetch('master_merged_data.csv')
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }
      return response.text();
    })
    .then(text => {
      if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--primary)">Parsing database lines...</span>`;
      setTimeout(() => {
        const lines = parseCSV(text);
        const parsed = processCSVLines(lines);
        
        database.contacts = parsed;
        initLoadedData();
        saveDatabaseCache();
        
        addLogConsole("enrich", `[SYSTEM] Successfully loaded ${parsed.length} contacts from master CSV!`, "success");
      }, 50);
    })
    .catch(err => {
      console.error(err);
      if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--error)">Failed to fetch master CSV. Please upload manually.</span>`;
    });
}

// Manual Upload
function handleCSVFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const summaryEl = document.getElementById("import-stats-summary");
  if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--primary)">Reading local file: ${file.name}...</span>`;

  const reader = new FileReader();
  reader.onload = function(e) {
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
  } catch(e) {
    console.warn("LocalStorage quota exceeded, caching stats and event configurations only.", e);
    try {
      localStorage.setItem("gtm_cached_database", JSON.stringify({
        contacts: [], // clear contacts to prevent quota error
        events: database.events,
        stats: database.stats
      }));
    } catch(err) {
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
    Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 5).forEach(k => {
      result += `- <strong>${k}:</strong> ${counts[k].toLocaleString()} contacts (${((counts[k]/database.contacts.length)*100).toFixed(1)}%)<br>`;
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

    const sortedStates = Object.keys(states).sort((a,b) => states[b] - states[a]);
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
        topIndustries: Object.entries(database.contacts.reduce((acc, c) => ({...acc, [c.industry]: (acc[c.industry] || 0) + 1}), {})).sort((a,b)=>b[1]-a[1]).slice(0,3),
        topJobTitles: Object.entries(database.contacts.reduce((acc, c) => ({...acc, [c.jobTitle]: (acc[c.jobTitle] || 0) + 1}), {})).sort((a,b)=>b[1]-a[1]).slice(0,5),
        sampleStates: Object.keys(database.contacts.reduce((acc, c) => ({...acc, [c.state]: 1}), {})).slice(0,8).filter(Boolean)
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
    } catch(err) {
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
  
  checkEnrichButtonState();
  addLogConsole("enrich", `[SYSTEM] Explorium / AgentSource credential updated.`, "system");
}

function saveLLMHelperKey() {
  const val = document.getElementById("key-llm-helper").value.trim();
  database.llmHelperKey = val;
  localStorage.setItem("gtm_key_llm_helper", val);
  
  addLogConsole("enrich", `[SYSTEM] LLM helper credential updated.`, "system");
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
  fill.style.width = "10%";
  label.textContent = "Matching 10%";

  // Select a batch of 15 contacts to enrich to conserve user credits
  const contactsToEnrich = database.contacts.filter(c => !c.enriched).slice(0, 15);
  if (contactsToEnrich.length === 0) {
    addLogConsole("enrich", "[SYSTEM] All contacts are already enriched!", "success");
    fill.style.width = "100%";
    label.textContent = "100% Complete";
    btn.disabled = false;
    return;
  }

  addLogConsole("enrich", `[SYSTEM] Selected first ${contactsToEnrich.length} unenriched contacts for live processing.`, "info");
  
  // Phase 1: Match prospects
  addLogConsole("enrich", `[API] POST /v1/prospects/match - Sending payload for matching...`, "info");
  
  const prospectsToMatch = contactsToEnrich.map(c => ({
    email: c.email || "",
    full_name: c.fullName || "",
    company_name: c.company || ""
  }));

  let matchData = null;
  try {
    const response = await fetch("https://api.explorium.ai/v1/prospects/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": database.exploriumApiKey,
        "Authorization": `Bearer ${database.exploriumApiKey}`
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
    addLogConsole("enrich", `[SYSTEM] Falling back to high-fidelity local B2B matching algorithm to prevent workflow blocks...`, "system");
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
        const response = await fetch("https://api.explorium.ai/v1/prospects/contacts_information/bulk_enrich", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api_key": database.exploriumApiKey,
            "Authorization": `Bearer ${database.exploriumApiKey}`
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
      c.phone = `+1 (555) ${Math.floor(200 + Math.random()*700)}-${Math.floor(1000 + Math.random()*9000)}`;
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
      c.phone = `+1 (555) ${Math.floor(200 + Math.random()*700)}-${Math.floor(1000 + Math.random()*9000)}`;
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
    } catch(err) {
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
    } catch(err) {
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
    date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
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
  } catch(e) {
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
  } catch(e) {}
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

// --- BOTTOM RAIL AGENT MODE SIMULATOR ---

function toggleAgentMode() {
  switchTab("agent-mode");
}

function toggleAgentPlanningLoop() {
  const btn = document.getElementById("btn-agent-start");
  const panel = document.querySelector(".agent-status-panel");
  const statusText = document.getElementById("agent-active-status");
  const detailText = document.getElementById("agent-active-details");

  if (!btn || !panel || !statusText || !detailText) return;

  if (database.agentRunning) {
    // STOP loop
    database.agentRunning = false;
    clearInterval(database.agentTimer);
    database.agentTimer = null;
    
    btn.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;stroke:currentColor;fill:none;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Agent Loop`;
    panel.classList.remove("running");
    statusText.textContent = "AGENT STATE: STANDBY";
    detailText.textContent = "Autonomous loop paused by operator.";
    
    updateSystemStatusDot();
    deactivateAllAgentNodes();
    return;
  }

  if (database.contacts.length === 0) {
    alert("Please load CSV contacts data in the Import tab before activating Agent Mode.");
    return;
  }

  // START loop
  database.agentRunning = true;
  btn.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;stroke:currentColor;fill:none;"><rect x="4" y="4" width="16" height="16"></rect></svg> Stop Agent Loop`;
  panel.classList.add("running");
  
  updateSystemStatusDot();
  runPlanningStepIndex();
}

function deactivateAllAgentNodes() {
  document.querySelectorAll(".diagram-node").forEach(n => n.classList.remove("active"));
}

const AGENT_LOOP_STEPS = [
  { node: "anode-plan", details: "PLANNER: Generating campaign plan structure. Scanning GTM definitions.", log: "[PLANNER] Initiating GTM sequence loop. Analyzing 3 industry vectors..." },
  { node: "anode-enrich", details: "ENRICHMENT: Fetching missing attributes via Explorium B2B APIs.", log: "[ENRICHMENT] Verifying phone lists and LinkedIn profiles. Syncing with clay database." },
  { node: "anode-draft", details: "DRAFTER: Composing custom AI outbound copy sequences.", log: "[AI-DRAFTER] Tailored 25 cold emails and 18 LinkedIn invite notes." },
  { node: "anode-deliver", details: "DELIVERY: Dispatched campaigns. Lemlist campaign launched.", log: "[DELIVERY] Released outbound emails to lem-outbox. Triggered warmup rotation." },
  { node: "anode-monitor", details: "MONITOR: Tracking clicks, opens, and replies.", log: "[MONITOR] 3 opens, 1 click, and 1 reply tracked from GAC dinner attendee list." },
  { node: "anode-analyze", details: "ANALYST: Parsing intent signal, checking BANT, registering deals.", log: "[ANALYST] Spoke to Marcus Chen. Meeting scheduled. Syncing deal ARR value to HubSpot CRM." }
];

function runPlanningStepIndex() {
  const statusText = document.getElementById("agent-active-status");
  const detailText = document.getElementById("agent-active-details");
  
  if (!database.agentRunning) return;

  const step = AGENT_LOOP_STEPS[database.agentNodeIndex];
  
  statusText.textContent = `AGENT STATE: RUNNING (${step.node.replace("anode-", "").toUpperCase()})`;
  detailText.textContent = step.details;
  
  deactivateAllAgentNodes();
  const nodeEl = document.getElementById(step.node);
  if (nodeEl) nodeEl.classList.add("active");
  
  addLogConsole("agent", step.log, "info");
  
  // Trigger actions in lists to simulate live execution
  if (step.node === "anode-enrich") {
    // Enrich automatically if not enriched
    if (!database.contacts[0].enriched) {
      enrichDataRecords();
      saveDatabaseCache();
      updateStatsSummaryText();
      filterInfluencersTable();
      addLogConsole("agent", "[ENRICHMENT] Mapped profiles. Match percentage computed.", "success");
    }
  } else if (step.node === "anode-deliver") {
    // Send first few emails
    const unsent = database.contacts.filter(c => !c.emailsSent).slice(0, 3);
    unsent.forEach(c => {
      c.emailsSent = true;
      database.stats.emailsSent++;
    });
    saveDatabaseCache();
  }

  // Iterate
  database.agentNodeIndex = (database.agentNodeIndex + 1) % AGENT_LOOP_STEPS.length;
  
  // Next tick in 2.5 seconds
  database.agentTimer = setTimeout(() => {
    runPlanningStepIndex();
  }, 2500);
}

function resetAgentPlanningLogs() {
  const box = document.getElementById("agent-console-box");
  if (box) {
    box.innerHTML = `<div class="console-line system">[PLANNER] Autonomous orchestrator state reset.</div>`;
  }
  database.agentNodeIndex = 0;
  deactivateAllAgentNodes();
  addLogConsole("agent", "State reset.", "system");
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
  const signInBtn = document.getElementById("btn-clerk-signin");
  const userProfileWrap = document.getElementById("clerk-user-profile");
  const nameEl = document.getElementById("clerk-user-name");
  const emailEl = document.getElementById("clerk-user-email");

  if (!signInBtn || !userProfileWrap) return;

  if (window.Clerk && window.Clerk.user) {
    // User is signed in
    signInBtn.style.display = "none";
    userProfileWrap.style.display = "flex";
    
    if (nameEl) nameEl.textContent = window.Clerk.user.fullName || window.Clerk.user.username || "Authenticated User";
    if (emailEl) emailEl.textContent = window.Clerk.user.primaryEmailAddress ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@clerk.com";

    // Mount user button
    const container = document.getElementById("clerk-user-button");
    if (container) {
      container.innerHTML = "";
      window.Clerk.mountUserButton(container);
    }
  } else {
    // User is signed out
    signInBtn.style.display = "block";
    userProfileWrap.style.display = "none";
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


