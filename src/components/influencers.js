// ─── INFLUENCERS & REFERRAL PORTAL CONTROLLER ────────────────────────────────

let activeConsolePortalInfluencerEmail = new URLSearchParams(window.location.search).get("email") || "kim.beluzo@beluzoadvisory.com";
let activePortalSelectedContactId = null;
let expandedPortalContactId = null;

function isReferralContacted(contact) {
  if (!contact) return false;
  return Boolean(
    contact.emailsSent ||
    contact.emailSent ||
    contact.linkedinSent ||
    contact.callsMade ||
    contact.hasTakenCall ||
    contact.hasScheduledCall ||
    (Array.isArray(contact.outboundHistory) && contact.outboundHistory.length > 0)
  );
}

function resolvePortalContact(contactIdOrIdx) {
  const list = database.contacts || [];
  let c = list.find(item => String(item.id) === String(contactIdOrIdx));
  if (!c && typeof contactIdOrIdx === "number" && list[contactIdOrIdx]) {
    c = list[contactIdOrIdx];
  }
  if (!c && typeof contactIdOrIdx === "string" && contactIdOrIdx.includes("@")) {
    c = list.find(item => String(item.email || "").toLowerCase() === contactIdOrIdx.toLowerCase());
  }
  return c || null;
}

function selectPortalReferralContact(contactId, toggleInlineOptions = true) {
  const contact = resolvePortalContact(contactId);
  if (!contact) return;
  activePortalSelectedContactId = String(contact.id);
  if (toggleInlineOptions) {
    expandedPortalContactId = expandedPortalContactId === String(contact.id) ? null : String(contact.id);
  }
  renderConsolePortalReferrals();
}

function openPortalContactOutreach(contactIdOrIdx, channel = "email") {
  const contact = resolvePortalContact(contactIdOrIdx);
  if (!contact) return;
  activePortalSelectedContactId = String(contact.id);
  if (typeof openOutboundModal === "function") {
    openOutboundModal(contact.id, channel);
  }
  renderConsolePortalReferrals();
}

function renderInfluencersTable() {
  const influencers = (database.contacts || []).filter(c => c.isInfluencer);
  const selectEl = document.getElementById("console-portal-influencer-select");

  if (selectEl) {
    if (influencers.length === 0) {
      selectEl.innerHTML = `<option value="">No influencers loaded</option>`;
    } else {
      const exists = influencers.some(i => (i.email || "").toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase());
      if (!exists) {
        activeConsolePortalInfluencerEmail = influencers[0].email || influencers[0].fullName;
      }
      selectEl.innerHTML = influencers.map(inf => {
        const val = inf.email || inf.fullName;
        const selected = val.toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase() ? "selected" : "";
        const refs = getInfluencerReferralsList(inf);
        const calls = refs.filter(r => r.hasTakenCall || r.hasScheduledCall).length;
        return `<option value="${escapePartnerHTML(val)}" ${selected}>${escapePartnerHTML(inf.fullName)} — ${escapePartnerHTML(inf.company || 'Advisory')} (${calls}/${refs.length} calls)</option>`;
      }).join("");
    }
  }

  renderConsolePortalReferrals();
}

function getInfluencerReferralsList(influencer) {
  if (!influencer) return [];
  const infNameLower = (influencer.fullName || "").toLowerCase();
  const infEmailLower = (influencer.email || "").toLowerCase();
  return (database.contacts || []).filter(c => {
    if (c.isInfluencer || c.archivedAt) return false;
    const refBy = (c.referredBy || "").toLowerCase();
    const refEmail = (c.referredByEmail || "").toLowerCase();
    const influencerEmail = (c.influencerEmail || "").toLowerCase();
    return String(c.influencerId || '') === String(influencer.id) || (infNameLower && refBy === infNameLower) || (infEmailLower && (refEmail === infEmailLower || influencerEmail === infEmailLower));
  });
}

function escapePartnerHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function currentPartner() {
  return (database.contacts || []).find(c => c.isInfluencer && (
    String(c.email || '').toLowerCase() === String(activeConsolePortalInfluencerEmail || '').toLowerCase()
    || String(c.fullName || '').toLowerCase() === String(activeConsolePortalInfluencerEmail || '').toLowerCase()
  )) || (database.contacts || []).find(c => c.isInfluencer);
}

function isSyntheticPartnerContact(contact, influencer) {
  const source = String(contact.sourceFile || '');
  const seedId = Number(contact.id) || 0;
  const seedEmail = /\.\d+@[^@]+$/i.test(String(contact.email || ''));
  return Boolean(contact.isDemoData) || (seedId > 0 && seedId <= 930 && source === `Referred by ${influencer.fullName}` && seedEmail);
}

function selectConsolePortalInfluencer(emailOrName) {
  activeConsolePortalInfluencerEmail = emailOrName;
  activePortalSelectedContactId = null;
  expandedPortalContactId = null;
  const pageUrl = new URL(window.location.href);
  if (emailOrName) pageUrl.searchParams.set("email", emailOrName);
  else pageUrl.searchParams.delete("email");
  window.history.replaceState({}, "", pageUrl.toString());
  renderConsolePortalReferrals();
}

function renderConsolePortalReferrals() {
  const influencers = (database.contacts || []).filter(c => c.isInfluencer);
  const activeInf = influencers.find(i =>
    (i.email || "").toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase() ||
    (i.fullName || "").toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase()
  ) || influencers[0];

  if (!activeInf) return;
  const revokeButton = document.getElementById('partner-revoke-link');
  if (revokeButton) revokeButton.hidden = false;

  const referrals = getInfluencerReferralsList(activeInf);
  const callsTaken = referrals.filter(r => r.hasTakenCall).length;
  const pct = referrals.length > 0 ? Math.round((callsTaken / referrals.length) * 100) : 0;
  const earningsSummary = typeof getInfluencerEarningsSummary === "function" ? getInfluencerEarningsSummary(activeInf) : null;
  const credits = earningsSummary ? earningsSummary.totalCredits : (activeInf.referralCredits || 0);
  const agreementsCount = Array.isArray(activeInf.agreements) ? activeInf.agreements.length : 0;

  const nameEl = document.getElementById("inf-portal-active-name");
  const companyEl = document.getElementById("inf-portal-active-company");
  const refKpiEl = document.getElementById("inf-portal-kpi-referrals");
  const callKpiEl = document.getElementById("inf-portal-kpi-calls");
  const credKpiEl = document.getElementById("inf-portal-kpi-credits");
  const agreementsPillEl = document.getElementById("inf-portal-agreements-pill");
  const formPartnerEl = document.getElementById("inf-portal-form-partner");
  const tableTitleEl = document.getElementById("inf-portal-table-title");

  if (nameEl) nameEl.textContent = activeInf.fullName;
  if (companyEl) companyEl.textContent = `${activeInf.jobTitle || "Partner"} · ${activeInf.company || "Advisory"}`;
  const emailEl = document.getElementById("inf-portal-active-email");
  const avatarEl = document.getElementById("inf-portal-avatar");
  const initials = (activeInf.fullName || "Partner").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  if (emailEl) emailEl.textContent = activeInf.email || "";
  if (avatarEl) avatarEl.textContent = initials;
  if (refKpiEl) refKpiEl.textContent = referrals.length;
  if (callKpiEl) callKpiEl.textContent = `${callsTaken} / ${referrals.length} (${pct}%)`;
  if (credKpiEl) credKpiEl.textContent = `${credits} pts`;
  if (agreementsPillEl) agreementsPillEl.textContent = `Agreements (${agreementsCount})`;
  const enrichedEl = document.getElementById("inf-portal-kpi-enriched");
  const conversionEl = document.getElementById("inf-portal-kpi-conversion");
  const bulkPartnerEl = document.getElementById("inf-portal-bulk-partner");
  if (enrichedEl) enrichedEl.textContent = referrals.filter(r => r.enriched).length;
  if (conversionEl) conversionEl.textContent = `${pct}%`;
  if (formPartnerEl) formPartnerEl.textContent = activeInf.fullName;
  if (bulkPartnerEl) bulkPartnerEl.textContent = activeInf.fullName;
  if (tableTitleEl) tableTitleEl.textContent = `${activeInf.fullName}'s Referred Contacts (${referrals.length})`;
  const tbody = document.getElementById("console-portal-referrals-tbody");
  if (!tbody) return;

  const q = (document.getElementById("console-portal-search")?.value || "").trim().toLowerCase();
  const callFilter = document.getElementById("console-portal-call-filter")?.value || "all";

  const filtered = referrals.filter(r => {
    const hasCall = Boolean(r.hasTakenCall || r.hasScheduledCall);
    if (callFilter === "taken" && !hasCall) return false;
    if (callFilter === "pending" && hasCall) return false;
    if (!q) return true;
    return (
      (r.fullName || "").toLowerCase().includes(q) ||
      (r.company || "").toLowerCase().includes(q) ||
      (r.jobTitle || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q)
    );
  });

  if (filtered.length > 0 && (!activePortalSelectedContactId || !filtered.some(r => String(r.id) === String(activePortalSelectedContactId)))) {
    activePortalSelectedContactId = String(filtered[0].id);
  }

  const subtitleEl = document.getElementById("inf-portal-table-subtitle");
  if (subtitleEl) subtitleEl.textContent = `Showing ${filtered.length} of ${referrals.length} introductions. Click any contact name on the left to view outreach options and contacted status on the right.`;

  const inlineBar = document.getElementById("partner-inline-multi-edit-bar");
  if (inlineBar) inlineBar.hidden = !window.isPartnerTableMultiEditMode;
  const inlineBtn = document.getElementById("btn-toggle-table-multi-edit");
  if (inlineBtn) {
    inlineBtn.textContent = window.isPartnerTableMultiEditMode ? "Exit inline edit" : "Edit table inline";
    inlineBtn.classList.toggle("btn-primary", Boolean(window.isPartnerTableMultiEditMode));
    inlineBtn.classList.toggle("btn-secondary", !window.isPartnerTableMultiEditMode);
  }

  renderPortalContactStatusPanel(activeInf, filtered, referrals);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No referred contacts match the current filter.</td></tr>`;
    return;
  }

  if (window.isPartnerTableMultiEditMode) {
    tbody.innerHTML = filtered.map(r => {
      const statusVal = r.hasTakenCall ? "completed" : r.hasScheduledCall ? "scheduled" : "pending";
      return `
        <tr class="partner-inline-edit-row" data-contact-id="${escapePartnerHTML(r.id)}">
          <td>
            <div class="partner-inline-cell-stack">
              <input type="text" class="partner-grid-input" data-field="fullName" value="${escapePartnerHTML(r.fullName || "")}" placeholder="Full name" required>
              <input type="email" class="partner-grid-input" data-field="email" value="${escapePartnerHTML(r.email || "")}" placeholder="Work email" required>
              <input type="tel" class="partner-grid-input" data-field="phone" value="${escapePartnerHTML(r.phone || "")}" placeholder="Phone">
            </div>
          </td>
          <td>
            <div class="partner-inline-cell-stack">
              <input type="text" class="partner-grid-input" data-field="company" value="${escapePartnerHTML(r.company || "")}" placeholder="Company" required>
              <input type="text" class="partner-grid-input" data-field="jobTitle" value="${escapePartnerHTML(r.jobTitle || "")}" placeholder="Job title">
              <input type="text" class="partner-grid-input" data-field="location" value="${escapePartnerHTML(r.location || "")}" placeholder="Location">
              <input type="text" class="partner-grid-input" data-field="notes" value="${escapePartnerHTML(r.portalNotes || "")}" placeholder="Internal notes">
            </div>
          </td>
          <td>
            <div class="partner-inline-cell-stack">
              <select class="partner-grid-select" data-field="status">
                <option value="completed" ${statusVal === "completed" ? "selected" : ""}>Call completed</option>
                <option value="scheduled" ${statusVal === "scheduled" ? "selected" : ""}>Call scheduled</option>
                <option value="pending" ${statusVal === "pending" ? "selected" : ""}>Pending outreach</option>
              </select>
              <button class="btn btn-sm btn-secondary" type="button" onclick="deletePartnerContact('${escapePartnerHTML(r.id)}')" style="font-size: 11px; padding: 4px 8px;">Remove</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const idx = database.contacts.indexOf(r);
    const referralEntry = (activeInf.referrals || []).find(ref =>
      ((ref.email || "").toLowerCase() && (ref.email || "").toLowerCase() === (r.email || "").toLowerCase()) ||
      ((ref.fullName || ref.name || "").toLowerCase() && (ref.fullName || ref.name || "").toLowerCase() === (r.fullName || "").toLowerCase())
    );
    const referredDate = r.referredDate || r.date || referralEntry?.date || "Warm intro";
    const isSelected = String(r.id) === String(activePortalSelectedContactId);
    const isExpanded = String(r.id) === String(expandedPortalContactId);
    const hasCall = Boolean(r.hasTakenCall || r.hasScheduledCall);

    return `
      <tr class="portal-contact-row ${isSelected ? "is-selected" : ""}" onclick="selectPortalReferralContact('${escapePartnerHTML(r.id)}', false)">
        <td>
          <button type="button" class="portal-contact-name-btn" onclick="event.stopPropagation(); selectPortalReferralContact('${escapePartnerHTML(r.id)}', true)">
            <span>${escapePartnerHTML(r.fullName)}</span>
            <span class="portal-contact-name-caret">${isExpanded ? "▴" : "▾"}</span>
          </button>
          <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">${escapePartnerHTML(r.email || "")}</div>
          ${r.phone ? `<div style="font-size: 10.5px; color: var(--color-text-secondary);">${escapePartnerHTML(r.phone)}</div>` : ""}
          <div class="portal-inline-outreach-drawer" ${isExpanded ? "" : "hidden"} onclick="event.stopPropagation();">
            <span class="portal-inline-outreach-label">Outreach options:</span>
            <button type="button" class="btn btn-xs btn-primary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'email')">Email</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'linkedin')">LinkedIn</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'call')">Call</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="toggleReferralCallStatus(${idx})">${hasCall ? "Mark Pending" : "Mark Call Taken"}</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="openPartnerContactEditor('${escapePartnerHTML(r.id)}')">Edit</button>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 12.5px;">${escapePartnerHTML(r.company || "Credit Union")}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(r.jobTitle || "Executive")}</div>
          ${r.portalNotes ? `<div style="max-width: 260px; margin-top: 4px; color: var(--color-text-secondary); font-size: 10px; line-height: 1.4;">${escapePartnerHTML(r.portalNotes)}</div>` : ""}
        </td>
        <td style="white-space: nowrap; font-size: 11px; color: var(--color-text-secondary);">
          <div>${escapePartnerHTML(referredDate)}</div>
          ${r.location ? `<div style="font-size: 10px; margin-top: 2px;">${escapePartnerHTML(r.location)}</div>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

function renderPortalContactStatusPanel(activeInf, filtered, allReferrals) {
  const bodyEl = document.getElementById("partner-contact-status-body");
  const summaryPill = document.getElementById("partner-contacted-summary-pill");
  if (!bodyEl) return;

  const totalCount = allReferrals.length;
  const contactedCount = allReferrals.filter(r => isReferralContacted(r)).length;
  const emailsCount = allReferrals.filter(r => r.emailsSent || r.emailSent).length;
  const linkedinCount = allReferrals.filter(r => r.linkedinSent).length;
  const callsCount = allReferrals.filter(r => r.hasTakenCall || r.hasScheduledCall || r.callsMade).length;
  const pendingCount = Math.max(0, totalCount - contactedCount);

  if (summaryPill) {
    summaryPill.textContent = `${contactedCount} / ${totalCount} contacted`;
  }

  if (filtered.length === 0) {
    bodyEl.innerHTML = `<div class="partner-empty-state">No contacts available to display outreach status.</div>`;
    return;
  }

  const selected = filtered.find(r => String(r.id) === String(activePortalSelectedContactId)) || filtered[0];
  const selectedIdx = database.contacts.indexOf(selected);
  const selectedContacted = isReferralContacted(selected);
  const hasCall = Boolean(selected.hasTakenCall || selected.hasScheduledCall);
  const historyList = Array.isArray(selected.outboundHistory) ? selected.outboundHistory : [];

  const statusRowsHtml = filtered.map(r => {
    const idx = database.contacts.indexOf(r);
    const contacted = isReferralContacted(r);
    const rHasCall = Boolean(r.hasTakenCall || r.hasScheduledCall);
    const isSel = String(r.id) === String(selected.id);
    const channels = [];
    if (r.emailsSent || r.emailSent) channels.push(`<span class="badge badge-primary" style="font-size: 10px;">Email Sent</span>`);
    if (r.linkedinSent) channels.push(`<span class="badge badge-secondary" style="font-size: 10px;">LinkedIn Sent</span>`);
    if (r.hasTakenCall) channels.push(`<span class="badge badge-success" style="font-size: 10px;">Call Taken</span>`);
    else if (r.hasScheduledCall) channels.push(`<span class="badge badge-primary" style="font-size: 10px;">Call Scheduled</span>`);
    if (!channels.length) channels.push(`<span class="badge badge-neutral" style="font-size: 10px;">Not Contacted</span>`);

    return `
      <div class="partner-status-row ${isSel ? "is-selected" : ""}" onclick="selectPortalReferralContact('${escapePartnerHTML(r.id)}', false)">
        <div class="partner-status-row-main">
          <button type="button" class="portal-contact-name-btn" onclick="event.stopPropagation(); selectPortalReferralContact('${escapePartnerHTML(r.id)}', true)">
            ${escapePartnerHTML(r.fullName)}
          </button>
          <span class="partner-status-pill ${contacted ? "is-contacted" : "is-pending"}">
            ${contacted ? "Contacted" : "Pending Outreach"}
          </span>
        </div>
        <div class="partner-status-row-channels">
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">${channels.join(" ")}</div>
          <div class="partner-status-row-actions" onclick="event.stopPropagation();">
            <button type="button" class="btn btn-xs btn-primary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'email')">Email</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'linkedin')">LinkedIn</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="openPortalContactOutreach('${escapePartnerHTML(r.id)}', 'call')">Call</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="toggleReferralCallStatus(${idx})">${rHasCall ? "Pending" : "Call Taken"}</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  bodyEl.innerHTML = `
    <div class="partner-status-overview-grid">
      <div class="partner-status-stat">
        <span>Contacted</span>
        <strong>${contactedCount}</strong>
      </div>
      <div class="partner-status-stat">
        <span>Emails Sent</span>
        <strong>${emailsCount}</strong>
      </div>
      <div class="partner-status-stat">
        <span>LinkedIn</span>
        <strong>${linkedinCount}</strong>
      </div>
      <div class="partner-status-stat">
        <span>Calls Taken</span>
        <strong>${callsCount}</strong>
      </div>
      <div class="partner-status-stat">
        <span>Uncontacted</span>
        <strong>${pendingCount}</strong>
      </div>
    </div>

    <div class="partner-selected-contact-card">
      <div class="partner-selected-contact-top">
        <div>
          <p class="partner-kicker">SELECTED CONTACT OUTREACH</p>
          <h5>${escapePartnerHTML(selected.fullName)}</h5>
          <p>${escapePartnerHTML(selected.jobTitle || "Executive")} · ${escapePartnerHTML(selected.company || "Credit Union")}</p>
          <p style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">${escapePartnerHTML(selected.email || "")}${selected.phone ? ` · ${escapePartnerHTML(selected.phone)}` : ""}</p>
        </div>
        <span class="partner-status-pill ${selectedContacted ? "is-contacted" : "is-pending"}">
          ${selectedContacted ? "Contacted" : "Not Contacted Yet"}
        </span>
      </div>

      <div class="partner-outreach-action-bar">
        <button type="button" class="btn btn-primary btn-sm" onclick="openPortalContactOutreach('${escapePartnerHTML(selected.id)}', 'email')">
          Email Outreach
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="openPortalContactOutreach('${escapePartnerHTML(selected.id)}', 'linkedin')">
          LinkedIn Message
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="openPortalContactOutreach('${escapePartnerHTML(selected.id)}', 'call')">
          Phone Call
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleReferralCallStatus(${selectedIdx})">
          ${hasCall ? "Mark Pending" : "Mark Call Taken"}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="openPartnerContactEditor('${escapePartnerHTML(selected.id)}')">
          Edit
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="deletePartnerContact('${escapePartnerHTML(selected.id)}')">
          Remove
        </button>
      </div>

      <div class="partner-selected-channels-grid">
        <div class="partner-channel-chip ${selected.emailsSent || selected.emailSent ? "is-done" : ""}">
          <span>Email Status</span>
          <strong>${selected.emailsSent || selected.emailSent ? `Sent (${selected.emailsSent || 1})` : "Not sent"}</strong>
        </div>
        <div class="partner-channel-chip ${selected.linkedinSent ? "is-done" : ""}">
          <span>LinkedIn Status</span>
          <strong>${selected.linkedinSent ? `Sent (${selected.linkedinSent})` : "Not sent"}</strong>
        </div>
        <div class="partner-channel-chip ${hasCall ? "is-done" : ""}">
          <span>Call Status</span>
          <strong>${selected.hasTakenCall ? "Call completed" : selected.hasScheduledCall ? "Call scheduled" : "Pending call"}</strong>
        </div>
      </div>

      ${historyList.length > 0 ? `
        <div class="partner-selected-history">
          <span class="partner-kicker">RECENT OUTREACH LOGS</span>
          ${historyList.slice(-3).reverse().map(item => `
            <div class="partner-history-entry">
              <strong>${escapePartnerHTML((item.channel || "outreach").toUpperCase())}</strong>
              <span>${escapePartnerHTML(item.subject || item.preview || "Outreach logged")}</span>
              <time>${escapePartnerHTML(item.date || "")}</time>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>

    <div class="partner-status-list-section">
      <div class="partner-status-list-header">
        <span class="partner-kicker">ALL REFERRED CONTACTS — CONTACTED STATUS</span>
      </div>
      <div class="partner-status-list">
        ${statusRowsHtml}
      </div>
    </div>
  `;
}

function toggleReferralCallStatus(contactIdx) {
  const c = database.contacts[contactIdx];
  if (!c) return;
  const nextState = !(c.hasTakenCall || c.hasScheduledCall);
  c.hasTakenCall = nextState;
  c.hasScheduledCall = nextState;
  c.callScheduledAt = nextState ? new Date().toISOString().slice(0, 10) : "";
  c.status = nextState ? "Call Taken" : "Warm Referral";

  if (typeof saveDatabaseCache === "function") saveDatabaseCache();
  renderConsolePortalReferrals();
  if (typeof renderDashboard === "function") renderDashboard();
}

async function submitConsolePortalReferral() {
  const influencers = (database.contacts || []).filter(c => c.isInfluencer);
  const activeInf = influencers.find(i =>
    (i.email || "").toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase() ||
    (i.fullName || "").toLowerCase() === (activeConsolePortalInfluencerEmail || "").toLowerCase()
  ) || influencers[0];

  if (!activeInf) return;

  const fullName = document.getElementById("console-portal-ref-name")?.value.trim();
  const email = document.getElementById("console-portal-ref-email")?.value.trim();
  const company = document.getElementById("console-portal-ref-company")?.value.trim();
  const jobTitle = document.getElementById("console-portal-ref-title")?.value.trim();
  const phone = document.getElementById("console-portal-ref-phone")?.value.trim();
  const rawLinkedin = document.getElementById("console-portal-ref-linkedin")?.value.trim() || "";
  const linkedinUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(rawLinkedin) : rawLinkedin;
  const callState = document.getElementById("console-portal-ref-call")?.value || "taken";
  const notes = document.getElementById("console-portal-ref-notes")?.value.trim();
  const feedbackEl = document.getElementById("console-portal-feedback");

  if (!fullName || !email || !company || !jobTitle) {
    alert("Please enter Full Name, Email, Company, and Job Title.");
    return;
  }

  const hasScheduledCall = callState === "scheduled" || callState === "taken";
  const hasTakenCall = callState === "taken";

  try {
    const res = await fetch("/api/portal/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerEmail: activeInf.email,
        fullName,
        email,
        company,
        jobTitle,
        phone,
        linkedinUrl,
        location: document.getElementById("console-portal-ref-location")?.value.trim() || "",
        credits: hasTakenCall ? 25 : hasScheduledCall ? 15 : 10,
        hasScheduledCall,
        hasTakenCall,
        notes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add referral");

    await loadWorkbookFromServer();

    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.style.display = "block";
      feedbackEl.style.background = "rgba(5, 150, 105, 0.12)";
      feedbackEl.style.color = "#059669";
      feedbackEl.textContent = `Added ${fullName} under ${activeInf.fullName}.`;
    }

    document.getElementById("console-portal-ref-name").value = "";
    document.getElementById("console-portal-ref-email").value = "";
    document.getElementById("console-portal-ref-company").value = "";
    document.getElementById("console-portal-ref-title").value = "";
    document.getElementById("console-portal-ref-phone").value = "";
    const liEl = document.getElementById("console-portal-ref-linkedin");
    if (liEl) liEl.value = "";
    document.getElementById("console-portal-ref-location").value = "";
    document.getElementById("console-portal-ref-notes").value = "";

    renderInfluencersTable();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.style.display = "block";
      feedbackEl.style.background = "rgba(220, 38, 38, 0.1)";
      feedbackEl.style.color = "#b42318";
      feedbackEl.textContent = `Could not save this contact: ${err.message}`;
    }
  }
}

function openCurrentInfluencerStandalonePortal() {
  copyCurrentInfluencerWorkspaceLink();
}

function copyCurrentInfluencerWorkspaceLink() {
  return createCurrentInfluencerShareLink();
}

async function createCurrentInfluencerShareLink() {
  const influencer = currentPartner();
  if (!influencer) return alert('Select an influencer first.');
  try {
    const response = await fetch('/api/partner-shares/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencerId: influencer.id })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    const shareUrl = payload.shareUrl || `${window.location.origin}/partner-portal.html#token=${encodeURIComponent(payload.token)}`;
    try { await navigator.clipboard.writeText(shareUrl); } catch (_) { window.prompt('Copy this private partner link', shareUrl); }
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) && !payload.publicBaseConfigured) {
      alert('Private link copied. This localhost address is reachable only from this computer; publish the app behind a persistent, secure host before sharing it with someone elsewhere.');
    } else {
      alert('Private, revocable link copied. It grants access only to this partner’s shared workspace.');
    }
  } catch (error) {
    alert(`Could not create partner link: ${error.message}`);
  }
}

async function revokeCurrentInfluencerShareLink() {
  const influencer = currentPartner();
  if (!influencer) return;
  if (!confirm(`Revoke ${influencer.fullName}'s current share link?`)) return;
  try {
    const response = await fetch('/api/partner-shares/revoke-influencer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ influencerId: influencer.id })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    alert(payload.revoked ? 'Partner link revoked.' : 'There is no active partner link to revoke.');
  } catch (error) { alert(`Could not revoke link: ${error.message}`); }
}

async function importContactsForCurrentInfluencer(event) {
  const file = event.target.files?.[0];
  const influencer = currentPartner();
  if (!file || !influencer) return;
  try {
    if (!window.XLSX) throw new Error('CSV reader is unavailable. Reload the app and try again.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rawRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rows = rawRows.map(row => {
      const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), String(value || '').trim()]));
      const pick = (...keys) => keys.map(normalize).map(key => normalized[key]).find(Boolean) || '';
      const firstName = pick('first name', 'firstname', 'first');
      const lastName = pick('last name', 'lastname', 'last');
      return {
        fullName: pick('full name', 'fullname', 'contact name', 'name') || [firstName, lastName].filter(Boolean).join(' '),
        email: pick('email', 'work email', 'email address'),
        company: pick('company', 'organization', 'account'),
        jobTitle: pick('job title', 'title', 'role'),
        phone: pick('phone', 'phone number', 'mobile'),
        linkedinUrl: pick('linkedin', 'linkedin url', 'linkedinurl', 'profile url'),
        location: pick('location', 'city', 'state'),
        industry: pick('industry')
      };
    });
    const response = await fetch('/api/influencers/contacts/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencerId: influencer.id, contacts: rows })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Import failed (${response.status})`);
    await loadWorkbookFromServer();
    alert(`Import complete for ${influencer.fullName}: ${result.created} added, ${result.linked || 0} existing contacts linked, ${result.duplicates.length} already linked or duplicate emails skipped, ${result.invalid} incomplete rows skipped.`);
  } catch (error) { alert(`Could not import contacts: ${error.message}`); }
  finally { event.target.value = ''; }
}

function downloadPartnerReportData() {
  const influencers = (database.contacts || []).filter(c => c.isInfluencer);
  const byInfluencer = influencers.map(influencer => {
    const referrals = getInfluencerReferralsList(influencer).filter(contact => !isSyntheticPartnerContact(contact, influencer));
    return {
      influencer: influencer.fullName || 'Partner',
      total: referrals.length,
      scheduled: referrals.filter(c => c.hasScheduledCall && !c.hasTakenCall).length,
      completed: referrals.filter(c => c.hasTakenCall).length,
      pending: referrals.filter(c => !c.hasScheduledCall && !c.hasTakenCall).length
    };
  });
  const monthCounts = {};
  for (const influencer of influencers) {
    for (const contact of getInfluencerReferralsList(influencer).filter(row => !isSyntheticPartnerContact(row, influencer))) {
      const referralMeta = (influencer.referrals || []).find(referral => String(referral.id || referral.contactId || '') === String(contact.id) || String(referral.email || '').toLowerCase() === String(contact.email || '').toLowerCase());
      const rawDate = contact.referredDate || contact.date || referralMeta?.date;
      const month = /^\d{4}-\d{2}/.test(String(rawDate || '')) ? String(rawDate).slice(0, 7) : 'Undated';
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    }
  }
  const report = { generatedAt: new Date().toISOString(), byInfluencer, byMonth: Object.entries(monthCounts).map(([month, referrals]) => ({ month, referrals })).sort((a, b) => a.month.localeCompare(b.month)) };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'influencer-referral-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openPartnerContactEditor(contactId) {
  const contact = (database.contacts || []).find(c => String(c.id) === String(contactId));
  if (!contact) return;
  document.getElementById('partner-edit-contact-id').value = contact.id;
  document.getElementById('partner-edit-name').value = contact.fullName || '';
  document.getElementById('partner-edit-email').value = contact.email || '';
  document.getElementById('partner-edit-company').value = contact.company || '';
  document.getElementById('partner-edit-title').value = contact.jobTitle || '';
  document.getElementById('partner-edit-phone').value = contact.phone || '';
  const editLi = document.getElementById('partner-edit-linkedin');
  if (editLi) editLi.value = contact.linkedinUrl || '';
  document.getElementById('partner-edit-location').value = contact.location || '';
  document.getElementById('partner-edit-notes').value = contact.portalNotes || '';
  const dialog = document.getElementById('partner-contact-edit-dialog');
  if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
}

function closePartnerContactEditor() {
  const dialog = document.getElementById('partner-contact-edit-dialog');
  if (dialog?.close) dialog.close(); else dialog?.removeAttribute('open');
}

async function savePartnerContactEdit() {
  const influencer = currentPartner();
  const feedback = document.getElementById('partner-edit-feedback');
  const rawLi = (document.getElementById('partner-edit-linkedin')?.value || '').trim();
  const linkedinUrl = typeof normalizeLinkedinUrl === 'function' ? normalizeLinkedinUrl(rawLi) : rawLi;
  const contact = {
    fullName: document.getElementById('partner-edit-name').value.trim(),
    email: document.getElementById('partner-edit-email').value.trim(),
    company: document.getElementById('partner-edit-company').value.trim(),
    jobTitle: document.getElementById('partner-edit-title').value.trim(),
    phone: document.getElementById('partner-edit-phone').value.trim(),
    linkedinUrl,
    location: document.getElementById('partner-edit-location').value.trim(),
    portalNotes: document.getElementById('partner-edit-notes').value.trim()
  };
  try {
    const response = await fetch('/api/influencers/contacts/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencerId: influencer.id, contactId: document.getElementById('partner-edit-contact-id').value, contact })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
    await loadWorkbookFromServer();
    closePartnerContactEditor();
  } catch (error) { if (feedback) feedback.textContent = error.message; }
}

async function deletePartnerContact(contactId) {
  const influencer = currentPartner();
  const contact = (database.contacts || []).find(c => String(c.id) === String(contactId));
  if (!influencer || !contact || !confirm(`Remove ${contact.fullName} from ${influencer.fullName}'s referrals? The record will be deleted from the contact database.`)) return;
  const response = await fetch('/api/influencers/contacts/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ influencerId: influencer.id, contactId })
  });
  const result = await response.json();
  if (!response.ok) return alert(result.error || `Delete failed (${response.status})`);
  await loadWorkbookFromServer();
}

function openPartnerProfileEditor(isNew = false, explicitPartner = null) {
  const partner = isNew ? null : (explicitPartner || currentPartner());
  document.getElementById('partner-profile-dialog-title').textContent = isNew ? 'Add partner' : 'Edit partner';
  document.getElementById('partner-profile-id').value = partner?.id || '';
  document.getElementById('partner-profile-name').value = partner?.fullName || '';
  document.getElementById('partner-profile-email').value = partner?.email || '';
  document.getElementById('partner-profile-company').value = partner?.company || '';
  document.getElementById('partner-profile-title').value = partner?.jobTitle || '';
  document.getElementById('partner-profile-phone').value = partner?.phone || '';
  const liInput = document.getElementById('partner-profile-linkedin');
  if (liInput) liInput.value = partner?.linkedinUrl || '';
  document.getElementById('partner-profile-location').value = partner?.location || '';
  document.getElementById('partner-profile-delete').hidden = isNew;
  document.getElementById('partner-profile-feedback').textContent = '';
  const dialog = document.getElementById('partner-profile-dialog');
  if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
}

function openPartnerProfileEditorById(influencerId) {
  const partner = (database.contacts || []).find(c => String(c.id) === String(influencerId));
  if (!partner) return;
  openPartnerProfileEditor(false, partner);
}

function closePartnerProfileEditor() {
  const dialog = document.getElementById('partner-profile-dialog');
  if (dialog?.close) dialog.close(); else dialog?.removeAttribute('open');
}

async function savePartnerProfile() {
  const id = document.getElementById('partner-profile-id').value;
  const rawLi = (document.getElementById('partner-profile-linkedin')?.value || '').trim();
  const linkedinUrl = typeof normalizeLinkedinUrl === 'function' ? normalizeLinkedinUrl(rawLi) : rawLi;
  const profile = {
    fullName: document.getElementById('partner-profile-name').value.trim(),
    email: document.getElementById('partner-profile-email').value.trim(),
    company: document.getElementById('partner-profile-company').value.trim(),
    jobTitle: document.getElementById('partner-profile-title').value.trim(),
    phone: document.getElementById('partner-profile-phone').value.trim(),
    linkedinUrl,
    location: document.getElementById('partner-profile-location').value.trim()
  };
  const feedback = document.getElementById('partner-profile-feedback');
  try {
    const response = await fetch(id ? '/api/influencers/update' : '/api/influencers/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencerId: id, profile })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
    if (!id) activeConsolePortalInfluencerEmail = result.influencer.email;
    else if (id === String(currentPartner()?.id)) activeConsolePortalInfluencerEmail = result.influencer.email;
    await loadWorkbookFromServer();
    if (typeof filterOutboundTable === 'function') filterOutboundTable();
    closePartnerProfileEditor();
  } catch (error) { feedback.textContent = error.message; }
}

async function deletePartnerProfile() {
  const partner = currentPartner();
  if (!partner) return;
  if (!confirm(`Remove ${partner.fullName} from the partner list? Their contact records will remain in the database but will be unassigned, and their share links will be revoked.`)) return;
  const response = await fetch('/api/influencers/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ influencerId: partner.id })
  });
  const result = await response.json();
  if (!response.ok) return document.getElementById('partner-profile-feedback').textContent = result.error || `Delete failed (${response.status})`;
  activeConsolePortalInfluencerEmail = '';
  await loadWorkbookFromServer();
  closePartnerProfileEditor();
}

function toggleInfluencerReferralForm(forceOpen) {
  const form = document.getElementById("partner-referral-form");
  const bulkPanel = document.getElementById("partner-bulk-referral-panel");
  const trigger = document.querySelector(".partner-ledger-tools [aria-controls='partner-referral-form']");
  if (!form) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : form.hidden;
  form.hidden = !shouldOpen;
  if (shouldOpen && bulkPanel) {
    bulkPanel.hidden = true;
    document.getElementById("btn-toggle-bulk-referral")?.setAttribute("aria-expanded", "false");
  }
  trigger?.setAttribute("aria-expanded", String(shouldOpen));
  if (!shouldOpen) {
    const feedback = document.getElementById("console-portal-feedback");
    if (feedback) { feedback.hidden = true; feedback.style.display = "none"; }
  }
  if (shouldOpen) document.getElementById("console-portal-ref-name")?.focus();
}

function switchPartnerEntryMode(mode) {
  if (mode === "bulk") {
    toggleInfluencerReferralForm(false);
    toggleBulkReferralEditor(true);
  } else {
    toggleBulkReferralEditor(false);
    toggleInfluencerReferralForm(true);
  }
}

function toggleBulkReferralEditor(forceOpen) {
  const panel = document.getElementById("partner-bulk-referral-panel");
  const singleForm = document.getElementById("partner-referral-form");
  const btn = document.getElementById("btn-toggle-bulk-referral");
  if (!panel) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : panel.hidden;
  panel.hidden = !shouldOpen;
  btn?.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    if (singleForm) {
      singleForm.hidden = true;
      document.querySelector(".partner-ledger-tools [aria-controls='partner-referral-form']")?.setAttribute("aria-expanded", "false");
    }
    const tbody = document.getElementById("partner-bulk-rows-tbody");
    if (tbody && tbody.children.length === 0) {
      resetPartnerBulkEditorRows(3);
    }
    ensurePartnerBulkPasteBinding();
    const firstInput = panel.querySelector("tbody input[data-field='fullName']");
    firstInput?.focus();
  } else {
    const feedback = document.getElementById("partner-bulk-feedback");
    if (feedback) { feedback.hidden = true; feedback.style.display = "none"; }
  }
}

function createPartnerBulkRowHTML(row = {}, index = 1) {
  const statusVal = row.status || (row.hasTakenCall ? "completed" : row.hasScheduledCall ? "scheduled" : "completed");
  const idAttr = row.id ? `data-contact-id="${escapePartnerHTML(row.id)}"` : "";
  const badgeHTML = row.id
    ? `<span class="partner-bulk-row-badge existing" title="Editing existing contact">${index}</span>`
    : `<span class="partner-bulk-row-badge">${index}</span>`;
  return `
    <tr class="partner-bulk-row" ${idAttr}>
      <td class="partner-bulk-row-num">${badgeHTML}</td>
      <td><input type="text" class="partner-grid-input" data-field="fullName" value="${escapePartnerHTML(row.fullName || "")}" placeholder="Jordan Vance"></td>
      <td><input type="email" class="partner-grid-input" data-field="email" value="${escapePartnerHTML(row.email || "")}" placeholder="jordan@company.com"></td>
      <td><input type="text" class="partner-grid-input" data-field="company" value="${escapePartnerHTML(row.company || "")}" placeholder="Pacific Crest CU"></td>
      <td><input type="text" class="partner-grid-input" data-field="jobTitle" value="${escapePartnerHTML(row.jobTitle || "")}" placeholder="Chief Lending Officer"></td>
      <td><input type="tel" class="partner-grid-input" data-field="phone" value="${escapePartnerHTML(row.phone || "")}" placeholder="+1 415 555 0192"></td>
      <td><input type="text" class="partner-grid-input" data-field="location" value="${escapePartnerHTML(row.location || "")}" placeholder="San Diego, CA"></td>
      <td>
        <select class="partner-grid-select" data-field="status">
          <option value="completed" ${statusVal === "completed" || statusVal === "taken" ? "selected" : ""}>Call completed</option>
          <option value="scheduled" ${statusVal === "scheduled" ? "selected" : ""}>Call scheduled</option>
          <option value="pending" ${statusVal === "pending" ? "selected" : ""}>Pending outreach</option>
        </select>
      </td>
      <td><input type="text" class="partner-grid-input" data-field="notes" value="${escapePartnerHTML(row.notes || row.portalNotes || "")}" placeholder="Warm intro / context"></td>
      <td style="text-align: center;">
        <button type="button" class="partner-bulk-remove-btn" onclick="removePartnerBulkRow(this)" title="Remove row" aria-label="Remove row">&times;</button>
      </td>
    </tr>
  `;
}

function updatePartnerBulkRowNumbers() {
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr.partner-bulk-row"));
  let existingCount = 0;
  let newCount = 0;
  rows.forEach((tr, i) => {
    const badge = tr.querySelector(".partner-bulk-row-badge");
    if (badge) badge.textContent = String(i + 1);
    if (tr.dataset.contactId) existingCount += 1;
    else newCount += 1;
  });
  const summaryEl = document.getElementById("partner-bulk-row-summary");
  if (summaryEl) {
    if (existingCount > 0 && newCount > 0) {
      summaryEl.textContent = `${existingCount} existing + ${newCount} new row${newCount === 1 ? "" : "s"}`;
    } else if (existingCount > 0) {
      summaryEl.textContent = `Editing ${existingCount} existing contact${existingCount === 1 ? "" : "s"}`;
    } else {
      summaryEl.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"} ready`;
    }
  }
}

function addPartnerBulkRows(count = 1, initialRows = null) {
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (!tbody) return;
  const currentCount = tbody.querySelectorAll("tr.partner-bulk-row").length;
  const items = Array.isArray(initialRows) ? initialRows : Array.from({ length: count }, () => ({}));
  const html = items.map((item, idx) => createPartnerBulkRowHTML(item, currentCount + idx + 1)).join("");
  tbody.insertAdjacentHTML("beforeend", html);
  updatePartnerBulkRowNumbers();
}

function removePartnerBulkRow(btn) {
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  const tr = btn?.closest("tr.partner-bulk-row");
  if (!tbody || !tr) return;
  tr.remove();
  if (tbody.querySelectorAll("tr.partner-bulk-row").length === 0) {
    addPartnerBulkRows(1);
  } else {
    updatePartnerBulkRowNumbers();
  }
}

function resetPartnerBulkEditorRows(count = 3) {
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  addPartnerBulkRows(count);
  const feedback = document.getElementById("partner-bulk-feedback");
  if (feedback) { feedback.hidden = true; feedback.style.display = "none"; }
}

function loadExistingReferralsIntoBulkEditor() {
  const influencer = currentPartner();
  if (!influencer) return;
  const referrals = getInfluencerReferralsList(influencer);
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (referrals.length === 0) {
    addPartnerBulkRows(3);
    return;
  }
  addPartnerBulkRows(referrals.length, referrals);
  addPartnerBulkRows(2);
}

function togglePartnerBulkPasteBox(forceOpen) {
  const box = document.getElementById("partner-bulk-paste-box");
  if (!box) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : box.hidden;
  box.hidden = !shouldOpen;
  if (shouldOpen) document.getElementById("partner-bulk-paste-input")?.focus();
}

function parseSpreadsheetLinesToContacts(rawText) {
  const lines = String(rawText || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.includes("\t")
      ? line.split("\t").map(c => c.trim())
      : line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    if (cells.length === 0) continue;
    const firstLower = (cells[0] || "").toLowerCase();
    const secondLower = (cells[1] || "").toLowerCase();
    if (i === 0 && (firstLower.includes("name") || secondLower.includes("email"))) {
      continue;
    }
    const rawStatus = (cells[6] || "").toLowerCase();
    let status = "completed";
    if (rawStatus.includes("pend") || rawStatus.includes("not")) status = "pending";
    else if (rawStatus.includes("sched")) status = "scheduled";
    parsed.push({
      fullName: cells[0] || "",
      email: cells[1] || "",
      company: cells[2] || "",
      jobTitle: cells[3] || "",
      phone: cells[4] || "",
      location: cells[5] || "",
      status,
      notes: cells[7] || ""
    });
  }
  return parsed;
}

function applyPartnerBulkPaste() {
  const input = document.getElementById("partner-bulk-paste-input");
  const rows = parseSpreadsheetLinesToContacts(input?.value || "");
  if (rows.length === 0) {
    alert("Paste at least one line with Name, Email, and Company.");
    return;
  }
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (tbody) {
    const existingTrs = Array.from(tbody.querySelectorAll("tr.partner-bulk-row"));
    const allBlank = existingTrs.every(tr => {
      return !tr.dataset.contactId && Array.from(tr.querySelectorAll("input")).every(inp => !inp.value.trim());
    });
    if (allBlank) tbody.innerHTML = "";
  }
  addPartnerBulkRows(rows.length, rows);
  if (input) input.value = "";
  togglePartnerBulkPasteBox(false);
}

function ensurePartnerBulkPasteBinding() {
  const tbody = document.getElementById("partner-bulk-rows-tbody");
  if (!tbody || tbody.dataset.pasteBound === "true") return;
  tbody.dataset.pasteBound = "true";
  tbody.addEventListener("paste", event => {
    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\n") && !text.includes("\t")) return;
    const parsed = parseSpreadsheetLinesToContacts(text);
    if (parsed.length <= 1 && !text.includes("\t")) return;
    event.preventDefault();
    const existingTrs = Array.from(tbody.querySelectorAll("tr.partner-bulk-row"));
    const allBlank = existingTrs.every(tr => !tr.dataset.contactId && Array.from(tr.querySelectorAll("input")).every(inp => !inp.value.trim()));
    if (allBlank) tbody.innerHTML = "";
    addPartnerBulkRows(parsed.length, parsed);
  });
}

function collectRowsFromTableBody(tbodySelector) {
  const tbody = document.querySelector(tbodySelector);
  if (!tbody) return [];
  const rows = [];
  for (const tr of tbody.querySelectorAll("tr")) {
    const getVal = field => (tr.querySelector(`[data-field="${field}"]`)?.value || "").trim();
    const fullName = getVal("fullName");
    const email = getVal("email");
    const company = getVal("company");
    const jobTitle = getVal("jobTitle");
    const phone = getVal("phone");
    const location = getVal("location");
    const status = getVal("status") || "completed";
    const notes = getVal("notes");
    const contactId = tr.dataset.contactId || "";
    if (!fullName && !email && !company && !jobTitle && !phone && !location && !notes) {
      continue;
    }
    rows.push({
      id: contactId || undefined,
      fullName,
      email,
      company,
      jobTitle,
      phone,
      location,
      status,
      hasScheduledCall: status === "scheduled" || status === "completed" || status === "taken",
      hasTakenCall: status === "completed" || status === "taken",
      notes,
      portalNotes: notes
    });
  }
  return rows;
}

async function submitPartnerBulkRecords() {
  const influencer = currentPartner();
  if (!influencer) return alert("Select a partner first.");
  const rows = collectRowsFromTableBody("#partner-bulk-rows-tbody");
  const feedbackEl = document.getElementById("partner-bulk-feedback");
  const saveBtn = document.getElementById("btn-save-partner-bulk");

  if (rows.length === 0) {
    alert("Enter at least one contact row with Full Name, Work Email, and Company.");
    return;
  }

  const incomplete = rows.find(r => !r.fullName || !r.email || (!r.id && !r.company));
  if (incomplete) {
    alert("Every non-empty row requires Full Name, Work Email, and Company.");
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  try {
    const res = await fetch("/api/influencers/contacts/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerId: influencer.id,
        contacts: rows
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `Bulk save failed (${res.status})`);

    await loadWorkbookFromServer();
    renderInfluencersTable();
    if (typeof renderDashboard === "function") renderDashboard();

    const parts = [];
    if (result.created) parts.push(`${result.created} added`);
    if (result.updated) parts.push(`${result.updated} updated`);
    if (result.linked) parts.push(`${result.linked} existing linked`);
    if (result.duplicates?.length) parts.push(`${result.duplicates.length} duplicate skipped`);
    if (result.invalid) parts.push(`${result.invalid} invalid skipped`);

    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.style.display = "block";
      feedbackEl.style.background = "rgba(5, 150, 105, 0.12)";
      feedbackEl.style.color = "#059669";
      feedbackEl.textContent = `Saved multi-record batch for ${influencer.fullName}: ${parts.join(", ") || "All records up to date"}.`;
    }
    resetPartnerBulkEditorRows(3);
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.style.display = "block";
    }
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.style.display = "block";
      feedbackEl.style.background = "rgba(220, 38, 38, 0.1)";
      feedbackEl.style.color = "#b42318";
      feedbackEl.textContent = `Could not save bulk records: ${err.message}`;
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function togglePartnerTableMultiEdit(forceState) {
  window.isPartnerTableMultiEditMode = typeof forceState === "boolean" ? forceState : !window.isPartnerTableMultiEditMode;
  const feedback = document.getElementById("partner-inline-edit-feedback");
  if (feedback) feedback.textContent = "";
  renderConsolePortalReferrals();
}

async function savePartnerTableMultiEdit() {
  const influencer = currentPartner();
  if (!influencer) return;
  const rows = collectRowsFromTableBody("#console-portal-referrals-tbody");
  const feedback = document.getElementById("partner-inline-edit-feedback");
  const btn = document.getElementById("btn-save-inline-multi-edit");
  if (rows.length === 0) {
    togglePartnerTableMultiEdit(false);
    return;
  }
  if (btn) btn.disabled = true;
  if (feedback) feedback.textContent = "Saving changes…";
  try {
    const res = await fetch("/api/influencers/contacts/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerId: influencer.id,
        contacts: rows
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `Save failed (${res.status})`);
    window.isPartnerTableMultiEditMode = false;
    await loadWorkbookFromServer();
    renderInfluencersTable();
    if (typeof renderDashboard === "function") renderDashboard();
  } catch (err) {
    if (feedback) feedback.textContent = `Error: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function toggleInfluencerStatus(index, isChecked) {
  const c = database.contacts[index];
  if (!c) return;
  c.isInfluencer = isChecked;
  if (isChecked && !c.referralCredits) c.referralCredits = 0;
  if (typeof renderUploadTable === "function") renderUploadTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();
}

function openAddReferralModal(influencerIndex) {
  if (typeof openAddProspectForInfluencer === "function") {
    openAddProspectForInfluencer(influencerIndex);
  }
}

function openAddInfluencerModal() {
  const dlg = document.getElementById("add-influencer-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeAddInfluencerModal() {
  const dlg = document.getElementById("add-influencer-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

async function handleManualInfluencerSubmit(e) {
  e.preventDefault();
  const fullName = (document.getElementById("manual-inf-name")?.value || "").trim();
  const jobTitle = (document.getElementById("manual-inf-title")?.value || "Industry Advisor").trim();
  const company = (document.getElementById("manual-inf-company")?.value || "Advisory Network").trim();
  const email = (document.getElementById("manual-inf-email")?.value || "").trim().toLowerCase();
  const phone = (document.getElementById("manual-inf-phone")?.value || "").trim();
  const rawLinkedin = (document.getElementById("manual-inf-linkedin")?.value || "").trim();
  const linkedinUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(rawLinkedin) : rawLinkedin;
  const agreementTitle = (document.getElementById("manual-inf-agreement")?.value || "").trim();
  const leadTemp = document.getElementById("manual-inf-temp")?.value || "Hot Lead";
  const matchPercentage = Number(document.getElementById("manual-inf-match")?.value || 95);

  if (!fullName || !email) {
    alert("Full Name and Email Address are required.");
    return;
  }

  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(" ") || "";
  const initialAgreements = agreementTitle
    ? [{
        id: `agr_${Date.now()}`,
        name: agreementTitle,
        status: "Signed",
        uploadedAt: new Date().toISOString().slice(0, 10),
        notes: "Attached during influencer onboarding"
      }]
    : [];

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
      jobTitle,
      company,
      phone: phone || "+1 (555) 019-2834",
      linkedinUrl,
      industry: "Credit Union",
      sourceFile: "Direct Influencer Import",
      state: "NY",
      enriched: true,
      enrichmentStatus: "verified_provider_data",
      matchPercentage,
      leadTemp: leadTemp || "Influencer Partner",
      emailsSent: false,
      linkedinSent: false,
      callsMade: [],
      hasScheduledCall: false,
      hasTakenCall: false,
      isInfluencer: true,
      referredBy: "",
      referrals: [],
      agreements: initialAgreements,
      referralCredits: 0
    };
    database.contacts.unshift(contact);
  } else {
    contact.isInfluencer = true;
    contact.fullName = fullName || contact.fullName;
    contact.jobTitle = jobTitle || contact.jobTitle;
    contact.company = company || contact.company;
    contact.phone = phone || contact.phone;
    if (linkedinUrl) contact.linkedinUrl = linkedinUrl;
    contact.leadTemp = leadTemp || "Influencer Partner";
    contact.matchPercentage = matchPercentage || contact.matchPercentage || 95;
    contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
    contact.agreements = Array.isArray(contact.agreements) ? contact.agreements : [];
    if (initialAgreements.length > 0) {
      contact.agreements.push(...initialAgreements);
    }
  }

  if (typeof recalculateAllInfluencerCredits === "function") recalculateAllInfluencerCredits();

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
        linkedinUrl: contact.linkedinUrl || "",
        agreements: contact.agreements || [],
        industry: contact.industry || "Credit Union"
      })
    });
  } catch (_) {}

  saveDatabaseCache();
  if (typeof initLoadedData === "function") initLoadedData();
  renderInfluencersTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();

  const form = document.getElementById("manual-influencer-form");
  if (form) form.reset();
  closeAddInfluencerModal();

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[INFLUENCER PORTAL] Added ${contact.fullName} (${contact.company}) as an Influencer Partner.`, "success");
  }
}

// ─── 1. PARTNER EARNINGS & CREDITS LEDGER MODAL ──────────────────────────────
function resolveInfluencerByIdOrActive(influencerId) {
  if (influencerId !== undefined && influencerId !== null && influencerId !== "") {
    const found = (database.contacts || []).find(c =>
      c.isInfluencer && (String(c.id) === String(influencerId) || String(c.email || "").toLowerCase() === String(influencerId).toLowerCase())
    );
    if (found) return found;
  }
  return currentPartner();
}

function openInfluencerEarningsModal(influencerId) {
  const influencer = resolveInfluencerByIdOrActive(influencerId);
  if (!influencer) {
    alert("Select or add an Influencer Partner first.");
    return;
  }

  if (typeof recalculateAllInfluencerCredits === "function") recalculateAllInfluencerCredits();
  const summary = typeof getInfluencerEarningsSummary === "function"
    ? getInfluencerEarningsSummary(influencer)
    : {
        totalCredits: influencer.referralCredits || 0,
        approvedCredits: influencer.referralCredits || 0,
        pendingCredits: 0,
        estimatedPayoutUsd: (influencer.referralCredits || 0) * 10,
        paymentStatus: "Settlement Pending (Placeholder)",
        referrals: []
      };

  const titleEl = document.getElementById("earnings-modal-partner-name");
  const totalEl = document.getElementById("earnings-kpi-total-credits");
  const approvedEl = document.getElementById("earnings-kpi-approved-credits");
  const pendingEl = document.getElementById("earnings-kpi-pending-credits");
  const payoutEl = document.getElementById("earnings-kpi-payout-usd");
  const statusBadgeEl = document.getElementById("earnings-payment-status-badge");
  const tbodyEl = document.getElementById("earnings-ledger-tbody");

  if (titleEl) titleEl.textContent = `${influencer.fullName} — Partner Credits & Earnings`;
  if (totalEl) totalEl.textContent = `${summary.totalCredits} pts`;
  if (approvedEl) approvedEl.textContent = `${summary.approvedCredits} pts`;
  if (pendingEl) pendingEl.textContent = `${summary.pendingCredits} pts`;
  if (payoutEl) payoutEl.textContent = `$${summary.estimatedPayoutUsd.toLocaleString()}`;
  if (statusBadgeEl) statusBadgeEl.textContent = summary.paymentStatus;

  if (tbodyEl) {
    const referrals = getInfluencerReferralsList(influencer);
    if (referrals.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--color-text-secondary);">No referrals recorded yet for ${escapePartnerHTML(influencer.fullName)}.</td></tr>`;
    } else {
      tbodyEl.innerHTML = referrals.map(r => {
        const pts = typeof computeContactReferralCredits === "function" ? computeContactReferralCredits(r) : (r.hasTakenCall ? 25 : r.hasScheduledCall ? 15 : 10);
        const statusText = r.hasTakenCall
          ? `<span class="badge badge-success" style="font-size: 10px;">✓ Call Completed</span>`
          : r.hasScheduledCall
            ? `<span class="badge" style="font-size: 10px; background: rgba(13, 148, 136, 0.14); color: #0d9488;">Call Scheduled</span>`
            : `<span class="badge" style="font-size: 10px;">Contact Shared</span>`;
        const breakdown = r.hasTakenCall
          ? "+10 intro · +5 scheduled · +10 call completed"
          : r.hasScheduledCall
            ? "+10 intro · +5 call scheduled"
            : "+10 contact shared";
        return `
          <tr>
            <td>
              <div style="font-weight: 600;">${escapePartnerHTML(r.fullName)}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(r.email || "")}</div>
            </td>
            <td>
              <div>${escapePartnerHTML(r.company || "Organization")}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(r.jobTitle || "")}</div>
            </td>
            <td>${statusText}</td>
            <td style="font-size: 11.5px; color: var(--color-text-secondary);">${breakdown}</td>
            <td style="text-align: right; font-weight: 700; color: #0d9488;">+${pts} pts</td>
          </tr>
        `;
      }).join("");
    }
  }

  const dlg = document.getElementById("influencer-earnings-modal");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeInfluencerEarningsModal() {
  const dlg = document.getElementById("influencer-earnings-modal");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

// ─── 2. INFLUENCER AGREEMENTS & FILE ATTACHMENTS MANAGER ─────────────────────
function openInfluencerAgreementsModal(influencerId) {
  const influencer = resolveInfluencerByIdOrActive(influencerId);
  if (!influencer) {
    alert("Select or add an Influencer Partner first.");
    return;
  }

  const idInput = document.getElementById("agreements-modal-influencer-id");
  const titleEl = document.getElementById("agreements-modal-partner-name");
  const form = document.getElementById("influencer-agreement-upload-form");
  if (idInput) idInput.value = String(influencer.id);
  if (titleEl) titleEl.textContent = `${influencer.fullName} — Agreements & Attachments`;
  if (form) form.reset();

  renderInfluencerAgreementsList(influencer);

  const dlg = document.getElementById("influencer-agreements-modal");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeInfluencerAgreementsModal() {
  const dlg = document.getElementById("influencer-agreements-modal");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function prefillAgreementTitleFromFile(fileInput) {
  const file = fileInput?.files?.[0];
  const nameInput = document.getElementById("agreement-doc-name");
  if (file && nameInput && !nameInput.value.trim()) {
    nameInput.value = file.name;
  }
}

function renderInfluencerAgreementsList(influencer) {
  const container = document.getElementById("influencer-agreements-list");
  if (!container || !influencer) return;
  const agreements = Array.isArray(influencer.agreements) ? influencer.agreements : [];
  if (agreements.length === 0) {
    container.innerHTML = `<div style="padding: 1.25rem; text-align: center; color: var(--color-text-secondary); background: var(--color-background-muted); border: 1px dashed var(--color-border); border-radius: var(--radius-xs); font-size: 12px;">No signed agreements or files attached yet for ${escapePartnerHTML(influencer.fullName)}.</div>`;
    return;
  }

  container.innerHTML = agreements.map(agr => {
    const statusColor = agr.status === "Signed" ? "badge-success" : "badge";
    const hasData = Boolean(agr.dataUrl);
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; background: var(--surface-card); border: 1px solid var(--color-border); border-radius: var(--radius-xs);">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 12.5px; color: var(--color-text-primary);">${escapePartnerHTML(agr.name || "Partner Agreement")}</strong>
            <span class="badge ${statusColor}" style="font-size: 10px;">${escapePartnerHTML(agr.status || "Signed")}</span>
          </div>
          <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
            Uploaded ${escapePartnerHTML(agr.uploadedAt || "Recently")}${agr.notes ? ` · ${escapePartnerHTML(agr.notes)}` : ""}
          </div>
        </div>
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          ${hasData ? `<button type="button" class="btn btn-secondary btn-xs" onclick="downloadInfluencerAgreement('${escapePartnerHTML(influencer.id)}', '${escapePartnerHTML(agr.id)}')">Download</button>` : ""}
          <button type="button" class="btn btn-secondary btn-xs" style="color: var(--color-error);" onclick="deleteInfluencerAgreement('${escapePartnerHTML(influencer.id)}', '${escapePartnerHTML(agr.id)}')">Remove</button>
        </div>
      </div>
    `;
  }).join("");
}

async function handleAttachInfluencerAgreement(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  const infId = document.getElementById("agreements-modal-influencer-id")?.value;
  const influencer = resolveInfluencerByIdOrActive(infId);
  if (!influencer) return;

  const docName = (document.getElementById("agreement-doc-name")?.value || "").trim();
  const docStatus = document.getElementById("agreement-doc-status")?.value || "Signed";
  const docNotes = (document.getElementById("agreement-doc-notes")?.value || "").trim();
  const fileInput = document.getElementById("agreement-doc-file");
  const file = fileInput?.files?.[0] || null;

  if (!docName) {
    alert("Please enter an Agreement / Document Title.");
    return;
  }

  let dataUrl = "";
  let fileType = "";
  let fileSize = 0;
  if (file) {
    fileType = file.type || "application/octet-stream";
    fileSize = file.size || 0;
    dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  const newAgreement = {
    id: `agr_${Date.now()}`,
    name: docName,
    status: docStatus,
    notes: docNotes,
    fileType,
    fileSize,
    dataUrl,
    uploadedAt: new Date().toISOString().slice(0, 10)
  };

  if (!Array.isArray(influencer.agreements)) influencer.agreements = [];
  influencer.agreements.push(newAgreement);

  try {
    await fetch("/api/influencers/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerId: influencer.id,
        action: "add",
        agreement: newAgreement
      })
    });
  } catch (_) {}

  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();

  const form = document.getElementById("influencer-agreement-upload-form");
  if (form) form.reset();

  renderInfluencerAgreementsList(influencer);
  renderInfluencersTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
}

function downloadInfluencerAgreement(influencerId, agreementId) {
  const influencer = resolveInfluencerByIdOrActive(influencerId);
  if (!influencer || !Array.isArray(influencer.agreements)) return;
  const agr = influencer.agreements.find(a => String(a.id) === String(agreementId));
  if (!agr || !agr.dataUrl) return;
  const a = document.createElement("a");
  a.href = agr.dataUrl;
  a.download = agr.name || "partner-agreement";
  a.click();
}

async function deleteInfluencerAgreement(influencerId, agreementId) {
  const influencer = resolveInfluencerByIdOrActive(influencerId);
  if (!influencer || !Array.isArray(influencer.agreements)) return;
  influencer.agreements = influencer.agreements.filter(a => String(a.id) !== String(agreementId));

  try {
    await fetch("/api/influencers/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerId: influencer.id,
        action: "delete",
        agreementId
      })
    });
  } catch (_) {}

  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();
  renderInfluencerAgreementsList(influencer);
  renderInfluencersTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
}

// ─── 3. BULK ADD / ONBOARD INFLUENCERS MODAL ─────────────────────────────────
function openBulkAddInfluencerModal() {
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (tbody && tbody.children.length === 0) {
    resetBulkInfluencerGridRows(3);
  }
  const dlg = document.getElementById("bulk-add-influencer-modal");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeBulkAddInfluencerModal() {
  const dlg = document.getElementById("bulk-add-influencer-modal");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function addBulkInfluencerGridRows(count = 1, initialRows = null) {
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (!tbody) return;
  const currentCount = tbody.querySelectorAll("tr").length;
  const rows = Array.isArray(initialRows) ? initialRows : Array.from({ length: count }, () => ({}));
  const html = rows.map((r, i) => `
    <tr class="bulk-influencer-row">
      <td class="bulk-inf-idx" style="font-size: 11px; color: var(--color-text-secondary);">${currentCount + i + 1}</td>
      <td><input type="text" class="form-input" data-field="fullName" value="${escapePartnerHTML(r.fullName || "")}" placeholder="Alex Rivera" style="font-size: 12px;"></td>
      <td><input type="email" class="form-input" data-field="email" value="${escapePartnerHTML(r.email || "")}" placeholder="alex@cuso.org" style="font-size: 12px;"></td>
      <td><input type="text" class="form-input" data-field="company" value="${escapePartnerHTML(r.company || "")}" placeholder="Pacific CUSO" style="font-size: 12px;"></td>
      <td><input type="text" class="form-input" data-field="jobTitle" value="${escapePartnerHTML(r.jobTitle || "")}" placeholder="Managing Partner" style="font-size: 12px;"></td>
      <td><input type="text" class="form-input" data-field="phone" value="${escapePartnerHTML(r.phone || "")}" placeholder="+1 415 555 0199" style="font-size: 12px;"></td>
      <td><input type="url" class="form-input" data-field="linkedinUrl" value="${escapePartnerHTML(r.linkedinUrl || "")}" placeholder="https://www.linkedin.com/in/alex-rivera" style="font-size: 12px;"></td>
      <td><input type="text" class="form-input" data-field="agreement" value="${escapePartnerHTML(r.agreement || "")}" placeholder="Partner Agreement 2026" style="font-size: 12px;"></td>
      <td><button type="button" class="btn btn-secondary btn-xs" onclick="removeBulkInfluencerGridRow(this)">×</button></td>
    </tr>
  `).join("");
  tbody.insertAdjacentHTML("beforeend", html);
  updateBulkInfluencerGridCount();
}

function resetBulkInfluencerGridRows(count = 3) {
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  addBulkInfluencerGridRows(count);
}

function removeBulkInfluencerGridRow(btn) {
  const tr = btn?.closest("tr");
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (tr && tbody) {
    tr.remove();
    if (tbody.querySelectorAll("tr").length === 0) addBulkInfluencerGridRows(1);
    else updateBulkInfluencerGridCount();
  }
}

function updateBulkInfluencerGridCount() {
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  const label = document.getElementById("bulk-influencer-row-count-label");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr"));
  rows.forEach((tr, idx) => {
    const cell = tr.querySelector(".bulk-inf-idx");
    if (cell) cell.textContent = String(idx + 1);
  });
  if (label) label.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"} ready`;
}

function parseBulkInfluencerPaste() {
  const raw = document.getElementById("bulk-influencer-paste-input")?.value || "";
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    alert("Paste at least one row first.");
    return;
  }
  const parsed = [];
  lines.forEach((line, idx) => {
    const cells = line.includes("\t")
      ? line.split("\t").map(c => c.trim())
      : line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    if (idx === 0 && ((cells[0] || "").toLowerCase().includes("name") || (cells[1] || "").toLowerCase().includes("email"))) {
      return;
    }
    if (cells[0] || cells[1]) {
      parsed.push({
        fullName: cells[0] || "",
        email: cells[1] || "",
        company: cells[2] || "",
        jobTitle: cells[3] || "",
        phone: cells[4] || "",
        linkedinUrl: cells[5] || "",
        agreement: cells[6] || ""
      });
    }
  });
  if (parsed.length === 0) return;
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (tbody) tbody.innerHTML = "";
  addBulkInfluencerGridRows(parsed.length, parsed);
  const input = document.getElementById("bulk-influencer-paste-input");
  if (input) input.value = "";
}

async function submitBulkInfluencerOnboarding() {
  const tbody = document.getElementById("bulk-influencer-grid-tbody");
  if (!tbody) return;
  const rows = [];
  for (const tr of tbody.querySelectorAll("tr")) {
    const get = f => (tr.querySelector(`[data-field="${f}"]`)?.value || "").trim();
    const fullName = get("fullName");
    const email = get("email").toLowerCase();
    const company = get("company");
    const jobTitle = get("jobTitle");
    const phone = get("phone");
    const rawLi = get("linkedinUrl");
    const linkedinUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(rawLi) : rawLi;
    const agreement = get("agreement");
    if (!fullName && !email && !company) continue;
    if (!fullName || !email || !company) {
      alert("Each non-empty row requires Full Name, Work Email, and Company.");
      return;
    }
    rows.push({
      fullName,
      email,
      company,
      jobTitle: jobTitle || "Industry Advisor",
      phone,
      linkedinUrl,
      agreements: agreement
        ? [{
            id: `agr_${Date.now()}_${rows.length}`,
            name: agreement,
            status: "Signed",
            uploadedAt: new Date().toISOString().slice(0, 10)
          }]
        : []
    });
  }

  if (rows.length === 0) {
    alert("Enter at least one Influencer row with Full Name, Work Email, and Company.");
    return;
  }

  try {
    const res = await fetch("/api/influencers/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencers: rows })
    });
    if (res.ok) {
      await loadWorkbookFromServer();
    } else {
      throw new Error("Fallback to local bulk creation");
    }
  } catch (_) {
    rows.forEach(item => {
      let existing = (database.contacts || []).find(c => String(c.email || "").toLowerCase() === item.email);
      if (!existing) {
        const maxId = (database.contacts || []).reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
        const parts = item.fullName.split(/\s+/);
        existing = {
          id: maxId + 1,
          firstName: parts[0] || item.fullName,
          lastName: parts.slice(1).join(" ") || "",
          fullName: item.fullName,
          email: item.email,
          company: item.company,
          jobTitle: item.jobTitle,
          phone: item.phone,
          linkedinUrl: item.linkedinUrl,
          isInfluencer: true,
          referrals: [],
          agreements: item.agreements || [],
          referralCredits: 0,
          leadTemp: "Influencer Partner"
        };
        database.contacts.unshift(existing);
      } else {
        existing.isInfluencer = true;
        existing.fullName = item.fullName || existing.fullName;
        existing.company = item.company || existing.company;
        existing.jobTitle = item.jobTitle || existing.jobTitle;
        if (item.linkedinUrl) existing.linkedinUrl = item.linkedinUrl;
        existing.agreements = [...(existing.agreements || []), ...(item.agreements || [])];
      }
    });
    if (typeof recalculateAllInfluencerCredits === "function") recalculateAllInfluencerCredits();
    saveDatabaseCache();
  }

  resetBulkInfluencerGridRows(3);
  closeBulkAddInfluencerModal();
  renderInfluencersTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
  alert(`Successfully onboarded ${rows.length} Influencer Partner${rows.length === 1 ? "" : "s"}.`);
}

// ─── 4. INTERACTIVE GTM RELATIONSHIP GRAPH VISUALIZER ────────────────────────
function openRelationshipGraphModal(influencerId) {
  const selectEl = document.getElementById("graph-filter-influencer");
  const influencers = (database.contacts || []).filter(c => c.isInfluencer && !c.archivedAt);
  if (selectEl) {
    selectEl.innerHTML = `<option value="all">All Influencers (${influencers.length})</option>` +
      influencers.map(inf => `<option value="${escapePartnerHTML(inf.id)}">${escapePartnerHTML(inf.fullName)} (${escapePartnerHTML(inf.company || "Partner")})</option>`).join("");
    if (influencerId) {
      selectEl.value = String(influencerId);
    }
  }

  renderRelationshipGraph();

  const dlg = document.getElementById("relationship-graph-modal");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeRelationshipGraphModal() {
  const dlg = document.getElementById("relationship-graph-modal");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function renderRelationshipGraph() {
  const svg = document.getElementById("relationship-graph-svg");
  const summaryEl = document.getElementById("graph-summary-metrics");
  if (!svg) return;

  const infFilter = document.getElementById("graph-filter-influencer")?.value || "all";
  const statusFilter = document.getElementById("graph-filter-status")?.value || "all";

  const allInfluencers = (database.contacts || []).filter(c => c.isInfluencer && !c.archivedAt);
  const influencers = infFilter === "all"
    ? allInfluencers
    : allInfluencers.filter(i => String(i.id) === String(infFilter));

  const referralNodes = [];
  const orgMap = new Map();
  const edges = [];

  influencers.forEach(inf => {
    const refs = getInfluencerReferralsList(inf).filter(r => {
      const hasCall = Boolean(r.hasTakenCall || r.hasScheduledCall);
      if (statusFilter === "taken" && !hasCall) return false;
      if (statusFilter === "pending" && hasCall) return false;
      return true;
    });

    refs.slice(0, 18).forEach(ref => {
      if (!referralNodes.some(n => String(n.id) === String(ref.id))) {
        referralNodes.push(ref);
      }
      const orgName = (ref.company || "Target Organization").trim();
      if (!orgMap.has(orgName)) {
        orgMap.set(orgName, { name: orgName, contacts: [], influencers: new Set() });
      }
      const orgEntry = orgMap.get(orgName);
      if (!orgEntry.contacts.some(c => String(c.id) === String(ref.id))) {
        orgEntry.contacts.push(ref);
      }
      orgEntry.influencers.add(inf.fullName);

      edges.push({
        fromType: "influencer",
        fromId: String(inf.id),
        toType: "org",
        toId: orgName,
        status: ref.hasTakenCall ? "taken" : ref.hasScheduledCall ? "scheduled" : "pending"
      });
      edges.push({
        fromType: "org",
        fromId: orgName,
        toType: "contact",
        toId: String(ref.id),
        status: ref.hasTakenCall ? "taken" : ref.hasScheduledCall ? "scheduled" : "pending"
      });
    });
  });

  const orgNodes = Array.from(orgMap.values()).slice(0, 12);
  if (summaryEl) {
    summaryEl.textContent = `${influencers.length} influencer${influencers.length === 1 ? "" : "s"} · ${orgNodes.length} organization${orgNodes.length === 1 ? "" : "s"} · ${referralNodes.length} referred contact${referralNodes.length === 1 ? "" : "s"}`;
  }

  const height = Math.max(520, Math.max(influencers.length, orgNodes.length, referralNodes.length) * 52 + 80);
  svg.setAttribute("viewBox", `0 0 820 ${height}`);

  const infPositions = new Map();
  const orgPositions = new Map();
  const refPositions = new Map();

  influencers.forEach((inf, idx) => {
    const y = Math.round(((idx + 1) / (influencers.length + 1)) * height);
    infPositions.set(String(inf.id), { x: 120, y, data: inf });
  });

  orgNodes.forEach((org, idx) => {
    const y = Math.round(((idx + 1) / (orgNodes.length + 1)) * height);
    orgPositions.set(org.name, { x: 410, y, data: org });
  });

  referralNodes.forEach((ref, idx) => {
    const y = Math.round(((idx + 1) / (referralNodes.length + 1)) * height);
    refPositions.set(String(ref.id), { x: 690, y, data: ref });
  });

  let svgHtml = "";

  // Render Referral Links (Edges)
  edges.forEach(edge => {
    const from = edge.fromType === "influencer" ? infPositions.get(edge.fromId) : orgPositions.get(edge.fromId);
    const to = edge.toType === "org" ? orgPositions.get(edge.toId) : refPositions.get(edge.toId);
    if (!from || !to) return;
    const stroke = edge.status === "taken" ? "#0d9488" : edge.status === "scheduled" ? "#2563eb" : "#94a3b8";
    const dash = edge.status === "pending" ? `stroke-dasharray="4 3"` : "";
    const midX = Math.round((from.x + to.x) / 2);
    svgHtml += `<path d="M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}" fill="none" stroke="${stroke}" stroke-width="1.75" opacity="0.65" ${dash} />`;
  });

  // Render Influencer Nodes
  infPositions.forEach((pos, id) => {
    const inf = pos.data;
    const summary = typeof getInfluencerEarningsSummary === "function" ? getInfluencerEarningsSummary(inf) : null;
    const pts = summary ? summary.totalCredits : (inf.referralCredits || 0);
    svgHtml += `
      <g style="cursor: pointer;" onclick="inspectGraphNode('influencer', '${escapePartnerHTML(id)}')">
        <circle cx="${pos.x}" cy="${pos.y}" r="18" fill="#0d9488" stroke="#ffffff" stroke-width="2.5"></circle>
        <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700">${escapePartnerHTML((inf.fullName || "P").split(/\s+/).map(p => p[0]).slice(0, 2).join(""))}</text>
        <text x="${pos.x}" y="${pos.y + 32}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">${escapePartnerHTML(inf.fullName)}</text>
        <text x="${pos.x}" y="${pos.y + 44}" text-anchor="middle" fill="#0d9488" font-size="10" font-weight="600">${pts} pts</text>
      </g>
    `;
  });

  // Render Organization Nodes
  orgPositions.forEach((pos, orgName) => {
    const org = pos.data;
    const safeKey = encodeURIComponent(orgName);
    svgHtml += `
      <g style="cursor: pointer;" onclick="inspectGraphNode('org', '${safeKey}')">
        <rect x="${pos.x - 68}" y="${pos.y - 16}" width="136" height="32" rx="6" fill="#1e293b" stroke="#ffffff" stroke-width="2"></rect>
        <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="#ffffff" font-size="10.5" font-weight="600">${escapePartnerHTML(orgName.length > 20 ? orgName.slice(0, 18) + "…" : orgName)}</text>
        <text x="${pos.x}" y="${pos.y + 28}" text-anchor="middle" fill="#475569" font-size="9.5">${org.contacts.length} referral${org.contacts.length === 1 ? "" : "s"}</text>
      </g>
    `;
  });

  // Render Referred Contact Nodes
  refPositions.forEach((pos, id) => {
    const ref = pos.data;
    const fill = ref.hasTakenCall ? "#059669" : ref.hasScheduledCall ? "#2563eb" : "#64748b";
    svgHtml += `
      <g style="cursor: pointer;" onclick="inspectGraphNode('contact', '${escapePartnerHTML(id)}')">
        <circle cx="${pos.x}" cy="${pos.y}" r="13" fill="${fill}" stroke="#ffffff" stroke-width="2"></circle>
        <text x="${pos.x - 18}" y="${pos.y + 4}" text-anchor="end" fill="#0f172a" font-size="10.5" font-weight="600">${escapePartnerHTML(ref.fullName)}</text>
      </g>
    `;
  });

  if (!svgHtml) {
    svgHtml = `<text x="410" y="240" text-anchor="middle" fill="#64748b" font-size="13">No referral relationships match the selected filter.</text>`;
  }

  svg.innerHTML = svgHtml;
}

function inspectGraphNode(nodeType, nodeKey) {
  const inspector = document.getElementById("relationship-graph-inspector");
  if (!inspector) return;

  if (nodeType === "influencer") {
    const inf = (database.contacts || []).find(c => String(c.id) === String(nodeKey));
    if (!inf) return;
    const summary = typeof getInfluencerEarningsSummary === "function" ? getInfluencerEarningsSummary(inf) : null;
    const refs = getInfluencerReferralsList(inf);
    const orgs = new Set(refs.map(r => r.company).filter(Boolean));
    inspector.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div>
          <span class="badge" style="background: rgba(13, 148, 136, 0.15); color: #0d9488; font-size: 10px;">Influencer Partner</span>
          <h4 style="margin: 4px 0 2px 0; color: var(--color-text-primary);">${escapePartnerHTML(inf.fullName)}</h4>
          <div style="font-size: 11.5px; color: var(--color-text-secondary);">${escapePartnerHTML(inf.jobTitle || "Advisor")} · ${escapePartnerHTML(inf.company || "")}</div>
        </div>
        <div style="padding: 0.6rem; background: var(--surface-card); border: 1px solid var(--color-border); border-radius: var(--radius-xs); font-size: 11.5px;">
          <div><strong>Referred Contacts:</strong> ${refs.length}</div>
          <div><strong>Organizations Reached:</strong> ${orgs.size}</div>
          <div><strong>Total Partner Credits:</strong> <span style="color: #0d9488; font-weight: 700;">${summary ? summary.totalCredits : (inf.referralCredits || 0)} pts</span></div>
          <div><strong>Agreements Attached:</strong> ${(inf.agreements || []).length}</div>
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-xs" onclick="closeRelationshipGraphModal(); openInfluencerPortal('${escapePartnerHTML(inf.email)}')">Open Portal</button>
          <button type="button" class="btn btn-secondary btn-xs" onclick="closeRelationshipGraphModal(); openInfluencerEarningsModal('${escapePartnerHTML(inf.id)}')">Earnings</button>
          <button type="button" class="btn btn-secondary btn-xs" onclick="closeRelationshipGraphModal(); openInfluencerAgreementsModal('${escapePartnerHTML(inf.id)}')">Agreements</button>
        </div>
      </div>
    `;
  } else if (nodeType === "org") {
    const orgName = decodeURIComponent(nodeKey);
    const contacts = (database.contacts || []).filter(c => !c.isInfluencer && String(c.company || "").trim() === orgName);
    const influencers = Array.from(new Set(contacts.map(c => c.referredBy).filter(Boolean)));
    inspector.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div>
          <span class="badge" style="background: #1e293b; color: #ffffff; font-size: 10px;">Organization Node</span>
          <h4 style="margin: 4px 0 2px 0; color: var(--color-text-primary);">${escapePartnerHTML(orgName)}</h4>
        </div>
        <div style="padding: 0.6rem; background: var(--surface-card); border: 1px solid var(--color-border); border-radius: var(--radius-xs); font-size: 11.5px;">
          <div><strong>Contacts in Account:</strong> ${contacts.length}</div>
          <div><strong>Referring Influencers:</strong> ${influencers.length ? escapePartnerHTML(influencers.join(", ")) : "Direct"}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.35rem;">
          ${contacts.map(c => `
            <div style="padding: 0.45rem 0.6rem; background: var(--surface-card); border: 1px solid var(--color-border); border-radius: var(--radius-xs); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 11.5px; color: var(--color-text-primary);">${escapePartnerHTML(c.fullName)}</div>
                <div style="font-size: 10.5px; color: var(--color-text-secondary);">${escapePartnerHTML(c.jobTitle || "")}</div>
              </div>
              <button type="button" class="btn btn-primary btn-xs" onclick="closeRelationshipGraphModal(); openOutboundModal(${c.id}, 'email')">Outreach</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  } else if (nodeType === "contact") {
    const contact = (database.contacts || []).find(c => String(c.id) === String(nodeKey));
    if (!contact) return;
    const pts = typeof computeContactReferralCredits === "function" ? computeContactReferralCredits(contact) : (contact.hasTakenCall ? 25 : contact.hasScheduledCall ? 15 : 10);
    inspector.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div>
          <span class="badge" style="font-size: 10px;">Referred Prospect</span>
          <h4 style="margin: 4px 0 2px 0; color: var(--color-text-primary);">${escapePartnerHTML(contact.fullName)}</h4>
          <div style="font-size: 11.5px; color: var(--color-text-secondary);">${escapePartnerHTML(contact.jobTitle || "")} · ${escapePartnerHTML(contact.company || "")}</div>
        </div>
        <div style="padding: 0.6rem; background: var(--surface-card); border: 1px solid var(--color-border); border-radius: var(--radius-xs); font-size: 11.5px;">
          <div><strong>Referred By:</strong> ${escapePartnerHTML(contact.referredBy || "Direct")}</div>
          <div><strong>Call Status:</strong> ${contact.hasTakenCall ? "Call Completed" : contact.hasScheduledCall ? "Call Scheduled" : "Pending Outreach"}</div>
          <div><strong>Credits Generated:</strong> +${pts} pts</div>
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-xs" onclick="closeRelationshipGraphModal(); openOutboundModal(${contact.id}, 'email')">Email</button>
          <button type="button" class="btn btn-secondary btn-xs" onclick="closeRelationshipGraphModal(); openOutboundModal(${contact.id}, 'linkedin')">LinkedIn</button>
          <button type="button" class="btn btn-secondary btn-xs" onclick="closeRelationshipGraphModal(); openOutboundModal(${contact.id}, 'call')">Call</button>
        </div>
      </div>
    `;
  }
}

window.renderInfluencersTable = renderInfluencersTable;
window.selectConsolePortalInfluencer = selectConsolePortalInfluencer;
window.renderConsolePortalReferrals = renderConsolePortalReferrals;
window.toggleReferralCallStatus = toggleReferralCallStatus;
window.submitConsolePortalReferral = submitConsolePortalReferral;
window.openCurrentInfluencerStandalonePortal = openCurrentInfluencerStandalonePortal;
window.copyCurrentInfluencerWorkspaceLink = copyCurrentInfluencerWorkspaceLink;
window.createCurrentInfluencerShareLink = createCurrentInfluencerShareLink;
window.revokeCurrentInfluencerShareLink = revokeCurrentInfluencerShareLink;
window.importContactsForCurrentInfluencer = importContactsForCurrentInfluencer;
window.downloadPartnerReportData = downloadPartnerReportData;
window.openPartnerContactEditor = openPartnerContactEditor;
window.closePartnerContactEditor = closePartnerContactEditor;
window.savePartnerContactEdit = savePartnerContactEdit;
window.deletePartnerContact = deletePartnerContact;
window.openPartnerProfileEditor = openPartnerProfileEditor;
window.openPartnerProfileEditorById = openPartnerProfileEditorById;
window.closePartnerProfileEditor = closePartnerProfileEditor;
window.savePartnerProfile = savePartnerProfile;
window.deletePartnerProfile = deletePartnerProfile;
window.toggleInfluencerReferralForm = toggleInfluencerReferralForm;
window.switchPartnerEntryMode = switchPartnerEntryMode;
window.toggleBulkReferralEditor = toggleBulkReferralEditor;
window.addPartnerBulkRows = addPartnerBulkRows;
window.removePartnerBulkRow = removePartnerBulkRow;
window.resetPartnerBulkEditorRows = resetPartnerBulkEditorRows;
window.loadExistingReferralsIntoBulkEditor = loadExistingReferralsIntoBulkEditor;
window.togglePartnerBulkPasteBox = togglePartnerBulkPasteBox;
window.applyPartnerBulkPaste = applyPartnerBulkPaste;
window.submitPartnerBulkRecords = submitPartnerBulkRecords;
window.togglePartnerTableMultiEdit = togglePartnerTableMultiEdit;
window.savePartnerTableMultiEdit = savePartnerTableMultiEdit;
window.toggleInfluencerStatus = toggleInfluencerStatus;
window.openAddReferralModal = openAddReferralModal;
window.openAddInfluencerModal = openAddInfluencerModal;
window.closeAddInfluencerModal = closeAddInfluencerModal;
window.handleManualInfluencerSubmit = handleManualInfluencerSubmit;
window.selectPortalReferralContact = selectPortalReferralContact;
window.openPortalContactOutreach = openPortalContactOutreach;
window.renderPortalContactStatusPanel = renderPortalContactStatusPanel;
window.openOutboundActionModal = openPortalContactOutreach;
window.openInfluencerEarningsModal = openInfluencerEarningsModal;
window.closeInfluencerEarningsModal = closeInfluencerEarningsModal;
window.openInfluencerAgreementsModal = openInfluencerAgreementsModal;
window.closeInfluencerAgreementsModal = closeInfluencerAgreementsModal;
window.prefillAgreementTitleFromFile = prefillAgreementTitleFromFile;
window.handleAttachInfluencerAgreement = handleAttachInfluencerAgreement;
window.downloadInfluencerAgreement = downloadInfluencerAgreement;
window.deleteInfluencerAgreement = deleteInfluencerAgreement;
window.openBulkAddInfluencerModal = openBulkAddInfluencerModal;
window.closeBulkAddInfluencerModal = closeBulkAddInfluencerModal;
window.addBulkInfluencerGridRows = addBulkInfluencerGridRows;
window.resetBulkInfluencerGridRows = resetBulkInfluencerGridRows;
window.removeBulkInfluencerGridRow = removeBulkInfluencerGridRow;
window.parseBulkInfluencerPaste = parseBulkInfluencerPaste;
window.submitBulkInfluencerOnboarding = submitBulkInfluencerOnboarding;
window.openRelationshipGraphModal = openRelationshipGraphModal;
window.closeRelationshipGraphModal = closeRelationshipGraphModal;
window.renderRelationshipGraph = renderRelationshipGraph;
window.inspectGraphNode = inspectGraphNode;
