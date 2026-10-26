let currentEmailFolder = 'INBOX';
let emailNextPage = '';
let selectedEmail = null;
let emailReplyContext = null;

function emailStatus(message, error = false) {
  const node = document.getElementById('email-status');
  if (node) { node.textContent = message; node.style.color = error ? 'var(--color-status-error,#dc2626)' : 'var(--color-text-secondary)'; }
}

async function emailApi(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Email request failed (${response.status})`);
  return data;
}

function initEmailPage() {
  if (!document.getElementById('email-list')) return;
  loadEmailFolder('INBOX');
}

async function loadEmailFolder(label = currentEmailFolder, append = false) {
  currentEmailFolder = label;
  const list = document.getElementById('email-list');
  if (!list) return;
  if (!append) { emailNextPage = ''; list.innerHTML = ''; }
  emailStatus('Loading mailbox…');
  try {
    const query = new URLSearchParams({ maxResults: '30' });
    if (label !== 'ALL') query.set('labelIds', label);
    const search = document.getElementById('email-search')?.value.trim();
    if (search) query.set('q', search);
    if (append && emailNextPage) query.set('pageToken', emailNextPage);
    const result = await emailApi(`/api/google/gmail/messages?${query}`);
    emailNextPage = result.nextPageToken || '';
    const items = result.items || [];
    if (!items.length && !append) list.innerHTML = '<p style="padding:1rem;color:var(--color-text-secondary);">No messages found.</p>';
    for (const message of items) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'btn btn-subtle';
      row.style.cssText = 'display:block;width:100%;text-align:left;padding:.85rem;border:0;border-bottom:1px solid var(--color-border);border-radius:0;';
      const unread = (message.labelIds || []).includes('UNREAD');
      row.innerHTML = `<strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${unread ? 'font-weight:800;' : ''}"></strong><span style="font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span><small style="color:var(--color-text-secondary);display:block;margin-top:.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></small>`;
      row.children[0].textContent = message.from || '(unknown sender)';
      row.children[1].textContent = message.subject || '(no subject)';
      row.children[2].textContent = message.snippet || message.date || '';
      row.onclick = () => openEmailMessage(message);
      list.appendChild(row);
    }
    if (emailNextPage) {
      const more = document.createElement('button'); more.className = 'btn btn-secondary'; more.textContent = 'Load more'; more.style.margin = '.75rem';
      more.onclick = () => loadEmailFolder(currentEmailFolder, true); list.appendChild(more);
    }
    emailStatus(`${items.length} messages loaded · ${label === 'ALL' ? 'All mail' : label.toLowerCase()}`);
  } catch (error) {
    emailStatus(`${error.message} Use Settings → Connect / reconnect Google if authorization is needed.`, true);
  }
}

function searchEmail() { loadEmailFolder(currentEmailFolder); }

function findEmailBody(payload) {
  const parts = payload?.parts || [];
  if (payload?.mimeType === 'text/plain' && payload.body?.data) return payload.body.data;
  for (const part of parts) { const found = findEmailBody(part); if (found) return found; }
  if (payload?.body?.data) return payload.body.data;
  return '';
}

function decodeEmailBody(data) {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  try { return decodeURIComponent(escape(atob(normalized))); } catch (_) { try { return atob(normalized); } catch (_) { return ''; } }
}

async function openEmailMessage(message) {
  selectedEmail = message;
  const panel = document.getElementById('email-message');
  panel.innerHTML = '<p>Loading message…</p>';
  try {
    const result = await emailApi(`/api/google/gmail/messages/${encodeURIComponent(message.id)}`);
    const headers = Object.fromEntries((result.payload?.headers || []).map(h => [String(h.name).toLowerCase(), h.value]));
    const body = decodeEmailBody(findEmailBody(result.payload));
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:.5rem;align-items:start;"><div><h2 style="margin:0 0 .75rem;"></h2><p class="email-meta"></p></div><div class="email-actions"></div></div><hr><pre class="email-body" style="white-space:pre-wrap;font:inherit;line-height:1.5;"></pre><div class="email-reply" style="margin-top:1rem;"></div>`;
    panel.querySelector('h2').textContent = headers.subject || message.subject || '(no subject)';
    panel.querySelector('.email-meta').textContent = `From ${headers.from || message.from} · To ${headers.to || ''} · ${headers.date || message.date || ''}`;
    panel.querySelector('.email-body').textContent = body || result.snippet || '(This message has no displayable plain text body.)';
    const actions = panel.querySelector('.email-actions');
    for (const [label, action] of [['Reply', 'reply'], ['Star', 'star'], ['Mark unread', 'markUnread'], ['Archive', 'archive']]) {
      const button = document.createElement('button'); button.className = 'btn btn-secondary btn-sm'; button.textContent = label; button.onclick = () => action === 'reply' ? replyToEmail(headers, result) : mutateEmail(result.id, action); actions.append(button);
    }
    const reply = document.createElement('button'); reply.className = 'btn btn-primary'; reply.textContent = 'Reply'; reply.onclick = () => replyToEmail(headers, result); panel.querySelector('.email-reply').append(reply);
    if ((result.labelIds || []).includes('UNREAD')) mutateEmail(result.id, 'markRead', false);
  } catch (error) { panel.textContent = error.message; }
}

async function mutateEmail(id, action, refresh = true) {
  try { await emailApi(`/api/google/gmail/messages/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) }); if (refresh) loadEmailFolder(currentEmailFolder); }
  catch (error) { emailStatus(error.message, true); }
}

function openEmailComposer() { document.getElementById('email-compose-dialog')?.showModal(); }
function newEmailMessage() { emailReplyContext = null; for (const id of ['email-compose-to', 'email-compose-subject', 'email-compose-body']) document.getElementById(id).value = ''; openEmailComposer(); }
function closeEmailComposer() { document.getElementById('email-compose-dialog')?.close(); emailReplyContext = null; }

function replyToEmail(headers, message) {
  const from = headers.from || selectedEmail?.from || '';
  const address = from.match(/<([^>]+)>/)?.[1] || from;
  document.getElementById('email-compose-to').value = address;
  document.getElementById('email-compose-subject').value = /^re:/i.test(headers.subject || '') ? headers.subject : `Re: ${headers.subject || ''}`;
  document.getElementById('email-compose-body').value = `\n\nOn ${headers.date || ''}, ${from} wrote:\n`;
  emailReplyContext = { threadId: message.threadId, inReplyTo: headers['message-id'] || '', references: [headers.references, headers['message-id']].filter(Boolean).join(' ') };
  openEmailComposer();
}

async function sendEmailFromInbox() {
  const payload = { to: document.getElementById('email-compose-to').value.trim(), subject: document.getElementById('email-compose-subject').value.trim(), body: document.getElementById('email-compose-body').value, approved: true, ...(emailReplyContext || {}) };
  try { await emailApi('/api/google/gmail/send', { method: 'POST', body: JSON.stringify(payload) }); closeEmailComposer(); emailReplyContext = null; emailStatus('Sent from your connected Google account; Admin was CC’d.'); loadEmailFolder('SENT'); }
  catch (error) { emailStatus(error.message, true); }
}

async function saveEmailDraft() {
  const payload = { to: document.getElementById('email-compose-to').value.trim(), subject: document.getElementById('email-compose-subject').value.trim() || '(draft)', body: document.getElementById('email-compose-body').value || ' ' };
  try { await emailApi('/api/google/gmail/draft', { method: 'POST', body: JSON.stringify(payload) }); closeEmailComposer(); emailStatus('Draft saved to Gmail with Admin CC.'); }
  catch (error) { emailStatus(error.message, true); }
}

window.initEmailPage = initEmailPage;
window.loadEmailFolder = loadEmailFolder;
window.searchEmail = searchEmail;
window.openEmailComposer = openEmailComposer;
window.newEmailMessage = newEmailMessage;
window.closeEmailComposer = closeEmailComposer;
window.sendEmailFromInbox = sendEmailFromInbox;
window.saveEmailDraft = saveEmailDraft;
