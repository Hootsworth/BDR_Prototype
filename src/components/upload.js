// --- UPLOAD, DRAG-AND-DROP, & CSV FIELD MAPPER CONTROLLER ---

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById("upload-dropzone");
  if (dropzone) dropzone.classList.add("hovering");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById("upload-dropzone");
  if (dropzone) dropzone.classList.remove("hovering");
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById("upload-dropzone");
  if (dropzone) dropzone.classList.remove("hovering");

  const dt = e.dataTransfer;
  const file = dt.files[0];
  if (file && file.name.endsWith(".csv")) {
    const fileInput = document.getElementById("csv-file-input");
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Process file
    handleCSVFileUpload({ target: { files: [file] } });
  } else {
    alert("Please upload a valid CSV file.");
  }
}

function parseCSV(text) {
  let lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',') {
      if (inQuotes) {
        row[row.length - 1] += c;
      } else {
        row.push('');
      }
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') {
        i++; // skip LF of CRLF
      }
      if (inQuotes) {
        row[row.length - 1] += '\n';
      } else {
        lines.push(row);
        row = [''];
      }
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

function handleCSVFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const summaryEl = document.getElementById("upload-stats-summary");
  if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--primary)">Reading local file: ${file.name}...</span>`;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const lines = parseCSV(text);
    if (lines.length < 2) {
      alert("Uploaded CSV file is empty or invalid.");
      return;
    }
    openColumnMapper(lines, file.name);
  };
  reader.readAsText(file);
}

let tempCSVLines = [];
let tempFileName = "";

function openColumnMapper(lines, fileName) {
  tempCSVLines = lines;
  tempFileName = fileName;
  
  const dialog = document.getElementById("column-mapper-dialog");
  const container = document.getElementById("field-mapping-container");
  if (!dialog || !container) return;

  const headers = lines[0].map(h => h.trim());
  
  // Standard fields to map
  const standardFields = [
    { key: "firstName", label: "First Name", guesses: ["first name", "first", "name", "given name"] },
    { key: "lastName", label: "Last Name", guesses: ["last name", "last", "surname", "family name"] },
    { key: "email", label: "Email Address", guesses: ["email", "email address", "email_address", "mail"] },
    { key: "jobTitle", label: "Job Title", guesses: ["job title", "title", "job_title", "role"] },
    { key: "company", label: "Company Name", guesses: ["company", "company name", "company_name", "firm", "organization"] },
    { key: "phone", label: "Phone Number", guesses: ["phone", "phone number", "phone_number", "tel", "mobile"] },
    { key: "industry", label: "Industry", guesses: ["industry", "vertical"] },
    { key: "assetSize", label: "Asset Size", guesses: ["asset size", "assets", "size"] },
    { key: "state", label: "State / Region", guesses: ["state", "shipping state", "region", "province"] }
  ];

  container.innerHTML = "";
  
  standardFields.forEach(field => {
    const row = document.createElement("div");
    row.className = "field-mapping-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1.2fr auto 1.5fr";
    row.style.gap = "10px";
    row.style.alignItems = "center";
    row.style.marginBottom = "10px";

    // Find best matching guess
    let bestMatchIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const hLower = headers[i].toLowerCase();
      if (field.guesses.some(g => hLower.includes(g) || g.includes(hLower))) {
        bestMatchIdx = i;
        break;
      }
    }

    let optionsHTML = `<option value="-1">-- Ignore / Blank --</option>`;
    headers.forEach((h, idx) => {
      const selected = idx === bestMatchIdx ? "selected" : "";
      optionsHTML += `<option value="${idx}" ${selected}>CSV: ${h}</option>`;
    });

    row.innerHTML = `
      <span style="font-size: 13px; font-weight: 700; color: var(--ink);">${field.label}</span>
      <span style="font-size: 14px; color: var(--muted);">➔</span>
      <select class="select-control mapping-select" data-field="${field.key}" style="font-size: 12.5px; height: 32px; padding: 0 8px;">
        ${optionsHTML}
      </select>
    `;
    container.appendChild(row);
  });

  dialog.showModal();
}

function closeColumnMapper() {
  const dialog = document.getElementById("column-mapper-dialog");
  if (dialog) dialog.close();
}

function confirmColumnMapping() {
  const selectElements = document.querySelectorAll(".mapping-select");
  const fieldIndices = {};
  
  selectElements.forEach(select => {
    const fieldKey = select.getAttribute("data-field");
    const colIdx = parseInt(select.value);
    fieldIndices[fieldKey] = colIdx;
  });

  // Process data with custom mappings
  const parsed = [];
  const lines = tempCSVLines;
  
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length < 2) continue;

    const getValue = (key) => {
      const idx = fieldIndices[key];
      return idx !== undefined && idx !== -1 && idx < row.length ? row[idx].trim() : "";
    };

    const first = getValue("firstName");
    const last = getValue("lastName");
    const email = getValue("email");
    const jobTitle = getValue("jobTitle");
    const company = getValue("company");
    const phone = getValue("phone");
    const industry = getValue("industry");
    const assetSize = getValue("assetSize");
    const state = getValue("state");

    parsed.push({
      id: Date.now() + i,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`.trim() || "Unknown Lead",
      email: email,
      jobTitle: jobTitle,
      company: company,
      phone: phone,
      industry: industry,
      assetSize: assetSize || "$0",
      state: state || "US",
      sourceFile: tempFileName,
      enriched: false,
      leadTemp: "Cold Lead"
    });
  }

  // Save to database
  const isInfluencerFile = tempFileName.toLowerCase().includes("influencer");
  parsed.forEach(c => {
    c.isInfluencer = isInfluencerFile;
    if (isInfluencerFile) {
      c.referrals = [];
      c.referralCredits = 0;
      c.matchPercentage = 95;
    }
  });

  if (database.autoEnrich) {
    parsed.forEach(c => {
      c.enriched = true;
      if (!c.matchPercentage) c.matchPercentage = 95;
      c.leadTemp = "Hot Lead";
      if (!c.assetSize || c.assetSize === "$0") c.assetSize = "$350M";
    });
  }

  if (isInfluencerFile) {
    const prospects = database.contacts.filter(c => c.isInfluencer !== true);
    database.contacts = [...prospects, ...parsed];
  } else {
    const influencers = database.contacts.filter(c => c.isInfluencer === true);
    database.contacts = [...influencers, ...parsed];
  }

  initLoadedData();
  saveDatabaseCache();

  closeColumnMapper();

  const typeLabel = isInfluencerFile ? "influencers" : "contacts";
  const autoEnrichMsg = database.autoEnrich ? " (Auto-Enriched ⚡)" : "";
  addLogConsole("enrich", `[SYSTEM] Uploaded & mapped ${parsed.length} ${typeLabel} from ${tempFileName}${autoEnrichMsg}.`, "success");
}

function toggleAutoEnrichSetting(checked) {
  database.autoEnrich = checked;
  localStorage.setItem("gtm_auto_enrich", checked ? "true" : "false");
  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[SYSTEM] Automatic enrichment setting ${checked ? 'ENABLED' : 'DISABLED'}.`, "info");
  }
}

window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.parseCSV = parseCSV;
window.handleCSVFileUpload = handleCSVFileUpload;
window.openColumnMapper = openColumnMapper;
window.closeColumnMapper = closeColumnMapper;
window.confirmColumnMapping = confirmColumnMapping;
window.toggleAutoEnrichSetting = toggleAutoEnrichSetting;
