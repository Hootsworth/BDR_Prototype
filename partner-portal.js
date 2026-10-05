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

  let partner = null;
  let currentContacts = [];
  let currentMarketplaceRequests = [];
  let isMultiEditMode = false;
  let workspaceCalendlyUrl = 'https://calendly.com/company-gtm/intro-call';

  function escapeHTML(val) {
    return String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showAuthView(message = '') {
    if (authSection) authSection.hidden = false;
    if (workspaceContent) workspaceContent.hidden = true;
    if (signoutBtn) signoutBtn.hidden = true;
    document.getElementById('partner-name').textContent = 'Influencer Partner Portal';
    document.getElementById('partner-company').textContent = 'Sign up or sign in to manage your network referrals, sign your Partner Agreement, and fulfill Vendor introduction requests.';
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
          <option value="pending" ${statusVal === 'pending' ? 'selected' : ''}>Not scheduled (+10 credits)</option>
          <option value="scheduled" ${statusVal === 'scheduled' || statusVal === 'completed' ? 'selected' : ''}>Scheduled (+15 credits)</option>
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

      const status = contact.status === 'completed' ? 'Call completed (+25 credits)' : contact.status === 'scheduled' ? 'Call scheduled (+15 credits)' : 'Contact shared (+10 credits)';
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
        ? `${latestAgr?.name || 'IRM Partner Network Agreement'} · Active since ${latestAgr?.uploadedAt || '2026'}. Your network is live for Marketplace matchmaking.`
        : 'Sign the Partner Network Agreement to enable Vendor matchmaking and credit payouts.';
    }
    if (signBtn) {
      signBtn.hidden = hasSigned;
    }
  }

  function renderMarketplaceRequests() {
    const reqBody = document.getElementById('partner-mp-requests-body');
    const countBadge = document.getElementById('partner-mp-requests-count');
    if (countBadge) {
      countBadge.textContent = `${currentMarketplaceRequests.length} request${currentMarketplaceRequests.length === 1 ? '' : 's'}`;
    }
    if (!reqBody) return;
    reqBody.replaceChildren();
    if (!currentMarketplaceRequests.length) {
      reqBody.innerHTML = '<tr><td colspan="4" class="empty">No Vendor introduction requests yet. When a Marketplace Vendor requests a warm intro to one of your contacts, it will appear here.</td></tr>';
      return;
    }
    currentMarketplaceRequests.forEach(req => {
      const tr = document.createElement('tr');
      const status = String(req.status || 'requested').toLowerCase();
      let statusLabel = 'Pending your acceptance';
      let badgeClass = 'warn';
      if (status === 'influencer_accepted' || status === 'call_scheduled') {
        statusLabel = 'Accepted & Scheduled (+15 credits)';
        badgeClass = 'ok';
      } else if (status === 'call_completed') {
        statusLabel = 'Call Completed (+25 credits)';
        badgeClass = 'ok';
      } else if (status === 'declined') {
        statusLabel = 'Declined';
        badgeClass = '';
      }
      tr.innerHTML = `
        <td>
          <strong>${escapeHTML(req.vendorCompany || 'Marketplace Vendor')}</strong>
          <small>${escapeHTML(req.vendorContactName || '')}${req.vendorEmail ? ` · ${escapeHTML(req.vendorEmail)}` : ''}</small>
        </td>
        <td>
          <strong>${escapeHTML(req.targetContactName || 'Network Contact')}</strong>
          <small>${escapeHTML(req.targetJobTitle || 'Executive')} · ${escapeHTML(req.targetCompany || 'Target Account')}</small>
        </td>
        <td>${escapeHTML(req.vendorPitch || 'Warm introduction requested via IRM Marketplace.')}</td>
        <td>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">
            <span class="portal-badge ${badgeClass}">${escapeHTML(statusLabel)}</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${status === 'requested' || status === 'irm_approved' ? `
                <button type="button" class="btn-sm" data-req-action="schedule" data-req-id="${escapeHTML(req.id)}">Accept &amp; Schedule (+15 credits)</button>
                <button type="button" class="btn-outline btn-sm" data-req-action="decline" data-req-id="${escapeHTML(req.id)}">Decline</button>
              ` : ''}
              ${status === 'influencer_accepted' || status === 'call_scheduled' ? `
                <button type="button" class="btn-outline btn-sm" data-req-action="complete" data-req-id="${escapeHTML(req.id)}">Mark Call Completed (+25 credits)</button>
              ` : ''}
            </div>
          </div>
        </td>
      `;
      tr.querySelectorAll('[data-req-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const decision = btn.getAttribute('data-req-action');
          const requestId = btn.getAttribute('data-req-id');
          btn.disabled = true;
          try {
            await request('/api/partner-share/requests/respond', {
              method: 'POST',
              body: JSON.stringify({ requestId, decision })
            });
            render(await request('/api/partner-share'));
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
          }
        });
      });
      reqBody.appendChild(tr);
    });
  }

  function render(data) {
    showWorkspaceView();
    partner = data.influencer || {};
    currentContacts = data.contacts || [];
    currentMarketplaceRequests = data.marketplaceRequests || [];
    if (data.calendlyUrl) workspaceCalendlyUrl = data.calendlyUrl;
    document.getElementById('partner-name').textContent = partner.fullName || 'Partner workspace';
    document.getElementById('partner-company').textContent = [partner.jobTitle, partner.company].filter(Boolean).join(' · ') || 'Your introductions and their next steps.';
    document.getElementById('total-count').textContent = currentContacts.length;
    const scheduledCount = currentContacts.filter(contact => contact.status === 'scheduled' || contact.status === 'completed').length;
    const completedCount = currentContacts.filter(contact => contact.status === 'completed').length;
    document.getElementById('scheduled-count').textContent = scheduledCount;
    document.getElementById('completed-count').textContent = completedCount;
    const totalCredits = typeof partner.referralCredits === 'number'
      ? partner.referralCredits
      : currentContacts.reduce((acc, c) => acc + (c.status === 'completed' ? 25 : c.status === 'scheduled' ? 15 : 10), 0);
    const creditsEl = document.getElementById('partner-credits');
    if (creditsEl) creditsEl.textContent = `${totalCredits} credits`;
    const payoutEl = document.getElementById('partner-payout');
    if (payoutEl) payoutEl.textContent = 'Manual';
    const openCalendlyEl = document.getElementById('partner-calendly-open-link');
    if (openCalendlyEl && workspaceCalendlyUrl) openCalendlyEl.href = workspaceCalendlyUrl;
    document.getElementById('visible-count').textContent = `${currentContacts.length} contact${currentContacts.length === 1 ? '' : 's'}`;
    renderAgreementState();
    renderMarketplaceRequests();
    renderContactsTable();
  }

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
    const response = await fetch(path, {
      ...options,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  // Self-serve Influencer Portal Authentication Tabs & Handlers
  const tabSignup = document.getElementById('portal-tab-signup');
  const tabLogin = document.getElementById('portal-tab-login');
  const tabToken = document.getElementById('portal-tab-token');
  const signupForm = document.getElementById('portal-signup-form');
  const loginForm = document.getElementById('portal-login-form');
  const tokenForm = document.getElementById('portal-token-form');

  function setPortalAuthTab(tab) {
    if (signupForm) signupForm.hidden = tab !== 'signup';
    if (loginForm) loginForm.hidden = tab !== 'login';
    if (tokenForm) tokenForm.hidden = tab !== 'token';
    tabSignup?.classList.toggle('active', tab === 'signup');
    tabLogin?.classList.toggle('active', tab === 'login');
    tabToken?.classList.toggle('active', tab === 'token');
  }

  tabSignup?.addEventListener('click', () => setPortalAuthTab('signup'));
  tabLogin?.addEventListener('click', () => setPortalAuthTab('login'));
  tabToken?.addEventListener('click', () => setPortalAuthTab('token'));

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    const feedback = document.getElementById('portal-auth-feedback');
    const submitBtn = document.getElementById('portal-signup-submit');
    submitBtn.disabled = true;
    feedback.className = '';
    feedback.textContent = 'Creating your Influencer Portal account…';
    try {
      const res = await request('/api/partner-portal/signup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: String(fd.get('fullName') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '').trim(),
          company: String(fd.get('company') || '').trim(),
          jobTitle: String(fd.get('jobTitle') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          linkedinUrl: String(fd.get('linkedinUrl') || '').trim(),
          location: String(fd.get('location') || '').trim(),
          acceptAgreement: fd.get('acceptAgreement') === 'on'
        })
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      signupForm.reset();
      await load();
    } catch (err) {
      feedback.className = 'error';
      feedback.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const feedback = document.getElementById('portal-login-feedback');
    const submitBtn = document.getElementById('portal-login-submit');
    submitBtn.disabled = true;
    feedback.className = '';
    feedback.textContent = 'Signing in…';
    try {
      const res = await request('/api/partner-portal/login', {
        method: 'POST',
        body: JSON.stringify({
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '').trim()
        })
      });
      token = res.token;
      sessionStorage.setItem(tokenKey, token);
      loginForm.reset();
      await load();
    } catch (err) {
      feedback.className = 'error';
      feedback.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  tokenForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(tokenForm);
    const raw = String(fd.get('token') || '').trim();
    if (!raw) return;
    const match = raw.match(/token=([^&]+)/);
    token = match ? decodeURIComponent(match[1]) : raw;
    sessionStorage.setItem(tokenKey, token);
    await load();
  });

  signoutBtn?.addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem(tokenKey);
    showAuthView();
  });

  async function load() {
    if (!token) return showAuthView();
    try { render(await request('/api/partner-share')); }
    catch (error) { showError(error.message); }
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
