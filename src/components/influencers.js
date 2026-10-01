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
  if (enrichedEl) enrichedEl.textContent = referrals.filter(r => r.enriched).length;
  if (conversionEl) conversionEl.textContent = `${pct}%`;
  if (formPartnerEl) formPartnerEl.textContent = activeInf.fullName;
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

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No referred contacts match the current filter.</td></tr>`;
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
  const trigger = document.querySelector(".partner-ledger-tools [aria-controls='partner-referral-form']");
  if (!form) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : form.hidden;
  form.hidden = !shouldOpen;
  trigger?.setAttribute("aria-expanded", String(shouldOpen));
  if (!shouldOpen) {
    const feedback = document.getElementById("console-portal-feedback");
    if (feedback) { feedback.hidden = true; feedback.style.display = "none"; }
  }
  if (shouldOpen) document.getElementById("console-portal-ref-name")?.focus();
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
window.toggleInfluencerStatus = toggleInfluencerStatus;
window.openAddReferralModal = openAddReferralModal;
