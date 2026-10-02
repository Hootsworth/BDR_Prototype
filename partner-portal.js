(() => {
  const tokenKey = 'partner-workspace-token';
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const incomingToken = hashParams.get('token');
  if (incomingToken) {
    sessionStorage.setItem(tokenKey, incomingToken);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  const token = incomingToken || sessionStorage.getItem(tokenKey) || '';
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

  let partner = null;
  let currentContacts = [];
  let isMultiEditMode = false;

  function escapeHTML(val) {
    return String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
    form.hidden = true;
    if (bulkPanel) bulkPanel.hidden = true;
    const introSection = document.getElementById('introduction-section');
    if (introSection) introSection.hidden = true;
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
        </div>
      </td>
      <td>
        <select class="inline-edit-select" data-field="status">
          <option value="pending" ${statusVal === 'pending' ? 'selected' : ''}>Not scheduled</option>
          <option value="scheduled" ${statusVal === 'scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="completed" ${statusVal === 'completed' ? 'selected' : ''}>Completed</option>
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
      row.appendChild(createCell(contact.fullName, contact.email));
      row.appendChild(createCell(contact.company, [contact.jobTitle, contact.phone].filter(Boolean).join(' · ')));
      const status = contact.status === 'completed' ? 'Call completed' : contact.status === 'scheduled' ? 'Call scheduled' : 'Not scheduled';
      row.appendChild(createCell(status));
      body.appendChild(row);
    });
  }

  function render(data) {
    partner = data.influencer;
    currentContacts = data.contacts || [];
    document.getElementById('partner-name').textContent = partner.fullName || 'Partner workspace';
    document.getElementById('partner-company').textContent = [partner.jobTitle, partner.company].filter(Boolean).join(' · ') || 'Your introductions and their next steps.';
    document.getElementById('total-count').textContent = currentContacts.length;
    document.getElementById('scheduled-count').textContent = currentContacts.filter(contact => contact.status === 'scheduled').length;
    document.getElementById('completed-count').textContent = currentContacts.filter(contact => contact.status === 'completed').length;
    document.getElementById('visible-count').textContent = `${currentContacts.length} contact${currentContacts.length === 1 ? '' : 's'}`;
    renderContactsTable();
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function load() {
    if (!token) return showError('This workspace link is missing. Ask the workspace owner for a new private link.');
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
    const lines = String(rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results = [];
    lines.forEach((line, idx) => {
      const cells = line.includes('\t')
        ? line.split('\t').map(c => c.trim())
        : line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
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
        status
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
      const status = val('status') || 'pending';
      if (!fullName && !email && !company && !jobTitle && !phone) continue;
      contacts.push({
        id: tr.dataset.contactId || undefined,
        fullName,
        email,
        company,
        jobTitle,
        phone,
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
      if (bulkRowsBody) bulkRowsBody.replaceChildren();
      addBulkRows(3);
      feedback.className = 'success';
      const parts = [];
      if (res.created) parts.push(`${res.created} added`);
      if (res.updated) parts.push(`${res.updated} updated`);
      if (res.linked) parts.push(`${res.linked} linked`);
      if (res.duplicates?.length) parts.push(`${res.duplicates.length} duplicate skipped`);
      feedback.textContent = `Saved (${parts.join(', ') || 'completed'}).`;
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
