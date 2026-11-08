import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectemStore, calculateWarmPathScore } from '../src/bridge/index.ts';

test('Bridge: calculateWarmPathScore returns 0-100 with accurate weighting', () => {
  const store = new ConnectemStore();
  const partner = store.getPartner('partner_bmiller')!;
  const prospect = store.getProspect('prospect_sjenkins')!;

  assert.ok(partner);
  assert.ok(prospect);

  const breakdown = calculateWarmPathScore(partner, prospect, { industry: 'Banking / Credit Unions' });
  assert.ok(breakdown.total >= 0 && breakdown.total <= 100);
  assert.equal(breakdown.relationshipWeight, 40); // 'strong'
  assert.equal(breakdown.partnerCredibility, 25); // pointsBalance > 100
  assert.equal(breakdown.recencyWeight, 15); // optInCount == 0
  assert.ok(breakdown.total >= 90);
});

test('Bridge: store manages partner creation and privacy tiers', () => {
  const store = new ConnectemStore();
  const partner = store.createPartner({
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    company: 'Acme Advisory',
    jobTitle: 'Board Member',
    expertise: ['Cloud Security'],
    geography: ['US'],
    privacyTier: 'private'
  });

  assert.ok(partner.id.startsWith('partner_'));
  assert.equal(partner.pointsBalance, 0);
  assert.ok(partner.authToken);

  // Private partner contacts should not be discoverable in warm path searches
  store.createProspect({
    partnerId: partner.id,
    fullName: 'Target Contact',
    email: 'target@secretcorp.com',
    company: 'Secret Corp',
    jobTitle: 'VP Engineering',
    relationshipStrength: 'strong'
  });

  const paths = store.findWarmPathsForAccount('Secret Corp');
  assert.equal(paths.length, 0, 'Private partner must not be exposed in account matching');
});

test('Bridge: double opt-in introduction lifecycle & point attribution', () => {
  const store = new ConnectemStore();
  const initialPartner = store.getPartner('partner_bmiller')!;
  const initialPoints = initialPartner.pointsBalance;

  // 1. Admin/Vendor requests intro
  const req = store.createIntroRequest({
    vendorId: 'vendor_connectem',
    vendorName: 'ConnectEM AI',
    partnerId: 'partner_bmiller',
    prospectId: 'prospect_sjenkins',
    forwardableBrief: 'We built a secure LLM query gateway tailored for Apex FCU.',
    specificAsk: '20-minute executive briefing'
  });

  assert.equal(req.status, 'pending_partner_review');
  assert.ok(req.warmPathScore > 80);

  // 2. Partner reviews and approves (triggers double opt-in link generation)
  const approved = store.partnerReviewRequest({
    requestId: req.id,
    partnerId: 'partner_bmiller',
    decision: 'approved',
    notes: 'Happy to check interest with Sarah.'
  });

  assert.equal(approved.status, 'partner_approved');
  assert.ok(approved.optInToken, 'Opt-in token must be generated upon approval');

  // 3. Contact receives link and confirms opt-in
  const responded = store.contactRespondOptIn({
    token: approved.optInToken!,
    decision: 'accept',
    notes: 'Available next Thursday afternoon.',
    meetingUrl: 'https://calendly.com/connectem/20min'
  });

  assert.equal(responded.status, 'contact_accepted');
  assert.equal(responded.scheduledMeetingUrl, 'https://calendly.com/connectem/20min');

  // 4. Partner points should increase by 15 upon verified opt-in
  const updatedPartner = store.getPartner('partner_bmiller')!;
  assert.equal(updatedPartner.pointsBalance, initialPoints + 15);

  const attributions = store.listAttributionsByPartner('partner_bmiller');
  assert.equal(attributions.length, 1);
  assert.equal(attributions[0].stage, 'opt_in_accepted');
  assert.equal(attributions[0].pointsAwarded, 15);
});
