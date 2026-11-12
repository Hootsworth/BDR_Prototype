import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectemStore } from '../src/bridge/index.ts';
import { AdminService } from '../src/admin/index.ts';
import { GoPartnerService } from '../src/go/index.ts';

test('CRUD: Admin update and delete partner (influencer)', () => {
  const store = new ConnectemStore();
  const admin = new AdminService(store);

  const partner = admin.createPartner({
    fullName: 'Jane Advisor',
    email: 'jane@advisor.test',
    company: 'Advisor Co',
    jobTitle: 'Partner'
  });

  // Update
  const updated = admin.updatePartner(partner.id, {
    fullName: 'Jane Advisor Updated',
    company: 'Advisor Global'
  });
  assert.equal(updated.fullName, 'Jane Advisor Updated');
  assert.equal(updated.company, 'Advisor Global');

  // Delete
  const deleted = admin.deletePartner(partner.id);
  assert.equal(deleted, true);
  assert.equal(store.getPartner(partner.id), undefined);
});

test('CRUD: Admin update and delete prospect (contact)', () => {
  const store = new ConnectemStore();
  const admin = new AdminService(store);

  const partner = admin.createPartner({
    fullName: 'Mark Partner',
    email: 'mark@partner.test',
    company: 'Partner Co',
    jobTitle: 'MD'
  });

  const prospect = admin.createProspect({
    partnerId: partner.id,
    fullName: 'David Lead',
    email: 'david@lead.test',
    company: 'Lead Corp',
    jobTitle: 'VP Eng'
  });

  // Update
  const updated = admin.updateProspect(prospect.id, {
    fullName: 'David Lead Senior',
    jobTitle: 'SVP Eng'
  });
  assert.equal(updated.fullName, 'David Lead Senior');
  assert.equal(updated.jobTitle, 'SVP Eng');

  // Delete
  const deleted = admin.deleteProspect(prospect.id);
  assert.equal(deleted, true);
  assert.equal(store.getProspect(prospect.id), undefined);
});

test('CRUD: Go partner update and delete relationship', () => {
  const store = new ConnectemStore();
  const go = new GoPartnerService(store);

  const partner = store.createPartner({
    fullName: 'Elena Partner',
    email: 'elena@partner.test',
    company: 'Elena Advisory',
    jobTitle: 'Founder',
    privacyTier: 'ask_partner',
    expertise: ['Cloud'],
    geography: ['US'],
    phone: '',
    bio: ''
  });

  const rel = go.addRelationship(partner.id, {
    fullName: 'Alice Contact',
    email: 'alice@contact.test',
    company: 'Contact Corp',
    jobTitle: 'Director',
    relationshipStrength: 'strong'
  });

  // Update
  const updated = go.updateRelationship(partner.id, rel.id, {
    fullName: 'Alice Contact Updated',
    jobTitle: 'Senior Director'
  });
  assert.equal(updated.fullName, 'Alice Contact Updated');
  assert.equal(updated.jobTitle, 'Senior Director');

  // Delete
  const deleted = go.deleteRelationship(partner.id, rel.id);
  assert.equal(deleted, true);
  assert.equal(store.getProspect(rel.id), undefined);
});
