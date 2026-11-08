import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { Server } from 'node:http';
import { createConnectemApp } from '../src/server.ts';
import { ConnectemStore } from '../src/bridge/store.ts';
import { GoPartnerService } from '../src/go/service.ts';

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
    res.end = (chunk?: any) => {
      if (chunk) resBody += chunk.toString();
      let data = null;
      try {
        data = JSON.parse(resBody);
      } catch (_) {
        data = resBody;
      }
      resolve({ status: statusCode, text: resBody, data, headers: resHeaders });
    };

    server.emit('request', req, res);
  });
}

test('Go Settings: Mandatory AI usage limits strictly enforce daily cap', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'Sophia Martinez',
    email: 'sophia@martinez.io',
    company: 'Martinez Advisory',
    jobTitle: 'Managing Principal'
  });

  const prospect = service.addRelationship(partner.id, {
    fullName: 'Robert Chen',
    email: 'rchen@pacificcu.org',
    company: 'Pacific Credit Union',
    jobTitle: 'VP Technology'
  });

  // Verify initial quota
  let usage = service.getAiUsage(partner.id);
  assert.strictEqual(usage.limitDaily, 20);
  assert.strictEqual(usage.usedToday, 0);
  assert.strictEqual(usage.remaining, 20);

  // Set tight limit of 2 drafts to test enforcement
  service.updateAiPreferences(partner.id, { customLimitDaily: 5 }); // 5 is minimum clamped limit
  store.updatePartner(partner.id, { aiDraftLimitDaily: 2 }); // explicitly set to 2 for testing

  // Draft 1 - succeeds
  const draft1 = service.generateAiEmailDraft(partner.id, {
    prospectId: prospect.id,
    purpose: 'Executive briefing',
    tone: 'executive'
  });
  assert.ok(draft1.subject);

  // Draft 2 - succeeds (at limit)
  const draft2 = service.generateAiEmailDraft(partner.id, {
    prospectId: prospect.id,
    purpose: 'Advisory follow-up',
    tone: 'direct'
  });
  assert.ok(draft2.subject);

  usage = service.getAiUsage(partner.id);
  assert.strictEqual(usage.usedToday, 2);
  assert.strictEqual(usage.remaining, 0);

  // Draft 3 - MUST throw mandatory limit reached error!
  assert.throws(() => {
    service.generateAiEmailDraft(partner.id, {
      prospectId: prospect.id,
      purpose: 'Exceeded quota test',
      tone: 'warm'
    });
  }, /Mandatory daily AI draft limit reached/);
});

test('Go Settings: Profile, Booking URL, and Notification Preferences updates', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'William Vance',
    email: 'wvance@vanceadvisory.com',
    company: 'Vance Group',
    jobTitle: 'Director'
  });

  // 1. Update Profile
  const updatedProfile = service.updateProfile(partner.id, {
    fullName: 'William Vance Jr.',
    company: 'Vance Strategic Group LLC',
    jobTitle: 'Senior Managing Director',
    phone: '+1 (555) 789-0123',
    expertise: ['Fintech', 'Risk Management', 'Core Banking']
  });
  assert.strictEqual(updatedProfile.fullName, 'William Vance Jr.');
  assert.strictEqual(updatedProfile.phone, '+1 (555) 789-0123');
  assert.deepStrictEqual(updatedProfile.expertise, ['Fintech', 'Risk Management', 'Core Banking']);

  // 2. Update Booking URL
  const updatedBooking = service.updateBookingUrl(partner.id, 'https://cal.com/wvance/advisory-sync');
  assert.strictEqual(updatedBooking.bookingUrl, 'https://cal.com/wvance/advisory-sync');

  // 3. Update Notification Preferences
  const updatedPrefs = service.updateNotificationPreferences(partner.id, {
    emailOnNewRequest: true,
    emailOnOptIn: true,
    emailOnComplianceCc: true,
    weeklySummary: true
  });
  assert.strictEqual(updatedPrefs.notificationPreferences?.weeklySummary, true);

  // 4. Update AI Preferences (Clamped within safety limits)
  const aiPrefRes = service.updateAiPreferences(partner.id, {
    defaultAiTone: 'executive',
    customLimitDaily: 30
  });
  assert.strictEqual(aiPrefRes.partner.defaultAiTone, 'executive');
  assert.strictEqual(aiPrefRes.quota.limitDaily, 30);

  // 5. Complete Settings Overview
  const overview = service.getSettingsOverview(partner.id);
  assert.strictEqual(overview.partner.fullName, 'William Vance Jr.');
  assert.strictEqual(overview.aiUsage.limitDaily, 30);
  assert.strictEqual(overview.integrations.gmail.adminCcEnforced, 'nextbdr@gmail.com');
  assert.ok(overview.integrations.ai.backendKeyConfigured);
});

test('Go Settings HTTP API: full settings endpoints lifecycle via HTTP', async () => {
  const app = createConnectemApp();
  const server = app.server;

  // Login as Bob Miller
  const loginRes = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' }
  });
  assert.strictEqual(loginRes.status, 200);
  const token = loginRes.data.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1. GET /api/go/settings
  const settingsRes = await simulateRequest(server, '/api/go/settings', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(settingsRes.status, 200);
  assert.ok(settingsRes.data.data.partner);
  assert.ok(settingsRes.data.data.aiUsage);
  assert.strictEqual(settingsRes.data.data.integrations.gmail.adminCcEnforced, 'nextbdr@gmail.com');

  // 2. POST /api/go/settings/profile
  const profileRes = await simulateRequest(server, '/api/go/settings/profile', {
    method: 'POST',
    headers: authHeaders,
    body: {
      fullName: 'Robert H. Miller',
      company: 'Miller Advisory Global',
      jobTitle: 'Senior Managing Partner',
      phone: '+1 (555) 999-8888',
      expertise: ['Credit Unions', 'Executive Briefings']
    }
  });
  assert.strictEqual(profileRes.status, 200);
  assert.strictEqual(profileRes.data.data.fullName, 'Robert H. Miller');

  // 3. POST /api/go/settings/booking
  const bookingRes = await simulateRequest(server, '/api/go/settings/booking', {
    method: 'POST',
    headers: authHeaders,
    body: { bookingUrl: 'https://calendly.com/rhmiller/executive-intro' }
  });
  assert.strictEqual(bookingRes.status, 200);
  assert.strictEqual(bookingRes.data.data.bookingUrl, 'https://calendly.com/rhmiller/executive-intro');

  // 4. POST /api/go/settings/notifications
  const notifRes = await simulateRequest(server, '/api/go/settings/notifications', {
    method: 'POST',
    headers: authHeaders,
    body: {
      emailOnNewRequest: true,
      emailOnOptIn: true,
      emailOnComplianceCc: true,
      weeklySummary: true
    }
  });
  assert.strictEqual(notifRes.status, 200);
  assert.strictEqual(notifRes.data.data.notificationPreferences.weeklySummary, true);

  // 5. GET & POST AI Usage and Limits
  const aiUsageRes = await simulateRequest(server, '/api/go/settings/ai/usage', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(aiUsageRes.status, 200);
  assert.strictEqual(typeof aiUsageRes.data.data.limitDaily, 'number');

  const aiUpdateRes = await simulateRequest(server, '/api/go/settings/ai', {
    method: 'POST',
    headers: authHeaders,
    body: { defaultAiTone: 'executive', customLimitDaily: 25 }
  });
  assert.strictEqual(aiUpdateRes.status, 200);
  assert.strictEqual(aiUpdateRes.data.data.quota.limitDaily, 25);
});

test('Go Settings UI Contract: HTML and CSS contain AI quota bar, integrations, and updated settings forms', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
  const css = readFileSync(join(process.cwd(), 'public', 'style.css'), 'utf-8');

  // 1. AI Usage & Mandatory Limits elements
  assert.ok(html.includes('id="settings-ai-used"'), 'Must have settings-ai-used indicator');
  assert.ok(html.includes('id="settings-ai-limit"'), 'Must have settings-ai-limit display');
  assert.ok(html.includes('id="settings-ai-remaining"'), 'Must have settings-ai-remaining display');
  assert.ok(html.includes('id="settings-ai-progress"'), 'Must have quota progress bar');
  assert.ok(html.includes('id="ai-settings-form"'), 'Must have AI settings form');
  assert.ok(html.includes('id="settings-custom-ai-limit"'), 'Must have custom AI limit input');

  // 2. Integrations Card & Status Badges
  assert.ok(html.includes('API Integrations &amp; Connectors'), 'Must have API integrations header');
  assert.ok(html.includes('id="integration-linkedin-badge"'), 'Must have LinkedIn integration status badge');
  assert.ok(html.includes('id="integration-gmail-badge"'), 'Must have Gmail integration status badge');
  assert.ok(html.includes('id="integration-twilio-badge"'), 'Must have Twilio integration status badge');

  // 3. Profile Form Elements
  assert.ok(html.includes('id="profile-settings-form"'), 'Must have profile-settings-form');
  assert.ok(html.includes('id="settings-fullname"'), 'Must have settings-fullname input');
  assert.ok(html.includes('id="settings-company"'), 'Must have settings-company input');
  assert.ok(html.includes('id="settings-jobtitle"'), 'Must have settings-jobtitle input');

  // 4. Booking URL & Notifications Form Elements
  assert.ok(html.includes('id="booking-settings-form"'), 'Must have booking-settings-form');
  assert.ok(html.includes('id="settings-booking-url"'), 'Must have settings-booking-url input');
  assert.ok(html.includes('id="notifications-settings-form"'), 'Must have notifications-settings-form');

  // 5. CSS Rules
  assert.ok(css.includes('.quota-progress-container'), 'CSS must define .quota-progress-container');
  assert.ok(css.includes('.quota-progress-bar'), 'CSS must define .quota-progress-bar');
  assert.ok(css.includes('.integrations-grid'), 'CSS must define .integrations-grid');
  assert.ok(css.includes('.integration-card'), 'CSS must define .integration-card');
});
