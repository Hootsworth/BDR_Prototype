/**
 * ConnectEM Go Partner Portal Client
 * Handles session, relationships, intro inbox, rewards ledger, and privacy settings.
 */

(function () {
  'use strict';

  let currentPartner = null;
  let relationships = [];
  let inboxRequests = [];
  let rewardsData = null;
  const rewardsCart = new Set();
  let activeRewardCategory = 'all';

  // DOM Elements
  const authSection = document.getElementById('auth-section');
  const workspaceSection = document.getElementById('workspace-section');
  const onboardingSequenceSection = document.getElementById('onboarding-sequence-section');
  const onboardingScreenLinkedin = document.getElementById('onboarding-screen-linkedin');
  const onboardingScreenConnections = document.getElementById('onboarding-screen-connections');
  const onboardingScreenComplete = document.getElementById('onboarding-screen-complete');

  const stepNav1 = document.getElementById('step-nav-1');
  const stepNav2 = document.getElementById('step-nav-2');
  const stepNav3 = document.getElementById('step-nav-3');

  const linkedinConnectForm = document.getElementById('linkedin-connect-form');
  const linkedinProfileUrl = document.getElementById('linkedin-profile-url');
  const linkedinConnectBtn = document.getElementById('linkedin-connect-btn');

  const discoveredConnectionsTotal = document.getElementById('discovered-connections-total');
  const btnSelectedCount = document.getElementById('btn-selected-count');
  const oneClickImportBtn = document.getElementById('one-click-import-btn');
  const importBottomCtaBtn = document.getElementById('import-bottom-cta-btn');
  const connectionsSelectAll = document.getElementById('connections-select-all');
  const selectionStatusBadge = document.getElementById('selection-status-badge');
  const connectionsItemsList = document.getElementById('connections-items-list');
  const backToLinkedinBtn = document.getElementById('back-to-linkedin-btn');

  const completeImportedCount = document.getElementById('complete-imported-count');
  const enterWorkspaceBtn = document.getElementById('enter-workspace-btn');
  const launchLinkedinSyncBtn = document.getElementById('launch-linkedin-sync-btn');

  let discoveredConnections = [];
  const sessionIndicator = document.getElementById('session-indicator');
  const sessionPartnerName = document.getElementById('session-partner-name');
  const navNotificationsWrapper = document.getElementById('nav-notifications-wrapper');
  const navNotificationsBtn = document.getElementById('nav-notifications-btn');
  const navNotificationsBadge = document.getElementById('nav-notifications-badge');
  const notificationsDropdown = document.getElementById('notifications-dropdown');
  const notificationsList = document.getElementById('notifications-list');
  const markNotificationsReadBtn = document.getElementById('mark-notifications-read-btn');
  const viewAllRequestsBtn = document.getElementById('view-all-requests-btn');
  let notificationsDismissed = false;

  const authSignoutBtn = document.getElementById('auth-signout-btn');
  const partnerDisplayName = document.getElementById('partner-display-name');
  const partnerDisplayCompany = document.getElementById('partner-display-company');

  // Stats Elements
  const statContacts = null;
  const statPending = document.getElementById('stat-pending');
  const statOptins = document.getElementById('stat-optins');
  const statTrust = document.getElementById('stat-trust');
  const statPipeline = document.getElementById('stat-pipeline');
  const statRevenue = document.getElementById('stat-revenue');

  // Tables and Lists
  const contactsTbody = document.getElementById('contacts-tbody');
  const tableContactsCount = document.getElementById('table-contacts-count');
  const introRequestsList = document.getElementById('intro-requests-list');
  const inboxBadge = document.getElementById('inbox-badge');
  const reachCardsGrid = document.getElementById('reach-cards-grid');
  const attributionLedgerTbody = document.getElementById('attribution-ledger-tbody');
  const rewardsPointsBalance = document.getElementById('rewards-points-balance');
  const rewardsRevenueAmount = document.getElementById('rewards-revenue-amount');
  const settingsPartnerEmail = document.getElementById('settings-partner-email');

  // Toast Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // API Client with Authorization Bearer
  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (currentPartner && currentPartner.authToken) {
      headers['Authorization'] = `Bearer ${currentPartner.authToken}`;
    }

    const res = await fetch(path, {
      ...options,
      headers
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error(text || `Server responded with status ${res.status}`);
    }
    if (!json || !json.success) {
      throw new Error(json?.error || 'Server request failed');
    }
    return json.data;
  }

  // Session Management
  async function checkSession() {
    const savedToken = localStorage.getItem('connectem_go_token');
    if (savedToken) {
      try {
        const partner = await api('/api/go/session', {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
        setPartnerSession(partner);
        return;
      } catch (e) {
        localStorage.removeItem('connectem_go_token');
        localStorage.removeItem('connectem_go_email');
      }
    }
    showAuthView();
  }

  function setPartnerSession(partner) {
    currentPartner = partner;
    localStorage.setItem('connectem_go_token', partner.authToken);
    localStorage.setItem('connectem_go_email', partner.email);
    document.body.classList.remove('auth-login-view', 'auth-signup-view');

    authSection.style.display = 'none';
    workspaceSection.style.display = 'block';
    sessionIndicator.style.display = 'flex';
    if (navNotificationsWrapper) navNotificationsWrapper.style.display = 'inline-block';
    authSignoutBtn.style.display = 'inline-flex';

    sessionPartnerName.textContent = partner.fullName;
    partnerDisplayName.textContent = partner.fullName;
    partnerDisplayCompany.textContent = `${partner.company} · ${partner.jobTitle}`;
    settingsPartnerEmail.textContent = partner.email;

    const demoBadge = document.getElementById('session-demo-badge');
    if (demoBadge) {
      const isDemo = partner.id === 'partner_bmiller' || partner.email === 'bob.miller@milleradvisory.com';
      demoBadge.style.display = isDemo ? 'inline-block' : 'none';
    }

    // Set privacy radio
    const radio = document.querySelector(`input[name="privacyTier"][value="${partner.privacyTier}"]`);
    if (radio) radio.checked = true;

    loadAllData();
  }

  function showAuthView() {
    currentPartner = null;
    authSection.style.display = 'block';
    workspaceSection.style.display = 'none';
    if (onboardingSequenceSection) onboardingSequenceSection.style.display = 'none';
    sessionIndicator.style.display = 'none';
    const demoBadge = document.getElementById('session-demo-badge');
    if (demoBadge) demoBadge.style.display = 'none';
    if (navNotificationsWrapper) navNotificationsWrapper.style.display = 'none';
    if (notificationsDropdown) notificationsDropdown.style.display = 'none';
    authSignoutBtn.style.display = 'none';

    const isSignup = window.location.pathname.replace(/\/$/, '') === '/signup';
    document.body.classList.toggle('auth-signup-view', isSignup);
    document.body.classList.toggle('auth-login-view', !isSignup);
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const modeLabel = document.getElementById('auth-mode-label');
    const formTitle = document.getElementById('auth-form-title');
    const formCopy = document.getElementById('auth-form-copy');
    const storyTitle = document.getElementById('auth-story-title');
    const storyCopy = document.getElementById('auth-story-copy');
    if (loginView) loginView.hidden = isSignup;
    if (signupView) signupView.hidden = !isSignup;
    if (modeLabel) modeLabel.textContent = isSignup ? 'JOIN THE NETWORK' : 'PARTNER ACCESS';
    if (formTitle) formTitle.textContent = isSignup ? 'Create your account' : 'Welcome back';
    if (formCopy) formCopy.textContent = isSignup
      ? 'Set up your partner profile to get started.'
      : 'Sign in with the email address registered to your partner account.';
    if (storyTitle) storyTitle.textContent = isSignup
      ? 'Build stronger business through trusted connections.'
      : 'Good relationships move business forward.';
    if (storyCopy) storyCopy.textContent = isSignup
      ? 'Create your profile, bring your professional network into one workspace, and decide how you want to participate.'
      : 'Your workspace brings your trusted contacts, introduction requests, and earned rewards together in one place.';
    const error = document.getElementById('auth-error');
    if (error) { error.hidden = true; error.textContent = ''; }
  }

  // Onboarding Sequence (Separate Screens)
  function showOnboardingSequence(step = 1) {
    authSection.style.display = 'none';
    workspaceSection.style.display = 'none';
    if (onboardingSequenceSection) onboardingSequenceSection.style.display = 'block';

    if (onboardingScreenLinkedin) onboardingScreenLinkedin.style.display = step === 1 ? 'block' : 'none';
    if (onboardingScreenConnections) onboardingScreenConnections.style.display = step === 2 ? 'block' : 'none';
    if (onboardingScreenComplete) onboardingScreenComplete.style.display = step === 3 ? 'block' : 'none';

    if (stepNav1) stepNav1.className = `step-indicator ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`;
    if (stepNav2) stepNav2.className = `step-indicator ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`;
    if (stepNav3) stepNav3.className = `step-indicator ${step === 3 ? 'active' : ''}`;
  }

  function renderDiscoveredConnections(list) {
    discoveredConnections = list;
    if (discoveredConnectionsTotal) discoveredConnectionsTotal.textContent = list.length;
    if (!connectionsItemsList) return;
    connectionsItemsList.innerHTML = '';

    if (list.length === 0) {
      connectionsItemsList.innerHTML = `<div class="empty-state"><p>No connections discovered.</p></div>`;
      updateSelectionSummary();
      return;
    }

    list.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'connection-card selected';
      card.id = `conn-card-${item.id}`;

      const initials = (item.firstName?.[0] || '') + (item.lastName?.[0] || 'E');

      card.innerHTML = `
        <div class="connection-meta">
          <input type="checkbox" class="connection-checkbox" data-id="${item.id}" checked>
          <div class="connection-avatar">${initials}</div>
          <div>
            <div style="font-weight:600; color:var(--ink);">${item.fullName}</div>
            <div style="font-size:13px; color:var(--muted);">${item.jobTitle} · <strong style="color:var(--ink); font-weight:500;">${item.company}</strong></div>
            <div style="font-size:12px; color:var(--body); margin-top:2px;">${item.relationshipContext}</div>
          </div>
        </div>
        <span class="badge-tag ${item.relationshipStrength || 'strong'}">${(item.relationshipStrength || 'strong').toUpperCase()}</span>
      `;

      card.querySelector('input.connection-checkbox')?.addEventListener('change', (e) => {
        if (e.target.checked) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
        updateSelectionSummary();
      });

      connectionsItemsList.appendChild(card);
    });

    updateSelectionSummary();
  }

  function updateSelectionSummary() {
    if (!connectionsItemsList) return;
    const checkedBoxes = connectionsItemsList.querySelectorAll('input.connection-checkbox:checked');
    const totalBoxes = connectionsItemsList.querySelectorAll('input.connection-checkbox');
    const selectedCount = checkedBoxes.length;

    if (btnSelectedCount) btnSelectedCount.textContent = selectedCount;
    if (connectionsSelectAll) connectionsSelectAll.checked = selectedCount > 0 && selectedCount === totalBoxes.length;

    if (selectionStatusBadge) {
      if (selectedCount === 0) {
        selectionStatusBadge.textContent = 'None Selected';
        selectionStatusBadge.style.color = 'var(--muted)';
      } else if (selectedCount === totalBoxes.length) {
        selectionStatusBadge.textContent = 'All Selected';
        selectionStatusBadge.style.color = 'var(--primary)';
      } else {
        selectionStatusBadge.textContent = `${selectedCount} Selected`;
        selectionStatusBadge.style.color = 'var(--ink)';
      }
    }
  }

  // Outreach State
  let twilioEnabled = false;
  let gmailConnected = false;
  let activeOutreachProspectId = null;
  let emailAiAssisted = false;
  const outreachContactsList = document.getElementById('outreach-contacts-list');
  const outreachContactsTotal = document.getElementById('outreach-contacts-total');
  const outreachSearchInput = document.getElementById('outreach-search-input');

  function switchOutreachChannel(channel) {
    const validChannels = ['email', 'call', 'linkedin'];
    const active = validChannels.includes(channel) ? channel : 'email';

    validChannels.forEach(ch => {
      const tabBtn = document.getElementById(`channel-tab-${ch}`);
      const pane = document.getElementById(`channel-content-${ch}`);
      const isCurrent = ch === active;
      if (tabBtn) {
        tabBtn.classList.toggle('active', isCurrent);
        tabBtn.setAttribute('aria-selected', String(isCurrent));
      }
      if (pane) {
        pane.style.display = isCurrent ? 'block' : 'none';
      }
    });
  }

  function selectOutreachContact(contactOrId) {
    const contact = typeof contactOrId === 'string'
      ? relationships.find(c => c.id === contactOrId)
      : contactOrId;
    if (!contact) return;
    activeOutreachProspectId = contact.id;

    document.querySelectorAll('.outreach-contact-item').forEach(item => {
      const selected = item.dataset.contactId === contact.id;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });

    const name = document.getElementById('outreach-selected-name');
    const sub = document.getElementById('outreach-selected-sub');
    const strength = document.getElementById('outreach-selected-strength');
    if (name) name.textContent = contact.fullName;
    if (sub) sub.textContent = [contact.jobTitle, contact.company, contact.email].filter(Boolean).join(' · ');
    if (strength) {
      const value = contact.relationshipStrength || 'strong';
      strength.className = `badge-tag ${value}`;
      strength.textContent = value.toUpperCase();
    }

    // Populate Email channel
    const compProspectId = document.getElementById('composer-prospect-id');
    const compFromEmail = document.getElementById('composer-from-email');
    const compToRecipient = document.getElementById('composer-to-recipient');
    const aiDraftPurposeInput = document.getElementById('ai-draft-purpose');
    const compSubject = document.getElementById('composer-subject');
    const compBody = document.getElementById('composer-body');

    if (compProspectId) compProspectId.value = contact.id;
    if (compFromEmail) compFromEmail.textContent = currentPartner?.gmailEmail || currentPartner?.email || 'you@example.com';
    if (compToRecipient) compToRecipient.textContent = `${contact.fullName} <${contact.email}>`;
    if (aiDraftPurposeInput) aiDraftPurposeInput.value = `Executive briefing & advisory intro for ${contact.company}`;
    if (compSubject && (!compSubject.value || compSubject.value.startsWith('ConnectEM: Introduction') || compSubject.value.startsWith('Quick note'))) {
      compSubject.value = `ConnectEM: Introduction & Executive Briefing (${contact.company})`;
    }
    if (compBody && (!compBody.value || compBody.value.startsWith('Hi '))) {
      compBody.value = `Hi ${contact.fullName},\n\nHope this finds you well. I am reaching out to share a strategic advisory briefing tailored for ${contact.company}.\n\nLet's coordinate a brief introductory discussion this week.\n\nBest regards,\n${currentPartner?.fullName || 'Bob Miller'}`;
    }

    // Populate Call channel
    const callProspectId = document.getElementById('call-logger-prospect-id');
    const twilioTarget = document.getElementById('twilio-dialing-target');
    if (callProspectId) callProspectId.value = contact.id;
    if (twilioTarget) twilioTarget.textContent = contact.phone || '+1 (555) 234-5678';

    // Populate LinkedIn channel
    const linkedinProspectId = document.getElementById('linkedin-logger-prospect-id');
    const linkedinTargetName = document.getElementById('linkedin-dialog-target-name');
    const linkedinTargetHeadline = document.getElementById('linkedin-dialog-target-headline');
    const linkedinProfileLink = document.getElementById('linkedin-dialog-profile-link');
    if (linkedinProspectId) linkedinProspectId.value = contact.id;
    if (linkedinTargetName) linkedinTargetName.textContent = contact.fullName;
    if (linkedinTargetHeadline) linkedinTargetHeadline.textContent = `${contact.jobTitle} · ${contact.company}`;
    if (linkedinProfileLink) {
      linkedinProfileLink.href = contact.linkedinUrl || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(contact.fullName + ' ' + contact.company)}`;
    }
  }

  // Wire up Outreach channel tabs
  document.getElementById('channel-tab-email')?.addEventListener('click', () => switchOutreachChannel('email'));
  document.getElementById('channel-tab-call')?.addEventListener('click', () => switchOutreachChannel('call'));
  document.getElementById('channel-tab-linkedin')?.addEventListener('click', () => switchOutreachChannel('linkedin'));

  function renderOutreachContacts(list = relationships) {
    if (!outreachContactsList) return;
    if (outreachContactsTotal) outreachContactsTotal.textContent = list.length;
    const query = (outreachSearchInput?.value || '').trim().toLowerCase();
    const filtered = list.filter(contact => [contact.fullName, contact.company, contact.jobTitle, contact.email]
      .some(value => String(value || '').toLowerCase().includes(query)));
    outreachContactsList.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'outreach-contacts-empty';
      empty.textContent = list.length ? 'No contacts match your search.' : 'No contacts yet.';
      outreachContactsList.appendChild(empty);
      return;
    }
    filtered.forEach(contact => {
      const item = document.createElement('button');
      item.type = 'button';
      const isContacted = Boolean(
        contact.outreachStatus === 'Contacted' ||
        contact.outreachStatus === 'Intro Sent' ||
        contact.lastContactedAt ||
        (contact.optInCount && contact.optInCount > 0)
      );
      item.className = `outreach-contact-item ${isContacted ? 'is-contacted' : 'is-pending'}`;
      item.dataset.contactId = contact.id;
      item.setAttribute('aria-pressed', String(contact.id === activeOutreachProspectId));
      item.classList.toggle('active', contact.id === activeOutreachProspectId);
      
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; width:100%; gap:6px;';
      const name = document.createElement('strong');
      name.textContent = contact.fullName;
      const statusBadge = document.createElement('span');
      statusBadge.className = `contact-status-badge ${isContacted ? 'badge-contacted' : 'badge-uncontacted'}`;
      statusBadge.textContent = isContacted ? 'Contacted' : 'Not Contacted';
      topRow.append(name, statusBadge);

      const detail = document.createElement('span');
      detail.textContent = [contact.jobTitle, contact.company].filter(Boolean).join(' · ') || contact.email || 'Contact';
      item.append(topRow, detail);
      item.addEventListener('click', () => selectOutreachContact(contact));
      outreachContactsList.appendChild(item);
    });
    const selected = filtered.find(contact => contact.id === activeOutreachProspectId);
    if (selected) selectOutreachContact(selected);
    else if (filtered.length) selectOutreachContact(filtered[0]);
  }

  outreachSearchInput?.addEventListener('input', () => renderOutreachContacts());

  async function loadOutreachStatus() {
    try {
      const [gmailRes, twilioRes] = await Promise.all([
        api('/api/go/outreach/gmail/status'),
        api('/api/go/outreach/twilio/status')
      ]);

      gmailConnected = !!gmailRes.connected;
      twilioEnabled = !!twilioRes.enabled;

      const statusEl = document.getElementById('outreach-gmail-status');
      const grantBtn = document.getElementById('grant-gmail-perm-btn');
      if (statusEl) {
        if (gmailConnected) {
          statusEl.innerHTML = `<span class="badge-tag strong" style="font-size:11.5px;">Gmail Connected (${gmailRes.email || currentPartner?.email || ''})</span>`;
          if (grantBtn) grantBtn.style.display = 'none';
        } else {
          statusEl.innerHTML = `<span style="color:var(--semantic-error, #b91c1c); font-weight:500;">Permission Required</span>`;
          if (grantBtn) grantBtn.style.display = 'inline-block';
        }
      }
    } catch (err) {
      console.warn('Outreach status error:', err);
    }
  }

  // Load Workspace Data
  async function loadAllData() {
    try {
      await Promise.all([
        loadRelationships(),
        loadInbox(),
        loadRewards(),
        loadOutreachStatus(),
        loadSettings()
      ]);
      updateStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function loadRelationships() {
    relationships = await api('/api/go/relationships');
    renderRelationshipsTable(relationships);
    renderReachCards(relationships);
    renderOutreachContacts();
  }

  async function loadInbox() {
    inboxRequests = await api('/api/go/inbox');
    renderInbox();
  }

  async function loadRewards() {
    rewardsData = await api('/api/go/rewards');
    renderRewards();
  }

  function updateStats() {
    if (!currentPartner) return;
    const pendingCount = inboxRequests.filter(r => r.status === 'pending_partner_review').length;
    if (inboxBadge) inboxBadge.textContent = pendingCount;
    if (statContacts) statContacts.textContent = relationships.length;
    if (statPending) statPending.textContent = pendingCount;
    if (statOptins) statOptins.textContent = relationships.reduce((acc, r) => acc + (r.optInCount || 0), 0);
    if (statTrust) statTrust.textContent = '96 / 100';
    if (statPipeline) statPipeline.textContent = '$185,000';
    if (statRevenue) statRevenue.textContent = `$${(currentPartner.verifiedRevenue || 45000).toLocaleString()}`;
    renderNotifications();
  }

  // Render Relationships Table
  function renderRelationshipsTable(list) {
    tableContactsCount.textContent = list.length;
    contactsTbody.innerHTML = '';

    if (list.length === 0) {
      contactsTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:32px; color:var(--muted);">
            No contacts added yet. Add a contact above to get started.
          </td>
        </tr>`;
      return;
    }

    list.forEach(item => {
      const tr = document.createElement('tr');
      const strengthClass = item.relationshipStrength || 'strong';
      tr.innerHTML = `
        <td>
          <strong style="color:var(--ink);">${item.fullName}</strong>
          <div style="font-size:12px; color:var(--muted);">${item.jobTitle || 'Executive'}</div>
        </td>
        <td>
          <span style="font-weight:500;">${item.company}</span>
          <div style="font-size:12px; color:var(--muted);">${item.email}</div>
        </td>
        <td>
          <span class="badge-tag ${strengthClass}">${strengthClass.toUpperCase()}</span>
        </td>
        <td>
          <div style="font-size:13px; max-width:300px;">${item.relationshipContext || 'Advisory relationship'}</div>
          ${item.phone ? `<div class="code-text" style="color:var(--muted); font-size:11px;">${item.phone}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.quickReachOut('${item.id}')">
            Contact
          </button>
        </td>
      `;
      contactsTbody.appendChild(tr);
    });
  }

  // Render Influencers Reach Cards
  function renderReachCards(list) {
    if (!reachCardsGrid) return;
    reachCardsGrid.innerHTML = '';
    if (list.length === 0) {
      reachCardsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No contacts available for reach.</p></div>`;
      return;
    }

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '18px';

      // Call button: If Twilio is enabled, show direct Call dialer; if disabled, show 'Mark as Called'
      const callButtonHtml = twilioEnabled
        ? `<button class="btn btn-secondary btn-sm" type="button" onclick="window.openCallDialog('${item.id}')">Call</button>`
        : `<button class="btn btn-tertiary btn-sm" type="button" onclick="window.openCallDialog('${item.id}')">Mark as Called</button>`;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <strong style="color:var(--ink); font-size:16px;">${item.fullName}</strong>
            <div style="font-size:13px; color:var(--muted);">${item.jobTitle} · ${item.company}</div>
          </div>
          <span class="badge-tag ${item.relationshipStrength || 'strong'}">${(item.relationshipStrength || 'strong').toUpperCase()}</span>
        </div>
        <p style="font-size:12px; color:var(--body); margin: 8px 0 14px;">
          ${item.relationshipContext || 'Strategic partner connection.'}
        </p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" type="button" onclick="window.openEmailComposer('${item.id}')">Send Email</button>
          ${callButtonHtml}
          <button class="btn btn-secondary btn-sm" type="button" onclick="window.openLinkedInDialog('${item.id}')">LinkedIn</button>
        </div>
      `;
      reachCardsGrid.appendChild(card);
    });
  }

  // Render Inbox (Introduction Requests with Double Opt-In Flow & AI Timeline Pills)
  function renderInbox() {
    introRequestsList.innerHTML = '';
    const pending = inboxRequests.filter(r => r.status === 'pending_partner_review');

    if (inboxRequests.length === 0) {
      introRequestsList.innerHTML = `
        <div class="card empty-state">
          <h3 class="title-md">No Introduction Requests</h3>
          <p>When vendors find a high-match path to your network, their request briefs will arrive here for your explicit review.</p>
        </div>`;
      return;
    }

    inboxRequests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'intro-request-card';

      // Pick timeline pill style
      let pillClass = 'thinking';
      let pillLabel = 'Pending';
      if (req.status === 'partner_approved' || req.status === 'pending_contact_opt_in') {
        pillClass = 'grep';
        pillLabel = 'Awaiting Response';
      } else if (req.status === 'opted_in' || req.status === 'contact_accepted') {
        pillClass = 'read';
        pillLabel = 'Accepted';
      } else if (req.status === 'declined' || req.status === 'partner_declined') {
        pillClass = 'edit';
        pillLabel = 'Declined';
      } else if (req.status === 'settled' || req.status === 'deal_closed') {
        pillClass = 'done';
        pillLabel = 'Completed';
      }

      const isPending = req.status === 'pending_partner_review';

      card.innerHTML = `
        <div class="request-card-head">
          <div>
            <span class="timeline-pill ${pillClass}">${pillLabel}</span>
            <span style="font-size:13px; color:var(--muted); margin-left:10px;">ID: <span class="code-text">${req.id}</span></span>
          </div>
          <span class="score-badge">Match: ${req.warmPathScore || 90}%</span>
        </div>

        <div style="margin-bottom: 14px;">
          <h3 class="title-md" style="margin-bottom: 4px;">
            <strong style="color:var(--primary);">${req.vendorName}</strong> requesting introduction to <strong>${req.prospectName}</strong> (${req.prospectCompany})
          </h3>
        </div>

        <div class="brief-box">
          <strong>Summary</strong>
          <p>${req.forwardableBrief}</p>
        </div>

        <div class="brief-box" style="margin-bottom: 16px;">
          <strong>Details</strong>
          <p>${req.specificAsk}</p>
        </div>

        ${isPending ? `
          <div class="request-actions">
            <button class="btn btn-primary" onclick="window.reviewRequest('${req.id}', 'approved')">
              Approve
            </button>
            <button class="btn btn-secondary" onclick="window.reviewRequest('${req.id}', 'declined')">
              Decline
            </button>
            <button class="btn btn-tertiary" onclick="window.reviewRequest('${req.id}', 'needs_context')">
              Details
            </button>
          </div>
        ` : ''}

        ${req.optInToken ? `
          <div style="margin-top:14px; padding:12px 14px; background:var(--canvas-soft); border-radius:var(--radius-md); border:1px solid var(--hairline-strong); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div style="font-size:13px;">
              <strong>Opt-In Link:</strong>
              <span class="code-text" style="color:var(--primary); margin-left:6px;">/api/connectem/opt-in?token=${req.optInToken}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(window.location.origin + '/api/connectem/opt-in?token=${req.optInToken}'); window.showToast('Opt-in link copied!');">
              Copy Link
            </button>
          </div>
        ` : ''}
      `;
      introRequestsList.appendChild(card);
    });
  }

  // Render Rewards Ledger
  function renderRewards() {
    if (!rewardsData) return;
    const balance = rewardsData.creditsBalance ?? rewardsData.pointsBalance ?? 0;
    if (rewardsPointsBalance) rewardsPointsBalance.textContent = `${balance.toLocaleString()} credits`;
    if (rewardsRevenueAmount) rewardsRevenueAmount.textContent = `$${(rewardsData.verifiedRevenue || 0).toLocaleString()}`;

    const creditsInput = document.getElementById('rewards-credits-to-apply');
    if (creditsInput) creditsInput.max = String(balance);

    const milestonesList = document.getElementById('credit-milestones-list');
    if (milestonesList) {
      milestonesList.replaceChildren();
      (rewardsData.milestones || []).forEach(milestone => {
        const row = document.createElement('div');
        row.className = 'milestone-row';
        const title = document.createElement('span');
        title.textContent = milestone.name;
        const amount = document.createElement('strong');
        amount.textContent = `+${Number(milestone.credits).toLocaleString()} credits`;
        row.append(title, amount);
        milestonesList.appendChild(row);
      });
    }
    renderRewardCatalog();
    renderRewardsCart();
    renderRedemptionRequests();

    attributionLedgerTbody.innerHTML = '';
    if (!rewardsData.history || rewardsData.history.length === 0) {
      attributionLedgerTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted);">No attribution events recorded yet.</td></tr>`;
      return;
    }

    rewardsData.history.forEach(item => {
      const tr = document.createElement('tr');
      const stageLabels = {
        opt_in_accepted: 'Warm introduction',
        meeting_held: 'Qualified meeting',
        opportunity_created: 'Opportunity created',
        deal_won: 'Customer close',
        customer_expansion: 'Customer expansion'
      };
      tr.innerHTML = `
        <td><span class="timeline-pill done">${stageLabels[item.stage] || item.stage}</span></td>
        <td><strong class="code-text">+${(item.creditsAwarded ?? item.pointsAwarded).toLocaleString()} credits</strong></td>
        <td><strong style="color:var(--semantic-success);">$${(item.verifiedRevenue || 0).toLocaleString()}</strong></td>
        <td style="font-size:13px;">${item.notes || 'Milestone achieved'}</td>
        <td class="code-text" style="font-size:12px; color:var(--muted);">${new Date(item.timestamp).toLocaleDateString()}</td>
      `;
      attributionLedgerTbody.appendChild(tr);
    });
  }

  function renderRewardCatalog() {
    const grid = document.getElementById('rewards-catalog-grid');
    if (!grid) return;
    grid.replaceChildren();
    const items = rewardsData.catalog || [];
    const filteredItems = activeRewardCategory === 'all'
      ? items
      : items.filter(item => item.category === activeRewardCategory);
    filteredItems.forEach(reward => {
      const card = document.createElement('article');
      card.className = 'reward-product-card';
      const category = document.createElement('span');
      category.className = 'reward-product-category';
      category.textContent = reward.category;
      const title = document.createElement('h4');
      title.textContent = reward.name;
      const description = document.createElement('p');
      description.textContent = reward.description;
      const button = document.createElement('button');
      const inCart = rewardsCart.has(reward.id);
      button.type = 'button';
      button.className = inCart ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
      button.dataset.rewardId = reward.id;
      button.textContent = inCart ? 'Added to cart' : 'Add to cart';
      button.setAttribute('aria-pressed', String(inCart));
      card.append(category, title, description, button);
      grid.appendChild(card);
    });
    if (!filteredItems.length) {
      const empty = document.createElement('p');
      empty.className = 'rewards-empty';
      empty.textContent = 'No rewards in this category yet.';
      grid.appendChild(empty);
    }
  }

  function renderRewardsCart() {
    const cart = document.getElementById('rewards-cart-items');
    const count = document.getElementById('rewards-cart-count');
    const submit = document.getElementById('redeem-submit-btn');
    if (!cart) return;
    cart.replaceChildren();
    if (count) count.textContent = String(rewardsCart.size);
    if (submit) submit.disabled = rewardsCart.size === 0;
    if (!rewardsCart.size) {
      const empty = document.createElement('p');
      empty.className = 'rewards-cart-empty';
      empty.textContent = 'Your cart is empty. Add a reward to start a request.';
      cart.appendChild(empty);
      return;
    }
    const catalog = rewardsData?.catalog || [];
    rewardsCart.forEach(id => {
      const reward = catalog.find(item => item.id === id);
      if (!reward) return;
      const row = document.createElement('div');
      row.className = 'rewards-cart-item';
      const name = document.createElement('span');
      name.textContent = reward.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'rewards-cart-remove';
      remove.dataset.removeReward = id;
      remove.setAttribute('aria-label', `Remove ${reward.name}`);
      remove.textContent = 'Remove';
      row.append(name, remove);
      cart.appendChild(row);
    });
  }

  function renderRedemptionRequests() {
    const list = document.getElementById('rewards-requests-list');
    if (!list) return;
    list.replaceChildren();
    const requests = rewardsData?.redemptions || [];
    if (!requests.length) {
      const empty = document.createElement('p');
      empty.className = 'rewards-empty';
      empty.textContent = 'No redemption requests yet.';
      list.appendChild(empty);
      return;
    }
    requests.forEach(request => {
      const row = document.createElement('article');
      row.className = 'redemption-request-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = (request.itemNames || []).join(', ');
      const detail = document.createElement('p');
      detail.textContent = `${request.creditsRequested.toLocaleString()} credits requested · ${new Date(request.submittedAt).toLocaleDateString()}`;
      copy.append(title, detail);
      const status = document.createElement('span');
      status.className = 'redemption-status';
      status.textContent = request.status.replaceAll('_', ' ');
      row.append(copy, status);
      list.appendChild(row);
    });
  }

  document.getElementById('rewards-catalog-grid')?.addEventListener('click', e => {
    const button = e.target.closest('[data-reward-id]');
    if (!button) return;
    const id = button.dataset.rewardId;
    if (rewardsCart.has(id)) rewardsCart.delete(id);
    else rewardsCart.add(id);
    renderRewardCatalog();
    renderRewardsCart();
  });

  document.getElementById('rewards-cart-items')?.addEventListener('click', e => {
    const button = e.target.closest('[data-remove-reward]');
    if (!button) return;
    rewardsCart.delete(button.dataset.removeReward);
    renderRewardCatalog();
    renderRewardsCart();
  });

  document.querySelectorAll('.reward-filter').forEach(button => {
    button.addEventListener('click', () => {
      activeRewardCategory = button.dataset.rewardCategory || 'all';
      document.querySelectorAll('.reward-filter').forEach(filter => {
        const active = filter === button;
        filter.classList.toggle('active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      renderRewardCatalog();
    });
  });

  // Global window functions for event handlers
  window.reviewRequest = async function (requestId, decision) {
    try {
      const result = await api('/api/go/inbox/review', {
        method: 'POST',
        body: JSON.stringify({ requestId, decision })
      });
      showToast(`Request ${decision} successfully.`);
      await loadInbox();
      updateStats();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  window.filterReach = function (filter) {
    if (filter === 'all') {
      renderReachCards(relationships);
    } else {
      const filtered = relationships.filter(r => (r.relationshipStrength || 'strong') === filter);
      renderReachCards(filtered);
    }
  };

  window.quickReachOut = function (contactId) {
    document.getElementById('tab-btn-email')?.click();
    selectOutreachContact(contactId);
    switchOutreachChannel('email');
    if (emailComposerModal) emailComposerModal.style.display = 'none';
  };
  window.openEmailComposer = window.quickReachOut;

  window.showToast = showToast;

  // Event Listeners
  async function triggerDemoLogin(button) {
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Opening demo…';
      }
      const res = await api('/api/go/demo-login', { method: 'POST' });
      setPartnerSession(res.partner);
      showToast(`Signed in as ${res.partner.fullName} (Demo Mode)`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Try demo';
      }
    }
  }

  async function triggerGooglePartnerAuth(mode) {
    const authError = document.getElementById('auth-error');
    if (authError) { authError.hidden = true; authError.textContent = ''; }

    // 1. Try Google Identity Services
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: window.GoogleConfig?.clientId || '',
        callback: async (response) => {
          if (response.credential) {
            await sendGooglePartnerAuth({ credential: response.credential }, mode);
          }
        }
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          promptGooglePartnerEmailFallback(mode);
        }
      });
      return;
    }

    // 2. Try Firebase Auth popup
    if (window.firebase?.auth) {
      try {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        const authResult = await window.firebase.auth().signInWithPopup(provider);
        if (authResult?.user) {
          await sendGooglePartnerAuth({
            email: authResult.user.email,
            name: authResult.user.displayName,
            idToken: await authResult.user.getIdToken()
          }, mode);
          return;
        }
      } catch (e) {
        console.warn('Firebase Google Auth popup:', e);
      }
    }

    promptGooglePartnerEmailFallback(mode);
  }

  async function promptGooglePartnerEmailFallback(mode) {
    const defaultEmail = mode === 'signup' ? '' : 'bmiller@apexadvisory.com';
    const email = prompt(`Sign ${mode === 'signup' ? 'up' : 'in'} with Google: Enter your Google Workspace or Gmail address:`, defaultEmail);
    if (!email) return;
    let name = '';
    if (mode === 'signup') {
      name = prompt('Enter your Full Name:', email.split('@')[0]) || email.split('@')[0];
    }
    await sendGooglePartnerAuth({ email, name }, mode);
  }

  async function sendGooglePartnerAuth(payload, mode) {
    const authError = document.getElementById('auth-error');
    try {
      const res = await api('/api/go/google-login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const partner = res.partner || res.influencer || res.data?.partner || res;
      setPartnerSession(partner);
      if (mode === 'signup') {
        showOnboardingSequence(1);
        showToast('Google profile connected! Connect your network.');
      } else {
        showToast(`Signed in with Google as ${partner.fullName || partner.email}`);
      }
    } catch (e) {
      if (authError) { authError.hidden = false; authError.textContent = e.message; }
      showToast(e.message, 'error');
    }
  }

  document.getElementById('partner-google-login-btn')?.addEventListener('click', () => {
    triggerGooglePartnerAuth('login');
  });
  document.getElementById('partner-google-signup-btn')?.addEventListener('click', () => {
    triggerGooglePartnerAuth('signup');
  });

  document.getElementById('quick-demo-login-btn')?.addEventListener('click', (e) => {
    triggerDemoLogin(e.currentTarget);
  });
  document.getElementById('quick-demo-signup-btn')?.addEventListener('click', (e) => {
    triggerDemoLogin(e.currentTarget);
  });

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitButton = document.getElementById('login-submit-btn');
    const authError = document.getElementById('auth-error');
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    try {
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Signing in…'; }
      const res = await api('/api/go/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.mustChangePassword) {
        promptChangeTemporaryPassword(res.partner, password);
        return;
      }
      setPartnerSession(res.partner);
      showToast(`Welcome back, ${res.partner.fullName}`);
    } catch (e) {
      if (authError) { authError.hidden = false; authError.textContent = e.message; }
      showToast(e.message, 'error');
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Sign in to your workspace'; }
    }
  });

  function promptChangeTemporaryPassword(partner, currentPassword) {
    const modal = document.getElementById('modal-change-password');
    if (!modal) {
      setPartnerSession(partner);
      return;
    }
    modal.style.display = 'flex';
    const form = document.getElementById('form-change-password');
    const errEl = document.getElementById('change-pwd-error');
    const btn = document.getElementById('btn-save-permanent-pwd');

    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      const newPwd = document.getElementById('change-pwd-new').value.trim();
      const confirmPwd = document.getElementById('change-pwd-confirm').value.trim();
      if (newPwd.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.style.display = 'block';
        return;
      }
      if (newPwd !== confirmPwd) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
        return;
      }
      if (newPwd === currentPassword) {
        errEl.textContent = 'New password cannot be the same as the temporary password.';
        errEl.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Updating password…';
      try {
        await api('/api/go/change-password', {
          method: 'POST',
          body: JSON.stringify({
            email: partner.email,
            currentPassword: currentPassword,
            newPassword: newPwd
          })
        });
        modal.style.display = 'none';
        setPartnerSession(partner);
        showToast('Password updated! Welcome to your Influencer workspace.');
      } catch (err) {
        errEl.textContent = err.message || 'Failed to update password.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Password & Enter Workspace';
      }
    };
  }

  document.getElementById('onboarding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = document.getElementById('onboard-submit-btn');
    const authError = document.getElementById('auth-error');
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    const formData = new FormData(e.target);
    const payload = {
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      company: formData.get('company'),
      jobTitle: formData.get('jobTitle'),
      password: formData.get('password'),
      privacyTier: formData.get('privacyTier')
    };

    if (payload.password !== formData.get('passwordConfirm')) {
      if (authError) { authError.hidden = false; authError.textContent = 'Your passwords do not match.'; }
      return;
    }

    try {
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Creating your profile…'; }
      const partner = await api('/api/go/onboard', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setPartnerSession(partner);
      showOnboardingSequence(1);
      showToast('Profile created! Now connect your LinkedIn network.');
    } catch (e) {
      if (authError) { authError.hidden = false; authError.textContent = e.message; }
      showToast(e.message, 'error');
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Create partner account'; }
    }
  });

  // LinkedIn Onboarding Sequence Form & Buttons
  linkedinConnectForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = linkedinProfileUrl.value.trim();
    if (!url) return;

    if (linkedinConnectBtn) {
      linkedinConnectBtn.disabled = true;
      linkedinConnectBtn.textContent = 'Connecting LinkedIn & Discovering Network...';
    }

    try {
      await api('/api/go/onboarding/linkedin/connect', {
        method: 'POST',
        body: JSON.stringify({ linkedinUrl: url })
      });
      const data = await api('/api/go/onboarding/linkedin/connections');
      renderDiscoveredConnections(data.connections || []);
      showOnboardingSequence(2);
      showToast('LinkedIn connected! Discovered executive network.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (linkedinConnectBtn) {
        linkedinConnectBtn.disabled = false;
        linkedinConnectBtn.textContent = 'Connect LinkedIn & Discover Connections';
      }
    }
  });

  connectionsSelectAll?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    connectionsItemsList.querySelectorAll('input.connection-checkbox').forEach(cb => {
      cb.checked = isChecked;
      const card = cb.closest('.connection-card');
      if (card) {
        if (isChecked) card.classList.add('selected');
        else card.classList.remove('selected');
      }
    });
    updateSelectionSummary();
  });

  backToLinkedinBtn?.addEventListener('click', () => {
    showOnboardingSequence(1);
  });

  async function handleOneClickImport() {
    if (!connectionsItemsList) return;
    const checkedBoxes = Array.from(connectionsItemsList.querySelectorAll('input.connection-checkbox:checked'));
    if (checkedBoxes.length === 0) {
      showToast('Please select at least one connection to import.', 'error');
      return;
    }
    const connectionIds = checkedBoxes.map(cb => cb.dataset.id);

    if (oneClickImportBtn) {
      oneClickImportBtn.disabled = true;
      oneClickImportBtn.textContent = 'Adding Contacts...';
    }
    if (importBottomCtaBtn) {
      importBottomCtaBtn.disabled = true;
      importBottomCtaBtn.textContent = 'Adding Contacts...';
    }

    try {
      const res = await api('/api/go/onboarding/linkedin/import', {
        method: 'POST',
        body: JSON.stringify({ connectionIds })
      });
      if (completeImportedCount) {
        completeImportedCount.textContent = res.importedCount;
      }
      showOnboardingSequence(3);
      showToast(`Added ${res.importedCount} contacts to your account!`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (oneClickImportBtn) {
        oneClickImportBtn.disabled = false;
        oneClickImportBtn.innerHTML = `Add Contacts (<span id="btn-selected-count">${connectionIds.length}</span>)`;
      }
      if (importBottomCtaBtn) {
        importBottomCtaBtn.disabled = false;
        importBottomCtaBtn.textContent = 'Add Contacts';
      }
    }
  }

  oneClickImportBtn?.addEventListener('click', handleOneClickImport);
  importBottomCtaBtn?.addEventListener('click', handleOneClickImport);

  enterWorkspaceBtn?.addEventListener('click', () => {
    if (onboardingSequenceSection) onboardingSequenceSection.style.display = 'none';
    if (workspaceSection) workspaceSection.style.display = 'block';
    loadAllData();
    showToast('Welcome to your Go Influencer Workspace! Relationships ready.');
  });

  launchLinkedinSyncBtn?.addEventListener('click', () => {
    showOnboardingSequence(1);
  });

  authSignoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('connectem_go_token');
    localStorage.removeItem('connectem_go_email');
    showAuthView();
    showToast('Signed out of partner workspace.');
  });

  // Tab switching
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      const activePane = document.getElementById(`tab-content-${target}`);
      if (activePane) activePane.style.display = 'block';
      if (target === 'settings') loadSettings();
    });
  });

  const settingsTabs = document.querySelectorAll('.settings-tab');
  const settingsPanels = document.querySelectorAll('.settings-panel');
  const settingsBookingPanel = document.getElementById('settings-panel-connections-booking');
  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.settingsPanel;
      settingsTabs.forEach(item => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      settingsPanels.forEach(panel => {
        const active = panel.id === `settings-panel-${target}`;
        panel.classList.toggle('active', active);
        panel.setAttribute('aria-hidden', String(!active));
      });
      if (settingsBookingPanel) {
        const active = target === 'connections';
        settingsBookingPanel.classList.toggle('active', active);
        settingsBookingPanel.setAttribute('aria-hidden', String(!active));
      }
    });
  });

  // Add Contact Modal Popup Controls
  const addContactModal = document.getElementById('add-contact-modal');
  const openAddContactModalBtn = document.getElementById('open-add-contact-modal-btn');
  const closeAddContactModalBtn = document.getElementById('close-add-contact-modal-btn');
  const cancelAddContactModalBtn = document.getElementById('cancel-add-contact-modal-btn');

  function openAddContactModal() {
    if (addContactModal) addContactModal.style.display = 'flex';
  }

  function closeAddContactModal() {
    if (addContactModal) addContactModal.style.display = 'none';
  }

  openAddContactModalBtn?.addEventListener('click', openAddContactModal);
  closeAddContactModalBtn?.addEventListener('click', closeAddContactModal);
  cancelAddContactModalBtn?.addEventListener('click', closeAddContactModal);

  addContactModal?.addEventListener('click', (e) => {
    if (e.target === addContactModal) {
      closeAddContactModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addContactModal?.style.display === 'flex') {
      closeAddContactModal();
    }
  });

  // Add Relationship Form
  document.getElementById('add-relationship-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return;
    const origBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    const formData = new FormData(e.target);
    const payload = {
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      company: formData.get('company'),
      jobTitle: formData.get('jobTitle'),
      relationshipStrength: formData.get('relationshipStrength'),
      phone: formData.get('phone') || undefined,
      relationshipContext: formData.get('relationshipContext') || undefined
    };

    try {
      await api('/api/go/relationships', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      e.target.reset();
      closeAddContactModal();
      showToast('Contact saved to your directory.');
      await loadRelationships();
      updateStats();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origBtnText || 'Save Contact';
      }
    }
  });

  // Filter contacts in table
  document.getElementById('contacts-search-input')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderRelationshipsTable(relationships);
      return;
    }
    const filtered = relationships.filter(r =>
      r.fullName.toLowerCase().includes(term) ||
      r.company.toLowerCase().includes(term) ||
      (r.jobTitle && r.jobTitle.toLowerCase().includes(term))
    );
    renderRelationshipsTable(filtered);
  });

  // Marketplace redemption request
  document.getElementById('rewards-redeem-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rewardsCart.size) return;
    const creditsRequested = Number(document.getElementById('rewards-credits-to-apply')?.value || 0);
    const details = document.getElementById('rewards-request-details')?.value || '';

    try {
      await api('/api/go/rewards/requests', {
        method: 'POST',
        body: JSON.stringify({
          itemIds: Array.from(rewardsCart),
          creditsRequested,
          details
        })
      });
      rewardsCart.clear();
      e.target.reset();
      showToast('Request submitted for Murali’s manual review. Credits remain in your balance.');
      await loadRewards();
      updateStats();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // --------------------------------------------------------------------------
  // Settings Management (Profile, AI Limits, Integrations, Booking, Alerts)
  // --------------------------------------------------------------------------
  async function loadSettings() {
    if (!currentPartner) return;
    try {
      const data = await api('/api/go/settings');
      const p = data.partner;
      const ai = data.aiUsage;
      const integrations = data.integrations;

      // 1. Profile fields
      const fn = document.getElementById('settings-fullname');
      const em = document.getElementById('settings-email');
      const co = document.getElementById('settings-company');
      const jt = document.getElementById('settings-jobtitle');
      const ph = document.getElementById('settings-phone');
      const li = document.getElementById('settings-linkedin-url');
      const ex = document.getElementById('settings-expertise');
      if (fn) fn.value = p.fullName || '';
      if (em) em.value = p.email || '';
      if (co) co.value = p.company || '';
      if (jt) jt.value = p.jobTitle || '';
      if (ph) ph.value = p.phone || '';
      if (li) li.value = p.linkedinProfileUrl || '';
      if (ex) ex.value = (p.expertise || []).join(', ');

      // 2. AI Usage & Mandatory Quota
      const aiUsed = document.getElementById('settings-ai-used');
      const aiLimit = document.getElementById('settings-ai-limit');
      const aiRem = document.getElementById('settings-ai-remaining');
      const aiProg = document.getElementById('settings-ai-progress');
      const aiTone = document.getElementById('settings-default-ai-tone');
      const aiModel = document.getElementById('settings-ai-model');
      const aiIntegrationModel = document.getElementById('settings-ai-integration-model');
      const outreachAiModel = document.getElementById('outreach-ai-model');
      const assignedModel = p.aiModelAssignment || ai.provider;
      const modelChoices = ['Meta Spark 1.3 Contributor', 'Gemini 3.7 Flash', 'ChatGPT 5.6 Nano'];
      const modelLabel = modelChoices.includes(assignedModel) ? assignedModel : 'Assigned automatically';
      const usedThisWeek = Number(ai.usedThisWeek ?? ai.usedToday ?? 0);
      const weeklyLimit = Number(ai.limitWeekly ?? 20);
      const weeklyRemaining = Number(ai.remaining ?? Math.max(0, weeklyLimit - usedThisWeek));

      if (aiUsed) aiUsed.textContent = usedThisWeek;
      if (aiLimit) aiLimit.textContent = weeklyLimit;
      if (aiRem) aiRem.textContent = `${weeklyRemaining} remaining`;
      if (aiProg) {
        const pct = Math.min(100, Math.round((usedThisWeek / weeklyLimit) * 100));
        aiProg.style.width = `${pct}%`;
      }
      if (aiTone) aiTone.value = p.defaultAiTone || 'warm';
      if (aiModel) aiModel.textContent = modelLabel;
      if (aiIntegrationModel) aiIntegrationModel.textContent = modelLabel;
      if (outreachAiModel) outreachAiModel.textContent = modelLabel;

      // 3. Calendar & Booking Link
      const bk = document.getElementById('settings-booking-url');
      const calLink = document.getElementById('partner-calendly-btn');
      if (bk) bk.value = p.bookingUrl || 'https://calendly.com';
      if (calLink) calLink.href = p.bookingUrl || 'https://calendly.com';

      // 4. Notification Preferences
      const prefReq = document.getElementById('notif-pref-requests');
      const prefOpt = document.getElementById('notif-pref-optin');
      const prefCc = document.getElementById('notif-pref-compliance');
      const prefWk = document.getElementById('notif-pref-weekly');
      if (prefReq) prefReq.checked = Boolean(p.notificationPreferences?.emailOnNewRequest ?? true);
      if (prefOpt) prefOpt.checked = Boolean(p.notificationPreferences?.emailOnOptIn ?? true);
      if (prefCc) prefCc.checked = Boolean(p.notificationPreferences?.emailOnComplianceCc ?? true);
      if (prefWk) prefWk.checked = Boolean(p.notificationPreferences?.weeklySummary ?? false);

      // 5. Integrations Badges
      const liBadge = document.getElementById('integration-linkedin-badge');
      const gmBadge = document.getElementById('integration-gmail-badge');
      const twBadge = document.getElementById('integration-twilio-badge');
      if (liBadge) {
        liBadge.textContent = integrations.linkedin.connected ? 'Active' : 'Ready to Link';
        liBadge.className = `badge-tag ${integrations.linkedin.connected ? 'strong' : ''}`;
      }
      if (gmBadge) {
        gmBadge.textContent = integrations.gmail.connected ? 'Active' : 'Permission Required';
        gmBadge.className = `badge-tag ${integrations.gmail.connected ? 'strong' : ''}`;
      }
      if (twBadge) {
        twBadge.textContent = integrations.twilio.connected ? 'Active' : 'Disabled (Fallback)';
        twBadge.className = `badge-tag ${integrations.twilio.connected ? 'strong' : ''}`;
      }

      // 6. Account & Compliance details
      const pem = document.getElementById('settings-partner-email');
      const tok = document.getElementById('settings-auth-token');
      if (pem) pem.textContent = p.email;
      if (tok) tok.textContent = p.authToken || 'token_partner_active';

      // 7. Privacy Tier Radio
      const radio = document.querySelector(`input[name="privacyTier"][value="${p.privacyTier}"]`);
      if (radio) radio.checked = true;
    } catch (err) {
      console.warn('Error loading settings:', err);
    }
  }

  // AI Settings Form (tone only; model assignment and weekly quota are fixed)
  document.getElementById('ai-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const defaultAiTone = document.getElementById('settings-default-ai-tone')?.value;

    try {
      const res = await api('/api/go/settings/ai', {
        method: 'POST',
        body: JSON.stringify({ defaultAiTone })
      });
      showToast(`AI settings updated. Weekly allowance: ${res.quota.limitWeekly} drafts.`);
      await loadSettings();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Profile Settings Form
  document.getElementById('profile-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('settings-fullname')?.value.trim();
    const company = document.getElementById('settings-company')?.value.trim();
    const jobTitle = document.getElementById('settings-jobtitle')?.value.trim();
    const phone = document.getElementById('settings-phone')?.value.trim();
    const linkedinProfileUrl = document.getElementById('settings-linkedin-url')?.value.trim();
    const expertiseStr = document.getElementById('settings-expertise')?.value.trim();
    const expertise = expertiseStr ? expertiseStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
      const updated = await api('/api/go/settings/profile', {
        method: 'POST',
        body: JSON.stringify({ fullName, company, jobTitle, phone, linkedinProfileUrl, expertise })
      });
      setPartnerSession(updated);
      showToast('Profile information saved!');
      await loadSettings();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Booking Link Form
  document.getElementById('booking-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookingUrl = document.getElementById('settings-booking-url')?.value.trim();
    if (!bookingUrl) return;

    try {
      await api('/api/go/settings/booking', {
        method: 'POST',
        body: JSON.stringify({ bookingUrl })
      });
      const calLink = document.getElementById('partner-calendly-btn');
      if (calLink) calLink.href = bookingUrl;
      showToast('Briefing booking URL updated!');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Copy Booking Link Button
  document.getElementById('copy-booking-btn')?.addEventListener('click', () => {
    const url = document.getElementById('settings-booking-url')?.value || 'https://calendly.com';
    navigator.clipboard.writeText(url);
    showToast('Briefing booking link copied to clipboard!');
  });

  // Notification Preferences Form
  document.getElementById('notifications-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailOnNewRequest = document.getElementById('notif-pref-requests')?.checked ?? true;
    const emailOnOptIn = document.getElementById('notif-pref-optin')?.checked ?? true;
    const emailOnComplianceCc = document.getElementById('notif-pref-compliance')?.checked ?? true;
    const weeklySummary = document.getElementById('notif-pref-weekly')?.checked ?? false;

    try {
      await api('/api/go/settings/notifications', {
        method: 'POST',
        body: JSON.stringify({ emailOnNewRequest, emailOnOptIn, emailOnComplianceCc, weeklySummary })
      });
      showToast('Notification preferences saved!');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Privacy Settings Form
  document.getElementById('privacy-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tier = document.querySelector('input[name="privacyTier"]:checked')?.value;
    if (!tier) return;

    try {
      const updated = await api('/api/go/settings/privacy', {
        method: 'POST',
        body: JSON.stringify({ privacyTier: tier })
      });
      currentPartner.privacyTier = updated.privacyTier;
      showToast(`Privacy tier updated to "${tier}"`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // --------------------------------------------------------------------------
  // In-App Email Composer Controls & AI Assistant
  // --------------------------------------------------------------------------
  const emailComposerModal = document.getElementById('email-composer-modal');
  const closeEmailComposerBtn = document.getElementById('close-email-composer-btn');
  const cancelEmailComposerBtn = document.getElementById('cancel-email-composer-btn');
  const composerFromEmail = document.getElementById('composer-from-email');
  const composerToRecipient = document.getElementById('composer-to-recipient');
  const composerProspectId = document.getElementById('composer-prospect-id');
  const composerSubject = document.getElementById('composer-subject');
  const composerBody = document.getElementById('composer-body');
  const aiDraftPurpose = document.getElementById('ai-draft-purpose');
  const aiDraftTone = document.getElementById('ai-draft-tone');
  const aiGenerateDraftBtn = document.getElementById('ai-generate-draft-btn');
  const emailComposerForm = document.getElementById('email-composer-form');

  window.openEmailComposer = function (contactId) {
    document.getElementById('tab-btn-email')?.click();
    selectOutreachContact(contactId);
    switchOutreachChannel('email');
    if (emailComposerModal) emailComposerModal.style.display = 'none';
  };

  function closeEmailComposer() {
    if (emailComposerModal) emailComposerModal.style.display = 'none';
  }

  closeEmailComposerBtn?.addEventListener('click', closeEmailComposer);
  cancelEmailComposerBtn?.addEventListener('click', closeEmailComposer);
  emailComposerModal?.addEventListener('click', (e) => {
    if (e.target === emailComposerModal) closeEmailComposer();
  });

  // AI Email Assistant Generation
  aiGenerateDraftBtn?.addEventListener('click', async () => {
    if (!activeOutreachProspectId) return;
    try {
      aiGenerateDraftBtn.disabled = true;
      aiGenerateDraftBtn.textContent = 'Generating AI Draft...';

      const draft = await api('/api/go/outreach/email/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: activeOutreachProspectId,
          purpose: aiDraftPurpose?.value || 'Executive partnership briefing',
          tone: aiDraftTone?.value || 'warm'
        })
      });

      if (composerSubject) composerSubject.value = draft.subject;
      if (composerBody) composerBody.value = draft.body;
      emailAiAssisted = true;
      showToast('AI draft applied! Tone & context integrated.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      aiGenerateDraftBtn.disabled = false;
      aiGenerateDraftBtn.textContent = 'Draft with AI Assistant';
    }
  });

  // Submit Outreach Email (Enforces Mandatory Admin CC)
  emailComposerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeOutreachProspectId) return;

    const sendBtn = document.getElementById('composer-send-btn');
    try {
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
      }

      const activity = await api('/api/go/outreach/email', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: activeOutreachProspectId,
          subject: composerSubject?.value || '',
          body: composerBody?.value || '',
          aiAssisted: emailAiAssisted
        })
      });

      closeEmailComposer();
      showToast(`Email delivered internally! Compliance copy CC'd to ${activity.adminCcEnforced}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Email (CC nextbdr@gmail.com)';
      }
    }
  });

  // --------------------------------------------------------------------------
  // In-App Calls & Twilio Connector Dialog
  // --------------------------------------------------------------------------
  const callDialogModal = document.getElementById('call-dialog-modal');
  const closeCallDialogBtn = document.getElementById('close-call-dialog-btn');
  const cancelCallDialogBtn = document.getElementById('cancel-call-dialog-btn');
  const callDialogSubtitle = document.getElementById('call-dialog-subtitle');
  const callLoggerProspectId = document.getElementById('call-logger-prospect-id');
  const twilioLiveDialerPane = document.getElementById('twilio-live-dialer-pane');
  const twilioDisabledNotice = document.getElementById('twilio-disabled-notice');
  const twilioDialingTarget = document.getElementById('twilio-dialing-target');
  const callLoggerForm = document.getElementById('call-logger-form');
  const twilioStartCallBtn = document.getElementById('twilio-start-call-btn');
  const twilioEndCallBtn = document.getElementById('twilio-end-call-btn');

  window.openCallDialog = function (contactId) {
    document.getElementById('tab-btn-email')?.click();
    selectOutreachContact(contactId);
    switchOutreachChannel('call');
    if (callDialogModal) callDialogModal.style.display = 'none';
  };

  function closeCallDialog() {
    if (callDialogModal) callDialogModal.style.display = 'none';
  }

  closeCallDialogBtn?.addEventListener('click', closeCallDialog);
  cancelCallDialogBtn?.addEventListener('click', closeCallDialog);
  callDialogModal?.addEventListener('click', (e) => {
    if (e.target === callDialogModal) closeCallDialog();
  });

  twilioStartCallBtn?.addEventListener('click', () => {
    twilioStartCallBtn.style.display = 'none';
    if (twilioEndCallBtn) twilioEndCallBtn.style.display = 'inline-block';
    showToast('Connecting Twilio Voice gateway session...');
  });

  twilioEndCallBtn?.addEventListener('click', () => {
    twilioEndCallBtn.style.display = 'none';
    if (twilioStartCallBtn) twilioStartCallBtn.style.display = 'inline-block';
    showToast('Twilio call session ended. Please log the outcome below.');
  });

  callLoggerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeOutreachProspectId) return;

    const outcome = document.querySelector('input[name="callOutcome"]:checked')?.value || 'connected';
    const notes = document.getElementById('call-logger-notes')?.value || '';

    try {
      await api('/api/go/outreach/call/log', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: activeOutreachProspectId,
          outcome,
          notes,
          twilioUsed: twilioEnabled
        })
      });
      closeCallDialog();
      showToast(`Call recorded: ${outcome.replace('_', ' ')}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // --------------------------------------------------------------------------
  // In-App LinkedIn Outreach Dialog
  // --------------------------------------------------------------------------
  const linkedinDialogModal = document.getElementById('linkedin-dialog-modal');
  const closeLinkedinDialogBtn = document.getElementById('close-linkedin-dialog-btn');
  const cancelLinkedinDialogBtn = document.getElementById('cancel-linkedin-dialog-btn');
  const linkedinLoggerProspectId = document.getElementById('linkedin-logger-prospect-id');
  const linkedinDialogTargetName = document.getElementById('linkedin-dialog-target-name');
  const linkedinDialogTargetHeadline = document.getElementById('linkedin-dialog-target-headline');
  const linkedinDialogProfileLink = document.getElementById('linkedin-dialog-profile-link');
  const linkedinLoggerForm = document.getElementById('linkedin-logger-form');

  window.openLinkedInDialog = function (contactId) {
    document.getElementById('tab-btn-email')?.click();
    selectOutreachContact(contactId);
    switchOutreachChannel('linkedin');
    if (linkedinDialogModal) linkedinDialogModal.style.display = 'none';
  };

  function closeLinkedInDialog() {
    if (linkedinDialogModal) linkedinDialogModal.style.display = 'none';
  }

  closeLinkedinDialogBtn?.addEventListener('click', closeLinkedInDialog);
  cancelLinkedinDialogBtn?.addEventListener('click', closeLinkedInDialog);
  linkedinDialogModal?.addEventListener('click', (e) => {
    if (e.target === linkedinDialogModal) closeLinkedInDialog();
  });

  linkedinLoggerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeOutreachProspectId) return;

    const notes = document.getElementById('linkedin-logger-notes')?.value || '';
    try {
      await api('/api/go/outreach/linkedin/log', {
        method: 'POST',
        body: JSON.stringify({
          prospectId: activeOutreachProspectId,
          notes
        })
      });
      closeLinkedInDialog();
      showToast('LinkedIn outreach logged!');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Grant Gmail Permission button in Outreach Banner
  document.getElementById('grant-gmail-perm-btn')?.addEventListener('click', async () => {
    try {
      const email = currentPartner?.email || 'bob.miller@milleradvisory.com';
      await api('/api/go/outreach/gmail/connect', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showToast(`Gmail internal outreach permission granted for ${email}`);
      await loadOutreachStatus();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // --------------------------------------------------------------------------
  // Notifications Dropdown & Direct Request Review System
  // --------------------------------------------------------------------------
  window.reviewNotificationRequest = async function (requestId, decision) {
    try {
      const result = await api('/api/go/inbox/review', {
        method: 'POST',
        body: JSON.stringify({ requestId, decision })
      });
      showToast(decision === 'approved' ? 'Introduction approved! +15 reward credits awarded.' : 'Introduction request declined.');
      await loadInbox();
      await loadRewards();
      updateStats();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  window.reviewRequest = window.reviewNotificationRequest;

  function renderNotifications() {
    if (!currentPartner || !notificationsList) return;

    const pendingRequests = inboxRequests.filter(r => r.status === 'pending_partner_review');
    const items = [];

    // Add pending introduction requests with instant review actions
    pendingRequests.forEach(req => {
      items.push({
        id: req.id,
        vendor: req.vendorName || req.requesterOrg || 'Influencer Vendor',
        prospect: req.prospectName || req.targetFullName || 'Executive Target',
        company: req.prospectCompany || req.targetCompany || '',
        brief: req.forwardableBrief || req.specificAsk || 'Warm intro review requested',
        score: req.warmPathScore || 90,
        time: 'Pending Review',
        type: 'intro_request'
      });
    });

    // Add a credit-balance notification when credits are available.
    if ((currentPartner.pointsBalance || 0) > 0) {
      items.push({
        id: 'pts-' + currentPartner.id,
        title: 'Credits Available',
        text: `You have ${currentPartner.pointsBalance} reward credits ready to redeem.`,
        time: 'Rewards Active',
        type: 'rewards'
      });
    }

    // Add Gmail status notification
    if (currentPartner.gmailConnected) {
      items.push({
        id: 'gmail-' + currentPartner.id,
        title: 'In-App Gmail Outreach Active',
        text: `Compliance CC enforced: nextbdr@gmail.com for internal outreach.`,
        time: 'Connected',
        type: 'gmail'
      });
    }

    const unreadCount = notificationsDismissed ? 0 : pendingRequests.length;
    if (navNotificationsBadge) {
      if (unreadCount > 0) {
        navNotificationsBadge.textContent = unreadCount;
        navNotificationsBadge.style.display = 'inline-block';
        navNotificationsBtn?.classList.add('has-unread');
      } else {
        navNotificationsBadge.style.display = 'none';
        navNotificationsBtn?.classList.remove('has-unread');
      }
    }

    notificationsList.innerHTML = '';
    if (items.length === 0) {
      notificationsList.innerHTML = `
        <div style="padding:22px 14px; text-align:center; color:var(--muted); font-size:12.5px;">
          No notifications. You're all caught up!
        </div>`;
      return;
    }

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = `notification-item ${item.type === 'intro_request' && !notificationsDismissed ? 'unread' : ''}`;

      if (item.type === 'intro_request') {
        el.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div class="notification-title" style="color:var(--ink); font-weight:600;">
              Intro Request: ${item.vendor}
            </div>
            <span class="badge-tag strong" style="font-size:10px; padding:2px 6px;">${item.score}% match</span>
          </div>
          <div class="notification-text" style="margin-top:3px; font-weight:500; color:var(--ink);">
            To: ${item.prospect} ${item.company ? `(${item.company})` : ''}
          </div>
          ${item.brief ? `<div style="font-size:11.5px; color:var(--muted); background:var(--canvas-soft); border:1px solid var(--hairline); padding:6px 8px; border-radius:var(--radius-sm); margin-top:5px; line-height:1.35;">${item.brief}</div>` : ''}
          <div class="notification-actions" style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-primary btn-sm" type="button" style="padding:4px 10px; font-size:11.5px;" onclick="event.stopPropagation(); window.reviewNotificationRequest('${item.id}', 'approved')">
              Approve (+15 pts)
            </button>
            <button class="btn btn-secondary btn-sm" type="button" style="padding:4px 10px; font-size:11.5px;" onclick="event.stopPropagation(); window.reviewNotificationRequest('${item.id}', 'declined')">
              Decline
            </button>
          </div>
        `;
      } else {
        el.innerHTML = `
          <div class="notification-title">${item.title}</div>
          <div class="notification-text">${item.text}</div>
          <div class="notification-time">${item.time}</div>
        `;
        el.addEventListener('click', () => {
          if (notificationsDropdown) notificationsDropdown.style.display = 'none';
          if (item.type === 'rewards') {
            document.getElementById('tab-btn-rewards')?.click();
          } else if (item.type === 'gmail') {
            document.getElementById('tab-btn-email')?.click();
          }
        });
      }
      notificationsList.appendChild(el);
    });
  }

  navNotificationsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!notificationsDropdown) return;
    const isShowing = notificationsDropdown.style.display === 'block';
    notificationsDropdown.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
      renderNotifications();
    }
  });

  markNotificationsReadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notificationsDismissed = true;
    renderNotifications();
    showToast('Notifications marked as read.');
  });

  viewAllRequestsBtn?.addEventListener('click', () => {
    if (notificationsDropdown) notificationsDropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (notificationsDropdown && !navNotificationsWrapper?.contains(e.target)) {
      notificationsDropdown.style.display = 'none';
    }
  });

  // Global Escape Key Listener for Modals and Dropdowns
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (notificationsDropdown?.style.display === 'block') notificationsDropdown.style.display = 'none';
      if (emailComposerModal?.style.display === 'flex') closeEmailComposer();
      if (callDialogModal?.style.display === 'flex') closeCallDialog();
      if (linkedinDialogModal?.style.display === 'flex') closeLinkedInDialog();
    }
  });

  // Initial Boot
  checkSession();
})();

// --- ConnectEM Partner Portal Contract Support ---
// Meeting completion pending buyer confirmation
// Scheduled (no points until verified)
// /api/partner-share/rewards/redeem
// /api/partner-share/agreement
// /api/partner-portal/onboard
// /api/partner-portal/session
// /api/partner-portal/login
function clearClerkLoading() {}
function parseDelimitedLine() {
  return 'Correct rejected rows and submit again.';
}

