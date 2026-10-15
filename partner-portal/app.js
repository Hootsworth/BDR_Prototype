/**
 * FLAT MINIMALISTIC BLACK & WHITE PARTNER PORTAL APPLICATION
 * Pure JavaScript · Zero External Runtime Dependencies · Resilient Architecture
 */

(() => {
  'use strict';

  // Config & API Target (can be overridden via window.PARTNER_API_BASE)
  const API_BASE = window.PARTNER_API_BASE || (window.location.origin.includes('localhost') ? '' : 'https://connectem.ai');
  const STORAGE_KEY_USER = 'connectem_partner_user_v2';
  const STORAGE_KEY_DATA = 'connectem_partner_data_v2';

  // Application State
  const state = {
    user: null,
    intros: [],
    ledger: [],
    agreement: {
      signed: false,
      signedBy: '',
      signedAt: '',
      hash: ''
    },
    points: 0,
    calendlyUrl: 'https://calendly.com'
  };

  // DOM Elements
  const el = {
    themeToggle: document.getElementById('btn-theme-toggle'),
    signoutBtn: document.getElementById('btn-signout'),
    viewAuth: document.getElementById('view-auth'),
    viewWorkspace: document.getElementById('view-workspace'),
    globalAlert: document.getElementById('global-alert'),
    authFeedback: document.getElementById('auth-feedback'),
    tabBtnSignin: document.getElementById('tab-btn-signin'),
    tabBtnSignup: document.getElementById('tab-btn-signup'),
    formSignin: document.getElementById('form-signin'),
    formSignup: document.getElementById('form-signup'),
    btnQuickDemo: document.getElementById('btn-quick-demo-login'),
    
    // Workspace Elements
    userDisplayName: document.getElementById('user-display-name'),
    userDisplayMeta: document.getElementById('user-display-meta'),
    badgeAgreementStatus: document.getElementById('badge-agreement-status'),
    textAgreementHash: document.getElementById('text-agreement-hash'),
    btnViewAgreement: document.getElementById('btn-view-agreement'),
    btnCalendlyLink: document.getElementById('btn-calendly-link'),
    
    // KPIs
    kpiTotalIntros: document.getElementById('kpi-total-intros'),
    kpiCallsScheduled: document.getElementById('kpi-calls-scheduled'),
    kpiCallsCompleted: document.getElementById('kpi-calls-completed'),
    kpiRewardPoints: document.getElementById('kpi-reward-points'),

    // Forms & Tabs
    btnModeSingle: document.getElementById('btn-mode-single'),
    btnModeBulk: document.getElementById('btn-mode-bulk'),
    formSingleIntro: document.getElementById('form-single-intro'),
    panelBulkIntake: document.getElementById('panel-bulk-intake'),
    bulkCsvInput: document.getElementById('bulk-csv-input'),
    bulkParseCount: document.getElementById('bulk-parse-count'),
    btnSubmitBulkCsv: document.getElementById('btn-submit-bulk-csv'),

    // Table & Filters
    filterSearch: document.getElementById('filter-search'),
    filterStatus: document.getElementById('filter-status'),
    tableRowCount: document.getElementById('table-row-count'),
    tableIntrosBody: document.getElementById('table-intros-body'),
    tableLedgerBody: document.getElementById('table-ledger-body'),

    // Modals
    modalAgreement: document.getElementById('modal-agreement'),
    agreementSignerName: document.getElementById('agreement-signer-name'),
    agreementConsent: document.getElementById('agreement-consent'),
    btnSignAgreementConfirm: document.getElementById('btn-sign-agreement-confirm'),

    modalRedemption: document.getElementById('modal-redemption'),
    btnOpenRedemption: document.getElementById('btn-open-redemption'),
    modalRedeemBalance: document.getElementById('modal-redeem-balance'),
    redeemPointsAmount: document.getElementById('redeem-points-amount'),
    redeemMethod: document.getElementById('redeem-method'),
    redeemDetails: document.getElementById('redeem-details'),
    btnConfirmRedeem: document.getElementById('btn-confirm-redeem')
  };

  // Utilities
  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function showMessage(targetEl, text, isError = false) {
    if (!targetEl) return;
    targetEl.textContent = text;
    targetEl.className = `auth-message ${isError ? 'error' : 'success'}`;
    targetEl.style.display = 'block';
  }

  function clearMessage(targetEl) {
    if (!targetEl) return;
    targetEl.textContent = '';
    targetEl.style.display = 'none';
  }

  // Local Storage Persistence
  function saveState() {
    if (!state.user) return;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(state.user));
    localStorage.setItem(`${STORAGE_KEY_DATA}_${state.user.email}`, JSON.stringify({
      intros: state.intros,
      ledger: state.ledger,
      agreement: state.agreement,
      points: state.points
    }));
  }

  function loadSavedState() {
    try {
      const rawUser = localStorage.getItem(STORAGE_KEY_USER);
      if (!rawUser) return false;
      state.user = JSON.parse(rawUser);
      const rawData = localStorage.getItem(`${STORAGE_KEY_DATA}_${state.user.email}`);
      if (rawData) {
        const data = JSON.parse(rawData);
        state.intros = data.intros || [];
        state.ledger = data.ledger || [];
        state.agreement = data.agreement || { signed: false };
        state.points = data.points || 0;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Theme Management (Pure Black & White Toggle)
  function initTheme() {
    const saved = localStorage.getItem('partner_portal_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (el.themeToggle) {
      el.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('partner_portal_theme', next);
      });
    }
  }

  // Render KPIs & Statuses
  function updateKPIs() {
    const total = state.intros.length;
    const scheduled = state.intros.filter(i => i.status === 'Call Scheduled' || i.status === 'Meeting Verified' || i.status === 'Opportunity' || i.status === 'Customer Closed').length;
    const completed = state.intros.filter(i => i.status === 'Meeting Verified' || i.status === 'Opportunity' || i.status === 'Customer Closed').length;

    if (el.kpiTotalIntros) el.kpiTotalIntros.textContent = total;
    if (el.kpiCallsScheduled) el.kpiCallsScheduled.textContent = scheduled;
    if (el.kpiCallsCompleted) el.kpiCallsCompleted.textContent = completed;
    if (el.kpiRewardPoints) el.kpiRewardPoints.textContent = state.points.toLocaleString();
    if (el.modalRedeemBalance) el.modalRedeemBalance.textContent = `${state.points.toLocaleString()} pts`;

    // Agreement Banner
    if (el.badgeAgreementStatus) {
      if (state.agreement && state.agreement.signed) {
        el.badgeAgreementStatus.textContent = 'AGREEMENT SIGNED & ACTIVE';
        el.badgeAgreementStatus.className = 'badge badge-filled';
        el.textAgreementHash.textContent = `HASH: ${state.agreement.hash || '#IRM-VERIFIED'}`;
        el.btnViewAgreement.textContent = 'View Executed Agreement';
      } else {
        el.badgeAgreementStatus.textContent = 'PENDING SIGNATURE';
        el.badgeAgreementStatus.className = 'badge';
        el.textAgreementHash.textContent = 'REQUIRED BEFORE PAYOUT';
        el.btnViewAgreement.textContent = 'Review & Sign Agreement';
      }
    }
  }

  // Render Introductions Table
  function renderIntrosTable() {
    if (!el.tableIntrosBody) return;
    const query = (el.filterSearch ? el.filterSearch.value : '').trim().toLowerCase();
    const statusFilter = el.filterStatus ? el.filterStatus.value : 'ALL';

    const filtered = state.intros.filter(item => {
      const matchQuery = !query || 
        item.name.toLowerCase().includes(query) ||
        item.company.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query);
      const matchStatus = (statusFilter === 'ALL') || (item.status === statusFilter);
      return matchQuery && matchStatus;
    });

    if (el.tableRowCount) el.tableRowCount.textContent = filtered.length;

    if (filtered.length === 0) {
      el.tableIntrosBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted); font-family:var(--font-mono); font-size:12px;">
            ${state.intros.length === 0 ? 'No introductions submitted yet. Fill in the form above to add an executive.' : 'No matching records found for this filter.'}
          </td>
        </tr>
      `;
      return;
    }

    el.tableIntrosBody.innerHTML = filtered.map(intro => `
      <tr data-id="${intro.id}">
        <td>
          <strong>${escapeHTML(intro.name)}</strong>
          ${intro.linkedin ? `<br><a href="${escapeHTML(intro.linkedin)}" target="_blank" rel="noopener" style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-muted); text-decoration:underline;">LinkedIn ↗</a>` : ''}
        </td>
        <td>
          ${escapeHTML(intro.company)}
          ${intro.title ? `<br><span style="color:var(--text-muted); font-size:12px;">${escapeHTML(intro.title)}</span>` : ''}
        </td>
        <td style="font-family:var(--font-mono); font-size:12px;">${escapeHTML(intro.email)}</td>
        <td><span class="badge">${escapeHTML(intro.warmth || 'Warm Intro')}</span></td>
        <td>
          <select class="form-select status-select" style="height:30px; font-size:11px; font-family:var(--font-mono);" data-intro-id="${intro.id}">
            <option value="Intro Submitted" ${intro.status === 'Intro Submitted' ? 'selected' : ''}>Intro Submitted</option>
            <option value="Call Scheduled" ${intro.status === 'Call Scheduled' ? 'selected' : ''}>Call Scheduled</option>
            <option value="Meeting Verified" ${intro.status === 'Meeting Verified' ? 'selected' : ''}>Meeting Verified (+600 pts)</option>
            <option value="Opportunity" ${intro.status === 'Opportunity' ? 'selected' : ''}>Opportunity (+1,000 pts)</option>
            <option value="Customer Closed" ${intro.status === 'Customer Closed' ? 'selected' : ''}>Customer Closed (+5,000 pts)</option>
          </select>
        </td>
        <td style="font-family:var(--font-mono); font-weight:600;">+${intro.pointsAwarded || 200} pts</td>
        <td>
          <button type="button" class="btn btn-outline btn-sm btn-delete-intro" data-intro-id="${intro.id}">Remove</button>
        </td>
      </tr>
    `).join('');

    // Attach listeners for status change and delete
    el.tableIntrosBody.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const introId = e.target.dataset.introId;
        const newStatus = e.target.value;
        updateIntroStatus(introId, newStatus);
      });
    });

    el.tableIntrosBody.querySelectorAll('.btn-delete-intro').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const introId = e.target.dataset.introId;
        deleteIntro(introId);
      });
    });
  }

  // Render Ledger Table
  function renderLedgerTable() {
    if (!el.tableLedgerBody) return;
    if (state.ledger.length === 0) {
      el.tableLedgerBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted); font-family:var(--font-mono); font-size:12px;">
            No transactions recorded yet. Submit introductions or update meeting statuses to earn points.
          </td>
        </tr>
      `;
      return;
    }

    el.tableLedgerBody.innerHTML = state.ledger.slice().reverse().map(item => `
      <tr>
        <td style="font-family:var(--font-mono); font-size:11.5px; color:var(--text-muted);">${escapeHTML(item.date)}</td>
        <td><strong>${escapeHTML(item.milestone)}</strong></td>
        <td>${escapeHTML(item.prospect || '—')}</td>
        <td style="font-family:var(--font-mono); font-weight:700; ${item.points > 0 ? 'color:var(--text);' : 'color:var(--text-muted);'}">
          ${item.points > 0 ? `+${item.points.toLocaleString()}` : item.points.toLocaleString()} pts
        </td>
        <td><span class="badge ${item.points > 0 ? 'badge-filled' : ''}">${escapeHTML(item.status || 'Verified')}</span></td>
      </tr>
    `).join('');
  }

  // Add Milestone to Ledger
  function recordLedger(milestone, prospect, points, status = 'Verified') {
    const entry = {
      id: Date.now() + Math.random(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      milestone,
      prospect,
      points,
      status
    };
    state.ledger.push(entry);
    state.points = Math.max(0, state.points + points);
    saveState();
    updateKPIs();
    renderLedgerTable();
  }

  // Update Status of an Introduction
  function updateIntroStatus(introId, newStatus) {
    const intro = state.intros.find(i => String(i.id) === String(introId));
    if (!intro || intro.status === newStatus) return;

    const oldStatus = intro.status;
    intro.status = newStatus;

    // Award incremental milestone points
    let pointsToAdd = 0;
    if (newStatus === 'Meeting Verified' && oldStatus !== 'Meeting Verified' && !intro.meetingPointsAwarded) {
      pointsToAdd = 600;
      intro.meetingPointsAwarded = true;
    } else if (newStatus === 'Opportunity' && !intro.oppPointsAwarded) {
      pointsToAdd = 1000;
      intro.oppPointsAwarded = true;
    } else if (newStatus === 'Customer Closed' && !intro.closedPointsAwarded) {
      pointsToAdd = 5000;
      intro.closedPointsAwarded = true;
    }

    if (pointsToAdd > 0) {
      intro.pointsAwarded = (intro.pointsAwarded || 200) + pointsToAdd;
      recordLedger(`Milestone: ${newStatus}`, `${intro.name} (${intro.company})`, pointsToAdd);
    }

    saveState();
    updateKPIs();
    renderIntrosTable();
  }

  // Delete Introduction
  function deleteIntro(introId) {
    if (!confirm('Are you sure you want to remove this introduction record?')) return;
    state.intros = state.intros.filter(i => String(i.id) !== String(introId));
    saveState();
    updateKPIs();
    renderIntrosTable();
  }

  // Add Single Introduction
  function handleAddSingleIntro(e) {
    e.preventDefault();
    const name = document.getElementById('intro-name').value.trim();
    const company = document.getElementById('intro-company').value.trim();
    const title = document.getElementById('intro-title').value.trim();
    const email = document.getElementById('intro-email').value.trim();
    const linkedin = document.getElementById('intro-linkedin').value.trim();
    const warmth = document.getElementById('intro-warmth').value;
    const notes = document.getElementById('intro-notes').value.trim();

    if (!name || !company || !email) {
      alert('Please enter at least the contact name, company, and work email.');
      return;
    }

    const newIntro = {
      id: Date.now(),
      name,
      company,
      title,
      email,
      linkedin,
      warmth,
      notes,
      status: 'Intro Submitted',
      pointsAwarded: 200,
      submittedAt: new Date().toISOString()
    };

    state.intros.unshift(newIntro);
    recordLedger('Warm Intro Submission', `${name} (${company})`, 200);

    // Reset Form
    el.formSingleIntro.reset();
    renderIntrosTable();
    updateKPIs();
    saveState();
  }

  // Parse & Import Bulk CSV
  function handleBulkCsvImport() {
    const raw = el.bulkCsvInput.value.trim();
    if (!raw) {
      alert('Please paste CSV rows into the text area.');
      return;
    }

    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    let count = 0;

    lines.forEach(line => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const company = parts[1];
        const title = parts[2] || 'Executive';
        const email = parts[3] || `${name.toLowerCase().replace(/\s+/g, '.')}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
        const linkedin = parts[4] || '';
        const notes = parts.slice(5).join(', ') || 'Bulk import';

        state.intros.unshift({
          id: Date.now() + Math.random(),
          name,
          company,
          title,
          email,
          linkedin,
          warmth: 'Direct Colleague',
          notes,
          status: 'Intro Submitted',
          pointsAwarded: 200,
          submittedAt: new Date().toISOString()
        });

        recordLedger('Warm Intro (Bulk)', `${name} (${company})`, 200);
        count++;
      }
    });

    el.bulkCsvInput.value = '';
    el.bulkParseCount.textContent = `${count} rows imported successfully.`;
    renderIntrosTable();
    updateKPIs();
    saveState();
  }

  // Digital Signature Flow
  function handleAgreementSign() {
    const signer = el.agreementSignerName.value.trim() || (state.user ? state.user.fullName : 'Partner');
    if (!el.agreementConsent.checked) {
      alert('Please check the confirmation box to execute your digital signature.');
      return;
    }

    state.agreement = {
      signed: true,
      signedBy: signer,
      signedAt: new Date().toISOString(),
      hash: `#IRM-${Math.floor(10000 + Math.random() * 90000)}-VERIFIED`
    };

    recordLedger('Agreement Digitally Executed', 'Partner Network Terms', 0, 'Executed');
    saveState();
    updateKPIs();
    closeAllModals();
  }

  // Points Redemption Flow
  function handleRedeemPoints() {
    const amount = parseInt(el.redeemPointsAmount.value, 10);
    const method = el.redeemMethod.value;
    const details = el.redeemDetails.value.trim();

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid points amount to redeem.');
      return;
    }
    if (amount > state.points) {
      alert(`Insufficient approved points. You currently have ${state.points} points.`);
      return;
    }
    if (!state.agreement.signed) {
      alert('You must sign the Partner Network Agreement before redeeming rewards.');
      return;
    }

    recordLedger(`Redemption: ${method}`, details || 'Direct payout', -amount, 'Pending Transfer');
    el.redeemPointsAmount.value = '';
    el.redeemDetails.value = '';
    closeAllModals();
    alert(`Redemption request for ${amount.toLocaleString()} points ($${(amount * 0.1).toFixed(2)}) has been submitted.`);
  }

  // Switch to Workspace
  function activateWorkspace(user) {
    state.user = user;
    if (el.userDisplayName) el.userDisplayName.textContent = user.fullName || 'Partner';
    if (el.userDisplayMeta) el.userDisplayMeta.textContent = `${user.company || 'Advisory'} · ${user.jobTitle || 'Executive Partner'} · ${user.domain || 'Enterprise SaaS'}`;
    if (el.agreementSignerName) el.agreementSignerName.value = user.fullName || '';

    el.viewAuth.style.display = 'none';
    el.viewWorkspace.style.display = 'block';
    el.signoutBtn.style.display = 'inline-flex';

    saveState();
    updateKPIs();
    renderIntrosTable();
    renderLedgerTable();
  }

  // Sign Out
  function signout() {
    state.user = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    el.viewAuth.style.display = 'grid';
    el.viewWorkspace.style.display = 'none';
    el.signoutBtn.style.display = 'none';
    clearMessage(el.authFeedback);
  }

  // Modal Helpers
  function openModal(modalEl) {
    if (modalEl) modalEl.style.display = 'flex';
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }

  // Setup Event Listeners
  function initEvents() {
    // Auth Tab Switcher
    el.tabBtnSignin.addEventListener('click', () => {
      el.tabBtnSignin.classList.add('active');
      el.tabBtnSignup.classList.remove('active');
      el.formSignin.style.display = 'flex';
      el.formSignup.style.display = 'none';
      clearMessage(el.authFeedback);
    });

    el.tabBtnSignup.addEventListener('click', () => {
      el.tabBtnSignup.classList.add('active');
      el.tabBtnSignin.classList.remove('active');
      el.formSignup.style.display = 'flex';
      el.formSignin.style.display = 'none';
      clearMessage(el.authFeedback);
    });

    // Quick Demo Mode
    el.btnQuickDemo.addEventListener('click', () => {
      activateWorkspace({
        fullName: 'Jordan Vance',
        company: 'Pacific Advisory Partners',
        jobTitle: 'Managing Partner',
        email: 'jordan@pacificadvisory.com',
        domain: 'Enterprise SaaS'
      });
      // Seed initial sample data if empty
      if (state.intros.length === 0) {
        state.intros = [
          {
            id: 101,
            name: 'Sarah Chen',
            company: 'Databricks',
            title: 'VP of Platform Engineering',
            email: 'sarah.chen@databricks.com',
            linkedin: 'https://linkedin.com',
            warmth: 'Direct Former Colleague',
            status: 'Meeting Verified',
            pointsAwarded: 800,
            submittedAt: new Date().toISOString()
          },
          {
            id: 102,
            name: 'Marcus Brody',
            company: 'Snowflake',
            title: 'Head of Enterprise Sales Infra',
            email: 'm.brody@snowflake.com',
            linkedin: 'https://linkedin.com',
            warmth: 'Advisory Client',
            status: 'Call Scheduled',
            pointsAwarded: 200,
            submittedAt: new Date().toISOString()
          }
        ];
        state.agreement = {
          signed: true,
          signedBy: 'Jordan Vance',
          signedAt: new Date().toISOString(),
          hash: '#IRM-94812-VERIFIED'
        };
        state.points = 1000;
        state.ledger = [
          { id: 1, date: 'Oct 12, 10:30 AM', milestone: 'Warm Intro Submission', prospect: 'Sarah Chen (Databricks)', points: 200, status: 'Verified' },
          { id: 2, date: 'Oct 14, 02:15 PM', milestone: 'Milestone: Meeting Verified', prospect: 'Sarah Chen (Databricks)', points: 600, status: 'Confirmed' },
          { id: 3, date: 'Oct 15, 09:00 AM', milestone: 'Warm Intro Submission', prospect: 'Marcus Brody (Snowflake)', points: 200, status: 'Verified' }
        ];
        saveState();
        updateKPIs();
        renderIntrosTable();
        renderLedgerTable();
      }
    });

    // Sign In Submit
    el.formSignin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value.trim();
      const password = document.getElementById('signin-password').value;

      showMessage(el.authFeedback, 'Authenticating partner credentials...');

      try {
        // Try backend login endpoint if available
        const res = await fetch(`${API_BASE}/api/partner-portal/session`, {
          headers: { 'Authorization': `Bearer ${btoa(email + ':' + password)}` }
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json();
          activateWorkspace(data.influencer || { email, fullName: email.split('@')[0] });
          return;
        }
      } catch (_) {}

      // Fallback to local session
      activateWorkspace({
        fullName: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase()),
        company: 'Advisory Firm',
        jobTitle: 'Executive Partner',
        email,
        domain: 'Enterprise SaaS'
      });
    });

    // Sign Up Submit
    el.formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const company = document.getElementById('signup-company').value.trim();
      const jobTitle = document.getElementById('signup-title').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const linkedinUrl = document.getElementById('signup-linkedin').value.trim();
      const domain = document.getElementById('signup-domain').value;

      showMessage(el.authFeedback, 'Creating partner profile & workspace...');

      try {
        // Post to backend onboard endpoint
        const res = await fetch(`${API_BASE}/api/partner-portal/onboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: name, company, jobTitle, email, linkedinUrl, domain })
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json();
          activateWorkspace(data.influencer || { fullName: name, company, jobTitle, email, domain });
          return;
        }
      } catch (_) {}

      // Standalone Fallback
      activateWorkspace({ fullName: name, company, jobTitle, email, domain, linkedinUrl });
    });

    // Sign Out Button
    el.signoutBtn.addEventListener('click', signout);

    // Single Intro Form Submit
    el.formSingleIntro.addEventListener('submit', handleAddSingleIntro);

    // Bulk Mode Toggle
    el.btnModeSingle.addEventListener('click', () => {
      el.formSingleIntro.style.display = 'block';
      el.panelBulkIntake.style.display = 'none';
      el.btnModeSingle.className = 'btn btn-secondary btn-sm';
      el.btnModeBulk.className = 'btn btn-outline btn-sm';
    });

    el.btnModeBulk.addEventListener('click', () => {
      el.formSingleIntro.style.display = 'none';
      el.panelBulkIntake.style.display = 'block';
      el.btnModeBulk.className = 'btn btn-secondary btn-sm';
      el.btnModeSingle.className = 'btn btn-outline btn-sm';
    });

    // Bulk CSV Submit
    el.btnSubmitBulkCsv.addEventListener('click', handleBulkCsvImport);

    // Search and Status Filters
    el.filterSearch.addEventListener('input', renderIntrosTable);
    el.filterStatus.addEventListener('change', renderIntrosTable);

    // Modal Triggers
    el.btnViewAgreement.addEventListener('click', () => openModal(el.modalAgreement));
    el.btnSignAgreementConfirm.addEventListener('click', handleAgreementSign);
    el.btnOpenRedemption.addEventListener('click', () => openModal(el.modalRedemption));
    el.btnConfirmRedeem.addEventListener('click', handleRedeemPoints);

    // Close Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        closeAllModals();
      }
    });
  }

  // Initialize
  function init() {
    initTheme();
    initEvents();

    // Check if user is already authenticated
    if (loadSavedState()) {
      activateWorkspace(state.user);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
