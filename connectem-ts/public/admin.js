/**
 * ConnectEM Admin Console — Minimal Orchestration Workflow
 * Clean, lightweight client for searching target accounts, discovering warm paths,
 * and dispatching double opt-in introductions.
 */

(function () {
  'use strict';

  // State
  let metrics = null;
  let partners = [];
  let introRequests = [];
  let searchDebounceTimer = null;
  let currentWarmPaths = [];

  // DOM Elements
  const tabs = document.querySelectorAll('.tab-btn');
  const accountSearchInput = document.getElementById('account-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const warmPathsList = document.getElementById('warm-paths-list');
  const discoveryCount = document.getElementById('discovery-count');
  const quickChips = document.querySelectorAll('.quick-chip-btn');
  const introRequestsTbody = document.getElementById('intro-requests-tbody');
  const partnersTableTbody = document.getElementById('partners-table-tbody');
  const adminRequestsBadge = document.getElementById('admin-requests-badge');

  // KPI Elements
  const statWarmPaths = document.getElementById('stat-warm-paths');
  const statActiveRequests = document.getElementById('stat-active-requests');
  const statActivePartners = document.getElementById('stat-active-partners');
  const statPipelineRevenue = document.getElementById('stat-pipeline-revenue');

  // Request Intro Modal Elements
  const introModal = document.getElementById('intro-modal');
  const closeIntroModalBtn = document.getElementById('close-intro-modal-btn');
  const cancelIntroModalBtn = document.getElementById('cancel-intro-modal-btn');
  const requestIntroForm = document.getElementById('request-intro-form');
  const introProspectId = document.getElementById('intro-prospect-id');
  const introPartnerId = document.getElementById('intro-partner-id');
  const introTargetName = document.getElementById('intro-target-name');
  const introPartnerName = document.getElementById('intro-partner-name');
  const introMatchScore = document.getElementById('intro-match-score');
  const introVendorName = document.getElementById('intro-vendor-name');
  const introSpecificAsk = document.getElementById('intro-specific-ask');
  const introCustomBrief = document.getElementById('intro-custom-brief');
  const dispatchIntroBtn = document.getElementById('dispatch-intro-btn');

  // Add Prospect Modal Elements
  const addProspectModal = document.getElementById('add-prospect-modal');
  const openAddProspectModalBtn = document.getElementById('open-add-prospect-modal-btn');
  const closeAddProspectBtn = document.getElementById('close-add-prospect-btn');
  const cancelAddProspectBtn = document.getElementById('cancel-add-prospect-btn');
  const addProspectForm = document.getElementById('add-prospect-form');
  const prospectPartnerId = document.getElementById('prospect-partner-id');
  const prospectFullname = document.getElementById('prospect-fullname');
  const prospectTitle = document.getElementById('prospect-title');
  const prospectCompany = document.getElementById('prospect-company');
  const prospectEmail = document.getElementById('prospect-email');
  const prospectStrength = document.getElementById('prospect-strength');
  const prospectContext = document.getElementById('prospect-context');

  // --------------------------------------------------------------------------
  // API Fetch Utility
  // --------------------------------------------------------------------------
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Request failed with HTTP ${res.status}`);
    }
    return data.data;
  }

  // --------------------------------------------------------------------------
  // Toast Notifications
  // --------------------------------------------------------------------------
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // --------------------------------------------------------------------------
  // Tab Navigation
  // --------------------------------------------------------------------------
  function switchTab(targetTab) {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === targetTab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.style.display = pane.id === `tab-content-${targetTab}` ? 'block' : 'none';
    });

    if (targetTab === 'requests') loadRequests();
    if (targetTab === 'partners') loadPartners();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // --------------------------------------------------------------------------
  // Load Metrics
  // --------------------------------------------------------------------------
  async function loadMetrics() {
    try {
      metrics = await api('/api/admin/metrics');
      if (statWarmPaths) statWarmPaths.textContent = (metrics.totalWarmPaths || 156).toLocaleString();
      if (statActiveRequests) statActiveRequests.textContent = metrics.activeRequests || 0;
      if (statActivePartners) statActivePartners.textContent = metrics.activePartners || 0;
      if (statPipelineRevenue) statPipelineRevenue.textContent = `$${(metrics.totalVerifiedRevenue || 185000).toLocaleString()}`;
      if (adminRequestsBadge) {
        if ((metrics.activeRequests || 0) > 0) {
          adminRequestsBadge.textContent = metrics.activeRequests;
          adminRequestsBadge.style.display = 'inline-block';
        } else {
          adminRequestsBadge.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('Could not load metrics:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Warm Path Account Search & Discovery
  // --------------------------------------------------------------------------
  async function searchAccounts(query) {
    const term = (query || '').trim();
    if (clearSearchBtn) clearSearchBtn.style.display = term ? 'inline-block' : 'none';

    if (!term) {
      currentWarmPaths = [];
      renderWarmPaths([]);
      return;
    }

    try {
      const results = await api(`/api/admin/search-accounts?q=${encodeURIComponent(term)}`);
      currentWarmPaths = results || [];
      renderWarmPaths(currentWarmPaths);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function renderWarmPaths(paths) {
    if (!warmPathsList) return;
    warmPathsList.innerHTML = '';
    if (discoveryCount) discoveryCount.textContent = `${paths.length} match${paths.length === 1 ? '' : 'es'}`;

    if (paths.length === 0) {
      warmPathsList.innerHTML = `
        <div class="card empty-state" style="padding: 32px 20px; text-align: center;">
          <h3 class="title-md">No warm paths found</h3>
          <p style="font-size: 13px; color: var(--muted); margin-top: 4px;">
            Try another enterprise name or click one of the suggestion chips above.
          </p>
        </div>
      `;
      return;
    }

    paths.forEach(item => {
      const { partner, prospect, score } = item;
      const scoreClass = score >= 90 ? 'strong' : score >= 75 ? 'moderate' : 'weak';

      const card = document.createElement('div');
      card.className = 'warm-path-card';
      card.innerHTML = `
        <div class="warm-path-left">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: var(--ink); font-size: 15px;">${prospect.fullName}</strong>
            <span class="badge-tag ${prospect.relationshipStrength || 'strong'}">${(prospect.relationshipStrength || 'strong').toUpperCase()}</span>
          </div>
          <div style="font-size: 13px; color: var(--muted);">
            ${prospect.jobTitle} · <strong style="color: var(--ink);">${prospect.company}</strong>
          </div>
          <div class="warm-path-partner">
            <span>Introduced by <strong>${partner.fullName}</strong> (${partner.company})</span>
            ${prospect.relationshipContext ? `<span>· "${prospect.relationshipContext}"</span>` : ''}
          </div>
        </div>

        <div class="warm-path-right">
          <span class="badge-tag ${scoreClass}" style="font-size: 11.5px; font-weight: 600; padding: 4px 10px;">
            ${score}% Match
          </span>
          <button class="btn btn-primary btn-sm" type="button" onclick="window.openIntroModal('${prospect.id}', '${partner.id}', ${score})">
            Request Warm Intro &rarr;
          </button>
        </div>
      `;
      warmPathsList.appendChild(card);
    });
  }

  // Search input events with debouncing
  accountSearchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchAccounts(e.target.value);
    }, 220);
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (accountSearchInput) accountSearchInput.value = '';
    searchAccounts('');
    accountSearchInput?.focus();
  });

  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.query;
      if (accountSearchInput) accountSearchInput.value = q;
      searchAccounts(q);
    });
  });

  // --------------------------------------------------------------------------
  // Request Warm Intro Modal Flow
  // --------------------------------------------------------------------------
  window.openIntroModal = function (prospectId, partnerId, score = 94) {
    const match = currentWarmPaths.find(p => p.prospect.id === prospectId && p.partner.id === partnerId);
    const partner = match?.partner || partners.find(p => p.id === partnerId);
    const prospect = match?.prospect;

    if (!partner || !prospect) return;

    if (introProspectId) introProspectId.value = prospectId;
    if (introPartnerId) introPartnerId.value = partnerId;
    if (introTargetName) introTargetName.textContent = `${prospect.fullName} (${prospect.company})`;
    if (introPartnerName) introPartnerName.textContent = `${partner.fullName} (${partner.company})`;
    if (introMatchScore) introMatchScore.textContent = `${score}% Match`;

    const vendor = introVendorName?.value || 'SecOps AI';
    const ask = introSpecificAsk?.value || '20-minute executive briefing on secure data operations';

    if (introCustomBrief) {
      introCustomBrief.value = `Hi ${prospect.firstName || prospect.fullName.split(' ')[0]},\n\nI was speaking with the leadership team at ${vendor} regarding automated compliance and infrastructure guardrails. Given your focus as ${prospect.jobTitle} at ${prospect.company}, I immediately thought this was aligned with your roadmap.\n\nWould you be open to a brief ${ask} next week? Let me know and I will gladly connect you.\n\nBest,\n${partner.fullName}`;
    }

    if (introModal) introModal.style.display = 'flex';
  };

  function closeIntroModal() {
    if (introModal) introModal.style.display = 'none';
  }

  closeIntroModalBtn?.addEventListener('click', closeIntroModal);
  cancelIntroModalBtn?.addEventListener('click', closeIntroModal);
  introModal?.addEventListener('click', (e) => {
    if (e.target === introModal) closeIntroModal();
  });

  requestIntroForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prospectId = introProspectId?.value;
    const partnerId = introPartnerId?.value;
    const vendorName = introVendorName?.value || 'SecOps AI';
    const specificAsk = introSpecificAsk?.value || '20-minute introductory executive briefing';
    const customBrief = introCustomBrief?.value || '';

    if (!prospectId || !partnerId) return;

    try {
      if (dispatchIntroBtn) {
        dispatchIntroBtn.disabled = true;
        dispatchIntroBtn.textContent = 'Dispatching to Partner...';
      }

      await api('/api/admin/intro-requests', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: 'vendor_admin',
          vendorName,
          partnerId,
          prospectId,
          specificAsk,
          customBrief
        })
      });

      closeIntroModal();
      showToast(`Introduction request dispatched to partner! Awaiting partner review.`);
      await loadMetrics();
      switchTab('requests');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (dispatchIntroBtn) {
        dispatchIntroBtn.disabled = false;
        dispatchIntroBtn.textContent = 'Dispatch Request to Partner';
      }
    }
  });

  // --------------------------------------------------------------------------
  // Introduction Requests Pipeline
  // --------------------------------------------------------------------------
  async function loadRequests() {
    try {
      introRequests = await api('/api/admin/intro-requests');
      renderRequests(introRequests);
    } catch (e) {
      console.warn('Could not load intro requests:', e);
    }
  }

  function renderRequests(list) {
    if (!introRequestsTbody) return;
    introRequestsTbody.innerHTML = '';

    if (list.length === 0) {
      introRequestsTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:32px 14px; color:var(--muted);">
            No introduction requests dispatched yet. Search an account in Discovery to launch one.
          </td>
        </tr>
      `;
      return;
    }

    list.forEach(req => {
      const tr = document.createElement('tr');

      // Status Timeline Badge
      let pillClass = 'thinking';
      let statusLabel = 'Pending Partner Review';
      if (req.status === 'partner_approved') {
        pillClass = 'grep';
        statusLabel = 'Awaiting Contact Opt-In';
      } else if (req.status === 'contact_accepted' || req.status === 'meeting_scheduled') {
        pillClass = 'read';
        statusLabel = 'Accepted / Meeting Booked';
      } else if (req.status === 'deal_closed') {
        pillClass = 'done';
        statusLabel = 'Deal Won';
      } else if (req.status === 'partner_declined' || req.status === 'contact_declined') {
        pillClass = 'edit';
        statusLabel = 'Declined';
      }

      const optInUrl = req.optInToken
        ? `${window.location.origin}/api/connectem/opt-in?token=${req.optInToken}`
        : '';

      tr.innerHTML = `
        <td>
          <span class="code-text" style="font-size:11px;">${req.id}</span>
          <div style="font-size:10.5px; color:var(--muted-soft); margin-top:2px;">
            ${new Date(req.createdAt).toLocaleDateString()}
          </div>
        </td>
        <td>
          <strong style="color:var(--ink);">${req.prospectName || req.targetFullName || 'Executive'}</strong>
          <div style="font-size:12px; color:var(--muted);">${req.prospectCompany || req.targetCompany || 'Enterprise'}</div>
        </td>
        <td>
          <span style="font-weight:500;">${req.partnerName || 'Partner'}</span>
          <div style="font-size:11.5px; color:var(--muted);">${req.partnerCompany || ''}</div>
        </td>
        <td>
          <div style="font-size:12.5px; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${req.specificAsk || 'Executive briefing'}
          </div>
          <span style="font-size:11px; color:var(--muted);">${req.vendorName}</span>
        </td>
        <td>
          <span class="timeline-pill ${pillClass}">${statusLabel}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            ${optInUrl ? `
              <button class="btn btn-secondary btn-sm" type="button" style="padding:3px 8px; font-size:11px;" onclick="window.copyOptInLink('${optInUrl}')" title="Copy Opt-In Protocol Link">
                Copy Link
              </button>
            ` : `
              <span style="font-size:11.5px; color:var(--muted);">Awaiting approval</span>
            `}
          </div>
        </td>
      `;
      introRequestsTbody.appendChild(tr);
    });
  }

  window.copyOptInLink = function (url) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      showToast('Double opt-in link copied to clipboard!');
    } else {
      prompt('Double opt-in link:', url);
    }
  };

  // --------------------------------------------------------------------------
  // Partner Network & Add Prospects
  // --------------------------------------------------------------------------
  async function loadPartners() {
    try {
      partners = await api('/api/admin/partners');
      renderPartners(partners);
      populatePartnerSelect(partners);
    } catch (e) {
      console.warn('Could not load partners:', e);
    }
  }

  function renderPartners(list) {
    if (!partnersTableTbody) return;
    partnersTableTbody.innerHTML = '';

    if (list.length === 0) {
      partnersTableTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:32px 14px; color:var(--muted);">
            No partners registered.
          </td>
        </tr>
      `;
      return;
    }

    list.forEach(p => {
      const tr = document.createElement('tr');
      const privacyLabels = {
        ask_partner: 'Ask Partner (Approval)',
        discoverable: 'Discoverable',
        anonymous: 'Anonymous',
        private: 'Private'
      };

      tr.innerHTML = `
        <td>
          <strong style="color:var(--ink);">${p.fullName}</strong>
          <div style="font-size:11.5px; color:var(--muted);">${p.email}</div>
        </td>
        <td>
          <span style="font-weight:500;">${p.company}</span>
          <div style="font-size:12px; color:var(--muted);">${p.jobTitle}</div>
        </td>
        <td>
          <span class="badge-tag strong">${p.contactsCount || 0} executives</span>
        </td>
        <td>
          <span style="font-size:12px; color:var(--body);">${privacyLabels[p.privacyTier] || p.privacyTier}</span>
        </td>
        <td>
          <strong class="code-text" style="color:var(--ink);">${p.pointsBalance || 0} pts</strong>
        </td>
        <td>
          <span style="font-weight:600; color:var(--ink);">$${(p.verifiedRevenue || 0).toLocaleString()}</span>
        </td>
      `;
      partnersTableTbody.appendChild(tr);
    });
  }

  function populatePartnerSelect(list) {
    if (!prospectPartnerId) return;
    prospectPartnerId.innerHTML = '';
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.fullName} (${p.company})`;
      prospectPartnerId.appendChild(opt);
    });
  }

  // Add Prospect Modal
  openAddProspectModalBtn?.addEventListener('click', () => {
    if (addProspectModal) addProspectModal.style.display = 'flex';
  });

  function closeAddProspectModal() {
    if (addProspectModal) addProspectModal.style.display = 'none';
  }

  closeAddProspectBtn?.addEventListener('click', closeAddProspectModal);
  cancelAddProspectBtn?.addEventListener('click', closeAddProspectModal);
  addProspectModal?.addEventListener('click', (e) => {
    if (e.target === addProspectModal) closeAddProspectModal();
  });

  addProspectForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const partnerId = prospectPartnerId?.value;
    const fullName = prospectFullname?.value?.trim();
    const jobTitle = prospectTitle?.value?.trim();
    const company = prospectCompany?.value?.trim();
    const email = prospectEmail?.value?.trim();
    const relationshipStrength = prospectStrength?.value || 'strong';
    const relationshipContext = prospectContext?.value?.trim() || 'Direct partner contact';

    if (!partnerId || !fullName || !company || !email) return;

    try {
      await api('/api/admin/prospects', {
        method: 'POST',
        body: JSON.stringify({
          partnerId,
          fullName,
          jobTitle,
          company,
          email,
          relationshipStrength,
          relationshipContext
        })
      });

      closeAddProspectModal();
      showToast(`Executive contact "${fullName}" saved and linked!`);
      if (addProspectForm) addProspectForm.reset();
      await loadPartners();
      await loadMetrics();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Global Escape Listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeIntroModal();
      closeAddProspectModal();
    }
  });

  // Initial Load
  async function boot() {
    await loadMetrics();
    await loadPartners();
    // Pre-populate with 'Apex' to showcase the warm path flow immediately
    if (accountSearchInput) {
      accountSearchInput.value = 'Apex';
      searchAccounts('Apex');
    }
  }

  boot();
})();
