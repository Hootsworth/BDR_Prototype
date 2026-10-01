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
        return `<option value="${val}" ${selected}>${inf.fullName} — ${inf.company || 'Advisory'} (${calls}/${refs.length} calls)</option>`;
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
    if (c.isInfluencer) return false;
    const refBy = (c.referredBy || "").toLowerCase();
    const refEmail = (c.referredByEmail || "").toLowerCase();
    const influencerEmail = (c.influencerEmail || "").toLowerCase();
    return (infNameLower && refBy === infNameLower) || (infEmailLower && (refEmail === infEmailLower || influencerEmail === infEmailLower));
  });
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
          <div style="font-weight: 700; color: var(--color-text-primary);">${r.fullName}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${r.email || ""}</div>
          ${referredDate ? `<div style="font-size: 10px; color: var(--color-text-secondary);">Referred ${referredDate}</div>` : ""}
        </td>
        <td>
          <div style="font-weight: 600; font-size: 12.5px;">${r.company || "Credit Union"}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${r.jobTitle || "Executive"}</div>
          ${r.portalNotes ? `<div style="max-width: 260px; margin-top: 4px; color: var(--color-text-secondary); font-size: 10px; line-height: 1.4;">${r.portalNotes}</div>` : ""}
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

  if (typeof markWorkbookDirty === "function") markWorkbookDirty();
  if (typeof saveLocalWorkbookState === "function") saveLocalWorkbookState();
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

    // Also update local in-memory state immediately
    if (data.contact) {
      const existingIdx = database.contacts.findIndex(c => (c.email || "").toLowerCase() === email.toLowerCase());
      if (existingIdx >= 0) {
        database.contacts[existingIdx] = data.contact;
      } else {
        database.contacts.push(data.contact);
      }
    }
    if (!Array.isArray(activeInf.referrals)) activeInf.referrals = [];
    if (!activeInf.referrals.some(r => (r.name || "").toLowerCase() === fullName.toLowerCase())) {
      activeInf.referrals.push({
        name: fullName,
        email,
        company,
        title: jobTitle,
        date: new Date().toISOString().slice(0, 10),
        hasTakenCall,
        hasScheduledCall
      });
    }
    activeInf.referralCredits = (activeInf.referralCredits || 0) + (hasTakenCall ? 25 : 10);

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
  const email = activeConsolePortalInfluencerEmail || "";
  const url = new URL("/", window.location.origin);
  url.searchParams.set("tab", "influencers");
  if (email) url.searchParams.set("email", email);
  const writePromise = navigator.clipboard?.writeText?.(url.toString());
  if (!writePromise) {
    window.prompt("Copy this partner workspace link", url.toString());
    return;
  }
  writePromise.then(() => {
    const button = document.querySelector(".partner-header-controls .btn");
    if (!button) return;
    const label = button.textContent;
    button.textContent = "Link copied";
    setTimeout(() => { button.textContent = label; }, 1800);
  }).catch(() => window.prompt("Copy this partner workspace link", url.toString()));
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
window.toggleInfluencerReferralForm = toggleInfluencerReferralForm;
window.toggleInfluencerStatus = toggleInfluencerStatus;
window.openAddReferralModal = openAddReferralModal;
