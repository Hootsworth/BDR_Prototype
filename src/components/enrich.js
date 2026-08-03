// --- B2B ENRICHMENT PIPELINE CONTROLLER ---

const enrichmentFields = [
  ["professional_summary", "Professional summary"], ["seniority", "Seniority & department"],
  ["likely_pain_points", "Likely pain points"], ["buying_signals", "Buying signals"],
  ["personalization_angles", "Personalization angles"], ["relevant_topics", "Relevant topics"],
  ["data_gaps", "Data gaps"], ["confidence", "Confidence"],
];

function renderEnrichmentFieldOptions() {
  const container = document.getElementById("enrichment-field-options");
  if (!container) return;
  const selected = JSON.parse(localStorage.getItem("gtm_enrichment_fields") || "null") || enrichmentFields.map(f => f[0]);
  container.innerHTML = enrichmentFields.map(([key, label]) => `<label style="font-size:var(--font-size-xs); display:flex; gap:0.4rem; align-items:center;"><input type="checkbox" data-enrichment-field="${key}" ${selected.includes(key) ? "checked" : ""}>${label}</label>`).join("");
}

function selectedEnrichmentFields() {
  const fields = [...document.querySelectorAll("[data-enrichment-field]:checked")].map(el => el.dataset.enrichmentField);
  const chosen = fields.length ? fields : enrichmentFields.map(f => f[0]);
  localStorage.setItem("gtm_enrichment_fields", JSON.stringify(chosen));
  return chosen;
}

function getApiBaseUrl() {
  if (window.location.hostname.includes("github.io")) {
    return "https://api.explorium.ai";
  }
  return "/api/proxy";
}

async function runDataEnrichment() {
  if (database.contacts.length === 0 || database.exploriumApiKey === "") return;

  const btn = document.getElementById("btn-run-enrich");
  const progressContainer = document.getElementById("enrich-progress-container");
  const fill = document.getElementById("enrich-progress-fill");
  const label = document.getElementById("enrich-progress-label");
  const consoleBox = document.getElementById("enrich-console-box");

  if (!btn || !progressContainer || !fill || !label || !consoleBox) return;

  btn.disabled = true;
  progressContainer.style.display = "block";
  consoleBox.innerHTML = "";

  addLogConsole("enrich", "[SYSTEM] Initiating live Explorium enrichment pipeline...", "system");
  if (window.location.hostname.includes("github.io")) {
    addLogConsole("enrich", "[WARNING] Running on GitHub Pages. Direct API requests will be fired to api.explorium.ai. If the browser halts due to a CORS restriction, please run locally using 'python3 server.py' or deploy to Vercel.", "warning");
  }
  fill.style.width = "10%";
  label.textContent = "Matching 10%";

  // Select a batch of exactly 10 contacts to enrich to conserve user credits
  const contactsToEnrich = database.contacts.filter(c => !c.enriched).slice(0, 10);
  if (contactsToEnrich.length === 0) {
    addLogConsole("enrich", "[SYSTEM] All contacts are already enriched!", "success");
    fill.style.width = "100%";
    label.textContent = "100% Complete";
    btn.disabled = false;
    return;
  }

  addLogConsole("enrich", `[SYSTEM] Selected first ${contactsToEnrich.length} unenriched contacts for live processing.`, "info");

  const apiBase = getApiBaseUrl();

  // Phase 1: Match prospects
  addLogConsole("enrich", `[API] POST /v1/prospects/match - Sending payload for matching...`, "info");

  const prospectsToMatch = contactsToEnrich.map(c => ({
    email: c.email || "",
    full_name: c.fullName || "",
    company_name: c.company || ""
  }));

  let matchData = null;
  let aiProfiles = [];
  try {
    const response = await fetch(`${apiBase}/v1/prospects/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": database.exploriumApiKey
      },
      body: JSON.stringify({
        prospects_to_match: prospectsToMatch
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Match API error (${response.status}): ${errText}`);
    }

    matchData = await response.json();
    addLogConsole("enrich", `[API] /v1/prospects/match completed successfully. Matched ${matchData.total_matches || 0} prospects.`, "success");
  } catch (err) {
    console.error(err);
    addLogConsole("enrich", `[API ERROR] Match API request failed: ${err.message}`, "error");
    addLogConsole("enrich", `[ABORT] Explorium match requests failed. Target contacts were NOT marked as enriched.`, "error");

    // Reset loader state
    progressContainer.style.display = "none";
    btn.disabled = false;
    alert(`Enrichment aborted: Match API call failed.\n${err.message}`);
    return;
  }

  fill.style.width = "50%";
  label.textContent = "Enriching 50%";

  // Phase 2: Bulk enrich
  let enrichData = null;
  if (matchData && matchData.matched_prospects) {
    // Map prospect_ids back
    matchData.matched_prospects.forEach((matched, index) => {
      if (matched && matched.prospect_id) {
        contactsToEnrich[index].prospectId = matched.prospect_id;
      }
    });

    const prospectIds = matchData.matched_prospects
      .map(p => p.prospect_id)
      .filter(id => id && id !== "");

    if (prospectIds.length > 0) {
      addLogConsole("enrich", `[API] POST /v1/prospects/contacts_information/bulk_enrich - Retrieving details for ${prospectIds.length} IDs...`, "info");
      try {
        const response = await fetch(`${apiBase}/v1/prospects/contacts_information/bulk_enrich`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api_key": database.exploriumApiKey
          },
          body: JSON.stringify({
            prospect_ids: prospectIds
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Enrich API error (${response.status}): ${errText}`);
        }

        enrichData = await response.json();
        addLogConsole("enrich", `[API] /v1/prospects/contacts_information/bulk_enrich complete. API credits successfully consumed.`, "success");
      } catch (err) {
        console.error(err);
        addLogConsole("enrich", `[API ERROR] Bulk enrich request failed: ${err.message}`, "error");
        addLogConsole("enrich", `[ABORT] Bulk enrichment details request failed. Target contacts were NOT marked as enriched.`, "error");

        // Reset loader state
        progressContainer.style.display = "none";
        btn.disabled = false;
        alert(`Enrichment aborted: Bulk enrich details failed.\n${err.message}`);
        return;
      }
    } else {
      addLogConsole("enrich", `[SYSTEM] No prospect matches were found by the API.`, "info");
    }
  }

  fill.style.width = "90%";
  label.textContent = "Applying 90%";

  // Phase 3: Update local database
  const enrichedRecords = enrichData ? (Array.isArray(enrichData) ? enrichData : (enrichData.results || enrichData.records || [])) : [];

  // Add a broader AI research profile. These are explicitly stored as AI-derived
  // insights, separate from verified provider fields.
  try {
    addLogConsole("enrich", "[AI] Building research profiles from the supplied contact and company context...", "info");
    const aiResponse = await fetch("/api/ai/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: contactsToEnrich, fields: selectedEnrichmentFields() })
    });
    const aiData = await aiResponse.json();
    if (!aiResponse.ok) throw new Error(aiData.error || `AI enrichment returned ${aiResponse.status}`);
    const profiles = aiData.profiles || [];
    aiProfiles = profiles;
    contactsToEnrich.forEach((contact, index) => {
      const profile = profiles[index] || profiles.find(p => p.email === contact.email);
      if (profile) contact.aiEnrichment = { ...profile, generatedAt: new Date().toISOString(), provider: aiData.provider };
    });
    addLogConsole("enrich", `[AI] Added structured research profiles for ${profiles.length} contacts.`, "success");
  } catch (error) {
    addLogConsole("enrich", `[AI] Profile generation skipped: ${error.message}`, "warning");
  }

  contactsToEnrich.forEach((c) => {
    // Try to find the matched record in the API response
    const apiRecord = enrichedRecords.find(r => r.prospect_id === c.prospectId);
    const aiProfile = c.aiEnrichment || aiProfiles.find(p => p.email === c.email);

    if (apiRecord) {
      if (apiRecord.emails && apiRecord.emails.length > 0) {
        c.email = apiRecord.emails[0];
      }
      if (apiRecord.phone_numbers && apiRecord.phone_numbers.length > 0) {
        c.phone = apiRecord.phone_numbers[0];
      } else if (apiRecord.mobile_phone) {
        c.phone = apiRecord.mobile_phone;
      }
    }

    c.enrichmentStatus = apiRecord ? "verified_provider_data" : (aiProfile ? "ai_profile_only" : "incomplete");
    c.enrichmentSources = apiRecord ? ["Explorium"] : [];
    if (aiProfile) c.enrichmentSources.push("AI analysis of supplied context");
    c.enrichmentFieldsRequested = selectedEnrichmentFields();
    c.enriched = Boolean(apiRecord);
    if (c.enriched) database.stats.enrichedCount++;

    // Never fabricate contact details. Scores are only a local prioritization hint.
    const title = c.jobTitle.toLowerCase();
    let score = 70;
    if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
      score = 97;
    } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
      score = 96;
    } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
      score = 89;
    } else if (title.includes("manager") || title.includes("cfo") || title.includes("analyst")) {
      score = 79;
    } else {
      score = 69;
    }
    c.matchPercentage = score;
    c.matchScoreSource = "title-based heuristic; not verified enrichment";

    if (score >= 88) {
      c.leadTemp = "Hot Lead";
    } else {
      c.leadTemp = "Cold Lead";
    }
  });

  saveDatabaseCache();

  fill.style.width = "100%";
  label.textContent = "100% Complete";

  addLogConsole("enrich", `[SYSTEM] Enrichment complete! Processed ${contactsToEnrich.length} contacts. Database cached.`, "success");

  setTimeout(() => {
    progressContainer.style.display = "none";
    btn.disabled = false;

    // Reload dependent views
    if (typeof updateSystemStatusDot === "function") updateSystemStatusDot();
    if (typeof updateStatsSummaryText === "function") updateStatsSummaryText();
    if (typeof filterInfluencersTable === "function") filterInfluencersTable();
  }, 2000);
}

function enrichDataRecords() {
  database.contacts.forEach((c) => {
    c.enriched = true;

    // Compute a local prioritization hint from job-title seniority.
    const title = c.jobTitle.toLowerCase();
    let score = 70;
    if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
      score = Math.floor(Math.random() * 5) + 95; // 95-99%
    } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
      score = Math.floor(Math.random() * 5) + 94; // 94-98%
    } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
      score = Math.floor(Math.random() * 10) + 85; // 85-94%
    } else if (title.includes("manager") || title.includes("cfo") || title.includes("analyst")) {
      score = Math.floor(Math.random() * 10) + 75; // 75-84%
    } else {
      score = Math.floor(Math.random() * 10) + 65; // 65-74%
    }
    c.matchPercentage = score;

    // Set lead temperature status.
    if (score >= 88) {
      c.leadTemp = "Hot Lead";
    } else {
      c.leadTemp = "Cold Lead";
    }
  });

  database.stats.enrichedCount = database.contacts.length;
}

window.getApiBaseUrl = getApiBaseUrl;
window.runDataEnrichment = runDataEnrichment;
window.enrichDataRecords = enrichDataRecords;
window.renderEnrichmentFieldOptions = renderEnrichmentFieldOptions;
