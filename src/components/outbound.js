// --- OMNICHANNEL OUTBOUND CAMPAIGN CONTROLLER ---

function switchOutboundSubtab(subtab) {
  database.currentOutboundSubtab = subtab;
  
  const btnProspects = document.getElementById("outbound-subtab-prospects");
  const btnInfluencers = document.getElementById("outbound-subtab-influencers");
  
  if (btnProspects && btnInfluencers) {
    if (subtab === 'prospects') {
      btnProspects.classList.add("active");
      btnInfluencers.classList.remove("active");
    } else {
      btnProspects.classList.remove("active");
      btnInfluencers.classList.add("active");
    }
  }
  
  filterOutboundTable();
}

function filterOutboundTable() {
  const isInfluencer = (database.currentOutboundSubtab === 'influencers');
  const targetList = database.contacts.filter(c => c.isInfluencer === isInfluencer);
  database.filteredOutbound = getFilteredData(targetList, "outbound-search-input", null, null, null, null);
  changeOutboundPage(1);
}

function changeOutboundPage(page) {
  database.currentOutboundPage = page;
  const pageData = paginateData(database.filteredOutbound, page, "outbound-pagination", "changeOutboundPage");

  const tbody = document.getElementById("table-campaign-outbound-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--color-text-secondary);">No contacts available.</td></tr>`;
    return;
  }

  pageData.forEach(c => {
    const tr = document.createElement("tr");

    const badgeClass = c.leadTemp === "Hot Lead" ? "badge-success" : "badge";
    const emailStatus = c.emailsSent 
      ? `<span style="color:var(--color-success); font-weight:600;">Sent ✓</span>` 
      : (c.emailDraft ? `<span style="color:var(--color-text-primary); font-weight:500;">Drafted</span>` : `<span style="color:var(--color-text-secondary)">Pending</span>`);
    const linkedinStatus = c.linkedinSent 
      ? `<span style="color:var(--color-success); font-weight:600;">Sent ✓</span>` 
      : (c.linkedinDraft ? `<span style="color:var(--color-text-primary); font-weight:500;">Drafted</span>` : `<span style="color:var(--color-text-secondary)">Pending</span>`);
    
    let callStatus = "None";
    if (c.callsMade && c.callsMade.length > 0) {
      callStatus = `<span style="color:var(--color-success); font-weight:600;">${c.callsMade.length} calls</span>`;
    }

    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle || "Decision Maker"}</td>
      <td><span class="badge ${badgeClass}">${c.leadTemp || "Warm Lead"}</span></td>
      <td>${emailStatus}</td>
      <td>${linkedinStatus}</td>
      <td>${callStatus}</td>
      <td style="text-align: right;">
        <div style="display: flex; gap: 0.375rem; justify-content: flex-end;">
          <button class="btn btn-primary btn-sm" onclick="openOutboundModal(${c.id}, 'email')">Outreach</button>
          <button class="btn btn-secondary btn-sm" style="color: var(--color-error);" onclick="deleteContactRecord(${c.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

  if (channel !== 'call' && callTimer) {
    hangupOutboundCall();
  }

  if (channel === 'email') {
    container.innerHTML = `
      <div class="form-group">
        <label>Email Subject</label>
        <input type="text" class="input-control" id="email-draft-subject" value="${contact.emailDraft.subject}">
      </div>

      <div class="form-group" style="margin-top:12px;">
        <label>Email Body</label>
        <textarea class="input-control" id="email-draft-body" style="height: 180px; font-size:13px; font-family:var(--font-body);">${contact.emailDraft.body}</textarea>
      </div>

      <div class="email-preview-card" style="margin-top: 12px; padding: 14px; border: 1px solid var(--hairline-soft, #e7e5e4); border-radius: 8px; background: var(--surface-card, #f5f0e0);">
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
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          <button class="btn btn-secondary" onclick="insertCalendlyLink('email-draft-body')" style="font-size:12px; height:40px; padding:0 6px;">Insert Calendly</button>
          <button class="btn btn-secondary" onclick="insertPortalLinkToDraft('email-draft-body')" style="font-size:12px; height:40px; padding:0 6px;">Insert Portal Link</button>
          <button class="btn btn-secondary" onclick="generateLLMEmailDraft()" style="font-size:12px; height:40px; padding:0 6px;">AI Re-draft</button>
        </div>
      </div>
    `;
  } else if (channel === 'linkedin') {
    container.innerHTML = `
      <div class="form-group">
        <label>LinkedIn handle: <span style="font-size:12px;color:var(--primary); font-weight:normal;">${contact.linkedinUrl || "linkedin.com/in/" + contact.firstName.toLowerCase()}</span></label>
      </div>

      <div class="form-group" style="margin-top:12px;">
        <label>Connection Invitation Note (Max 300 chars)</label>
        <textarea class="input-control" id="linkedin-draft-text" style="height: 120px; font-size:13px;" maxlength="300">${contact.linkedinDraft}</textarea>
      </div>

      <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;">
        <button class="btn btn-primary" onclick="sendOutboundLinkedin()" style="width:100%;">Send Invite Note</button>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button class="btn btn-secondary" onclick="insertCalendlyLink('linkedin-draft-text')" style="font-size:13px; height:44px;">Insert Calendly</button>
          <button class="btn btn-secondary" onclick="generateLLMLinkedinDraft()" style="font-size:13px; height:44px;">AI Re-draft</button>
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

function triggerMockInfluencerResponse(influencer, channel) {
  const choices = [
    {
      type: "add_prospect",
      message: `Hi! I'd highly recommend contacting Marcus Vance, VP of IT Operations at Alliance Bank Group (mvance@alliancebank.com). I've let him know you will reach out.`,
      prospect: {
        id: Date.now(),
        firstName: "Marcus",
        lastName: "Vance",
        fullName: "Marcus Vance",
        email: "mvance@alliancebank.com",
        jobTitle: "VP of IT Operations",
        company: "Alliance Bank Group",
        phone: "+1 (555) 543-2109",
        industry: "Banking",
        sourceFile: "mock_influencers_referral.csv",
        assetSize: "$1.2B",
        state: "IL",
        enriched: true,
        matchPercentage: 92,
        leadTemp: "Hot Lead",
        emailsSent: false,
        linkedinSent: false,
        callsMade: [],
        referredBy: influencer.fullName,
        isInfluencer: false
      },
      credits: 10,
      consoleMsg: `[INCOMING] Influencer ${influencer.fullName} referred Marcus Vance (Alliance Bank Group) via ${channel}.`
    },
    {
      type: "add_meeting",
      message: `Hey, great chatting. I've set up a Google Meet call with Arthur Dent, IT Director at Galaxy Insurance Services (adent@galaxyinsurance.com). Here is the meet link: https://meet.google.com/abc-defg-hij. Let's schedule it for next Wednesday at 11:00 AM.`,
      meeting: {
        id: "meet-" + Date.now(),
        contactName: "Arthur Dent",
        contactTitle: "IT Director",
        contactCompany: "Galaxy Insurance Services",
        contactEmail: "adent@galaxyinsurance.com",
        contactPhone: "+1 (555) 150-7890",
        platform: "Google Meet",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        timeString: "Next Wednesday at 11:00 AM (EST)",
        influencerName: influencer.fullName,
        influencerCredits: 20,
        notes: `Briefed by partner ${influencer.fullName}. Main focus is general tech auditing and secure pipelines.`
      },
      credits: 20,
      consoleMsg: `[INCOMING] Influencer ${influencer.fullName} scheduled Google Meet with Arthur Dent via ${channel}.`
    }
  ];

  const pick = choices[Math.floor(Math.random() * choices.length)];

  setTimeout(() => {
    if (!influencer.referrals) {
      influencer.referrals = [];
    }
    
    const refName = pick.type === "add_prospect" ? pick.prospect.fullName : pick.meeting.contactName;
    const isDuplicate = influencer.referrals.some(r => r.fullName === refName);
    if (!isDuplicate) {
      influencer.referrals.push({
        fullName: refName,
        jobTitle: pick.type === "add_prospect" ? pick.prospect.jobTitle : pick.meeting.contactTitle,
        company: pick.type === "add_prospect" ? pick.prospect.company : pick.meeting.contactCompany,
        email: pick.type === "add_prospect" ? pick.prospect.email : pick.meeting.contactEmail,
        credits: pick.credits,
        date: new Date().toLocaleDateString()
      });
      influencer.referralCredits = (influencer.referralCredits || 0) + pick.credits;
    }

    if (pick.type === "add_prospect") {
      const exists = database.contacts.some(c => c.email === pick.prospect.email);
      if (!exists) {
        database.contacts.push(pick.prospect);
      }
    } else if (pick.type === "add_meeting") {
      if (!database.meetings) {
        database.meetings = [];
      }
      const exists = database.meetings.some(m => m.contactEmail === pick.meeting.contactEmail);
      if (!exists) {
        database.meetings.push(pick.meeting);
      }
    }

    saveDatabaseCache();

    addLogConsole("enrich", pick.consoleMsg, "success");
    addLogConsole("enrich", `[REPLY] "${pick.message}"`, "info");

    filterOutboundTable();
    loadOutboundDrawer(influencer, channel);
  }, 3000);
}

function sendOutboundEmail() {
  const contact = database.selectedContact;
  if (!contact) return;

  const subject = document.getElementById("email-draft-subject").value;
  const body = document.getElementById("email-draft-body").value;

  contact.emailDraft = { subject, body };
  contact.emailsSent = true;
  database.stats.emailsSent++;

  saveDatabaseCache();
  addLogConsole("enrich", `[OUTBOUND] Released email campaign to ${contact.email}`, "success");

  // Dispatch via Gmail API if Google OAuth token is active
  if (database.googleAccessToken) {
    const emailLines = [
      `To: ${contact.email}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailLines)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${database.googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64EncodedEmail })
    })
    .then(res => res.json())
    .then(data => {
      if (data.id) {
        addLogConsole("enrich", `[GMAIL API] Live campaign email sent to ${contact.email} via connected Google account! Message ID: ${data.id}`, "success");
      } else if (data.error) {
        addLogConsole("enrich", `[GMAIL API] Sending error: ${data.error.message}`, "error");
      }
    })
    .catch(err => {
      console.error("Gmail API error:", err);
      addLogConsole("enrich", `[GMAIL API] Network error: ${err.message}`, "error");
    });
  }

  filterOutboundTable();
  loadOutboundDrawer(contact, 'email');

  if (contact.isInfluencer) {
    triggerMockInfluencerResponse(contact, 'email');
  }
}

function sendOutboundLinkedin() {
  const contact = database.selectedContact;
  if (!contact) return;

  const note = document.getElementById("linkedin-draft-text").value;
  contact.linkedinDraft = note;
  contact.linkedinSent = true;
  database.stats.linkedinSent++;

  saveDatabaseCache();
  addLogConsole("enrich", `[OUTBOUND] Sent LinkedIn Connection Invitation with note to ${contact.fullName}`, "success");

  filterOutboundTable();
  loadOutboundDrawer(contact, 'linkedin');

  if (contact.isInfluencer) {
    triggerMockInfluencerResponse(contact, 'linkedin');
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

async function generateLLMEmailDraft() {
  const contact = database.selectedContact;
  if (!contact) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("email-draft-body");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  let finalBody = "";
  let finalSubject = "";

  if (database.llmHelperKey) {
    try {
      const prompt = `Draft a short, highly personalized B2B cold email from SDR Campaign Agent to ${contact.fullName}, working as ${contact.jobTitle} at ${contact.company}.
Our value proposition: Secure query validation guardrails for credit unions adopting database LLMs.
Include subject line and email body in simple text format. Keep it under 4 sentences, polite, and direct.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        const fullContent = json.choices[0].message.content;
        const subjectMatch = fullContent.match(/Subject:\s*(.*)/i);
        if (subjectMatch) {
          finalSubject = subjectMatch[1];
          finalBody = fullContent.replace(/Subject:\s*(.*)/i, "").trim();
        } else {
          finalSubject = `Safe database compliance for ${contact.company}`;
          finalBody = fullContent;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!finalBody) {
    // Artificial delay to show the rainbow blur animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    finalSubject = `Safe compliance LLM queries for ${contact.company}`;
    finalBody = `Hi ${contact.firstName},\n\nI noticed you are leading tech processes as ${contact.jobTitle} at ${contact.company}. Safe operations with LLMs are a major concern for credit union boards today.\n\nWe build query verification gateways ensuring zero compliance leaks for financial databases.\n\nLet's get a 10 min overview chat next week?\n\nBest,\nSDR Campaign Agent`;
  }

  btn.disabled = false;
  btn.textContent = originalText;

  contact.emailDraft = { subject: finalSubject, body: finalBody };

  const subjectInput = document.getElementById("email-draft-subject");
  if (subjectInput) subjectInput.value = finalSubject;

  if (textarea) {
    textarea.classList.remove("redrafting");
    animateTextWordByWord(textarea, finalBody);
  }
}

async function generateLLMLinkedinDraft() {
  const contact = database.selectedContact;
  if (!contact) return;

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drafting...";

  const textarea = document.getElementById("linkedin-draft-text");
  if (textarea) {
    textarea.classList.add("redrafting");
  }

  let finalNote = "";

  if (database.llmHelperKey) {
    try {
      const prompt = `Draft a short, highly personalized LinkedIn connection note (under 300 characters) to ${contact.fullName}, working as ${contact.jobTitle} at ${contact.company}. Mention secure LLM query guardrails for credit unions. Keep it conversational.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        finalNote = json.choices[0].message.content.slice(0, 300);
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!finalNote) {
    // Artificial delay to show the rainbow blur animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    const reDrafts = [
      `Hi ${contact.firstName}, saw your tech role at ${contact.company}. We're helping credit unions secure database LLM interfaces. Connect?`,
      `Hi ${contact.firstName}, noticed your background at ${contact.company}. We construct secure gateways for financial LLM setups. Love to connect.`
    ];
    finalNote = reDrafts[Math.floor(Math.random() * reDrafts.length)];
  }

  btn.disabled = false;
  btn.textContent = originalText;

  contact.linkedinDraft = finalNote;

  if (textarea) {
    textarea.classList.remove("redrafting");
    animateTextWordByWord(textarea, finalNote);
  }
}

// Backward compatibility table and drawer loaders for other integrations
function filterEmailTable() { filterOutboundTable(); }
function filterLinkedinTable() { filterOutboundTable(); }
function filterCallTable() { filterOutboundTable(); }

function loadEmailDrawer(contact) { loadOutboundDrawer(contact, 'email'); }
function loadLinkedinDrawer(contact) { loadOutboundDrawer(contact, 'linkedin'); }
function loadCallDrawer(contact) { loadOutboundDrawer(contact, 'call'); }

// Interactive calling simulation
let callTimer = null;
let callingAudioContext = null;
let callingOscillator = null;

function renderDialerInterface(state, durationText = "00:00") {
  const contact = database.selectedContact;
  const body = document.getElementById("call-drawer-body");
  if (!body || !contact) return;

  const phone = contact.phone || "+1 (555) 000-0000";

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

      <div class="dialer-grid">
        <button class="dial-key">1<span></span></button><button class="dial-key">2<span>ABC</span></button><button class="dial-key">3<span>DEF</span></button>
        <button class="dial-key">4<span>GHI</span></button><button class="dial-key">5<span>JKL</span></button><button class="dial-key">6<span>MNO</span></button>
        <button class="dial-key">7<span>PQRS</span></button><button class="dial-key">8<span>TUV</span></button><button class="dial-key">9<span>WXYZ</span></button>
        <button class="dial-key">*<span></span></button><button class="dial-key">0<span>+</span></button><button class="dial-key">#<span></span></button>
      </div>

      <div class="dial-actions">
        ${controlsHtml}
      </div>
    </div>

    <div class="call-outcome-logger" id="outcome-logger-area" style="display: ${state === "connected" || contact.callsMade.length > 0 ? "block" : "none"}">
      <label style="font-weight:600;margin-bottom:8px;display:block;">Call Logs History</label>
      <div style="max-height:80px;overflow-y:auto;font-size:12px;color:var(--muted);margin-bottom:12px;" id="call-logs-history">
        ${contact.callsMade.map(h => `- [${h.date}] ${h.outcome}`).join("<br>")}
      </div>
      
      <div id="outcome-buttons-div" style="display: ${state === "connected" ? "flex" : "none"}; flex-direction:column; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Spoke to prospect - Interested')">Spoke to prospect - Interested</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('Left voicemail')">Left voicemail</button>
        <button class="btn btn-secondary btn-sm" onclick="logCallOutcome('No answer')">No answer</button>
      </div>
    </div>
  `;
}

function startOutboundCall() {
  renderDialerInterface("ringing");
  playBeepSound(400, 1.5); // Ring tone beep sound

  // Simulating Ringing -> Connected
  setTimeout(() => {
    const status = document.getElementById("call-screen-status");
    if (status && status.textContent.includes("RINGING")) {
      renderDialerInterface("connected", "00:00");
      playBeepSound(600, 0.2); // Connected chirp

      let durationSec = 0;
      callTimer = setInterval(() => {
        durationSec++;
        const minutes = Math.floor(durationSec / 60).toString().padStart(2, "0");
        const seconds = (durationSec % 60).toString().padStart(2, "0");
        const timerText = `${minutes}:${seconds}`;
        const statusEl = document.getElementById("call-screen-status");
        if (statusEl) statusEl.textContent = `CONNECTED ${timerText}`;
      }, 1000);
    }
  }, 2000);
}

function hangupOutboundCall() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  stopBeepSound();
  
  const statusEl = document.getElementById("call-screen-status");
  if (statusEl) {
    statusEl.textContent = "DISCONNECTED";
  }

  setTimeout(() => {
    renderDialerInterface("idle");
  }, 1000);
}

function logCallOutcome(outcome) {
  const contact = database.selectedContact;
  if (!contact) return;

  if (!contact.callsMade) {
    contact.callsMade = [];
  }

  contact.callsMade.push({
    date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
    outcome: outcome
  });

  database.stats.callsMade++;
  saveDatabaseCache();

  addLogConsole("enrich", `[OUTBOUND] Call logged for ${contact.fullName}. Outcome: ${outcome}`, "info");

  // Keep connected state showing dialer but update log list
  const state = callTimer ? "connected" : "idle";
  renderDialerInterface(state);

  const timeline = document.getElementById("outbound-timeline-container");
  if (timeline) timeline.innerHTML = renderContactTimeline(contact);

  if (contact.isInfluencer) {
    triggerMockInfluencerResponse(contact, 'call');
  }
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
    icon: "📥",
    color: "var(--brand-peach)"
  });

  // 2. Enrichment Event
  if (contact.enriched) {
    events.push({
      title: "Data Enriched",
      desc: `Dossier compiled via Explorium. Match score: <strong>${contact.matchPercentage || 95}%</strong>. Lead category: <strong>${contact.leadTemp}</strong>.`,
      time: "Enriched",
      icon: "⚡",
      color: "var(--brand-ochre)"
    });
  }

  // 3. Email Outbound
  if (contact.emailsSent) {
    events.push({
      title: "Email Outreach Dispatched",
      desc: `Subject: <em>${contact.emailDraft ? contact.emailDraft.subject : ""}</em>`,
      time: "Sent",
      icon: "✉️",
      color: "var(--brand-pink)"
    });
  }

  // 4. LinkedIn Outbound
  if (contact.linkedinSent) {
    events.push({
      title: "LinkedIn Touchpoint",
      desc: "Connection request note sent.",
      time: "Sent",
      icon: "🌐",
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
        icon: "📞",
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
      icon: "📅",
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

function insertPortalLinkToDraft(textareaId) {
  const area = document.getElementById(textareaId);
  if (area) {
    const portalSnippet = `\n\nSubmit your contact referrals & view your credit rewards here: https://gtm-console.app/influencer-portal`;
    area.value += portalSnippet;
    if (database.selectedContact && database.selectedContact.emailDraft) {
      database.selectedContact.emailDraft.body = area.value;
    }
  }
}

let currentModalChannel = 'email';

function openOutboundModal(contactId, channel = 'email') {
  const contact = database.contacts.find(c => c.id === contactId);
  if (!contact) return;

  database.selectedContact = contact;
  currentModalChannel = channel;

  if (!contact.emailDraft) {
    contact.emailDraft = {
      subject: `Safe compliance & automation for ${contact.company}`,
      body: `Hi ${contact.firstName},\n\nNotice ${contact.company} is scaling operations. Our platform automates BDR queries & outbound pipelines.\n\nWould 15 minutes next Tuesday work to discuss?\n\nBest,\nSDR Campaign Agent`
    };
  }
  if (!contact.linkedinDraft) {
    contact.linkedinDraft = {
      body: `Hi ${contact.firstName}, impressed by your leadership at ${contact.company}. Would love to connect and share BDR automation benchmarks.`
    };
  }

  const nameEl = document.getElementById("outbound-modal-contact-name");
  const badgeEl = document.getElementById("outbound-modal-contact-badge");
  if (nameEl) nameEl.textContent = `${contact.fullName} (${contact.jobTitle || 'Executive'})`;
  if (badgeEl) {
    badgeEl.textContent = contact.leadTemp || "Warm Lead";
    badgeEl.className = (contact.leadTemp === "Hot Lead") ? "badge badge-success" : "badge";
  }

  const infoCompany = document.getElementById("modal-info-company");
  const infoTitle = document.getElementById("modal-info-title");
  const infoEmail = document.getElementById("modal-info-email");
  const infoPhone = document.getElementById("modal-info-phone");
  if (infoCompany) infoCompany.textContent = contact.company || "N/A";
  if (infoTitle) infoTitle.textContent = contact.jobTitle || "Decision Maker";
  if (infoEmail) infoEmail.textContent = contact.email || "N/A";
  if (infoPhone) infoPhone.textContent = contact.phone || "+1 (555) 019-2834";

  renderOutboundModalHistory(contact);
  switchOutboundModalChannel(channel);

  const dlg = document.getElementById("outbound-action-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeOutboundModal() {
  const dlg = document.getElementById("outbound-action-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
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
    if (secTitle) secTitle.textContent = "Email Outreach Message";
    if (actionBtn) { actionBtn.style.display = "inline-flex"; actionBtn.textContent = "Dispatch Email Outreach"; }
    if (aiHookBtn) aiHookBtn.style.display = "inline-flex";
    if (subjInput) subjInput.value = contact.emailDraft ? contact.emailDraft.subject : "";
    if (bodyInput) bodyInput.value = contact.emailDraft ? contact.emailDraft.body : "";
  } else if (channel === 'linkedin') {
    if (draftInputsGroup) draftInputsGroup.style.display = "flex";
    if (callPanel) callPanel.style.display = "none";
    if (subjGroup) subjGroup.style.display = "none";
    if (secTitle) secTitle.textContent = "LinkedIn Connection Note";
    if (actionBtn) { actionBtn.style.display = "inline-flex"; actionBtn.textContent = "Send LinkedIn Invite"; }
    if (aiHookBtn) aiHookBtn.style.display = "inline-flex";
    if (bodyInput) bodyInput.value = contact.linkedinDraft ? contact.linkedinDraft.body : "";
  } else if (channel === 'call') {
    if (draftInputsGroup) draftInputsGroup.style.display = "none";
    if (callPanel) callPanel.style.display = "flex";
    if (secTitle) secTitle.textContent = "AI Voice Calling & Transcription";
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
    if (contact && contact.linkedinDraft) {
      contact.linkedinDraft.body = bodyInput ? bodyInput.value : "";
    }
  } else {
    if (prevSubj) prevSubj.style.display = "none";
    prevBody.textContent = bodyInput ? bodyInput.value : "";
  }
}

function executeOutboundSendAction() {
  const contact = database.selectedContact;
  if (!contact) return;

  if (currentModalChannel === 'email') {
    contact.emailsSent = true;
    database.stats.emailsSent = (database.stats.emailsSent || 0) + 1;
    addLogConsole("enrich", `[OUTBOUND EMAIL] Sent email campaign to ${contact.fullName} (${contact.email})`, "success");
    alert(`Email successfully sent to ${contact.fullName}!`);
  } else if (currentModalChannel === 'linkedin') {
    contact.linkedinSent = true;
    database.stats.linkedinSent = (database.stats.linkedinSent || 0) + 1;
    addLogConsole("enrich", `[LINKEDIN] Dispatched connection invite to ${contact.fullName}`, "success");
    alert(`LinkedIn connection note sent to ${contact.fullName}!`);
  } else if (currentModalChannel === 'call') {
    if (!contact.callsMade) contact.callsMade = [];
    contact.callsMade.push({ date: new Date().toISOString(), outcome: "Completed Briefing Call" });
    database.stats.callsMade = (database.stats.callsMade || 0) + 1;
    addLogConsole("enrich", `[VOICE CALL] Logged briefing call with ${contact.fullName}`, "success");
    alert(`Call logged for ${contact.fullName}!`);
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
    html += `<div style="padding:0.375rem; border-bottom:1px solid var(--color-border);"><strong>LinkedIn Invite:</strong> Connection note sent</div>`;
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

function generateAIOutboundHook() {
  const contact = database.selectedContact;
  if (!contact) return;

  const area = document.getElementById("outbound-email-body-input");
  const prevBox = document.getElementById("outbound-email-preview-box");
  if (!area) return;

  // 1. Blur out existing text & activate rainbow border glow
  area.classList.add("text-blur-out", "rainbow-active");
  if (prevBox) prevBox.classList.add("rainbow-active");

  const newHook = `Hi ${contact.firstName},\n\nGiven ${contact.company}'s recent expansion in credit union operations, our automated BDR pipeline helps executive teams streamline partner referrals and compliance checking.\n\nWould 15 minutes next Tuesday work to discuss a live demo briefing?\n\nBest regards,\nSDR Campaign Agent`;

  setTimeout(() => {
    area.value = "";
    area.classList.remove("text-blur-out");
    area.classList.add("text-swoosh-in");

    // 2. Apple-style rapid word-by-word swooshing typewriter animation
    const words = newHook.split(" ");
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < words.length) {
        area.value += (idx === 0 ? "" : " ") + words[idx];
        updateOutboundLivePreview();
        idx++;
      } else {
        clearInterval(interval);
        area.classList.remove("rainbow-active", "text-swoosh-in");
        if (prevBox) prevBox.classList.remove("rainbow-active");
      }
    }, 22);
  }, 350);
}

// --- AI VOICE CALL SIMULATOR & REAL-TIME TRANSCRIPTION ---
let callTimerInterval = null;
let callSeconds = 0;

function startSimulatedAICall() {
  const contact = database.selectedContact;
  if (!contact) return;

  playBeepSound();

  const statusEl = document.getElementById("call-status-label");
  const timerEl = document.getElementById("call-timer-display");
  const transcriptBox = document.getElementById("call-transcript-box");
  const summaryBox = document.getElementById("call-summary-box");

  if (statusEl) statusEl.textContent = "In Call • Transcribing Live Speech...";
  if (summaryBox) summaryBox.style.display = "none";
  if (transcriptBox) {
    transcriptBox.style.display = "block";
    transcriptBox.innerHTML = `<div><strong style="color:var(--color-text-primary);">[AI Agent]:</strong> Dialing ${contact.phone || '+1 (555) 019-2834'}...</div>`;
  }

  callSeconds = 0;
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);

  // Live Speech Dialog Simulation
  const speechLines = [
    { speaker: "AI Agent", text: `Hello ${contact.fullName}, this is the GTM Copilot calling regarding ${contact.company}.` },
    { speaker: contact.fullName, text: `Hi! Yes, I was looking into automated BDR query compliance.` },
    { speaker: "AI Agent", text: `Great! We provide real-time prompt guardrails & referral credit tracking for credit union IT.` },
    { speaker: contact.fullName, text: `That sounds very relevant for our stack. Let's schedule a 15-minute briefing next Tuesday at 2 PM.` },
    { speaker: "AI Agent", text: `Confirmed! Locking in Tuesday at 2:00 PM EST. Sending the calendar invite to ${contact.email} now.` }
  ];

  speechLines.forEach((line, index) => {
    setTimeout(() => {
      if (transcriptBox) {
        const lineDiv = document.createElement("div");
        lineDiv.style.marginBottom = "0.375rem";
        lineDiv.innerHTML = `<strong style="color:var(--color-text-primary);">[${line.speaker}]:</strong> ${line.text}`;
        transcriptBox.appendChild(lineDiv);
        transcriptBox.scrollTop = transcriptBox.scrollHeight;
      }
    }, (index + 1) * 1600);
  });

  // Auto-finish call and generate AI summary
  setTimeout(() => {
    stopSimulatedAICall();
  }, 9500);
}

function stopSimulatedAICall() {
  stopBeepSound();
  clearInterval(callTimerInterval);

  const contact = database.selectedContact;
  const statusEl = document.getElementById("call-status-label");
  const summaryBox = document.getElementById("call-summary-box");

  if (statusEl) statusEl.textContent = "Call Ended • AI Summarizer Active";

  if (summaryBox && contact) {
    summaryBox.style.display = "block";
    summaryBox.innerHTML = `
      <div style="font-weight:700; font-size:var(--font-size-xs); color:var(--color-success); margin-bottom:0.5rem;">AI Call Insights &amp; Meeting Booked</div>
      <div style="font-size:var(--font-size-xs); color:var(--color-text-primary); display:flex; flex-direction:column; gap:0.25rem;">
        <div><strong>Key Need:</strong> BDR query guardrails &amp; partner referral credit tracking.</div>
        <div><strong>Confirmed Meeting:</strong> Next Tuesday at 02:00 PM EST (Google Meet)</div>
        <div><strong>Action Item:</strong> Calendar invite dispatched to ${contact.email}</div>
      </div>
    `;

    // Save call outcome & meeting
    if (!contact.callsMade) contact.callsMade = [];
    contact.callsMade.push({ date: new Date().toLocaleTimeString(), outcome: "Meeting Confirmed (Tuesday 2:00 PM)" });

    if (!database.meetings) database.meetings = [];
    const nextTuesday = new Date();
    nextTuesday.setDate(nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7 || 7));
    nextTuesday.setHours(14, 0, 0, 0);

    const exists = database.meetings.find(m => m.contactEmail === contact.email);
    if (!exists) {
      database.meetings.push({
        id: `meet-${Date.now()}`,
        contactName: contact.fullName,
        contactTitle: contact.jobTitle,
        contactCompany: contact.company,
        contactEmail: contact.email,
        contactPhone: contact.phone || "+1 (555) 019-2834",
        platform: "Google Meet",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        timeString: `${nextTuesday.toLocaleDateString()} at 02:00 PM (EST)`,
        influencerName: "Bob Miller",
        influencerCredits: 100,
        notes: `AI Call Summary: Interested in query injection guardrails & referral portal benefits. Executive briefing confirmed for Tuesday at 2:00 PM.`,
        datetimeRaw: nextTuesday.toISOString()
      });
    }

    saveDatabaseCache();
    renderOutboundModalHistory(contact);
    if (typeof renderCalendar === "function") renderCalendar();
  }
}

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

// --- CATEGORY 2C: VISUAL SEQUENCE TIMELINE STEP HANDLERS ---
function addSequenceStep() {
  const grid = document.getElementById("sequence-timeline-grid");
  if (!grid) return;

  const currentCount = grid.children.length + 1;
  const days = currentCount * 2 + 1;

  const newStep = document.createElement("div");
  newStep.style.cssText = "background: var(--surface-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 0.875rem;";
  newStep.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <span class="badge" style="font-size: 10px; background: var(--surface-soft); color: var(--color-text-secondary);">Day ${days} · Step ${currentCount}</span>
      <span style="font-size: 14px;">📧</span>
    </div>
    <strong style="font-size: 13px; color: var(--color-text-primary); display: block; margin-bottom: 4px;">Follow-up Touch #${currentCount}</strong>
    <p style="font-size: 11.5px; color: var(--color-text-secondary); margin: 0 0 8px 0;">Automated value-add case study follow up.</p>
    <span style="font-size: 10.5px; color: var(--color-text-secondary); font-weight: 600;">Threaded email</span>
  `;
  grid.appendChild(newStep);
}

function runOutboundCadenceBatch() {
  alert("🚀 Batch Cadence Sequence Launched across target prospect list!");
  if (typeof addLogConsole === "function") {
    addLogConsole("campaign-outbound", "[SUCCESS] Launched 4-step cadence sequence across 15 target prospects.", "success");
  }
}

window.startSimulatedAICall = startSimulatedAICall;
window.stopSimulatedAICall = stopSimulatedAICall;
window.insertPortalLinkToDraft = insertPortalLinkToDraft;
window.switchOutboundSubtab = switchOutboundSubtab;
window.filterOutboundTable = filterOutboundTable;
window.changeOutboundPage = changeOutboundPage;
window.loadOutboundDrawer = loadOutboundDrawer;
window.switchDrawerChannel = switchDrawerChannel;
window.openOutboundModal = openOutboundModal;
window.closeOutboundModal = closeOutboundModal;
window.switchOutboundModalChannel = switchOutboundModalChannel;
window.updateOutboundLivePreview = updateOutboundLivePreview;
window.executeOutboundSendAction = executeOutboundSendAction;
window.deleteContactRecord = deleteContactRecord;
window.generateAIOutboundHook = generateAIOutboundHook;
window.triggerMockInfluencerResponse = triggerMockInfluencerResponse;
window.sendOutboundEmail = sendOutboundEmail;
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
window.addSequenceStep = addSequenceStep;
window.runOutboundCadenceBatch = runOutboundCadenceBatch;
