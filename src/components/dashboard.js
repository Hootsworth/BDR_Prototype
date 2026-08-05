// --- DASHBOARD DATA AND ACTIVITY RENDERING CONTROLLER ---

function renderDashboard() {
  const totalContactsEl = document.getElementById("dashboard-total-contacts");
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
  const enriched = database.contacts.filter(c => c.enriched).length;
  const emailsCount = database.contacts.filter(c => c.emailsSent).length;
  const linkedinCount = database.contacts.filter(c => c.linkedinSent).length;
  const outbound = emailsCount + linkedinCount + (database.stats.emailsSent || 0) + (database.stats.linkedinSent || 0);
  
  // Calculate meetings booked from the schedule
  const meetings = database.meetings ? database.meetings.length : 0;
  const hotLeads = database.contacts.filter(c => c.leadTemp === "Hot Lead").length;
  
  totalContactsEl.textContent = total.toLocaleString();
  enrichedContactsEl.textContent = enriched.toLocaleString();
  outboundSentEl.textContent = outbound.toLocaleString();
  meetingsBookedEl.textContent = meetings.toLocaleString();

  // Progress Bar
  const enrichmentPct = total > 0 ? Math.round((enriched / total) * 100) : 0;
  if (pipelinePctEl) pipelinePctEl.textContent = `${enrichmentPct}%`;
  if (pipelineFillEl) pipelineFillEl.style.width = `${enrichmentPct}%`;

  // Hot Leads & Briefings
  if (hotLeadsCountEl) hotLeadsCountEl.textContent = hotLeads.toLocaleString();
  if (openBriefsCountEl) openBriefsCountEl.textContent = meetings.toLocaleString();

  // API sync key status chip
  if (apiStatusChipEl) {
    if (database.exploriumApiKey) {
      apiStatusChipEl.textContent = "Verified";
      apiStatusChipEl.style.color = "var(--success)";
      apiStatusChipEl.style.borderColor = "var(--success)";
    } else {
      apiStatusChipEl.textContent = "Offline";
      apiStatusChipEl.style.color = "var(--muted)";
      apiStatusChipEl.style.borderColor = "var(--hairline)";
    }
  }

  // Agent Status Text
  if (agentStatusTextEl) {
    if (total === 0) {
      agentStatusTextEl.textContent = "Inactive. Please upload a CSV dataset to initialize campaigns.";
    } else if (enrichmentPct < 100) {
      agentStatusTextEl.textContent = `Enrichment pipeline active. Enriched ${enriched} of ${total} leads.`;
    } else {
      agentStatusTextEl.textContent = "Idle. All leads verified and ready for outbound sequences.";
    }
  }

  // Activity Feed
  renderDashboardActivityFeed();
}

function renderDashboardActivityFeed() {
  const feedEl = document.getElementById("dashboard-activity-feed");
  if (!feedEl) return;

  if (!database.recentActivities || database.recentActivities.length === 0) {
    database.recentActivities = [];
  }

  if (database.recentActivities.length === 0) {
    feedEl.innerHTML = `<div class="feed-empty-state">No execution logs yet. Import real contacts or open a workbook to begin.</div>`;
    return;
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
