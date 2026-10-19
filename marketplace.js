(() => {
  const tokenKey = 'irm-vendor-marketplace-token';
  let token = sessionStorage.getItem(tokenKey) || localStorage.getItem(tokenKey) || '';

  const authSection = document.getElementById('vendor-auth-section');
  const workspaceSection = document.getElementById('vendor-workspace');
  const agreementSection = document.getElementById('vendor-agreement-section');
  const signedBanner = document.getElementById('vendor-signed-banner');
  const networkSection = document.getElementById('vendor-network-section');
  const signoutBtn = document.getElementById('vendor-signout-btn');

  const tabSignup = document.getElementById('vendor-tab-signup');
  const tabLogin = document.getElementById('vendor-tab-login');
  const signupForm = document.getElementById('vendor-signup-form');
  const loginForm = document.getElementById('vendor-login-form');
  const agreementForm = document.getElementById('vendor-agreement-form');

  // Targeting Tabs
  const tabContacts = document.getElementById('tab-mode-contacts');
  const tabAccounts = document.getElementById('tab-mode-accounts');
  const tabAi = document.getElementById('tab-mode-ai');
  const tabPartners = document.getElementById('tab-mode-partners');

  const panelContacts = document.getElementById('view-contacts-panel');
  const panelAccounts = document.getElementById('view-accounts-panel');
  const panelAi = document.getElementById('view-ai-panel');
  const panelPartners = document.getElementById('view-partners-panel');

  const searchInput = document.getElementById('network-search-input');
  const infFilterSelect = document.getElementById('network-influencer-filter');
  const warmthFilterSelect = document.getElementById('network-warmth-filter');

  // Dialogs
  const introDialog = document.getElementById('intro-request-dialog');
  const introForm = document.getElementById('intro-request-form');
  const briefDialog = document.getElementById('meeting-brief-dialog');
  const feedbackDialog = document.getElementById('meeting-feedback-dialog');
  const feedbackForm = document.getElementById('feedback-form');

  let currentVendor = null;
  let networkData = { influencers: [], contacts: [], organizations: [], requests: [] };

  function escapeHTML(val) {
    return String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  async function apiRequest(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function setAuthTab(tab) {
    const isSignup = tab === 'signup';
    if (signupForm) signupForm.hidden = !isSignup;
    if (loginForm) loginForm.hidden = isSignup;
    tabSignup?.classList.toggle('active', isSignup);
    tabLogin?.classList.toggle('active', !isSignup);
  }

  tabSignup?.addEventListener('click', () => setAuthTab('signup'));
  tabLogin?.addEventListener('click', () => setAuthTab('login'));

  function showUnauthenticated() {
    if (authSection) authSection.hidden = false;
    if (workspaceSection) workspaceSection.hidden = true;
    if (signoutBtn) signoutBtn.hidden = true;
  }

  function switchTargetingTab(tabName) {
    [tabContacts, tabAccounts, tabAi, tabPartners].forEach(btn => btn?.classList.remove('active'));
    [panelContacts, panelAccounts, panelAi, panelPartners].forEach(p => { if (p) p.hidden = true; });

    if (tabName === 'contacts') {
      tabContacts?.classList.add('active');
      if (panelContacts) panelContacts.hidden = false;
    } else if (tabName === 'accounts') {
      tabAccounts?.classList.add('active');
      if (panelAccounts) panelAccounts.hidden = false;
    } else if (tabName === 'ai') {
      tabAi?.classList.add('active');
      if (panelAi) panelAi.hidden = false;
    } else if (tabName === 'partners') {
      tabPartners?.classList.add('active');
      if (panelPartners) panelPartners.hidden = false;
    }
  }

  tabContacts?.addEventListener('click', () => switchTargetingTab('contacts'));
  tabAccounts?.addEventListener('click', () => switchTargetingTab('accounts'));
  tabAi?.addEventListener('click', () => switchTargetingTab('ai'));
  tabPartners?.addEventListener('click', () => switchTargetingTab('partners'));

  // Pipeline Render
  function renderVendorRequests(requests) {
    const tbody = document.getElementById('vendor-requests-tbody');
    const countBadge = document.getElementById('vendor-requests-count');
    if (countBadge) countBadge.textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;
    if (!tbody) return;
    tbody.replaceChildren();

    if (!requests.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No warm introductions requested yet. Discover available warm paths below.</td></tr>';
      return;
    }

    const contactsById = new Map((networkData.contacts || []).map(c => [String(c.id), c]));
    requests.forEach(req => {
      const tr = document.createElement('tr');
      const status = String(req.status || 'requested').toLowerCase();
      const matchedContact = contactsById.get(String(req.targetContactId || ''));

      let statusLabel = 'Requested · Partner Reviewing';
      let badgeCls = 'warn';

      if (status === 'contact_opt_in_requested') {
        statusLabel = 'Partner Accepted · Double Opt-In Sent';
        badgeCls = 'warn';
      } else if (status === 'contact_accepted' || status === 'introduction_made') {
        statusLabel = 'Contact Opted In · Intro Confirmed';
        badgeCls = 'ok';
      } else if (status === 'call_scheduled' || status === 'meeting_scheduled' || status === 'scheduled') {
        statusLabel = 'Executive Briefing Scheduled';
        badgeCls = 'ok';
      } else if (status === 'call_completed' || status === 'meeting_completed' || status === 'completed') {
        statusLabel = 'Briefing Completed';
        badgeCls = 'ok';
      } else if (status === 'opportunity_created') {
        statusLabel = `Opportunity Created ($${(req.opportunityValue || 0).toLocaleString()})`;
        badgeCls = 'ok';
      } else if (status === 'won') {
        statusLabel = `Closed Customer ($${(req.opportunityValue || 0).toLocaleString()})`;
        badgeCls = 'ok';
      } else if (status.includes('declined')) {
        statusLabel = 'Declined';
        badgeCls = 'locked';
      }

      tr.innerHTML = `
        <td>
          <strong>${escapeHTML(req.targetCompany || 'Target Account')}</strong>
          <small>${escapeHTML(req.targetJobTitle || 'Executive')} · ${escapeHTML(matchedContact?.piiUnlocked ? matchedContact.fullName : (req.targetContactName || 'Network Contact'))}</small>
        </td>
        <td>
          <strong>${escapeHTML(req.influencerName || req.partnerName || 'ConnectEM Partner')}</strong>
          <small>Verified Partner</small>
        </td>
        <td>
          <span style="font-size:12px;">${escapeHTML(req.specificAsk || req.vendorPitch || '')}</span>
        </td>
        <td>
          <span class="badge ${badgeCls}">${escapeHTML(statusLabel)}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm view-brief-btn" data-req-id="${req.id}">Pre-Meeting Brief</button>
            <button type="button" class="btn btn-outline btn-sm record-feedback-btn" data-req-id="${req.id}">24h Feedback</button>
            ${req.scheduledMeetingUrl ? `<a href="${req.scheduledMeetingUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ok btn-sm" style="text-decoration:none;">Join Call</a>` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.view-brief-btn')?.addEventListener('click', () => openMeetingBrief(req.id));
      tr.querySelector('.record-feedback-btn')?.addEventListener('click', () => openFeedbackDialog(req));

      tbody.appendChild(tr);
    });
  }

  // Pre-Meeting Brief Modal
  async function openMeetingBrief(reqId) {
    if (!briefDialog) return;
    const content = document.getElementById('brief-content');
    content.innerHTML = '<div style="text-align:center; padding:20px; color:var(--muted);">Loading intelligence dossier…</div>';
    briefDialog.showModal();

    try {
      const data = await apiRequest(`/api/connectem/meeting-brief?requestId=${encodeURIComponent(reqId)}`);
      content.innerHTML = `
        <div style="background:#f8fbfa; padding:14px; border-radius:8px; border:1px solid var(--line);">
          <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; color:var(--accent);">Target Decision Maker</span>
          <h3 style="margin:4px 0 2px; font-size:16px;">${escapeHTML(data.target.name)} · ${escapeHTML(data.target.title)}</h3>
          <p style="margin:0; font-size:12.5px; color:var(--muted);">${escapeHTML(data.target.company)} (${escapeHTML(data.target.assetSize)}) · ${escapeHTML(data.target.industry)}</p>
        </div>

        <div style="background:#f8fbfa; padding:14px; border-radius:8px; border:1px solid var(--line);">
          <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; color:var(--accent);">Introducing Facilitator</span>
          <h3 style="margin:4px 0 2px; font-size:16px;">${escapeHTML(data.facilitator.name)}</h3>
          <p style="margin:0; font-size:12.5px; color:var(--muted);">${escapeHTML(data.facilitator.relationshipStrength.toUpperCase())} relationship · ${escapeHTML(data.facilitator.relationshipType)} · Partner Trust Score: ${data.facilitator.trustScore}</p>
        </div>

        <div style="background:#f8fbfa; padding:14px; border-radius:8px; border:1px solid var(--line);">
          <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; color:var(--accent);">Double Opt-In Context</span>
          <p style="margin:4px 0 0; font-size:13px; line-height:1.5;">${escapeHTML(data.context.optInNotes)}</p>
          <small style="display:block; margin-top:4px; color:var(--muted);">Specific Ask: ${escapeHTML(data.context.specificAsk)}</small>
        </div>

        <div style="border-left:3px solid #e11d48; padding:12px 16px; background:#fff1f2; border-radius:0 8px 8px 0;">
          <strong style="display:block; color:#be123c; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">⚠️ What NOT to Do (Rules of Engagement)</strong>
          <ul style="margin:0; padding-left:18px; font-size:12.5px; color:#4c0519; line-height:1.6;">
            ${(data.rulesOfEngagement || []).map(r => `<li>${escapeHTML(r)}</li>`).join('')}
          </ul>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<p style="color:var(--error);">${escapeHTML(err.message)}</p>`;
    }
  }

  document.getElementById('close-brief-btn')?.addEventListener('click', () => briefDialog?.close());

  // Post-Meeting Feedback Modal
  function openFeedbackDialog(req) {
    if (!feedbackDialog) return;
    document.getElementById('feedback-req-id').value = req.id;
    document.getElementById('feedback-target-desc').textContent = `Meeting with ${req.targetJobTitle || 'Executive'} at ${req.targetCompany || 'Target Account'} (Facilitated by ${req.influencerName || 'Partner'}).`;
    feedbackDialog.showModal();
  }

  document.getElementById('close-feedback-btn')?.addEventListener('click', () => feedbackDialog?.close());

  feedbackForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reqId = document.getElementById('feedback-req-id').value;
    const meetingHeld = document.getElementById('fb-held').value === 'true';
    const rating = parseInt(document.getElementById('fb-rating').value, 10);
    const outcome = document.getElementById('fb-outcome').value;
    const value = parseFloat(document.getElementById('fb-value').value || 0);
    const notes = document.getElementById('fb-notes').value.trim();

    const submitBtn = document.getElementById('submit-feedback-btn');
    submitBtn.disabled = true;

    try {
      await apiRequest('/api/connectem/feedback', {
        method: 'POST',
        body: JSON.stringify({
          requestId: reqId,
          role: 'vendor',
          meetingHeld,
          rating,
          outcome,
          opportunityValue: value,
          feedbackNotes: notes
        })
      });
      feedbackDialog.close();
      await loadNetwork();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Render Contacts Table with Warm Path Score
  function renderNetworkDirectory() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const infFilter = infFilterSelect?.value || 'all';
    const warmthFilter = warmthFilterSelect?.value || 'all';

    const tbody = document.getElementById('network-contacts-tbody');
    if (!tbody) return;

    const filtered = (networkData.contacts || []).filter(c => {
      if (infFilter !== 'all' && String(c.influencerId) !== String(infFilter)) return false;
      const score = c.warmPathScore || 75;
      if (warmthFilter === 'high' && score < 85) return false;
      if (warmthFilter === 'med' && score < 70) return false;
      if (!query) return true;
      return [c.company, c.jobTitle, c.industry, c.location, c.influencerName, c.fullName, ...(c.topics || [])]
        .some(val => String(val || '').toLowerCase().includes(query));
    });

    const countEl = document.getElementById('network-visible-count');
    if (countEl) countEl.textContent = `Showing ${Math.min(filtered.length, 60)} of ${filtered.length} target contacts`;

    tbody.replaceChildren();
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No matching decision makers found.</td></tr>';
      return;
    }

    filtered.slice(0, 60).forEach(contact => {
      const tr = document.createElement('tr');
      const score = contact.warmPathScore || 75;
      const scoreBadgeCls = score >= 85 ? 'wp-high' : score >= 70 ? 'wp-med' : 'wp-low';
      const label = contact.warmPathLabel || 'Warm path';

      tr.innerHTML = `
        <td>
          <strong>${escapeHTML(contact.company)}</strong>
          <small>${escapeHTML(contact.jobTitle)} · ${escapeHTML(contact.industry || 'Financial Services')}</small>
          ${contact.assetSize ? `<small style="color:var(--accent);">${escapeHTML(contact.assetSize)}</small>` : ''}
        </td>
        <td>
          <strong>${escapeHTML(contact.fullName)}</strong>
          <small>${contact.piiUnlocked ? `${escapeHTML(contact.email)} · ${escapeHTML(contact.phone)}` : (contact.privacyLevel === 'anonymous' ? 'Anonymous until Partner approval' : `Protected by IRM · ${escapeHTML(contact.privacyLevel === 'ask_partner' ? 'Ask Partner' : 'Discoverable')}`)}</small>
        </td>
        <td>
          <strong>${escapeHTML(contact.influencerName || 'ConnectEM Partner')}</strong>
          <small>${escapeHTML(contact.influencerCompany || 'Advisory Partner')}</small>
        </td>
        <td>
          <span class="badge wp-score ${scoreBadgeCls}">${score} · ${escapeHTML(label)}</span>
          <small style="margin-top:4px;">Strength: ${escapeHTML(contact.relationshipStrength || 'strong')} · ${escapeHTML(contact.relationshipType || 'peer')}</small>
        </td>
        <td>
          <button type="button" class="btn btn-outline btn-sm request-intro-btn">Request Warm Intro</button>
        </td>
      `;

      tr.querySelector('.request-intro-btn')?.addEventListener('click', () => openIntroDialog(contact));
      tbody.appendChild(tr);
    });
  }

  // Live AI Forwardable Brief Preview in Request Dialog
  function updateBriefPreview() {
    const previewEl = document.getElementById('intro-brief-preview');
    if (!previewEl) return;

    const contactName = document.getElementById('intro-dialog-subtitle')?.textContent.split('·')[0].trim() || 'Colleague';
    const firstName = contactName.split(' ')[0] || 'Colleague';
    const vendorName = currentVendor?.companyName || 'Enterprise Partner';
    const whyCare = document.getElementById('intro-why-care')?.value.trim() || 'streamline operational efficiency and compliance';
    const ask = document.getElementById('intro-specific-ask')?.value.trim() || 'a 20-minute introductory conversation';
    const targetComp = document.getElementById('intro-target-company')?.value || 'your team';

    previewEl.textContent = `Hi ${firstName},\n\nHope you're having a productive week. An enterprise technology partner, ${vendorName}, reached out to ask if I would facilitate a warm introduction to you.\n\nThey are specifically interested in connecting regarding how they help organizations like ${targetComp} to ${whyCare}.\n\nTheir specific ask is ${ask}. Knowing your priorities, I wanted to check your interest directly before connecting you. Would you be open to an introductory briefing with their leadership team?`;
  }

  function openIntroDialog(contact) {
    if (!introDialog) return;
    document.getElementById('intro-target-contact-id').value = contact.id;
    document.getElementById('intro-influencer-id').value = contact.influencerId;
    document.getElementById('intro-target-company').value = contact.company;
    document.getElementById('intro-target-title').value = contact.jobTitle;

    document.getElementById('intro-dialog-title').textContent = `Request Intro to ${contact.fullName}`;
    document.getElementById('intro-dialog-subtitle').textContent = `${contact.jobTitle} at ${contact.company} · Facilitated by ${contact.influencerName || 'Partner'}`;

    document.getElementById('intro-why-contact').value = `Key decision maker for technology modernization at ${contact.company}`;
    document.getElementById('intro-why-care').value = currentVendor?.icpDescription ? currentVendor.icpDescription.slice(0, 100) : 'Helps modernize and ensure NCUA compliance';
    document.getElementById('intro-specific-ask').value = '20-minute executive briefing with leadership';
    document.getElementById('intro-context').value = '';

    updateBriefPreview();
    const submitBtn = document.getElementById('intro-submit-btn');
    if (submitBtn) submitBtn.disabled = !document.getElementById('intro-target-contact-id').value;
    introDialog.showModal();
  }

  document.getElementById('intro-why-contact')?.addEventListener('input', updateBriefPreview);
  document.getElementById('intro-why-care')?.addEventListener('input', updateBriefPreview);
  document.getElementById('intro-specific-ask')?.addEventListener('input', updateBriefPreview);
  document.getElementById('intro-cancel-btn')?.addEventListener('click', () => introDialog?.close());

  introForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('intro-submit-btn');
    submitBtn.disabled = true;

    const payload = {
      targetContactId: document.getElementById('intro-target-contact-id').value,
      influencerId: document.getElementById('intro-influencer-id').value,
      targetCompany: document.getElementById('intro-target-company').value,
      targetJobTitle: document.getElementById('intro-target-title').value,
      whyThisContact: document.getElementById('intro-why-contact').value,
      whyTheyShouldCare: document.getElementById('intro-why-care').value,
      specificAsk: document.getElementById('intro-specific-ask').value,
      supportingContext: document.getElementById('intro-context').value,
      vendorPitch: `${document.getElementById('intro-why-care').value}. Ask: ${document.getElementById('intro-specific-ask').value}`
    };

    try {
      await apiRequest('/api/marketplace/requests', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      introDialog.close();
      await loadNetwork();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Target Account Matching Implementation (Section 3b)
  document.getElementById('load-sample-accounts-btn')?.addEventListener('click', () => {
    const input = document.getElementById('target-accounts-input');
    if (input) {
      input.value = [
        'Pacific Crest Credit Union',
        'Beluzo FinTech Advisory',
        'First Tech Federal CU',
        'SchoolsFirst Federal Credit Union',
        'Navy Federal Credit Union'
      ].join('\n');
    }
  });

  document.getElementById('run-account-match-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('target-accounts-input');
    const text = (input?.value || '').trim();
    if (!text) {
      alert('Please enter at least one target account name.');
      return;
    }
    const btn = document.getElementById('run-account-match-btn');
    btn.disabled = true;

    try {
      const data = await apiRequest('/api/connectem/account-match', {
        method: 'POST',
        body: JSON.stringify({ accounts: text })
      });

      const resBox = document.getElementById('account-match-results');
      if (resBox) resBox.hidden = false;

      document.getElementById('match-kpi-total').textContent = data.totalAccountsUploaded;
      document.getElementById('match-kpi-matched').textContent = data.accountsWithRelationships;
      document.getElementById('match-kpi-strong').textContent = data.strongRelationships;
      document.getElementById('match-kpi-eligible').textContent = data.introEligible;

      const tbody = document.getElementById('account-match-tbody');
      tbody.replaceChildren();

      if (!data.matches?.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">No direct matches found in current partner network.</td></tr>';
      } else {
        data.matches.forEach(m => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${escapeHTML(m.account)}</strong></td>
            <td>${escapeHTML(m.matchedCompany)} <small>(${m.contactsCount} contacts)</small></td>
            <td><strong>${escapeHTML(m.strongestPartner)}</strong></td>
            <td>${escapeHTML(m.topContactTitle || 'Executive')}</td>
            <td><span class="badge wp-score ${m.warmPathScore >= 85 ? 'wp-high' : 'wp-med'}">${m.warmPathScore} · ${escapeHTML(m.warmPathLabel)}</span></td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // Natural Language AI Search Implementation (Section 3 AI Layer)
  document.getElementById('run-ai-query-btn')?.addEventListener('click', async () => {
    const query = document.getElementById('ai-query-input')?.value.trim();
    if (!query) return;
    const btn = document.getElementById('run-ai-query-btn');
    const tbody = document.getElementById('ai-query-tbody');
    btn.disabled = true;
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Searching relationship graph and ranking warm paths…</td></tr>';

    try {
      const data = await apiRequest('/api/connectem/ai-match', {
        method: 'POST',
        body: JSON.stringify({ query })
      });

      tbody.replaceChildren();
      if (!data.results?.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No matching warm paths found for this prompt.</td></tr>';
      } else {
        data.results.forEach(res => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${escapeHTML(res.fullName)}</strong><small>${escapeHTML(res.jobTitle)}</small></td>
            <td><strong>${escapeHTML(res.company)}</strong><small>${escapeHTML(res.assetSize || '')} · ${escapeHTML(res.industry || '')}</small></td>
            <td><strong>${escapeHTML(res.partnerName)}</strong><small>${escapeHTML(res.partnerCompany)}</small></td>
            <td><span class="badge wp-score ${res.warmPathScore >= 85 ? 'wp-high' : 'wp-med'}">${res.warmPathScore} · ${escapeHTML(res.warmPathLabel)}</span></td>
            <td><span class="badge ok">${res.icpFit}% Match</span></td>
            <td><button type="button" class="btn btn-outline btn-sm ai-req-btn">Request Intro</button></td>
          `;
          tr.querySelector('.ai-req-btn')?.addEventListener('click', () => openIntroDialog(res));
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:var(--error);">${escapeHTML(err.message)}</td></tr>`;
    } finally {
      btn.disabled = false;
    }
  });

  // Render Partners Directory
  function renderPartnersDirectory() {
    const tbody = document.getElementById('network-influencers-tbody');
    if (!tbody) return;
    tbody.replaceChildren();

    (networkData.influencers || []).forEach(inf => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(inf.fullName)}</strong><small>${escapeHTML(inf.jobTitle || 'Industry Partner')}</small></td>
        <td><strong>${escapeHTML(inf.company || 'Advisory Partner')}</strong><small>${escapeHTML((inf.expertise || []).join(', ') || 'Credit Union Strategy')}</small></td>
        <td><strong>${inf.reachCount || 30} Executive Relationships</strong></td>
        <td><span class="badge ok">${inf.trustScore || 96} · High Trust</span></td>
        <td><span class="badge ${inf.hasSignedAgreement ? 'ok' : 'warn'}">${inf.hasSignedAgreement ? 'Active Partner' : 'Pending'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Load Vendor Workspace & Network
  async function loadNetwork() {
    try {
      const data = await apiRequest('/api/marketplace/network');
      networkData = data;
      currentVendor = data.vendor;

      if (authSection) authSection.hidden = true;
      if (workspaceSection) workspaceSection.hidden = false;
      if (signoutBtn) signoutBtn.hidden = false;

      document.getElementById('kpi-vendor-company').textContent = currentVendor.companyName || '—';
      document.getElementById('kpi-agreement-status').textContent = currentVendor.agreementStatus === 'signed' ? 'Active' : 'Pending';
      document.getElementById('kpi-network-access').textContent = currentVendor.networkAccessLevel === 'full' ? 'Unlocked' : 'Locked';
      document.getElementById('kpi-total-influencers').textContent = (data.influencers || []).length;
      document.getElementById('kpi-total-contacts').textContent = (data.contacts || []).length;

      if (currentVendor.agreementStatus === 'signed') {
        if (agreementSection) agreementSection.hidden = true;
        if (signedBanner) signedBanner.hidden = false;
        if (networkSection) networkSection.hidden = false;
      } else {
        if (agreementSection) agreementSection.hidden = false;
        if (signedBanner) signedBanner.hidden = true;
        if (networkSection) networkSection.hidden = true;
      }

      // Populate partner filter dropdown
      if (infFilterSelect) {
        infFilterSelect.innerHTML = '<option value="all">All Partners</option>';
        (data.influencers || []).forEach(inf => {
          const opt = document.createElement('option');
          opt.value = inf.id;
          opt.textContent = `${inf.fullName} (${inf.company})`;
          infFilterSelect.appendChild(opt);
        });
      }

      renderVendorRequests(data.requests || []);
      renderNetworkDirectory();
      renderPartnersDirectory();
    } catch (err) {
      if (err.status === 401) {
        token = '';
        sessionStorage.removeItem(tokenKey);
        localStorage.removeItem(tokenKey);
        showUnauthenticated();
      } else if (err.code === 'AGREEMENT_REQUIRED') {
        if (authSection) authSection.hidden = true;
        if (workspaceSection) workspaceSection.hidden = false;
        if (agreementSection) agreementSection.hidden = false;
        if (networkSection) networkSection.hidden = true;
      } else {
        alert(err.message);
      }
    }
  }

  // Event Listeners for Filters
  searchInput?.addEventListener('input', renderNetworkDirectory);
  infFilterSelect?.addEventListener('change', renderNetworkDirectory);
  warmthFilterSelect?.addEventListener('change', renderNetworkDirectory);

  // Vendor Registration & Sign In
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    const feedback = document.getElementById('vendor-signup-feedback');
    feedback.textContent = 'Creating account…';
    feedback.className = 'feedback-msg';

    try {
      const res = await apiRequest('/api/marketplace/vendors/signup', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries()))
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      await loadNetwork();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'feedback-msg error';
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const feedback = document.getElementById('vendor-login-feedback');
    feedback.textContent = 'Signing in…';
    feedback.className = 'feedback-msg';

    try {
      const res = await apiRequest('/api/marketplace/vendors/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries()))
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      await loadNetwork();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'feedback-msg error';
    }
  });

  agreementForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(agreementForm);
    const feedback = document.getElementById('vendor-agreement-feedback');
    feedback.textContent = 'Executing agreement…';
    feedback.className = 'feedback-msg';

    try {
      await apiRequest('/api/marketplace/vendor/agreement', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(fd.entries()))
      });
      await loadNetwork();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'feedback-msg error';
    }
  });

  signoutBtn?.addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(tokenKey);
    location.reload();
  });

  // Initial Boot
  if (token) {
    loadNetwork();
  } else {
    showUnauthenticated();
  }
})();
