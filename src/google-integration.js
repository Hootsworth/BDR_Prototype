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
  const clientId = googleClientId();
  if (!clientId) throw new Error("Set GoogleConfig.clientId in config.js first.");
  await waitForGoogleIdentity();
  return new Promise((resolve, reject) => {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [
        "openid", "email", "profile",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.freebusy"
      ].join(" "),
      callback: (response) => {
        if (response.error) return reject(new Error(response.error_description || response.error));
        database.googleAccessToken = response.access_token;
        database.googleAccessTokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
        database.googleCalendarConnected = true;
        database.googleEmailConnected = true;
        resolve(response);
      }
    });
    googleTokenClient.requestAccessToken({ prompt: "consent" });
  });
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

async function sendGoogleGmail({ to, subject, body }) {
  return googleApiFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: gmailRawMessage(to, subject, body) })
  });
}

async function verifyGoogleWorkspace() {
  const [gmail, calendar] = await Promise.all([
    googleApiFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile"),
    googleApiFetch("https://www.googleapis.com/calendar/v3/calendars/primary")
  ]);
  return { gmail: { email: gmail.emailAddress, messagesTotal: gmail.messagesTotal }, calendar: { id: calendar.id, summary: calendar.summary } };
}

async function createGoogleCalendarEvent(eventPayload) {
  return googleApiFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload)
  });
}

async function checkGoogleAvailability(startDate, endDate) {
  const payload = await googleApiFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: new Date(startDate).toISOString(), timeMax: new Date(endDate).toISOString(), items: [{ id: "primary" }] })
  });
  return payload.calendars?.primary?.busy || [];
}

async function syncGoogleReplies(contacts) {
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

window.connectGoogleWorkspace = connectGoogleWorkspace;
window.disconnectGoogleWorkspace = disconnectGoogleWorkspace;
window.sendGoogleGmail = sendGoogleGmail;
window.verifyGoogleWorkspaceApi = verifyGoogleWorkspace;
window.createGoogleCalendarEvent = createGoogleCalendarEvent;
window.checkGoogleAvailability = checkGoogleAvailability;
window.syncGoogleReplies = syncGoogleReplies;
