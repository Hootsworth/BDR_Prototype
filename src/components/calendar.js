// --- CAMPAIGN SCHEDULE & BRIEFINGS RENDERING CONTROLLER ---

function ensureMeetingsState() {
  if (!database.meetings) database.meetings = [];
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
    cell.style.height = "52px";
    cell.style.border = "1px solid var(--color-border)";
    cell.style.borderRadius = "var(--radius-inner)";
    cell.style.padding = "6px 8px";
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
    cell.style.justifyContent = "space-between";
    cell.style.cursor = "pointer";
    cell.style.backgroundColor = "var(--color-background-surface)";
    cell.style.position = "relative";
    cell.style.transition = "background-color 0.15s ease, border-color 0.15s ease";

    const dayLabel = document.createElement("span");
    dayLabel.textContent = day;
    dayLabel.style.fontSize = "var(--font-size-xs)";
    dayLabel.style.fontWeight = "600";
    dayLabel.style.color = "var(--color-text-primary)";
    cell.appendChild(dayLabel);

    const cellDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cellMonthPad = String(month+1).padStart(2,'0');
    const cellDayPad = String(day).padStart(2,'0');
    const altDateStr = `${cellMonthPad}/${cellDayPad}/${year}`;

    const dayMeetings = (database.meetings || []).filter(m => {
      if (m.datetimeRaw) {
        const mDate = new Date(m.datetimeRaw);
        if (!isNaN(mDate.getTime()) && mDate.getFullYear() === year && mDate.getMonth() === month && mDate.getDate() === day) {
          return true;
        }
      }
      if (m.timeString && (m.timeString.includes(altDateStr) || m.timeString.includes(cellDateStr))) {
        return true;
      }
      return false;
    });

    if (dayMeetings.length > 0) {
      const badgeWrap = document.createElement("div");
      badgeWrap.style.position = "absolute";
      badgeWrap.style.bottom = "6px";
      badgeWrap.style.right = "6px";
      badgeWrap.style.display = "flex";
      badgeWrap.style.alignItems = "center";
      badgeWrap.style.gap = "4px";

      const dot = document.createElement("div");
      dot.style.width = "7px";
      dot.style.height = "7px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = "var(--color-text-primary)";
      badgeWrap.appendChild(dot);
      cell.appendChild(badgeWrap);
      
      cell.style.borderColor = "var(--color-border-emphasized)";
      cell.style.backgroundColor = "var(--color-background-muted)";
    }

    cell.onclick = () => {
      document.querySelectorAll("#calendar-days-grid > div").forEach(c => {
        c.style.backgroundColor = "var(--color-background-surface)";
      });
      cell.style.backgroundColor = "var(--color-background-muted)";
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
  ensureMeetingsState();
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
    addLogConsole("enrich", `[GOOGLE CALENDAR] Opened a calendar template. No API event was created because Google Workspace is not connected.`, "warning");
  } else if (database.calendarSyncService !== 'google') {
    exportICSFile(contact.email);
    addLogConsole("enrich", `[${database.calendarSyncService.toUpperCase()} CALENDAR] Sync complete. Exported local iCal meeting invitation.`, "success");
  }

  filterOutboundTable();
  loadOutboundDrawer(contact, 'calendar');
}

function dispatchLiveBackendSync(meet, dt, notes) {
  if (database.googleCalendarConnected) {
    const eventPayload = {
      summary: `Outbound Briefing: ${meet.contactCompany}`,
      description: `${notes}\n\nJoin Link: ${meet.meetingUrl}`,
      location: meet.platform,
      start: { dateTime: dt.toISOString() },
      end: { dateTime: new Date(dt.getTime() + 30 * 60 * 1000).toISOString() },
      attendees: [{ email: meet.contactEmail }],
      conferenceData: {
        createRequest: {
          requestId: `gtm-${meet.id}`,
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    };

    createGoogleCalendarEvent(eventPayload)
    .then(data => {
      if (data.id) {
        const meetLink = data.hangoutLink || data.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri;
        if (meetLink) {
          meet.meetingUrl = meetLink;
          saveDatabaseCache();
        }
        addLogConsole("enrich", `[GOOGLE CALENDAR API] Live event created! Event ID: ${data.id}`, "success");
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
      <div class="card" style="margin: 0; padding: 1rem; background-color: var(--color-background-muted);">
        <h4 style="margin: 0 0 0.5rem 0; font-size: var(--font-size-xs); font-weight: 700; text-transform: uppercase; color: var(--color-text-primary);">Partner Referral Dossier</h4>
        <div style="font-size: var(--font-size-xs); line-height: 1.5; color: var(--color-text-primary);">
          <div style="margin-bottom: 0.5rem;"><strong>Referral Partner:</strong> ${meet.influencerName}</div>
          <div style="margin-bottom: 0.5rem;"><strong>Credits Redeemed:</strong> <span style="color: var(--color-success); font-weight: 700;">${meet.influencerCredits} credits</span></div>
          <div style="margin-bottom: 0.5rem;"><strong>Partner Relationship:</strong> Elite Technology Advisor</div>
          <p style="margin: 0.5rem 0 0 0; padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-style: italic; color: var(--color-text-secondary);">"${meet.notes}"</p>
        </div>
      </div>

      <!-- Column 2: Pain points / Intelligence -->
      <div class="card" style="margin: 0; padding: 1rem; background-color: var(--color-background-muted);">
        <h4 style="margin: 0 0 0.5rem 0; font-size: var(--font-size-xs); font-weight: 700; text-transform: uppercase; color: var(--color-text-primary);">AI Intelligence Summary</h4>
        <div style="font-size: var(--font-size-xs); line-height: 1.5; color: var(--color-text-primary);">
          <div style="margin-bottom: 0.5rem;"><strong>Target Domain:</strong> ${meet.contactCompany.toLowerCase().replace(/\s+/g, "")}.com</div>
          <div style="margin-bottom: 0.5rem;"><strong>Database Risk:</strong> High (Evaluation underway)</div>
          <div style="margin-bottom: 0.5rem;"><strong>Key Priority:</strong> Prompt Injection Shielding</div>
          <div style="padding: 0.75rem; background-color: var(--color-background-surface); border: 1px solid var(--color-border); border-radius: var(--radius-inner); color: var(--color-text-primary);">
            <strong style="display: block; margin-bottom: 0.25rem; font-size: var(--font-size-xs); color: var(--color-text-primary);">Suggested Pitch Angle:</strong>
            Highlight compliance guardrails, LLM gateway access logging, and real-time prompt cleaning.
          </div>
        </div>
      </div>
    </div>

    <!-- Action Items Checklist -->
    <div class="card" style="margin: 0; padding: 1rem; background-color: var(--color-background-muted);">
      <h4 style="margin: 0 0 0.75rem 0; font-size: var(--font-size-xs); font-weight: 700; text-transform: uppercase; color: var(--color-text-primary);">Briefing Action Checklist</h4>
      <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: var(--font-size-xs); color: var(--color-text-primary);">
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" checked style="cursor: pointer;"> Verify referral introduction message parameters</label>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" checked style="cursor: pointer;"> Review prompt validation compliance reports</label>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" style="cursor: pointer;"> Send pre-meeting briefing documentation slides</label>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" style="cursor: pointer;"> Confirm Calendly sync on corporate GSuite calendar</label>
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

window.ensureMeetingsState = ensureMeetingsState;
window.renderCalendar = renderCalendar;
window.changeCalendarMonth = changeCalendarMonth;
window.selectCalendarDate = selectCalendarDate;
window.renderScheduleMeetings = renderScheduleMeetings;
window.toggleMeetingNotes = toggleMeetingNotes;
window.saveManualMeeting = saveManualMeeting;
window.openBriefingConsole = openBriefingConsole;
window.closeBriefingConsole = closeBriefingConsole;
window.exportICSFile = exportICSFile;
window.saveCalendlySettings = saveCalendlySettings;
window.saveCalendarSyncSettings = saveCalendarSyncSettings;
window.insertCalendlyLink = insertCalendlyLink;
