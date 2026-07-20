// --- INFLUENCERS & PARTNER REFERRALS CONTROLLER ---

function openCampaignTarget(email, channel) {
  switchTab('campaign-outbound');
  const contact = database.contacts.find(c => c.email === email);
  if (contact) {
    const targetChannel = (channel === 'call') ? 'call' : 'email';
    loadOutboundDrawer(contact, targetChannel);
  }
}

function handleManualInfluencerSubmit(event) {
  event.preventDefault();
  const name = document.getElementById("manual-inf-name").value.trim();
  const title = document.getElementById("manual-inf-title").value.trim();
  const company = document.getElementById("manual-inf-company").value.trim();
  const email = document.getElementById("manual-inf-email").value.trim();
  const phone = document.getElementById("manual-inf-phone").value.trim();
  const temp = document.getElementById("manual-inf-temp").value;
  const match = parseInt(document.getElementById("manual-inf-match").value) || 95;

  if (!name || !email) return;

  const exists = database.contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    alert("A contact with this email address already exists.");
    return;
  }

  const newInfluencer = {
    id: database.contacts.length + Date.now(),
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
    fullName: name,
    email: email,
    jobTitle: title,
    company: company,
    phone: phone,
    industry: "Credit Union",
    sourceFile: "Manually Added Influencer",
    assetSize: "",
    state: "",
    attendedDinner: "",
    visitedBooth: "",
    enriched: false,
    matchPercentage: match,
    leadTemp: temp,
    emailsSent: false,
    linkedinSent: false,
    callsMade: [],
    emailDraft: null,
    linkedinDraft: null,
    isInfluencer: true,
    referrals: [],
    referralCredits: 0
  };

  database.contacts.push(newInfluencer);
  saveDatabaseCache();
  
  document.getElementById("manual-influencer-form").reset();
  addLogConsole("enrich", `[SYSTEM] Manual Enrollment: Influencer ${name} (${company}) added successfully.`, "success");
  
  filterInfluencersTable();
  filterImportTable();
}

function openAddReferralModal(email) {
  const influencer = database.contacts.find(c => c.email === email);
  if (!influencer) return;

  document.getElementById("referral-influencer-email").value = email;
  document.getElementById("reward-target-name").textContent = influencer.fullName;
  
  const dialog = document.getElementById("referral-dialog");
  if (dialog) dialog.showModal();
}

function closeReferralDialog() {
  const dialog = document.getElementById("referral-dialog");
  if (dialog) dialog.close();
  document.getElementById("referral-form").reset();
}

function handleReferralSubmit(event) {
  event.preventDefault();
  const infEmail = document.getElementById("referral-influencer-email").value;
  const name = document.getElementById("ref-name").value.trim();
  const title = document.getElementById("ref-title").value.trim();
  const company = document.getElementById("ref-company").value.trim();
  const email = document.getElementById("ref-email").value.trim();
  const phone = document.getElementById("ref-phone").value.trim();
  const credits = parseInt(document.getElementById("ref-credits").value) || 10;

  const influencer = database.contacts.find(c => c.email === infEmail);
  if (!influencer) {
    alert("Influencer not found.");
    return;
  }

  const newContact = {
    id: database.contacts.length + Date.now(),
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
    fullName: name,
    email: email,
    jobTitle: title,
    company: company,
    phone: phone,
    industry: "Credit Union",
    sourceFile: `Referred by ${influencer.fullName}`,
    assetSize: "",
    state: "",
    attendedDinner: "",
    visitedBooth: "",
    enriched: false,
    matchPercentage: 90,
    leadTemp: "Hot Lead",
    emailsSent: false,
    linkedinSent: false,
    callsMade: [],
    emailDraft: null,
    linkedinDraft: null,
    isInfluencer: false,
    referredBy: influencer.fullName
  };

  database.contacts.push(newContact);

  if (!influencer.referrals) influencer.referrals = [];
  influencer.referrals.push({
    fullName: name,
    jobTitle: title,
    company: company,
    email: email,
    credits: credits,
    date: new Date().toLocaleDateString()
  });
  influencer.referralCredits = (influencer.referralCredits || 0) + credits;

  saveDatabaseCache();

  addLogConsole("enrich", `[REWARD] Influencer ${influencer.fullName} awarded ${credits} credits for referring ${name} (${company}).`, "success");

  filterInfluencersTable();
  filterImportTable();

  closeReferralDialog();
}

function viewReferralsDetails(email) {
  const influencer = database.contacts.find(c => c.email === email);
  if (!influencer) return;

  document.getElementById("referrals-view-influencer-name").textContent = influencer.fullName;
  document.getElementById("referrals-view-total-credits").textContent = influencer.referralCredits || 0;

  const tbody = document.getElementById("referrals-view-table-body");
  tbody.innerHTML = "";

  const referrals = influencer.referrals || [];
  if (referrals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-placeholder">No referrals registered yet.</td></tr>`;
  } else {
    referrals.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${r.fullName}</strong></td>
        <td>${r.jobTitle}</td>
        <td>${r.company}</td>
        <td>${r.email}</td>
        <td style="font-weight:600; color:var(--success); text-align:right;">+${r.credits} credits</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const dialog = document.getElementById("referrals-view-dialog");
  if (dialog) dialog.showModal();
}

function closeReferralsViewDialog() {
  const dialog = document.getElementById("referrals-view-dialog");
  if (dialog) dialog.close();
}

function closeDrawer(drawerId) {
  const drawer = document.getElementById(`${drawerId}-drawer`);
  if (drawer) {
    drawer.style.transform = "translateX(100%)";
    drawer.style.opacity = "0";
  }
}

window.openCampaignTarget = openCampaignTarget;
window.handleManualInfluencerSubmit = handleManualInfluencerSubmit;
window.openAddReferralModal = openAddReferralModal;
window.closeReferralDialog = closeReferralDialog;
window.handleReferralSubmit = handleReferralSubmit;
window.viewReferralsDetails = viewReferralsDetails;
window.closeReferralsViewDialog = closeReferralsViewDialog;
window.closeDrawer = closeDrawer;
