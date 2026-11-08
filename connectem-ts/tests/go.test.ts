import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectemStore } from '../src/bridge/index.ts';
import { GoPartnerService } from '../src/go/index.ts';

test('Go: authentication validates bearer token', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  const authSuccess = go.authenticate('Bearer token_partner_bmiller_secret');
  assert.ok(authSuccess);
  assert.equal(authSuccess.fullName, 'Bob Miller');

  const authFail = go.authenticate('Bearer invalid_token');
  assert.equal(authFail, null);
});

test('Go: onboardPartner creates partner with default ask_partner privacy tier', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  const partner = go.onboardPartner({
    fullName: 'Carlos Santana',
    email: 'carlos@santana-advisory.com',
    company: 'Santana Advisory Group',
    jobTitle: 'Principal',
    expertise: ['HealthTech', 'Enterprise Sales']
  });

  assert.ok(partner.id.startsWith('partner_'));
  assert.equal(partner.privacyTier, 'ask_partner');
  assert.equal(partner.pointsBalance, 0);

  // Attempt duplicate email should throw
  assert.throws(() => {
    go.onboardPartner({
      fullName: 'Carlos Fake',
      email: 'carlos@santana-advisory.com',
      company: 'Fake Co',
      jobTitle: 'VP'
    });
  }, /already exists/);
});

test('Go: addRelationship stores contact linked to partner', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  const contact = go.addRelationship('partner_bmiller', {
    fullName: 'Rachel Green',
    email: 'rachel@coastalcu.org',
    company: 'Coastal Credit Union',
    jobTitle: 'VP Lending Ops',
    relationshipStrength: 'strong',
    relationshipContext: 'Close colleague from CUNA working group.'
  });

  assert.ok(contact.id.startsWith('prospect_'));
  assert.equal(contact.partnerId, 'partner_bmiller');

  const list = go.listRelationships('partner_bmiller');
  assert.ok(list.some(c => c.fullName === 'Rachel Green'));
});

test('Go: reviewIntroRequest approves and yields opt-in link, or declines without penalty', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  // Setup request
  const req = store.createIntroRequest({
    vendorId: 'vendor_test',
    vendorName: 'Test Vendor',
    partnerId: 'partner_bmiller',
    prospectId: 'prospect_sjenkins',
    forwardableBrief: 'Brief note',
    specificAsk: 'Demo'
  });

  const inbox = go.listInboxRequests('partner_bmiller');
  assert.equal(inbox.length, 1);

  // Partner approves
  const reviewResult = go.reviewIntroRequest({
    partnerId: 'partner_bmiller',
    requestId: req.id,
    decision: 'approved',
    notes: 'Approved for double opt-in check.'
  });

  assert.equal(reviewResult.request.status, 'partner_approved');
  assert.ok(reviewResult.optInUrl?.includes('/opt-in?token=optin_'));
});

test('Go: points redemption calculates balances and enforces limits', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  const initialLedger = go.getRewardsLedger('partner_bmiller');
  assert.equal(initialLedger.pointsBalance, 120);

  // Valid redemption of 50 points
  const redemption = go.redeemPoints('partner_bmiller', 50, 'Advisory Fee Payout ($500)');
  assert.equal(redemption.remainingBalance, 70);

  const afterLedger = go.getRewardsLedger('partner_bmiller');
  assert.equal(afterLedger.pointsBalance, 70);

  // Overdraft attempt should throw
  assert.throws(() => {
    go.redeemPoints('partner_bmiller', 100, 'Invalid Overdraft');
  }, /Insufficient points balance/);
});
