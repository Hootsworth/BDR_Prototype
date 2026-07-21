// --- CAMPAIGN SCHEDULE & BRIEFINGS RENDERING CONTROLLER ---

function initMockMeetings() {
  if (!database.meetings) {
    database.meetings = [];
  }
  if (database.meetings.length === 0 && database.contacts && database.contacts.length > 0) {
    const prospects = database.contacts.filter(c => c.isInfluencer !== true);
    if (prospects.length >= 2) {
      const influencer1 = database.contacts.find(c => c.isInfluencer === true) || { fullName: "John Doe", referralCredits: 10 };
      const influencer2 = database.contacts.find(c => c.isInfluencer === true && c.fullName !== influencer1.fullName) || { fullName: "Jane Smith", referralCredits: 20 };
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const july10 = new Date(2026, 6, 10, 14, 0, 0);

      database.meetings = [
        {
          id: "meet-1",
          contactName: prospects[0].fullName,
          contactTitle: prospects[0].jobTitle,
          contactCompany: prospects[0].company,
          contactEmail: prospects[0].email,
          contactPhone: prospects[0].phone || "+1 (555) 345-6789",
          platform: "Google Meet",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          timeString: tomorrow.toLocaleDateString() + " at 10:00 AM (EST)",
          influencerName: influencer1.fullName,
          influencerCredits: 10,
          notes: `Interested in secure BDR query validation guardrails for ${prospects[0].company}. Main concern is preventing database prompt injection in user queries. Referred by ${influencer1.fullName}.`,
          datetimeRaw: tomorrow.toISOString()
        },
        {
          id: "meet-2",
          contactName: prospects[1].fullName,
          contactTitle: prospects[1].jobTitle,
          contactCompany: prospects[1].company,
          contactEmail: prospects[1].email,
          contactPhone: prospects[1].phone || "+1 (555) 789-0123",
          platform: "Microsoft Teams",
          meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz",
          timeString: "07/10/2026 at 02:00 PM (EST)",
          influencerName: influencer2.fullName,
          influencerCredits: 20,
          notes: `Seeking to integrate Apollo and Lemlist pipelines with secure checkpointers. Main pain point: duplicate contacts management. Referred by ${influencer2.fullName}.`,
          datetimeRaw: july10.toISOString()
        }
      ];
    }
  }
}

let currentCalDate = new Date(2026, 6, 1);

function renderCalendar() {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const grid = document.getElementById("calendar-days-grid");
  const monthYearLabel = document.getElementById("calendar-month-year");
  if (!grid || !monthYearLabel) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  monthYearLabel.textContent = `${monthNames[month]} ${year}`;

  grid.innerHTML = "";

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Add empty spaces for padding
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.style.height = "55px";
    emptyCell.style.border = "1px solid var(--hairline-soft)";
    emptyCell.style.borderRadius = "6px";
    emptyCell.style.background = "var(--surface-soft)";
    emptyCell.style.opacity = "0.5";
    grid.appendChild(emptyCell);
  }

  // Add actual days
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement("div");
    cell.style.height = "55px";
    cell.style.border = "1.5px solid var(--primary)";
    cell.style.borderRadius = "6px";
    cell.style.padding = "4px";
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
    cell.style.justifyContent = "space-between";
    cell.style.cursor = "pointer";
    cell.style.background = "var(--canvas)";
    cell.style.position = "relative";
    cell.style.transition = "background-color 0.15s ease";

    const dayLabel = document.createElement("span");
    dayLabel.textContent = day;
    dayLabel.style.fontSize = "12px";
    dayLabel.style.fontWeight = "600";
    dayLabel.style.color = "var(--ink)";
    cell.appendChild(dayLabel);

    const cellDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayMeetings = (database.meetings || []).filter(m => {
      if (m.datetimeRaw) {
        const mDate = new Date(m.datetimeRaw);
        return mDate.getFullYear() === year && mDate.getMonth() === month && mDate.getDate() === day;
      }
      return false;
    });

    if (dayMeetings.length > 0) {
      const dot = document.createElement("div");
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.borderRadius = "50%";
      dot.style.background = "var(--brand-pink)";
      dot.style.position = "absolute";
      dot.style.bottom = "8px";
      dot.style.right = "8px";
      cell.appendChild(dot);
      
      cell.style.borderColor = "var(--brand-pink)";
      cell.style.background = "var(--surface-soft)";
    }

    cell.onclick = () => {
      document.querySelectorAll("#calendar-days-grid > div").forEach(c => {
        c.style.background = "var(--canvas)";
      });
      cell.style.background = "var(--surface-card)";
      selectCalendarDate(year, month, day, dayMeetings);
    };

    grid.appendChild(cell);
  }
}

function changeCalendarMonth(offset) {
  currentCalDate.setMonth(currentCalDate.getMonth() + offset);
  renderCalendar();
}

function selectCalendarDate(year, month, day, meetings) {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const title = document.getElementById("selected-date-title");
  const subtitle = document.getElementById("selected-date-subtitle");
  const list = document.getElementById("selected-date-meetings-list");
  if (!title || !subtitle || !list) return;

  title.textContent = `${monthNames[month]} ${day}, ${year}`;
  subtitle.textContent = `${meetings.length} meeting(s) scheduled for this date.`;
  list.innerHTML = "";

  if (meetings.length === 0) {
    list.innerHTML = `<div class="table-placeholder" style="border: none; padding: 40px 10px;">No briefings scheduled for this date.</div>`;
    return;
  }

  meetings.forEach((meet, idx) => {
    const card = document.createElement("div");
    card.className = "meeting-card";
    const badgeClass = meet.platform === "Google Meet" ? "google-meet" : "teams";

    card.innerHTML = `
      <div class="meeting-card-header">
        <div class="meeting-card-meta">
          <h4>${meet.contactName}</h4>
          <div class="title-company">${meet.contactTitle} at ${meet.contactCompany}</div>
          <div class="time-string">Date: ${meet.timeString}</div>
        </div>
        <div class="meeting-card-side">
          <span class="meeting-badge ${badgeClass}">${meet.platform}</span>
        </div>
      </div>
      <div class="meeting-card-details">
        <div class="meeting-info-row">
          <span>Phone:</span>
          <strong>${meet.contactPhone}</strong>
        </div>
        <div class="meeting-info-row">
          <span>Email:</span>
          <strong><code>${meet.contactEmail}</code></strong>
        </div>
        <div class="meeting-info-row">
          <span>Referring Partner:</span>
          <span style="font-weight:600; color:var(--brand-teal);">${meet.influencerName} (${meet.influencerCredits} credits)</span>
        </div>
        <div style="margin-top: 12px; display:flex; gap: 6px;">
          <a class="btn btn-primary btn-sm" href="${meet.meetingUrl}" target="_blank" style="flex:1.2; text-align:center; height:30px; padding:0; display:flex; align-items:center; justify-content:center; font-size:12px;">Join Meeting</a>
          <button class="btn btn-secondary btn-sm" onclick="openBriefingConsole('${meet.id}')" style="height:30px; padding:0 10px; font-size:12px; font-weight:700;">Briefing Room</button>
          <button class="btn btn-secondary btn-sm" onclick="exportICSFile('${meet.contactEmail}')" style="height:30px; padding:0 8px; font-size:12px;">Invite</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderScheduleMeetings() {
  initMockMeetings();
  renderCalendar();
  
  const title = document.getElementById("selected-date-title");
  const subtitle = document.getElementById("selected-date-subtitle");
  const list = document.getElementById("selected-date-meetings-list");
  if (title && subtitle && list) {
    title.textContent = "No Date Selected";
    subtitle.textContent = "Select a highlighted date to view briefings.";
    list.innerHTML = `<div class="table-placeholder" style="border: none; padding: 40px 10px;">Select a date on the calendar grid to inspect briefing details.</div>`;
  }
}

function toggleMeetingNotes(idx) {
  const el = document.getElementById(`meeting-prep-notes-${idx}`);
  if (el) el.classList.toggle("open");
}

function saveManualMeeting() {
  const contact = database.selectedContact;
  if (!contact) return;

  const platform = document.getElementById("booking-platform").value;
  const datetimeVal = document.getElementById("booking-datetime").value;
  const notes = document.getElementById("booking-notes").value;

  if (!datetimeVal) {
    alert("Please select a date and time for the meeting.");
    return;
  }

  const dt = new Date(datetimeVal);
  const timeString = dt.toLocaleDateString() + " at " + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const meetingId = Math.random().toString(36).substring(2, 11);
  const meetingUrl = platform === "Google Meet" 
    ? `https://meet.google.com/${meetingId.slice(0,3)}-${meetingId.slice(3,7)}-${meetingId.slice(7,10)}`
    : `https://teams.microsoft.com/l/meetup-join/${meetingId}`;

  let influencerName = "Direct Outreach";
  let influencerCredits = 0;
  
  if (contact.referredBy) {
    const influencer = database.contacts.find(c => c.isInfluencer === true && c.fullName === contact.referredBy);
    if (influencer) {
      influencerName = influencer.fullName;
      influencerCredits = 20;
      if (!influencer.referrals) influencer.referrals = [];
      const isDuplicate = influencer.referrals.some(r => r.email === contact.email);
      if (!isDuplicate) {
        influencer.referrals.push({
          fullName: contact.fullName,
          jobTitle: contact.jobTitle,
          company: contact.company,
          email: contact.email,
          credits: 20,
          date: new Date().toLocaleDateString()
        });
        influencer.referralCredits = (influencer.referralCredits || 0) + 20;
      }
    }
  }

  const newMeet = {
    id: "meet-" + Date.now(),
    contactName: contact.fullName,
    contactTitle: contact.jobTitle,
    contactCompany: contact.company,
    contactEmail: contact.email,
    contactPhone: contact.phone || "+1 (555) 000-0000",
    platform: platform,
    meetingUrl: meetingUrl,
    timeString: timeString,
    influencerName: influencerName,
    influencerCredits: influencerCredits,
    notes: notes,
    datetimeRaw: datetimeVal
  };

  if (!database.meetings) database.meetings = [];
  database.meetings.push(newMeet);
  contact.leadTemp = "Hot Lead";

  saveDatabaseCache();
  addLogConsole("enrich", `[CALENDAR SYNC] Booked meeting with ${contact.fullName} on ${platform} (${timeString}).`, "success");
  
  // Dispatch live API syncs to Google Calendar & Slack
  dispatchLiveBackendSync(newMeet, dt, notes);

  if (database.calendarSyncService === 'google' && !database.googleAccessToken) {
    const startStr = dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const endStr = new Date(dt.getTime() + 30 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Outbound Briefing: " + contact.company)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(notes + "\n\nJoin Link: " + meetingUrl)}&location=${encodeURIComponent(platform)}`;
    
    window.open(gCalUrl, "_blank");
    addLogConsole("enrich", `[GOOGLE CALENDAR] Sync request complete. Opened new calendar event creation page.`, "success");
  } else if (database.calendarSyncService !== 'google') {
    exportICSFile(contact.email);
    addLogConsole("enrich", `[${database.calendarSyncService.toUpperCase()} CALENDAR] Sync complete. Exported local iCal meeting invitation.`, "success");
  }

  filterOutboundTable();
  loadOutboundDrawer(contact, 'calendar');
}

function simulateCalendlyWebhook() {
  if (!database.contacts || database.contacts.length === 0) {
    alert("Please upload database contacts first.");
    return;
  }

  const prospects = database.contacts.filter(c => c.isInfluencer !== true);
  if (prospects.length === 0) {
    alert("No prospects found to schedule with.");
    return;
  }

  const unscheduled = prospects.find(p => !database.meetings || !database.meetings.some(m => m.contactEmail === p.email));
  const contact = unscheduled || prospects[0];

  const now = new Date();
  const meetingDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  meetingDate.setHours(10, 0, 0, 0);

  const timeString = meetingDate.toLocaleDateString() + " at 10:00 AM (EST)";
  const platform = "Google Meet";
  const meetingId = Math.random().toString(36).substring(2, 11);
  const meetingUrl = `https://meet.google.com/${meetingId.slice(0,3)}-${meetingId.slice(3,7)}-${meetingId.slice(7,10)}`;

  let influencerName = "Direct Outreach";
  let influencerCredits = 0;
  
  if (contact.referredBy) {
    const influencer = database.contacts.find(c => c.isInfluencer === true && c.fullName === contact.referredBy);
    if (influencer) {
      influencerName = influencer.fullName;
      influencerCredits = 20;
      if (!influencer.referrals) influencer.referrals = [];
      const isDuplicate = influencer.referrals.some(r => r.email === contact.email);
      if (!isDuplicate) {
        influencer.referrals.push({
          fullName: contact.fullName,
          jobTitle: contact.jobTitle,
          company: contact.company,
          email: contact.email,
          credits: 20,
          date: new Date().toLocaleDateString()
        });
        influencer.referralCredits = (influencer.referralCredits || 0) + 20;
      }
    }
  }

  const newMeet = {
    id: "meet-" + Date.now(),
    contactName: contact.fullName,
    contactTitle: contact.jobTitle,
    contactCompany: contact.company,
    contactEmail: contact.email,
    contactPhone: contact.phone || "+1 (555) 000-0000",
    platform: platform,
    meetingUrl: meetingUrl,
    timeString: timeString,
    influencerName: influencerName,
    influencerCredits: influencerCredits,
    notes: `Simulated Calendly Webhook slot booking for ${contact.company}.`,
    datetimeRaw: meetingDate.toISOString()
  };

  if (!database.meetings) database.meetings = [];
  database.meetings.push(newMeet);
  contact.leadTemp = "Hot Lead";

  saveDatabaseCache();
  
  addLogConsole("enrich", `[CALENDLY WEBHOOK] Incoming Calendly Slot Booking webhook payload received.`, "success");
  addLogConsole("enrich", `[CALENDLY WEBHOOK] Automatically booked slot for ${contact.fullName} on ${platform} (${timeString}).`, "success");
  
  // Dispatch live API syncs to Google Calendar & Slack
  dispatchLiveBackendSync(newMeet, meetingDate, newMeet.notes);

  exportICSFile(contact.email);
  addLogConsole("enrich", `[CALENDAR SYNC] Triggered local calendar sync and ICS export download.`, "success");
}

function dispatchLiveBackendSync(meet, dt, notes) {
  if (database.googleAccessToken) {
    const eventPayload = {
      summary: `Outbound Briefing: ${meet.contactCompany}`,
      description: `${notes}\n\nJoin Link: ${meet.meetingUrl}`,
      location: meet.platform,
      start: { dateTime: dt.toISOString() },
      end: { dateTime: new Date(dt.getTime() + 30 * 60 * 1000).toISOString() },
      attendees: [{ email: meet.contactEmail }]
    };

    const keyQuery = database.googleApiKey ? `?key=${encodeURIComponent(database.googleApiKey)}` : "";
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${keyQuery}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${database.googleAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventPayload)
    })
    .then(res => res.json())
    .then(data => {
      if (data.id) {
        addLogConsole("enrich", `[GOOGLE CALENDAR API] Live event created! Event ID: ${data.id}`, "success");
      } else if (data.error) {
        addLogConsole("enrich", `[GOOGLE CALENDAR API] Creation failed: ${data.error.message}`, "error");
        if (data.error.code === 401) {
          database.googleAccessToken = "";
          localStorage.removeItem("gtm_google_access_token");
          if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();
        }
      }
    })
    .catch(err => {
      console.error("Google Calendar API fetch error:", err);
      addLogConsole("enrich", `[GOOGLE CALENDAR API] Network error: ${err.message}`, "error");
    });
  }

  if (database.slackWebhookUrl) {
    const slackPayload = {
      text: `*New Briefing Scheduled!*\n*Prospect:* ${meet.contactName} (${meet.contactTitle || 'N/A'})\n*Company:* ${meet.contactCompany}\n*Platform:* ${meet.platform}\n*Time:* ${meet.timeString}\n*Referred By:* ${meet.influencerName} (${meet.influencerCredits} credits awarded)\n*Join Link:* ${meet.meetingUrl}`
    };

    fetch(database.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: JSON.stringify(slackPayload)
    })
    .then(res => {
      addLogConsole("enrich", `[SLACK INTEGRATION] Posted real-time briefing notification to Slack channel.`, "success");
    })
    .catch(err => {
      console.error("Slack webhook dispatch error:", err);
      addLogConsole("enrich", `[SLACK INTEGRATION] Webhook dispatch error: ${err.message}`, "error");
    });
  }
}

function openBriefingConsole(meetId) {
  const meet = database.meetings.find(m => m.id === meetId);
  if (!meet) return;

  const dialog = document.getElementById("briefing-dialog");
  const body = document.getElementById("briefing-dialog-body");
  if (!dialog || !body) return;

  // Compile briefing content
  body.innerHTML = `
    <div class="briefing-header" style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.5px solid var(--hairline); padding-bottom:16px; margin-bottom:16px;">
      <div>
        <h2 style="margin:0 0 -4px 0; font-size:20px; font-weight:700; color:var(--ink);">${meet.contactName}</h2>
        <p style="margin:0; font-size:13px; color:var(--muted);">${meet.contactTitle} at <strong>${meet.contactCompany}</strong></p>
      </div>
      <div style="text-align:right;">
        <span class="meeting-badge google-meet" style="background:var(--surface-soft); border:1px solid var(--hairline); color:var(--primary); font-size:11px; padding:4px 8px; border-radius:4px; font-weight:700;">${meet.platform}</span>
        <div style="font-size:11px; color:var(--muted); margin-top:6px; font-weight:600;">${meet.timeString}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
      <!-- Column 1: Bios & Referral partner context -->
      <div class="briefing-block" style="background:var(--surface-soft); border:1.5px solid var(--hairline); border-radius:var(--radius-md); padding:16px; box-shadow:2px 2px 0 var(--hairline);">
        <h4 style="margin:0 0 10px 0; font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:var(--brand-pink);">Partner Referral Dossier</h4>
        <div style="font-size:12px; line-height:1.6; color:var(--body);">
          <div style="margin-bottom:8px;"><strong>Referral Partner:</strong> ${meet.influencerName}</div>
          <div style="margin-bottom:8px;"><strong>Credits Redeemed:</strong> <span style="color:var(--brand-teal); font-weight:700;">${meet.influencerCredits} credits</span></div>
          <div style="margin-bottom:8px;"><strong>Partner Relationship:</strong> Elite Technology Advisor</div>
          <p style="margin:8px 0 0 0; padding-top:8px; border-top:1px solid var(--hairline); font-style:italic;">"${meet.notes}"</p>
        </div>
      </div>

      <!-- Column 2: Pain points / Intelligence -->
      <div class="briefing-block" style="background:var(--surface-soft); border:1.5px solid var(--hairline); border-radius:var(--radius-md); padding:16px; box-shadow:2px 2px 0 var(--hairline);">
        <h4 style="margin:0 0 10px 0; font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:var(--brand-ochre);">AI Intelligence Summary</h4>
        <div style="font-size:12px; line-height:1.6; color:var(--body);">
          <div style="margin-bottom:6px;"><strong>Target Domain:</strong> ${meet.contactCompany.toLowerCase().replace(/\s+/g, "")}.com</div>
          <div style="margin-bottom:6px;"><strong>Database Risk:</strong> High (Evaluation underway)</div>
          <div style="margin-bottom:10px;"><strong>Key Priority:</strong> Prompt Injection Shielding</div>
          <div style="padding:10px; background:#fff; border:1px solid var(--hairline); border-radius:4px;">
            <strong style="display:block; margin-bottom:4px; font-size:11px; color:var(--ink);">Suggested Pitch Angle:</strong>
            Highlight compliance guardrails, LLM gateway access logging, and real-time prompt cleaning.
          </div>
        </div>
      </div>
    </div>

    <!-- Action Items Checklist -->
    <div style="background:var(--surface-soft); border:1.5px solid var(--hairline); border-radius:var(--radius-md); padding:16px; box-shadow:2px 2px 0 var(--hairline); margin-bottom:10px;">
      <h4 style="margin:0 0 12px 0; font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink);">Briefing Action Checklist</h4>
      <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--body);"><input type="checkbox" checked style="width:14px; height:14px; cursor:pointer;"> Verify referral introduction message parameters</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--body);"><input type="checkbox" checked style="width:14px; height:14px; cursor:pointer;"> Review prompt validation compliance reports</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--body);"><input type="checkbox" style="width:14px; height:14px; cursor:pointer;"> Send pre-meeting briefing documentation slides</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--body);"><input type="checkbox" style="width:14px; height:14px; cursor:pointer;"> Confirm Calendly sync on corporate GSuite calendar</label>
      </div>
    </div>
  `;

  dialog.showModal();
}

function closeBriefingConsole() {
  const dialog = document.getElementById("briefing-dialog");
  if (dialog) dialog.close();
}

function exportICSFile(email) {
  const meet = database.meetings ? database.meetings.find(m => m.contactEmail === email) : null;
  if (!meet) return;

  const dt = meet.datetimeRaw ? new Date(meet.datetimeRaw) : new Date();
  const startStr = dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const endStr = new Date(dt.getTime() + 30 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hootsworth BDR//Campaign Console//EN",
    "BEGIN:VEVENT",
    `UID:${meet.id}@hootsworth-bdr.app`,
    `DTSTAMP:${startStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:Outbound Briefing: ${meet.contactCompany}`,
    `DESCRIPTION:${meet.notes ? meet.notes.replace(/\n/g, "\\n") : ""}\\n\\nJoin Link: ${meet.meetingUrl}`,
    `LOCATION:${meet.platform}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `briefing_${meet.contactName.replace(/\s+/g, "_").toLowerCase()}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function saveCalendlySettings() {
  const el = document.getElementById("settings-calendly-url");
  if (el) {
    database.calendlyUrl = el.value;
    localStorage.setItem("gtm_calendly_url", el.value);
    addLogConsole("enrich", `[SYSTEM] Saved Calendly booking page URL to settings.`, "info");
  }
}

function saveCalendarSyncSettings() {
  const el = document.getElementById("settings-calendar-sync");
  if (el) {
    database.calendarSyncService = el.value;
    localStorage.setItem("gtm_calendar_sync_service", el.value);
    addLogConsole("enrich", `[SYSTEM] Updated primary calendar synchronization provider to: ${el.value.toUpperCase()}`, "info");
  }
}

function insertCalendlyLink(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const calendlyUrl = database.calendlyUrl || "https://calendly.com/aditya-dixit/30min";
  const insertionText = `\n\nHere is my booking link to schedule a brief call: ${calendlyUrl}`;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;

  textarea.value = val.substring(0, start) + insertionText + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + insertionText.length;
  textarea.focus();
}

window.initMockMeetings = initMockMeetings;
window.renderCalendar = renderCalendar;
window.changeCalendarMonth = changeCalendarMonth;
window.selectCalendarDate = selectCalendarDate;
window.renderScheduleMeetings = renderScheduleMeetings;
window.toggleMeetingNotes = toggleMeetingNotes;
window.saveManualMeeting = saveManualMeeting;
window.simulateCalendlyWebhook = simulateCalendlyWebhook;
window.openBriefingConsole = openBriefingConsole;
window.closeBriefingConsole = closeBriefingConsole;
window.exportICSFile = exportICSFile;
window.saveCalendlySettings = saveCalendlySettings;
window.saveCalendarSyncSettings = saveCalendarSyncSettings;
window.insertCalendlyLink = insertCalendlyLink;
