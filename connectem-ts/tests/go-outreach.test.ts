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

test('Go Partner Service: Gmail permission & status management', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'Elena Rostova',
    email: 'elena@rostovadvisory.com',
    company: 'Rostov Strategic Advisory',
    jobTitle: 'Principal'
  });

  // Initially Gmail permission is not granted
  let status = service.getGmailStatus(partner.id);
  assert.strictEqual(status.connected, false);

  // Grant Gmail permission
  const updated = service.grantGmailPermission(partner.id, 'elena.workspace@gmail.com');
  assert.strictEqual(updated.gmailConnected, true);
  assert.strictEqual(updated.gmailEmail, 'elena.workspace@gmail.com');

  // Verify status reflects connected
  status = service.getGmailStatus(partner.id);
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.email, 'elena.workspace@gmail.com');
});

test('Go Partner Service: In-app email enforces CC to nextbdr@gmail.com and tracks AI usage', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'Elena Rostova',
    email: 'elena@rostovadvisory.com',
    company: 'Rostov Strategic Advisory',
    jobTitle: 'Principal'
  });

  const prospect = service.addRelationship(partner.id, {
    fullName: 'Marcus Sterling',
    email: 'marcus@apexcapital.org',
    company: 'Apex Capital Holdings',
    jobTitle: 'Chief Investment Officer'
  });

  // Attempting to send email before granting Gmail permission should throw
  assert.throws(() => {
    service.sendOutreachEmail(partner.id, {
      prospectId: prospect.id,
      subject: 'Advisory Introduction',
      body: 'Marcus, would love to connect this week.'
    });
  }, /Gmail outreach permission not granted/);

  // Grant Gmail permission
  service.grantGmailPermission(partner.id, 'elena@rostovadvisory.com');

  // Send email outreach
  const emailActivity = service.sendOutreachEmail(partner.id, {
    prospectId: prospect.id,
    subject: 'Strategic Advisory Briefing',
    body: 'Marcus, I have prepared an advisory briefing on enterprise security.',
    aiAssisted: true
  });

  assert.ok(emailActivity.id);
  assert.strictEqual(emailActivity.channel, 'email');
  assert.strictEqual(emailActivity.prospectId, prospect.id);
  // CRITICAL REQUIREMENT: Mandatory CC to nextbdr@gmail.com
  assert.strictEqual(emailActivity.adminCcEnforced, 'nextbdr@gmail.com');
  assert.strictEqual(emailActivity.aiAssisted, true);
  assert.strictEqual(emailActivity.subject, 'Strategic Advisory Briefing');

  // Check activity is recorded in partner's outreach log
  const activities = service.listOutreachActivities(partner.id);
  assert.strictEqual(activities.length, 1);
  assert.strictEqual(activities[0].adminCcEnforced, 'nextbdr@gmail.com');
});

test('Go Partner Service: Distinct AI email assistant generates contextual drafts across tones', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'David Lee',
    email: 'david@leeconsulting.io',
    company: 'Lee Strategic Advisors',
    jobTitle: 'Managing Partner'
  });

  const prospect = service.addRelationship(partner.id, {
    fullName: 'Sarah Connor',
    email: 'sconnor@cyberdyne.com',
    company: 'Cyberdyne Systems',
    jobTitle: 'VP Technology'
  });

  // Test Warm & Professional tone
  const warmDraft = service.generateAiEmailDraft(partner.id, {
    prospectId: prospect.id,
    purpose: 'Executive briefing regarding AI security risks',
    tone: 'warm'
  });

  assert.ok(warmDraft.subject.includes('Cyberdyne Systems'));
  assert.ok(warmDraft.body.includes('Sarah'));
  assert.ok(warmDraft.body.includes('David Lee'));
  assert.strictEqual(warmDraft.aiAssisted, true);
  assert.strictEqual(warmDraft.tone, 'warm');

  // Test Direct & Crisp tone
  const directDraft = service.generateAiEmailDraft(partner.id, {
    prospectId: prospect.id,
    purpose: 'Q4 Advisory Sync',
    tone: 'direct'
  });
  assert.strictEqual(directDraft.tone, 'direct');
  assert.ok(directDraft.body.includes('direct update'));

  // Test Executive tone
  const execDraft = service.generateAiEmailDraft(partner.id, {
    prospectId: prospect.id,
    purpose: 'Board advisory presentation',
    tone: 'executive'
  });
  assert.strictEqual(execDraft.tone, 'executive');
  assert.ok(execDraft.body.includes('Executive brief'));
});

test('Go Partner Service: Twilio connector status detection & Call logging with outcomes', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;

  try {
    // 1. Without Twilio env vars, Twilio is disabled
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    const disabledStatus = service.getTwilioStatus();
    assert.strictEqual(disabledStatus.enabled, false);

    // 2. With Twilio env vars, Twilio is enabled
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_ACCOUNT_12345';
    process.env.TWILIO_AUTH_TOKEN = 'AUTH_TOKEN_TEST_67890';

    const enabledStatus = service.getTwilioStatus();
    assert.strictEqual(enabledStatus.enabled, true);

    // 3. Log Call with outcome
    const partner = service.onboardPartner({
      fullName: 'Alex Vance',
      email: 'alex@blackmesa.org',
      company: 'Black Mesa Tech',
      jobTitle: 'Director'
    });
    const prospect = service.addRelationship(partner.id, {
      fullName: 'Gordon Freeman',
      email: 'gfreeman@blackmesa.org',
      company: 'Black Mesa Tech',
      jobTitle: 'Research Fellow'
    });

    const callActivity = service.logCallActivity(partner.id, {
      prospectId: prospect.id,
      outcome: 'left_voicemail',
      notes: 'Left message regarding scheduled briefing on Thursday',
      twilioUsed: false
    });

    assert.strictEqual(callActivity.channel, 'call');
    assert.strictEqual(callActivity.callOutcome, 'left_voicemail');
    assert.strictEqual(callActivity.twilioUsed, false);
    assert.ok(callActivity.content?.includes('Thursday'));
  } finally {
    if (originalSid) process.env.TWILIO_ACCOUNT_SID = originalSid;
    else delete process.env.TWILIO_ACCOUNT_SID;
    if (originalToken) process.env.TWILIO_AUTH_TOKEN = originalToken;
    else delete process.env.TWILIO_AUTH_TOKEN;
  }
});

test('Go Partner Service: LinkedIn outreach logging', () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  const partner = service.onboardPartner({
    fullName: 'Rachel Green',
    email: 'rachel@ralphlauren.com',
    company: 'Ralph Lauren',
    jobTitle: 'Executive VP'
  });

  const prospect = service.addRelationship(partner.id, {
    fullName: 'Monica Geller',
    email: 'monica@alessandros.com',
    company: 'Alessandros',
    jobTitle: 'Head Chef'
  });

  const linkedInActivity = service.logLinkedInOutreach(partner.id, {
    prospectId: prospect.id,
    notes: 'Sent personalized InMail regarding supply chain advisory.'
  });

  assert.strictEqual(linkedInActivity.channel, 'linkedin');
  assert.strictEqual(linkedInActivity.prospectId, prospect.id);
  assert.ok(linkedInActivity.content?.includes('supply chain'));
});

test('Go Outreach HTTP API: full outreach lifecycle via HTTP endpoints', async () => {
  const app = createConnectemApp();
  const server = app.server;

  // 1. Authenticate / Login as Bob Miller
  const loginRes = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' }
  });
  assert.strictEqual(loginRes.status, 200);
  const token = loginRes.data.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Check initial Gmail status and Grant Permission
  const gmailStatusBefore = await simulateRequest(server, '/api/go/outreach/gmail/status', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(gmailStatusBefore.status, 200);

  const connectGmailRes = await simulateRequest(server, '/api/go/outreach/gmail/connect', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' },
    headers: authHeaders
  });
  assert.strictEqual(connectGmailRes.status, 200);
  assert.strictEqual(connectGmailRes.data.success, true);
  assert.strictEqual(connectGmailRes.data.data.connected, true);

  // 3. Get Relationships to find a prospect
  const relsRes = await simulateRequest(server, '/api/go/relationships', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(relsRes.status, 200);
  const prospect = relsRes.data.data[0];
  assert.ok(prospect);

  // 4. Generate AI Email Draft
  const aiDraftRes = await simulateRequest(server, '/api/go/outreach/email/ai-draft', {
    method: 'POST',
    body: {
      prospectId: prospect.id,
      purpose: 'Advisory introduction on cybersecurity leadership',
      tone: 'executive'
    },
    headers: authHeaders
  });
  assert.strictEqual(aiDraftRes.status, 200);
  assert.strictEqual(aiDraftRes.data.success, true);
  assert.strictEqual(aiDraftRes.data.data.aiAssisted, true);
  assert.ok(aiDraftRes.data.data.subject);
  assert.ok(aiDraftRes.data.data.body);

  // 5. Send In-App Email (Must have CC nextbdr@gmail.com enforced by server)
  const sendEmailRes = await simulateRequest(server, '/api/go/outreach/email', {
    method: 'POST',
    body: {
      prospectId: prospect.id,
      subject: aiDraftRes.data.data.subject,
      body: aiDraftRes.data.data.body,
      aiAssisted: true
    },
    headers: authHeaders
  });
  assert.strictEqual(sendEmailRes.status, 200);
  assert.strictEqual(sendEmailRes.data.success, true);
  // Verify mandatory admin CC enforcement
  assert.strictEqual(sendEmailRes.data.data.adminCcEnforced, 'nextbdr@gmail.com');
  assert.strictEqual(sendEmailRes.data.data.channel, 'email');

  // 6. Check Twilio Status
  const twilioStatusRes = await simulateRequest(server, '/api/go/outreach/twilio/status', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(twilioStatusRes.status, 200);
  assert.strictEqual(twilioStatusRes.data.success, true);
  assert.strictEqual(typeof twilioStatusRes.data.data.enabled, 'boolean');

  // 7. Log Call with outcome
  const callLogRes = await simulateRequest(server, '/api/go/outreach/call/log', {
    method: 'POST',
    body: {
      prospectId: prospect.id,
      outcome: 'scheduled',
      notes: 'Scheduled discovery briefing for Tuesday 2pm.',
      twilioUsed: false
    },
    headers: authHeaders
  });
  assert.strictEqual(callLogRes.status, 200);
  assert.strictEqual(callLogRes.data.success, true);
  assert.strictEqual(callLogRes.data.data.callOutcome, 'scheduled');

  // 8. Log LinkedIn Outreach
  const linkedinLogRes = await simulateRequest(server, '/api/go/outreach/linkedin/log', {
    method: 'POST',
    body: {
      prospectId: prospect.id,
      notes: 'Sent connection request on LinkedIn with personalized intro.'
    },
    headers: authHeaders
  });
  assert.strictEqual(linkedinLogRes.status, 200);
  assert.strictEqual(linkedinLogRes.data.success, true);
  assert.strictEqual(linkedinLogRes.data.data.channel, 'linkedin');

  // 9. List All Outreach Activities
  const activitiesRes = await simulateRequest(server, '/api/go/outreach/activities', {
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(activitiesRes.status, 200);
  assert.strictEqual(activitiesRes.data.success, true);
  assert.ok(activitiesRes.data.data.length >= 3);
});

test('Go Outreach UI Contract: HTML and CSS verify in-app composer, CC nextbdr@gmail.com badge, distinct AI assistant, and call options', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf-8');
  const css = readFileSync(join(process.cwd(), 'public', 'style.css'), 'utf-8');

  // 1. Mandatory Admin CC check in HTML
  assert.ok(html.includes('nextbdr@gmail.com'), 'HTML must feature admin CC email nextbdr@gmail.com');
  assert.ok(html.includes('admin-cc-badge'), 'HTML must have admin-cc-badge class');

  // 2. Email Composer Modal check
  assert.ok(html.includes('id="email-composer-modal"'), 'HTML must include #email-composer-modal');
  assert.ok(html.includes('id="composer-subject"'), 'HTML must include #composer-subject');
  assert.ok(html.includes('id="composer-body"'), 'HTML must include #composer-body');

  // 3. Distinct AI Assistant styling and controls
  assert.ok(html.includes('ai-assistant-card'), 'HTML must include distinct .ai-assistant-card container');
  assert.ok(html.includes('ai-assistant-badge'), 'HTML must include .ai-assistant-badge');
  assert.ok(html.includes('id="ai-generate-draft-btn"'), 'HTML must include AI draft generator button');
  assert.ok(html.includes('id="ai-draft-purpose"'), 'HTML must include AI draft purpose input');
  assert.ok(html.includes('id="ai-draft-tone"'), 'HTML must include AI draft tone selector');

  // 4. Call Dialog Modal and outcome options
  assert.ok(html.includes('id="call-dialog-modal"'), 'HTML must include #call-dialog-modal');
  assert.ok(html.includes('id="twilio-disabled-notice"'), 'HTML must handle disabled Twilio gracefully');
  assert.ok(html.includes('value="connected"'), 'HTML must include connected call outcome');
  assert.ok(html.includes('value="left_voicemail"'), 'HTML must include left_voicemail call outcome');

  // 5. LinkedIn Dialog Modal
  assert.ok(html.includes('id="linkedin-dialog-modal"'), 'HTML must include #linkedin-dialog-modal');

  // 6. Gmail permission during login/onboarding
  assert.ok(html.includes('id="login-gmail-perm"'), 'HTML must provide Gmail permission option on login');
  assert.ok(html.includes('id="onboard-gmail-perm"'), 'HTML must provide Gmail permission on onboarding');

  // 7. CSS Distinct Styling for AI Assistant & Badges
  assert.ok(css.includes('.ai-assistant-card'), 'CSS must style .ai-assistant-card distinctly');
  assert.ok(css.includes('.ai-assistant-badge'), 'CSS must style .ai-assistant-badge');
  assert.ok(css.includes('.admin-cc-badge'), 'CSS must style .admin-cc-badge');
  assert.ok(css.includes('.call-outcome-options'), 'CSS must style call outcome options');
});
