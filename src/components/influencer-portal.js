// --- INFLUENCER PORTAL & REWARDS DASHBOARD CONTROLLER ---

let currentActiveInfluencerEmail = "bob.miller@milleradvisory.com";
let isLinkedInConnectedMock = false;

// Mock AI Suggested LinkedIn Connections
const mockLinkedInSuggestions = [
  {
    id: "sug-101",
    fullName: "David Vance",
    jobTitle: "VP of Information Technology",
    company: "First National Credit Union",
    email: "dvance@firstnationalcu.org",
    phone: "+1 (555) 234-5678",
    matchPercentage: 98,
    connectionDegree: "1st degree connection",
    mutualConnections: 14,
    submitted: false
  },
  {
    id: "sug-102",
    fullName: "Elena Rostova",
    jobTitle: "Chief Risk & Compliance Officer",
    company: "Beacon Financial Credit Union",
    email: "erostova@beaconfinancialcu.org",
    phone: "+1 (555) 876-5432",
    matchPercentage: 94,
    connectionDegree: "1st degree connection",
    mutualConnections: 9,
    submitted: false
  },
  {
    id: "sug-103",
    fullName: "Marcus Thorne",
    jobTitle: "Director of Cloud Operations",
    company: "Summit Credit Union",
    email: "mthorne@summitcu.org",
    phone: "+1 (555) 998-1122",
    matchPercentage: 91,
    connectionDegree: "1st degree connection",
    mutualConnections: 21,
    submitted: false
  }
];

function getActiveInfluencer() {
  let inf = database.contacts.find(c => c.isInfluencer && c.email.toLowerCase() === currentActiveInfluencerEmail.toLowerCase());
  if (!inf) {
    inf = database.contacts.find(c => c.isInfluencer);
  }
  return inf;
}

function openInfluencerPortal(influencerEmail) {
  if (influencerEmail) {
    currentActiveInfluencerEmail = influencerEmail;
  }
  switchTab('influencer-portal');
  renderInfluencerPortal();
}

function renderInfluencerPortal() {
  populateInfluencerSelector();
  const inf = getActiveInfluencer();
  if (!inf) return;

  currentActiveInfluencerEmail = inf.email;

  // Header Details
  const nameEl = document.getElementById("portal-inf-name");
  const companyEl = document.getElementById("portal-inf-company");
  const initialsEl = document.getElementById("portal-inf-initials");
  const tierEl = document.getElementById("portal-inf-tier");
  const linkInput = document.getElementById("portal-referral-link");

  if (nameEl) nameEl.textContent = inf.fullName;
  if (companyEl) companyEl.textContent = `${inf.jobTitle || 'Advisor'} • ${inf.company || ''} (${inf.email})`;
  if (initialsEl) {
    const parts = inf.fullName.split(" ");
    initialsEl.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  if (linkInput) {
    const cleanCode = inf.firstName.toUpperCase() + "2026";
    linkInput.value = `https://gtm-console.app/ref/${cleanCode}`;
  }

  // Tier calculation
  const totalCredits = inf.referralCredits || 0;
  if (tierEl) {
    if (totalCredits >= 150) tierEl.textContent = "Platinum Partner";
    else if (totalCredits >= 50) tierEl.textContent = "Gold Partner";
    else tierEl.textContent = "Bronze Partner";
  }

  // Update Stats Cards
  const referralsList = inf.referrals || [];
  const referralsCountEl = document.getElementById("portal-stat-referrals-count");
  const meetingsCountEl = document.getElementById("portal-stat-meetings-count");
  const totalCreditsEl = document.getElementById("portal-stat-total-credits");
  const availableCreditsEl = document.getElementById("portal-stat-available-credits");
  const storeBalanceEl = document.getElementById("store-balance-display");

  const meetingsCount = referralsList.filter(r => r.status === "Meeting Booked" || r.status === "Converted").length;

  if (referralsCountEl) referralsCountEl.textContent = referralsList.length;
  if (meetingsCountEl) meetingsCountEl.textContent = meetingsCount;
  if (totalCreditsEl) totalCreditsEl.textContent = `${totalCredits} Credits`;
  if (availableCreditsEl) availableCreditsEl.textContent = `${totalCredits} Credits`;
  if (storeBalanceEl) storeBalanceEl.textContent = `${totalCredits} Credits`;

  // Render History Table
  renderPortalReferralsTable(inf);

  // Render LinkedIn Section
  renderLinkedInSection();
}

function populateInfluencerSelector() {
  const select = document.getElementById("portal-influencer-select");
  if (!select) return;

  const influencers = database.contacts.filter(c => c.isInfluencer);
  select.innerHTML = "";

  influencers.forEach(inf => {
    const opt = document.createElement("option");
    opt.value = inf.email;
    opt.textContent = `${inf.fullName} (${inf.company || inf.email})`;
    if (inf.email.toLowerCase() === currentActiveInfluencerEmail.toLowerCase()) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function changeActivePortalInfluencer(email) {
  currentActiveInfluencerEmail = email;
  renderInfluencerPortal();
}

function switchPortalSubtab(subtabId) {
  document.querySelectorAll(".portal-tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".portal-subtab-view").forEach(view => view.classList.remove("active"));

  const targetBtn = document.getElementById(`btn-portal-tab-${subtabId}`);
  const targetView = document.getElementById(`portal-subtab-view-${subtabId}`);

  if (targetBtn) targetBtn.classList.add("active");
  if (targetView) targetView.classList.add("active");
}

function handlePortalContactSubmission(event) {
  event.preventDefault();
  const inf = getActiveInfluencer();
  if (!inf) {
    alert("No active influencer session found.");
    return;
  }

  const fullName = document.getElementById("portal-input-fullname").value.trim();
  const title = document.getElementById("portal-input-title").value.trim();
  const company = document.getElementById("portal-input-company").value.trim();
  const email = document.getElementById("portal-input-email").value.trim();
  const phone = document.getElementById("portal-input-phone").value.trim();
  const linkedin = document.getElementById("portal-input-linkedin").value.trim();
  const notes = document.getElementById("portal-input-notes").value.trim();

  const autoEnrichCheckbox = document.getElementById("portal-input-autoenrich");
  const wantsAutoEnrich = autoEnrichCheckbox && autoEnrichCheckbox.checked;
  const enrichCost = 15;

  if (!fullName || !email) return;

  const exists = database.contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    alert(`A contact with email "${email}" is already registered in the system.`);
    return;
  }

  let isEnriched = false;
  if (wantsAutoEnrich) {
    const currentCredits = inf.referralCredits || 0;
    if (currentCredits < enrichCost) {
      alert(`Insufficient Credits for Auto-Enrichment!\n\nYou currently have ${currentCredits} credits, but auto-enriching requires ${enrichCost} credits.\n\nThe contact will be submitted as a standard referral.`);
    } else {
      inf.referralCredits = currentCredits - enrichCost;
      isEnriched = true;
    }
  }

  const creditsEarned = 25;

  const newContact = {
    id: database.contacts.length + Date.now(),
    firstName: fullName.split(" ")[0],
    lastName: fullName.split(" ").slice(1).join(" ") || "",
    fullName: fullName,
    email: email,
    jobTitle: title,
    company: company,
    phone: phone,
    linkedinUrl: linkedin,
    notes: notes,
    industry: "Credit Union",
    sourceFile: `Referred by ${inf.fullName}`,
    enriched: isEnriched,
    assetSize: isEnriched ? "$450M" : "$0",
    matchPercentage: isEnriched ? 98 : 90,
    leadTemp: "Hot Lead",
    emailsSent: false,
    linkedinSent: false,
    callsMade: [],
    emailDraft: null,
    linkedinDraft: null,
    isInfluencer: false,
    referredBy: inf.fullName
  };

  database.contacts.push(newContact);

  if (!inf.referrals) inf.referrals = [];
  inf.referrals.push({
    fullName: fullName,
    jobTitle: title,
    company: company,
    email: email,
    credits: creditsEarned,
    status: "Pending Review",
    enriched: isEnriched,
    date: new Date().toLocaleDateString()
  });

  inf.referralCredits = (inf.referralCredits || 0) + creditsEarned;

  saveDatabaseCache();

  document.getElementById("portal-submit-contact-form").reset();

  const autoEnrichMsg = isEnriched ? " (Auto-Enriched -15 Cr)" : "";
  addLogConsole("enrich", `[INFLUENCER PORTAL] ${inf.fullName} submitted referral: ${fullName} (${company}). +${creditsEarned} credits awarded!${autoEnrichMsg}`, "success");

  showPortalToast(`Referral Submitted! +${creditsEarned} Reward Credits earned.${isEnriched ? ' (Contact Enriched -15 Cr)' : ''}`);

  renderInfluencerPortal();
  switchPortalSubtab('dashboard');
}

function renderPortalReferralsTable(inf) {
  const tbody = document.getElementById("portal-referrals-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const referrals = inf.referrals || [];
  if (referrals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-placeholder">No contacts submitted yet. Click "Submit Contact" to submit your first referral.</td></tr>`;
    return;
  }

  referrals.forEach(r => {
    const tr = document.createElement("tr");
    const statusText = r.status || "Pending Review";
    const contact = database.contacts.find(c => c.email.toLowerCase() === r.email.toLowerCase());
    const isEnriched = r.enriched || (contact && contact.enriched);

    const enrichCellHTML = isEnriched
      ? `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:10px; background:var(--brand-mint, #a4d4c5); color:var(--ink); font-weight:700; font-size:11px; border:1px solid var(--hairline);">Enriched ✓</span>`
      : `<button class="btn btn-secondary btn-sm" onclick="enrichReferralWithCredits('${r.email}', 15)" style="font-size:11px; height:28px; padding:0 8px; border-color:var(--hairline); cursor:pointer;">⚡ Enrich (-15 Cr)</button>`;

    tr.innerHTML = `
      <td><strong>${r.fullName}</strong></td>
      <td>${r.jobTitle || 'N/A'}</td>
      <td>${r.company || 'N/A'}</td>
      <td>${r.email}</td>
      <td>${r.date || new Date().toLocaleDateString()}</td>
      <td><span class="badge-lead-temp ${statusText === 'Converted' || statusText === 'Meeting Booked' ? 'hot' : 'cold'}">${statusText}</span></td>
      <td>${enrichCellHTML}</td>
      <td style="text-align: right; font-weight: 700; color: var(--ink);">+${r.credits} Credits</td>
    `;
    tbody.appendChild(tr);
  });
}

function enrichReferralWithCredits(email, creditCost = 15) {
  const inf = getActiveInfluencer();
  if (!inf) return;

  const currentCredits = inf.referralCredits || 0;
  if (currentCredits < creditCost) {
    alert(`Insufficient Credits!\n\nYou currently have ${currentCredits} credits, but enriching a contact costs ${creditCost} credits.\n\nSubmit more contacts to earn additional credits.`);
    return;
  }

  if (!confirm(`Enrich Contact Referral:\n\nSpend ${creditCost} Credits to perform B2B data enrichment for ${email}?`)) {
    return;
  }

  inf.referralCredits = currentCredits - creditCost;

  const referral = (inf.referrals || []).find(r => r.email.toLowerCase() === email.toLowerCase());
  if (referral) {
    referral.enriched = true;
  }

  const contact = database.contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (contact) {
    contact.enriched = true;
    contact.matchPercentage = Math.max(contact.matchPercentage || 90, 98);
    contact.leadTemp = "Hot Lead";
    if (!contact.assetSize || contact.assetSize === "$0") contact.assetSize = "$450M";
  }

  saveDatabaseCache();

  addLogConsole("enrich", `[INFLUENCER PORTAL] ${inf.fullName} spent ${creditCost} credits to enrich ${email}.`, "success");
  showPortalToast(`⚡ Contact enriched successfully! (-${creditCost} Credits)`);

  renderInfluencerPortal();
}

function handleRedeemReward(rewardId, creditCost, rewardTitle) {
  const inf = getActiveInfluencer();
  if (!inf) return;

  const currentCredits = inf.referralCredits || 0;

  if (currentCredits < creditCost) {
    alert(`Insufficient Credits!\n\nYou currently have ${currentCredits} credits, but "${rewardTitle}" requires ${creditCost} credits.\n\nSubmit more contacts to earn additional credits.`);
    return;
  }

  if (confirm(`Confirm Reward Redemption:\n\nRedeem "${rewardTitle}" for ${creditCost} Credits?`)) {
    inf.referralCredits = currentCredits - creditCost;
    saveDatabaseCache();

    addLogConsole("enrich", `[REWARDS STORE] ${inf.fullName} redeemed reward: "${rewardTitle}" (-${creditCost} credits).`, "success");

    showPortalToast(`Redeemed "${rewardTitle}". Fulfillment notification sent.`);

    renderInfluencerPortal();
  }
}

function toggleLinkedInConnection() {
  isLinkedInConnectedMock = !isLinkedInConnectedMock;
  renderLinkedInSection();

  if (isLinkedInConnectedMock) {
    showPortalToast("LinkedIn Profile Connected! Scanned 1,420 connections.");
  }
}

function renderLinkedInSection() {
  const statusCard = document.getElementById("linkedin-status-card");
  const titleEl = document.getElementById("linkedin-connect-title");
  const descEl = document.getElementById("linkedin-connect-desc");
  const btnTextEl = document.getElementById("linkedin-btn-text");
  const btnEl = document.getElementById("btn-toggle-linkedin-connect");
  const grid = document.getElementById("linkedin-suggestions-grid");

  const inf = getActiveInfluencer();

  if (!grid) return;

  if (isLinkedInConnectedMock) {
    if (titleEl) titleEl.textContent = `LinkedIn Connected: ${inf ? inf.fullName : 'Active Account'}`;
    if (descEl) descEl.textContent = "Synced with 1,420 1st-degree connections. Showing high-match Credit Union IT leaders below:";
    if (btnTextEl) btnTextEl.textContent = "Disconnect LinkedIn";
    if (btnEl) btnEl.classList.remove("btn-primary"), btnEl.classList.add("btn-secondary");
  } else {
    if (titleEl) titleEl.textContent = "LinkedIn Account Status: Disconnected";
    if (descEl) descEl.textContent = "Connect your LinkedIn profile so GTM Console can analyze your 1st-degree connections and highlight relevant Credit Union IT leaders.";
    if (btnTextEl) btnTextEl.textContent = "Connect LinkedIn Profile";
    if (btnEl) btnEl.classList.add("btn-primary"), btnEl.classList.remove("btn-secondary");
  }

  grid.innerHTML = "";
  mockLinkedInSuggestions.forEach(sug => {
    const card = document.createElement("div");
    card.className = "linkedin-suggestion-card";

    const isSubmitted = sug.submitted;

    card.innerHTML = `
      <div class="sug-header">
        <div class="sug-avatar">${sug.fullName.split(" ").map(n=>n[0]).join("")}</div>
        <div class="sug-meta">
          <h4>${sug.fullName}</h4>
          <p>${sug.jobTitle} at <strong>${sug.company}</strong></p>
          <span class="sug-network-tag">${sug.connectionDegree} • ${sug.mutualConnections} mutuals</span>
        </div>
        <div class="sug-match-badge">${sug.matchPercentage}% Match</div>
      </div>
      <div class="sug-body">
        <p class="sug-notes">AI Identified target persona: Credit Union IT decision maker with authority over software budgets.</p>
      </div>
      <div class="sug-footer">
        <span class="sug-reward-tag">+25 Credits</span>
        <button class="btn ${isSubmitted ? 'btn-secondary' : 'btn-primary'} btn-sm" ${isSubmitted ? 'disabled' : ''} onclick="submitLinkedInSuggestion('${sug.id}')">
          ${isSubmitted ? 'Referred ✓' : 'Submit Referral (+25)'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function submitLinkedInSuggestion(sugId) {
  const sug = mockLinkedInSuggestions.find(s => s.id === sugId);
  if (!sug || sug.submitted) return;

  const inf = getActiveInfluencer();
  if (!inf) return;

  const exists = database.contacts.find(c => c.email.toLowerCase() === sug.email.toLowerCase());
  if (exists) {
    alert(`Contact ${sug.fullName} is already registered in the database.`);
    return;
  }

  sug.submitted = true;
  const credits = 25;

  const newContact = {
    id: database.contacts.length + Date.now(),
    firstName: sug.fullName.split(" ")[0],
    lastName: sug.fullName.split(" ").slice(1).join(" "),
    fullName: sug.fullName,
    email: sug.email,
    jobTitle: sug.jobTitle,
    company: sug.company,
    phone: sug.phone,
    industry: "Credit Union",
    sourceFile: `Referred via LinkedIn by ${inf.fullName}`,
    enriched: true,
    matchPercentage: sug.matchPercentage,
    leadTemp: "Hot Lead",
    emailsSent: false,
    linkedinSent: false,
    callsMade: [],
    emailDraft: null,
    linkedinDraft: null,
    isInfluencer: false,
    referredBy: inf.fullName
  };

  database.contacts.push(newContact);

  if (!inf.referrals) inf.referrals = [];
  inf.referrals.push({
    fullName: sug.fullName,
    jobTitle: sug.jobTitle,
    company: sug.company,
    email: sug.email,
    credits: credits,
    status: "Pending Review",
    date: new Date().toLocaleDateString()
  });

  inf.referralCredits = (inf.referralCredits || 0) + credits;

  saveDatabaseCache();

  addLogConsole("enrich", `[LINKEDIN SCANNER] ${inf.fullName} referred connection: ${sug.fullName} (${sug.company}). +${credits} credits awarded!`, "success");

  showPortalToast(`Referral Added! +${credits} Credits awarded for ${sug.fullName}.`);

  renderInfluencerPortal();
}

function copyPortalReferralLink() {
  const input = document.getElementById("portal-referral-link");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showPortalToast("Copied referral link to clipboard!");
  }
}

function showPortalToast(message) {
  let toast = document.getElementById("portal-toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "portal-toast-notification";
    toast.className = "portal-toast-notification";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// Global exports
window.openInfluencerPortal = openInfluencerPortal;
window.renderInfluencerPortal = renderInfluencerPortal;
window.changeActivePortalInfluencer = changeActivePortalInfluencer;
window.switchPortalSubtab = switchPortalSubtab;
window.handlePortalContactSubmission = handlePortalContactSubmission;
window.handleRedeemReward = handleRedeemReward;
window.toggleLinkedInConnection = toggleLinkedInConnection;
window.submitLinkedInSuggestion = submitLinkedInSuggestion;
window.copyPortalReferralLink = copyPortalReferralLink;
window.enrichReferralWithCredits = enrichReferralWithCredits;
