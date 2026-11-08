import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import type { Server } from 'node:http';
import { createConnectemApp } from '../src/server.ts';

function simulateRequest(
  server: Server,
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; text: string; data: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const bodyStr = options.body ? JSON.stringify(options.body) : '';

    const req = new Readable({
      read() {
        if (bodyStr) this.push(bodyStr);
        this.push(null);
      }
    }) as any;

    req.url = path;
    req.method = method;
    const headerObj: Record<string, string> = {
      host: 'localhost:8002',
      ...(bodyStr ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(bodyStr)) } : {})
    };
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headerObj[k.toLowerCase()] = v;
      }
    }
    req.headers = headerObj;

    let resBody = '';
    const resHeaders: Record<string, string> = {};
    let statusCode = 200;

    const res = new Writable({
      write(chunk, _encoding, callback) {
        resBody += chunk.toString();
        callback();
      }
    }) as any;

    res.setHeader = (key: string, value: string) => {
      resHeaders[key.toLowerCase()] = value;
    };
    res.writeHead = (code: number, headers?: Record<string, string>) => {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          resHeaders[k.toLowerCase()] = v;
        }
      }
    };

    res.on('finish', () => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(resBody);
      } catch {
        parsed = null;
      }
      resolve({ status: statusCode, text: resBody, data: parsed, headers: resHeaders });
    });

    res.on('error', reject);
    server.emit('request', req, res);
  });
}

test('Go Portal: static routes serve HTML, CSS, and JS', async () => {
  const { server } = createConnectemApp();

  // Root / and /go serve index.html
  const rootRes = await simulateRequest(server, '/');
  assert.equal(rootRes.status, 200);
  assert.match(rootRes.headers['content-type'], /text\/html/);
  assert.ok(rootRes.text.includes('Partner Portal · ConnectEM'));
  assert.ok(rootRes.text.includes('Sign In'));

  const goRes = await simulateRequest(server, '/go');
  assert.equal(goRes.status, 200);
  assert.ok(goRes.text.includes('ConnectEM'));

  // Style CSS serves Cursor Design tokens
  const cssRes = await simulateRequest(server, '/style.css');
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers['content-type'], /text\/css/);
  assert.ok(cssRes.text.includes('--primary: #f54e00')); // Cursor Orange
  assert.ok(cssRes.text.includes('--canvas: #f7f7f4')); // Warm cream canvas
  assert.ok(cssRes.text.includes('--timeline-thinking: #dfa88f')); // AI Timeline palette
  assert.ok(cssRes.text.includes('--hairline: #e6e5e0')); // Hairline depth only

  // Client app.js serves logic
  const jsRes = await simulateRequest(server, '/app.js');
  assert.equal(jsRes.status, 200);
  assert.match(jsRes.headers['content-type'], /application\/javascript/);
  assert.ok(jsRes.text.includes('ConnectEM Go Partner Portal Client'));

  // Favicon
  const iconRes = await simulateRequest(server, '/favicon.svg');
  assert.equal(iconRes.status, 200);
  assert.match(iconRes.headers['content-type'], /image\/svg\+xml/);
});

test('Go Portal: HTML structure preserves all core partner features', async () => {
  const { server } = createConnectemApp();
  const res = await simulateRequest(server, '/go');

  // Verify structure:
  // 1. Auth & Onboarding
  assert.ok(res.text.includes('id="auth-section"'));
  assert.ok(res.text.includes('id="login-form"'));
  assert.ok(res.text.includes('id="onboarding-form"'));
  assert.ok(res.text.includes('quick-demo-login-btn'));

  // 2. Workspace container & Header
  assert.ok(res.text.includes('id="workspace-section"'));
  assert.ok(res.text.includes('id="partner-display-name"'));
  assert.ok(res.text.includes('id="copy-booking-btn"'));

  // 3. Top KPI stats strip removed per design cleanup
  assert.ok(!res.text.includes('id="stat-contacts"'));
  assert.ok(!res.text.includes('aria-label="Partner Quality Metrics"'));

  // 4. Four Core Navigation Tabs (Requests tab removed; replaced by top-right notifications)
  assert.ok(res.text.includes('id="tab-btn-contacts"'));
  assert.ok(!res.text.includes('id="tab-btn-inbox"'));
  assert.ok(res.text.includes('id="tab-btn-email"'));
  assert.ok(res.text.includes('id="tab-btn-rewards"'));
  assert.ok(res.text.includes('id="tab-btn-settings"'));
  assert.ok(res.text.includes('id="nav-notifications-btn"'));

  // 5. Contacts popup modal & Double Opt-In Flow
  assert.ok(res.text.includes('id="open-add-contact-modal-btn"'));
  assert.ok(res.text.includes('id="add-contact-modal"'));
  assert.ok(res.text.includes('id="add-relationship-form"'));
  assert.ok(res.text.includes('id="intro-requests-list"'));
  assert.ok(res.text.includes('id="rewards-redeem-form"'));
  assert.ok(res.text.includes('id="privacy-settings-form"'));
});

test('Go Portal API: partner login, session resolution, and double opt-in review', async () => {
  const { server, store } = createConnectemApp();

  // 1. Login with demo partner email
  const loginRes = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' }
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.data.success, true);
  assert.equal(loginRes.data.data.partner.fullName, 'Bob Miller');
  const token = loginRes.data.data.token;
  assert.ok(token);

  // 2. Fetch session using token
  const sessionRes = await simulateRequest(server, '/api/go/session', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.data.data.fullName, 'Bob Miller');
  assert.equal(sessionRes.data.data.privacyTier, 'ask_partner');

  // Create an intro request for Bob Miller to review
  const prospect = store.listProspectsByPartner('partner_bmiller')[0];
  const createdReq = store.createIntroRequest({
    vendorId: 'vendor_qoreai',
    vendorName: 'QoreAI',
    partnerId: 'partner_bmiller',
    prospectId: prospect.id,
    forwardableBrief: 'Modernization test brief',
    specificAsk: '20 min call'
  });

  // 3. Check inbox contains pending request
  const inboxRes = await simulateRequest(server, '/api/go/inbox', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(inboxRes.status, 200);
  assert.equal(inboxRes.data.data.length, 1);
  const pendingReq = inboxRes.data.data[0];
  assert.equal(pendingReq.status, 'pending_partner_review');

  // 4. Partner reviews and approves request -> generates double opt-in token
  const reviewRes = await simulateRequest(server, '/api/go/inbox/review', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      requestId: pendingReq.id,
      decision: 'approved'
    }
  });
  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.data.data.request.status, 'partner_approved');
  assert.ok(reviewRes.data.data.optInUrl.includes('/opt-in?token='));
});

test('Go Portal API: relationship management, rewards redemption, and privacy settings', async () => {
  const { server } = createConnectemApp();

  // Login
  const loginRes = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' }
  });
  const token = loginRes.data.data.token;

  // 1. Add a relationship
  const addRelRes = await simulateRequest(server, '/api/go/relationships', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      fullName: 'Elena Rostova',
      email: 'erostova@metropolitancu.org',
      company: 'Metropolitan Credit Union',
      jobTitle: 'VP Technology',
      relationshipStrength: 'strong',
      relationshipContext: 'Collaborated on cloud core banking evaluation'
    }
  });
  assert.equal(addRelRes.status, 201);
  assert.equal(addRelRes.data.data.fullName, 'Elena Rostova');

  // Verify list
  const listRes = await simulateRequest(server, '/api/go/relationships', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(listRes.status, 200);
  const found = listRes.data.data.find((p: any) => p.email === 'erostova@metropolitancu.org');
  assert.ok(found);

  // 2. Rewards ledger and points redemption
  const rewardsRes = await simulateRequest(server, '/api/go/rewards', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(rewardsRes.status, 200);
  const initialPoints = rewardsRes.data.data.pointsBalance;

  const redeemRes = await simulateRequest(server, '/api/go/rewards/redeem', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      points: 20,
      rewardType: 'ach_wire'
    }
  });
  assert.equal(redeemRes.status, 200);
  assert.equal(redeemRes.data.data.remainingBalance, initialPoints - 20);

  // 3. Update privacy settings
  const privacyRes = await simulateRequest(server, '/api/go/settings/privacy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { privacyTier: 'anonymous' }
  });
  assert.equal(privacyRes.status, 200);
  assert.equal(privacyRes.data.data.privacyTier, 'anonymous');

  // 4. Invalid login error handling
  const badLogin = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'unknown@example.com' }
  });
  assert.equal(badLogin.status, 400);
  assert.equal(badLogin.data.success, false);
});

test('Go Portal UI: Green dot removed and top-right notifications icon/dropdown present beside user name', async () => {
  const app = createConnectemApp();
  const res = await simulateRequest(app.server, '/index.html');
  assert.equal(res.status, 200);

  // 1. Verify green dot is removed from top right
  assert.ok(!res.text.includes('class="session-dot"'), 'Green dot (session-dot) must be removed');

  // 2. Verify notifications icon-only button exists beside user name in nav-actions
  assert.ok(res.text.includes('id="nav-notifications-btn"'), 'Must have nav notifications button beside user name');
  assert.ok(!res.text.includes('<span>Notifications</span>'), 'Word "Notifications" must be removed in favor of icon only');
  assert.ok(res.text.includes('id="nav-notifications-badge"'), 'Must have notifications badge indicator');
  assert.ok(res.text.includes('id="notifications-dropdown"'), 'Must have notifications dropdown');
  assert.ok(res.text.includes('id="notifications-list"'), 'Must have notifications list container');
  assert.ok(res.text.includes('id="session-partner-name"'), 'Must display partner name in nav bar');

  // 3. Verify search box in contacts uses dedicated wrapper without icon text overlap
  assert.ok(res.text.includes('class="search-box-wrapper"'), 'Must have search-box-wrapper to prevent icon overlap');
  assert.ok(res.text.includes('id="contacts-search-input"'), 'Must have contacts-search-input');

  // 4. Verify Demo Mode elements in partner portal
  assert.ok(res.text.includes('id="quick-demo-login-btn"'), 'Must have quick demo login button');
  assert.ok(res.text.includes('id="quick-demo-signup-btn"'), 'Must have quick demo signup button');
  assert.ok(res.text.includes('id="session-demo-badge"'), 'Must have demo badge element');
});

test('Go Portal API: demo mode works in standalone and with real database loaded', async () => {
  // 1. Standalone / mock store
  const appStandalone = createConnectemApp({ loadRealDatabase: false });
  const demoRes = await simulateRequest(appStandalone.server, '/api/go/demo-login', {
    method: 'POST'
  });
  assert.equal(demoRes.status, 200);
  assert.equal(demoRes.data.success, true);
  assert.equal(demoRes.data.data.partner.fullName, 'Bob Miller');
  assert.ok(demoRes.data.data.token);

  // 2. Real database loaded
  const appReal = createConnectemApp({ loadRealDatabase: true });
  const demoRealRes = await simulateRequest(appReal.server, '/api/go/demo-login', {
    method: 'POST'
  });
  assert.equal(demoRealRes.status, 200);
  assert.equal(demoRealRes.data.success, true);
  assert.equal(demoRealRes.data.data.partner.fullName, 'Bob Miller');
  assert.ok(demoRealRes.data.data.token);

  // 3. Authenticate with demo token to access inbox, contacts, and settings
  const sessionRes = await simulateRequest(appReal.server, '/api/go/session', {
    headers: { Authorization: `Bearer ${demoRealRes.data.data.token}` }
  });
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.data.data.email, 'bob.miller@milleradvisory.com');

  const contactsRes = await simulateRequest(appReal.server, '/api/go/relationships', {
    headers: { Authorization: `Bearer ${demoRealRes.data.data.token}` }
  });
  assert.equal(contactsRes.status, 200);
  assert.ok(Array.isArray(contactsRes.data.data));
  assert.ok(contactsRes.data.data.length >= 2, 'Demo partner must have contacts');
});


