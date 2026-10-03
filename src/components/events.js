// --- FIELD EVENTS & BRIEFING ROOM CONTROLLER ---

const DEFAULT_EVENTS_META = [
  {
    eventKey: "gac_dinner",
    title: "GAC 2026 Executive VIP Dinner",
    date: "2026-10-14",
    location: "Washington, D.C. (The Mayflower Hotel)",
    type: "Executive Dinner",
    description: "Private C-suite dinner for Credit Union CIOs and Advisory Partners discussing NCUA AI compliance."
  },
  {
    eventKey: "symwest_booth",
    title: "SymWest 2026 Booth #412 Visitors",
    date: "2026-10-22",
    location: "San Diego, CA (Convention Center)",
    type: "Conference Booth",
    description: "Symitar & Jack Henry ecosystem leaders visiting the live LLM Query Guardrails demo booth."
  },
  {
    eventKey: "executive_meetup",
    title: "Credit Union AI & Compliance Roundtable",
    date: "2026-11-05",
    location: "Chicago, IL / Hybrid",
    type: "VIP Roundtable",
    description: "Interactive executive briefing on zero-trust LLM database gateways and referral partner rewards."
  }
];

function ensureEventsMeta() {
  if (!Array.isArray(database.eventsMeta) || database.eventsMeta.length === 0) {
    database.eventsMeta = JSON.parse(JSON.stringify(DEFAULT_EVENTS_META));
  }
  if (!database.events) database.events = {};
  database.eventsMeta.forEach(meta => {
    if (!database.events[meta.eventKey]) {
      database.events[meta.eventKey] = [];
    }
  });
  Object.keys(database.events).forEach(k => {
    if (!database.eventsMeta.some(m => m.eventKey === k)) {
      database.eventsMeta.push({
        eventKey: k,
        title: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        date: "2026-11-15",
        location: "Field Event",
        type: "Executive Event",
        description: "Custom field marketing event"
      });
    }
  });
}

function syncEventSelectOptions(selectedKey) {
  ensureEventsMeta();
  const selectIds = ["select-event-view", "select-reg-event", "event-new-contact-event"];
  selectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = selectedKey || el.value || database.eventsMeta[0]?.eventKey;
    el.innerHTML = database.eventsMeta.map(m => {
      const count = (database.events[m.eventKey] || []).length;
      const suffix = id === "select-event-view" ? ` (${count} attendees)` : "";
      return `<option value="${m.eventKey}">${m.title}${suffix}</option>`;
    }).join("");
    if (currentVal && database.eventsMeta.some(m => m.eventKey === currentVal)) {
      el.value = currentVal;
    }
  });
}

function openCreateEventModal() {
  const dlg = document.getElementById("create-event-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeCreateEventModal() {
  const dlg = document.getElementById("create-event-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function handleCreateEventSubmit(e) {
  e.preventDefault();
  ensureEventsMeta();

  const title = (document.getElementById("new-event-title")?.value || "").trim();
  const date = (document.getElementById("new-event-date")?.value || "2026-11-12").trim();
  const type = (document.getElementById("new-event-type")?.value || "Executive Dinner").trim();
  const location = (document.getElementById("new-event-location")?.value || "TBD").trim();
  const description = (document.getElementById("new-event-description")?.value || "").trim();

  if (!title) {
    alert("Please enter an event name.");
    return;
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `event_${Date.now()}`;
  const eventKey = database.events[slug] ? `${slug}_${Date.now().toString().slice(-4)}` : slug;

  const newMeta = {
    eventKey,
    title,
    date,
    location,
    type,
    description: description || `${type} hosted in ${location}`
  };

  database.eventsMeta.push(newMeta);
  database.events[eventKey] = [];
  saveDatabaseCache();

  syncEventSelectOptions(eventKey);
  renderEventsList();
  closeCreateEventModal();

  const form = document.getElementById("create-event-form");
  if (form) form.reset();

  addLogConsole("enrich", `[EVENTS ENGINE] Created new field event "${title}" (${location} · ${date})`, "success");
}

function updateEventAddContactRoleUI(role) {
  const titleEl = document.getElementById("event-add-contact-modal-title");
  const submitBtn = document.getElementById("event-add-contact-submit-btn");
  const isInf = role === "influencer";
  if (titleEl) {
    titleEl.textContent = isInf ? "Add Influencer from Event" : "Add New Contact from Event";
  }
  if (submitBtn) {
    submitBtn.textContent = isInf ? "Add Influencer to Event & Database" : "Add Contact to Event & Database";
  }
}

function openAddContactFromEventModal(defaultRole = "prospect") {
  ensureEventsMeta();
  const activeEventKey = document.getElementById("select-event-view")?.value || database.eventsMeta[0]?.eventKey;
  syncEventSelectOptions(activeEventKey);

  const roleSelect = document.getElementById("event-new-contact-role");
  const resolvedRole = defaultRole === "influencer" ? "influencer" : "prospect";
  if (roleSelect) {
    roleSelect.value = resolvedRole;
  }
  updateEventAddContactRoleUI(resolvedRole);

  const dlg = document.getElementById("event-add-new-contact-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeAddContactFromEventModal() {
  const dlg = document.getElementById("event-add-new-contact-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function handleAddContactFromEventSubmit(e) {
  e.preventDefault();
  ensureEventsMeta();

  const eventKey = document.getElementById("event-new-contact-event")?.value || "gac_dinner";
  const fullName = (document.getElementById("event-new-contact-name")?.value || "").trim();
  const jobTitle = (document.getElementById("event-new-contact-title")?.value || "").trim();
  const company = (document.getElementById("event-new-contact-company")?.value || "").trim();
  const email = (document.getElementById("event-new-contact-email")?.value || "").trim().toLowerCase();
  const phone = (document.getElementById("event-new-contact-phone")?.value || "").trim();
  const rawLinkedin = (document.getElementById("event-new-contact-linkedin")?.value || "").trim();
  const linkedinUrl = typeof normalizeLinkedinUrl === "function" ? normalizeLinkedinUrl(rawLinkedin) : rawLinkedin;
  const referredBy = (document.getElementById("event-new-contact-referred-by")?.value || "").trim();
  const role = document.getElementById("event-new-contact-role")?.value || "prospect";
  const eventStatus = document.getElementById("event-new-contact-status")?.value || "Attended";
  const eventNotes = (document.getElementById("event-new-contact-notes")?.value || "").trim();

  if (!fullName || !email) {
    alert("Full Name and Email Address are required.");
    return;
  }

  const eventMeta = database.eventsMeta.find(m => m.eventKey === eventKey);
  const eventTitle = eventMeta ? eventMeta.title : eventKey;
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(" ") || "";
  const isInfluencer = (role === "influencer");
  const hasCallTaken = eventStatus.toLowerCase().includes("call") || eventStatus.toLowerCase().includes("briefing");

  // Check if contact already exists in database.contacts
  let contact = (database.contacts || []).find(c => (c.email || "").toLowerCase() === email);
  if (!contact) {
    const maxId = (database.contacts || []).reduce((max, c) => Math.max(max, Number(c.id) || 0), 1000);
    const newId = maxId + 1;
    contact = {
      id: newId,
      firstName,
      lastName,
      fullName,
      email,
      jobTitle: jobTitle || "Executive",
      company: company || "Credit Union",
      phone,
      linkedinUrl: linkedinUrl || "",
      industry: "Credit Union",
      sourceFile: `Event: ${eventTitle}`,
      state: "NY",
      attendedDinner: eventKey === "gac_dinner" ? "Yes" : "",
      visitedBooth: eventKey === "symwest_booth" ? "Yes" : "",
      enriched: Boolean(database.autoEnrich),
      enrichmentStatus: database.autoEnrich ? "verified_provider_data" : "pending",
      enrichmentSources: ["Event Capture"],
      matchPercentage: 94,
      leadTemp: isInfluencer ? "Influencer Partner" : "Hot Lead",
      emailsSent: false,
      linkedinSent: false,
      callsMade: hasCallTaken ? [{ date: new Date().toISOString().slice(0, 16).replace("T", " "), outcome: `${eventStatus} at ${eventTitle} (Call Taken)`, status: "taken" }] : [],
      hasScheduledCall: hasCallTaken,
      hasTakenCall: hasCallTaken,
      isInfluencer,
      referredBy: referredBy || "",
      referrals: isInfluencer ? [] : undefined,
      agreements: isInfluencer ? [] : undefined,
      referralCredits: isInfluencer ? 0 : undefined
    };
    database.contacts.unshift(contact);

    // If referredBy matches an influencer, also link to their referrals array
    if (referredBy) {
      const inf = database.contacts.find(c => c.isInfluencer && c.fullName.toLowerCase() === referredBy.toLowerCase());
      if (inf) {
        contact.influencerId = inf.id;
        contact.influencerEmail = inf.email;
        inf.referrals = inf.referrals || [];
        inf.referrals.unshift({
          id: contact.id,
          fullName: contact.fullName,
          jobTitle: contact.jobTitle,
          company: contact.company,
          email: contact.email,
          phone: contact.phone,
          linkedinUrl: contact.linkedinUrl,
          credits: hasCallTaken ? 25 : 10,
          hasScheduledCall: hasCallTaken,
          hasTakenCall: hasCallTaken,
          date: new Date().toISOString().slice(0, 10)
        });
        inf.referralCredits = (inf.referralCredits || 0) + 25;
      }
    }
  } else {
    if (eventKey === "gac_dinner") contact.attendedDinner = "Yes";
    if (eventKey === "symwest_booth") contact.visitedBooth = "Yes";
    if (hasCallTaken) {
      contact.hasTakenCall = true;
      contact.hasScheduledCall = true;
    }
  }

  if (isInfluencer) {
    contact.isInfluencer = true;
    contact.leadTemp = "Influencer Partner";
    contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
    contact.referralCredits = contact.referralCredits || 50;
    fetch("/api/influencers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: contact.fullName,
        email: contact.email,
        jobTitle: contact.jobTitle,
        company: contact.company,
        phone: contact.phone,
        industry: contact.industry || "Credit Union"
      })
    }).catch(() => {});
  }

  // Add to event roster
  if (!database.events[eventKey]) database.events[eventKey] = [];
  const existingIdx = database.events[eventKey].findIndex(a => (a.email || "").toLowerCase() === email || a.id === contact.id);
  const attendeeRecord = {
    id: contact.id,
    contactId: contact.id,
    fullName: contact.fullName,
    jobTitle: contact.jobTitle,
    company: contact.company,
    email: contact.email,
    phone: contact.phone,
    referredBy: contact.referredBy || "",
    eventStatus,
    eventNotes: eventNotes || `Captured at ${eventTitle}`
  };
  if (existingIdx >= 0) {
    database.events[eventKey][existingIdx] = attendeeRecord;
  } else {
    database.events[eventKey].unshift(attendeeRecord);
  }

  saveDatabaseCache();
  syncEventSelectOptions(eventKey);
  renderEventsList();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof filterUploadTable === "function") filterUploadTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();

  closeAddContactFromEventModal();
  const form = document.getElementById("event-add-new-contact-form");
  if (form) form.reset();

  addLogConsole("enrich", `[EVENT CAPTURE] Added ${contact.fullName} (${contact.company}) from "${eventTitle}" into the searchable SQLite database.`, "success");
}

function openEventRegisterModal() {
  ensureEventsMeta();
  const activeEventKey = document.getElementById("select-event-view")?.value || database.eventsMeta[0]?.eventKey;
  syncEventSelectOptions(activeEventKey);

  const dlg = document.getElementById("event-register-dialog");
  if (dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.style.display = "block";
  }
}

function closeEventRegisterModal() {
  const dlg = document.getElementById("event-register-dialog");
  if (dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.style.display = "none";
  }
}

function updateEventAttendeeStatus(eventKey, contactId, newStatus) {
  const list = database.events[eventKey] || [];
  const item = list.find(a => String(a.id) === String(contactId) || String(a.contactId) === String(contactId));
  if (item) {
    item.eventStatus = newStatus;
    if (newStatus.toLowerCase().includes("call") || newStatus.toLowerCase().includes("briefing")) {
      const mainContact = (database.contacts || []).find(c => String(c.id) === String(contactId));
      if (mainContact) {
        mainContact.hasTakenCall = true;
        mainContact.hasScheduledCall = true;
        mainContact.callsMade = mainContact.callsMade || [];
        mainContact.callsMade.push({
          date: new Date().toISOString().slice(0, 16).replace("T", " "),
          outcome: `Event Briefing Completed (${eventKey}) - Call Taken`,
          status: "taken"
        });
      }
    }
    saveDatabaseCache();
    renderEventsList();
  }
}

function removeEventAttendee(eventKey, contactId) {
  if (!database.events[eventKey]) return;
  database.events[eventKey] = database.events[eventKey].filter(a => String(a.id) !== String(contactId) && String(a.contactId) !== String(contactId));
  saveDatabaseCache();
  syncEventSelectOptions(eventKey);
  renderEventsList();
}

function renderEventsList() {
  ensureEventsMeta();
  const eventSelect = document.getElementById("select-event-view");
  if (!eventSelect) return;

  const currentKey = eventSelect.value || database.eventsMeta[0]?.eventKey || "gac_dinner";
  syncEventSelectOptions(currentKey);

  const eventKey = eventSelect.value;
  const rawList = database.events[eventKey] || [];
  const searchVal = (document.getElementById("events-search-input")?.value || "").trim().toLowerCase();

  const list = searchVal
    ? rawList.filter(c =>
        (c.fullName || "").toLowerCase().includes(searchVal) ||
        (c.company || "").toLowerCase().includes(searchVal) ||
        (c.email || "").toLowerCase().includes(searchVal) ||
        (c.eventNotes || "").toLowerCase().includes(searchVal)
      )
    : rawList;

  const meta = database.eventsMeta.find(m => m.eventKey === eventKey) || {
    title: eventKey,
    date: "2026-10-14",
    location: "Field Event",
    type: "Executive Event",
    description: ""
  };

  const titleEl = document.getElementById("events-list-title");
  const countEl = document.getElementById("events-list-count");
  const tbody = document.getElementById("table-events-attendees-body");

  const metaTitleEl = document.getElementById("event-meta-title-display");
  const metaDescEl = document.getElementById("event-meta-desc-display");
  const metaDateEl = document.getElementById("event-meta-date-display");
  const metaLocEl = document.getElementById("event-meta-location-display");
  const metaTypeEl = document.getElementById("event-meta-type-badge");

  if (titleEl) titleEl.textContent = meta.title;
  if (metaTitleEl) metaTitleEl.textContent = meta.title;
  if (metaDescEl) metaDescEl.textContent = meta.description ? `— ${meta.description}` : "";
  if (metaDateEl) metaDateEl.textContent = meta.date || "TBD";
  if (metaLocEl) metaLocEl.textContent = meta.location || "TBD";
  if (metaTypeEl) metaTypeEl.textContent = meta.type || "Field Event";
  if (countEl) countEl.textContent = `${rawList.length} attendee${rawList.length === 1 ? "" : "s"}`;

  if (!tbody) return;
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.25rem; color: var(--color-text-secondary);">
          <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px;">No attendees registered for this event yet</div>
          <div style="font-size: 12px; margin-bottom: 12px;">Add a brand-new contact or influencer met at this event, or register an existing contact from the database.</div>
          <div style="display: inline-flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-primary btn-sm" onclick="openAddContactFromEventModal('prospect')">+ Add New Contact from Event</button>
            <button class="btn btn-secondary btn-sm" onclick="openAddContactFromEventModal('influencer')" style="color: #0d9488; border-color: rgba(13, 148, 136, 0.35); background: rgba(13, 148, 136, 0.08);">+ Add Influencer from Event</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(c => {
    const cid = c.contactId || c.id;
    const mainContact = (database.contacts || []).find(mc =>
      String(mc.id) === String(cid) ||
      (mc.email && c.email && String(mc.email).toLowerCase() === String(c.email).toLowerCase())
    );
    const resolvedId = mainContact ? mainContact.id : cid;
    const isInf = Boolean(mainContact && mainContact.isInfluencer);
    const status = c.eventStatus || "Attended";
    const tr = document.createElement("tr");

    const influencerActionBtn = isInf
      ? `<button class="btn btn-secondary btn-xs" onclick="openInfluencerPortalForContact('${resolvedId}')" title="Open this partner's Influencer Referral Portal" style="border-color: rgba(13, 148, 136, 0.45); color: #0d9488; display: inline-flex; align-items: center; gap: 4px;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
           Influencer Portal
         </button>`
      : `<button class="btn btn-secondary btn-xs" onclick="convertEventAttendeeToInfluencer('${eventKey}', '${resolvedId}')" title="Convert this event contact into an Influencer Partner with their own Referral Portal" style="border-color: rgba(99, 102, 241, 0.45); color: #818cf8; display: inline-flex; align-items: center; gap: 4px;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
           Convert to Influencer
         </button>`;

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: ${getAvatarColor(c.fullName)}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0;">
            ${getInitials(c.fullName)}
          </div>
          <div>
            <div style="font-weight: 600; color: var(--color-text-primary); display: flex; align-items: center; gap: 5px;">
              ${c.fullName}
              ${isInf ? `<span class="badge" style="font-size: 9.5px; background: rgba(99, 102, 241, 0.14); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">Influencer</span>` : ""}
            </div>
            ${c.referredBy ? `<div style="font-size: 10.5px; color: #0d9488; font-weight: 600;">Referred by ${c.referredBy}</div>` : ""}
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight: 500; color: var(--color-text-primary);">${c.jobTitle || "Executive"}</div>
        <div style="font-size: 11px; color: var(--color-text-secondary);">${c.company || "Credit Union"}</div>
      </td>
      <td>
        <div><code style="font-size: 11.5px;">${c.email || "N/A"}</code></div>
        <div style="font-size: 11px; color: var(--color-text-secondary);">${c.phone || ""}</div>
      </td>
      <td>
        <select class="form-select" onchange="updateEventAttendeeStatus('${eventKey}', '${resolvedId}', this.value)" style="font-size: 11.5px; padding: 3px 8px; height: auto; width: auto; font-weight: 600;">
          <option value="Attended" ${status === "Attended" ? "selected" : ""}>✓ Attended</option>
          <option value="Visited Booth" ${status === "Visited Booth" ? "selected" : ""}> Visited Booth</option>
          <option value="Registered" ${status === "Registered" ? "selected" : ""}> Registered</option>
          <option value="VIP Briefing Completed" ${status === "VIP Briefing Completed" ? "selected" : ""}> Briefing / Call Taken</option>
        </select>
      </td>
      <td class="event-notes-cell" style="font-size: 12px; color: var(--color-text-secondary); max-width: 260px;">${c.eventNotes || "Registered via Event Console"}</td>
      <td style="text-align: right;">
        <div class="event-row-actions" style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
          ${influencerActionBtn}
          <button class="btn btn-primary btn-xs event-outreach-btn" onclick="switchTab('campaign-outbound'); setTimeout(() => openOutboundModal(${Number(resolvedId) || 1}, 'email'), 100);">Outreach</button>
          <button class="btn btn-secondary btn-xs" style="color: var(--color-error);" onclick="removeEventAttendee('${eventKey}', '${resolvedId}')" title="Remove from event">✕</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function convertEventAttendeeToInfluencer(eventKey, contactId) {
  let contact = (database.contacts || []).find(c => String(c.id) === String(contactId));
  if (!contact && database.events && database.events[eventKey]) {
    const attendee = database.events[eventKey].find(a => String(a.id) === String(contactId) || String(a.contactId) === String(contactId));
    if (attendee) {
      const maxId = (database.contacts || []).reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
      const newId = Number(attendee.id) || (maxId + 1);
      const parts = (attendee.fullName || "Partner").split(/\s+/);
      contact = {
        id: newId,
        firstName: parts[0] || "Partner",
        lastName: parts.slice(1).join(" ") || "",
        fullName: attendee.fullName,
        email: attendee.email || "",
        jobTitle: attendee.jobTitle || "Executive",
        company: attendee.company || "Credit Union",
        phone: attendee.phone || "",
        industry: "Credit Union",
        sourceFile: `Event: ${eventKey}`,
        enriched: true,
        isInfluencer: false,
        referrals: [],
        referralCredits: 50
      };
      database.contacts.unshift(contact);
      attendee.contactId = contact.id;
      attendee.id = contact.id;
    }
  }
  if (contact && typeof convertContactToInfluencer === "function") {
    convertContactToInfluencer(contact.id, true);
  }
}

function renderEventsTable() {
  renderEventsList();
}

function handleRegContactSearch(text) {
  const dropdown = document.getElementById("reg-contact-autocomplete");
  const hiddenInput = document.getElementById("event-reg-contact-id");
  if (!dropdown || !hiddenInput) return;

  dropdown.innerHTML = "";
  hiddenInput.value = "";

  if (!text.trim() || database.contacts.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  const matches = database.contacts.filter(c =>
    (c.fullName || "").toLowerCase().includes(text.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(text.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(text.toLowerCase())
  ).slice(0, 8);

  if (matches.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.style.display = "block";
  matches.forEach(c => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.style.cssText = "padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--color-border); font-size: 12.5px;";
    div.textContent = `${c.fullName} — ${c.jobTitle || "Executive"} (${c.company})`;
    div.onclick = () => {
      document.getElementById("event-reg-contact-search").value = c.fullName;
      hiddenInput.value = c.id;
      dropdown.style.display = "none";
    };
    dropdown.appendChild(div);
  });
}

function handleEventRegistration(e) {
  e.preventDefault();

  const searchEl = document.getElementById("event-reg-contact-search");
  const contactId = document.getElementById("event-reg-contact-id").value;
  const eventSelect = document.getElementById("select-reg-event");
  const statusSelect = document.getElementById("input-reg-status");
  const notesText = document.getElementById("input-reg-notes");
  const regAsInfCheckbox = document.getElementById("input-reg-as-influencer");

  if (!contactId || !eventSelect) {
    alert("Please select a valid contact using the search dropdown list.");
    return;
  }

  const contact = database.contacts.find(c => String(c.id) === String(contactId));
  if (!contact) return;

  if (regAsInfCheckbox && regAsInfCheckbox.checked) {
    contact.isInfluencer = true;
    contact.leadTemp = "Influencer Partner";
    contact.referrals = Array.isArray(contact.referrals) ? contact.referrals : [];
    contact.referralCredits = Math.max(Number(contact.referralCredits) || 0, 50);
  }

  const eventKey = eventSelect.value;
  const newReg = {
    id: contact.id,
    contactId: contact.id,
    fullName: contact.fullName,
    jobTitle: contact.jobTitle,
    company: contact.company,
    email: contact.email,
    phone: contact.phone,
    referredBy: contact.referredBy || "",
    eventStatus: statusSelect.value,
    eventNotes: notesText.value || "Registered via Event Console Form"
  };

  if (!database.events[eventKey]) database.events[eventKey] = [];
  if (!database.events[eventKey].some(c => String(c.id) === String(contact.id))) {
    database.events[eventKey].unshift(newReg);
  }

  saveDatabaseCache();

  searchEl.value = "";
  document.getElementById("event-reg-contact-id").value = "";
  notesText.value = "";
  if (regAsInfCheckbox) regAsInfCheckbox.checked = false;
  closeEventRegisterModal();

  addLogConsole("enrich", `[EVENT REGISTRATION] Registered ${contact.fullName} for ${eventKey}`, "success");

  const viewSelect = document.getElementById("select-event-view");
  if (viewSelect) viewSelect.value = eventKey;
  renderEventsList();
  if (typeof filterUploadTable === "function") filterUploadTable();
  if (typeof filterOutboundTable === "function") filterOutboundTable();
  if (typeof renderInfluencersTable === "function") renderInfluencersTable();
}

window.openCreateEventModal = openCreateEventModal;
window.closeCreateEventModal = closeCreateEventModal;
window.handleCreateEventSubmit = handleCreateEventSubmit;
window.openAddContactFromEventModal = openAddContactFromEventModal;
window.updateEventAddContactRoleUI = updateEventAddContactRoleUI;
window.closeAddContactFromEventModal = closeAddContactFromEventModal;
window.handleAddContactFromEventSubmit = handleAddContactFromEventSubmit;
window.openEventRegisterModal = openEventRegisterModal;
window.closeEventRegisterModal = closeEventRegisterModal;
window.updateEventAttendeeStatus = updateEventAttendeeStatus;
window.removeEventAttendee = removeEventAttendee;
window.renderEventsList = renderEventsList;
window.renderEventsTable = renderEventsTable;
window.convertEventAttendeeToInfluencer = convertEventAttendeeToInfluencer;
window.handleRegContactSearch = handleRegContactSearch;
window.handleEventRegistration = handleEventRegistration;
