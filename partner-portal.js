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
  let partner = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
    form.hidden = true;
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

  function render(data) {
    partner = data.influencer;
    const contacts = data.contacts || [];
    document.getElementById('partner-name').textContent = partner.fullName || 'Partner workspace';
    document.getElementById('partner-company').textContent = [partner.jobTitle, partner.company].filter(Boolean).join(' · ') || 'Your introductions and their next steps.';
    document.getElementById('total-count').textContent = contacts.length;
    document.getElementById('scheduled-count').textContent = contacts.filter(contact => contact.status === 'scheduled').length;
    document.getElementById('completed-count').textContent = contacts.filter(contact => contact.status === 'completed').length;
    document.getElementById('visible-count').textContent = `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`;
    body.replaceChildren();
    if (!contacts.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'empty';
      td.textContent = 'No introductions yet. Add the first one below.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    contacts.forEach(contact => {
      const row = document.createElement('tr');
      row.appendChild(createCell(contact.fullName, contact.email));
      row.appendChild(createCell(contact.company, contact.jobTitle));
      const status = contact.status === 'completed' ? 'Call completed' : contact.status === 'scheduled' ? 'Call scheduled' : 'Not scheduled';
      row.appendChild(createCell(status));
      body.appendChild(row);
    });
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
