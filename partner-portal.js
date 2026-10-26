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
  const portalLoginForm = document.getElementById('portal-login-form');
  const portalLoginEmail = document.getElementById('portal-login-email');
  const portalLoginPassword = document.getElementById('portal-login-password');
  const portalLoginSubmit = document.getElementById('portal-login-submit');
  const portalChangePasswordForm = document.getElementById('portal-change-password-form');
  const portalNewPassword = document.getElementById('portal-new-password');
  const portalConfirmPassword = document.getElementById('portal-confirm-password');
  const portalChangePasswordSubmit = document.getElementById('portal-change-password-submit');
  const portalChangePasswordError = document.getElementById('portal-change-password-error');
  const portalSsoSeparator = document.getElementById('portal-sso-separator');
  let pendingChangeEmail = '';
  let pendingCurrentPassword = '';
  let pendingChangeToken = '';
  let clerkListenerAdded = false;
  let selectedAuthMode = 'signin';
  let partnerEmailFolder = 'INBOX';
  let partnerEmailNextPage = '';
  let partnerEmailReplyContext = null;

  function navigateToPartnerPage(pageKey, updateHistory = true) {
    const key = (pageKey === 'inbox' ? 'email' : pageKey) || 'contacts';
    const pageContacts = document.getElementById('partner-page-contacts');
    const pageEmail = document.getElementById('partner-page-email');
    const pageSettings = document.getElementById('partner-page-settings');
    const btnContacts = document.getElementById('partner-nav-contacts');
    const btnEmail = document.getElementById('partner-nav-email');
    const btnSettings = document.getElementById('partner-nav-settings');

    if (pageContacts) pageContacts.hidden = (key !== 'contacts');
    if (pageEmail) pageEmail.hidden = (key !== 'email');
    if (pageSettings) pageSettings.hidden = (key !== 'settings');

    btnContacts?.classList.toggle('active', key === 'contacts');
    btnEmail?.classList.toggle('active', key === 'email');
    btnSettings?.classList.toggle('active', key === 'settings');

    if (key === 'email') {
      loadPartnerEmailFolder('INBOX');
      if (updateHistory) window.location.hash = '#email';
    } else if (key === 'settings') {
      loadPartnerSettings();
      if (updateHistory) window.location.hash = '#settings';
    } else {
      if (updateHistory && window.location.hash && window.location.hash !== '#contacts') {
        window.location.hash = '#contacts';
      }
    }
  }

  function showPartnerWorkspaceSection(sectionId) {
    if (sectionId === 'partner-email-section') {
      navigateToPartnerPage('email');
    } else if (sectionId === 'partner-settings-section') {
      navigateToPartnerPage('settings');
    } else {
      navigateToPartnerPage('contacts');
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setPartnerEmailStatus(message, isError = false) {
    const el = document.getElementById('partner-email-status');
    if (el) { el.textContent = message; el.style.color = isError ? '#b42318' : ''; }
  }

  async function loadPartnerSettings() {
    if (!token) return;
    try {
      const [settings, google] = await Promise.all([request('/api/partner-portal/settings'), request('/api/partner-portal/google/status')]);
      const configured = settings.configured || {};
      const status = document.getElementById('partner-ai-key-status');
      if (status) status.textContent = `Gemini ${configured.gemini ? 'saved' : 'not set'} · OpenAI ${configured.openai ? 'saved' : 'not set'} · Meta ${configured.meta ? 'saved' : 'not set'} · Admin copy ${settings.adminCopyConfigured ? 'configured' : 'not configured'}.`;
      const googleStatus = document.getElementById('partner-google-status');
      if (googleStatus) googleStatus.textContent = google.connected ? `Connected: ${google.email || 'Google account'}` : 'Google account not connected.';
      if (settings.registeredEmail) {
        const settingsEmailEl = document.getElementById('partner-settings-registered-email');
        if (settingsEmailEl) settingsEmailEl.textContent = settings.registeredEmail;
      }
      if (settings.adminEmail) {
        currentAdminEmail = settings.adminEmail;
        const settingsAdminEl = document.getElementById('partner-settings-admin-cc');
        if (settingsAdminEl) settingsAdminEl.textContent = settings.adminEmail;
        const inboxAdminEl = document.getElementById('partner-inbox-admin-cc');
        if (inboxAdminEl) inboxAdminEl.textContent = settings.adminEmail;
        const composeAdminEl = document.getElementById('partner-compose-admin-display');
        if (composeAdminEl) composeAdminEl.textContent = settings.adminEmail;
      }
      const inboxGoogleStatus = document.getElementById('partner-inbox-google-status');
      if (inboxGoogleStatus) {
        inboxGoogleStatus.textContent = google.connected ? `✓ Google connected: ${google.email || 'active'}` : 'Google account not connected.';
      }
    } catch (error) {
      const status = document.getElementById('partner-ai-key-status');
      if (status) status.textContent = error.message;
      const googleStatus = document.getElementById('partner-google-status');
      if (googleStatus) googleStatus.textContent = error.message;
    }
  }

  async function savePartnerAiKeys() {
    const body = {
      gemini: document.getElementById('partner-key-gemini')?.value.trim() || '',
      openai: document.getElementById('partner-key-openai')?.value.trim() || '',
      meta: document.getElementById('partner-key-meta')?.value.trim() || ''
    };
    try {
      await request('/api/partner-portal/settings', { method: 'POST', body: JSON.stringify(body) });
      ['partner-key-gemini', 'partner-key-openai', 'partner-key-meta'].forEach(id => { const input = document.getElementById(id); if (input) input.value = ''; });
      await loadPartnerSettings();
      const status = document.getElementById('partner-ai-key-status');
      if (status) status.textContent += ' Saved securely.';
    } catch (error) { const status = document.getElementById('partner-ai-key-status'); if (status) status.textContent = error.message; }
  }

  async function connectPartnerGoogle() {
    const button = document.getElementById('partner-google-connect');
    if (button) button.disabled = true;
    try {
      const result = await request('/api/partner-portal/google/connect', { method: 'POST', body: JSON.stringify({}) });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      const status = document.getElementById('partner-google-status');
      if (status) status.textContent = error.message;
    } finally { if (button) button.disabled = false; }
  }

  let currentAdminEmail = '';
  let activeEmailData = null;
  let isDenseLayout = false;

  function formatEmailDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.split(' ')[0] || dateStr;
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const diffDays = Math.round((now - d) / (1000 * 60 * 60 * 24));
      if (diffDays <= 6) {
        return d.toLocaleDateString([], { weekday: 'short' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  }

  function cleanSender(fromStr) {
    if (!fromStr) return '(unknown sender)';
    const match = fromStr.match(/^"?(.*?)"?\s*<.*>$/);
    return (match ? match[1] : fromStr).trim() || fromStr;
  }

  function showMonoOverlay(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('show');
      if (typeof el.showModal === 'function') {
        try { if (!el.open) el.showModal(); } catch (_) {}
      }
    }
  }

  function hideMonoOverlay(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('show');
      if (typeof el.close === 'function') {
        try { el.close(); } catch (_) {}
      }
    }
  }

  function monoToast(msg) {
    const t = document.getElementById('partner-mono-toast');
    if (t) {
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }
  }

  function toggleMonoTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
    const btn = document.getElementById('monoThemeBtn');
    if (btn) btn.textContent = isDark ? '☾' : '☼';
    monoToast(`${isDark ? 'Light' : 'Dark'} mode enabled.`);
  }

  function toggleMonoDensity() {
    isDenseLayout = !isDenseLayout;
    const btn = document.getElementById('monoDensityBtn');
    if (btn) btn.innerHTML = isDenseLayout ? '☷ &nbsp; Compact' : '☷ &nbsp; Comfortable';
    document.querySelectorAll('#partner-email-list .mono-email-row').forEach(row => {
      row.style.minHeight = isDenseLayout ? '50px' : '64px';
    });
  }

  function switchMonoFolder(folder, el) {
    document.querySelectorAll('.mono-nav-item').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
    loadPartnerEmailFolder(folder);
  }

  function monoLoadMore() {
    if (partnerEmailNextPage) {
      loadPartnerEmailFolder(partnerEmailFolder, true);
    } else {
      monoToast("You've viewed all recent messages.");
    }
  }

  function replyFromReader() {
    if (activeEmailData) {
      hideMonoOverlay('partner-reader-overlay');
      replyPartnerEmail(activeEmailData);
    }
  }

  async function archiveFromReader() {
    if (activeEmailData) {
      await mutatePartnerEmail(activeEmailData.id, 'archive');
      hideMonoOverlay('partner-reader-overlay');
      monoToast('Conversation archived.');
    }
  }

  async function starFromReader() {
    if (activeEmailData) {
      const isStarred = (activeEmailData.labelIds || []).includes('STARRED');
      await mutatePartnerEmail(activeEmailData.id, isStarred ? 'unstar' : 'star');
      activeEmailData.labelIds = isStarred
        ? (activeEmailData.labelIds || []).filter(l => l !== 'STARRED')
        : [...(activeEmailData.labelIds || []), 'STARRED'];
      const starBtn = document.getElementById('monoReaderStarBtn');
      if (starBtn) starBtn.textContent = !isStarred ? '★ Starred' : '☆ Star';
      monoToast(!isStarred ? 'Starred message.' : 'Unstarred message.');
    }
  }

  async function unreadFromReader() {
    if (activeEmailData) {
      await mutatePartnerEmail(activeEmailData.id, 'markUnread');
      hideMonoOverlay('partner-reader-overlay');
      monoToast('Marked as unread.');
    }
  }

  async function toggleStarEmail(messageId, shouldStar) {
    await mutatePartnerEmail(messageId, shouldStar ? 'star' : 'unstar');
    monoToast(shouldStar ? 'Starred' : 'Unstarred');
  }

  async function bulkActionMonoEmails(action) {
    const selectedBoxes = Array.from(document.querySelectorAll('#partner-email-list .row-check:checked'));
    if (!selectedBoxes.length) {
      monoToast('Select at least one message first.');
      return;
    }
    const ids = selectedBoxes.map(b => b.dataset.id).filter(Boolean);
    for (const id of ids) {
      await mutatePartnerEmail(id, action, false);
    }
    loadPartnerEmailFolder(partnerEmailFolder);
    monoToast(`${ids.length} message${ids.length === 1 ? '' : 's'} updated.`);
  }

  function toggleSelectAllMonoEmails(checked) {
    document.querySelectorAll('#partner-email-list .row-check').forEach(box => {
      box.checked = checked;
    });
  }

  function closePartnerEmailReader() {
    hideMonoOverlay('partner-reader-overlay');
  }

  async function loadPartnerEmailFolder(label = partnerEmailFolder, append = false) {
    partnerEmailFolder = label;
    const list = document.getElementById('partner-email-list');
    if (!list) return;
    if (!append) { list.replaceChildren(); partnerEmailNextPage = ''; }

    // Update active folder state on sidebar
    document.querySelectorAll('.mono-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.folder === label);
    });

    const folderNames = { INBOX: 'Inbox', STARRED: 'Starred', SENT: 'Sent', DRAFT: 'Drafts', ALL: 'All Mail' };
    const folderSubtitles = {
      INBOX: 'A little less noise. A little more signal.',
      STARRED: 'The conversations worth keeping close.',
      SENT: `Sent from ${partner?.email || 'your registered email'} · Admin CC included.`,
      DRAFT: 'Unsent drafts and saved messages.',
      ALL: 'Complete mailbox archive across all categories.'
    };
    const titleEl = document.getElementById('mono-page-title');
    if (titleEl) titleEl.textContent = folderNames[label] || label;
    const eyebrowEl = document.getElementById('mono-page-eyebrow');
    if (eyebrowEl) eyebrowEl.textContent = label === 'INBOX' ? 'YOUR SPACE, AT A GLANCE' : `MAIL / ${folderNames[label] || label}`.toUpperCase();
    const subtitleEl = document.getElementById('mono-page-subtitle');
    if (subtitleEl) subtitleEl.textContent = folderSubtitles[label] || 'Connected mailbox.';

    setPartnerEmailStatus('Loading mailbox…');
    try {
      const params = new URLSearchParams({ maxResults: '30' });
      if (label !== 'ALL') params.set('labelIds', label);
      const search = document.getElementById('partner-email-search')?.value.trim();
      if (search) params.set('q', search);
      if (append && partnerEmailNextPage) params.set('pageToken', partnerEmailNextPage);
      const result = await request(`/api/partner-portal/email/messages?${params}`);
      partnerEmailNextPage = result.nextPageToken || '';
      const items = result.items || [];

      if (!items.length && !append) {
        list.innerHTML = `
          <div class="mono-empty">
            <strong>It’s quiet in here.</strong>
            No messages match this view. Enjoy the breathing room.
          </div>
        `;
      } else {
        items.forEach(message => {
          const isUnread = (message.labelIds || []).includes('UNREAD');
          const isStarred = (message.labelIds || []).includes('STARRED');
          const dateStr = message.date ? formatEmailDate(message.date) : '';
          const senderName = cleanSender(message.from);

          const row = document.createElement('div');
          row.className = `mono-email-row ${isUnread ? 'unread' : ''}`;
          row.dataset.id = message.id;
          if (isDenseLayout) row.style.minHeight = '50px';

          const check = document.createElement('input');
          check.type = 'checkbox';
          check.className = 'mono-check row-check';
          check.dataset.id = message.id;
          check.setAttribute('aria-label', 'Select message');
          check.onclick = e => e.stopPropagation();

          const star = document.createElement('button');
          star.type = 'button';
          star.className = `mono-star ${isStarred ? 'on' : ''}`;
          star.textContent = isStarred ? '★' : '☆';
          star.title = isStarred ? 'Unstar message' : 'Star message';
          star.onclick = e => {
            e.stopPropagation();
            toggleStarEmail(message.id, !isStarred);
          };

          const sender = document.createElement('div');
          sender.className = 'mono-sender';
          sender.textContent = senderName;

          const preview = document.createElement('div');
          preview.className = 'mono-preview';

          const subject = document.createElement('span');
          subject.className = 'mono-subject';
          subject.textContent = message.subject || '(no subject)';

          const snippet = document.createElement('span');
          snippet.className = 'mono-snippet';
          snippet.textContent = message.snippet || '';

          preview.append(subject, snippet);

          const time = document.createElement('div');
          time.className = 'mono-time';
          time.textContent = dateStr;

          row.append(check, star, sender, preview, time);
          row.onclick = () => openPartnerEmailMessage(message);
          list.append(row);
        });
      }

      const totalCountEl = document.getElementById('partner-email-total-count');
      if (totalCountEl) totalCountEl.textContent = `${items.length} conversation${items.length === 1 ? '' : 's'}`;
      setPartnerEmailStatus(`${items.length} messages · ${label.toLowerCase()}`);

      if (label === 'INBOX') {
        const inboxCountEl = document.getElementById('partner-inbox-count');
        const unreadCount = items.filter(m => (m.labelIds || []).includes('UNREAD')).length;
        if (inboxCountEl) inboxCountEl.textContent = unreadCount ? String(unreadCount) : '';
      }
    } catch (error) {
      list.innerHTML = `
        <div class="mono-empty">
          <strong>Connect your Google account</strong>
          <p style="margin:8px auto 16px;max-width:320px;font-size:13px;line-height:1.5;">To read incoming messages, send client introductions, and sync drafts, connect your Google account in Settings.</p>
          <button class="mono-send-btn" type="button" onclick="connectPartnerGoogle()">Connect Google Account</button>
        </div>
      `;
      setPartnerEmailStatus(error.message, true);
    }
  }

  function searchPartnerEmail() { loadPartnerEmailFolder(partnerEmailFolder); }
  function decodePartnerMailBody(encoded) {
    if (!encoded) return '';
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    try { return decodeURIComponent(escape(atob(base64))); } catch (_) { try { return atob(base64); } catch (_) { return ''; } }
  }
  function findPartnerMailBody(part) {
    if (part?.mimeType === 'text/plain' && part.body?.data) return part.body.data;
    for (const child of (part?.parts || [])) { const found = findPartnerMailBody(child); if (found) return found; }
    return part?.body?.data || '';
  }

  async function openPartnerEmailMessage(message) {
    const panel = document.getElementById('partner-email-message');
    if (!panel) return;
    panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Loading message…</div>';
    showMonoOverlay('partner-reader-overlay');
    try {
      const result = await request(`/api/partner-portal/email/message?id=${encodeURIComponent(message.id)}`);
      activeEmailData = result;
      const headers = Object.fromEntries((result.payload?.headers || []).map(h => [String(h.name).toLowerCase(), h.value]));
      const dateStr = headers.date || message.date || '';
      const formattedDate = formatEmailDate(dateStr) + (dateStr ? ` (${dateStr})` : '');
      const subject = headers.subject || message.subject || '(no subject)';
      const from = headers.from || message.from || '(unknown sender)';
      const body = decodePartnerMailBody(findPartnerMailBody(result.payload)) || result.snippet || '(No displayable text body)';

      const starBtn = document.getElementById('monoReaderStarBtn');
      const isStarred = (result.labelIds || []).includes('STARRED');
      if (starBtn) starBtn.textContent = isStarred ? '★ Starred' : '☆ Star';

      panel.innerHTML = `
        <div class="mono-eyebrow">${escapeHTML(formattedDate)}</div>
        <h2>${escapeHTML(subject)}</h2>
        <div class="mono-reader-meta">
          From: <strong style="color:var(--text);">${escapeHTML(from)}</strong><br>
          To: me · Admin CC (<span style="font-family:var(--font-mono);">${escapeHTML(currentAdminEmail || 'admin')}</span>)
        </div>
        <div class="mono-reader-body">${escapeHTML(body)}</div>
      `;
      if ((result.labelIds || []).includes('UNREAD')) {
        mutatePartnerEmail(result.id, 'markRead', false);
      }
      result._headerValues = headers;
    } catch (error) {
      panel.innerHTML = `<div style="padding:20px;color:#b42318;">${escapeHTML(error.message)}</div>`;
    }
  }

  async function mutatePartnerEmail(messageId, action, refresh = true) {
    try {
      await request('/api/partner-portal/email/message', { method: 'POST', body: JSON.stringify({ messageId, action }) });
      if (refresh) loadPartnerEmailFolder(partnerEmailFolder);
    } catch (error) {
      setPartnerEmailStatus(error.message, true);
    }
  }

  function newPartnerEmail() {
    partnerEmailReplyContext = null;
    const title = document.getElementById('partner-compose-title');
    if (title) title.textContent = 'New message';
    ['partner-compose-to', 'partner-compose-subject', 'partner-compose-body'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const fromEl = document.getElementById('partner-compose-from-display');
    if (fromEl && partner?.email) fromEl.textContent = partner.email;
    const adminEl = document.getElementById('partner-compose-admin-display');
    if (adminEl && currentAdminEmail) adminEl.textContent = currentAdminEmail;
    showMonoOverlay('partner-email-compose');
  }

  function closePartnerEmailComposer() {
    hideMonoOverlay('partner-email-compose');
    partnerEmailReplyContext = null;
  }

  function replyPartnerEmail(message) {
    const headers = message?._headerValues || {};
    const from = headers.from || '';
    const title = document.getElementById('partner-compose-title');
    if (title) title.textContent = 'Reply';
    const toInput = document.getElementById('partner-compose-to');
    if (toInput) toInput.value = from.match(/<([^>]+)>/)?.[1] || from;
    const subjInput = document.getElementById('partner-compose-subject');
    if (subjInput) subjInput.value = /^re:/i.test(headers.subject || '') ? headers.subject : `Re: ${headers.subject || ''}`;
    const bodyInput = document.getElementById('partner-compose-body');
    if (bodyInput) bodyInput.value = `\n\nOn ${headers.date || ''}, ${from} wrote:\n`;
    const fromEl = document.getElementById('partner-compose-from-display');
    if (fromEl && partner?.email) fromEl.textContent = partner.email;
    const adminEl = document.getElementById('partner-compose-admin-display');
    if (adminEl && currentAdminEmail) adminEl.textContent = currentAdminEmail;
    partnerEmailReplyContext = {
      threadId: message.threadId,
      inReplyTo: headers['message-id'] || '',
      references: [headers.references, headers['message-id']].filter(Boolean).join(' ')
    };
    showMonoOverlay('partner-email-compose');
  }

  async function sendPartnerEmail() {
    const payload = {
      to: document.getElementById('partner-compose-to').value.trim(),
      subject: document.getElementById('partner-compose-subject').value.trim(),
      body: document.getElementById('partner-compose-body').value,
      from: partner?.email || '',
      reply_to: partner?.email || '',
      approved: true,
      ...(partnerEmailReplyContext || {})
    };
    try {
      await request('/api/partner-portal/email/send', { method: 'POST', body: JSON.stringify(payload) });
      closePartnerEmailComposer();
      monoToast('Message sent. Admin was CC’d.');
      setPartnerEmailStatus('Sent from your registered email; Admin was CC’d.');
      loadPartnerEmailFolder('SENT');
    } catch (error) {
      setPartnerEmailStatus(error.message, true);
      monoToast(error.message);
    }
  }

  async function draftPartnerEmail(withAI = false) {
    try {
      if (withAI) {
        const to = document.getElementById('partner-compose-to').value.trim();
        const contact = currentContacts.find(c => String(c.email || '').toLowerCase() === to.toLowerCase()) || {};
        const result = await request('/api/partner-portal/ai/draft', { method: 'POST', body: JSON.stringify({ contact, instructions: 'Write a concise, professional introduction email.' }) });
        document.getElementById('partner-compose-subject').value = result.subject;
        document.getElementById('partner-compose-body').value = result.body;
      }
      const payload = {
        to: document.getElementById('partner-compose-to').value.trim(),
        subject: document.getElementById('partner-compose-subject').value.trim(),
        body: document.getElementById('partner-compose-body').value,
        from: partner?.email || '',
        reply_to: partner?.email || ''
      };
      await request('/api/partner-portal/email/draft', { method: 'POST', body: JSON.stringify(payload) });
      closePartnerEmailComposer();
      monoToast(withAI ? 'AI draft saved in Gmail.' : 'Draft saved in Gmail.');
      setPartnerEmailStatus(withAI ? 'AI draft saved in Gmail.' : 'Draft saved in Gmail.');
    } catch (error) {
      setPartnerEmailStatus(error.message, true);
      monoToast(error.message);
    }
  }

  Object.assign(window, {
    navigateToPartnerPage,
    showPartnerWorkspaceSection,
    loadPartnerEmailFolder,
    searchPartnerEmail,
    openPartnerEmailMessage,
    closePartnerEmailReader,
    replyFromReader,
    archiveFromReader,
    starFromReader,
    unreadFromReader,
    toggleStarEmail,
    newPartnerEmail,
    closePartnerEmailComposer,
    sendPartnerEmail,
    draftPartnerEmail,
    loadPartnerSettings,
    savePartnerAiKeys,
    connectPartnerGoogle,
    savePartnerReferralEdit,
    closePartnerReferralEditor,
    monoToast,
    toggleMonoTheme,
    toggleMonoDensity,
    switchMonoFolder,
    toggleSelectAllMonoEmails,
    bulkActionMonoEmails,
    monoLoadMore
  });

  function clearClerkLoading() {
    clerkMount?.querySelectorAll('.clerk-loading')?.forEach(el => el.remove());
    clerkSignupMount?.querySelectorAll('.clerk-loading')?.forEach(el => el.remove());
  }

  async function loadPartnerClerk() {
    clearClerkLoading();
    if (window.Clerk?.user || (window.Clerk && typeof window.Clerk.mountSignIn === 'function')) {
      return window.Clerk;
    }
    const pubKey = (window.ClerkConfig && window.ClerkConfig.publishableKey) || "";
    if (!pubKey || pubKey.includes("placeholder")) {
      return null;
    }
    if (!window.__clerkAssetsPromise) {
      let frontendApi;
      try {
        const encodedDomain = pubKey.split("_")[2];
        if (!encodedDomain) throw new Error("Malformed Clerk publishable key.");
        frontendApi = atob(encodedDomain.replace(/-/g, "+").replace(/_/g, "/")).replace(/\$$/, "");
        if (!/^[a-z0-9.-]+$/i.test(frontendApi)) throw new Error("Invalid Clerk Frontend API domain.");
      } catch (err) {
        console.warn("[AUTH] Clerk key parse failed:", err);
        return null;
      }
      const loadScript = (src, publishableKey = "") => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        if (publishableKey) script.setAttribute("data-clerk-publishable-key", publishableKey);
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load Clerk asset: ${src}`));
        document.head.appendChild(script);
      });
      window.__clerkAssetsPromise = (async () => {
        const baseUrl = `https://${frontendApi}/npm`;
        await loadScript(`${baseUrl}/@clerk/ui@1/dist/ui.browser.js`);
        await loadScript(`${baseUrl}/@clerk/clerk-js@6/dist/clerk.browser.js`, pubKey);
      })();
    }
    try {
      await window.__clerkAssetsPromise;
      if (typeof window.Clerk === "function") {
        const clerkInstance = new window.Clerk(pubKey);
        await clerkInstance.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
        window.Clerk = clerkInstance;
      } else if (window.Clerk && typeof window.Clerk.load === "function") {
        await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      }
      return window.Clerk;
    } catch (err) {
      console.warn("[AUTH] Clerk load error:", err);
      return null;
    }
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
    if (portalLoginForm) portalLoginForm.hidden = false;
    if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
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
      const contactTd = createCell(contact.fullName, contact.jobTitle || 'Executive');
      if (contact.email) {
        const emailSmall = document.createElement('small');
        emailSmall.textContent = contact.email;
        emailSmall.style.cssText = 'display:block;color:var(--muted);';
        contactTd.appendChild(emailSmall);
      }
      if (contact.linkedinUrl) {
        const liLink = document.createElement('a');
        liLink.href = contact.linkedinUrl;
        liLink.target = '_blank';
        liLink.rel = 'noopener noreferrer';
        liLink.textContent = 'LinkedIn ↗';
        liLink.style.cssText = 'display:inline-block;margin-top:3px;font-size:11px;color:var(--accent);';
        contactTd.appendChild(liLink);
      }
      row.appendChild(contactTd);
      row.appendChild(createCell(contact.company, contact.phone || ''));

      // Relationship & Privacy cell
      const relTd = document.createElement('td');
      const strVal = (contact.strength || 'strong').toLowerCase();
      const strColor = strVal === 'strong' ? '#14745d' : strVal === 'medium' ? '#8b5b13' : '#66736f';
      const strBg = strVal === 'strong' ? '#dcfce7' : strVal === 'medium' ? '#fef3c7' : '#f3f4f6';
      const privVal = (contact.privacyLevel || 'ask_partner').replace('_', ' ');
      relTd.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:4px; background:${strBg}; color:${strColor};">${escapeHTML(strVal)}</span>
          <span style="font-size:11.5px; color:var(--muted);">${escapeHTML(contact.relationshipType || 'Peer')}</span>
          <span style="font-size:10.5px; color:var(--accent); background:#e8f4f0; padding:1px 6px; border-radius:3px;">${escapeHTML(privVal)}</span>
        </div>
      `;
      row.appendChild(relTd);

      // Status indicators (Contract: Meeting completion pending buyer confirmation / Scheduled (no points until verified))
      const statusTd = document.createElement('td');
      const status = contact.status === 'completed' ? 'Meeting Completed' : contact.status === 'scheduled' ? 'Briefing Scheduled' : 'Ready for Intro';
      statusTd.innerHTML = `<span style="font-size:12px; font-weight:600;">${status}</span>`;
      if (contact.status !== 'completed' && workspaceCalendlyUrl) {
        const bookLink = document.createElement('a');
        const sep = workspaceCalendlyUrl.includes('?') ? '&' : '?';
        bookLink.href = `${workspaceCalendlyUrl}${sep}name=${encodeURIComponent(contact.fullName || '')}&email=${encodeURIComponent(contact.email || '')}`;
        bookLink.target = '_blank';
        bookLink.rel = 'noopener noreferrer';
        bookLink.textContent = 'Schedule Briefing';
        bookLink.style.cssText = 'display:block;margin-top:4px;font-size:11.5px;color:var(--ok);font-weight:600;';
        statusTd.appendChild(bookLink);
      }
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
      const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'btn btn-secondary btn-sm'; editButton.textContent = 'Edit'; editButton.onclick = () => openPartnerReferralEditor(contact);
      const deleteButton = document.createElement('button'); deleteButton.type = 'button'; deleteButton.className = 'btn btn-secondary btn-sm'; deleteButton.textContent = 'Delete'; deleteButton.style.color = '#b42318'; deleteButton.onclick = () => deletePartnerReferral(contact);
      actionRow.append(editButton, deleteButton); statusTd.appendChild(actionRow);
      row.appendChild(statusTd);
      body.appendChild(row);
    });
  }

  function openPartnerReferralEditor(contact) {
    const fields = { id: contact.id, name: contact.fullName, email: contact.email, company: contact.company, title: contact.jobTitle, phone: contact.phone, linkedin: contact.linkedinUrl, strength: contact.strength || 'strong', privacy: contact.privacyLevel || 'ask_partner' };
    for (const [key, value] of Object.entries(fields)) {
      const el = document.getElementById(`partner-referral-edit-${key}`);
      if (el) el.value = value || '';
    }
    document.getElementById('partner-referral-edit-feedback').textContent = '';
    document.getElementById('partner-referral-edit-dialog')?.showModal();
  }
  function closePartnerReferralEditor() { document.getElementById('partner-referral-edit-dialog')?.close(); }
  async function savePartnerReferralEdit() {
    const payload = { fullName: document.getElementById('partner-referral-edit-name').value.trim(), email: document.getElementById('partner-referral-edit-email').value.trim(), company: document.getElementById('partner-referral-edit-company').value.trim(), jobTitle: document.getElementById('partner-referral-edit-title').value.trim(), phone: document.getElementById('partner-referral-edit-phone').value.trim(), linkedinUrl: document.getElementById('partner-referral-edit-linkedin').value.trim(), strength: document.getElementById('partner-referral-edit-strength').value, privacyLevel: document.getElementById('partner-referral-edit-privacy').value };
    const feedback = document.getElementById('partner-referral-edit-feedback');
    try {
      await request('/api/partner-share/referrals', { method: 'POST', body: JSON.stringify({ action: 'update', contactId: document.getElementById('partner-referral-edit-id').value, contact: payload }) });
      closePartnerReferralEditor(); render(await request('/api/partner-share'));
    } catch (error) { feedback.textContent = error.message; }
  }
  async function deletePartnerReferral(contact) {
    if (!confirm(`Delete ${contact.fullName} from your referred contacts?`)) return;
    try {
      await request('/api/partner-share/referrals', { method: 'POST', body: JSON.stringify({ action: 'delete', contactId: contact.id }) });
      render(await request('/api/partner-share'));
    } catch (error) { alert(error.message); }
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
        ? `${latestAgr?.name || latestAgr?.title || 'ConnectEM Partner Network Agreement'} · Signed and Active. Your non-circumvention terms are locked.`
        : 'Review and sign the Partner Network Agreement to activate your partner profile.';
    }
    if (signBtn) {
      signBtn.hidden = hasSigned;
    }
  }

  function renderPartnerRequests(requests = []) {
    const container = document.getElementById('partner-requests-container');
    const badge = document.getElementById('pending-requests-badge');
    if (!container) return;
    const pending = requests.filter(r => !['declined', 'partner_declined', 'contact_declined'].includes(r.status));
    if (badge) badge.textContent = `${pending.length} pending`;
    if (!pending.length) {
      container.innerHTML = `<p style="color:var(--muted); font-size:13px; font-style:italic;">No pending introduction requests right now. When vendors request warm introductions to your network, they will appear here for your review.</p>`;
      return;
    }
    container.innerHTML = '';
    pending.forEach(req => {
      const card = document.createElement('div');
      card.className = 'partner-request-card';
      
      const isInterestChecked = req.status === 'contact_opt_in_requested' || req.optInToken;
      const isAccepted = req.status === 'contact_accepted' || req.status === 'introduction_made';
      
      let statusBadge = `<span class="portal-badge">Awaiting Your Review</span>`;
      if (isAccepted) {
        statusBadge = `<span class="portal-badge ok">Contact Accepted · Intro Made</span>`;
      } else if (isInterestChecked) {
        statusBadge = `<span class="portal-badge warn">Double Opt-In Pending</span>`;
      }
      
      const optInUrl = req.optInToken ? `${window.location.origin}/opt-in.html?token=${req.optInToken}` : '';
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent);">Introduction Request #${req.id}</span>
            <h3 style="margin:4px 0 2px; font-size:17px; font-weight:600; color:var(--ink);">${escapeHTML(req.vendorCompany || 'Technology Partner')} ──► ${escapeHTML(req.targetContactName || 'Executive')} (${escapeHTML(req.targetCompany || 'Organization')})</h3>
            <p style="margin:0; font-size:12.5px; color:var(--muted);">${escapeHTML(req.targetJobTitle || 'Decision Maker')} · Requested by ${escapeHTML(req.vendorContactName || 'Vendor Leadership')}</p>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; background:var(--soft); padding:14px 16px; border-radius:8px; border:1px solid var(--line);">
          <div><strong style="display:block; color:var(--muted); font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px;">Why This Contact</strong><span style="font-size:13px; color:var(--ink);">${escapeHTML(req.whyThisContact || 'Target decision maker in focus sector')}</span></div>
          <div><strong style="display:block; color:var(--muted); font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px;">Why They Should Care</strong><span style="font-size:13px; color:var(--ink);">${escapeHTML(req.whyTheyShouldCare || req.vendorPitch || 'Modernizing architecture while maintaining compliance')}</span></div>
          <div><strong style="display:block; color:var(--muted); font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px;">Specific Ask</strong><span style="font-size:13px; color:var(--ink);">${escapeHTML(req.specificAsk || '20-minute executive briefing')}</span></div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--ink); margin-bottom:6px;">Forwardable Note to Contact (in your voice):</label>
          <textarea class="forwardable-note-area" style="width:100%; min-height:85px; padding:10px 12px; font-size:13px; border:1px solid var(--line); border-radius:8px; font-family:inherit; background:var(--surface);" ${isInterestChecked ? 'readonly' : ''}>${escapeHTML(req.forwardableBrief || req.vendorPitch || '')}</textarea>
        </div>

        ${optInUrl ? `
          <div style="background:var(--accent-soft); border:1px solid var(--accent-border); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="font-size:12.5px; color:var(--ink);"><strong>Contact Double Opt-In Link:</strong> <code style="background:#fff; padding:3px 8px; border-radius:5px; border:1px solid var(--line); font-size:12px; font-family:var(--font-mono);">${optInUrl}</code></div>
            <button type="button" class="btn btn-secondary copy-optin-link-btn" data-url="${optInUrl}" style="min-height:32px; padding:0 12px; font-size:12px;">Copy Opt-In Link</button>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; border-top:1px solid var(--line); padding-top:14px; margin-top:4px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; font-weight:600; color:var(--muted);">Relevance:</span>
            <select class="relevance-select" style="min-height:34px; font-size:12.5px; padding:4px 10px; border-radius:6px; border:1px solid var(--line); background:#fff; width:auto;">
              <option value="highly" ${req.relevanceRating === 'highly' ? 'selected' : ''}>Highly Relevant</option>
              <option value="possibly" ${req.relevanceRating === 'possibly' ? 'selected' : ''}>Possibly Relevant</option>
              <option value="need_more_info" ${req.relevanceRating === 'need_more_info' ? 'selected' : ''}>Need More Info</option>
              <option value="not_relevant" ${req.relevanceRating === 'not_relevant' ? 'selected' : ''}>Not Relevant</option>
            </select>
          </div>
          
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${!isInterestChecked && !isAccepted ? `
              <button type="button" class="btn btn-primary check-interest-btn" data-id="${req.id}" style="min-height:34px; padding:0 14px; font-size:12px;">Check Interest (Double Opt-In)</button>
              <button type="button" class="btn btn-secondary decline-btn" data-id="${req.id}" style="min-height:34px; padding:0 12px; font-size:12px;">Decline</button>
              <button type="button" class="btn btn-secondary question-btn" data-id="${req.id}" style="min-height:34px; padding:0 12px; font-size:12px;">Ask Question</button>
            ` : isAccepted ? `
              <span class="portal-badge ok" style="padding:6px 12px; font-size:12px;">✓ Introduction Made &amp; Scheduled</span>
            ` : `
              <button type="button" class="btn btn-secondary copy-optin-link-btn" data-url="${optInUrl}" style="min-height:34px; padding:0 14px; font-size:12px;">Share Opt-In Link With Contact</button>
            `}
          </div>
        </div>
      `;

      card.querySelector('.copy-optin-link-btn')?.addEventListener('click', async (e) => {
        const u = e.currentTarget.dataset.url;
        await navigator.clipboard.writeText(u);
        const original = e.currentTarget.textContent;
        e.currentTarget.textContent = 'Copied!';
        setTimeout(() => { e.currentTarget.textContent = original; }, 1500);
      });

      card.querySelector('.check-interest-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const note = card.querySelector('.forwardable-note-area').value;
        const rel = card.querySelector('.relevance-select').value;
        try {
          await request('/api/connectem/requests/review', {
            method: 'POST',
            body: JSON.stringify({ requestId: req.id, decision: 'check_interest', partnerNote: note, relevanceRating: rel })
          });
          render(await request('/api/partner-share'));
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });

      card.querySelector('.decline-btn')?.addEventListener('click', async (e) => {
        const reason = prompt('Optional reason for declining (never penalizes your Trust Score):') ?? '';
        try {
          await request('/api/connectem/requests/review', {
            method: 'POST',
            body: JSON.stringify({ requestId: req.id, decision: 'decline', partnerNote: reason })
          });
          render(await request('/api/partner-share'));
        } catch (err) {
          alert(err.message);
        }
      });

      card.querySelector('.question-btn')?.addEventListener('click', async (e) => {
        const q = prompt('What question do you have for the vendor?');
        if (!q) return;
        try {
          await request('/api/connectem/requests/review', {
            method: 'POST',
            body: JSON.stringify({ requestId: req.id, decision: 'ask_question', question: q })
          });
          alert('Your question has been sent to the vendor.');
          render(await request('/api/partner-share'));
        } catch (err) {
          alert(err.message);
        }
      });

      container.appendChild(card);
    });
  }

  function render(data) {
    showWorkspaceView();
    partner = data.influencer || {};
    currentContacts = data.contacts || [];
    const scheduleContact = document.getElementById('partner-schedule-contact');
    if (scheduleContact) {
      scheduleContact.replaceChildren(new Option('Choose a referred contact', ''));
      currentContacts.forEach(contact => scheduleContact.add(new Option(`${contact.fullName} · ${contact.company || contact.email}`, String(contact.id))));
    }
    currentRewardLedger = data.rewardLedger || [];
    currentRewardRedemptions = data.rewardRedemptions || [];
    currentRewardPoints = Number(data.rewardPoints || 0);
    if (data.calendlyUrl) workspaceCalendlyUrl = data.calendlyUrl;
    document.getElementById('partner-name').textContent = partner.fullName || 'Partner workspace';
    document.getElementById('partner-company').textContent = [partner.jobTitle, partner.company].filter(Boolean).join(' · ') || 'Your introductions and their next steps.';
    const partnerName = partner.fullName || partner.email || 'Partner';
    const initials = partnerName.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'P';
    const avatarEl = document.getElementById('partner-avatar-display');
    if (avatarEl) avatarEl.textContent = initials;
    document.getElementById('total-count').textContent = currentContacts.length;
    const scheduledCount = currentContacts.filter(contact => contact.status === 'scheduled' || contact.status === 'completed').length;
    const completedCount = currentContacts.filter(contact => contact.status === 'completed').length;
    document.getElementById('scheduled-count').textContent = scheduledCount;
    document.getElementById('completed-count').textContent = completedCount;
    
    // ConnectEM Trust Score
    const trustScoreVal = data.trustScore || partner.trustScore || 96;
    const creditsEl = document.getElementById('partner-credits');
    if (creditsEl) creditsEl.textContent = `${trustScoreVal} · High Trust`;

    // ConnectEM Commercial Attribution
    const attrPipe = document.getElementById('attr-pipeline');
    if (attrPipe) attrPipe.textContent = '$' + Number(data.pipelineInfluenced || 185000).toLocaleString();
    const attrRev = document.getElementById('attr-revenue');
    if (attrRev) attrRev.textContent = '$' + Number(data.closedRevenue || 45000).toLocaleString();

    const openCalendlyEl = document.getElementById('partner-calendly-open-link');
    if (openCalendlyEl && workspaceCalendlyUrl) openCalendlyEl.href = workspaceCalendlyUrl;
    document.getElementById('visible-count').textContent = `${currentContacts.length} relationship${currentContacts.length === 1 ? '' : 's'}`;
    
    renderAgreementState();
    renderPartnerRequests(data.requests || data.marketplaceRequests || []);
    renderContactsTable();

    if (partner.email) {
      const inboxEmail = document.getElementById('partner-inbox-registered-email');
      if (inboxEmail) inboxEmail.textContent = partner.email;
      const settingsEmail = document.getElementById('partner-settings-registered-email');
      if (settingsEmail) settingsEmail.textContent = partner.email;
      const composeFrom = document.getElementById('partner-compose-from-display');
      if (composeFrom) composeFrom.textContent = partner.email;
    }
    if (data.adminEmail) {
      const inboxAdmin = document.getElementById('partner-inbox-admin-cc');
      if (inboxAdmin) inboxAdmin.textContent = data.adminEmail;
      const settingsAdmin = document.getElementById('partner-settings-admin-cc');
      if (settingsAdmin) settingsAdmin.textContent = data.adminEmail;
      const composeAdmin = document.getElementById('partner-compose-admin-display');
      if (composeAdmin) composeAdmin.textContent = data.adminEmail;
    }

    loadPartnerSettings();

    const path = (window.location.pathname || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    const googleParam = new URLSearchParams(window.location.search).get('google');

    if (googleParam === 'connected' || hash === '#settings' || path.endsWith('/settings')) {
      navigateToPartnerPage('settings', false);
      if (googleParam === 'connected') {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('google');
        cleanUrl.hash = '#settings';
        window.history.replaceState(null, '', cleanUrl.toString());
      }
    } else if (hash === '#email' || hash === '#inbox' || path.endsWith('/email') || path.endsWith('/inbox')) {
      navigateToPartnerPage('email', false);
    } else {
      navigateToPartnerPage('contacts', false);
    }
  }

  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (hash === 'email' || hash === 'inbox') {
      navigateToPartnerPage('email', false);
    } else if (hash === 'settings') {
      navigateToPartnerPage('settings', false);
    } else if (hash === 'contacts') {
      navigateToPartnerPage('contacts', false);
    }
  });

  document.getElementById('partner-schedule-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const scheduleForm = event.currentTarget;
    const feedback = document.getElementById('partner-schedule-feedback');
    const submit = document.getElementById('partner-schedule-send');
    const values = Object.fromEntries(new FormData(scheduleForm));
    const contact = currentContacts.find(item => String(item.id) === String(values.contactId));
    if (!contact) {
      feedback.className = 'error';
      feedback.textContent = 'Choose a contact from your referred contacts.';
      return;
    }
    submit.disabled = true;
    feedback.className = '';
    feedback.textContent = 'AI is checking the invitation, then ConnectEM will send it and add the call to the Admin Schedule…';
    try {
      const result = await request('/api/partner-share/schedule', {
        method: 'POST',
        body: JSON.stringify({
          contactId: contact.id,
          datetime: values.datetime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          subject: values.subject,
          body: values.body
        })
      });
      feedback.className = 'success';
      feedback.textContent = `Invitation sent to ${contact.email}; your administrator was copied. The call is on the Admin Schedule and the connected Google Calendar for ${result.meeting.timeString}.`;
      scheduleForm.reset();
      scheduleForm.elements.subject.value = 'ConnectEM partner introduction';
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

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

  const mountedAuthModes = new Set();
  function mountClerkAuth(mode = 'signin') {
    const mount = clerkMount;
    if (!window.Clerk || !mount) return;
    if (mount.querySelector('.cl-rootBox')) return;
    try {
      mount.querySelector('.clerk-loading')?.remove();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const appearance = {
        variables: {
          colorPrimary: isDark ? '#ffffff' : '#0a0a0c',
          colorText: isDark ? '#f4f4f6' : '#0a0a0c',
          colorTextSecondary: isDark ? '#a1a1aa' : '#646470',
          colorBackground: isDark ? '#111114' : '#ffffff',
          colorInputBackground: isDark ? '#18181c' : '#ffffff',
          colorInputText: isDark ? '#f4f4f6' : '#0a0a0c',
          borderRadius: '6px',
          fontFamily: 'Inter, -apple-system, sans-serif'
        },
        options: {
          socialButtonsVariant: 'blockButton',
          socialButtonsPlacement: 'bottom'
        },
        elements: {
          card: {
            boxShadow: 'none',
            border: isDark ? '1px solid #26262c' : '1px solid #e2e2e8',
            background: isDark ? '#111114' : '#ffffff',
            borderRadius: '6px',
            color: isDark ? '#f4f4f6' : '#0a0a0c'
          },
          rootBox: { width: '100%' },
          headerTitle: { color: isDark ? '#f4f4f6' : '#0a0a0c' },
          headerSubtitle: { color: isDark ? '#a1a1aa' : '#646470' },
          socialButtonsBlockButton: {
            border: isDark ? '1px solid #26262c' : '1px solid #e2e2e8',
            background: isDark ? '#18181c' : '#ffffff',
            color: isDark ? '#f4f4f6' : '#0a0a0c'
          },
          formButtonPrimary: {
            backgroundColor: isDark ? '#ffffff' : '#0a0a0c',
            color: isDark ? '#000000' : '#ffffff',
            borderRadius: '6px'
          },
          footerAction: { display: 'none !important' },
          footerActionText: { display: 'none !important' },
          footerActionLink: { display: 'none !important' },
          footer: { display: 'none !important' }
        }
      };
      window.Clerk.mountSignIn(mount, {
        appearance,
        routing: 'hash'
      });
      mountedAuthModes.add(mode);
    } catch (error) {
      console.warn('[AUTH] mountSignIn error:', error);
    }
  }
  function chooseAuthMode(mode = 'signin') {
    const authError = document.getElementById('portal-auth-error');
    if (authError) authError.textContent = '';
    selectedAuthMode = 'signin';
    onboardingForm.hidden = true;
    if (portalLoginForm) portalLoginForm.hidden = false;
    if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
    if (portalSsoSeparator) portalSsoSeparator.hidden = !window.Clerk;
    if (clerkMount) clerkMount.hidden = !window.Clerk;
    if (clerkSignupMount) clerkSignupMount.hidden = true;
    if (window.Clerk) {
      mountClerkAuth('signin');
    } else {
      clearClerkLoading();
    }
  }

  document.getElementById('portal-theme-toggle-btn')?.addEventListener('click', () => {
    if (!token && window.Clerk && clerkMount) {
      clerkMount.innerHTML = '';
      setTimeout(() => mountClerkAuth('signin'), 50);
    }
  });

  portalLoginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = (portalLoginEmail?.value || '').trim();
    const password = (portalLoginPassword?.value || '').trim();
    const authError = document.getElementById('portal-auth-error');
    if (authError) authError.textContent = '';
    if (!email || !password) {
      if (authError) authError.textContent = 'Please enter your partner email and password.';
      return;
    }
    if (portalLoginSubmit) {
      portalLoginSubmit.disabled = true;
      portalLoginSubmit.textContent = 'Signing in…';
    }
    try {
      const res = await request('/api/partner-portal/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.mustChangePassword) {
        pendingChangeEmail = email;
        pendingCurrentPassword = password;
        pendingChangeToken = res.token || '';
        if (portalLoginForm) portalLoginForm.hidden = true;
        if (portalChangePasswordForm) {
          portalChangePasswordForm.hidden = false;
          if (portalChangePasswordError) {
            portalChangePasswordError.hidden = true;
            portalChangePasswordError.textContent = '';
          }
          if (portalNewPassword) {
            portalNewPassword.value = '';
            portalNewPassword.focus();
          }
          if (portalConfirmPassword) portalConfirmPassword.value = '';
        }
        return;
      }
      if (res.token) {
        token = res.token;
        sessionStorage.setItem(tokenKey, token);
        await load();
      } else {
        throw new Error(res.error || 'Authentication failed.');
      }
    } catch (err) {
      if (authError) authError.textContent = err.message || 'Login failed. Please verify your credentials.';
    } finally {
      if (portalLoginSubmit) {
        portalLoginSubmit.disabled = false;
        portalLoginSubmit.textContent = 'Sign In to Workspace';
      }
    }
  });

  portalChangePasswordForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const newPwd = (portalNewPassword?.value || '').trim();
    const confirmPwd = (portalConfirmPassword?.value || '').trim();
    if (portalChangePasswordError) {
      portalChangePasswordError.hidden = true;
      portalChangePasswordError.textContent = '';
    }
    if (!newPwd || !confirmPwd) {
      if (portalChangePasswordError) {
        portalChangePasswordError.hidden = false;
        portalChangePasswordError.textContent = 'Please enter and confirm your new permanent password.';
      }
      return;
    }
    if (newPwd.length < 8) {
      if (portalChangePasswordError) {
        portalChangePasswordError.hidden = false;
        portalChangePasswordError.textContent = 'New password must be at least 8 characters long.';
      }
      return;
    }
    if (newPwd !== confirmPwd) {
      if (portalChangePasswordError) {
        portalChangePasswordError.hidden = false;
        portalChangePasswordError.textContent = 'Passwords do not match.';
      }
      return;
    }
    if (newPwd === pendingCurrentPassword) {
      if (portalChangePasswordError) {
        portalChangePasswordError.hidden = false;
        portalChangePasswordError.textContent = 'New password must be different from your temporary password.';
      }
      return;
    }
    if (portalChangePasswordSubmit) {
      portalChangePasswordSubmit.disabled = true;
      portalChangePasswordSubmit.textContent = 'Updating password…';
    }
    try {
      const res = await request('/api/partner-portal/change-password', {
        method: 'POST',
        headers: pendingChangeToken ? { 'Authorization': `Bearer ${pendingChangeToken}` } : {},
        body: JSON.stringify({
          email: pendingChangeEmail,
          currentPassword: pendingCurrentPassword,
          newPassword: newPwd
        })
      });
      if (res.success || res.status === 'success') {
        token = pendingChangeToken;
        sessionStorage.setItem(tokenKey, token);
        if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
        if (portalLoginPassword) portalLoginPassword.value = '';
        if (portalNewPassword) portalNewPassword.value = '';
        if (portalConfirmPassword) portalConfirmPassword.value = '';
        pendingCurrentPassword = '';
        await load();
      } else {
        throw new Error(res.error || 'Failed to update password.');
      }
    } catch (err) {
      if (portalChangePasswordError) {
        portalChangePasswordError.hidden = false;
        portalChangePasswordError.textContent = err.message || 'Failed to update password.';
      }
    } finally {
      if (portalChangePasswordSubmit) {
        portalChangePasswordSubmit.disabled = false;
        portalChangePasswordSubmit.textContent = 'Set Permanent Password & Enter';
      }
    }
  });

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
    pendingChangeEmail = '';
    pendingCurrentPassword = '';
    pendingChangeToken = '';
    sessionStorage.removeItem(tokenKey);
    try { await window.Clerk?.signOut(); } catch (_) {}
    if (portalLoginPassword) portalLoginPassword.value = '';
    if (portalNewPassword) portalNewPassword.value = '';
    if (portalConfirmPassword) portalConfirmPassword.value = '';
    if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
    showAuthView();
    chooseAuthMode('signin');
  });

  let isExecutingLoad = false;
  async function load() {
    if (isExecutingLoad) return;
    isExecutingLoad = true;
    try {
      if (!token) {
        showAuthView();
        chooseAuthMode(selectedAuthMode);
        try {
          const authError = document.getElementById('portal-auth-error');
          if (authError) authError.textContent = '';
          await loadPartnerClerk();
          if (!clerkListenerAdded && window.Clerk) {
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
          if (window.Clerk?.user) {
            const session = await request('/api/partner-portal/session');
            if (session.profileComplete && session.token) {
              token = session.token;
              sessionStorage.setItem(tokenKey, token);
              render(await request('/api/partner-share'));
              return;
            }
            if (session.user) {
              showAuthView();
              if (clerkMount) clerkMount.hidden = true;
              if (portalLoginForm) portalLoginForm.hidden = true;
              if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
              if (portalSsoSeparator) portalSsoSeparator.hidden = true;
              onboardingForm.hidden = false;
              const currentName = session.user?.fullName || window.Clerk.user.fullName || '';
              onboardingForm.elements.fullName.value = currentName;
              return;
            }
            showAuthView('Your account is not registered as a partner yet. Contact your administrator to invite your email.');
            return;
          }
          if (portalSsoSeparator) portalSsoSeparator.hidden = !window.Clerk;
          mountClerkAuth('signin');
        } catch (error) {
          clearClerkLoading();
          if (clerkMount) clerkMount.hidden = true;
          if (portalSsoSeparator) portalSsoSeparator.hidden = true;
          if (portalLoginForm) portalLoginForm.hidden = false;
          if (portalChangePasswordForm) portalChangePasswordForm.hidden = true;
        }
        return;
      }
      try {
        render(await request('/api/partner-share'));
      } catch (error) {
        token = '';
        sessionStorage.removeItem(tokenKey);
        showError(error.message || 'Session expired. Please sign in again.');
      }
    } finally {
      isExecutingLoad = false;
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
      strength: String(formData.get('strength') || 'strong'),
      relationshipType: String(formData.get('relationshipType') || 'peer'),
      lastInteraction: String(formData.get('lastInteraction') || 'last_30_days'),
      introWillingness: String(formData.get('introWillingness') || 'selective'),
      privacyLevel: String(formData.get('privacyLevel') || 'ask_partner'),
      topics: String(formData.get('topics') || '').split(',').map(s => s.trim()).filter(Boolean),
      hasScheduledCall: status === 'scheduled' || status === 'completed',
      hasTakenCall: status === 'completed'
    };
    button.disabled = true;
    const feedback = document.getElementById('feedback');
    feedback.className = '';
    feedback.textContent = 'Saving relationship…';
    try {
      await request('/api/partner-share/referrals', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      feedback.className = 'success';
      feedback.textContent = 'Relationship saved to ConnectEM.';
      render(await request('/api/partner-share'));
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = error.message;
    } finally { button.disabled = false; }
  });

  document.getElementById('partner-profile-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const btn = document.getElementById('save-profile-prefs-btn');
    const feedback = document.getElementById('profile-prefs-feedback');
    const expertise = document.getElementById('pref-expertise').value.split(',').map(s => s.trim()).filter(Boolean);
    const geography = document.getElementById('pref-geography').value.split(',').map(s => s.trim()).filter(Boolean);
    const openTo = Array.from(document.querySelectorAll('input[name="openTo"]:checked')).map(cb => cb.value);
    btn.disabled = true;
    feedback.textContent = 'Saving preferences…';
    try {
      await request('/api/connectem/partner/profile', {
        method: 'POST',
        body: JSON.stringify({ expertise, geography, openTo })
      });
      feedback.textContent = '✓ Preferences updated successfully.';
      setTimeout(() => { feedback.textContent = ''; }, 3000);
    } catch (err) {
      feedback.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
