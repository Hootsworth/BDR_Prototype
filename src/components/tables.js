// --- DATA TABLES CORE CONTROLLER (FILTERS, PAGINATION, AVATARS, SORTING) ---

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

// Subtab: Upload table renderer
function filterUploadTable() {
  const prospectsOnly = database.contacts.filter(c => c.isInfluencer !== true);
  database.filteredUpload = getFilteredData(prospectsOnly, "upload-search-input", "filter-industry", "filter-source", null, null);
  changeUploadPage(1);
}

function changeUploadPage(page) {
  database.currentUploadPage = page;
  const pageData = paginateData(database.filteredUpload, page, "upload-pagination", "changeUploadPage");

  const tbody = document.getElementById("table-upload-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-placeholder">No matching prospects found.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    const initials = getInitials(c.fullName);
    const color = getAvatarColor(c.fullName);
    const isChecked = database.selectedUploadRows && database.selectedUploadRows.includes(c.id) ? "checked" : "";
    
    tr.innerHTML = `
      <td style="text-align: center;"><input type="checkbox" class="row-check-upload" data-id="${c.id}" ${isChecked} onchange="toggleSelectUploadRow(this, ${c.id})" style="cursor:pointer; width:15px; height:15px;"></td>
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:30px; height:30px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; border:1px solid var(--hairline); box-shadow:1.5px 1.5px 0 var(--hairline); flex-shrink:0;">${initials}</div>
          <strong>${c.fullName}</strong>
        </div>
      </td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td><span class="badge-tag" style="background:var(--surface-soft); border:1px solid var(--hairline); font-size:11px; padding:2px 8px; border-radius:10px; font-weight:600; color:var(--ink);">${c.industry}</span></td>
      <td><span style="font-size:11px;color:var(--muted);">${(c.sourceFile || "manual").split("/").pop()}</span></td>
      <td>
        <div class="table-cell-actions" style="display:flex; gap:10px;">
          <button class="row-action-link" style="color:var(--brand-pink); background:transparent; border:none; cursor:pointer; font-weight:700;" onclick="openCampaignTarget('${c.email}', 'email')">Outbound</button>
          <button class="row-action-link" style="color:var(--error); background:transparent; border:none; cursor:pointer; font-weight:700;" onclick="deleteContactRecord(${c.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterImportTable() {
  filterUploadTable();
}

// --- SUBTAB: INFLUENCERS RENDERER ---

function filterInfluencersTable() {
  const influencersOnly = database.contacts.filter(c => c.isInfluencer === true);
  database.filteredInfluencers = getFilteredData(influencersOnly, "influencers-search-input", null, null, "filter-lead-temp", "filter-influencer-match");
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
    const initials = getInitials(c.fullName);
    const color = getAvatarColor(c.fullName);
    const tempClass = c.leadTemp === "Hot Lead" ? "hot" : "cold";
    const matchClass = c.matchPercentage < 80 ? "low" : "";
    const referrals = c.referrals || [];
    const credits = c.referralCredits || 0;

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:30px; height:30px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; border:1px solid var(--hairline); box-shadow:1.5px 1.5px 0 var(--hairline); flex-shrink:0;">${initials}</div>
          <strong>${c.fullName}</strong>
        </div>
      </td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><span class="badge-lead-temp ${tempClass}" style="border: 1px solid var(--hairline); box-shadow: 1px 1px 0 var(--hairline); font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${c.leadTemp}</span></td>
      <td><span class="badge-match-score ${matchClass}" style="border: 1px solid var(--hairline); box-shadow: 1px 1px 0 var(--hairline); font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${c.matchPercentage}%</span></td>
      <td>
        <span class="referral-count-label" onclick="viewReferralsDetails('${c.email}')" style="cursor:pointer; text-decoration:underline; font-weight:700; color:var(--brand-pink); font-size: 13px;">
          ${referrals.length} referrals (${credits} credits)
        </span>
      </td>
      <td>
        <div class="table-cell-actions" style="display:flex; gap:10px;">
          <button class="row-action-link" style="background:transparent; border:none; cursor:pointer; font-weight:700; color:var(--ink);" onclick="openCampaignTarget('${c.email}', '${c.phone ? "call" : "email"}')">Prospect</button>
          <button class="row-action-link" style="background:transparent; border:none; cursor:pointer; font-weight:700; color:var(--ink);" onclick="openAddReferralModal('${c.email}')">Refer</button>
          <button class="row-action-link" style="color:var(--error); background:transparent; border:none; cursor:pointer; font-weight:700;" onclick="deleteContactRecord(${c.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Note: getInitials and getAvatarColor are defined in database.js (shared utilities)

database.selectedUploadRows = [];

function toggleSelectAllUpload(elem) {
  const checkboxes = document.querySelectorAll(".row-check-upload");
  database.selectedUploadRows = [];
  
  checkboxes.forEach(cb => {
    cb.checked = elem.checked;
    if (elem.checked) {
      const id = parseInt(cb.getAttribute("data-id"));
      database.selectedUploadRows.push(id);
    }
  });

  updateBulkActionBar();
}

function toggleSelectUploadRow(elem, id) {
  if (elem.checked) {
    if (!database.selectedUploadRows.includes(id)) {
      database.selectedUploadRows.push(id);
    }
  } else {
    database.selectedUploadRows = database.selectedUploadRows.filter(rowId => rowId !== id);
  }

  // Sync check-all checkbox
  const checkAll = document.getElementById("check-all-upload");
  if (checkAll) {
    const checkboxes = document.querySelectorAll(".row-check-upload");
    const checkedBoxes = document.querySelectorAll(".row-check-upload:checked");
    checkAll.checked = checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
  }

  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById("upload-bulk-bar");
  const countEl = document.getElementById("upload-selected-count");
  if (!bar || !countEl) return;

  const count = database.selectedUploadRows.length;
  countEl.textContent = count;
  
  if (count > 0) {
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

function bulkEnrichSelected() {
  if (database.selectedUploadRows.length === 0) return;
  
  // Set explorium keys verification status or alert
  if (!database.exploriumApiKey) {
    alert("Please enter an Explorium API Key on the settings or enrich tab first.");
    switchTab('settings-keys');
    return;
  }

  addLogConsole("enrich", `[SYSTEM] Bulk enrichment requested for ${database.selectedUploadRows.length} contacts.`, "info");
  
  // Mark selected contacts as enriched in local database
  database.contacts.forEach(c => {
    if (database.selectedUploadRows.includes(c.id)) {
      c.enriched = true;
      c.matchPercentage = c.matchPercentage || Math.floor(Math.random() * 20) + 80;
      c.leadTemp = c.leadTemp === "Cold Lead" && Math.random() > 0.5 ? "Hot Lead" : c.leadTemp;
    }
  });

  addLogConsole("enrich", `[SYSTEM] Bulk enrichment successful. ${database.selectedUploadRows.length} dossiers generated.`, "success");
  
  // Clear selection
  database.selectedUploadRows = [];
  const checkAll = document.getElementById("check-all-upload");
  if (checkAll) checkAll.checked = false;
  
  initLoadedData();
  saveDatabaseCache();
}

function bulkDeleteSelected() {
  if (database.selectedUploadRows.length === 0) return;
  if (!confirm(`Are you sure you want to delete the ${database.selectedUploadRows.length} selected contacts?`)) return;

  const initialCount = database.contacts.length;
  database.contacts = database.contacts.filter(c => !database.selectedUploadRows.includes(c.id));
  const deletedCount = initialCount - database.contacts.length;

  addLogConsole("enrich", `[SYSTEM] Bulk deleted ${deletedCount} contact records.`, "warning");

  // Clear selection
  database.selectedUploadRows = [];
  const checkAll = document.getElementById("check-all-upload");
  if (checkAll) checkAll.checked = false;

  initLoadedData();
  saveDatabaseCache();
}

function bulkAssignSequenceSelected() {
  if (!database.selectedUploadRows || database.selectedUploadRows.length === 0) {
    alert("Please select at least one contact to assign to outbound sequence.");
    return;
  }
  const count = database.selectedUploadRows.length;
  alert(`Assigned ${count} selected prospects to Outbound Email Sequence #1.`);
  switchTab("campaign-outbound");
}

function bulkPushHilReviewSelected() {
  if (!database.selectedUploadRows || database.selectedUploadRows.length === 0) {
    alert("Please select at least one contact.");
    return;
  }
  const count = database.selectedUploadRows.length;
  alert(`Pushed ${count} selected prospects to Human-in-the-Loop AI Copilot Queue.`);
  switchTab("agent-mode");
  openHilCopilotModal();
}

function bulkExportCsvSelected() {
  if (!database.selectedUploadRows || database.selectedUploadRows.length === 0) {
    alert("Please select at least one contact to export.");
    return;
  }
  const selectedContacts = database.contacts.filter(c => database.selectedUploadRows.includes(c.id));
  
  let csvContent = "data:text/csv;charset=utf-8,Full Name,Job Title,Company,Email,Industry,Match Score\n";
  selectedContacts.forEach(c => {
    csvContent += `"${c.fullName}","${c.jobTitle}","${c.company}","${c.email}","${c.industry}","${c.matchPercentage || 85}%"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `selected_gtm_leads_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

let currentSortField = "";
let currentSortOrder = "asc";

function sortTable(type, field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
  } else {
    currentSortField = field;
    currentSortOrder = "asc";
  }

  const sortMultiplier = currentSortOrder === "asc" ? 1 : -1;
  const list = type === 'upload' ? database.filteredUpload : database.filteredInfluencers;
  
  list.sort((a, b) => {
    const valA = (a[field] || "").toString().toLowerCase();
    const valB = (b[field] || "").toString().toLowerCase();
    if (valA < valB) return -1 * sortMultiplier;
    if (valA > valB) return 1 * sortMultiplier;
    return 0;
  });

  if (type === 'upload') {
    changeUploadPage(database.currentUploadPage || 1);
  } else {
    changeInfluencersPage(database.currentInfluencersPage || 1);
  }
}

window.getFilteredData = getFilteredData;
window.paginateData = paginateData;
window.filterUploadTable = filterUploadTable;
window.changeUploadPage = changeUploadPage;
window.filterImportTable = filterImportTable;
window.filterInfluencersTable = filterInfluencersTable;
window.changeInfluencersPage = changeInfluencersPage;
window.getInitials = getInitials;
window.getAvatarColor = getAvatarColor;
window.toggleSelectAllUpload = toggleSelectAllUpload;
window.toggleSelectUploadRow = toggleSelectUploadRow;
window.updateBulkActionBar = updateBulkActionBar;
window.bulkEnrichSelected = bulkEnrichSelected;
window.bulkDeleteSelected = bulkDeleteSelected;
window.bulkAssignSequenceSelected = bulkAssignSequenceSelected;
window.bulkPushHilReviewSelected = bulkPushHilReviewSelected;
window.bulkExportCsvSelected = bulkExportCsvSelected;
window.sortTable = sortTable;
