// --- OMNICHANNEL OUTBOUND CAMPAIGN CONTROLLER ---

function updateOutboundHeaderMetrics() {
  const kpiInfluencers = document.getElementById("outbound-kpi-influencers");
  const kpiProspects = document.getElementById("outbound-kpi-prospects");
  const kpiAffiliated = document.getElementById("outbound-kpi-affiliated");
  const kpiDispatched = document.getElementById("outbound-kpi-dispatched");
  const kpiMeetings = document.getElementById("outbound-kpi-meetings");

  const tabCountInf = document.getElementById("outbound-tab-count-influencers");
  const tabCountPros = document.getElementById("outbound-tab-count-prospects");
  const tabCountSched = document.getElementById("outbound-tab-count-schedule");

  const contacts = database.contacts || [];
  const influencers = contacts.filter(c => c.isInfluencer === true);
  const prospects = contacts.filter(c => !c.isInfluencer);
  const affiliated = prospects.filter(p => p.referredBy || p.influencerId);
  const emailsSent = contacts.filter(c => c.emailsSent).length;
  const linkedinSent = contacts.filter(c => c.linkedinSent).length;
  const dispatched = Math.max(emailsSent + linkedinSent, (database.stats?.emailsSent || 0) + (database.stats?.linkedinSent || 0));
  const meetings = (database.meetings || []).length;

  if (kpiInfluencers) kpiInfluencers.textContent = influencers.length.toLocaleString();
  if (kpiProspects) kpiProspects.textContent = prospects.length.toLocaleString();
  if (kpiAffiliated) kpiAffiliated.textContent = `(${affiliated.length.toLocaleString()} affiliated)`;
  if (kpiDispatched) kpiDispatched.textContent = dispatched.toLocaleString();
  if (kpiMeetings) kpiMeetings.textContent = meetings.toLocaleString();

  if (tabCountInf) tabCountInf.textContent = influencers.length;
  if (tabCountPros) tabCountPros.textContent = prospects.length;
  if (tabCountSched) tabCountSched.textContent = meetings;
}

function ensureCalendlyBookingLink(body) {
  const text = String(body || "").trim();
  const url = typeof getCustomerCalendlyUrl === "function"
    ? getCustomerCalendlyUrl()
    : (database.calendlyUrl || "");
  if (!url || text.includes(url)) return text;
  return `${text}${text ? "\n\n" : ""}If a brief conversation would be useful, you can choose a time here: ${url}`;
}
window.ensureCalendlyBookingLink = ensureCalendlyBookingLink;
window.updateOutboundHeaderMetrics = updateOutboundHeaderMetrics;

function openInfluencerPortal(email) {
  if (typeof openInfluencerPortalForContact === "function") {
    openInfluencerPortalForContact(email);
    return;
  }
  if (email && typeof activeConsolePortalInfluencerEmail !== "undefined") {
    activeConsolePortalInfluencerEmail = email;
  }
  // [PARTNERS TAB DISCONNECTED]: Redirect to dashboard
  switchTab("dashboard");
}
window.openInfluencerPortal = openInfluencerPortal;

function toggleExpandInfluencerReferrals(infId) {
  database.expandedInfluencerRows = database.expandedInfluencerRows || {};
  const current = database.expandedInfluencerRows[infId] !== undefined ? database.expandedInfluencerRows[infId] : true;
  database.expandedInfluencerRows[infId] = !current;
  changeOutboundPage(database.currentOutboundPage || 1);
}
window.toggleExpandInfluencerReferrals = toggleExpandInfluencerReferrals;

function switchOutboundSubtab(subtab) {
  database.currentOutboundSubtab = subtab;
  
  const btnProspects = document.getElementById("outbound-subtab-prospects");
  const btnInfluencers = document.getElementById("outbound-subtab-influencers");
  const btnSchedule = document.getElementById("outbound-subtab-schedule");
  const tableContainer = document.getElementById("outbound-table-container");
  const scheduleContainer = document.getElementById("outbound-schedule-container");
  const searchInput = document.getElementById("outbound-search-input");
  
  // Reset all buttons
  if (btnProspects) { btnProspects.className = "btn btn-secondary btn-sm outbound-view-tab"; }
  if (btnInfluencers) { btnInfluencers.className = "btn btn-secondary btn-sm outbound-view-tab"; }
  if (btnSchedule) { btnSchedule.className = "btn btn-secondary btn-sm outbound-view-tab"; }
  
  if (subtab === 'schedule') {
    if (btnSchedule) btnSchedule.className = "btn btn-secondary btn-sm outbound-view-tab is-active";
    if (tableContainer) tableContainer.style.display = "none";
    if (scheduleContainer) scheduleContainer.style.display = "block";
    if (searchInput && searchInput.parentElement) searchInput.parentElement.style.display = "none";
    // Render the calendar when schedule tab is opened
    if (typeof renderScheduleMeetings === "function") renderScheduleMeetings();
    if (typeof renderCalendar === "function") renderCalendar();
  } else {
    if (subtab === 'prospects') {
      if (btnProspects) btnProspects.className = "btn btn-secondary btn-sm outbound-view-tab is-active";
    } else {
      if (btnInfluencers) btnInfluencers.className = "btn btn-secondary btn-sm outbound-view-tab is-active";
    }
    if (tableContainer) tableContainer.style.display = "block";
    if (scheduleContainer) scheduleContainer.style.display = "none";
    if (searchInput && searchInput.parentElement) searchInput.parentElement.style.display = "";
    filterOutboundTable();
  }
  updateOutboundHeaderMetrics();
}

function filterOutboundTable() {
  const isInfluencer = (database.currentOutboundSubtab === 'influencers');
  const targetList = database.contacts.filter(c => c.isInfluencer === isInfluencer);
  database.filteredOutbound = getFilteredData(targetList, "outbound-search-input", null, null, null, null);
  changeOutboundPage(1);
  updateOutboundHeaderMetrics();
}

function changeOutboundPage(page) {
  database.currentOutboundPage = page;
  const pageData = paginateData(database.filteredOutbound, page, "outbound-pagination", "changeOutboundPage");

  const tbody = document.getElementById("table-campaign-outbound-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const isInfluencersTab = (database.currentOutboundSubtab === 'influencers');

  if (pageData.length === 0) {
    const emptyIcon = isInfluencersTab
      ? `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; opacity: 0.6;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
      : `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; opacity: 0.6;"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"></path></svg>`;
    const emptyTitle = isInfluencersTab ? "No Influencer Partners Found" : "No Prospects Available";
    const emptyDesc = isInfluencersTab
      ? "Enroll influencer advocates to build referral networks and generate warm introductions."
      : "Import contacts or add prospects affiliated with your influencer network.";

    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 3rem 1.5rem; color: var(--color-text-secondary);">
          ${emptyIcon}
          <div style="font-size: var(--font-size-base); font-weight: 600; color: var(--color-text-primary); margin-bottom: 0.25rem;">${emptyTitle}</div>
          <p style="font-size: var(--font-size-xs); color: var(--color-text-secondary); margin: 0 0 1.25rem 0;">${emptyDesc}</p>
          <button class="btn btn-primary btn-sm" onclick="openImportContactsTab('csv')">Import</button>
        </td>
      </tr>
    `;
    updateOutboundHeaderMetrics();
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");
    const isChecked = database.selectedOutboundRows && database.selectedOutboundRows.includes(c.id) ? "checked" : "";

    const badgeClass = c.leadTemp === "Hot Lead" ? "badge-success" : "badge";
    const emailStatus = c.emailsSent 
      ? `<span style="color:var(--color-success); font-weight:600; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Sent</span>` 
      : (c.emailDraft ? `<span class="badge" style="background: rgba(217, 119, 6, 0.15); color: #d97706; font-size: 10px;">Drafted</span>` : `<span style="color:var(--color-text-disabled); font-size: 11px;">Pending</span>`);
    const linkedinStatus = c.linkedinSent 
      ? `<span style="color:var(--color-success); font-weight:600; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Sent</span>` 
      : (c.linkedinDraft ? `<span class="badge" style="background: rgba(217, 119, 6, 0.15); color: #d97706; font-size: 10px;">Drafted</span>` : `<span style="color:var(--color-text-disabled); font-size: 11px;">Pending</span>`);
    
    const hasTaken = Boolean(c.hasTakenCall || (c.callsMade && c.callsMade.some(call => (call.outcome || "").toLowerCase().includes("taken") || call.status === "taken")));
    let callStatus = `<span style="color:var(--color-text-disabled); font-size: 11px;">Pending Call</span>`;
    if (hasTaken) {
      callStatus = `<span class="badge badge-success" style="font-size: 10.5px; display: inline-flex; align-items: center; gap: 3px;">✓ Call Taken</span>`;
    } else if (c.callsMade && c.callsMade.length > 0) {
      callStatus = `<span style="color:var(--color-success); font-weight:600;">${c.callsMade.length} calls</span>`;
    }

    const avatarHtml = `
      <div style="width: 32px; height: 32px; border-radius: 50%; background: ${getAvatarColor(c.fullName)}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;">
        ${getInitials(c.fullName)}
      </div>
    `;

    if (isInfluencersTab) {
      const isExpanded = database.expandedInfluencerRows && database.expandedInfluencerRows[c.id] !== undefined 
        ? Boolean(database.expandedInfluencerRows[c.id]) 
        : true;
      const affiliated = (database.contacts || []).filter(p => !p.isInfluencer && (
        (p.referredBy && p.referredBy.trim().toLowerCase() === c.fullName.trim().toLowerCase()) ||
        (p.referredByEmail && String(c.email || '').trim() && p.referredByEmail.trim().toLowerCase() === String(c.email).trim().toLowerCase()) ||
        (p.influencerId && String(p.influencerId) === String(c.id)) ||
        (p.influencerEmail && String(c.email || '').trim() && String(p.influencerEmail).trim().toLowerCase() === String(c.email).trim().toLowerCase()) ||
        (c.referrals && c.referrals.some(r => (r.email && p.email && r.email.trim().toLowerCase() === p.email.trim().toLowerCase()) || (r.fullName && p.fullName && r.fullName.trim().toLowerCase() === p.fullName.trim().toLowerCase())))
      ));
      const agreementsCount = Array.isArray(c.agreements) ? c.agreements.length : 0;
      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="row-check-outbound" data-id="${c.id}" ${isChecked} onchange="toggleSelectOutboundRow(this, ${c.id})" style="cursor:pointer; width:15px; height:15px;"></td>
        <td>
          <div style="display: flex; align-items: flex-start; gap: 0.625rem;">
            ${avatarHtml}
            <div>
              <strong>${escapePartnerHTML(c.fullName)}</strong>
              <div style="display: flex; gap: 0.375rem; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                <span class="badge" style="font-size: 10px; background: rgba(99, 102, 241, 0.12); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.25);">Partner</span>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 500; color: var(--color-text-primary);">${c.jobTitle || "Industry Advisor"}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${c.company || "Advisory Network"}</div>
        </td>
        <td><span class="badge ${badgeClass}">${c.leadTemp || "Influencer Partner"}</span></td>
        <td>${emailStatus}</td>
        <td>${linkedinStatus}</td>
        <td>${callStatus}</td>
        <td class="influencer-row-actions-cell">
          <div class="influencer-row-actions">
            <button class="btn btn-primary btn-sm" onclick="openInfluencerPortal('${escapePartnerHTML(c.email)}')">Open portal</button>
            <details class="influencer-row-more">
              <summary class="btn btn-secondary btn-sm" aria-label="More actions for ${escapePartnerHTML(c.fullName)}">More <span aria-hidden="true">⌄</span></summary>
              <div class="influencer-row-more-menu" role="group" aria-label="Partner actions">
                <button type="button" onclick="openOutboundModal(${c.id}, 'email'); this.closest('details').open = false">Start outreach</button>
                <button type="button" onclick="openAddProspectForInfluencer(${c.id}); this.closest('details').open = false">Add referral</button>
                <button type="button" onclick="openInfluencerEarningsModal(${c.id}); this.closest('details').open = false">Earnings &amp; credits</button>
                <button type="button" onclick="openInfluencerAgreementsModal(${c.id}); this.closest('details').open = false">Agreements (${agreementsCount})</button>
                ${affiliated.length ? `<button type="button" onclick="toggleExpandInfluencerReferrals(${c.id}); this.closest('details').open = false">${isExpanded ? 'Hide' : 'Show'} ${affiliated.length} referrals</button>` : ''}
                <button type="button" onclick="openPartnerProfileEditorById(${c.id}); this.closest('details').open = false">Edit partner</button>
                <button type="button" class="danger" onclick="deletePartnerProfile('${escapePartnerHTML(c.id)}'); this.closest('details').open = false">Delete partner</button>
              </div>
            </details>
          </div>
        </td>
      `;
      tbody.appendChild(tr);

      // Render affiliated prospects container for this influencer
      const subTr = document.createElement("tr");
      subTr.className = "influencer-affiliated-row";

      let affiliatedContent = "";
      if (affiliated.length === 0) {
        affiliatedContent = `
          <div style="background: var(--color-background-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="font-size: 12px; color: var(--color-text-primary);">No Affiliated Prospects Yet</strong>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: var(--color-text-secondary);">Add prospects referred by ${escapePartnerHTML(c.fullName)} to coordinate intro outreach and award partner credits.</p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="openAddProspectForInfluencer(${c.id})" style="font-size: 11px;">+ Add Referred Prospect</button>
            </div>
          </div>
        `;
      } else {
        const callsTakenCount = affiliated.filter(p => p.hasTakenCall || (p.callsMade && p.callsMade.length > 0)).length;
        const visibleAffiliated = isExpanded ? affiliated : [];

        const rowsHtml = visibleAffiliated.map(p => {
          const pBadge = p.leadTemp === "Hot Lead" ? "badge-success" : "badge";
          const pEmail = p.email
            ? `<div style="font-size: 11px;"><a href="mailto:${escapePartnerHTML(p.email)}" style="color: var(--color-primary); font-family: var(--font-family-mono); font-weight: 500;">${escapePartnerHTML(p.email)}</a></div>`
            : `<span style="color:var(--color-text-disabled); font-size: 11px;">No email</span>`;
          const pPhone = p.phone
            ? `<div style="font-size: 10.5px; color: var(--color-text-secondary); margin-top: 2px;">📞 ${escapePartnerHTML(p.phone)}</div>`
            : "";
          const pLi = p.linkedinUrl
            ? `<div style="margin-top: 2px;"><a href="${escapePartnerHTML(p.linkedinUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 10.5px; color: #0284c7; display: inline-flex; align-items: center; gap: 3px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>LinkedIn Profile</a></div>`
            : "";
          const pMeeting = p.hasScheduledCall || p.date
            ? `<div style="font-size: 11px; color: #0d9488; font-weight: 600; margin-top: 2px;">📅 Meeting: ${escapePartnerHTML(p.date || 'Scheduled')}</div>`
            : "";
          const pNotes = p.notes
            ? `<div style="font-size: 10.5px; color: var(--color-text-secondary); margin-top: 3px; max-width: 320px; line-height: 1.3;" title="${escapePartnerHTML(p.notes)}"><em>"${escapePartnerHTML(p.notes.slice(0, 90))}${p.notes.length > 90 ? '...' : ''}"</em></div>`
            : "";
          const pCallTaken = p.hasTakenCall || (p.callsMade && p.callsMade.length > 0);
          const pCallBadge = pCallTaken
            ? `<span class="badge badge-success" style="font-size: 10px;">✓ Call Taken</span>`
            : (p.hasScheduledCall ? `<span class="badge" style="font-size: 10px; background: rgba(13, 148, 136, 0.12); color: #0d9488; border: 1px solid rgba(13, 148, 136, 0.25);">Call Scheduled</span>` : `<span style="color:var(--color-text-disabled); font-size: 11px;">Intro Submitted</span>`);

          return `
            <tr style="border-bottom: 1px solid var(--color-border); background: var(--color-background-surface);">
              <td style="padding: 0.6rem 0.875rem;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                  <div style="width: 26px; height: 26px; border-radius: 50%; background: ${getAvatarColor(p.fullName)}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px;">
                    ${getInitials(p.fullName)}
                  </div>
                  <div>
                    <strong style="color: var(--color-text-primary); font-size: 12.5px;">${escapePartnerHTML(p.fullName)}</strong>
                    <span class="badge" style="font-size: 9.5px; margin-left: 4px; vertical-align: middle;">Referred</span>
                    ${pNotes}
                  </div>
                </div>
              </td>
              <td style="padding: 0.6rem 0.875rem;">
                <div style="font-weight: 500; color: var(--color-text-primary); font-size: 12px;">${escapePartnerHTML(p.jobTitle || 'Decision Maker')}</div>
                <div style="font-size: 11px; color: var(--color-text-secondary);">${escapePartnerHTML(p.company || 'Enterprise')}</div>
                ${p.location ? `<div style="font-size: 10px; color: var(--color-text-muted);">📍 ${escapePartnerHTML(p.location)}</div>` : ''}
              </td>
              <td style="padding: 0.6rem 0.875rem;">
                ${pEmail}
                ${pPhone}
                ${pLi}
              </td>
              <td style="padding: 0.6rem 0.875rem;">
                ${pCallBadge}
                ${pMeeting}
              </td>
              <td style="padding: 0.6rem 0.875rem; text-align: right;">
                <button class="btn btn-primary btn-xs" onclick="openOutboundModal(${p.id}, 'email')">Outreach</button>
              </td>
            </tr>
          `;
        }).join("");

        const expandBtnHtml = `
          <button class="btn btn-secondary btn-xs" onclick="toggleExpandInfluencerReferrals(${c.id})" style="font-size: 11px;">
            ${isExpanded ? 'Hide Referrals' : `Show ${affiliated.length} Referrals`}
          </button>
        `;

        affiliatedContent = `
          <div style="background: var(--color-background-surface); border: 1px solid var(--color-border); border-left: 3px solid #0d9488; border-radius: var(--radius-sm); overflow: hidden;">
            <div style="padding: 0.5rem 0.875rem; background: var(--color-background-muted); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 8px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Affiliated Prospects (${affiliated.length})
                <span class="badge badge-success" style="font-size: 10px; text-transform: none;">${callsTakenCount} of ${affiliated.length} Calls Taken (${Math.round((callsTakenCount / affiliated.length) * 100)}%)</span>
                <span style="font-weight: 400; text-transform: none; color: var(--color-text-disabled);">— Referred by ${escapePartnerHTML(c.fullName)}</span>
              </div>
              <div style="display: flex; gap: 0.375rem; align-items: center;">
                ${expandBtnHtml}
              </div>
            </div>
            ${isExpanded ? `
            <table style="width: 100%; border-collapse: collapse; font-size: var(--font-size-xs);">
              <thead>
                <tr style="border-bottom: 1px solid var(--color-border); background: var(--color-background-subtle, rgba(0,0,0,0.02)); color: var(--color-text-secondary); font-size: 11px;">
                  <th style="padding: 0.375rem 0.875rem; text-align: left; font-weight: 600;">Prospect Name &amp; Context</th>
                  <th style="padding: 0.375rem 0.875rem; text-align: left; font-weight: 600;">Role &amp; Company</th>
                  <th style="padding: 0.375rem 0.875rem; text-align: left; font-weight: 600;">Contact Details</th>
                  <th style="padding: 0.375rem 0.875rem; text-align: left; font-weight: 600;">Status &amp; Meeting</th>
                  <th style="padding: 0.375rem 0.875rem; text-align: right; font-weight: 600;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            ` : ''}
          </div>
        `;
      }

      subTr.innerHTML = `
        <td colspan="8" style="padding: 0.375rem 1rem 1rem 2rem; background: var(--color-background-subtle, rgba(0,0,0,0.015));">
          ${affiliatedContent}
        </td>
      `;
      tbody.appendChild(subTr);

    } else {
      // Prospects Tab Row
      const referredBadge = c.referredBy ? `
        <div style="font-size: 11px; color: var(--color-text-secondary); font-weight: 500; display: inline-flex; align-items: center; gap: 3px; margin-top: 2px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
          Referred by: ${c.referredBy}
        </div>` : '';
      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="row-check-outbound" data-id="${c.id}" ${isChecked} onchange="toggleSelectOutboundRow(this, ${c.id})" style="cursor:pointer; width:15px; height:15px;"></td>
        <td>
          <div style="display: flex; align-items: flex-start; gap: 0.625rem;">
            ${avatarHtml}
            <div>
              <strong>${escapePartnerHTML(c.fullName)}</strong>
              ${referredBadge}
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 500; color: var(--color-text-primary);">${c.jobTitle || "Decision Maker"}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">${c.company || "Enterprise"}</div>
        </td>
        <td><span class="badge ${badgeClass}">${c.leadTemp || "Warm Lead"}</span></td>
        <td>${emailStatus}</td>
        <td>${linkedinStatus}</td>
        <td>${callStatus}</td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 0.375rem; justify-content: flex-end; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="convertContactToInfluencer(${c.id}, true)" title="Convert this contact into an Influencer Partner with their own Referral Portal" style="border-color: rgba(99, 102, 241, 0.4); color: #818cf8; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
              Convert to Influencer
            </button>
            <button class="btn btn-primary btn-sm" onclick="openOutboundModal(${c.id}, 'email')">Outreach</button>
            <button class="btn btn-secondary btn-sm" style="color: var(--color-error); padding: 0.25rem 0.5rem;" onclick="deleteContactRecord(${c.id})" title="Delete Contact">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  });

  updateOutboundHeaderMetrics();
}

function loadOutboundDrawer(contact, initialChannel = 'email') {
  database.selectedContact = contact;
  const drawer = document.getElementById("outbound-drawer");
  const body = document.getElementById("outbound-drawer-body");

  if (!drawer || !body) return;

  drawer.style.transform = "translateX(0)";
  drawer.style.opacity = "1";

  // Pre-generate drafts if not set
  if (!contact.emailDraft) {
    if (contact.isInfluencer) {
      contact.emailDraft = {
        subject: `Briefing partnership / Referral check-in`,
        body: `Hi ${contact.firstName},\n\nI was looking through some of your industry contacts in credit unions. We're launching secure LLM query gateways.\n\nWho in credit union IT leadership should we talk to? For every introduction, we credit your account with BDR partner benefits.\n\nBest,\nSDR Campaign Agent`
      };
    } else {
      contact.emailDraft = {
        subject: `Safe database compliance for ${contact.company}`,
        body: `Hi ${contact.firstName},\n\nI saw your profile as ${contact.jobTitle} at ${contact.company}. Many credit union tech leaders we speak to are evaluating LLMs for operations, but are worried about data compliance.\n\nWe provide query validation guardrails built for credit unions.\n\nWould you be open to a quick brief next Tuesday?\n\nBest,\nSDR Campaign Agent`
      };
    }
  }

  if (!contact.linkedinDraft) {
    if (contact.isInfluencer) {
      contact.linkedinDraft = `Hi ${contact.firstName}, connecting with tech advisors regarding credit union database security. Would love to partner on referrals.`;
    } else {
      contact.linkedinDraft = `Hi ${contact.firstName}, noticed your technology development focus at ${contact.company}. We are helping credit unions secure database LLM interfaces. Connect?`;
    }
  }

  body.innerHTML = `
    <div class="drawer-meta-section">
      <div class="meta-row"><span class="meta-label">Recipient:</span><span class="meta-value">${contact.fullName} (${contact.isInfluencer ? "Influencer" : "Prospect"})</span></div>
      <div class="meta-row"><span class="meta-label">Job Title:</span><span class="meta-value">${contact.jobTitle || "N/A"}</span></div>
      <div class="meta-row"><span class="meta-label">Company:</span><span class="meta-value">${contact.company || "N/A"}</span></div>
      <div class="meta-row"><span class="meta-label">Lifecycle Stage:</span><span class="meta-value">${contact.leadTemp || "Warm Lead"}</span></div>
      <div class="meta-row"><span class="meta-label">Phone:</span><span class="meta-value">${contact.phone || "N/A"}</span></div>
      <div class="meta-row"><span class="meta-label">Email:</span><span class="meta-value">${contact.email || "N/A"}</span></div>
      ${contact.isInfluencer ? `<div class="meta-row"><span class="meta-label">Credits Awarded:</span><span class="meta-value" style="color:var(--brand-teal); font-weight:600;">${contact.referralCredits || 0} Credits</span></div>` : ""}
    </div>

    <div class="drawer-tab-strip">
      <button class="drawer-tab-btn" id="btn-outbound-channel-email" onclick="switchDrawerChannel('email')">Email</button>
      <button class="drawer-tab-btn" id="btn-outbound-channel-linkedin" onclick="switchDrawerChannel('linkedin')">LinkedIn</button>
      <button class="drawer-tab-btn" id="btn-outbound-channel-call" onclick="switchDrawerChannel('call')">Phone Call</button>
      <button class="drawer-tab-btn" id="btn-outbound-channel-calendar" onclick="switchDrawerChannel('calendar')">Calendar</button>
    </div>

    <div id="outbound-channel-container"></div>
    <div id="outbound-timeline-container"></div>
  `;

  switchDrawerChannel(initialChannel);
  
  const timeline = document.getElementById("outbound-timeline-container");
  if (timeline) timeline.innerHTML = renderContactTimeline(contact);
}

function switchDrawerChannel(channel) {
  const container = document.getElementById("outbound-channel-container");
  if (!container) return;

  document.querySelectorAll(".drawer-tab-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`btn-outbound-channel-${channel}`);
  if (activeBtn) activeBtn.classList.add("active");

  const contact = database.selectedContact;
  if (!contact) return;

  if (channel === 'email') {
    const savedInstructions = String(contact.emailPrompt || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    container.innerHTML = `
      <div class="form-group">
        <label for="email-ai-instructions">Instructions for AI <span style="font-size:11px; color:var(--color-text-secondary); font-weight:400;">(optional)</span></label>
        <textarea class="input-control" id="email-ai-instructions" rows="3" placeholder="For example: Mention their recent expansion, keep the tone warm, and invite them to a 15-minute demo.">${savedInstructions}</textarea>
        <div style="font-size:11px; color:var(--color-text-secondary); margin-top:5px; line-height:1.4;">The AI will use these instructions alongside the prospect details and existing campaign context.</div>
      </div>

      <div class="form-group">
        <label>Email Subject</label>
        <input type="text" class="input-control" id="email-draft-subject" value="${contact.emailDraft.subject}">
      </div>

      <div class="form-group" style="margin-top:12px;">
        <label>Email Body</label>
        <textarea class="input-control" id="email-draft-body" style="height: 180px; font-size:13px; font-family:var(--font-body);">${contact.emailDraft.body}</textarea>
      </div>

      <div class="email-preview-card" style="margin-top: 12px; padding: 14px; border: 1px solid var(--hairline-soft, #e7e5e4); border-radius: var(--radius-sm); background: var(--surface-card, #f5f0e0);">
        <span style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Email Rendered Preview:</span>
        <div style="font-size: 13px; line-height: 1.5; color: var(--ink); white-space: pre-line;">
          ${contact.emailDraft.body}
        </div>
        <div style="margin-top: 14px;">
          <button class="btn btn-primary btn-sm" onclick="openInfluencerPortal('${contact.email}')" style="cursor: pointer;">
            Submit Referral &amp; View Rewards &rarr;
          </button>
        </div>
      </div>

      <div style="margin-top:16px; display:flex; flex-direction:column; gap:10px;">
        <button class="btn btn-primary" onclick="sendOutboundEmail()" style="width:100%;">Send Campaign Email</button>
        <button class="btn btn-secondary" onclick="suppressSelectedContact()" style="width:100%; color:var(--color-error);">Suppress contact</button>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="btn btn-secondary" onclick="insertCalendlyLink('email-draft-body')" style="font-size:12px; height:40px; padding:0 6px;">Insert Calendly</button>
          <button class="btn btn-secondary" onclick="generateLLMEmailDraft(event)" style="font-size:12px; height:40px; padding:0 6px;">Draft with AI</button>
        </div>
      </div>
    `;
  } else if (channel === 'linkedin') {
    const rawLiDraft = typeof contact.linkedinDraft === "string" ? contact.linkedinDraft : (contact.linkedinDraft?.body || "");
    container.innerHTML = `
      <div class="form-group">
        <label>Recipient LinkedIn Profile URL *</label>
        <input type="url" class="input-control" id="drawer-linkedin-url-input" value="${contact.linkedinUrl || ""}" placeholder="https://www.linkedin.com/in/recipient-slug">
      </div>

      <div class="form-group" style="margin-top:12px;">
        <label>Connection Invitation Note (Max 300 chars)</label>
        <textarea class="input-control" id="linkedin-draft-text" style="height: 120px; font-size:13px;" maxlength="300">${rawLiDraft}</textarea>
      </div>

      <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
        <button class="btn btn-primary" onclick="sendOutboundLinkedin()" style="width:100%;">Open LinkedIn Profile &amp; Copy Note</button>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button class="btn btn-secondary" onclick="insertCalendlyLink('linkedin-draft-text')" style="font-size:13px; height:44px;">Insert Calendly</button>
          <button class="btn btn-secondary" onclick="generateLLMLinkedinDraft(event)" style="font-size:13px; height:44px;">AI Re-draft</button>
        </div>
      </div>
    `;
  } else if (channel === 'call') {
    container.innerHTML = `
      <div id="call-drawer-body" style="display:flex; flex-direction:column; gap:12px;"></div>
    `;
    renderDialerInterface("idle");
  } else if (channel === 'calendar') {
    const existingMeet = database.meetings ? database.meetings.find(m => m.contactEmail === contact.email) : null;
    if (existingMeet) {
      container.innerHTML = `
        <div class="calendar-booking-dossier" style="background:var(--surface-soft); border:1.5px solid var(--primary); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
          <h4 style="margin:0 0 8px 0; color:var(--brand-pink); font-size:14.5px;">Scheduled Meeting</h4>
          <div style="font-size:13px; line-height:1.6; color:var(--body);">
            <strong>Time:</strong> ${existingMeet.timeString}<br>
            <strong>Platform:</strong> ${existingMeet.platform}<br>
            <strong>Link:</strong> <a href="${existingMeet.meetingUrl}" target="_blank" style="color:var(--brand-teal); font-weight:600; text-decoration:underline;">Join ${existingMeet.platform}</a><br>
            <div style="margin-top:8px; border-top:1px solid var(--hairline); padding-top:6px;">
              <strong>Briefing Summary:</strong><br>
              <p style="margin:4px 0 0 0; color:var(--ink);">${existingMeet.notes || "No notes logged."}</p>
            </div>
            <div style="margin-top:12px;">
              <button class="btn btn-secondary btn-sm" onclick="exportICSFile('${contact.email}')" style="width:100%; border-color:var(--brand-teal); color:var(--brand-teal);">Download .ICS Invite File</button>
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="form-group">
          <label>Schedule Outbound Meeting</label>
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
            <div>
              <label style="font-size:11.5px; color:var(--muted); font-weight:500;">Select Platform</label>
              <select class="select-control" id="booking-platform" style="width:100%;">
                <option value="Google Meet">Google Meet</option>
                <option value="Microsoft Teams">Microsoft Teams</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px; color:var(--muted); font-weight:500;">Date & Time</label>
              <input type="datetime-local" class="input-control" id="booking-datetime" style="width:100%;">
            </div>
            <div>
              <label style="font-size:11.5px; color:var(--muted); font-weight:500;">Briefing dossier / Prep notes</label>
              <textarea class="input-control" id="booking-notes" style="width:100%; height:80px; font-size:13px;" placeholder="Identify tech setups or referred partners..."></textarea>
            </div>
            <button class="btn btn-primary" onclick="saveManualMeeting()" style="margin-top:8px; width:100%;">Book &amp; Sync Calendar</button>
          </div>
        </div>
      `;
    }
  }
}

function suppressSelectedContact() {
  const contact = database.selectedContact;
  if (!contact) return;
  contact.suppressed = true;
  contact.suppressionReason = "Manually suppressed by operator";
  contact.suppressedAt = new Date().toISOString();
  saveDatabaseCache();
  addLogConsole("campaign-outbound", `[COMPLIANCE] Suppressed ${contact.email}; outbound actions are blocked.`, "warning");
  alert(`${contact.fullName} is now suppressed.`);
  loadOutboundDrawer(contact, 'email');
}

async function sendOutboundEmail() {
  const contact = database.selectedContact;
  if (!contact) return;

  const subject = document.getElementById("email-draft-subject").value;
  const body = document.getElementById("email-draft-body").value;
  if (!contact.email || !subject.trim() || !body.trim()) return alert("Recipient, subject, and body are required.");
  if (contact.suppressed || contact.unsubscribed) return alert("This contact is suppressed or unsubscribed.");
  if (contact.emailsSent && !confirm("This contact has already been emailed. Send this new message anyway?")) return;
  try {
    const data = await sendGoogleGmail({ to: contact.email, subject, body });
    contact.emailDraft = { subject, body };
    contact.emailsSent = true;
    contact.emailSentAt = new Date().toISOString();
    contact.emailProviderId = data.id || null;
    database.stats.emailsSent = (database.stats.emailsSent || 0) + 1;
    saveDatabaseCache();
    addLogConsole("enrich", `[EMAIL] Confirmed by ${data.provider || "email provider"} for ${contact.email}. Message ID: ${data.id}`, "success");
  } catch (error) {
    addLogConsole("enrich", `[GMAIL] Email not sent: ${error.message}`, "error");
    alert(`Email not sent: ${error.message}`);
    return;
  }

  filterOutboundTable();
  loadOutboundDrawer(contact, 'email');

  // A real send does not imply a reply; engagement arrives only from Gmail sync.
}

async function sendOutboundLinkedin() {
  const contact = database.selectedContact;
  if (!contact) return false;

  const draft = document.getElementById("linkedin-draft-text")?.value
    ?? document.getElementById("outbound-email-body-input")?.value
    ?? contact.linkedinDraft;
  const note = typeof draft === "string" ? draft.trim() : String(draft?.body || "").trim();
  if (!note) {
    alert("Add a LinkedIn connection note before preparing the handoff.");
    return false;
  }
  if (contact.suppressed || contact.unsubscribed) {
    alert("This contact is suppressed or unsubscribed.");
    return false;
  }

  const modalLiInput = document.getElementById("outbound-modal-linkedin-url-input");
  const drawerLiInput = document.getElementById("drawer-linkedin-url-input");
  const candidateUrl = (modalLiInput?.value || drawerLiInput?.value || contact.linkedinUrl || "").trim();
  const normalizedUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(candidateUrl) : candidateUrl;
  const isValidUrl = typeof isValidLinkedinProfileUrl === "function"
    ? isValidLinkedinProfileUrl(normalizedUrl)
    : /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/(in|pub|company)\/[A-Za-z0-9_%-]+\/?/i.test(normalizedUrl);

  if (!isValidUrl) {
    alert("Recipient LinkedIn Profile URL is required (e.g. https://www.linkedin.com/in/username). Add it before preparing the handoff.");
    if (modalLiInput) modalLiInput.focus();
    else if (drawerLiInput) drawerLiInput.focus();
    return false;
  }

  contact.linkedinUrl = normalizedUrl;
  const infoLi = document.getElementById("modal-info-linkedin");
  if (infoLi) infoLi.textContent = normalizedUrl;

  try {
    const response = await fetch("/api/linkedin/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: contact.fullName,
        email: contact.email,
        linkedinUrl: normalizedUrl,
        message: note,
        contactId: contact.id
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `LinkedIn handoff returned ${response.status}`);
    }

    try {
      await navigator.clipboard.writeText(note);
    } catch (_) {}

    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    }

    contact.linkedinDraft = { body: note };
    contact.linkedinPreparedAt = new Date().toISOString();
    if (!Array.isArray(contact.outboundHistory)) contact.outboundHistory = [];
    contact.outboundHistory.push({
      channel: "linkedin_handoff",
      subject: `LinkedIn note prepared (${normalizedUrl})`,
      preview: note.slice(0, 120),
      date: new Date().toISOString().slice(0, 10)
    });
    saveDatabaseCache();

    addLogConsole("enrich", `[LINKEDIN HANDOFF] Copied the note and opened ${normalizedUrl} for ${contact.fullName}; it has not been sent.`, "info");
    filterOutboundTable();
    renderOutboundModalHistory(contact);
    alert(`Copied the LinkedIn note and opened ${contact.fullName}'s profile. Send it there to complete outreach; it has not been marked sent.`);
    return true;
  } catch (err) {
    addLogConsole("enrich", `[LINKEDIN OUTREACH ERROR] ${err.message}`, "error");
    alert(`Could not prepare the LinkedIn handoff: ${err.message}`);
    return false;
  }
}

function animateTextWordByWord(element, text, duration = 30) {
  element.value = "";
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

async function generateLLMEmailDraft(triggerEvent) {
  const contact = database.selectedContact;
  if (!contact) return;

  const instructionsInput = document.getElementById("email-ai-instructions");
  const customInstructions = instructionsInput ? instructionsInput.value.trim() : "";
  contact.emailPrompt = customInstructions;

  const btn = triggerEvent?.currentTarget || triggerEvent?.target;
  if (!btn) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("email-draft-body");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  try {
    const draft = await callGeminiOrLlmDraft({
      instructions: customInstructions,
      contact,
      isBulk: false,
      existingSubject: document.getElementById("email-draft-subject")?.value || "",
      existingBody: textarea?.value || ""
    });
    const finalBody = ensureCalendlyBookingLink(draft.body);
    contact.emailDraft = { subject: draft.subject, body: finalBody };
    if (typeof saveDatabaseCache === "function") saveDatabaseCache();
    const subjectInput = document.getElementById("email-draft-subject");
    if (subjectInput) subjectInput.value = draft.subject;
    if (textarea) {
      textarea.classList.remove("redrafting");
      animateTextWordByWord(textarea, finalBody);
    }
  } catch (error) {
    console.error("AI email draft failed:", error);
    if (typeof showToast === "function") showToast(error.message || "AI email drafting failed.", "error");
    else alert(error.message || "AI email drafting failed.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    if (textarea) textarea.classList.remove("redrafting");
  }
}

async function generateLLMLinkedinDraft(triggerEvent) {
  const contact = database.selectedContact;
  if (!contact) return;

  const btn = triggerEvent?.currentTarget || triggerEvent?.target;
  if (!btn) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("linkedin-draft-text");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  try {
    const draft = await callGeminiOrLlmDraft({
      instructions: `Write a natural connection note. ${contact.emailDraft?.subject ? `Align it with this email topic: ${contact.emailDraft.subject}` : ""}`,
      contact,
      isBulk: false,
      channel: "linkedin"
    });
    contact.linkedinDraft = draft.note;
    if (typeof saveDatabaseCache === "function") saveDatabaseCache();
    if (textarea) {
      textarea.classList.remove("redrafting");
      animateTextWordByWord(textarea, draft.note);
    }
  } catch (error) {
    console.error("AI LinkedIn draft failed:", error);
    if (typeof showToast === "function") showToast(error.message || "AI LinkedIn drafting failed.", "error");
    else alert(error.message || "AI LinkedIn drafting failed.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    if (textarea) textarea.classList.remove("redrafting");
  }
}

// Backward compatibility table and drawer loaders for other integrations
function filterEmailTable() { filterOutboundTable(); }
function filterLinkedinTable() { filterOutboundTable(); }
function filterCallTable() { filterOutboundTable(); }

function loadEmailDrawer(contact) { loadOutboundDrawer(contact, 'email'); }
function loadLinkedinDrawer(contact) { loadOutboundDrawer(contact, 'linkedin'); }
function loadCallDrawer(contact) { loadOutboundDrawer(contact, 'call'); }

// Manual click-to-call; live calling and transcription require a configured provider.
let callingAudioContext = null;
let callingOscillator = null;

function renderDialerInterface(state, durationText = "00:00") {
  const contact = database.selectedContact;
  const body = document.getElementById("call-drawer-body");
  if (!body || !contact) return;
  if (!Array.isArray(contact.callsMade)) contact.callsMade = [];

  const phone = contact.phone || "Add a phone number";

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

      <div class="dial-actions">
        ${controlsHtml}
      </div>
    </div>

    <div class="call-outcome-logger" id="outcome-logger-area" style="display: block">
      <label style="font-weight:600;margin-bottom:8px;display:block;">Call Logs History</label>
      <div style="max-height:80px;overflow-y:auto;font-size:12px;color:var(--muted);margin-bottom:12px;" id="call-logs-history">
        ${contact.callsMade.map(h => `- [${h.date}] ${h.outcome}`).join("<br>")}
      </div>
      
      <div id="outcome-buttons-div" style="display: flex; flex-direction:column; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Spoke to prospect - Interested')">Spoke to prospect - Interested</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Left voicemail')">Left voicemail</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('No answer')">No answer</button>
      </div>
    </div>
  `;
}

function startOutboundCall() {
  const contact = database.selectedContact;
  const dialable = String(contact?.phone || "").trim().replace(/[^\d+*#]/g, "");
  if (!dialable) {
    alert("Add a valid phone number to this contact before calling.");
    return;
  }
  const statusEl = document.getElementById("call-status-label");
  const transcriptBox = document.getElementById("call-transcript-box");
  if (statusEl) statusEl.textContent = "Opening your device phone app…";
  if (transcriptBox) transcriptBox.textContent = "This is a manual phone call. No AI transcript or automatic call outcome is available.";
  window.location.href = `tel:${dialable}`;
}

function hangupOutboundCall() {
  const statusEl = document.getElementById("call-status-label");
  if (statusEl) statusEl.textContent = "Call ended in your phone app. Record an outcome only after confirming it.";
}

function logCallOutcome(outcome) {
  const contact = database.selectedContact;
  if (!contact) return;

  if (!contact.callsMade) {
    contact.callsMade = [];
  }

  const taken = /spoke|interested|taken/i.test(outcome);
  const scheduled = /scheduled|booked|confirmed/i.test(outcome);
  contact.callsMade.push({
    date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
    outcome: outcome,
    status: taken ? "taken" : "attempted"
  });
  if (taken) contact.hasTakenCall = true;
  if (scheduled) contact.hasScheduledCall = true;

  database.stats.callsMade = (database.stats.callsMade || 0) + 1;
  saveDatabaseCache();
  filterOutboundTable();

  addLogConsole("enrich", `[OUTBOUND] Call logged for ${contact.fullName}. Outcome: ${outcome}`, "info");

  renderDialerInterface("idle");

  const timeline = document.getElementById("outbound-timeline-container");
  if (timeline) timeline.innerHTML = renderContactTimeline(contact);

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

function renderContactTimeline(contact) {
  const events = [];
  
  // 1. Ingestion Event
  events.push({
    title: "Lead Imported",
    desc: `Imported from CSV list: <strong>${(contact.sourceFile || "manual").split("/").pop()}</strong>.`,
    time: "Parsed",
    icon: "",
    color: "var(--brand-peach)"
  });

  // 2. Enrichment Event
  if (contact.enriched) {
    events.push({
      title: "Data Enriched",
      desc: `Dossier compiled via Explorium. Match score: <strong>${contact.matchPercentage || 95}%</strong>. Lead category: <strong>${contact.leadTemp}</strong>.`,
      time: "Enriched",
      icon: "",
      color: "var(--brand-ochre)"
    });
  }

  // 3. Email Outbound
  if (contact.emailsSent) {
    events.push({
      title: "Email Outreach Dispatched",
      desc: `Subject: <em>${contact.emailDraft ? contact.emailDraft.subject : ""}</em>`,
      time: "Sent",
      icon: "",
      color: "var(--brand-pink)"
    });
  }

  // 3b. Gmail replies
  if (contact.replyHistory && contact.replyHistory.length) {
    contact.replyHistory.forEach(reply => events.push({
      title: "Gmail Reply Received",
      desc: `Subject: <em>${reply.subject || "(no subject)"}</em><br>${reply.snippet || "Reply synced from Gmail."}`,
      time: reply.date || "Synced",
      icon: "",
      color: "var(--brand-teal)"
    }));
  }

  // 4. LinkedIn Outbound
  if (contact.linkedinSent) {
    events.push({
      title: "LinkedIn Touchpoint",
      desc: "Connection request note sent.",
      time: "Sent",
      icon: "",
      color: "var(--brand-lavender)"
    });
  }

  // 5. Phone Call Logs
  if (contact.callsMade && contact.callsMade.length > 0) {
    contact.callsMade.forEach(call => {
      events.push({
        title: "Phone Touchpoint",
        desc: `Outcome: <strong>${call.outcome}</strong>`,
        time: call.date.split(" ")[1] || "Called",
        icon: "",
        color: "var(--brand-teal)"
      });
    });
  }

  // 6. Meeting Ingestion
  const meeting = database.meetings ? database.meetings.find(m => m.contactEmail === contact.email) : null;
  if (meeting) {
    events.push({
      title: "Appointment Scheduled",
      desc: `Platform: <strong>${meeting.platform}</strong>. Briefing slot locked: <strong>${meeting.time}</strong>.`,
      time: "Confirmed",
      icon: "",
      color: "var(--brand-mint)"
    });
  }

  let html = `
    <div class="timeline-title-wrap" style="border-top: 1.5px solid var(--hairline); margin-top:24px; padding-top:20px; margin-bottom:14px;">
      <h4 style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin:0;">Outreach History</h4>
    </div>
    <div class="timeline-container-visual" style="display:flex; flex-direction:column; gap:16px; position:relative; padding-left:12px; margin-left:8px; border-left:1.5px dashed var(--hairline); padding-bottom:10px;">
  `;

  events.reverse().forEach(ev => {
    html += `
      <div class="timeline-item-row" style="position:relative; display:flex; gap:12px; align-items:flex-start;">
        <!-- Glowing Timeline Node -->
        <div class="timeline-node-circle" style="position:absolute; left:-21px; top:2px; width:17px; height:17px; border-radius:50%; background:${ev.color}; border:1.5px solid var(--hairline); box-shadow:1px 1px 0 var(--hairline); display:flex; align-items:center; justify-content:center; font-size:9px; z-index:1;"></div>
        
        <div style="flex-grow:1; display:flex; flex-direction:column; gap:2px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:700; color:var(--ink);">${ev.icon} ${ev.title}</span>
            <span style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--muted);">${ev.time}</span>
          </div>
          <p style="font-size:11.5px; color:var(--body); line-height:1.45; margin:0;">${ev.desc}</p>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

let currentModalChannel = 'email';
window.expandedOutboundContactId = null;

function toggleOutboundQuickOutreach(contactId, event) {
  if (event && typeof event.stopPropagation === "function") event.stopPropagation();
  const idStr = String(contactId);
  window.expandedOutboundContactId = String(window.expandedOutboundContactId || "") === idStr ? null : idStr;
  filterOutboundTable();
}

function openOutboundModal(contactId, channel = 'email') {
  const list = database.contacts || [];
  let contact = list.find(c => c.id === contactId || String(c.id) === String(contactId));
  if (!contact && typeof contactId === "number" && list[contactId]) {
    contact = list[contactId];
  }
  if (!contact && typeof contactId === "string" && contactId.includes("@")) {
    contact = list.find(c => String(c.email || "").toLowerCase() === contactId.toLowerCase());
  }
  if (!contact) return;

  database.selectedContact = contact;
  currentModalChannel = channel;

  if (!contact.emailDraft) {
    if (contact.isInfluencer) {
      contact.emailDraft = {
        subject: `Briefing partnership / Referral check-in`,
        body: `Hi ${contact.firstName},\n\nI was looking through some of your industry contacts in credit unions. We're launching secure LLM query gateways.\n\nWho in credit union IT leadership should we talk to? For every introduction, we credit your account with BDR partner benefits.\n\nBest,\nSDR Campaign Agent`
      };
    } else if (contact.referredBy) {
      contact.emailDraft = {
        subject: `Introduction via ${contact.referredBy} - Safe compliance for ${contact.company}`,
        body: `Hi ${contact.firstName},\n\n${contact.referredBy} suggested I connect with you regarding your role as ${contact.jobTitle || 'Executive'} at ${contact.company}.\n\nWe provide query validation guardrails and automated compliance pipelines tailored for credit unions.\n\nWould 15 minutes next Tuesday work for a brief intro?\n\nBest,\nSDR Campaign Agent`
      };
    } else {
      contact.emailDraft = {
        subject: `Safe compliance & automation for ${contact.company}`,
        body: `Hi ${contact.firstName},\n\nNotice ${contact.company} is scaling operations. Our platform automates BDR queries & outbound pipelines.\n\nWould 15 minutes next Tuesday work to discuss?\n\nBest,\nSDR Campaign Agent`
      };
    }
  }
  if (!contact.linkedinDraft) {
    if (contact.isInfluencer) {
      contact.linkedinDraft = {
        body: `Hi ${contact.firstName}, connecting with tech advisors regarding credit union database security. Would love to partner on referrals.`
      };
    } else if (contact.referredBy) {
      contact.linkedinDraft = {
        body: `Hi ${contact.firstName}, connecting with you through ${contact.referredBy}. Impressed by your work at ${contact.company} and would love to share our compliance benchmarks.`
      };
    } else {
      contact.linkedinDraft = {
        body: `Hi ${contact.firstName}, impressed by your leadership at ${contact.company}. Would love to connect and share BDR automation benchmarks.`
      };
    }
  }

  const nameEl = document.getElementById("outbound-modal-contact-name");
  const badgeEl = document.getElementById("outbound-modal-contact-badge");
  const referredTagEl = document.getElementById("outbound-modal-referred-tag");
  if (nameEl) nameEl.textContent = `${contact.fullName} (${contact.jobTitle || 'Executive'})`;
  if (badgeEl) {
    badgeEl.textContent = contact.leadTemp || "Warm Lead";
    badgeEl.className = (contact.leadTemp === "Hot Lead") ? "badge badge-success" : "badge";
  }
  if (referredTagEl) {
    if (contact.referredBy) {
      referredTagEl.textContent = `Referred by: ${contact.referredBy}`;
      referredTagEl.style.display = "inline-flex";
    } else if (contact.isInfluencer) {
      referredTagEl.textContent = "Influencer Partner";
      referredTagEl.style.display = "inline-flex";
    } else {
      referredTagEl.style.display = "none";
    }
  }

  const infoCompany = document.getElementById("modal-info-company");
  const infoTitle = document.getElementById("modal-info-title");
  const infoEmail = document.getElementById("modal-info-email");
  const infoPhone = document.getElementById("modal-info-phone");
  const infoLinkedin = document.getElementById("modal-info-linkedin");
  const infoReferredRow = document.getElementById("modal-info-referred-row");
  const infoReferredBy = document.getElementById("modal-info-referred-by");
  if (infoCompany) infoCompany.textContent = contact.company || "N/A";
  if (infoTitle) infoTitle.textContent = contact.jobTitle || "Decision Maker";
  if (infoEmail) infoEmail.textContent = contact.email || "N/A";
  if (infoPhone) infoPhone.textContent = contact.phone || "+1 (555) 019-2834";
  if (infoLinkedin) infoLinkedin.textContent = contact.linkedinUrl || "Not configured";
  if (infoReferredBy) {
    infoReferredBy.textContent = contact.referredBy || (contact.isInfluencer ? "None (Influencer Partner)" : "Direct / None");
  }
  if (infoReferredRow) {
    infoReferredRow.style.display = "block";
  }

  const modalLiInput = document.getElementById("outbound-modal-linkedin-url-input");
  const modalLiStatus = document.getElementById("outbound-modal-linkedin-url-status");
  if (modalLiInput) modalLiInput.value = contact.linkedinUrl || "";
  if (modalLiStatus) {
    const valid = typeof isValidLinkedinProfileUrl === "function" ? isValidLinkedinProfileUrl(contact.linkedinUrl || "") : Boolean(contact.linkedinUrl);
    modalLiStatus.textContent = valid ? "✓ Valid recipient LinkedIn profile URL" : "Required to message or connect on LinkedIn";
    modalLiStatus.style.color = valid ? "var(--color-success)" : "var(--color-text-secondary)";
  }

  renderOutboundModalHistory(contact);
  switchOutboundModalChannel(channel);

  const dlg = document.getElementById("outbound-action-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }

  // Auto-run deliverability check on the pre-filled email draft
  if (channel === 'email' && contact.emailDraft) {
    runInlineSpamCheck(contact.emailDraft.body || "");
  }
}

function closeOutboundModal() {
  const dlg = document.getElementById("outbound-action-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
  if (typeof renderConsolePortalReferrals === "function") {
    renderConsolePortalReferrals();
  }
  if (typeof renderDashboard === "function") {
    renderDashboard();
  }
}

function saveOutboundModalLinkedinUrl() {
  const contact = database.selectedContact;
  if (!contact) return;
  const modalLiInput = document.getElementById("outbound-modal-linkedin-url-input");
  const modalLiStatus = document.getElementById("outbound-modal-linkedin-url-status");
  const raw = (modalLiInput?.value || "").trim();
  const normalized = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(raw) : raw;
  const valid = typeof isValidLinkedinProfileUrl === "function"
    ? isValidLinkedinProfileUrl(normalized)
    : /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/(in|pub|company)\/[A-Za-z0-9_%-]+\/?/i.test(normalized);
  if (!valid) {
    alert("Please enter a valid LinkedIn profile URL (e.g. https://www.linkedin.com/in/username).");
    if (modalLiInput) modalLiInput.focus();
    return;
  }
  contact.linkedinUrl = normalized;
  if (modalLiInput) modalLiInput.value = normalized;
  const infoLinkedin = document.getElementById("modal-info-linkedin");
  if (infoLinkedin) infoLinkedin.textContent = normalized;
  if (modalLiStatus) {
    modalLiStatus.textContent = "✓ Saved recipient LinkedIn profile URL";
    modalLiStatus.style.color = "var(--color-success)";
  }
  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();
}

function openOutboundRecipientLinkedinProfile() {
  const contact = database.selectedContact;
  const modalLiInput = document.getElementById("outbound-modal-linkedin-url-input");
  const raw = (modalLiInput?.value || contact?.linkedinUrl || "").trim();
  const normalized = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(raw) : raw;
  const valid = typeof isValidLinkedinProfileUrl === "function"
    ? isValidLinkedinProfileUrl(normalized)
    : /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/(in|pub|company)\/[A-Za-z0-9_%-]+\/?/i.test(normalized);
  if (!valid) {
    alert("Enter a valid LinkedIn profile URL first (e.g. https://www.linkedin.com/in/username).");
    if (modalLiInput) modalLiInput.focus();
    return;
  }
  if (contact) contact.linkedinUrl = normalized;
  window.open(normalized, "_blank", "noopener,noreferrer");
}

function insertOutboundModalCalendlyLink() {
  const bodyInput = document.getElementById("outbound-email-body-input");
  if (!bodyInput) return;
  const calUrl = typeof getCustomerCalendlyUrl === "function"
    ? getCustomerCalendlyUrl()
    : (database.calendlyUrl || "https://calendly.com/bdr-ai-demo/15min");
  const snippet = `\n\nBook a 15-min GTM briefing directly on my calendar here: ${calUrl}`;
  if (!bodyInput.value.includes(calUrl)) {
    bodyInput.value = (bodyInput.value || "").trimEnd() + snippet;
    updateOutboundLivePreview();
  }
}

function scheduleCallFromOutboundModal() {
  const calUrl = typeof getCustomerCalendlyUrl === "function" ? getCustomerCalendlyUrl() : "";
  let bookingUrl;
  try {
    bookingUrl = new URL(calUrl);
    if (!['http:', 'https:'].includes(bookingUrl.protocol)) throw new Error('Invalid booking URL.');
  } catch (_) {
    alert("Set a valid booking URL in Settings before opening a scheduling page. No call was marked as scheduled.");
    return;
  }
  insertOutboundModalCalendlyLink();
  window.open(bookingUrl.href, "_blank", "noopener,noreferrer");
  alert("Booking page opened. The call will appear on the Admin Schedule only after it is actually booked.");
}

function markCallCompletedFromOutboundModal() {
  const contact = database.selectedContact;
  if (!contact) return;
  if (!confirm(`Confirm that a call with ${contact.fullName} has already taken place? This action records a completed call.`)) return;
  contact.hasScheduledCall = true;
  contact.hasTakenCall = true;
  contact.callScheduledAt = contact.callScheduledAt || new Date().toISOString().slice(0, 10);
  contact.status = "Call Taken";
  if (!Array.isArray(contact.callsMade)) contact.callsMade = [];
  contact.callsMade.push({
    date: new Date().toISOString().slice(0, 10),
    outcome: "Completed GTM Call (Call Taken)",
    status: "taken"
  });
  database.stats.callsMade = (database.stats.callsMade || 0) + 1;
  if (typeof recalculateAllInfluencerCredits === "function") recalculateAllInfluencerCredits();
  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();
  renderOutboundModalHistory(contact);
  filterOutboundTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();
  if (typeof renderDashboard === "function") renderDashboard();
  alert(`Marked GTM call completed for ${contact.fullName}.${contact.referredBy ? ` Full referral bonus (+50 pts total) credited to ${contact.referredBy}!` : ""}`);
}

function switchOutboundModalChannel(channel) {
  currentModalChannel = channel;
  const contact = database.selectedContact;
  if (!contact) return;

  const btnEmail = document.getElementById("btn-outbound-channel-email");
  const btnLinkedin = document.getElementById("btn-outbound-channel-linkedin");
  const btnCall = document.getElementById("btn-outbound-channel-call");

  const draftInputsGroup = document.getElementById("outbound-draft-inputs-group");
  const callPanel = document.getElementById("outbound-call-panel");
  const subjGroup = document.getElementById("outbound-subject-group");
  const liUrlGroup = document.getElementById("outbound-linkedin-url-group");
  const secTitle = document.getElementById("outbound-modal-section-title");
  const actionBtn = document.getElementById("btn-outbound-send-action");
  const aiHookBtn = document.getElementById("btn-generate-ai-hook");

  if (btnEmail && btnLinkedin && btnCall) {
    btnEmail.classList.toggle("active", channel === 'email');
    btnLinkedin.classList.toggle("active", channel === 'linkedin');
    btnCall.classList.toggle("active", channel === 'call');
  }

  const subjInput = document.getElementById("outbound-email-subject-input");
  const bodyInput = document.getElementById("outbound-email-body-input");

  if (channel === 'email') {
    if (draftInputsGroup) draftInputsGroup.style.display = "flex";
    if (callPanel) callPanel.style.display = "none";
    if (subjGroup) subjGroup.style.display = "block";
    if (liUrlGroup) liUrlGroup.style.display = "none";
    if (secTitle) secTitle.textContent = "Email Outreach Message";
    if (actionBtn) { actionBtn.style.display = "inline-flex"; actionBtn.textContent = "Dispatch Email Outreach"; }
    if (aiHookBtn) aiHookBtn.style.display = "inline-flex";
    if (subjInput) subjInput.value = contact.emailDraft ? contact.emailDraft.subject : "";
    if (bodyInput) bodyInput.value = contact.emailDraft ? contact.emailDraft.body : "";
  } else if (channel === 'linkedin') {
    if (draftInputsGroup) draftInputsGroup.style.display = "flex";
    if (callPanel) callPanel.style.display = "none";
    if (subjGroup) subjGroup.style.display = "none";
    if (liUrlGroup) liUrlGroup.style.display = "block";
    if (secTitle) secTitle.textContent = "LinkedIn Profile Outreach & Note Handoff";
    if (actionBtn) { actionBtn.style.display = "inline-flex"; actionBtn.textContent = "Copy Note & Open LinkedIn Profile"; }
    if (aiHookBtn) aiHookBtn.style.display = "inline-flex";
    const modalLiInput = document.getElementById("outbound-modal-linkedin-url-input");
    if (modalLiInput) modalLiInput.value = contact.linkedinUrl || "";
    if (bodyInput) {
      const liBody = typeof contact.linkedinDraft === "string" ? contact.linkedinDraft : (contact.linkedinDraft?.body || "");
      bodyInput.value = liBody;
    }
  } else if (channel === 'call') {
    if (draftInputsGroup) draftInputsGroup.style.display = "none";
    if (callPanel) callPanel.style.display = "flex";
    if (liUrlGroup) liUrlGroup.style.display = "none";
    if (secTitle) secTitle.textContent = "Manual Calls & Outcomes";
    if (actionBtn) actionBtn.style.display = "none";
    if (aiHookBtn) aiHookBtn.style.display = "none";
  }

  updateOutboundLivePreview();
}

function updateOutboundLivePreview() {
  const contact = database.selectedContact;
  const subjInput = document.getElementById("outbound-email-subject-input");
  const bodyInput = document.getElementById("outbound-email-body-input");
  const prevSubj = document.getElementById("preview-subject-render");
  const prevBody = document.getElementById("preview-body-render");

  if (!prevBody) return;

  if (currentModalChannel === 'email') {
    if (prevSubj) {
      prevSubj.style.display = "block";
      prevSubj.textContent = `Subject: ${subjInput ? subjInput.value : ""}`;
    }
    prevBody.textContent = bodyInput ? bodyInput.value : "";
    if (contact && contact.emailDraft) {
      contact.emailDraft.subject = subjInput ? subjInput.value : "";
      contact.emailDraft.body = bodyInput ? bodyInput.value : "";
    }
  } else if (currentModalChannel === 'linkedin') {
    if (prevSubj) prevSubj.style.display = "none";
    prevBody.textContent = bodyInput ? bodyInput.value : "";
    if (contact) {
      if (typeof contact.linkedinDraft === "object" && contact.linkedinDraft !== null) {
        contact.linkedinDraft.body = bodyInput ? bodyInput.value : "";
      } else {
        contact.linkedinDraft = { body: bodyInput ? bodyInput.value : "" };
      }
    }
  } else {
    if (prevSubj) prevSubj.style.display = "none";
    prevBody.textContent = bodyInput ? bodyInput.value : "";
  }

  // Auto-run inline spam/deliverability check when drafting email
  if (currentModalChannel === 'email') {
    runInlineSpamCheck(bodyInput ? bodyInput.value : "");
  }
}

async function executeOutboundSendAction() {
  const contact = database.selectedContact;
  if (!contact) return;

  if (currentModalChannel === 'email') {
    const subject = document.getElementById("outbound-email-subject-input")?.value.trim();
    const body = document.getElementById("outbound-email-body-input")?.value.trim();
    if (!contact.email || !subject || !body) {
      alert("A recipient, subject, and message are required.");
      return;
    }
    if (!confirm(`Send this email to ${contact.email}?`)) return;
    const actionButton = document.getElementById("btn-outbound-send-action");
    if (actionButton) { actionButton.disabled = true; actionButton.textContent = "Sending securely…"; }
    try {
      const result = await sendGoogleGmail({ to: contact.email, subject, body });
      contact.emailsSent = true;
      contact.emailSentAt = new Date().toISOString();
      contact.emailProviderId = result.id || null;
      contact.emailDraft = { subject, body };
      database.stats.emailsSent = (database.stats.emailsSent || 0) + 1;
      saveDatabaseCache();
      addLogConsole("campaign-outbound", `[EMAIL] Confirmed by ${result.provider || "email provider"} for ${contact.fullName} (${contact.email})`, "success");
      alert(`Email sent to ${contact.fullName}.`);
      renderOutboundModalHistory(contact);
    } catch (error) {
      addLogConsole("campaign-outbound", `[OUTBOUND EMAIL ERROR] ${error.message}`, "error");
      alert(`Email was not sent. ${error.message}`);
    } finally {
      if (actionButton) { actionButton.disabled = false; actionButton.textContent = "Dispatch Email Outreach"; }
    }
  } else if (currentModalChannel === 'linkedin') {
    const note = document.getElementById("outbound-email-body-input")?.value.trim();
    if (!note) {
      alert("Add a LinkedIn connection note before preparing the handoff.");
      return;
    }
    contact.linkedinDraft = { body: note };
    const ok = await sendOutboundLinkedin();
    if (ok) {
      closeOutboundModal();
    }
    return;
  } else if (currentModalChannel === 'call') {
    alert("No live telephony provider is connected. No call was placed or logged. Use Schedule GTM Call to book a real meeting.");
    return;
  }

  saveDatabaseCache();
  renderOutboundModalHistory(contact);
  filterOutboundTable();
  closeOutboundModal();
}

function renderOutboundModalHistory(contact) {
  const container = document.getElementById("outbound-contact-history-list");
  if (!container) return;

  let html = "";
  if (contact.emailsSent) {
    html += `<div style="padding:0.375rem; border-bottom:1px solid var(--color-border);"><strong>Email Sent:</strong> ${contact.emailDraft ? contact.emailDraft.subject : 'Campaign Outreach'}</div>`;
  }
  if (contact.linkedinSent) {
    html += `<div style="padding:0.375rem; border-bottom:1px solid var(--color-border);"><strong>LinkedIn Sent:</strong> ${typeof contact.linkedinDraft === 'string' ? contact.linkedinDraft : (contact.linkedinDraft?.body || 'Connection & outreach sent')}</div>`;
  } else if (contact.linkedinPreparedAt) {
    html += `<div style="padding:0.375rem; border-bottom:1px solid var(--color-border);"><strong>LinkedIn Note Prepared:</strong> ${typeof contact.linkedinDraft === 'string' ? contact.linkedinDraft : (contact.linkedinDraft?.body || 'Open profile and send manually')}</div>`;
  }
  if (contact.callsMade && contact.callsMade.length > 0) {
    contact.callsMade.forEach(c => {
      html += `<div style="padding:0.375rem; border-bottom:1px solid var(--color-border);"><strong>Call Logged:</strong> ${c.outcome || 'Voice Briefing'}</div>`;
    });
  }

  if (!html) {
    html = `<div style="color:var(--color-text-secondary); text-align:center; padding:1rem;">No prior outbound history recorded.</div>`;
  }

  container.innerHTML = html;
}

function deleteContactRecord(contactId) {
  const contact = database.contacts.find(c => c.id === contactId);
  if (!contact) return;

  if (confirm(`Are you sure you want to delete contact record for ${contact.fullName}?`)) {
    database.contacts = database.contacts.filter(c => c.id !== contactId);
    saveDatabaseCache();
    filterOutboundTable();
    if (typeof filterImportTable === "function") filterImportTable();
    if (typeof filterInfluencersTable === "function") filterInfluencersTable();
    addLogConsole("enrich", `[SYSTEM] Deleted contact record: ${contact.fullName}`, "info");
  }
}

// --- Manual click-to-call and call outcome logging ---
// --- CATEGORY 4B: REAL-TIME SPAM AUDITOR & DELIVERABILITY CHECKER ---
function runSpamAuditorCheck(text) {
  const scoreEl = document.getElementById("spam-score-val");
  const readEl = document.getElementById("spam-readability-val");
  const risksEl = document.getElementById("spam-risks-val");
  if (!scoreEl) return;

  if (!text || text.trim().length === 0) {
    scoreEl.textContent = "0.2 / 10 (Clean)";
    scoreEl.style.color = "var(--color-success, #16a34a)";
    if (readEl) readEl.textContent = "Grade 7 (Optimal)";
    if (risksEl) risksEl.textContent = "None detected";
    return;
  }

  const spamTriggers = ["free", "guaranteed", "100%", "no risk", "act now", "limited time", "click here", "cash", "make money", "urgent", "secret"];
  const lower = text.toLowerCase();
  let foundTriggers = [];

  spamTriggers.forEach(word => {
    if (lower.includes(word)) foundTriggers.push(word);
  });

  const wordCount = text.trim().split(/\s+/).length;
  const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
  const avgWordsPerSentence = wordCount / sentenceCount;
  const gradeLevel = Math.max(4, Math.min(16, Math.round(0.39 * avgWordsPerSentence + 11.8)));

  let baseScore = (foundTriggers.length * 2.1) + (text.includes("!") ? 1.2 : 0) + (text.toUpperCase() === text && text.length > 20 ? 3.0 : 0);
  baseScore = Math.min(10, Math.max(0.2, baseScore));

  if (baseScore < 3.0) {
    scoreEl.textContent = `${baseScore.toFixed(1)} / 10 (Low Risk)`;
    scoreEl.style.color = "var(--color-success, #16a34a)";
  } else if (baseScore < 6.0) {
    scoreEl.textContent = `${baseScore.toFixed(1)} / 10 (Moderate Risk)`;
    scoreEl.style.color = "#d97706";
  } else {
    scoreEl.textContent = `${baseScore.toFixed(1)} / 10 (High Risk)`;
    scoreEl.style.color = "#dc2626";
  }

  if (readEl) readEl.textContent = `Grade ${gradeLevel} (${gradeLevel <= 8 ? 'Optimal B2B' : 'Too Complex'})`;
  if (risksEl) {
    risksEl.textContent = foundTriggers.length > 0 ? `Triggers: "${foundTriggers.join(', ')}"` : "Clean syntax";
  }
}

// --- INLINE SPAM & DELIVERABILITY CHECK (compact modal indicator) ---
function runInlineSpamCheck(text) {
  const scoreEl = document.getElementById("inline-spam-score");
  const readEl = document.getElementById("inline-spam-readability");
  const risksEl = document.getElementById("inline-spam-risks");
  if (!scoreEl) return;

  if (!text || text.trim().length === 0) {
    scoreEl.textContent = "0.2 (Clean)";
    scoreEl.style.color = "#34d399";
    if (readEl) readEl.textContent = "Grade 7";
    if (risksEl) risksEl.textContent = "No triggers";
    return;
  }

  const spamTriggers = ["free", "guaranteed", "100%", "no risk", "act now", "limited time", "click here", "cash", "make money", "urgent", "secret"];
  const lower = text.toLowerCase();
  let foundTriggers = [];
  spamTriggers.forEach(word => {
    if (lower.includes(word)) foundTriggers.push(word);
  });

  const wordCount = text.trim().split(/\s+/).length;
  const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
  const avgWordsPerSentence = wordCount / sentenceCount;
  const gradeLevel = Math.max(4, Math.min(16, Math.round(0.39 * avgWordsPerSentence + 11.8)));

  let baseScore = (foundTriggers.length * 2.1) + (text.includes("!") ? 1.2 : 0) + (text.toUpperCase() === text && text.length > 20 ? 3.0 : 0);
  baseScore = Math.min(10, Math.max(0.2, baseScore));

  if (baseScore < 3.0) {
    scoreEl.textContent = `${baseScore.toFixed(1)} (Clean)`;
    scoreEl.style.color = "#34d399";
  } else if (baseScore < 6.0) {
    scoreEl.textContent = `${baseScore.toFixed(1)} (Moderate)`;
    scoreEl.style.color = "#d97706";
  } else {
    scoreEl.textContent = `${baseScore.toFixed(1)} (High Risk)`;
    scoreEl.style.color = "#dc2626";
  }

  if (readEl) readEl.textContent = `Grade ${gradeLevel}`;
  if (risksEl) {
    risksEl.textContent = foundTriggers.length > 0 ? `"${foundTriggers.join('", "')}"` : "No triggers";
    risksEl.style.color = foundTriggers.length > 0 ? "#d97706" : "";
  }
}


window.switchOutboundSubtab = switchOutboundSubtab;
window.filterOutboundTable = filterOutboundTable;
window.changeOutboundPage = changeOutboundPage;
window.loadOutboundDrawer = loadOutboundDrawer;
window.switchDrawerChannel = switchDrawerChannel;
window.openOutboundModal = openOutboundModal;
window.openOutboundActionModal = openOutboundModal;
window.openCampaignTarget = openOutboundModal;
window.toggleOutboundQuickOutreach = toggleOutboundQuickOutreach;
window.closeOutboundModal = closeOutboundModal;
window.switchOutboundModalChannel = switchOutboundModalChannel;
window.updateOutboundLivePreview = updateOutboundLivePreview;
window.executeOutboundSendAction = executeOutboundSendAction;
window.deleteContactRecord = deleteContactRecord;
window.sendOutboundEmail = sendOutboundEmail;
window.suppressSelectedContact = suppressSelectedContact;
window.sendOutboundLinkedin = sendOutboundLinkedin;
window.animateTextWordByWord = animateTextWordByWord;
window.generateLLMEmailDraft = generateLLMEmailDraft;
window.generateLLMLinkedinDraft = generateLLMLinkedinDraft;
window.filterEmailTable = filterEmailTable;
window.filterLinkedinTable = filterLinkedinTable;
window.filterCallTable = filterCallTable;
window.loadEmailDrawer = loadEmailDrawer;
window.loadLinkedinDrawer = loadLinkedinDrawer;
window.loadCallDrawer = loadCallDrawer;
window.renderDialerInterface = renderDialerInterface;
window.startOutboundCall = startOutboundCall;
window.hangupOutboundCall = hangupOutboundCall;
window.logCallOutcome = logCallOutcome;
window.playBeepSound = playBeepSound;
window.stopBeepSound = stopBeepSound;
window.renderContactTimeline = renderContactTimeline;
window.runSpamAuditorCheck = runSpamAuditorCheck;
window.runInlineSpamCheck = runInlineSpamCheck;
window.saveOutboundModalLinkedinUrl = saveOutboundModalLinkedinUrl;
window.openOutboundRecipientLinkedinProfile = openOutboundRecipientLinkedinProfile;
window.insertOutboundModalCalendlyLink = insertOutboundModalCalendlyLink;
window.scheduleCallFromOutboundModal = scheduleCallFromOutboundModal;
window.markCallCompletedFromOutboundModal = markCallCompletedFromOutboundModal;

function openAddProspectForInfluencer(influencerIdOrEmail) {
  const list = database.contacts || [];
  let influencer = list.find(c =>
    c.id === influencerIdOrEmail ||
    String(c.id) === String(influencerIdOrEmail) ||
    (c.email && String(c.email).toLowerCase() === String(influencerIdOrEmail || "").toLowerCase()) ||
    (c.fullName && String(c.fullName).toLowerCase() === String(influencerIdOrEmail || "").toLowerCase())
  );
  if (!influencer && typeof influencerIdOrEmail === "number" && list[influencerIdOrEmail]) {
    influencer = list[influencerIdOrEmail];
  }
  if (!influencer) {
    influencer = list.find(c => c.isInfluencer);
  }
  if (!influencer) {
    alert("No influencer found. Please add or convert an influencer first.");
    return;
  }

  const emailHidden = document.getElementById("referral-influencer-email");
  const idHidden = document.getElementById("referral-influencer-id");
  const targetNameEl = document.getElementById("reward-target-name");
  const form = document.getElementById("referral-form");
  if (form) form.reset();
  if (emailHidden) emailHidden.value = influencer.email || "";
  if (idHidden) idHidden.value = String(influencer.id || "");
  if (targetNameEl) targetNameEl.textContent = influencer.fullName || "Influencer";
  const creditsInput = document.getElementById("ref-credits");
  if (creditsInput) creditsInput.value = "10";

  const dlg = document.getElementById("referral-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeReferralDialog() {
  const dlg = document.getElementById("referral-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

async function handleReferralSubmit(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  const infId = document.getElementById("referral-influencer-id")?.value || "";
  const infEmail = document.getElementById("referral-influencer-email")?.value || "";
  const influencer = (database.contacts || []).find(c =>
    (infId && String(c.id) === String(infId)) ||
    (infEmail && String(c.email || "").toLowerCase() === String(infEmail).toLowerCase())
  ) || (database.contacts || []).find(c => c.isInfluencer);

  if (!influencer) {
    alert("Could not locate the referring influencer.");
    return;
  }

  const fullName = (document.getElementById("ref-name")?.value || "").trim();
  const jobTitle = (document.getElementById("ref-title")?.value || "").trim();
  const company = (document.getElementById("ref-company")?.value || "").trim();
  const email = (document.getElementById("ref-email")?.value || "").trim().toLowerCase();
  const phone = (document.getElementById("ref-phone")?.value || "").trim();
  const rawLinkedin = (document.getElementById("ref-linkedin")?.value || "").trim();
  const linkedinUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(rawLinkedin) : rawLinkedin;
  const credits = Number(document.getElementById("ref-credits")?.value || 10) || 10;

  if (!fullName || !email || !company) {
    alert("Full Name, Company, and Email Address are required.");
    return;
  }

  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(" ") || "";

  let prospect = (database.contacts || []).find(c => !c.isInfluencer && String(c.email || "").toLowerCase() === email);
  const today = new Date().toISOString().slice(0, 10);
  if (!prospect) {
    const maxId = (database.contacts || []).reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
    prospect = {
      id: maxId + 1,
      firstName,
      lastName,
      fullName,
      email,
      jobTitle: jobTitle || "Decision Maker",
      company,
      phone,
      linkedinUrl,
      industry: "Credit Union",
      sourceFile: `Referred by ${influencer.fullName}`,
      referredBy: influencer.fullName,
      referredByEmail: influencer.email,
      influencerId: influencer.id,
      referredDate: today,
      isInfluencer: false,
      enriched: true,
      matchPercentage: 95,
      leadTemp: "Hot Lead",
      status: "Warm Referral",
      emailsSent: false,
      linkedinSent: false,
      callsMade: [],
      hasScheduledCall: false,
      hasTakenCall: false
    };
    database.contacts.unshift(prospect);
  } else {
    prospect.fullName = fullName || prospect.fullName;
    prospect.jobTitle = jobTitle || prospect.jobTitle;
    prospect.company = company || prospect.company;
    prospect.phone = phone || prospect.phone;
    if (linkedinUrl) prospect.linkedinUrl = linkedinUrl;
    prospect.referredBy = influencer.fullName;
    prospect.referredByEmail = influencer.email;
    prospect.influencerId = influencer.id;
    prospect.referredDate = prospect.referredDate || today;
  }

  if (!Array.isArray(influencer.referrals)) influencer.referrals = [];
  if (!influencer.referrals.some(r => String(r.email || "").toLowerCase() === email)) {
    influencer.referrals.push({
      id: prospect.id,
      fullName,
      jobTitle,
      company,
      email,
      phone,
      linkedinUrl,
      creditsGranted: credits,
      date: today,
      hasScheduledCall: false,
      hasTakenCall: false
    });
  }

  try {
    await fetch("/api/portal/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerEmail: influencer.email,
        fullName,
        email,
        company,
        jobTitle,
        phone,
        linkedinUrl,
        credits,
        hasScheduledCall: false,
        hasTakenCall: false
      })
    });
  } catch (_) {}

  if (typeof recalculateAllInfluencerCredits === "function") recalculateAllInfluencerCredits();
  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();

  closeReferralDialog();
  filterOutboundTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();
  if (typeof renderDashboard === "function") renderDashboard();
}

window.openAddProspectForInfluencer = openAddProspectForInfluencer;
window.closeReferralDialog = closeReferralDialog;
window.handleReferralSubmit = handleReferralSubmit;

// ══════════════════════════════════════════════════════════════════════════
// BULK OUTREACH CONTROLLER & BATCH EMAIL DISPATCH
// ══════════════════════════════════════════════════════════════════════════

database.selectedOutboundRows = database.selectedOutboundRows || [];
let bulkSelectedContactsCache = [];
let bulkActivePreviewContactId = null;

const BULK_TEMPLATES = {
  compliance_guardrails: {
    subject: "Query validation guardrails & compliance for {{company}}",
    body: `Hi {{firstName}},

I saw your profile as {{jobTitle}} at {{company}}. Many credit union and financial technology leaders we consult are evaluating LLM query pipelines, but are concerned about compliance verification.

We provide real-time query validation guardrails designed specifically for {{industry}} organizations.

Would 15 minutes next Tuesday work for a brief intro?

Best regards,
Autonomous BDR Agent`
  },
  scaling_ops: {
    subject: "Automating outbound & partner referrals for {{company}}",
    body: `Hi {{firstName}},

Notice {{company}} is scaling operations. Our autonomous BDR orchestrator helps teams streamline prospect research, dossier generation, and compliant outbound sequences.

Would you be open to a 10-minute briefing next week to see how we save 15+ engineering hours?

Best regards,
Autonomous BDR Agent`
  },
  warm_referral: {
    subject: "Introduction re: automated GTM intelligence for {{company}}",
    body: `Hi {{firstName}},

Connecting regarding your leadership as {{jobTitle}} at {{company}}.

Our platform coordinates executive partner networks and automated lead intelligence for {{industry}} teams.

Would next Tuesday at 2 PM work for a brief intro?

Best regards,
Autonomous BDR Agent`
  }
};

function toggleSelectAllOutbound(elem) {
  database.selectedOutboundRows = [];
  const checkboxes = document.querySelectorAll(".row-check-outbound");
  checkboxes.forEach(cb => {
    cb.checked = elem.checked;
    if (elem.checked) {
      const id = parseInt(cb.getAttribute("data-id"));
      if (!isNaN(id)) database.selectedOutboundRows.push(id);
    }
  });
  if (typeof updateGlobalSelectionBar === "function") updateGlobalSelectionBar();
}

function toggleSelectOutboundRow(elem, id) {
  database.selectedOutboundRows = database.selectedOutboundRows || [];
  if (elem.checked) {
    if (!database.selectedOutboundRows.includes(id)) {
      database.selectedOutboundRows.push(id);
    }
  } else {
    database.selectedOutboundRows = database.selectedOutboundRows.filter(rowId => rowId !== id);
  }

  const checkAll = document.getElementById("check-all-outbound");
  if (checkAll) {
    const checkboxes = document.querySelectorAll(".row-check-outbound");
    const checkedBoxes = document.querySelectorAll(".row-check-outbound:checked");
    checkAll.checked = checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
  }

  if (typeof updateGlobalSelectionBar === "function") updateGlobalSelectionBar();
}

function getSelectedContactsForOutreach() {
  const ids = new Set([
    ...(database.selectedUploadRows || []),
    ...(database.selectedOutboundRows || [])
  ]);
  if (ids.size === 0) return [];
  return (database.contacts || []).filter(c => ids.has(c.id));
}

function openBulkOutboundModal(source) {
  const selectedContacts = getSelectedContactsForOutreach();
  if (selectedContacts.length === 0) {
    alert("Please select one or more contacts using the checkboxes first.");
    return;
  }

  bulkSelectedContactsCache = selectedContacts;
  bulkActivePreviewContactId = selectedContacts[0].id;

  // Render recipient chips
  const chipsContainer = document.getElementById("bulk-recipients-chips-container");
  const countEl = document.getElementById("bulk-modal-recipient-count");
  const validCountEl = document.getElementById("bulk-modal-email-valid-count");
  const previewSelect = document.getElementById("bulk-preview-recipient-select");
  const sendBtnLabel = document.getElementById("bulk-send-btn-label");
  const senderStatus = document.getElementById("bulk-sender-status-label");

  if (countEl) countEl.textContent = selectedContacts.length;
  if (sendBtnLabel) sendBtnLabel.textContent = `Dispatch ${selectedContacts.length} Emails`;

  const validEmails = selectedContacts.filter(c => c.email && c.email.includes("@"));
  if (validCountEl) {
    if (validEmails.length === selectedContacts.length) {
      validCountEl.textContent = `All ${selectedContacts.length} contacts have valid email addresses`;
      validCountEl.style.color = "var(--color-success)";
    } else {
      validCountEl.textContent = `${validEmails.length} of ${selectedContacts.length} have valid emails (${selectedContacts.length - validEmails.length} missing)`;
      validCountEl.style.color = "var(--color-warning, #eab308)";
    }
  }

  if (senderStatus) {
    senderStatus.textContent = database.googleEmailConnected ? "Connected Google account (Admin CC)" : "Connect Google to send";
  }

  if (chipsContainer) {
    chipsContainer.innerHTML = selectedContacts.map(c => {
      const hasEmail = c.email && c.email.includes("@");
      const chipClass = hasEmail ? "bulk-recipient-chip" : "bulk-recipient-chip missing-email";
      return `
        <span class="${chipClass}">
          <strong>${c.fullName}</strong>
          <span style="opacity: 0.75; font-size: 10.5px;">(${c.email || 'No email'})</span>
        </span>
      `;
    }).join('');
  }

  if (previewSelect) {
    previewSelect.innerHTML = selectedContacts.map(c => {
      return `<option value="${c.id}">${c.fullName} (${c.company || 'Org'})</option>`;
    }).join('');
    previewSelect.value = String(bulkActivePreviewContactId);
  }

  // Prepopulate default template
  applyBulkTemplate("compliance_guardrails");

  // Reset progress bar
  const progressContainer = document.getElementById("bulk-dispatch-progress-container");
  if (progressContainer) progressContainer.style.display = "none";
  const sendBtn = document.getElementById("btn-bulk-outbound-send");
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      <span id="bulk-send-btn-label">Dispatch ${selectedContacts.length} Emails</span>
    `;
  }

  const dlg = document.getElementById("bulk-outbound-modal");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "flex";
  }
}

function closeBulkOutboundModal() {
  const dlg = document.getElementById("bulk-outbound-modal");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function applyBulkTemplate(templateKey) {
  const tpl = BULK_TEMPLATES[templateKey] || BULK_TEMPLATES.compliance_guardrails;
  const subjInput = document.getElementById("bulk-email-subject-input");
  const bodyInput = document.getElementById("bulk-email-body-input");
  if (subjInput) subjInput.value = tpl.subject;
  if (bodyInput) bodyInput.value = tpl.body;
  updateBulkLivePreview();
}

function insertVariableTag(tag) {
  const subjInput = document.getElementById("bulk-email-subject-input");
  const bodyInput = document.getElementById("bulk-email-body-input");
  const activeEl = document.activeElement;

  const target = (activeEl === subjInput) ? subjInput : bodyInput;
  if (!target) return;

  const start = target.selectionStart || 0;
  const end = target.selectionEnd || 0;
  const val = target.value;
  target.value = val.substring(0, start) + tag + val.substring(end);
  target.focus();
  target.selectionStart = target.selectionEnd = start + tag.length;
  updateBulkLivePreview();
}

function renderTextWithVariables(text, contact) {
  if (!text || !contact) return "";
  const firstName = contact.firstName || (contact.fullName ? contact.fullName.split(" ")[0] : "there");
  const lastName = contact.lastName || (contact.fullName ? contact.fullName.split(" ").slice(1).join(" ") : "");
  return text
    .replace(/\{\{firstName\}\}/gi, firstName)
    .replace(/\{\{lastName\}\}/gi, lastName)
    .replace(/\{\{fullName\}\}/gi, contact.fullName || "Valued Leader")
    .replace(/\{\{company\}\}/gi, contact.company || "your organization")
    .replace(/\{\{jobTitle\}\}/gi, contact.jobTitle || "Executive")
    .replace(/\{\{industry\}\}/gi, contact.industry || "credit union");
}

function updateBulkLivePreview() {
  const contact = bulkSelectedContactsCache.find(c => String(c.id) === String(bulkActivePreviewContactId)) || bulkSelectedContactsCache[0];
  if (!contact) return;

  const rawSubj = document.getElementById("bulk-email-subject-input")?.value || "";
  const rawBody = document.getElementById("bulk-email-body-input")?.value || "";

  const renderedSubj = renderTextWithVariables(rawSubj, contact);
  const renderedBody = renderTextWithVariables(rawBody, contact);

  const prevEmail = document.getElementById("bulk-preview-recipient-email");
  const prevSubj = document.getElementById("bulk-preview-rendered-subject");
  const prevBody = document.getElementById("bulk-preview-rendered-body");

  if (prevEmail) prevEmail.textContent = contact.email || "No email available";
  if (prevSubj) prevSubj.textContent = `Subject: ${renderedSubj}`;
  if (prevBody) prevBody.textContent = renderedBody;
}

function renderBulkPreviewForContact(contactId) {
  bulkActivePreviewContactId = contactId;
  updateBulkLivePreview();
}

async function executeBulkOutboundSend() {
  const selectedContacts = bulkSelectedContactsCache.filter(c => c.email && c.email.includes("@"));
  if (selectedContacts.length === 0) {
    alert("None of the selected contacts have a valid email address.");
    return;
  }

  const rawSubject = document.getElementById("bulk-email-subject-input")?.value.trim();
  const rawBody = document.getElementById("bulk-email-body-input")?.value.trim();

  if (!rawSubject || !rawBody) {
    alert("Please provide both a subject line and message body before dispatching.");
    return;
  }

  if (!confirm(`Dispatch personalized emails to ${selectedContacts.length} selected recipients via Google Workspace?`)) {
    return;
  }

  const sendBtn = document.getElementById("btn-bulk-outbound-send");
  const progressContainer = document.getElementById("bulk-dispatch-progress-container");
  const progressText = document.getElementById("bulk-progress-status-text");
  const progressPct = document.getElementById("bulk-progress-percentage");
  const progressFill = document.getElementById("bulk-progress-fill");

  if (sendBtn) sendBtn.disabled = true;
  if (progressContainer) progressContainer.style.display = "block";

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < selectedContacts.length; i++) {
    const contact = selectedContacts[i];
    const personalizedSubject = renderTextWithVariables(rawSubject, contact);
    const personalizedBody = renderTextWithVariables(rawBody, contact);

    const currentNum = i + 1;
    const pct = Math.round((currentNum / selectedContacts.length) * 100);

    if (progressText) progressText.textContent = `Sending ${currentNum} of ${selectedContacts.length}: ${contact.fullName}...`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (progressFill) progressFill.style.width = `${pct}%`;

    try {
      const result = await sendGoogleGmail({ to: contact.email, subject: personalizedSubject, body: personalizedBody });
      contact.emailsSent = true;
      contact.emailSentAt = new Date().toISOString();
      contact.emailDraft = { subject: personalizedSubject, body: personalizedBody };
      contact.emailProviderId = result?.id || null;
      database.stats.emailsSent = (database.stats.emailsSent || 0) + 1;
      sentCount++;
      addLogConsole("campaign-outbound", `[GMAIL BATCH] Sent to ${contact.fullName} (${contact.email})`, "success");
    } catch (err) {
      failedCount++;
      addLogConsole("campaign-outbound", `[GMAIL BATCH ERROR] Failed for ${contact.fullName}: ${err.message}`, "error");
    }

    // Rate-limit throttle pacing: 300ms between dispatches
    if (i < selectedContacts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  saveDatabaseCache();
  if (typeof saveWorkbookToServer === "function") saveWorkbookToServer();

  if (progressText) progressText.textContent = `Batch complete! Dispatched: ${sentCount}, Errors: ${failedCount}`;

  // Clear selections
  database.selectedUploadRows = [];
  database.selectedOutboundRows = [];
  const checkAllUpload = document.getElementById("check-all-upload");
  if (checkAllUpload) checkAllUpload.checked = false;
  const checkAllOutbound = document.getElementById("check-all-outbound");
  if (checkAllOutbound) checkAllOutbound.checked = false;

  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof filterUploadTable === "function") filterUploadTable();
  if (typeof updateGlobalSelectionBar === "function") updateGlobalSelectionBar();

  setTimeout(() => {
    closeBulkOutboundModal();
    alert(`Bulk Outreach Completed! Successfully dispatched ${sentCount} personalized emails via Google Workspace.`);
  }, 900);
}

// --- AI CUSTOM PROMPT EMAIL DRAFTING ENGINE (SINGLE & BULK) ---

function parseSubjectAndBody(content, fallbackSubject) {
  if (!content) return { subject: fallbackSubject, body: "" };
  let subject = fallbackSubject;
  let body = content;

  const subjectMatch = content.match(/Subject:\s*([^\n\r]+)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    body = content.replace(/Subject:\s*[^\n\r]+/i, "").trim();
  }

  // Clean up any extraneous leading/trailing markdown or quotes
  body = body.replace(/^["'`]|["'`]$/g, "").trim();
  return { subject, body };
}

async function callGeminiOrLlmDraft({ instructions, contact, isBulk, existingSubject, existingBody, channel = "email" }) {
  const headers = { "Content-Type": "application/json" };
  const token = window.Clerk?.session ? await window.Clerk.session.getToken().catch(() => "") : "";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch("/api/ai/draft", {
    method: "POST",
    headers,
    body: JSON.stringify({
      instructions,
      contact: contact ? {
        fullName: contact.fullName,
        jobTitle: contact.jobTitle,
        company: contact.company,
        industry: contact.industry
      } : {},
      isBulk: Boolean(isBulk),
      existingSubject: existingSubject || "",
      existingBody: existingBody || "",
      channel,
      geminiModel: database.geminiModel || "gemini-3.5-flash"
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `AI drafting failed (${response.status}).`);
  if (channel === "linkedin") {
    if (!result.note || !result.provider) throw new Error("The AI provider returned an incomplete LinkedIn note. No placeholder draft was used.");
  } else if (!result.subject || !result.body || !result.provider) {
    throw new Error("The AI provider returned an incomplete draft. No placeholder draft was used.");
  }
  return result;
}

async function generateAIOutboundWithPrompt() {
  const contact = database.selectedContact;
  const promptInput = document.getElementById("outbound-ai-prompt-input");
  const subjInput = document.getElementById("outbound-email-subject-input");
  const bodyInput = document.getElementById("outbound-email-body-input");
  const runBtn = document.getElementById("btn-run-ai-prompt");
  const prevBox = document.getElementById("outbound-email-preview-box");

  const instructions = promptInput ? promptInput.value.trim() : "";
  if (!instructions && !confirm("No specific instructions entered. Generate a tailored draft using default smart BDR angle?")) {
    if (promptInput) promptInput.focus();
    return;
  }

  const origBtnHtml = runBtn ? runBtn.innerHTML : "";
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
      <span>Drafting...</span>
    `;
  }

  if (bodyInput) bodyInput.classList.add("text-blur-out", "rainbow-active");
  if (prevBox) prevBox.classList.add("rainbow-active");

  try {
    const draft = await callGeminiOrLlmDraft({
      instructions,
      contact,
      isBulk: false,
      existingSubject: subjInput?.value || "",
      existingBody: bodyInput?.value || ""
    });

    if (draft?.body) draft.body = ensureCalendlyBookingLink(draft.body);

    if (subjInput && draft.subject) {
      subjInput.value = draft.subject;
    }

    if (bodyInput && draft.body) {
      if (contact) {
        contact.emailDraft = { subject: draft.subject, body: draft.body };
        if (typeof saveDatabaseCache === "function") saveDatabaseCache();
      }
      bodyInput.value = "";
      bodyInput.classList.remove("text-blur-out");
      bodyInput.classList.add("text-swoosh-in");

      const words = draft.body.split(" ");
      let idx = 0;
      const interval = setInterval(() => {
        if (idx < words.length) {
          bodyInput.value += (idx === 0 ? "" : " ") + words[idx];
          updateOutboundLivePreview();
          idx++;
        } else {
          clearInterval(interval);
          bodyInput.classList.remove("rainbow-active", "text-swoosh-in");
          if (prevBox) prevBox.classList.remove("rainbow-active");
        }
      }, 16);
    } else {
      updateOutboundLivePreview();
      if (bodyInput) bodyInput.classList.remove("rainbow-active", "text-blur-out");
      if (prevBox) prevBox.classList.remove("rainbow-active");
    }

    addLogConsole("campaign-outbound", `[AI DRAFT] Generated customized single outreach draft with prompt: "${instructions || 'Default BDR'}"`, "success");
  } catch (err) {
    console.error("AI Outbound Draft generation error:", err);
    alert(`Could not draft email: ${err.message}`);
    if (bodyInput) bodyInput.classList.remove("rainbow-active", "text-blur-out");
    if (prevBox) prevBox.classList.remove("rainbow-active");
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = origBtnHtml;
    }
  }
}

function setOutboundPromptSuggestion(text) {
  const input = document.getElementById("outbound-ai-prompt-input");
  if (input) {
    input.value = text;
    input.focus();
  }
  generateAIOutboundWithPrompt();
}

async function generateBulkWithCustomPrompt() {
  const promptInput = document.getElementById("bulk-ai-prompt-input");
  const subjInput = document.getElementById("bulk-email-subject-input");
  const bodyInput = document.getElementById("bulk-email-body-input");
  const runBtn = document.getElementById("btn-bulk-run-prompt");

  const instructions = promptInput ? promptInput.value.trim() : "";
  if (!instructions && !confirm("No specific instructions entered. Generate a batch outreach template using default smart BDR angle?")) {
    if (promptInput) promptInput.focus();
    return;
  }

  const origBtnHtml = runBtn ? runBtn.innerHTML : "";
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
      <span>Drafting...</span>
    `;
  }

  if (bodyInput) bodyInput.classList.add("text-blur-out");

  try {
    const draft = await callGeminiOrLlmDraft({
      instructions,
      contact: bulkSelectedContactsCache[0] || null,
      isBulk: true,
      existingSubject: subjInput?.value || "",
      existingBody: bodyInput?.value || ""
    });

    if (draft?.body) draft.body = ensureCalendlyBookingLink(draft.body);

    if (subjInput && draft.subject) {
      subjInput.value = draft.subject;
    }

    if (bodyInput && draft.body) {
      bodyInput.value = "";
      bodyInput.classList.remove("text-blur-out");
      bodyInput.classList.add("text-swoosh-in");

      const words = draft.body.split(" ");
      let idx = 0;
      const interval = setInterval(() => {
        if (idx < words.length) {
          bodyInput.value += (idx === 0 ? "" : " ") + words[idx];
          updateBulkLivePreview();
          idx++;
        } else {
          clearInterval(interval);
          bodyInput.classList.remove("text-swoosh-in");
        }
      }, 16);
    } else {
      if (bodyInput) bodyInput.classList.remove("text-blur-out");
      updateBulkLivePreview();
    }

    addLogConsole("campaign-outbound", `[AI BATCH DRAFT] Generated customized bulk outreach draft with prompt: "${instructions || 'Default BDR'}"`, "success");
  } catch (err) {
    console.error("Bulk AI Draft generation error:", err);
    alert(`Could not draft bulk email: ${err.message}`);
    if (bodyInput) bodyInput.classList.remove("text-blur-out");
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = origBtnHtml;
    }
  }
}

function setBulkPromptSuggestion(text) {
  const input = document.getElementById("bulk-ai-prompt-input");
  if (input) {
    input.value = text;
    input.focus();
  }
  generateBulkWithCustomPrompt();
}

async function refreshOutboundData() {
  const btn = document.getElementById("outbound-btn-refresh-data");
  if (btn) btn.classList.add("loading");
  try {
    if (typeof loadWorkbookFromServer === "function") await loadWorkbookFromServer();
    if (typeof initLoadedData === "function") initLoadedData();
    filterOutboundTable();
    if (typeof showToast === "function") showToast("Outbound data refreshed.");
  } catch (err) {
    console.warn("Outbound refresh failed:", err);
  } finally {
    if (btn) btn.classList.remove("loading");
  }
}

window.toggleSelectAllOutbound = toggleSelectAllOutbound;
window.toggleSelectOutboundRow = toggleSelectOutboundRow;
window.openBulkOutboundModal = openBulkOutboundModal;
window.closeBulkOutboundModal = closeBulkOutboundModal;
window.applyBulkTemplate = applyBulkTemplate;
window.insertVariableTag = insertVariableTag;
window.updateBulkLivePreview = updateBulkLivePreview;
window.renderBulkPreviewForContact = renderBulkPreviewForContact;
window.executeBulkOutboundSend = executeBulkOutboundSend;
window.generateAIOutboundWithPrompt = generateAIOutboundWithPrompt;
window.setOutboundPromptSuggestion = setOutboundPromptSuggestion;
window.generateBulkWithCustomPrompt = generateBulkWithCustomPrompt;
window.setBulkPromptSuggestion = setBulkPromptSuggestion;
window.refreshOutboundData = refreshOutboundData;

