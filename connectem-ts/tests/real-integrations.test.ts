import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectemStore } from '../src/bridge/index.ts';
import { loadRealDatabase } from '../src/bridge/database.ts';
import { GoPartnerService } from '../src/go/index.ts';
import { AdminService } from '../src/admin/index.ts';

test('Live Database & Integrations: loads all 30 live partners and 900+ real prospects from gtm-console-database.json', () => {
  const realData = loadRealDatabase();

  assert.ok(realData.partners.size >= 30, `Expected at least 30 live partners, found ${realData.partners.size}`);
  assert.ok(realData.prospects.size >= 900, `Expected at least 900 real prospects, found ${realData.prospects.size}`);

  // Verify specific real partner profiles loaded from real database
  const kimBeluzo = Array.from(realData.partners.values()).find(p => p.email === 'kim.beluzo@beluzoadvisory.com');
  assert.ok(kimBeluzo, 'Kim Beluzo must be present in live database');
  assert.strictEqual(kimBeluzo.company, 'Beluzo FinTech Advisory');
  assert.ok(kimBeluzo.pointsBalance > 0, 'Must have active referral credits');

  const bobMiller = Array.from(realData.partners.values()).find(p => p.email === 'bob.miller@milleradvisory.com');
  assert.ok(bobMiller, 'Bob Miller must be present in live database');
  assert.ok(bobMiller.company.includes('Miller Advisory'), 'Must have real company');
});

test('Live Partner Authentication & Session: authenticates real partner and accesses their real network', () => {
  const store = new ConnectemStore({ loadRealDatabase: true });
  const service = new GoPartnerService(store);

  // Authenticate live partner Kim Beluzo
  const { partner, token } = service.login('kim.beluzo@beluzoadvisory.com');
  assert.strictEqual(partner.fullName, 'Kim Beluzo');
  assert.ok(token.startsWith('token_'), 'Must return valid session token');

  // Verify bearer authentication resolution
  const sessionPartner = service.authenticate(`Bearer ${token}`);
  assert.ok(sessionPartner);
  assert.strictEqual(sessionPartner.id, partner.id);

  // Verify partner can list their actual 30 referred prospects
  const prospects = service.listRelationships(partner.id);
  assert.strictEqual(prospects.length, 30, 'Kim Beluzo must have 30 real credit union prospects loaded');
  assert.ok(prospects[0].fullName, 'Prospects must have full name');
  assert.ok(prospects[0].company, 'Prospects must have real credit union company');
  assert.ok(prospects[0].email, 'Prospects must have real email');
});

test('Live Outreach & Admin CC: enforces nextbdr@gmail.com and verifies live credentials', () => {
  const store = new ConnectemStore({ loadRealDatabase: true });
  const service = new GoPartnerService(store);

  const partner = store.getPartnerByEmail('bob.miller@milleradvisory.com');
  assert.ok(partner);
  service.grantGmailPermission(partner.id, partner.email);

  const prospect = store.listProspectsByPartner(partner.id)[0];
  assert.ok(prospect);

  // Dispatch outreach email
  const activity = service.sendOutreachEmail(partner.id, {
    prospectId: prospect.id,
    subject: 'Executive Briefing on AI Security Guardrails',
    body: 'Hi, reaching out regarding NCUA compliant AI workflows.'
  });

  assert.strictEqual(activity.adminCcEnforced, 'nextbdr@gmail.com', 'Admin compliance CC must strictly be nextbdr@gmail.com');
  assert.strictEqual(activity.channel, 'email');
  assert.strictEqual(activity.recipientEmail, prospect.email);

  // Verify activity is recorded in partner outreach log
  const activities = service.listOutreachActivities(partner.id);
  assert.strictEqual(activities.length, 1);
  assert.strictEqual(activities[0].subject, 'Executive Briefing on AI Security Guardrails');
});

test('Live Admin & Partner Sync: requests created by Admin appear in Go partner portal', () => {
  const store = new ConnectemStore({ loadRealDatabase: true });
  const admin = new AdminService(store);
  const go = new GoPartnerService(store);

  const partner = store.getPartnerByEmail('bob.miller@milleradvisory.com')!;
  const prospect = store.listProspectsByPartner(partner.id)[0];

  // Admin initiates warm intro request
  const introReq = admin.requestWarmIntro({
    vendorId: 'vendor_creek',
    vendorName: 'Creek LLM Guardrails',
    partnerId: partner.id,
    prospectId: prospect.id,
    specificAsk: 'Executive peer review of NCUA compliance architecture'
  });

  assert.strictEqual(introReq.status, 'pending_partner_review');

  // Partner checks incoming requests in Go portal
  const partnerRequests = store.listIntroRequestsForPartner(partner.id);
  const found = partnerRequests.find(r => r.id === introReq.id);
  assert.ok(found, 'Intro request created by Admin must immediately be visible in Partner Portal');
  assert.strictEqual(found.vendorName, 'Creek LLM Guardrails');

  // Partner reviews and approves
  const approved = go.reviewIntroRequest({
    partnerId: partner.id,
    requestId: introReq.id,
    decision: 'approved'
  });
  assert.strictEqual(approved.request.status, 'partner_approved');
  assert.ok(approved.request.optInToken, 'Approval must generate unique opt-in token');
});
