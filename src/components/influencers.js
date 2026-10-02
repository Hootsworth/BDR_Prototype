// ─── INFLUENCERS & REFERRAL PORTAL CONTROLLER ────────────────────────────────

let activeConsolePortalInfluencerEmail = new URLSearchParams(window.location.search).get("email") || "kim.beluzo@beluzoadvisory.com";

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
  const callsTaken = referrals.filter(r => r.hasTakenCall || r.hasScheduledCall).length;
  const pct = referrals.length > 0 ? Math.round((callsTaken / referrals.length) * 100) : 0;
  const credits = activeInf.referralCredits || (referrals.length * 10 + callsTaken * 15);

  const nameEl = document.getElementById("inf-portal-active-name");
  const companyEl = document.getElementById("inf-portal-active-company");
  const refKpiEl = document.getElementById("inf-portal-kpi-referrals");
  const callKpiEl = document.getElementById("inf-portal-kpi-calls");
  const credKpiEl = document.getElementById("inf-portal-kpi-credits");
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

  const subtitleEl = document.getElementById("inf-portal-table-subtitle");
  if (subtitleEl) subtitleEl.textContent = `Showing ${filtered.length} of ${referrals.length} introductions. Update a status or engage a contact.`;

  const inlineBar = document.getElementById("partner-inline-multi-edit-bar");
  if (inlineBar) inlineBar.hidden = !window.isPartnerTableMultiEditMode;
  const inlineBtn = document.getElementById("btn-toggle-table-multi-edit");
  if (inlineBtn) {
    inlineBtn.textContent = window.isPartnerTableMultiEditMode ? "Exit inline edit" : "Edit table inline";
    inlineBtn.classList.toggle("btn-primary", Boolean(window.isPartnerTableMultiEditMode));
    inlineBtn.classList.toggle("btn-secondary", !window.isPartnerTableMultiEditMode);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No referred contacts match the current filter.</td></tr>`;
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
            </div>
          </td>
          <td>
            <div class="partner-inline-cell-stack">
              <input type="text" class="partner-grid-input" data-field="company" value="${escapePartnerHTML(r.company || "")}" placeholder="Company" required>
              <input type="text" class="partner-grid-input" data-field="jobTitle" value="${escapePartnerHTML(r.jobTitle || "")}" placeholder="Job title">
            </div>
          </td>
          <td>
            <div class="partner-inline-cell-stack">
              <select class="partner-grid-select" data-field="status">
                <option value="completed" ${statusVal === "completed" ? "selected" : ""}>Call completed</option>
                <option value="scheduled" ${statusVal === "scheduled" ? "selected" : ""}>Call scheduled</option>
                <option value="pending" ${statusVal === "pending" ? "selected" : ""}>Pending outreach</option>
              </select>
              <input type="tel" class="partner-grid-input" data-field="phone" value="${escapePartnerHTML(r.phone || "")}" placeholder="Phone">
            </div>
          </td>
          <td>
            <div class="partner-inline-cell-stack">
              <input type="text" class="partner-grid-input" data-field="location" value="${escapePartnerHTML(r.location || "")}" placeholder="Location">
              <input type="text" class="partner-grid-input" data-field="notes" value="${escapePartnerHTML(r.portalNotes || "")}" placeholder="Internal notes">
            </div>
          </td>
          <td style="text-align: right; white-space: nowrap; vertical-align: middle;">
            <button class="btn btn-sm btn-secondary" type="button" onclick="deletePartnerContact('${escapePartnerHTML(r.id)}')" style="font-size: 11px; padding: 4px 8px;">Remove</button>
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
    const referredDate = r.referredDate || r.date || referralEntry?.date || "";
    const hasCall = Boolean(r.hasTakenCall || r.hasScheduledCall);
    const callBadge = r.hasTakenCall
      ? `<span class="badge badge-success">Call completed</span>`
      : r.hasScheduledCall
        ? `<span class="badge badge-primary">Call scheduled</span>`
        : `<span class="badge badge-neutral">Pending outreach</span>`;

    const ch = [];
    if (r.emailsSent || r.emailSent) ch.push(`<span class="badge badge-primary" style="font-size: 10px;">Email</span>`);
    if (r.linkedinSent) ch.push(`<span class="badge badge-secondary" style="font-size: 10px;">LinkedIn</span>`);
    if (r.enriched) ch.push(`<span class="badge badge-success" style="font-size: 10px;">Enriched</span>`);

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-text-primary);">${escapePartnerHTML(r.fullName)}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(r.email || "")}</div>
          ${referredDate ? `<div style="font-size: 10px; color: var(--color-text-secondary);">Referred ${escapePartnerHTML(referredDate)}</div>` : ""}
        </td>
        <td>
          <div style="font-weight: 600; font-size: 12.5px;">${escapePartnerHTML(r.company || "Credit Union")}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(r.jobTitle || "Executive")}</div>
          ${r.portalNotes ? `<div style="max-width: 260px; margin-top: 4px; color: var(--color-text-secondary); font-size: 10px; line-height: 1.4;">${escapePartnerHTML(r.portalNotes)}</div>` : ""}
        </td>
        <td>${callBadge}</td>
        <td>${ch.length ? ch.join(" ") : `<span style="font-size: 11px; color: var(--color-text-secondary);">Ready</span>`}</td>
    <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-sm btn-secondary" onclick="toggleReferralCallStatus(${idx})" style="font-size: 11px; padding: 3px 8px;">
            ${hasCall ? "Mark Pending" : "Mark Call Taken"}
          </button>
          <button class="btn btn-sm btn-primary" onclick="switchTab('campaign-outbound'); openOutboundActionModal(${idx}, 'email')" style="font-size: 11px; padding: 3px 8px;">
            Engage
          </button>
          <button class="btn btn-sm btn-secondary" onclick="openPartnerContactEditor('${escapePartnerHTML(r.id)}')" style="font-size: 11px; padding: 3px 8px;">Edit</button>
          <button class="btn btn-sm btn-secondary" onclick="deletePartnerContact('${escapePartnerHTML(r.id)}')" style="font-size: 11px; padding: 3px 8px;">Remove</button>
        </td>
      </tr>
    `;
  }).join("");
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
        location: document.getElementById("console-portal-ref-location")?.value.trim() || "",
        credits: hasTakenCall ? 25 : 10,
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
  const contact = {
    fullName: document.getElementById('partner-edit-name').value.trim(),
    email: document.getElementById('partner-edit-email').value.trim(),
    company: document.getElementById('partner-edit-company').value.trim(),
    jobTitle: document.getElementById('partner-edit-title').value.trim(),
    phone: document.getElementById('partner-edit-phone').value.trim(),
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

function openPartnerProfileEditor(isNew = false) {
  const partner = isNew ? null : currentPartner();
  document.getElementById('partner-profile-dialog-title').textContent = isNew ? 'Add partner' : 'Edit partner';
  document.getElementById('partner-profile-id').value = partner?.id || '';
  document.getElementById('partner-profile-name').value = partner?.fullName || '';
  document.getElementById('partner-profile-email').value = partner?.email || '';
  document.getElementById('partner-profile-company').value = partner?.company || '';
  document.getElementById('partner-profile-title').value = partner?.jobTitle || '';
  document.getElementById('partner-profile-phone').value = partner?.phone || '';
  document.getElementById('partner-profile-location').value = partner?.location || '';
  document.getElementById('partner-profile-delete').hidden = isNew;
  document.getElementById('partner-profile-feedback').textContent = '';
  const dialog = document.getElementById('partner-profile-dialog');
  if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
}

function closePartnerProfileEditor() {
  const dialog = document.getElementById('partner-profile-dialog');
  if (dialog?.close) dialog.close(); else dialog?.removeAttribute('open');
}

async function savePartnerProfile() {
  const id = document.getElementById('partner-profile-id').value;
  const profile = {
    fullName: document.getElementById('partner-profile-name').value.trim(),
    email: document.getElementById('partner-profile-email').value.trim(),
    company: document.getElementById('partner-profile-company').value.trim(),
    jobTitle: document.getElementById('partner-profile-title').value.trim(),
    phone: document.getElementById('partner-profile-phone').value.trim(),
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
