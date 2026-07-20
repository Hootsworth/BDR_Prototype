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
    // Generate default initial history logs if empty
    database.recentActivities = [
      { type: "success", text: "GTM Console loaded successfully.", time: new Date().toLocaleTimeString() },
      { type: "info", text: "Simulated sandbox databases initialized.", time: new Date().toLocaleTimeString() },
      { type: "info", text: "Connected to Clerk auth gate servers.", time: new Date().toLocaleTimeString() }
    ];

    if (database.contacts.length > 0) {
      database.recentActivities.unshift(
        { type: "success", text: `Cached list containing ${database.contacts.length} leads loaded successfully.`, time: new Date().toLocaleTimeString() },
        { type: "info", text: "GTM Research Copilot scanning target personas.", time: new Date().toLocaleTimeString() }
      );
    }
  }

  feedEl.innerHTML = "";
  database.recentActivities.forEach(act => {
    const item = document.createElement("div");
    item.className = "feed-item";

    let icon = "⚙️";
    let badgeBg = "rgba(10, 10, 10, 0.1)";
    let badgeColor = "var(--ink)";

    if (act.type === "success") {
      icon = "✅";
      badgeBg = "rgba(34, 197, 94, 0.1)";
      badgeColor = "var(--success)";
    } else if (act.type === "error") {
      icon = "❌";
      badgeBg = "rgba(239, 68, 68, 0.1)";
      badgeColor = "var(--error)";
    } else if (act.type === "warning") {
      icon = "⚠️";
      badgeBg = "rgba(245, 158, 11, 0.1)";
      badgeColor = "var(--warning)";
    } else if (act.type === "info") {
      icon = "ℹ️";
      badgeBg = "rgba(59, 130, 246, 0.1)";
      badgeColor = "#3b82f6";
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
