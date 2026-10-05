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

  const viewContactsBtn = document.getElementById('net-view-contacts-btn');
  const viewInfluencersBtn = document.getElementById('net-view-influencers-btn');
  const contactsTableWrap = document.getElementById('network-contacts-table-wrap');
  const influencersTableWrap = document.getElementById('network-influencers-table-wrap');
  const searchInput = document.getElementById('network-search-input');
  const infFilterSelect = document.getElementById('network-influencer-filter');

  const introDialog = document.getElementById('intro-request-dialog');
  const introForm = document.getElementById('intro-request-form');

  let currentVendor = null;
  let networkData = { influencers: [], contacts: [], organizations: [], requests: [] };
  let activeNetworkView = 'contacts';

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
    document.getElementById('step-vendor-status').textContent = 'Sign up on Marketplace';
    document.getElementById('step-network-status').textContent = 'Locked until Agreement signed';
  }

  function renderVendorRequests(requests) {
    const tbody = document.getElementById('vendor-requests-tbody');
    const countBadge = document.getElementById('vendor-requests-count');
    if (countBadge) {
      countBadge.textContent = `${requests.length} request${requests.length === 1 ? '' : 's'}`;
    }
    if (!tbody) return;
    tbody.replaceChildren();
    if (!requests.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No warm introductions requested yet. Browse the network below to request your first intro.</td></tr>';
      return;
    }
    const contactsById = new Map((networkData.contacts || []).map(c => [String(c.id), c]));
    requests.forEach(req => {
      const tr = document.createElement('tr');
      const status = String(req.status || 'requested').toLowerCase();
      const matchedContact = contactsById.get(String(req.targetContactId || ''));
      let statusLabel = 'Requested · Pending IRM / Influencer';
      let badgeCls = 'warn';
      if (status === 'irm_approved') {
        statusLabel = 'IRM Approved · Routed to Influencer';
        badgeCls = 'warn';
      } else if (status === 'influencer_accepted' || status === 'call_scheduled') {
        statusLabel = 'Accepted & Call Scheduled';
        badgeCls = 'ok';
      } else if (status === 'call_completed') {
        statusLabel = 'Briefing Call Completed';
        badgeCls = 'ok';
      } else if (status === 'declined') {
        statusLabel = 'Declined';
        badgeCls = 'locked';
      }
      const unlockedDetails = matchedContact && matchedContact.piiUnlocked
        ? `<small style="color:var(--ok);font-weight:600;">Unlocked: ${escapeHTML(matchedContact.fullName)} · ${escapeHTML(matchedContact.email)}${matchedContact.phone ? ` · ${escapeHTML(matchedContact.phone)}` : ''}</small>`
        : `<small>Contact email &amp; phone unlock automatically once the Influencer accepts.</small>`;
      tr.innerHTML = `
        <td>
          <strong>${escapeHTML(req.targetCompany || 'Target Account')}</strong>
          <small>${escapeHTML(req.targetJobTitle || 'Executive')} · ${escapeHTML(matchedContact?.piiUnlocked ? matchedContact.fullName : (req.targetContactName || 'Network Contact'))}</small>
        </td>
        <td>
          <strong>${escapeHTML(req.influencerName || 'IRM Partner')}</strong>
          <small>Verified IRM Network Partner</small>
        </td>
        <td>${escapeHTML(req.vendorPitch || '')}</td>
        <td>
          <span class="badge ${badgeCls}">${escapeHTML(statusLabel)}</span>
          ${unlockedDetails}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderNetworkDirectory() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const infFilter = infFilterSelect?.value || 'all';
    const requestedContactIds = new Set(
      (networkData.requests || [])
        .filter(r => r.status !== 'declined' && r.targetContactId != null)
        .map(r => String(r.targetContactId))
    );

    if (activeNetworkView === 'contacts') {
      if (contactsTableWrap) contactsTableWrap.hidden = false;
      if (influencersTableWrap) influencersTableWrap.hidden = true;
      const filtered = (networkData.contacts || []).filter(c => {
        if (infFilter !== 'all' && String(c.influencerId) !== String(infFilter)) return false;
        if (!query) return true;
        return [c.company, c.jobTitle, c.industry, c.location, c.influencerName, c.fullName]
          .some(val => String(val || '').toLowerCase().includes(query));
      });
      const countEl = document.getElementById('network-visible-count');
      if (countEl) {
        countEl.textContent = `Showing ${Math.min(filtered.length, 60)} of ${filtered.length} network contacts`;
      }
      const tbody = document.getElementById('network-contacts-tbody');
      if (!tbody) return;
      tbody.replaceChildren();
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No network contacts match your current filters.</td></tr>';
        return;
      }
      filtered.slice(0, 60).forEach(contact => {
        const tr = document.createElement('tr');
        const alreadyRequested = requestedContactIds.has(String(contact.id));
        tr.innerHTML = `
          <td>
            <strong>${escapeHTML(contact.company)}</strong>
            <small>${escapeHTML(contact.jobTitle)}${contact.assetSize ? ` · ${escapeHTML(contact.assetSize)}` : ''}${contact.location ? ` · ${escapeHTML(contact.location)}` : ''}</small>
          </td>
          <td>
            <strong>${escapeHTML(contact.fullName)}</strong>
            <small>${escapeHTML(contact.email)} · ${escapeHTML(contact.phone)}</small>
          </td>
          <td>
            <strong>${escapeHTML(contact.influencerName)}</strong>
            <small>${escapeHTML(contact.influencerCompany)}</small>
          </td>
          <td>
            ${alreadyRequested
              ? `<span class="badge ok">Intro Requested</span>`
              : `<button type="button" class="btn-sm" data-request-contact="${escapeHTML(contact.id)}">Request Warm Intro</button>`}
          </td>
        `;
        const reqBtn = tr.querySelector('[data-request-contact]');
        reqBtn?.addEventListener('click', () => openIntroRequestModal(contact, null));
        tbody.appendChild(tr);
      });
    } else {
      if (contactsTableWrap) contactsTableWrap.hidden = true;
      if (influencersTableWrap) influencersTableWrap.hidden = false;
      const filteredInf = (networkData.influencers || []).filter(inf => {
        if (infFilter !== 'all' && String(inf.id) !== String(infFilter)) return false;
        if (!query) return true;
        return [inf.fullName, inf.company, inf.jobTitle, ...(inf.organizations || [])]
          .some(val => String(val || '').toLowerCase().includes(query));
      });
      const countEl = document.getElementById('network-visible-count');
      if (countEl) {
        countEl.textContent = `Showing ${filteredInf.length} verified Influencer Partner${filteredInf.length === 1 ? '' : 's'}`;
      }
      const tbody = document.getElementById('network-influencers-tbody');
      if (!tbody) return;
      tbody.replaceChildren();
      if (!filteredInf.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No Influencers match your search.</td></tr>';
        return;
      }
      filteredInf.forEach(inf => {
        const tr = document.createElement('tr');
        const orgList = (inf.organizations || []).slice(0, 4).join(', ');
        tr.innerHTML = `
          <td>
            <strong>${escapeHTML(inf.fullName)}</strong>
            <small>${escapeHTML(inf.jobTitle)}${inf.location ? ` · ${escapeHTML(inf.location)}` : ''}</small>
          </td>
          <td>
            <strong>${escapeHTML(inf.company)}</strong>
            <small>${inf.hasSignedAgreement ? 'Signed IRM Partner Agreement' : 'Verified IRM Partner'}</small>
          </td>
          <td>
            <strong>${escapeHTML(inf.reachCount)} executive relationship${inf.reachCount === 1 ? '' : 's'}</strong>
            <small>${escapeHTML(orgList || 'Multiple target organizations')}</small>
          </td>
          <td>
            <button type="button" class="btn-outline btn-sm" data-filter-inf="${escapeHTML(inf.id)}">View Contacts (${escapeHTML(inf.reachCount)})</button>
          </td>
        `;
        tr.querySelector('[data-filter-inf]')?.addEventListener('click', () => {
          if (infFilterSelect) infFilterSelect.value = String(inf.id);
          activeNetworkView = 'contacts';
          viewContactsBtn?.classList.add('active');
          viewInfluencersBtn?.classList.remove('active');
          renderNetworkDirectory();
        });
        tbody.appendChild(tr);
      });
    }
  }

  function openIntroRequestModal(contact, influencer) {
    document.getElementById('intro-target-contact-id').value = contact ? String(contact.id) : '';
    document.getElementById('intro-influencer-id').value = contact ? String(contact.influencerId || '') : (influencer ? String(influencer.id) : '');
    document.getElementById('intro-target-company').value = contact ? (contact.company || '') : '';
    document.getElementById('intro-target-title').value = contact ? (contact.jobTitle || '') : '';
    document.getElementById('intro-dialog-title').textContent = contact
      ? `Request Warm Intro to ${contact.company}`
      : `Request Intro via ${influencer?.fullName || 'IRM Partner'}`;
    document.getElementById('intro-dialog-subtitle').textContent = contact
      ? `Target: ${contact.jobTitle} (${contact.fullName}) · Facilitated by Influencer Partner ${contact.influencerName}`
      : `Partner: ${influencer?.fullName} (${influencer?.company})`;
    document.getElementById('intro-vendor-pitch').value = currentVendor?.icpDescription || '';
    document.getElementById('intro-dialog-feedback').textContent = '';
    if (typeof introDialog?.showModal === 'function') introDialog.showModal();
    else if (introDialog) introDialog.open = true;
  }

  document.getElementById('intro-cancel-btn')?.addEventListener('click', () => {
    if (typeof introDialog?.close === 'function') introDialog.close();
    else if (introDialog) introDialog.open = false;
  });

  introForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('intro-submit-btn');
    const feedback = document.getElementById('intro-dialog-feedback');
    submitBtn.disabled = true;
    feedback.className = 'feedback-msg';
    feedback.textContent = 'Submitting request to IRM…';
    try {
      await apiRequest('/api/marketplace/requests', {
        method: 'POST',
        body: JSON.stringify({
          targetContactId: document.getElementById('intro-target-contact-id').value || null,
          influencerId: document.getElementById('intro-influencer-id').value || null,
          targetCompany: document.getElementById('intro-target-company').value,
          targetJobTitle: document.getElementById('intro-target-title').value,
          vendorPitch: document.getElementById('intro-vendor-pitch').value.trim()
        })
      });
      if (typeof introDialog?.close === 'function') introDialog.close();
      else if (introDialog) introDialog.open = false;
      await loadVendorSession();
    } catch (err) {
      feedback.className = 'feedback-msg error';
      feedback.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadVendorSession() {
    if (!token) {
      showUnauthenticated();
      return;
    }
    try {
      const meData = await apiRequest('/api/marketplace/vendor/me');
      currentVendor = meData.vendor;
      if (authSection) authSection.hidden = true;
      if (workspaceSection) workspaceSection.hidden = false;
      if (signoutBtn) signoutBtn.hidden = false;

      document.getElementById('kpi-vendor-company').textContent = currentVendor.companyName || 'Vendor';
      const isSigned = currentVendor.agreementStatus === 'signed' && currentVendor.networkAccessLevel !== 'locked';
      document.getElementById('kpi-agreement-status').textContent = isSigned ? 'Signed & Active' : 'Signature Required';
      document.getElementById('kpi-network-access').textContent = isSigned ? 'Unlocked' : 'Locked';
      document.getElementById('kpi-total-influencers').textContent = meData.networkSummary?.totalInfluencers ?? '—';
      document.getElementById('kpi-total-contacts').textContent = meData.networkSummary?.totalNetworkContacts ?? '—';

      document.getElementById('step-vendor-status').textContent = `${currentVendor.companyName} (Registered)`;
      document.getElementById('step-network-status').textContent = isSigned ? 'Network Unlocked' : 'Awaiting Signed Agreement';

      const signerInput = document.getElementById('vendor-signer-name');
      if (signerInput && !signerInput.value) signerInput.value = currentVendor.contactName || '';

      if (!isSigned) {
        if (agreementSection) agreementSection.hidden = false;
        if (signedBanner) signedBanner.hidden = true;
        if (networkSection) networkSection.hidden = true;
        return;
      }

      // Agreement is signed -> show signed banner and fetch unlocked network
      if (agreementSection) agreementSection.hidden = true;
      if (signedBanner) {
        signedBanner.hidden = false;
        const latestAgr = (currentVendor.agreements || [])[0];
        if (latestAgr) {
          document.getElementById('signed-banner-title').textContent = latestAgr.title || 'Model 2 — IRM Master Vendor Network Access Agreement';
          document.getElementById('signed-banner-meta').textContent = `Signed by ${latestAgr.signedBy || currentVendor.contactName} on ${latestAgr.signedAt || '2026'} · Full IRM Network access enabled.`;
        }
      }
      if (networkSection) networkSection.hidden = false;

      const netRes = await apiRequest('/api/marketplace/network');
      networkData = netRes;

      if (infFilterSelect) {
        const prevVal = infFilterSelect.value || 'all';
        infFilterSelect.innerHTML = `<option value="all">All Influencers (${(netRes.influencers || []).length})</option>` +
          (netRes.influencers || []).map(inf => `<option value="${escapeHTML(inf.id)}">${escapeHTML(inf.fullName)} — ${escapeHTML(inf.company)} (${inf.reachCount})</option>`).join('');
        infFilterSelect.value = prevVal;
      }

      renderVendorRequests(netRes.requests || []);
      renderNetworkDirectory();
    } catch (err) {
      token = '';
      sessionStorage.removeItem(tokenKey);
      localStorage.removeItem(tokenKey);
      showUnauthenticated();
    }
  }

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    const btn = document.getElementById('vendor-signup-submit');
    const feedback = document.getElementById('vendor-signup-feedback');
    btn.disabled = true;
    feedback.className = 'feedback-msg';
    feedback.textContent = 'Creating Vendor account…';
    try {
      const res = await apiRequest('/api/marketplace/vendors/signup', {
        method: 'POST',
        body: JSON.stringify({
          companyName: String(fd.get('companyName') || '').trim(),
          contactName: String(fd.get('contactName') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '').trim(),
          website: String(fd.get('website') || '').trim(),
          industry: String(fd.get('industry') || '').trim(),
          calendlyUrl: String(fd.get('calendlyUrl') || '').trim(),
          icpDescription: String(fd.get('icpDescription') || '').trim()
        })
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      localStorage.setItem(tokenKey, token);
      signupForm.reset();
      await loadVendorSession();
    } catch (err) {
      feedback.className = 'feedback-msg error';
      feedback.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const btn = document.getElementById('vendor-login-submit');
    const feedback = document.getElementById('vendor-login-feedback');
    btn.disabled = true;
    feedback.className = 'feedback-msg';
    feedback.textContent = 'Signing in…';
    try {
      const res = await apiRequest('/api/marketplace/vendors/login', {
        method: 'POST',
        body: JSON.stringify({
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '').trim()
        })
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      localStorage.setItem(tokenKey, token);
      loginForm.reset();
      await loadVendorSession();
    } catch (err) {
      feedback.className = 'feedback-msg error';
      feedback.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  agreementForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(agreementForm);
    const btn = document.getElementById('vendor-sign-submit-btn');
    const feedback = document.getElementById('vendor-agreement-feedback');
    const fileInput = document.getElementById('vendor-agreement-file');
    const file = fileInput?.files?.[0] || null;
    btn.disabled = true;
    feedback.className = 'feedback-msg';
    feedback.textContent = 'Recording signed agreement & unlocking network…';
    try {
      let dataUrl = '';
      if (file) {
        dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }
      await apiRequest('/api/marketplace/vendor/agreement', {
        method: 'POST',
        body: JSON.stringify({
          signerName: String(fd.get('signerName') || '').trim(),
          signerTitle: String(fd.get('signerTitle') || '').trim(),
          agreementTitle: String(fd.get('agreementTitle') || '').trim(),
          acceptedTerms: fd.get('acceptedTerms') === 'on',
          dataUrl
        })
      });
      await loadVendorSession();
    } catch (err) {
      feedback.className = 'feedback-msg error';
      feedback.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  viewContactsBtn?.addEventListener('click', () => {
    activeNetworkView = 'contacts';
    viewContactsBtn.classList.add('active');
    viewInfluencersBtn?.classList.remove('active');
    renderNetworkDirectory();
  });

  viewInfluencersBtn?.addEventListener('click', () => {
    activeNetworkView = 'influencers';
    viewInfluencersBtn.classList.add('active');
    viewContactsBtn?.classList.remove('active');
    renderNetworkDirectory();
  });

  searchInput?.addEventListener('input', () => renderNetworkDirectory());
  infFilterSelect?.addEventListener('change', () => renderNetworkDirectory());

  signoutBtn?.addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(tokenKey);
    showUnauthenticated();
  });

  loadVendorSession();
})();
