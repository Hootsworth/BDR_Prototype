import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createConnectemApp } from '../src/server.ts';

// Helper to simulate HTTP requests against node http.Server without opening real network socket
async function simulateRequest(
  server: any,
  urlPath: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<{ status: number; headers: Record<string, any>; data: any; text: string }> {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter() as any;
    req.method = options.method || 'GET';
    req.url = urlPath;
    req.headers = { host: 'localhost:8002', ...(options.headers || {}) };

    const res = new EventEmitter() as any;
    res.statusCode = 200;
    res._headers = {};
    res.setHeader = (k: string, v: string) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k: string) => res._headers[k.toLowerCase()];
    res.writeHead = (status: number, h?: any) => {
      res.statusCode = status;
      if (h) Object.assign(res._headers, h);
    };

    let bodyData = '';
    res.write = (chunk: any) => { bodyData += chunk.toString(); };
    res.end = (chunk?: any) => {
      if (chunk) bodyData += chunk.toString();
      let parsed = null;
      try { parsed = JSON.parse(bodyData); } catch (_) { parsed = null; }
      resolve({
        status: res.statusCode,
        headers: res._headers,
        data: parsed,
        text: bodyData
      });
    };

    server.emit('request', req, res);

    if (options.body) {
      req.emit('data', Buffer.from(JSON.stringify(options.body)));
    }
    req.emit('end');
  });
}

test('Admin UI: serves single-screen portal with Prospects first, Influencers second, Login, and no Contacts', async () => {
  const { server } = createConnectemApp();

  // 1. GET /admin returns single-screen admin console
  const adminRes = await simulateRequest(server, '/admin');
  assert.equal(adminRes.status, 200);
  assert.ok(adminRes.headers['content-type']?.includes('text/html'));
  assert.ok(adminRes.text.includes('ConnectEM · Admin Console'));

  // 2. Contacts is unnecessary entirely & removed
  assert.ok(!adminRes.text.includes('id="tab-panel-upload"'));
  assert.ok(!adminRes.text.includes('id="cat-group-contacts"'));

  // 3. Shows screen with Prospects first, Influencers second
  assert.ok(adminRes.text.includes('id="panel-prospects"'));
  assert.ok(adminRes.text.includes('id="panel-influencers"'));
  assert.ok(adminRes.text.includes('id="tab-prospects"'));
  assert.ok(adminRes.text.includes('id="tab-influencers"'));

  // Check that tab-prospects appears before tab-influencers in the navigation
  const prospIdx = adminRes.text.indexOf('id="tab-prospects"');
  const infIdx = adminRes.text.indexOf('id="tab-influencers"');
  assert.ok(prospIdx < infIdx, 'Prospects tab must be ordered before Influencers tab');

  // 4. Admin login view & controls exist
  assert.ok(adminRes.text.includes('id="admin-login-view"'));
  assert.ok(adminRes.text.includes('id="login-email"'));
  assert.ok(adminRes.text.includes('id="login-password"'));
  assert.ok(adminRes.text.includes('id="admin-login-submit-btn"'));
  assert.ok(adminRes.text.includes('id="admin-signout-btn"'));

  // 5. Both have Outreach and Add buttons
  assert.ok(adminRes.text.includes('id="influencer-global-outreach-btn"'));
  assert.ok(adminRes.text.includes('id="add-influencer-btn"'));
  assert.ok(adminRes.text.includes('id="prospect-global-outreach-btn"'));
  assert.ok(adminRes.text.includes('id="add-prospect-btn"'));

  // 6. Basic info: influencers show the number of prospects they have given
  assert.ok(adminRes.text.includes('Prospects Given'));
  assert.ok(adminRes.text.includes('badge-prospects-count'));
  assert.ok(adminRes.text.includes('prospects given'));

  // 7. Outreach and Add modals exist with CC to nextbdr@gmail.com
  assert.ok(adminRes.text.includes('id="modal-add-influencer"'));
  assert.ok(adminRes.text.includes('id="modal-add-prospect"'));
  assert.ok(adminRes.text.includes('id="modal-outreach"'));
  assert.ok(adminRes.text.includes('nextbdr@gmail.com'));

  // 8. Dedicated Outreach Studio screen with left-pane people list and right-pane multichannel options & influencer dossier
  assert.ok(adminRes.text.includes('id="panel-outreach"'));
  assert.ok(adminRes.text.includes('id="tab-outreach"'));
  assert.ok(adminRes.text.includes('id="outreach-people-list"'));
  assert.ok(adminRes.text.includes('id="dossier-influencer-notes"'));
  assert.ok(adminRes.text.includes('id="channel-tab-email"'));
  assert.ok(adminRes.text.includes('id="channel-tab-linkedin"'));
  assert.ok(adminRes.text.includes('id="channel-tab-call"'));

  // 9. Events & Calendar view, modals, and tab
  assert.ok(adminRes.text.includes('id="tab-events"'));
  assert.ok(adminRes.text.includes('id="panel-events"'));
  assert.ok(adminRes.text.includes('id="modal-create-event"'));
  assert.ok(adminRes.text.includes('id="modal-add-attendee"'));
  assert.ok(adminRes.text.includes('id="btn-create-event"'));

  // 10. Outreach Schedule / Calendar for meetings done by influencers (Agent Mode removed)
  assert.ok(!adminRes.text.includes('id="tab-agent"'));
  assert.ok(!adminRes.text.includes('id="panel-agent"'));
  assert.ok(adminRes.text.includes('id="btn-outreach-mode-schedule"'));
  assert.ok(adminRes.text.includes('id="outreach-schedule-view"'));
  assert.ok(adminRes.text.includes('id="calendar-days-grid"'));
  assert.ok(adminRes.text.includes('id="selected-date-meetings-list"'));
  assert.ok(adminRes.text.includes('id="modal-book-meeting"'));

  // 11. Convert to Influencer buttons
  assert.ok(adminRes.text.includes('convertProspectToInfluencer'));
  assert.ok(adminRes.text.includes('id="dossier-convert-influencer-btn"'));
});

test('Admin Auth API: login, session resolution, and logout lifecycle', async () => {
  const { server } = createConnectemApp();

  // 1. POST /api/admin/login
  const loginRes = await simulateRequest(server, '/api/admin/login', {
    method: 'POST',
    body: { email: 'nextbdr@gmail.com', password: 'secure_password' }
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.data.success, true);
  assert.ok(loginRes.data.data.token.startsWith('admin_token_'));
  assert.equal(loginRes.data.data.email, 'nextbdr@gmail.com');
  const token = loginRes.data.data.token;

  // 2. GET /api/admin/session with Bearer token
  const sessionRes = await simulateRequest(server, '/api/admin/session', {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.data.success, true);
  assert.equal(sessionRes.data.data.valid, true);

  // 3. POST /api/admin/logout
  const logoutRes = await simulateRequest(server, '/api/admin/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.data.data.loggedOut, true);

  // 4. Session now unauthorized
  const postLogoutSession = await simulateRequest(server, '/api/admin/session', {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(postLogoutSession.status, 401);
});

test('Admin API: metrics, target account discovery, warm intro launch, and partner directory', async () => {
  const { server } = createConnectemApp();

  // 1. GET /api/admin/metrics
  const metricsRes = await simulateRequest(server, '/api/admin/metrics');
  assert.equal(metricsRes.status, 200);
  assert.equal(metricsRes.data.success, true);
  assert.ok(typeof metricsRes.data.data.activePartners === 'number');

  // 2. GET /api/admin/search-accounts?q=Apex
  const searchRes = await simulateRequest(server, '/api/admin/search-accounts?q=Apex');
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.success, true);
  assert.ok(searchRes.data.data.length >= 1);
  const match = searchRes.data.data[0];
  assert.equal(match.prospect.company, 'Apex Federal Credit Union');
  assert.equal(match.partner.fullName, 'Bob Miller');
  assert.ok(match.score >= 90);

  // 3. POST /api/admin/intro-requests to launch warm intro
  const createIntroRes = await simulateRequest(server, '/api/admin/intro-requests', {
    method: 'POST',
    body: {
      vendorId: 'vendor_admin',
      vendorName: 'SecOps AI',
      partnerId: match.partner.id,
      prospectId: match.prospect.id,
      specificAsk: '20-minute executive briefing on secure data operations',
      customBrief: 'Hi Sarah, Bob Miller recommends an executive briefing.'
    }
  });
  assert.equal(createIntroRes.status, 201);
  assert.equal(createIntroRes.data.success, true);
  const createdReq = createIntroRes.data.data;
  assert.ok(createdReq.id.startsWith('req_'));
  assert.equal(createdReq.status, 'pending_partner_review');

  // 4. GET /api/admin/intro-requests lists the new request
  const listIntroRes = await simulateRequest(server, '/api/admin/intro-requests');
  assert.equal(listIntroRes.status, 200);
  assert.ok(listIntroRes.data.data.some((r: any) => r.id === createdReq.id));

  // 5. GET /api/admin/partners
  const partnersRes = await simulateRequest(server, '/api/admin/partners');
  assert.equal(partnersRes.status, 200);
  assert.ok(partnersRes.data.data.length >= 1);
  const bob = partnersRes.data.data.find((p: any) => p.fullName === 'Bob Miller');
  assert.ok(bob);
  assert.ok(typeof bob.contactsCount === 'number');

  // 6. POST /api/admin/prospects to link a new executive contact
  const addProspectRes = await simulateRequest(server, '/api/admin/prospects', {
    method: 'POST',
    body: {
      partnerId: bob.id,
      fullName: 'Marcus Vance',
      email: 'mvance@crestview.org',
      company: 'Crestview Capital',
      jobTitle: 'Managing Partner',
      relationshipStrength: 'strong',
      relationshipContext: 'Co-investor in FinTech Syndicate'
    }
  });
  assert.equal(addProspectRes.status, 201);
  assert.equal(addProspectRes.data.data.fullName, 'Marcus Vance');

  // 7. Search discovery discovers Marcus Vance immediately
  const searchNewRes = await simulateRequest(server, '/api/admin/search-accounts?q=Crestview');
  assert.equal(searchNewRes.status, 200);
  assert.equal(searchNewRes.data.data.length, 1);
  assert.equal(searchNewRes.data.data[0].prospect.fullName, 'Marcus Vance');

  // 8. POST /api/admin/partners adds a new influencer with 0 prospects initially
  const addInfRes = await simulateRequest(server, '/api/admin/partners', {
    method: 'POST',
    body: {
      fullName: 'Sarah Jenkins',
      email: 'sjenkins@meridian.vc',
      company: 'Meridian Ventures',
      jobTitle: 'General Partner'
    }
  });
  assert.equal(addInfRes.status, 201);
  assert.equal(addInfRes.data.data.fullName, 'Sarah Jenkins');

  // 9. POST /api/admin/outreach dispatches outreach with mandatory CC to nextbdr@gmail.com
  const outreachRes = await simulateRequest(server, '/api/admin/outreach', {
    method: 'POST',
    body: {
      targetType: 'influencer',
      targetId: addInfRes.data.data.id,
      recipientEmail: 'sjenkins@meridian.vc',
      recipientName: 'Sarah Jenkins',
      subject: 'Executive Briefing Alignment',
      message: 'Would love to connect on introductions.'
    }
  });
  assert.equal(outreachRes.status, 200);
  assert.equal(outreachRes.data.data.recipientEmail, 'sjenkins@meridian.vc');
  assert.equal(outreachRes.data.data.complianceCc, 'nextbdr@gmail.com');
});

test('Old Admin APIs: state persistence, provider keys, and database search', async () => {
  const { server } = createConnectemApp();

  // 1. GET /api/db/state returns normalized database state
  const stateRes = await simulateRequest(server, '/api/db/state');
  assert.equal(stateRes.status, 200);
  assert.ok(stateRes.data.state);
  assert.ok(Array.isArray(stateRes.data.state.contacts));

  // 2. GET /api/admin/provider-keys
  const keysRes = await simulateRequest(server, '/api/admin/provider-keys');
  assert.equal(keysRes.status, 200);
  assert.equal(keysRes.data.adminEmail, 'nextbdr@gmail.com');

  // 3. GET /api/db/search
  const searchDbRes = await simulateRequest(server, '/api/db/search?q=Apex');
  assert.equal(searchDbRes.status, 200);
  assert.ok(Array.isArray(searchDbRes.data.results));
});

test('Admin UI & API: Convert prospect to influencer', async () => {
  const { server } = createConnectemApp();

  // 1. Get initial prospects
  const prospRes = await simulateRequest(server, '/api/admin/prospects');
  assert.equal(prospRes.status, 200);
  assert.ok(prospRes.data.data.length > 0);
  const prospect = prospRes.data.data[0];

  // 2. Convert to influencer
  const convertRes = await simulateRequest(server, `/api/admin/prospects/${prospect.id}/convert-to-influencer`, {
    method: 'POST'
  });
  assert.equal(convertRes.status, 200);
  assert.equal(convertRes.data.success, true);
  assert.equal(convertRes.data.data.fullName, prospect.fullName);
  assert.equal(convertRes.data.data.email, prospect.email);

  // 3. Converted influencer appears in partners directory
  const partnersRes = await simulateRequest(server, '/api/admin/partners');
  assert.equal(partnersRes.status, 200);
  const found = partnersRes.data.data.find((p: any) => p.email === prospect.email);
  assert.ok(found, 'Converted partner must exist in partners list');
  assert.equal(found.fullName, prospect.fullName);

  // 4. Converting again returns the existing partner gracefully
  const secondConvertRes = await simulateRequest(server, `/api/admin/prospects/${prospect.id}/convert-to-influencer`, {
    method: 'POST'
  });
  assert.equal(secondConvertRes.status, 200);
  assert.equal(secondConvertRes.data.success, true);
  assert.equal(secondConvertRes.data.data.id, found.id);
});

test('Admin UI & API: Events & Calendar view, event creation, attendee addition, and attendee to influencer conversion', async () => {
  const { server } = createConnectemApp();

  // 1. GET /api/admin/events returns seeded events
  const eventsRes = await simulateRequest(server, '/api/admin/events');
  assert.equal(eventsRes.status, 200);
  assert.equal(eventsRes.data.success, true);
  assert.ok(Array.isArray(eventsRes.data.data));
  assert.ok(eventsRes.data.data.length >= 3);
  const firstEvent = eventsRes.data.data[0];
  assert.ok(firstEvent.attendees.length > 0);

  // 2. POST /api/admin/events creates a new executive field event
  const createRes = await simulateRequest(server, '/api/admin/events', {
    method: 'POST',
    body: {
      title: 'Cloud Leadership Council',
      date: 'Dec 10, 2026',
      location: 'Palace Hotel, San Francisco',
      eventType: 'Executive Roundtable',
      description: 'Private closed-door dinner with VP/C-level leaders.'
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.data.success, true);
  const newEventId = createRes.data.data.id;
  assert.equal(createRes.data.data.title, 'Cloud Leadership Council');

  // 3. POST /api/admin/events/:id/attendees adds an attendee
  const addAttRes = await simulateRequest(server, `/api/admin/events/${newEventId}/attendees`, {
    method: 'POST',
    body: {
      fullName: 'Samantha Vance',
      email: 'samantha.vance@cloudmatrix.io',
      company: 'CloudMatrix',
      jobTitle: 'VP of Platform Engineering',
      notes: 'Key decision maker for infrastructure partnerships'
    }
  });
  assert.equal(addAttRes.status, 201);
  assert.equal(addAttRes.data.success, true);
  const attendeeId = addAttRes.data.data.id;
  assert.equal(addAttRes.data.data.fullName, 'Samantha Vance');

  // 4. POST /api/admin/events/:eventId/convert-attendee/:attendeeId converts attendee to Influencer
  const convertAttRes = await simulateRequest(server, `/api/admin/events/${newEventId}/convert-attendee/${attendeeId}`, {
    method: 'POST'
  });
  assert.equal(convertAttRes.status, 200);
  assert.equal(convertAttRes.data.success, true);
  assert.equal(convertAttRes.data.data.fullName, 'Samantha Vance');
  assert.equal(convertAttRes.data.data.company, 'CloudMatrix');

  // 5. Verify partner appears in partners list
  const partnersRes = await simulateRequest(server, '/api/admin/partners');
  const found = partnersRes.data.data.find((p: any) => p.email === 'samantha.vance@cloudmatrix.io');
  assert.ok(found, 'Attendee converted to influencer must be present in partners list');
});

test('Admin UI & API: Scheduled meetings calendar in Outreach tab with meetings done by influencers', async () => {
  const { server } = createConnectemApp();

  // 1. GET /api/admin/scheduled-meetings returns scheduled briefings done by influencers
  const meetingsRes = await simulateRequest(server, '/api/admin/scheduled-meetings');
  assert.equal(meetingsRes.status, 200);
  assert.equal(meetingsRes.data.success, true);
  assert.ok(Array.isArray(meetingsRes.data.data));
  assert.ok(meetingsRes.data.data.length > 0);

  const firstMeeting = meetingsRes.data.data[0];
  assert.ok(firstMeeting.contactName);
  assert.ok(firstMeeting.influencerName);
  assert.ok(firstMeeting.meetingUrl);
  assert.ok(firstMeeting.timeString);

  // 2. POST /api/admin/scheduled-meetings books/records a new meeting
  const bookRes = await simulateRequest(server, '/api/admin/scheduled-meetings', {
    method: 'POST',
    body: {
      contactName: 'Victoria Price',
      contactTitle: 'Chief Information Officer',
      contactCompany: 'Pacific Crest Financial',
      contactEmail: 'victoria.price@pacificcrest.org',
      influencerName: 'Bob Miller',
      platform: 'Google Meet',
      meetingUrl: 'https://meet.google.com/pcf-briefing',
      timeString: '11/18/2026 at 03:00 PM (EST)',
      datetimeRaw: '2026-11-18T15:00:00.000Z',
      notes: 'Arranged by Bob Miller. Discussing core database zero-trust gateways.'
    }
  });
  assert.equal(bookRes.status, 201);
  assert.equal(bookRes.data.success, true);
  assert.equal(bookRes.data.data.contactName, 'Victoria Price');
  assert.equal(bookRes.data.data.influencerName, 'Bob Miller');

  // 3. Verify newly booked meeting appears in list
  const listRes = await simulateRequest(server, '/api/admin/scheduled-meetings');
  const found = listRes.data.data.find((m: any) => m.contactEmail === 'victoria.price@pacificcrest.org');
  assert.ok(found, 'Booked meeting must be present in scheduled meetings list');
  assert.equal(found.influencerName, 'Bob Miller');
});

test('Admin UI & API: Influencer credits, filtered outreach by influencer, and Settings screen', async () => {
  const { server } = createConnectemApp();

  // 1. GET /api/admin/partners returns influencers with credits and contactsCount
  const partnersRes = await simulateRequest(server, '/api/admin/partners');
  assert.equal(partnersRes.status, 200);
  assert.equal(partnersRes.data.success, true);
  assert.ok(Array.isArray(partnersRes.data.data));
  assert.ok(partnersRes.data.data.length > 0);
  const firstPartner = partnersRes.data.data[0];
  assert.ok(typeof firstPartner.credits === 'number', 'Partner must have numeric credits');
  assert.ok(typeof firstPartner.contactsCount === 'number', 'Partner must have numeric contactsCount');

  // 2. GET /api/admin/settings returns admin settings with compliance email and AI config
  const getSettingsRes = await simulateRequest(server, '/api/admin/settings');
  assert.equal(getSettingsRes.status, 200);
  assert.equal(getSettingsRes.data.success, true);
  assert.equal(getSettingsRes.data.data.adminEmail, 'nextbdr@gmail.com');
  assert.equal(getSettingsRes.data.data.defaultCreditsPerProspect, 50);
  assert.equal(getSettingsRes.data.data.autoApproveIntros, true);

  // 3. POST /api/admin/settings updates settings
  const updateSettingsRes = await simulateRequest(server, '/api/admin/settings', {
    method: 'POST',
    body: {
      adminEmail: 'nextbdr@gmail.com',
      notificationEmail: 'audit@example.com',
      defaultCreditsPerProspect: 100,
      creditsPerMeeting: 300,
      autoApproveIntros: true,
      defaultAiModel: 'gpt-4o'
    }
  });
  assert.equal(updateSettingsRes.status, 200);
  assert.equal(updateSettingsRes.data.success, true);
  assert.equal(updateSettingsRes.data.data.notificationEmail, 'audit@example.com');
  assert.equal(updateSettingsRes.data.data.defaultCreditsPerProspect, 100);
  assert.equal(updateSettingsRes.data.data.creditsPerMeeting, 300);
  assert.equal(updateSettingsRes.data.data.defaultAiModel, 'gpt-4o');

  // 4. Verify admin.html UI contains settings tab, settings panel, influencer filter banner, and credits badges
  const uiRes = await simulateRequest(server, '/admin');
  assert.equal(uiRes.status, 200);
  const html = uiRes.text;

  // Settings tab and panel
  assert.ok(html.includes('id="tab-settings"'), 'Must contain Settings top navigation tab');
  assert.ok(html.includes('id="panel-settings"'), 'Must contain Settings panel view');
  assert.ok(html.includes('id="setting-admin-email"'), 'Must contain Compliance Email input in settings');
  assert.ok(html.includes('id="btn-save-settings"'), 'Must contain Save Settings button');
  assert.ok(html.includes('exportDatabaseState()'), 'Must contain export database function');

  // Influencer credits and clickable prospects given
  assert.ok(html.includes('badge-credits'), 'Must contain badge-credits CSS class');
  assert.ok(html.includes('badge-prospects-count-btn'), 'Must contain clickable prospects count button class');
  assert.ok(html.includes('openInfluencerOutreach'), 'Must contain openInfluencerOutreach function');
  assert.ok(html.includes('id="outreach-influencer-filter-banner"'), 'Must contain filter banner in outreach screen');
  assert.ok(html.includes('clearOutreachInfluencerFilter()'), 'Must contain clear filter function');

  // Contacted vs Not Contacted styling and Send Email button existence
  assert.ok(html.includes('is-contacted'), 'Must contain subtle is-contacted row class for contacted people');
  assert.ok(html.includes('is-pending'), 'Must contain is-pending row class for uncontacted people');
  assert.ok(html.includes('badge-contacted'), 'Must contain badge-contacted styling');
  assert.ok(html.includes('badge-uncontacted'), 'Must contain badge-uncontacted styling');
  assert.ok(html.includes('id="studio-email-send-btn"'), 'Must contain prominent studio email send button');
  assert.ok(!html.includes('id="dossier-quick-send-email-btn"'), 'Must not have duplicate top Send Email button in dossier header');

  // Sidebar scrolling and flat paper design contract
  assert.ok(html.includes('#outreach-dispatch-view'), 'Must have CSS rules for outreach-dispatch-view flex constraint');
  assert.ok(html.includes('overflow-y: scroll'), 'Sidebar people scroll must have explicit scrollable overflow');
  assert.ok(!html.includes('radial-gradient(ellipse at 72% -12%'), 'Must not contain AI-generated radial gradient blob');
});
