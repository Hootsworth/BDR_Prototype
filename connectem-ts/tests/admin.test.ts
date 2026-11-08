import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectemStore } from '../src/bridge/index.ts';
import { AdminService } from '../src/admin/index.ts';

test('Admin: searchTargetAccounts discovers high-confidence warm paths', () => {
  const store = new ConnectemStore();
  const admin = new AdminService(store);

  const matches = admin.searchTargetAccounts('Apex');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].prospect.company, 'Apex Federal Credit Union');
  assert.equal(matches[0].partner.fullName, 'Bob Miller');
  assert.ok(matches[0].score >= 90);
});

test('Admin: ingestProspects imports and links new prospects', () => {
  const store = new ConnectemStore();
  const admin = new AdminService(store);

  const newProspects = admin.ingestProspects([
    {
      partnerId: 'partner_bmiller',
      fullName: 'David Wong',
      email: 'dwong@summitcu.org',
      company: 'Summit Credit Union',
      jobTitle: 'VP Technology',
      relationshipStrength: 'strong',
      relationshipContext: 'Co-spoke at Finovate 2024.'
    },
    {
      partnerId: 'partner_bmiller',
      fullName: 'Elena Rostova',
      email: 'elena@vanguardtrust.org',
      company: 'Vanguard Community Bank',
      jobTitle: 'Chief Risk Officer',
      relationshipStrength: 'moderate'
    }
  ]);

  assert.equal(newProspects.length, 2);
  assert.equal(newProspects[0].company, 'Summit Credit Union');

  const matches = admin.searchTargetAccounts('Summit');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].prospect.fullName, 'David Wong');
});

test('Admin: requestWarmIntro drafts personalized brief and tracks lifecycle', () => {
  const store = new ConnectemStore();
  const admin = new AdminService(store);

  const req = admin.requestWarmIntro({
    vendorId: 'vendor_security_ai',
    vendorName: 'SecOps AI',
    partnerId: 'partner_bmiller',
    prospectId: 'prospect_sjenkins',
    specificAsk: '15-minute introductory demo'
  });

  assert.ok(req.id.startsWith('req_'));
  assert.equal(req.status, 'pending_partner_review');
  assert.ok(req.forwardableBrief.includes('Apex Federal Credit Union'));
  assert.ok(req.forwardableBrief.includes('Bob Miller'));

  const metrics = admin.getExecutiveDashboard();
  assert.equal(metrics.activeRequests, 1);
});
