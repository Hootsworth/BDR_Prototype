(() => {
  const tokenKey = 'partner-workspace-token';
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const incomingToken = hashParams.get('token');
  if (incomingToken) {
    sessionStorage.setItem(tokenKey, incomingToken);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  let token = incomingToken || sessionStorage.getItem(tokenKey) || '';
  const body = document.getElementById('contacts-body');
  const errorBox = document.getElementById('page-error');
  const form = document.getElementById('referral-form');
  const button = document.getElementById('submit-button');
  const bulkPanel = document.getElementById('bulk-referral-panel');
  const bulkRowsBody = document.getElementById('bulk-rows-body');
  const bulkSubmitBtn = document.getElementById('bulk-submit-button');
  const modeSingleBtn = document.getElementById('mode-single-btn');
  const modeBulkBtn = document.getElementById('mode-bulk-btn');
  const toggleMultiEditBtn = document.getElementById('toggle-multi-edit-btn');
  const multiEditBar = document.getElementById('multi-edit-bar');
  const authSection = document.getElementById('portal-auth-section');
  const workspaceContent = document.getElementById('portal-workspace-content');
  const signoutBtn = document.getElementById('portal-signout-btn');
  const clerkMount = document.getElementById('clerk-auth-mount');
  const clerkSignupMount = document.getElementById('clerk-signup-mount');
  const onboardingForm = document.getElementById('portal-onboarding-form');
  const authTabs = document.getElementById('portal-auth-tabs');
  let clerkListenerAdded = false;
  let selectedAuthMode = 'signin';

  function loadPartnerClerk() {
    const key = window.ClerkConfig?.publishableKey || '';
    if (!key || key.includes('placeholder')) return Promise.reject(new Error('Secure sign-in is not configured for this portal.'));
    if (window.Clerk?.user || (window.Clerk && typeof window.Clerk.mountSignIn === 'function')) return Promise.resolve(window.Clerk);
    if (!window.__partnerClerkPromise) {
      let frontendApi;
      try {
        const encoded = key.split('_')[2];
        frontendApi = atob(encoded.replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, '');
        if (!/^[a-z0-9.-]+$/i.test(frontendApi)) throw new Error('Invalid Clerk frontend domain.');
      } catch (_) { return Promise.reject(new Error('The Clerk publishable key is invalid.')); }
      const add = (url, publishableKey = '') => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url; script.async = true; script.crossOrigin = 'anonymous';
        if (publishableKey) script.setAttribute('data-clerk-publishable-key', publishableKey);
        script.onload = resolve; script.onerror = () => reject(new Error('Could not load secure sign-in.'));
        document.head.appendChild(script);
      });
      window.__partnerClerkPromise = (async () => {
        const base = `https://${frontendApi}/npm`;
        await add(`${base}/@clerk/ui@1/dist/ui.browser.js`);
        await add(`${base}/@clerk/clerk-js@6/dist/clerk.browser.js`, key);
        if (typeof window.Clerk === 'function') {
          const instance = new window.Clerk(key);
          await instance.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
          window.Clerk = instance;
        } else if (window.Clerk?.load) {
          await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
        }
        return window.Clerk;
      })();
    }
    return window.__partnerClerkPromise;
  }

  let partner = null;
  let currentContacts = [];
  let currentRewardLedger = [];
  let currentRewardRedemptions = [];
  let currentRewardPoints = 0;
  let isMultiEditMode = false;
  let workspaceCalendlyUrl = 'https://calendly.com/company-gtm/intro-call';

  function escapeHTML(val) {
    return String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showAuthView(message = '') {
    if (authSection) authSection.hidden = false;
    if (workspaceContent) workspaceContent.hidden = true;
    if (signoutBtn) signoutBtn.hidden = true;
    document.getElementById('partner-name').textContent = 'Influencer workspace';
    document.getElementById('partner-company').textContent = 'A trusted network, with clear next steps and rewards you can choose.';
    if (message) {
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    } else {
      errorBox.style.display = 'none';
    }
  }

  function showWorkspaceView() {
    if (authSection) authSection.hidden = true;
    if (workspaceContent) workspaceContent.hidden = false;
    if (signoutBtn) signoutBtn.hidden = false;
    errorBox.style.display = 'none';
    const introSection = document.getElementById('introduction-section');
    if (introSection) introSection.hidden = false;
  }

  function showError(message) {
    showAuthView(message);
  }

  function createCell(text, secondary = '') {
    const td = document.createElement('td');
    td.textContent = text || '';
    if (secondary) {
      const small = document.createElement('small');
      small.textContent = secondary;
      td.appendChild(small);
    }
    return td;
  }

  function createMultiEditTableRow(contact = {}) {
    const tr = document.createElement('tr');
    if (contact.id) tr.dataset.contactId = String(contact.id);
    const statusVal = contact.status === 'completed' ? 'completed' : contact.status === 'scheduled' ? 'scheduled' : 'pending';
    tr.innerHTML = `
      <td>
        <div style="display:grid;gap:6px;">
          <input class="inline-edit-input" data-field="fullName" value="${escapeHTML(contact.fullName || '')}" placeholder="Full name *" required>
          <input class="inline-edit-input" type="email" data-field="email" value="${escapeHTML(contact.email || '')}" placeholder="Work email *" required>
        </div>
      </td>
      <td>
        <div style="display:grid;gap:6px;">
          <input class="inline-edit-input" data-field="company" value="${escapeHTML(contact.company || '')}" placeholder="Company *" required>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <input class="inline-edit-input" data-field="jobTitle" value="${escapeHTML(contact.jobTitle || '')}" placeholder="Job title">
            <input class="inline-edit-input" type="tel" data-field="phone" value="${escapeHTML(contact.phone || '')}" placeholder="Phone">
          </div>
          <input class="inline-edit-input" type="url" data-field="linkedinUrl" value="${escapeHTML(contact.linkedinUrl || '')}" placeholder="https://www.linkedin.com/in/username">
        </div>
      </td>
      <td>
        <select class="inline-edit-select" data-field="status">
          <option value="pending" ${statusVal === 'pending' ? 'selected' : ''}>Not scheduled</option>
          <option value="scheduled" ${statusVal === 'scheduled' || statusVal === 'completed' ? 'selected' : ''}>Scheduled (no points until verified)</option>
          <option value="completed" disabled>Completed (buyer confirmation required)</option>
        </select>
      </td>
    `;
    return tr;
  }

  function renderContactsTable() {
    body.replaceChildren();
    if (multiEditBar) multiEditBar.hidden = !isMultiEditMode;
    if (toggleMultiEditBtn) {
      toggleMultiEditBtn.textContent = isMultiEditMode ? 'Exit multi-record edit' : 'Multi-record edit';
    }

    if (isMultiEditMode) {
      if (!currentContacts.length) {
        body.appendChild(createMultiEditTableRow({}));
      } else {
        currentContacts.forEach(contact => {
          body.appendChild(createMultiEditTableRow(contact));
        });
      }
      return;
    }

    if (!currentContacts.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'empty';
      td.textContent = 'No introductions yet. Add the first one below.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    currentContacts.forEach(contact => {
      const row = document.createElement('tr');
      const contactTd = createCell(contact.fullName, contact.email);
      if (contact.linkedinUrl) {
        const liLink = document.createElement('a');
        liLink.href = contact.linkedinUrl;
        liLink.target = '_blank';
        liLink.rel = 'noopener noreferrer';
        liLink.textContent = 'Open LinkedIn profile';
        liLink.style.cssText = 'display:inline-block;margin-top:4px;font-size:11px;color:var(--ink);';
        contactTd.appendChild(liLink);
      }
      row.appendChild(contactTd);
      row.appendChild(createCell(contact.company, [contact.jobTitle, contact.phone].filter(Boolean).join(' · ')));

      const status = contact.status === 'completed' ? 'Meeting completion pending buyer confirmation' : contact.status === 'scheduled' ? 'Meeting scheduled · no points yet' : 'Introduction recorded · verification pending';
      const statusTd = createCell(status);
      if (contact.status !== 'completed' && workspaceCalendlyUrl) {
        const bookLink = document.createElement('a');
        const sep = workspaceCalendlyUrl.includes('?') ? '&' : '?';
        bookLink.href = `${workspaceCalendlyUrl}${sep}name=${encodeURIComponent(contact.fullName || '')}&email=${encodeURIComponent(contact.email || '')}`;
        bookLink.target = '_blank';
        bookLink.rel = 'noopener noreferrer';
        bookLink.textContent = 'Schedule GTM call';
        bookLink.style.cssText = 'display:inline-block;margin-top:5px;font-size:11px;color:var(--ok);font-weight:500;';
        statusTd.appendChild(bookLink);
      }
      row.appendChild(statusTd);
      body.appendChild(row);
    });
  }

  function renderAgreementState() {
    const badgeEl = document.getElementById('partner-agreement-badge');
    const descEl = document.getElementById('partner-agreement-desc');
    const signBtn = document.getElementById('partner-sign-agreement-btn');
    const hasSigned = Boolean(partner && partner.hasSignedAgreement);
    if (badgeEl) {
      badgeEl.className = `portal-badge ${hasSigned ? 'ok' : 'warn'}`;
      badgeEl.textContent = hasSigned ? 'Signed & Active' : 'Agreement Pending';
    }
    if (descEl) {
      const latestAgr = Array.isArray(partner?.agreements) && partner.agreements.length ? partner.agreements[0] : null;
      descEl.textContent = hasSigned
        ? `${latestAgr?.name || 'IRM Partner Network Agreement'} · Active since ${latestAgr?.uploadedAt || '2026'}. Your partner profile is active.`
        : 'Review and sign the Partner Network Agreement to activate your partner profile.';
    }
    if (signBtn) {
      signBtn.hidden = hasSigned;
    }
  }

  function render(data) {
    showWorkspaceView();
    partner = data.influencer || {};
    currentContacts = data.contacts || [];
    currentRewardLedger = data.rewardLedger || [];
    currentRewardRedemptions = data.rewardRedemptions || [];
    currentRewardPoints = Number(data.rewardPoints || 0);
    if (data.calendlyUrl) workspaceCalendlyUrl = data.calendlyUrl;
    document.getElementById('partner-name').textContent = partner.fullName || 'Partner workspace';
    document.getElementById('partner-company').textContent = [partner.jobTitle, partner.company].filter(Boolean).join(' · ') || 'Your introductions and their next steps.';
    document.getElementById('total-count').textContent = currentContacts.length;
    const scheduledCount = currentContacts.filter(contact => contact.status === 'scheduled' || contact.status === 'completed').length;
    const completedCount = currentContacts.filter(contact => contact.status === 'completed').length;
    document.getElementById('scheduled-count').textContent = scheduledCount;
    document.getElementById('completed-count').textContent = completedCount;
    const totalCredits = Number(data.rewardPoints ?? partner.referralCredits ?? 0);
    const creditsEl = document.getElementById('partner-credits');
    if (creditsEl) creditsEl.textContent = `${totalCredits.toLocaleString()} approved points`;
    const payoutEl = document.getElementById('partner-payout');
    if (payoutEl) payoutEl.textContent = 'Manual';
    const openCalendlyEl = document.getElementById('partner-calendly-open-link');
    if (openCalendlyEl && workspaceCalendlyUrl) openCalendlyEl.href = workspaceCalendlyUrl;
    document.getElementById('visible-count').textContent = `${currentContacts.length} contact${currentContacts.length === 1 ? '' : 's'}`;
    renderAgreementState();
    renderRewards();
    renderContactsTable();
  }

  function renderRewards() {
    const balance = document.getElementById('partner-reward-balance');
    const available = Math.max(0, currentRewardPoints - currentRewardRedemptions.filter(r => ['requested', 'approved', 'fulfilling'].includes(r.status)).reduce((sum, r) => sum + Number(r.points || 0), 0));
    if (balance) balance.textContent = `${available.toLocaleString()} available points`;
    const tbody = document.getElementById('partner-reward-redemptions');
    if (!tbody) return;
    if (!currentRewardRedemptions.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No redemption requests.</td></tr>';
      return;
    }
    tbody.replaceChildren(...currentRewardRedemptions.map(r => {
      const tr = document.createElement('tr');
      tr.append(createCell(String(r.rewardType || '').replaceAll('_', ' ')), createCell(`${Number(r.points || 0).toLocaleString()} pts`), createCell(r.status || 'requested'), createCell(r.createdAt || ''));
      return tr;
    }));
  }

  document.getElementById('partner-reward-redemption-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = document.getElementById('partner-reward-feedback');
    try {
      const response = await request('/api/partner-share/rewards/redeem', {
        method: 'POST', body: JSON.stringify({
          rewardType: document.getElementById('partner-reward-type').value,
          points: Number(document.getElementById('partner-reward-points').value),
          details: document.getElementById('partner-reward-details').value
        })
      });
      if (feedback) feedback.textContent = `Request submitted for IRM review. ${response.availablePoints} points remain available. This is not a cash payment or fulfillment confirmation.`;
      event.currentTarget.reset();
      render(await request('/api/partner-share'));
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
    }
  });

  document.getElementById('partner-calendly-copy-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(workspaceCalendlyUrl);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Booking Link'; }, 1600);
    } catch (_) {}
  });

  document.getElementById('partner-sign-agreement-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await request('/api/partner-share/agreement', {
        method: 'POST',
        body: JSON.stringify({
          signerName: partner?.fullName || 'Influencer Partner',
          name: 'IRM Partner Network Agreement (Model 2)'
        })
      });
      render(await request('/api/partner-share'));
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  async function request(path, options = {}) {
    let authHeader = token ? `Bearer ${token}` : '';
    if (!authHeader && window.Clerk?.session) {
      try {
        const clerkToken = await window.Clerk.session.getToken();
        if (clerkToken) authHeader = `Bearer ${clerkToken}`;
      } catch (_) {}
    }
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  const tabSignin = document.getElementById('portal-tab-signin');
  const tabSignup = document.getElementById('portal-tab-signup');
  const signinSwitchline = document.getElementById('portal-auth-switch-signin');
  const signupSwitchline = document.getElementById('portal-auth-switch-signup');
  const mountedAuthModes = new Set();
  function mountClerkAuth(mode) {
    const mount = mode === 'signin' ? clerkMount : clerkSignupMount;
    if (!window.Clerk || !mount || mountedAuthModes.has(mode)) return;
    try {
      mount.querySelector('.clerk-loading')?.remove();
      const appearance = { variables: { colorPrimary: '#315f4d', colorText: '#202925', colorBackground: '#fbfcfa', colorInputBackground: '#ffffff', colorInputText: '#202925', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif' }, options: { socialButtonsVariant: 'iconButton', socialButtonsPlacement: 'top' }, elements: { card: { boxShadow: 'none', border: '0', background: 'transparent' }, rootBox: { width: '100%' }, footer: { display: 'none' } } };
      // Keep Clerk's component links and post-auth return on this portal page.
      // Without force redirects Clerk falls back to `/`, the IRM admin console.
      const portalUrl = `${window.location.origin}${window.location.pathname}`;
      const options = {
        appearance,
        signInUrl: portalUrl,
        signUpUrl: portalUrl,
        signInForceRedirectUrl: portalUrl,
        signUpForceRedirectUrl: portalUrl,
        signInFallbackRedirectUrl: portalUrl,
        signUpFallbackRedirectUrl: portalUrl
      };
      if (mode === 'signin') window.Clerk.mountSignIn(mount, options);
      else window.Clerk.mountSignUp(mount, options);
      mountedAuthModes.add(mode);
    } catch (error) {
      mount.textContent = error.message || 'Secure sign-in could not be shown.';
    }
  }
  function chooseAuthMode(mode) {
    const authError = document.getElementById('portal-auth-error');
    if (authError) authError.textContent = '';
    selectedAuthMode = mode;
    const isSignin = mode === 'signin';
    tabSignin?.classList.toggle('active', isSignin);
    tabSignup?.classList.toggle('active', !isSignin);
    tabSignin?.setAttribute('aria-selected', String(isSignin));
    tabSignup?.setAttribute('aria-selected', String(!isSignin));
    authTabs.hidden = false;
    onboardingForm.hidden = true;
    clerkMount.hidden = !isSignin;
    clerkSignupMount.hidden = isSignin;
    signinSwitchline.hidden = isSignin;
    signupSwitchline.hidden = !isSignin;
    mountClerkAuth(mode);
  }
  tabSignin?.addEventListener('click', () => chooseAuthMode('signin'));
  tabSignup?.addEventListener('click', () => chooseAuthMode('signup'));
  document.getElementById('portal-switch-to-signin')?.addEventListener('click', () => chooseAuthMode('signin'));
  document.getElementById('portal-switch-to-signup')?.addEventListener('click', () => chooseAuthMode('signup'));

  onboardingForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = document.getElementById('portal-auth-feedback');
    const submit = document.getElementById('portal-onboarding-submit');
    const values = Object.fromEntries(new FormData(onboardingForm).entries());
    submit.disabled = true;
    feedback.textContent = 'Saving your profile…';
    try {
      const response = await request('/api/partner-portal/onboard', { method: 'POST', body: JSON.stringify(values) });
      token = response.token;
      sessionStorage.setItem(tokenKey, token);
      onboardingForm.reset();
      await load();
    } catch (error) {
      feedback.textContent = error.message;
    } finally { submit.disabled = false; }
  });

  signoutBtn?.addEventListener('click', async () => {
    token = '';
    sessionStorage.removeItem(tokenKey);
    try { await window.Clerk?.signOut(); } catch (_) {}
    showAuthView();
    chooseAuthMode('signin');
  });

  async function load() {
    if (!token) {
      try {
        const authError = document.getElementById('portal-auth-error');
        if (authError) authError.textContent = '';
        await loadPartnerClerk();
        if (!clerkListenerAdded) {
          window.Clerk.addListener?.(({ user }) => {
            if (user && !token) load();
            else if (!user && token) {
              token = '';
              sessionStorage.removeItem(tokenKey);
              showAuthView();
            }
          });
          clerkListenerAdded = true;
        }
        if (window.Clerk.user) {
          const session = await request('/api/partner-portal/session');
          if (session.profileComplete && session.token) {
            token = session.token;
            sessionStorage.setItem(tokenKey, token);
            return load();
          }
          showAuthView();
          clerkMount.hidden = true;
          clerkSignupMount.hidden = true;
          authTabs.hidden = true;
          signinSwitchline.hidden = true;
          signupSwitchline.hidden = true;
          onboardingForm.hidden = false;
          const currentName = session.user?.fullName || window.Clerk.user.fullName || '';
          onboardingForm.elements.fullName.value = currentName;
          return;
        }
        chooseAuthMode(selectedAuthMode);
      } catch (error) {
        const authError = document.getElementById('portal-auth-error');
        if (authError) authError.textContent = error.message;
      }
      return showAuthView();
    }
    try {
      render(await request('/api/partner-share'));
    } catch (error) {
      if (error.message && (error.message.includes('invalid') || error.message.includes('revoked') || error.message.includes('401'))) {
        token = '';
        sessionStorage.removeItem(tokenKey);
        return load();
      }
      showError(error.message);
    }
  }

  // Entry mode switching: One at a time vs Bulk add
  function setEntryMode(mode) {
    const isBulk = mode === 'bulk';
    form.hidden = isBulk;
    if (bulkPanel) bulkPanel.hidden = !isBulk;
    modeSingleBtn?.classList.toggle('active', !isBulk);
    modeSingleBtn?.setAttribute('aria-selected', String(!isBulk));
    modeBulkBtn?.classList.toggle('active', isBulk);
    modeBulkBtn?.setAttribute('aria-selected', String(isBulk));
    if (isBulk && bulkRowsBody && bulkRowsBody.children.length === 0) {
      addBulkRows(3);
    }
  }

  modeSingleBtn?.addEventListener('click', () => setEntryMode('single'));
  modeBulkBtn?.addEventListener('click', () => setEntryMode('bulk'));

  function updateBulkRowNumbers() {
    if (!bulkRowsBody) return;
    const rows = Array.from(bulkRowsBody.querySelectorAll('tr'));
    rows.forEach((tr, idx) => {
      const numCell = tr.querySelector('.row-num');
      if (numCell) numCell.textContent = String(idx + 1);
    });
    const countLabel = document.getElementById('bulk-row-count');
    if (countLabel) countLabel.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
  }

  function addBulkRows(count = 1, items = null) {
    if (!bulkRowsBody) return;
    const list = Array.isArray(items) ? items : Array.from({ length: count }, () => ({}));
    list.forEach(item => {
      const tr = document.createElement('tr');
      const statusVal = item.status || 'pending';
      tr.innerHTML = `
        <td class="row-num" style="color:var(--muted);font-size:11px;text-align:center;">1</td>
        <td><input data-field="fullName" value="${escapeHTML(item.fullName || '')}" placeholder="Jordan Vance"></td>
        <td><input type="email" data-field="email" value="${escapeHTML(item.email || '')}" placeholder="jordan@company.com"></td>
        <td><input data-field="company" value="${escapeHTML(item.company || '')}" placeholder="Pacific Crest CU"></td>
        <td><input data-field="jobTitle" value="${escapeHTML(item.jobTitle || '')}" placeholder="CLO"></td>
        <td><input type="tel" data-field="phone" value="${escapeHTML(item.phone || '')}" placeholder="+1 415 555 0192"></td>
        <td><input type="url" data-field="linkedinUrl" value="${escapeHTML(item.linkedinUrl || '')}" placeholder="https://www.linkedin.com/in/..."></td>
        <td>
          <select data-field="status">
            <option value="pending" ${statusVal === 'pending' ? 'selected' : ''}>Not scheduled</option>
            <option value="scheduled" ${statusVal === 'scheduled' ? 'selected' : ''}>Scheduled</option>
            <option value="completed" ${statusVal === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </td>
        <td style="text-align:center;"><button type="button" class="bulk-remove-btn" aria-label="Remove row">&times;</button></td>
      `;
      tr.querySelector('.bulk-remove-btn')?.addEventListener('click', () => {
        tr.remove();
        if (bulkRowsBody.children.length === 0) addBulkRows(1);
        else updateBulkRowNumbers();
      });
      bulkRowsBody.appendChild(tr);
    });
    updateBulkRowNumbers();
  }

  function parseSpreadsheetText(rawText) {
    const lines = String(rawText || '').split(/\r?\n/).filter(l => l.trim());
    const results = [];
    function parseDelimitedLine(line, delimiter) {
      const cells = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
          else quoted = !quoted;
        } else if (ch === delimiter && !quoted) {
          cells.push(cell.trim()); cell = '';
        } else cell += ch;
      }
      if (quoted) throw new Error('A pasted CSV row has an unmatched quote.');
      cells.push(cell.trim());
      return cells;
    }
    lines.forEach((line, idx) => {
      const cells = parseDelimitedLine(line, line.includes('\t') ? '\t' : ',');
      if (!cells.length) return;
      if (idx === 0 && ((cells[0] || '').toLowerCase().includes('name') || (cells[1] || '').toLowerCase().includes('email'))) {
        return;
      }
      const rawStatus = (cells[5] || '').toLowerCase();
      let status = 'pending';
      if (rawStatus.includes('comp') || rawStatus.includes('taken')) status = 'completed';
      else if (rawStatus.includes('sched')) status = 'scheduled';
      results.push({
        fullName: cells[0] || '',
        email: cells[1] || '',
        company: cells[2] || '',
        jobTitle: cells[3] || '',
        phone: cells[4] || '',
        status,
        linkedinUrl: cells[6] || ''
      });
    });
    return results;
  }

  document.getElementById('bulk-add-row-btn')?.addEventListener('click', () => addBulkRows(1));
  document.getElementById('bulk-add-5-btn')?.addEventListener('click', () => addBulkRows(5));
  document.getElementById('bulk-clear-btn')?.addEventListener('click', () => {
    if (bulkRowsBody) bulkRowsBody.replaceChildren();
    addBulkRows(3);
  });

  const pasteBox = document.getElementById('bulk-paste-box');
  document.getElementById('bulk-paste-toggle-btn')?.addEventListener('click', () => {
    if (pasteBox) pasteBox.hidden = !pasteBox.hidden;
  });
  document.getElementById('bulk-cancel-paste-btn')?.addEventListener('click', () => {
    if (pasteBox) pasteBox.hidden = true;
  });
  document.getElementById('bulk-parse-paste-btn')?.addEventListener('click', () => {
    const input = document.getElementById('bulk-paste-input');
    const parsed = parseSpreadsheetText(input?.value || '');
    if (!parsed.length) return;
    if (bulkRowsBody) {
      const allEmpty = Array.from(bulkRowsBody.querySelectorAll('tr')).every(tr =>
        Array.from(tr.querySelectorAll('input')).every(inp => !inp.value.trim())
      );
      if (allEmpty) bulkRowsBody.replaceChildren();
    }
    addBulkRows(parsed.length, parsed);
    if (input) input.value = '';
    if (pasteBox) pasteBox.hidden = true;
  });

  bulkRowsBody?.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\n') && !text.includes('\t')) return;
    const parsed = parseSpreadsheetText(text);
    if (parsed.length <= 1 && !text.includes('\t')) return;
    event.preventDefault();
    const allEmpty = Array.from(bulkRowsBody.querySelectorAll('tr')).every(tr =>
      Array.from(tr.querySelectorAll('input')).every(inp => !inp.value.trim())
    );
    if (allEmpty) bulkRowsBody.replaceChildren();
    addBulkRows(parsed.length, parsed);
  });

  function collectTableContacts(tbodyEl) {
    if (!tbodyEl) return [];
    const contacts = [];
    for (const tr of tbodyEl.querySelectorAll('tr')) {
      const val = field => (tr.querySelector(`[data-field="${field}"]`)?.value || '').trim();
      const fullName = val('fullName');
      const email = val('email');
      const company = val('company');
      const jobTitle = val('jobTitle');
      const phone = val('phone');
      const linkedinUrl = val('linkedinUrl');
      const status = val('status') || 'pending';
      if (!fullName && !email && !company && !jobTitle && !phone && !linkedinUrl) continue;
      contacts.push({
        id: tr.dataset.contactId || undefined,
        fullName,
        email,
        company,
        jobTitle,
        phone,
        linkedinUrl,
        status,
        hasScheduledCall: status === 'scheduled' || status === 'completed',
        hasTakenCall: status === 'completed'
      });
    }
    return contacts;
  }

  bulkSubmitBtn?.addEventListener('click', async () => {
    const contacts = collectTableContacts(bulkRowsBody);
    const feedback = document.getElementById('bulk-feedback');
    if (!contacts.length) {
      feedback.className = 'error';
      feedback.textContent = 'Enter at least one contact with Full Name, Work Email, and Company.';
      return;
    }
    const incomplete = contacts.find(c => !c.fullName || !c.email || !c.company);
    if (incomplete) {
      feedback.className = 'error';
      feedback.textContent = 'Every non-empty row requires Full Name, Work Email, and Company.';
      return;
    }
    bulkSubmitBtn.disabled = true;
    feedback.className = '';
    feedback.textContent = 'Saving introductions…';
    try {
      const res = await request('/api/partner-share/referrals', {
        method: 'POST',
        body: JSON.stringify({ contacts })
      });
      const hasRejected = Boolean(res.invalid || res.duplicates?.length);
      if (!hasRejected) {
        if (bulkRowsBody) bulkRowsBody.replaceChildren();
        addBulkRows(3);
      }
      feedback.className = hasRejected ? 'error' : 'success';
      const parts = [];
      if (res.created) parts.push(`${res.created} added`);
      if (res.updated) parts.push(`${res.updated} updated`);
      if (res.linked) parts.push(`${res.linked} linked`);
      if (res.duplicates?.length) parts.push(`${res.duplicates.length} duplicate skipped`);
      if (res.invalid) parts.push(`${res.invalid} invalid row${res.invalid === 1 ? '' : 's'}`);
      feedback.textContent = `${hasRejected ? 'Partially saved' : 'Saved'} (${parts.join(', ') || 'completed'}). ${hasRejected ? 'Correct rejected rows and submit again.' : ''}`;
      render(await request('/api/partner-share'));
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = error.message;
    } finally {
      bulkSubmitBtn.disabled = false;
    }
  });

  // Multi-record edit on existing Referred Contacts table
  toggleMultiEditBtn?.addEventListener('click', () => {
    isMultiEditMode = !isMultiEditMode;
    const feedback = document.getElementById('multi-edit-feedback');
    if (feedback) { feedback.className = ''; feedback.textContent = ''; }
    renderContactsTable();
  });
  document.getElementById('multi-edit-cancel-btn')?.addEventListener('click', () => {
    isMultiEditMode = false;
    renderContactsTable();
  });
  document.getElementById('multi-edit-add-row-btn')?.addEventListener('click', () => {
    body.appendChild(createMultiEditTableRow({}));
  });
  document.getElementById('multi-edit-save-btn')?.addEventListener('click', async () => {
    const contacts = collectTableContacts(body);
    const feedback = document.getElementById('multi-edit-feedback');
    const saveBtn = document.getElementById('multi-edit-save-btn');
    if (!contacts.length) {
      isMultiEditMode = false;
      renderContactsTable();
      return;
    }
    const incomplete = contacts.find(c => !c.fullName || !c.email || (!c.id && !c.company));
    if (incomplete) {
      feedback.className = 'error';
      feedback.textContent = 'Each row needs Full Name, Work Email, and Company.';
      return;
    }
    saveBtn.disabled = true;
    feedback.className = '';
    feedback.textContent = 'Saving changes…';
    try {
      await request('/api/partner-share/referrals', {
        method: 'POST',
        body: JSON.stringify({ contacts })
      });
      isMultiEditMode = false;
      render(await request('/api/partner-share'));
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = error.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const status = formData.get('status');
    const payload = {
      fullName: String(formData.get('fullName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      company: String(formData.get('company') || '').trim(),
      jobTitle: String(formData.get('jobTitle') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      linkedinUrl: String(formData.get('linkedinUrl') || '').trim(),
      hasScheduledCall: status === 'scheduled' || status === 'completed',
      hasTakenCall: status === 'completed'
    };
    button.disabled = true;
    const feedback = document.getElementById('feedback');
    feedback.className = '';
    feedback.textContent = 'Saving…';
    try {
      await request('/api/partner-share/referrals', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      feedback.className = 'success';
      feedback.textContent = 'Introduction saved.';
      render(await request('/api/partner-share'));
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = error.message;
    } finally { button.disabled = false; }
  });

  load();
})();
