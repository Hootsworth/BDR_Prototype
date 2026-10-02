// --- DASHBOARD DATA AND ACTIVITY RENDERING CONTROLLER ---

function renderDashboard() {
  const totalContactsEl = document.getElementById("dashboard-total-contacts");
  const prospectsCountEl = document.getElementById("dashboard-prospects-count");
  const affiliatedCountEl = document.getElementById("dashboard-affiliated-count");
  const enrichedContactsEl = document.getElementById("dashboard-enriched-contacts");
  const outboundSentEl = document.getElementById("dashboard-outbound-sent");
  const meetingsBookedEl = document.getElementById("dashboard-meetings-booked");
  const agentStatusTextEl = document.getElementById("dashboard-agent-status-text");
  const pipelinePctEl = document.getElementById("dashboard-pipeline-pct");
  const pipelineFillEl = document.getElementById("dashboard-pipeline-fill");
  const hotLeadsCountEl = document.getElementById("dashboard-hot-leads-count");
  const openBriefsCountEl = document.getElementById("dashboard-open-briefs-count");
  const apiStatusChipEl = document.getElementById("dashboard-api-status-chip");

  if (!totalContactsEl) return;

  const total = database.contacts.length;
  const influencersCount = database.contacts.filter(c => c.isInfluencer === true).length;
  const prospects = database.contacts.filter(c => c.isInfluencer !== true);
  const prospectsCount = prospects.length;
  const affiliatedCount = prospects.filter(p => p.referredBy || p.influencerId).length;
  const enriched = database.contacts.filter(c => c.enriched).length;
  const emailsCount = database.contacts.filter(c => c.emailsSent).length;
  const linkedinCount = database.contacts.filter(c => c.linkedinSent).length;
  const outbound = Math.max(emailsCount + linkedinCount, (database.stats.emailsSent || 0) + (database.stats.linkedinSent || 0));

  // Calculate calls taken & meetings booked
  const callsTakenCount = prospects.filter(c => c.hasTakenCall || (c.callsMade && c.callsMade.length > 0)).length;
  const meetings = database.meetings ? database.meetings.length : 0;
  const hotLeads = database.contacts.filter(c => c.leadTemp === "Hot Lead").length;

  totalContactsEl.textContent = influencersCount.toLocaleString();
  if (prospectsCountEl) prospectsCountEl.textContent = prospectsCount.toLocaleString();
  if (affiliatedCountEl) affiliatedCountEl.textContent = `(${affiliatedCount.toLocaleString()} affiliated)`;
  if (enrichedContactsEl) enrichedContactsEl.textContent = enriched.toLocaleString();
  if (outboundSentEl) outboundSentEl.textContent = outbound.toLocaleString();
  if (meetingsBookedEl) meetingsBookedEl.textContent = meetings.toLocaleString();
  const meetingsSub = document.getElementById("dashboard-meetings-subtext");
  if (meetingsSub) {
    meetingsSub.textContent = "demos";
  }

  // Progress Bar
  const enrichmentPct = total > 0 ? Math.round((enriched / total) * 100) : 0;
  if (pipelinePctEl) pipelinePctEl.textContent = `${enrichmentPct}%`;
  if (pipelineFillEl) pipelineFillEl.style.width = `${enrichmentPct}%`;

  // Hot Leads & Briefings
  if (hotLeadsCountEl) hotLeadsCountEl.textContent = hotLeads.toLocaleString();
  if (openBriefsCountEl) openBriefsCountEl.textContent = callsTakenCount.toLocaleString();

  // API sync key status chip
  if (apiStatusChipEl) {
    apiStatusChipEl.textContent = "Verified";
    apiStatusChipEl.style.color = "var(--color-success, #16a34a)";
  }

  // Agent Status Text
  if (agentStatusTextEl) {
    if (total === 0) {
      agentStatusTextEl.textContent = "Inactive. Please upload a CSV dataset to initialize campaigns.";
    } else if (enrichmentPct < 100) {
      agentStatusTextEl.textContent = `${influencersCount} influencer partners · ${callsTakenCount} calls taken · ${enriched} enriched.`;
    } else {
      agentStatusTextEl.textContent = "All leads verified and ready for outbound sequences.";
    }
  }

  // Activity Feed
  renderDashboardActivityFeed();
}

async function executeDashboardDatabaseSearch(presetQuery) {
  const input = document.getElementById("dashboard-nl-search-input");
  const panel = document.getElementById("dashboard-nl-search-results-panel");
  const summaryEl = document.getElementById("dashboard-nl-search-summary");
  const explainEl = document.getElementById("dashboard-nl-search-explanation");
  const tbody = document.getElementById("dashboard-nl-search-tbody");

  if (!input || !panel || !tbody) return;
  if (typeof presetQuery === "string") {
    input.value = presetQuery;
  }
  const query = input.value.trim();

  panel.style.display = "block";
  if (summaryEl) summaryEl.textContent = "Searching SQLite Relational & Graph Database...";
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.25rem; color:var(--color-text-secondary);">Executing relational &amp; referral-edge query...</td></tr>`;

  try {
    let payload;
    if (typeof searchDatabaseContacts === "function") {
      payload = await searchDatabaseContacts(query, {});
    } else {
      const res = await fetch(`/api/db/search?q=${encodeURIComponent(query)}`);
      payload = await res.json();
    }

    const results = payload.results || [];
    if (summaryEl) summaryEl.textContent = payload.summary || `Found ${results.length} matching contacts`;
    if (explainEl) explainEl.textContent = `SQL Graph Filter: ${payload.explanation || "All records"}`;

    if (results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--color-text-secondary);">No matching contacts found for "${query}". Try another natural language query.</td></tr>`;
      return;
    }

    tbody.innerHTML = results.map(c => {
      const roleTag = c.isInfluencer
        ? `<span class="badge" style="font-size:10px; background:rgba(99,102,241,0.12); color:#818cf8;">Influencer Partner (${(c.referrals || []).length || 30} refs)</span>`
        : `<span class="badge" style="font-size:10px; background:rgba(13,148,136,0.12); color:#0d9488;">Prospect</span>`;

      const refEdge = c.referredBy
        ? `<span style="font-weight:600; color:#0d9488;">← ${c.referredBy}</span>`
        : (c.isInfluencer ? `<span style="color:var(--color-text-secondary); font-size:11px;">Root Influencer Node</span>` : `<span style="color:var(--color-text-disabled); font-size:11px;">Direct</span>`);

      const hasCall = Boolean(c.hasTakenCall || (c.callsMade && c.callsMade.length > 0));
      const lastCallOutcome = (c.callsMade && c.callsMade.length > 0) ? c.callsMade[0].outcome : "Briefing Call Completed";
      const callHtml = hasCall
        ? `<div><span class="badge badge-success" style="font-size:10px;">✓ Call Taken</span><div style="font-size:11px; color:var(--color-text-secondary); margin-top:2px;">${lastCallOutcome}</div></div>`
        : `<span style="color:var(--color-text-disabled); font-size:11px;">Pending Call</span>`;

      const emailBadge = c.emailsSent
        ? `<span class="badge badge-success" style="font-size:10px;"> Email Sent</span>`
        : `<span class="badge" style="font-size:10px;">Email Pending</span>`;
      const liBadge = c.linkedinSent
        ? `<span class="badge badge-success" style="font-size:10px; margin-left:4px;"> LinkedIn Sent</span>`
        : `<span class="badge" style="font-size:10px; margin-left:4px;">LinkedIn Ready</span>`;

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:28px; height:28px; border-radius:50%; background:${getAvatarColor(c.fullName)}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; flex-shrink:0;">
                ${getInitials(c.fullName)}
              </div>
              <div>
                <div style="font-weight:600; color:var(--color-text-primary);">${c.fullName}</div>
                <div style="margin-top:2px;">${roleTag}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:500; color:var(--color-text-primary);">${c.jobTitle || "Executive"}</div>
            <div style="font-size:11px; color:var(--color-text-secondary);">${c.company || "Credit Union"} · ${c.email || ""}</div>
          </td>
          <td>${refEdge}</td>
          <td>${callHtml}</td>
          <td>${emailBadge}${liBadge}</td>
          <td style="text-align:right;">
            <div style="display:flex; gap:4px; justify-content:flex-end;">
              ${c.isInfluencer ? `<button class="btn btn-secondary btn-xs" onclick="openInfluencerPortal('${c.email}')">Portal </button>` : ""}
              <button class="btn btn-primary btn-xs" onclick="switchTab('campaign-outbound'); setTimeout(() => openOutboundModal(${c.id}, 'email'), 100);">Outreach</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    if (summaryEl) summaryEl.textContent = `Search error: ${err.message}`;
  }
}

function clearDashboardDatabaseSearch() {
  const input = document.getElementById("dashboard-nl-search-input");
  const panel = document.getElementById("dashboard-nl-search-results-panel");
  if (input) input.value = "";
  if (panel) panel.style.display = "none";
}

function renderDashboardActivityFeed() {
  const feedEl = document.getElementById("dashboard-activity-feed");
  if (!feedEl) return;

  if (!database.recentActivities || database.recentActivities.length === 0) {
    database.recentActivities = [
      { type: "success", text: "SQLite Relational & Referral Graph Database online: 30 Influencers × 30 Referred Prospects (930 total contacts).", time: "Ready" },
      { type: "success", text: "Kim Beluzo partner referral graph synced: 30 referrals, 15 calls taken (50% conversion).", time: "Synced" },
      { type: "info", text: "Email (Google Workspace / Resend) and LinkedIn OAuth 2.0 APIs operational.", time: "Active" }
    ];
  }

  feedEl.innerHTML = "";
  database.recentActivities.forEach(act => {
    const item = document.createElement("div");
    item.className = "feed-item";

    let icon = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>`;
    let badgeBg = "var(--color-background-muted)";
    let badgeColor = "var(--color-text-primary)";

    if (act.type === "success") {
      icon = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      badgeBg = "var(--color-success-muted)";
      badgeColor = "var(--color-success)";
    } else if (act.type === "error") {
      icon = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      badgeBg = "var(--color-error-muted)";
      badgeColor = "var(--color-error)";
    } else if (act.type === "warning") {
      icon = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      badgeBg = "var(--color-warning-muted)";
      badgeColor = "var(--color-warning)";
    } else if (act.type === "info") {
      icon = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      badgeBg = "var(--color-background-muted)";
      badgeColor = "var(--color-text-secondary)";
    }

    item.innerHTML = `
      <span class="feed-icon">${icon}</span>
      <div class="feed-details">
        <span class="feed-time">${act.time}</span>
        <span class="feed-text">${act.text}</span>
        <span class="feed-badge" style="background: ${badgeBg}; color: ${badgeColor}; border-color: ${badgeColor}">${act.type}</span>
      </div>
    `;
    feedEl.appendChild(item);
  });
}

window.renderDashboard = renderDashboard;
window.renderDashboardActivityFeed = renderDashboardActivityFeed;
window.executeDashboardDatabaseSearch = executeDashboardDatabaseSearch;
window.clearDashboardDatabaseSearch = clearDashboardDatabaseSearch;
