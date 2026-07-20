// --- EVENTS CAMPAIGN ATTENDEES & PORTAL REGISTRATION CONTROLLER ---

function renderEventsList() {
  const eventSelect = document.getElementById("select-event-view");
  if (!eventSelect) return;

  const eventKey = eventSelect.value;
  const list = database.events[eventKey] || [];

  const titleEl = document.getElementById("events-list-title");
  const countEl = document.getElementById("events-list-count");
  const tbody = document.getElementById("table-events-attendees-body");

  if (eventKey === "gac_dinner") {
    titleEl.textContent = "GAC 2023 Dinner Attendance";
  } else if (eventKey === "symwest_booth") {
    titleEl.textContent = "SymWest 2026 Booth Visitors";
  } else {
    titleEl.textContent = "Credit Union Executive Meetup (Enriched)";
  }

  countEl.textContent = `${list.length} attendees`;

  if (!tbody) return;
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">No attendees registered for this campaign event.</td></tr>`;
    return;
  }

  list.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.fullName}</strong></td>
      <td>${c.jobTitle}</td>
      <td>${c.company}</td>
      <td><code>${c.email || "N/A"}</code></td>
      <td><span class="badge-match-score">Attended</span></td>
      <td style="font-size:12px;color:var(--muted);">${c.eventNotes || "Default attendance list"}</td>
    `;
    tbody.appendChild(tr);
  });
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
    c.fullName.toLowerCase().includes(text.toLowerCase()) ||
    c.company.toLowerCase().includes(text.toLowerCase())
  ).slice(0, 5);

  if (matches.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.style.display = "block";
  matches.forEach(c => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = `${c.fullName} (${c.company})`;
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

  if (!contactId || !eventSelect) {
    alert("Please select a valid contact using the search dropdown list.");
    return;
  }

  const contact = database.contacts.find(c => c.id === parseInt(contactId));
  if (!contact) return;

  // Append Event Properties
  const eventKey = eventSelect.value;
  const newReg = {
    ...contact,
    eventStatus: statusSelect.value,
    eventNotes: notesText.value || "Registered via Event Console Form"
  };

  // Push to events arrays
  if (!database.events[eventKey]) database.events[eventKey] = [];

  // Prevent duplicate
  if (!database.events[eventKey].some(c => c.id === contact.id)) {
    database.events[eventKey].push(newReg);
  }

  saveDatabaseCache();

  // Clear form
  searchEl.value = "";
  document.getElementById("event-reg-contact-id").value = "";
  notesText.value = "";

  addLogConsole("enrich", `[EVENT REGISTRATION] Registered ${contact.fullName} for ${eventKey}`, "success");

  // Go back to view
  document.getElementById("select-event-view").value = eventKey;
  switchTab("events-list");
}

window.renderEventsList = renderEventsList;
window.handleRegContactSearch = handleRegContactSearch;
window.handleEventRegistration = handleEventRegistration;
