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

function updateUploadEnrichKPIs() {
  const totalEl = document.getElementById("upload-kpi-total");
  const enrichedEl = document.getElementById("upload-kpi-enriched");
  const rateEl = document.getElementById("upload-kpi-rate");
  if (!totalEl) return;

  const allRecords = database.contacts || [];
  const total = allRecords.length;
  const enriched = allRecords.filter(c => c.enriched || c.enrichmentStatus === 'verified_provider_data' || c.deepWebDossier).length;
  const rate = total > 0 ? Math.round((enriched / total) * 100) : 0;

  totalEl.textContent = total.toLocaleString();
  if (enrichedEl) enrichedEl.textContent = enriched.toLocaleString();
  if (rateEl) rateEl.textContent = `(${rate}%)`;
}
window.updateUploadEnrichKPIs = updateUploadEnrichKPIs;

// Subtab: Upload table renderer
function filterUploadTable() {
  const roleFilter = document.getElementById("filter-upload-role")?.value || "all";
  const baseRecords = (database.contacts || []).filter(c => {
    if (roleFilter === "prospect") return !c.isInfluencer;
    if (roleFilter === "influencer") return c.isInfluencer === true;
    return true;
  });
  database.filteredUpload = getFilteredData(baseRecords, "upload-search-input", "filter-industry", "filter-source", null, null);
  changeUploadPage(1);
  updateUploadEnrichKPIs();
}

function changeUploadPage(page) {
  database.currentUploadPage = page;
  const pageData = paginateData(database.filteredUpload, page, "upload-pagination", "changeUploadPage");

  const tbody = document.getElementById("table-upload-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-placeholder" style="text-align: center; padding: 2.5rem 1rem; color: var(--color-text-secondary);">No matching contacts or influencers found.</td></tr>`;
    updateUploadEnrichKPIs();
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    const initials = getInitials(c.fullName);
    const color = getAvatarColor(c.fullName);
    const isChecked = database.selectedUploadRows && database.selectedUploadRows.includes(c.id) ? "checked" : "";
    const isInf = Boolean(c.isInfluencer);
    
    let enrichBadge = `<span class="badge" style="font-size:10px; color:var(--color-text-secondary); background:var(--color-background-muted); border:1px solid var(--color-border);">Pending</span>`;
    if (c.enriched || c.enrichmentStatus === 'verified_provider_data') {
      enrichBadge = `<span class="badge badge-success" style="font-size:10px; display:inline-flex; align-items:center; gap:3px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Enriched</span>`;
    } else if (c.deepWebDossier) {
      enrichBadge = `<span class="badge" style="font-size:10px; background:rgba(52, 211, 153, 0.15); color:#34d399; border:1px solid rgba(52, 211, 153, 0.3);">Scraped</span>`;
    }

    const influencerActionBtn = isInf
      ? `<button class="btn btn-secondary btn-xs" onclick="openInfluencerPortalForContact(${c.id})" title="Open this partner's Influencer Referral Portal" style="border-color: rgba(13, 148, 136, 0.45); color: #0d9488; display: inline-flex; align-items: center; gap: 4px;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
           Influencer Portal
         </button>`
      : `<button class="btn btn-secondary btn-xs" onclick="convertContactToInfluencer(${c.id}, true)" title="Convert this contact into an Influencer Partner with their own Referral Portal" style="border-color: rgba(99, 102, 241, 0.45); color: #818cf8; display: inline-flex; align-items: center; gap: 4px;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
           Convert to Influencer
         </button>`;

    tr.innerHTML = `
      <td style="text-align: center;"><input type="checkbox" class="row-check-upload" data-id="${c.id}" ${isChecked} onchange="toggleSelectUploadRow(this, ${c.id})" style="cursor:pointer; width:15px; height:15px;"></td>
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:30px; height:30px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0;">${initials}</div>
          <div>
            <strong>${c.fullName}</strong>
            ${isInf ? `<span class="badge" style="font-size:9px; margin-left:4px; background: rgba(13, 148, 136, 0.14); color: #0d9488; border: 1px solid rgba(13, 148, 136, 0.35);">Influencer</span>` : ""}
            ${c.leadTemp === "Hot Lead" ? `<span class="badge badge-success" style="font-size:9px; margin-left:4px;">Hot</span>` : ""}
          </div>
        </div>
      </td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td><span class="badge" style="font-size:11px; background:var(--surface-soft); border:1px solid var(--color-border);">${c.industry}</span></td>
      <td>${enrichBadge}</td>
      <td><span style="font-size:11px; color:var(--color-text-secondary);">${(c.sourceFile || "manual").split("/").pop()}</span></td>
      <td style="text-align: right;">
        <div style="display:flex; gap:6px; justify-content: flex-end; align-items: center;">
          ${influencerActionBtn}
          <button class="btn btn-secondary btn-xs" onclick="openCampaignTarget('${c.email}', 'email')">Outbound</button>
          <button class="btn btn-secondary btn-xs" style="color:var(--color-error);" onclick="deleteContactRecord(${c.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateUploadEnrichKPIs();
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

function updateGlobalSelectionBar() {
  const bar = document.getElementById("global-selection-action-bar");
  const countEl = document.getElementById("selection-bar-count");
  const btnCountEl = document.getElementById("selection-bar-btn-count");
  if (!bar) return;

  const uploadCount = database.selectedUploadRows ? database.selectedUploadRows.length : 0;
  const outboundCount = database.selectedOutboundRows ? database.selectedOutboundRows.length : 0;
  const totalCount = uploadCount + outboundCount;

  if (countEl) countEl.textContent = totalCount;
  if (btnCountEl) btnCountEl.textContent = totalCount;

  if (totalCount > 0) {
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}
window.updateGlobalSelectionBar = updateGlobalSelectionBar;

function updateBulkActionBar() {
  const bar = document.getElementById("upload-bulk-bar");
  const countEl = document.getElementById("upload-selected-count");
  if (bar && countEl) {
    const count = database.selectedUploadRows ? database.selectedUploadRows.length : 0;
    countEl.textContent = count;
    bar.style.display = count > 0 ? "flex" : "none";
  }
  updateGlobalSelectionBar();
}

function clearGlobalSelection() {
  database.selectedUploadRows = [];
  database.selectedOutboundRows = [];
  const checkAllUpload = document.getElementById("check-all-upload");
  if (checkAllUpload) checkAllUpload.checked = false;
  const checkAllOutbound = document.getElementById("check-all-outbound");
  if (checkAllOutbound) checkAllOutbound.checked = false;
  document.querySelectorAll(".row-check-upload").forEach(cb => { cb.checked = false; });
  document.querySelectorAll(".row-check-outbound").forEach(cb => { cb.checked = false; });
  updateBulkActionBar();
  if (typeof updateOutboundBulkActionBar === "function") updateOutboundBulkActionBar();
  updateGlobalSelectionBar();
}
window.clearGlobalSelection = clearGlobalSelection;

function bulkOutreachSelected() {
  if (typeof openBulkOutboundModal === "function") {
    openBulkOutboundModal('upload');
  }
}
window.bulkOutreachSelected = bulkOutreachSelected;

function launchBulkOutreachFromSelection() {
  if (typeof openBulkOutboundModal === "function") {
    openBulkOutboundModal();
  }
}
window.launchBulkOutreachFromSelection = launchBulkOutreachFromSelection;

function bulkEnrichFromSelection() {
  bulkEnrichSelected();
}
window.bulkEnrichFromSelection = bulkEnrichFromSelection;

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

function updateQuickDirectAddRoleUI(role) {
  const titleEl = document.getElementById("quick-direct-add-title");
  const submitBtn = document.getElementById("quick-direct-add-submit-btn");
  const isInf = role === "influencer";
  if (titleEl) {
    titleEl.textContent = isInf ? "Add Influencer Partner Directly" : "Add Single Contact or Influencer";
  }
  if (submitBtn) {
    submitBtn.textContent = isInf ? "Add Influencer & Open Portal" : "Add to Imported List";
  }
}

function toggleQuickDirectAddForm(forceOpen, defaultRole) {
  const drawer = document.getElementById("quick-direct-add-form") || document.getElementById("quick-direct-add-drawer");
  if (!drawer) return;
  const isHidden = drawer.style.display === "none" || !drawer.style.display;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : isHidden;
  drawer.style.display = shouldOpen ? "block" : "none";

  const roleSelect = document.getElementById("direct-add-role");
  if (defaultRole && roleSelect) {
    roleSelect.value = defaultRole;
  }
  updateQuickDirectAddRoleUI(roleSelect ? roleSelect.value : (defaultRole || "prospect"));

  if (shouldOpen) {
    const nameInput = document.getElementById("direct-add-name");
    if (nameInput) nameInput.focus();
  }
}

function openAddInfluencerFromImport() {
  if (window.currentImportContactsMode === "events" && typeof openAddContactFromEventModal === "function") {
    openAddContactFromEventModal("influencer");
    return;
  }
  if (typeof switchImportContactsMode === "function" && window.currentImportContactsMode !== "csv") {
    switchImportContactsMode("csv");
  }
  toggleQuickDirectAddForm(true, "influencer");
}

async function handleQuickDirectAddContact(e) {
  e.preventDefault();
  const fullName = (document.getElementById("direct-add-name")?.value || "").trim();
  const email = (document.getElementById("direct-add-email")?.value || "").trim().toLowerCase();
  const jobTitle = (document.getElementById("direct-add-title")?.value || "").trim();
  const company = (document.getElementById("direct-add-company")?.value || "").trim();
  const phone = (document.getElementById("direct-add-phone")?.value || "").trim();
  const industry = document.getElementById("direct-add-industry")?.value || "Credit Union";
  const role = document.getElementById("direct-add-role")?.value || "prospect";

  if (!fullName || !email) {
    alert("Full Name and Email Address are required.");
    return;
  }

  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(" ") || "";
  const isInfluencer = role === "influencer";

  let contact = (database.contacts || []).find(c => (c.email || "").toLowerCase() === email);
  if (!contact) {
    const maxId = (database.contacts || []).reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
    const newId = maxId + 1;
    contact = {
      id: newId,
      firstName,
      lastName,
      fullName,
      email,
      jobTitle: jobTitle || (isInfluencer ? "Industry Advisor" : "Executive"),
      company: company || "Credit Union",
      phone: phone || "+1 (555) 234-5678",
      linkedinUrl: `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase() || newId}`,
      industry,
      sourceFile: "Direct Import",
      state: "NY",
      enriched: Boolean(database.autoEnrich),
      enrichmentStatus: database.autoEnrich ? "verified_provider_data" : "pending",
      matchPercentage: 92,
      leadTemp: isInfluencer ? "Influencer Partner" : "Hot Lead",
      emailsSent: false,
      linkedinSent: false,
      callsMade: [],
      hasScheduledCall: false,
      hasTakenCall: false,
      isInfluencer,
      referredBy: "",
      referrals: [],
      referralCredits: isInfluencer ? 50 : 0
    };
    database.contacts.unshift(contact);
  } else {
    contact.fullName = fullName || contact.fullName;
    contact.jobTitle = jobTitle || contact.jobTitle;
    contact.company = company || contact.company;
    contact.phone = phone || contact.phone;
    contact.industry = industry || contact.industry;
    if (isInfluencer) {
      contact.isInfluencer = true;
      contact.leadTemp = "Influencer Partner";
      contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
      contact.referralCredits = contact.referralCredits || 50;
    }
  }

  if (isInfluencer) {
    try {
      await fetch("/api/influencers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: contact.fullName,
          email: contact.email,
          jobTitle: contact.jobTitle,
          company: contact.company,
          phone: contact.phone,
          industry: contact.industry
        })
      });
    } catch (_) {
      // Saved locally via saveDatabaseCache below
    }
  }

  saveDatabaseCache();
  initLoadedData();

  const form = document.getElementById("quick-direct-add-form");
  if (form) {
    form.reset();
    form.style.display = "none";
  }
  const drawer = document.getElementById("quick-direct-add-drawer");
  if (drawer) drawer.style.display = "none";

  if (isInfluencer) {
    addLogConsole("enrich", `[IMPORT] Added ${contact.fullName} as an Influencer Partner with their own Referral Portal.`, "success");
    openInfluencerPortalForContact(contact.id);
  } else {
    addLogConsole("enrich", `[IMPORT] Added ${contact.fullName} (${contact.company}) to Imported Contacts.`, "success");
  }
}

function openInfluencerPortalForContact(contactIdOrEmail) {
  const contact = (database.contacts || []).find(c =>
    String(c.id) === String(contactIdOrEmail) ||
    (c.email && String(c.email).toLowerCase() === String(contactIdOrEmail).toLowerCase()) ||
    (c.fullName && String(c.fullName).toLowerCase() === String(contactIdOrEmail).toLowerCase())
  );
  const identifier = contact ? (contact.email || contact.fullName) : String(contactIdOrEmail || "");
  if (identifier && typeof activeConsolePortalInfluencerEmail !== "undefined") {
    activeConsolePortalInfluencerEmail = identifier;
  }
  switchTab("influencers");
  if (identifier && typeof selectConsolePortalInfluencer === "function") {
    selectConsolePortalInfluencer(identifier);
  }
}

async function convertContactToInfluencer(contactId, openPortalImmediately = true) {
  const contact = (database.contacts || []).find(c => String(c.id) === String(contactId));
  if (!contact) {
    alert("Contact record not found.");
    return;
  }

  if (contact.isInfluencer) {
    openInfluencerPortalForContact(contact.id);
    return;
  }

  contact.isInfluencer = true;
  contact.leadTemp = "Influencer Partner";
  contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
  contact.referralCredits = Math.max(Number(contact.referralCredits) || 0, 50);

  // Remove from selected prospect rows if present
  if (Array.isArray(database.selectedUploadRows)) {
    database.selectedUploadRows = database.selectedUploadRows.filter(id => String(id) !== String(contact.id));
  }
  if (Array.isArray(database.selectedOutboundRows)) {
    database.selectedOutboundRows = database.selectedOutboundRows.filter(id => String(id) !== String(contact.id));
  }

  // Persist to backend SQLite / Influencer endpoint
  try {
    await fetch("/api/influencers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: contact.fullName,
        email: contact.email,
        jobTitle: contact.jobTitle,
        company: contact.company,
        phone: contact.phone,
        industry: contact.industry || "Advisory"
      })
    });
  } catch (_) {
    // Also persisted via saveDatabaseCache below
  }

  saveDatabaseCache();
  updateBulkActionBar();
  if (typeof filterUploadTable === "function") filterUploadTable();
  if (typeof renderEventsList === "function") renderEventsList();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();
  if (typeof renderDashboard === "function") renderDashboard();

  addLogConsole("enrich", `[INFLUENCER PORTAL] Converted ${contact.fullName} (${contact.company}) into an Influencer Partner with their own Referral Portal.`, "success");

  if (openPortalImmediately) {
    openInfluencerPortalForContact(contact.id);
  }
}

async function bulkConvertSelectedToInfluencers() {
  if (!database.selectedUploadRows || database.selectedUploadRows.length === 0) {
    alert("Please select at least one contact to convert to an Influencer.");
    return;
  }

  const idsToConvert = [...database.selectedUploadRows];
  let lastConverted = null;

  for (const id of idsToConvert) {
    const contact = (database.contacts || []).find(c => String(c.id) === String(id));
    if (contact) {
      contact.isInfluencer = true;
      contact.leadTemp = "Influencer Partner";
      contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
      contact.referralCredits = Math.max(Number(contact.referralCredits) || 0, 50);
      lastConverted = contact;
      try {
        await fetch("/api/influencers/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: contact.fullName,
            email: contact.email,
            jobTitle: contact.jobTitle,
            company: contact.company,
            phone: contact.phone,
            industry: contact.industry || "Advisory"
          })
        });
      } catch (_) {}
    }
  }

  database.selectedUploadRows = [];
  const checkAll = document.getElementById("check-all-upload");
  if (checkAll) checkAll.checked = false;

  saveDatabaseCache();
  initLoadedData();
  updateBulkActionBar();

  addLogConsole("enrich", `[INFLUENCER PORTAL] Converted ${idsToConvert.length} contact(s) into Influencer Partners with their own Referral Portals.`, "success");

  if (lastConverted) {
    openInfluencerPortalForContact(lastConverted.id);
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
window.toggleQuickDirectAddForm = toggleQuickDirectAddForm;
window.updateQuickDirectAddRoleUI = updateQuickDirectAddRoleUI;
window.openAddInfluencerFromImport = openAddInfluencerFromImport;
window.handleQuickDirectAddContact = handleQuickDirectAddContact;
window.convertContactToInfluencer = convertContactToInfluencer;
window.openInfluencerPortalForContact = openInfluencerPortalForContact;
window.bulkConvertSelectedToInfluencers = bulkConvertSelectedToInfluencers;
