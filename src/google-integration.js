// Browser-only Google Workspace integration.
// OAuth tokens stay in memory and are never written to localStorage or the workbook.
let googleTokenClient = null;

function googleClientId() {
  return window.GoogleConfig?.clientId || "";
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > 10000) return reject(new Error("Google Identity Services did not load."));
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function connectGoogleWorkspace() {
  window.location.assign("/api/google/oauth/start");
  return false;
}

function disconnectGoogleWorkspace() {
  if (database.googleAccessToken && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(database.googleAccessToken, () => {});
  }
  database.googleAccessToken = "";
  database.googleCalendarConnected = false;
  database.googleEmailConnected = false;
  database.googleAccessTokenExpiresAt = 0;
}

async function googleApiFetch(url, options = {}) {
  if (!database.googleAccessToken) throw new Error("Connect Google Workspace first.");
  if (database.googleAccessTokenExpiresAt && Date.now() > database.googleAccessTokenExpiresAt) {
    disconnectGoogleWorkspace();
    throw new Error("Google access expired. Reconnect Google Workspace.");
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${database.googleAccessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Google API returned ${response.status}`);
  return payload;
}

function gmailRawMessage(to, subject, body) {
  const mime = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
  return btoa(unescape(encodeURIComponent(mime))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isLiveGoogleOAuthToken(token) {
  return Boolean(
    token &&
    !token.startsWith("demo_") &&
    !token.startsWith("google_workspace_token_")
  );
}

async function sendGoogleGmail({ to, subject, body }) {
  if (isLiveGoogleOAuthToken(database.googleAccessToken)) {
    try {
      const result = await googleApiFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: gmailRawMessage(to, subject, body) })
      });
      return { ...result, provider: "gmail" };
    } catch (err) {
      console.warn("Live Gmail API send failed, falling back to operational server email gateway:", err.message);
    }
  }
  // Website email is sent by the server's configured provider; it never reports a demo send as delivered.
  const headers = { "Content-Type": "application/json" };
  const clerkToken = window.Clerk?.session ? await window.Clerk.session.getToken().catch(() => "") : "";
  if (clerkToken) headers.Authorization = `Bearer ${clerkToken}`;
  const response = await fetch("/api/email/send", {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, body })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Email gateway returned ${response.status}`);
  }
  if (!payload.id || payload.provider !== "resend") throw new Error("Email provider did not confirm delivery. No sent status was recorded.");
  return payload;
}

async function verifyGoogleWorkspace() {
  if (isLiveGoogleOAuthToken(database.googleAccessToken)) {
    const [gmail, calendar] = await Promise.all([
      googleApiFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile"),
      googleApiFetch("https://www.googleapis.com/calendar/v3/calendars/primary")
    ]);
    return { gmail: { email: gmail.emailAddress, messagesTotal: gmail.messagesTotal }, calendar: { id: calendar.id, summary: calendar.summary } };
  }
  const response = await fetch('/api/google/verify');
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Connect Google Workspace first.');
  return result;
}

async function createGoogleCalendarEvent(eventPayload) {
  if (isLiveGoogleOAuthToken(database.googleAccessToken)) {
    try {
      return await googleApiFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload)
      });
    } catch (err) {
      console.warn("Live Google Calendar event fallback:", err.message);
    }
  }
  const response = await fetch('/api/google/calendar/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventPayload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Google Calendar event creation failed.');
  return result;
}

async function checkGoogleAvailability(startDate, endDate) {
  if (isLiveGoogleOAuthToken(database.googleAccessToken)) {
    try {
      const payload = await googleApiFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin: new Date(startDate).toISOString(), timeMax: new Date(endDate).toISOString(), items: [{ id: "primary" }] })
      });
      return payload.calendars?.primary?.busy || [];
    } catch (err) {
      return [];
    }
  }
  throw new Error("Connect Google Workspace to check calendar availability.");
}

async function syncGoogleReplies(contacts) {
  if (isLiveGoogleOAuthToken(database.googleAccessToken)) {
    const replies = [];
    for (const contact of contacts.filter(c => c.email && c.emailsSent)) {
      const q = encodeURIComponent(`from:${contact.email} newer_than:30d`);
      const listing = await googleApiFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`);
      for (const message of listing.messages || []) {
        const detail = await googleApiFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
        const headers = Object.fromEntries((detail.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
        replies.push({ contactEmail: contact.email, messageId: detail.id, threadId: detail.threadId, from: headers.from || contact.email, subject: headers.subject || "", date: headers.date || "", snippet: detail.snippet || "" });
      }
    }
    return { replies, syncedAt: new Date().toISOString() };
  }
  return { replies: [], syncedAt: new Date().toISOString() };
}

window.connectGoogleWorkspace = connectGoogleWorkspace;
window.disconnectGoogleWorkspace = disconnectGoogleWorkspace;
window.sendGoogleGmail = sendGoogleGmail;
window.verifyGoogleWorkspaceApi = verifyGoogleWorkspace;
window.createGoogleCalendarEvent = createGoogleCalendarEvent;
window.checkGoogleAvailability = checkGoogleAvailability;
window.syncGoogleReplies = syncGoogleReplies;
