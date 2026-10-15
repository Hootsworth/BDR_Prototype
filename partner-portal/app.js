/**
 * CONNECTEM PARTNER PORTAL · FULL-SCREEN INTRODUCTION & SCHEDULING WORKSPACE
 * Pure Modern JS · Clean State Management · Uncluttered UX · 100% SVG Icons
 */

(() => {
  'use strict';

  const STORAGE_KEY_USER = 'connectem_partner_v3_user';
  const STORAGE_KEY_DATA = 'connectem_partner_v3_data';
  const API_BASE = window.PARTNER_API_BASE || (window.location.origin.includes('localhost') ? '' : 'https://connectem.ai');

  // Application State
  const state = {
    user: null,
    intros: [],
    statement: [],
    agreement: {
      signed: true,
      signedBy: 'Jordan Vance',
      signedAt: 'Oct 15, 2026',
      hash: '#IRM-88214-VERIFIED'
    },
    points: 1200
  };

  // DOM Elements Cache
  const el = {
    // Nav & Theme
    themeToggle: document.getElementById('btn-theme-toggle'),
    signoutBtn: document.getElementById('btn-signout'),
    navBalancePill: document.getElementById('nav-balance-pill'),
    navPointsVal: document.getElementById('nav-points-val'),

    // Views
    viewAuth: document.getElementById('view-auth'),
    viewWorkspace: document.getElementById('view-workspace'),
    viewFullscreenIntro: document.getElementById('view-fullscreen-intro'),

    // Auth Forms & Tabs
    tabAuthSignin: document.getElementById('tab-auth-signin'),
    tabAuthSignup: document.getElementById('tab-auth-signup'),
    formSignin: document.getElementById('form-signin'),
    formSignup: document.getElementById('form-signup'),
    btnQuickDemo: document.getElementById('btn-quick-demo'),
    authFeedback: document.getElementById('auth-feedback'),

    // Workspace Hero & Header
    userFirstName: document.getElementById('user-first-name'),
    userSubtext: document.getElementById('user-subtext'),
    linkCalendly: document.getElementById('link-calendly-intro'),
    btnOpenAddFullscreen: document.getElementById('btn-open-add-fullscreen'),

    // KPIs
    kpiTotal: document.getElementById('kpi-total'),
    kpiScheduled: document.getElementById('kpi-scheduled'),
    kpiVerified: document.getElementById('kpi-verified'),
    kpiPoints: document.getElementById('kpi-points'),
    kpiCashEst: document.getElementById('kpi-cash-est'),

    // Subtabs
    tabSubIntros: document.getElementById('tab-sub-intros'),
    tabSubEarnings: document.getElementById('tab-sub-earnings'),
    tabSubAgreement: document.getElementById('tab-sub-agreement'),
    tabIntrosCount: document.getElementById('tab-intros-count'),

    panelSubIntros: document.getElementById('subtab-panel-intros'),
    panelSubEarnings: document.getElementById('subtab-panel-earnings'),
    panelSubAgreement: document.getElementById('subtab-panel-agreement'),

    // Introductions Roster
    searchIntros: document.getElementById('search-intros'),
    filterIntroStatus: document.getElementById('filter-intro-status'),
    btnOpenBulkModal: document.getElementById('btn-open-bulk-modal'),
    introsContainer: document.getElementById('intros-container'),

    // Full-Screen Workspace Elements
    btnCloseFullscreen: document.getElementById('btn-close-fullscreen'),
    btnSubmitIntroFullscreen: document.getElementById('btn-submit-intro-fullscreen'),
    fsName: document.getElementById('fs-name'),
    fsCompany: document.getElementById('fs-company'),
    fsTitle: document.getElementById('fs-title'),
    fsSeniority: document.getElementById('fs-seniority'),
    fsEmail: document.getElementById('fs-email'),
    fsPhone: document.getElementById('fs-phone'),
    fsLinkedin: document.getElementById('fs-linkedin'),
    fsLocation: document.getElementById('fs-location'),
    fsWarmth: document.getElementById('fs-warmth'),
    fsStrength: document.getElementById('fs-strength'),
    fsHistory: document.getElementById('fs-history'),
    fsEvalRole: document.getElementById('fs-eval-role'),
    fsBudget: document.getElementById('fs-budget'),
    fsContext: document.getElementById('fs-context'),
    fsMeetingDate: document.getElementById('fs-meeting-date'),
    fsMeetingTime: document.getElementById('fs-meeting-time'),
    fsMeetingDuration: document.getElementById('fs-meeting-duration'),
    fsMeetingPlatform: document.getElementById('fs-meeting-platform'),
    fsPartnerAttendance: document.getElementById('fs-partner-attendance'),
    fsBriefing: document.getElementById('fs-briefing'),
    fsConsent: document.getElementById('fs-consent'),

    // Earnings Tab
    earningsCardBalance: document.getElementById('earnings-card-balance'),
    earningsCardUsd: document.getElementById('earnings-card-usd'),
    btnOpenPayoutModal: document.getElementById('btn-open-payout-modal'),
    statementRowsContainer: document.getElementById('statement-rows-container'),

    // Agreement Tab
    agreementPillBadge: document.getElementById('agreement-pill-badge'),
    agreementMetaSigner: document.getElementById('agreement-meta-signer'),
    agreementMetaDate: document.getElementById('agreement-meta-date'),
    agreementMetaHash: document.getElementById('agreement-meta-hash'),
    btnReReadAgreement: document.getElementById('btn-re-read-agreement'),

    // Modals
    modalBulkCsv: document.getElementById('modal-bulk-csv'),
    bulkPasteText: document.getElementById('bulk-paste-text'),
    btnConfirmBulk: document.getElementById('btn-confirm-bulk'),

    modalAgreement: document.getElementById('modal-agreement'),
    agreementSignerField: document.getElementById('agreement-signer-field'),
    btnConfirmSignTerms: document.getElementById('btn-confirm-sign-terms'),

    modalPayout: document.getElementById('modal-payout'),
    payoutModalBalance: document.getElementById('payout-modal-balance'),
    payoutAmountInput: document.getElementById('payout-amount-input'),
    payoutMethodSelect: document.getElementById('payout-method-select'),
    payoutDetailsText: document.getElementById('payout-details-text'),
    btnConfirmPayout: document.getElementById('btn-confirm-payout'),

    // Toast
    toastNotice: document.getElementById('toast-notice')
  };

  // Utilities
  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function showToast(message) {
    if (!el.toastNotice) return;
    el.toastNotice.textContent = message;
    el.toastNotice.style.display = 'block';
    setTimeout(() => {
      el.toastNotice.style.display = 'none';
    }, 3200);
  }

  function openModal(modalEl) {
    if (modalEl) modalEl.style.display = 'flex';
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
  }

  // Full-Screen Workspace Controls
  function openFullscreenIntroWorkspace() {
    // Set default proposed meeting date to tomorrow
    if (el.fsMeetingDate && !el.fsMeetingDate.value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      el.fsMeetingDate.value = tomorrow.toISOString().split('T')[0];
    }
    if (el.viewFullscreenIntro) {
      el.viewFullscreenIntro.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function closeFullscreenIntroWorkspace() {
    if (el.viewFullscreenIntro) {
      el.viewFullscreenIntro.style.display = 'none';
    }
  }

  // Local Storage Persistence
  function saveState() {
    if (!state.user) return;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(state.user));
    localStorage.setItem(`${STORAGE_KEY_DATA}_${state.user.email}`, JSON.stringify({
      intros: state.intros,
      statement: state.statement,
      agreement: state.agreement,
      points: state.points
    }));
  }

  function loadState() {
    try {
      const rawUser = localStorage.getItem(STORAGE_KEY_USER);
      if (!rawUser) return false;
      state.user = JSON.parse(rawUser);
      const rawData = localStorage.getItem(`${STORAGE_KEY_DATA}_${state.user.email}`);
      if (rawData) {
        const d = JSON.parse(rawData);
        state.intros = d.intros || [];
        state.statement = d.statement || [];
        state.agreement = d.agreement || state.agreement;
        state.points = d.points !== undefined ? d.points : state.points;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem('partner_theme_v3') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (el.themeToggle) {
      el.themeToggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('partner_theme_v3', next);
      });
    }
  }

  // Update UI Stats & Headers
  function updateUI() {
    const total = state.intros.length;
    const scheduled = state.intros.filter(i => ['Call Scheduled', 'Meeting Verified', 'Opportunity', 'Customer Closed'].includes(i.status)).length;
    const verified = state.intros.filter(i => ['Meeting Verified', 'Opportunity', 'Customer Closed'].includes(i.status)).length;
    const cashEst = (state.points * 0.1).toFixed(2);

    // Header pills
    if (el.navPointsVal) el.navPointsVal.textContent = state.points.toLocaleString();
    if (el.tabIntrosCount) el.tabIntrosCount.textContent = total;

    // Stats Strip
    if (el.kpiTotal) el.kpiTotal.textContent = total;
    if (el.kpiScheduled) el.kpiScheduled.textContent = scheduled;
    if (el.kpiVerified) el.kpiVerified.textContent = verified;
    if (el.kpiPoints) el.kpiPoints.textContent = state.points.toLocaleString();
    if (el.kpiCashEst) el.kpiCashEst.textContent = `≈ $${cashEst} USD`;

    // Earnings Card
    if (el.earningsCardBalance) el.earningsCardBalance.textContent = `${state.points.toLocaleString()} pts`;
    if (el.earningsCardUsd) el.earningsCardUsd.textContent = `Estimated Cash Value: $${cashEst} USD`;
    if (el.payoutModalBalance) el.payoutModalBalance.textContent = `${state.points.toLocaleString()} pts`;

    // Agreement Meta
    if (el.agreementMetaSigner) el.agreementMetaSigner.textContent = state.agreement.signedBy || 'Jordan Vance';
    if (el.agreementMetaDate) el.agreementMetaDate.textContent = state.agreement.signedAt || 'Oct 15, 2026';
    if (el.agreementMetaHash) el.agreementMetaHash.textContent = state.agreement.hash || '#IRM-88214-VERIFIED';
  }

  // Render Introductions Cards List
  function renderIntros() {
    if (!el.introsContainer) return;
    const query = (el.searchIntros ? el.searchIntros.value : '').trim().toLowerCase();
    const filter = el.filterIntroStatus ? el.filterIntroStatus.value : 'ALL';

    const filtered = state.intros.filter(item => {
      const matchQuery = !query || 
        item.name.toLowerCase().includes(query) ||
        item.company.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query);
      const matchStatus = filter === 'ALL' || item.status === filter;
      return matchQuery && matchStatus;
    });

    if (filtered.length === 0) {
      el.introsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">
            ${state.intros.length === 0 ? 'No introductions submitted yet' : 'No matching introductions'}
          </div>
          <div class="empty-state-desc">
            ${state.intros.length === 0 
              ? 'Introduce target executive buyers from your trusted advisory network. You will earn +200 points on submission.' 
              : 'Try clearing your search term or switching the status filter.'}
          </div>
          ${state.intros.length === 0 ? `
            <button type="button" class="btn btn-primary" onclick="document.getElementById('btn-open-add-fullscreen').click()">
              <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" style="margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Submit First Introduction
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    el.introsContainer.innerHTML = filtered.map(intro => {
      const initial = (intro.name || 'C').charAt(0).toUpperCase();
      const hasMeeting = intro.meetingDate ? `<span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); display:block; margin-top:3px;">📅 Proposed: ${escapeHTML(intro.meetingDate)} at ${escapeHTML(intro.meetingTime || '14:00')}</span>` : '';
      return `
        <div class="intro-card" data-id="${intro.id}">
          <div class="intro-info-col">
            <div class="avatar-initial">${initial}</div>
            <div>
              <div class="intro-name">
                ${escapeHTML(intro.name)}
                ${intro.linkedin ? `<a href="${escapeHTML(intro.linkedin)}" target="_blank" rel="noopener" style="margin-left:6px; font-size:11px; color:var(--text-muted); text-decoration:none;" title="LinkedIn Profile">↗</a>` : ''}
              </div>
              <div class="intro-sub">${escapeHTML(intro.title ? `${intro.title} · ${intro.company}` : intro.company)}</div>
              ${hasMeeting}
            </div>
          </div>

          <div class="intro-meta-col">
            <span class="intro-email">${escapeHTML(intro.email)}</span>
            <span class="status-badge">${escapeHTML(intro.warmth || 'Warm Network')}</span>
          </div>

          <div class="intro-status-col">
            <select class="select-input intro-status-dropdown" style="height:32px; font-size:12px; font-family:var(--font-display); width:160px;" data-id="${intro.id}">
              <option value="Intro Submitted" ${intro.status === 'Intro Submitted' ? 'selected' : ''}>Intro Submitted</option>
              <option value="Call Scheduled" ${intro.status === 'Call Scheduled' ? 'selected' : ''}>Call Scheduled</option>
              <option value="Meeting Verified" ${intro.status === 'Meeting Verified' ? 'selected' : ''}>Meeting Verified (+600)</option>
              <option value="Opportunity" ${intro.status === 'Opportunity' ? 'selected' : ''}>Opportunity (+1,000)</option>
              <option value="Customer Closed" ${intro.status === 'Customer Closed' ? 'selected' : ''}>Customer Closed (+5,000)</option>
            </select>
            <span class="points-pill">+${intro.pointsAwarded || 200} pts</span>
            <button type="button" class="btn btn-subtle btn-sm btn-delete-card" data-id="${intro.id}" title="Remove introduction" style="padding:0 8px; color:var(--text-faint);">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    el.introsContainer.querySelectorAll('.intro-status-dropdown').forEach(sel => {
      sel.addEventListener('change', (e) => {
        updateIntroStatus(e.target.dataset.id, e.target.value);
      });
    });

    el.introsContainer.querySelectorAll('.btn-delete-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        deleteIntro(e.target.dataset.id);
      });
    });
  }

  // Render Statement History
  function renderStatement() {
    if (!el.statementRowsContainer) return;
    if (state.statement.length === 0) {
      el.statementRowsContainer.innerHTML = `
        <div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">
          No earnings activity recorded yet.
        </div>
      `;
      return;
    }

    el.statementRowsContainer.innerHTML = state.statement.slice().reverse().map(item => `
      <div class="statement-row">
        <div>
          <div style="font-weight: 600;">${escapeHTML(item.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${escapeHTML(item.date)} · ${escapeHTML(item.prospect)}</div>
        </div>
        <div style="font-family: var(--font-mono); font-weight: 700; ${item.amount > 0 ? 'color: var(--text);' : 'color: var(--text-muted);'}">
          ${item.amount > 0 ? `+${item.amount.toLocaleString()}` : item.amount.toLocaleString()} pts
        </div>
      </div>
    `).join('');
  }

  // Record Transaction
  function recordTransaction(title, prospect, amount) {
    state.statement.push({
      id: Date.now() + Math.random(),
      title,
      prospect,
      amount,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
    state.points = Math.max(0, state.points + amount);
    saveState();
    updateUI();
    renderStatement();
  }

  // Update Status & Award Milestone Points
  function updateIntroStatus(id, newStatus) {
    const intro = state.intros.find(i => String(i.id) === String(id));
    if (!intro || intro.status === newStatus) return;

    intro.status = newStatus;
    let added = 0;

    if (newStatus === 'Meeting Verified' && !intro.meetingAwarded) {
      added = 600;
      intro.meetingAwarded = true;
    } else if (newStatus === 'Opportunity' && !intro.oppAwarded) {
      added = 1000;
      intro.oppAwarded = true;
    } else if (newStatus === 'Customer Closed' && !intro.closedAwarded) {
      added = 5000;
      intro.closedAwarded = true;
    }

    if (added > 0) {
      intro.pointsAwarded = (intro.pointsAwarded || 200) + added;
      recordTransaction(`Milestone: ${newStatus}`, `${intro.name} (${intro.company})`, added);
      showToast(`Milestone verified! +${added} points added to your balance.`);
    }

    saveState();
    updateUI();
    renderIntros();
  }

  // Delete Intro
  function deleteIntro(id) {
    const intro = state.intros.find(i => String(i.id) === String(id));
    if (!intro) return;
    if (!confirm(`Remove introduction for ${intro.name}?`)) return;

    state.intros = state.intros.filter(i => String(i.id) !== String(id));
    saveState();
    updateUI();
    renderIntros();
    showToast('Introduction removed from your roster.');
  }

  // Subtab Navigation Switcher
  function switchSubtab(activeTabName) {
    const tabs = [
      { name: 'intros', btn: el.tabSubIntros, panel: el.panelSubIntros },
      { name: 'earnings', btn: el.tabSubEarnings, panel: el.panelSubEarnings },
      { name: 'agreement', btn: el.tabSubAgreement, panel: el.panelSubAgreement }
    ];

    tabs.forEach(t => {
      const isActive = t.name === activeTabName;
      if (t.btn) t.btn.classList.toggle('active', isActive);
      if (t.panel) t.panel.style.display = isActive ? 'block' : 'none';
    });
  }

  // Handle Full-Screen Introduction Submission
  function handleSubmitFullscreenIntro() {
    const name = el.fsName.value.trim();
    const company = el.fsCompany.value.trim();
    const title = el.fsTitle.value.trim();
    const email = el.fsEmail.value.trim();
    const seniority = el.fsSeniority.value;
    const phone = el.fsPhone.value.trim();
    const linkedin = el.fsLinkedin.value.trim();
    const location = el.fsLocation.value.trim();
    const warmth = el.fsWarmth.value;
    const strength = el.fsStrength.value;
    const history = el.fsHistory.value.trim();
    const evalRole = el.fsEvalRole.value;
    const budget = el.fsBudget.value;
    const context = el.fsContext.value.trim();
    const meetingDate = el.fsMeetingDate.value;
    const meetingTime = el.fsMeetingTime.value;
    const meetingDuration = el.fsMeetingDuration.value;
    const meetingPlatform = el.fsMeetingPlatform.value;
    const partnerAttendance = el.fsPartnerAttendance.value;
    const briefing = el.fsBriefing.value.trim();

    if (!name || !company || !title || !email) {
      alert('Please fill out the Executive Full Name, Company, Title, and Work Email.');
      return;
    }

    if (!el.fsConsent.checked) {
      alert('Please confirm that you have explicit permission from this executive to coordinate this introductory discussion.');
      return;
    }

    const hasScheduledCall = Boolean(meetingDate);

    const newIntro = {
      id: Date.now(),
      name,
      company,
      title,
      seniority,
      email,
      phone,
      linkedin,
      location,
      warmth,
      strength,
      history,
      evalRole,
      budget,
      context,
      meetingDate,
      meetingTime,
      meetingDuration,
      meetingPlatform,
      partnerAttendance,
      briefing,
      status: hasScheduledCall ? 'Call Scheduled' : 'Intro Submitted',
      pointsAwarded: 200,
      createdAt: new Date().toISOString()
    };

    state.intros.unshift(newIntro);
    recordTransaction('Executive Intro & Scheduling', `${name} (${company})`, 200);

    // Reset Form fields
    el.fsName.value = '';
    el.fsCompany.value = '';
    el.fsTitle.value = '';
    el.fsEmail.value = '';
    el.fsPhone.value = '';
    el.fsLinkedin.value = '';
    el.fsLocation.value = '';
    el.fsHistory.value = '';
    el.fsContext.value = '';
    el.fsBriefing.value = '';

    closeFullscreenIntroWorkspace();
    renderIntros();
    showToast(`Introduction for ${name} submitted (+200 pts). Meeting coordination initiated.`);
  }

  // Activate Workspace for User
  function activateWorkspace(user) {
    state.user = user;
    const firstName = (user.fullName || 'Jordan').split(' ')[0];
    if (el.userFirstName) el.userFirstName.textContent = firstName;
    if (el.userSubtext) el.userSubtext.textContent = `${user.company || 'Pacific Advisory'} · ${user.jobTitle || 'Managing Partner'} · ${user.domain || 'Enterprise SaaS'}`;
    if (el.agreementSignerField) el.agreementSignerField.value = user.fullName || '';

    el.viewAuth.style.display = 'none';
    el.viewWorkspace.style.display = 'block';
    el.signoutBtn.style.display = 'inline-flex';
    el.navBalancePill.style.display = 'inline-flex';

    saveState();
    updateUI();
    renderIntros();
    renderStatement();
  }

  // Sign Out
  function signout() {
    state.user = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    el.viewAuth.style.display = 'block';
    el.viewWorkspace.style.display = 'none';
    el.signoutBtn.style.display = 'none';
    el.navBalancePill.style.display = 'none';
    closeFullscreenIntroWorkspace();
  }

  // Setup Event Listeners
  function initEvents() {
    // Auth Tab Switch
    el.tabAuthSignin.addEventListener('click', () => {
      el.tabAuthSignin.classList.add('active');
      el.tabAuthSignup.classList.remove('active');
      el.formSignin.style.display = 'block';
      el.formSignup.style.display = 'none';
    });

    el.tabAuthSignup.addEventListener('click', () => {
      el.tabAuthSignup.classList.add('active');
      el.tabAuthSignin.classList.remove('active');
      el.formSignup.style.display = 'block';
      el.formSignin.style.display = 'none';
    });

    // 1-Click Demo Login
    el.btnQuickDemo.addEventListener('click', () => {
      activateWorkspace({
        fullName: 'Jordan Vance',
        company: 'Pacific Advisory Partners',
        jobTitle: 'Managing Partner',
        email: 'jordan@pacificadvisory.com',
        domain: 'Enterprise SaaS'
      });
      // Pre-populate calm demo entries if empty
      if (state.intros.length === 0) {
        state.intros = [
          {
            id: 1,
            name: 'Sarah Chen',
            company: 'Databricks',
            title: 'VP of Platform Engineering',
            email: 'sarah.chen@databricks.com',
            linkedin: 'https://linkedin.com',
            warmth: 'Direct Former Colleague',
            meetingDate: '2026-10-18',
            meetingTime: '14:00',
            status: 'Meeting Verified',
            pointsAwarded: 800
          },
          {
            id: 2,
            name: 'Marcus Brody',
            company: 'Snowflake',
            title: 'Head of Enterprise Sales Infra',
            email: 'm.brody@snowflake.com',
            linkedin: 'https://linkedin.com',
            warmth: 'Advisory Client',
            meetingDate: '2026-10-21',
            meetingTime: '11:30',
            status: 'Call Scheduled',
            pointsAwarded: 200
          },
          {
            id: 3,
            name: 'Elena Rostova',
            company: 'Figma',
            title: 'Director of Security Architecture',
            email: 'elena@figma.com',
            linkedin: 'https://linkedin.com',
            warmth: 'Close Industry Peer',
            status: 'Intro Submitted',
            pointsAwarded: 200
          }
        ];
        state.statement = [
          { id: 1, title: 'Warm Intro Submission', prospect: 'Sarah Chen (Databricks)', amount: 200, date: 'Oct 12, 10:30 AM' },
          { id: 2, title: 'Milestone: Meeting Verified', prospect: 'Sarah Chen (Databricks)', amount: 600, date: 'Oct 14, 02:15 PM' },
          { id: 3, title: 'Warm Intro Submission', prospect: 'Marcus Brody (Snowflake)', amount: 200, date: 'Oct 15, 09:00 AM' },
          { id: 4, title: 'Warm Intro Submission', prospect: 'Elena Rostova (Figma)', amount: 200, date: 'Oct 15, 10:00 AM' }
        ];
        state.points = 1200;
        saveState();
        updateUI();
        renderIntros();
        renderStatement();
      }
      showToast('Welcome to your partner workspace, Jordan.');
    });

    // Form Signin Submit
    el.formSignin.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value.trim();
      const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
      activateWorkspace({
        fullName: name,
        company: 'Advisory Partners',
        jobTitle: 'Executive Partner',
        email,
        domain: 'Enterprise SaaS'
      });
      showToast(`Signed in as ${name}.`);
    });

    // Form Signup Submit
    el.formSignup.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const company = document.getElementById('signup-company').value.trim();
      const jobTitle = document.getElementById('signup-title').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const domain = document.getElementById('signup-domain').value;

      activateWorkspace({ fullName: name, company, jobTitle, email, domain });
      showToast(`Partner account created for ${name}.`);
    });

    // Sign Out
    el.signoutBtn.addEventListener('click', signout);

    // Workspace Subtabs Switchers
    el.tabSubIntros.addEventListener('click', () => switchSubtab('intros'));
    el.tabSubEarnings.addEventListener('click', () => switchSubtab('earnings'));
    el.tabSubAgreement.addEventListener('click', () => switchSubtab('agreement'));

    // Search & Filter
    el.searchIntros.addEventListener('input', renderIntros);
    el.filterIntroStatus.addEventListener('change', renderIntros);

    // Full-Screen Workspace Trigger & Close
    el.btnOpenAddFullscreen.addEventListener('click', openFullscreenIntroWorkspace);
    el.btnCloseFullscreen.addEventListener('click', closeFullscreenIntroWorkspace);
    el.btnSubmitIntroFullscreen.addEventListener('click', handleSubmitFullscreenIntro);

    // Modal Triggers
    el.btnOpenBulkModal.addEventListener('click', () => openModal(el.modalBulkCsv));
    el.btnOpenPayoutModal.addEventListener('click', () => openModal(el.modalPayout));
    el.btnReReadAgreement.addEventListener('click', () => openModal(el.modalAgreement));

    // Close Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        closeAllModals();
      }
    });

    // Bulk CSV Confirm
    el.btnConfirmBulk.addEventListener('click', () => {
      const text = el.bulkPasteText.value.trim();
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      let count = 0;

      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const name = parts[0];
          const company = parts[1];
          const title = parts[2] || 'Executive';
          const email = parts[3] || `${name.toLowerCase().replace(/\s+/g, '.')}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
          const linkedin = parts[4] || '';

          state.intros.unshift({
            id: Date.now() + Math.random(),
            name,
            company,
            title,
            email,
            linkedin,
            warmth: 'Direct Former Colleague',
            status: 'Intro Submitted',
            pointsAwarded: 200
          });

          recordTransaction('Warm Intro (Bulk)', `${name} (${company})`, 200);
          count++;
        }
      });

      el.bulkPasteText.value = '';
      closeAllModals();
      renderIntros();
      showToast(`Imported ${count} executive introductions (+${count * 200} pts).`);
    });

    // Sign Terms Confirm
    el.btnConfirmSignTerms.addEventListener('click', () => {
      const signer = el.agreementSignerField.value.trim() || 'Partner';
      state.agreement = {
        signed: true,
        signedBy: signer,
        signedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        hash: `#IRM-${Math.floor(10000 + Math.random() * 90000)}-VERIFIED`
      };
      saveState();
      updateUI();
      closeAllModals();
      showToast('Partner Network Agreement executed and recorded.');
    });

    // Payout Confirm
    el.btnConfirmPayout.addEventListener('click', () => {
      const pts = parseInt(el.payoutAmountInput.value, 10);
      const method = el.payoutMethodSelect.value;
      const details = el.payoutDetailsText.value.trim();

      if (isNaN(pts) || pts <= 0) {
        alert('Please enter a valid points amount.');
        return;
      }
      if (pts > state.points) {
        alert(`You only have ${state.points} approved points available.`);
        return;
      }

      recordTransaction(`Payout Request (${method})`, details || 'Direct payout', -pts);
      el.payoutAmountInput.value = '';
      el.payoutDetailsText.value = '';
      closeAllModals();
      showToast(`Payout request for $${(pts * 0.1).toFixed(2)} (${pts} pts) submitted.`);
    });
  }

  // Init
  function init() {
    initTheme();
    initEvents();

    if (loadState()) {
      activateWorkspace(state.user);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
