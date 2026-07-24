// --- B2B INTEGRATION SANDBOX SIMULATOR CONTROLLER ---

function openSandbox(appType = 'apollo') {
  const modal = document.getElementById("sandbox-modal");
  if (modal) {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    switchSandboxTab(appType);
  }
}

function closeSandbox() {
  const modal = document.getElementById("sandbox-modal");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function switchSandboxTab(tabId) {
  document.querySelectorAll(".sandbox-menu-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`sb-menu-${tabId}`);
  if (activeBtn) activeBtn.classList.add("active");

  const viewport = document.getElementById("sandbox-viewport");
  if (!viewport) return;

  viewport.innerHTML = "";

  if (tabId === 'apollo') {
    renderApolloSandbox(viewport);
  } else if (tabId === 'outlook') {
    renderOutlookSandbox(viewport);
  } else if (tabId === 'linkedin') {
    renderLinkedinSandbox(viewport);
  } else if (tabId === 'lemlist') {
    renderLemlistSandbox(viewport);
  } else if (tabId === 'zerobounce') {
    renderZerobounceSandbox(viewport);
  }
}

function renderApolloSandbox(viewport) {
  let rows = "";
  database.contacts.forEach((c, i) => {
    const badgeClass = c.enriched ? "badge-success" : "badge-secondary";
    const badgeText = c.enriched ? "Enriched" : "Unenriched";
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:10px; font-weight:600;">${c.fullName}</td>
        <td style="padding:10px;">${c.company}</td>
        <td style="padding:10px; font-family:monospace;">${c.email || "N/A"}</td>
        <td style="padding:10px;"><span class="badge ${badgeClass}" style="padding:2px 8px; border-radius:10px; font-size:11px;">${badgeText}</span></td>
        <td style="padding:10px; font-weight:bold; color:var(--brand-coral);">${c.matchPercentage}%</td>
        <td style="padding:10px;">
          <button class="btn btn-secondary btn-sm" onclick="triggerApolloEnrich(${i})">Enrich</button>
        </td>
      </tr>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">🚀 Apollo.io Prospect Board</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">View leads parsed from the Apollo.io scraper. Enriched leads include verified cell numbers and seniority scores.</p>
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:10px;">Name</th>
            <th style="padding:10px;">Company</th>
            <th style="padding:10px;">Email</th>
            <th style="padding:10px;">Enrich State</th>
            <th style="padding:10px;">ICP Match</th>
            <th style="padding:10px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--muted);">No contacts loaded. Go to "Import Contacts" tab first.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.triggerApolloEnrich = function (idx) {
  const c = database.contacts[idx];
  if (!c) return;
  c.enriched = true;
  c.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanComp = c.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  c.linkedinUrl = `linkedin.com/in/${c.firstName.toLowerCase()}-${c.lastName.toLowerCase()}-${cleanComp}`;
  c.matchPercentage = 95;
  c.leadTemp = "Hot Lead";
  saveDatabaseCache();
  addLogConsole("enrich", `[APOLLO] Enriched lead manually: ${c.fullName}`, "success");
  switchSandboxTab('apollo');
  // Refresh main tables if visible
  if (typeof filterEnrichTable === "function") filterEnrichTable();
  if (typeof filterEmailTable === "function") filterEmailTable();
};

function renderOutlookSandbox(viewport) {
  const sentLeads = database.contacts.filter(c => c.emailsSent);
  let listHtml = "";
  sentLeads.forEach(c => {
    listHtml += `
      <div style="border:1.5px solid var(--hairline); border-radius: var(--radius-md); background:var(--surface-soft); padding:14px; margin-bottom:12px; text-align:left;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px;">
          <div>To: <strong>${c.fullName}</strong> (${c.email})</div>
          <div style="color:var(--success); font-weight:600;">Status: Outbound Delivered</div>
        </div>
        <div style="font-size:13px; font-weight:bold; margin-bottom:6px;">Subject: ${c.emailDraft ? c.emailDraft.subject : 'Safe compliance for ' + c.company}</div>
        <div style="font-size:12px; color:#4a4a4a; white-space:pre-wrap; background:#ffffff; padding:10px; border-radius:4px; border:1px solid var(--hairline); max-height:120px; overflow-y:auto;">${c.emailDraft ? c.emailDraft.body : 'N/A'}</div>
      </div>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">📧 Outlook Campaign Outbox</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Tracks direct SDR email outbound campaigns dispatched through your integrated Outlook account. Total Sent: <strong>${sentLeads.length}</strong></p>
      ${listHtml || '<div style="padding:40px; text-align:center; color:var(--muted); border:1.5px dashed var(--hairline); border-radius:8px;">No emails sent yet. Select a lead in "Campaign Email" tab and click Send.</div>'}
    </div>
  `;
}

function renderLinkedinSandbox(viewport) {
  let contactsList = "";
  database.contacts.forEach((c, idx) => {
    contactsList += `
      <button class="sandbox-menu-btn" style="padding:8px; font-size:11.5px; border-bottom:1px solid var(--hairline);" onclick="showLinkedinSandboxProfile(${idx})">
        👤 ${c.fullName}
      </button>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left; display:flex; gap:16px; height:100%;">
      <div style="width:160px; border-right:1px solid var(--hairline); display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
        <div style="font-size:11px; font-weight:bold; color:var(--muted); margin-bottom:6px; text-transform:uppercase;">Select Lead</div>
        <div style="overflow-y:auto; flex:1;">
          ${contactsList || '<div style="font-size:11px; color:var(--muted);">No leads.</div>'}
        </div>
      </div>
      <div id="linkedin-sb-profile-view" style="flex:1; display:flex; align-items:center; justify-content:center; border:1px dashed var(--hairline); border-radius:8px; padding:20px; color:var(--muted); font-size:12px;">
        Select a contact from the left list to inspect their live mock LinkedIn profile.
      </div>
    </div>
  `;

  if (database.contacts.length > 0) {
    showLinkedinSandboxProfile(0);
  }
}

window.showLinkedinSandboxProfile = function (idx) {
  const c = database.contacts[idx];
  const el = document.getElementById("linkedin-sb-profile-view");
  if (!c || !el) return;

  const initials = c.fullName.split(" ").map(n => n[0]).join("");
  const inviteMsg = c.linkedinDraft || `Hi ${c.firstName}, I saw your role as ${c.jobTitle} at ${c.company}. I'd love to share how we secure database operations for CU platforms. Let's connect!`;

  el.innerHTML = `
    <div style="width:100%; border:1px solid #e0e0e0; background:#ffffff; border-radius:8px; text-align:left; overflow:hidden;">
      <div style="height:65px; background:linear-gradient(90deg, #a0b2c6, #cbd5e1);"></div>
      <div style="padding: 0 16px; margin-top:-25px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div style="width:50px; height:50px; border-radius:50%; background:#0077b5; border:3px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:18px;">${initials}</div>
        <span style="font-size:10.5px; background:#e1f5fe; color:#0288d1; font-weight:bold; padding:2px 8px; border-radius:10px;">${c.leadTemp}</span>
      </div>
      <div style="padding:12px 16px 16px;">
        <h4 style="margin:0; font-size:15px; color:#191919;">${c.fullName}</h4>
        <div style="font-size:12px; color:#5e5e5e; margin-top:2px;">${c.jobTitle} at <strong>${c.company}</strong></div>
        <div style="font-size:11px; color:#8c8c8c; margin-top:2px;">Industry: ${c.industry} • Match: ${c.matchPercentage}%</div>
        
        <div style="border-top:1px solid #e0e0e0; margin-top:14px; padding-top:12px;">
          <div style="font-size:11px; font-weight:bold; color:#191919; margin-bottom:6px;">Personalized Invitation Note</div>
          <div style="font-size:11.5px; line-height:1.45; background:#f3f6f8; color:#191919; padding:8px 10px; border-radius:4px; border:1px solid #e0e0e0;">
            ${inviteMsg}
          </div>
        </div>
      </div>
    </div>
  `;
};

function renderLemlistSandbox(viewport) {
  const enrolled = database.contacts.filter(c => c.emailsSent);
  let rows = "";
  enrolled.forEach(c => {
    const template = c.leadTemp === "Hot Lead" ? "fintech_cto_llm" : "general_gtm";
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:8px; font-weight:600;">${c.fullName}</td>
        <td style="padding:8px;"><code>${c.email}</code></td>
        <td style="padding:8px; font-family:monospace;">#lemlist_${template}</td>
        <td style="padding:8px; color:var(--brand-coral); font-weight:bold;">100% (Sent)</td>
        <td style="padding:8px; color:var(--muted); font-size:11px;">MCP Sequence Active ⚡</td>
      </tr>
    `;
  });

  const isConnected = database.lemlistConnected;
  const statusBadge = isConnected ? '<span class="badge badge-success" style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700;">Connected ✓</span>' : '<span class="badge badge-warning" style="background:#fef3c7; color:#92400e; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700;">Auth Pending</span>';

  viewport.innerHTML = `
    <div style="text-align:left;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <h3 style="text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin:0;">⚡ Lemlist MCP Server Integration</h3>
        ${statusBadge}
      </div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:12px;">Model Context Protocol (MCP) server for Lemlist automated campaign sequencing. Total Leads Enrolled: <strong>${enrolled.length}</strong>.</p>
      
      <div style="background:var(--surface-soft, #f8fafc); border:1px solid var(--hairline, #e2e8f0); border-radius: var(--radius-sm, 6px); padding:12px 16px; margin-bottom:16px; font-size:12px; text-align:left; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div><strong>Authenticated Account:</strong> <code>${database.lemlistEmail || 'Not Authenticated'}</code></div>
        <div><strong>API Key Status:</strong> <code>${database.lemlistApiKey ? 'Configured (apiKey_***)' : 'Missing Key'}</code></div>
        <div style="grid-column: span 2;"><strong>MCP Remote Transport:</strong> <code>${database.lemlistMcpCommand || 'npx'} ${database.lemlistMcpArgs || 'mcp-remote https://app.lemlist.com/mcp'}</code></div>
      </div>

      <div style="background:#0f172a; color:#38bdf8; font-family:monospace; font-size:11px; padding:10px 14px; border-radius:6px; margin-bottom:16px; line-height:1.5;">
        <div>--> {"jsonrpc":"2.0","method":"tools/list","params":{}}</div>
        <div style="color:#4ade80;"><-- {"jsonrpc":"2.0","result":{"tools":["enroll_contact","list_campaigns","get_outbox_stats"]}}</div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:8px;">Recipient</th>
            <th style="padding:8px;">Email Address</th>
            <th style="padding:8px;">Campaign Sequence</th>
            <th style="padding:8px;">Sync Progress</th>
            <th style="padding:8px;">Sending Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--muted);">No sequences enrolled yet. Enroll contacts via Outbound or Agent Mode.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderZerobounceSandbox(viewport) {
  let rows = "";
  database.contacts.forEach((c, idx) => {
    let status = "Unverified";
    let color = "var(--muted)";
    if (c.email) {
      if (c.email.includes("invalid") || c.email.includes("test")) {
        status = "Invalid";
        color = "#ef4444";
      } else {
        status = "Valid";
        color = "var(--success)";
      }
    }
    rows += `
      <tr style="border-bottom:1px solid var(--hairline); text-align:left;">
        <td style="padding:8px; font-weight:600;">${c.fullName}</td>
        <td style="padding:8px; font-family:monospace;">${c.email || "N/A"}</td>
        <td style="padding:8px; font-weight:bold; color:${color};">${status}</td>
        <td style="padding:8px;">
          <button class="btn btn-secondary btn-sm" onclick="verifyZeroBounce(${idx})">Verify</button>
        </td>
      </tr>
    `;
  });

  viewport.innerHTML = `
    <div style="text-align:left;">
      <h3 style="margin-bottom:8px; text-transform:uppercase; font-size:14px; letter-spacing:0.5px; margin-top:0;">🔍 ZeroBounce Email Validator</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Perform real-time checkups on lead email bounce rates. Validation results prevent bounces and protect sender score reputation.</p>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:var(--surface-soft); text-align:left; border-bottom:1.5px solid var(--hairline);">
            <th style="padding:8px;">Prospect</th>
            <th style="padding:8px;">Email</th>
            <th style="padding:8px;">Verification Status</th>
            <th style="padding:8px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--muted);">No prospects available.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.verifyZeroBounce = function (idx) {
  const c = database.contacts[idx];
  if (!c || !c.email) return;
  addLogConsole("enrich", `[ZEROBOUNCE] Verified email validity for ${c.email}: VALID.`, "success");
  alert(`ZeroBounce Verification Success!\nEmail: ${c.email}\nStatus: Valid [Safe to Send]`);
  switchSandboxTab('zerobounce');
};

function deleteContactRecord(id) {
  if (!confirm("Are you sure you want to delete this contact and all their associated outreach history?")) {
    return;
  }
  
  const contactIndex = database.contacts.findIndex(c => c.id === id);
  if (contactIndex === -1) return;

  const contact = database.contacts[contactIndex];
  database.contacts.splice(contactIndex, 1);
  
  if (database.meetings) {
    database.meetings = database.meetings.filter(m => m.contactEmail !== contact.email);
  }
  
  saveDatabaseCache();
  addLogConsole("enrich", `[SYSTEM] Deleted contact record for ${contact.fullName}`, "warning");
  
  filterUploadTable();
  filterInfluencersTable();
  filterOutboundTable();
  if (window.currentTabId === 'campaign-schedule') {
    renderScheduleMeetings();
  }
}

window.openSandbox = openSandbox;
window.closeSandbox = closeSandbox;
window.switchSandboxTab = switchSandboxTab;
window.renderApolloSandbox = renderApolloSandbox;
window.renderOutlookSandbox = renderOutlookSandbox;
window.renderLinkedinSandbox = renderLinkedinSandbox;
window.renderLemlistSandbox = renderLemlistSandbox;
window.renderZerobounceSandbox = renderZerobounceSandbox;
window.deleteContactRecord = deleteContactRecord;
