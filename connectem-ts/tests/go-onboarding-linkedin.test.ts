import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import type { Server } from 'node:http';
import { createConnectemApp } from '../src/server.ts';
import { LinkedInClient } from '../src/go/linkedin.client.ts';
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

test('LinkedInClient: parses profile and fetches structured executive connections', async () => {
  const client = new LinkedInClient();
  assert.equal(typeof client.hasApiKey(), 'boolean');

  const profile = await client.connectProfile('https://linkedin.com/in/robert-miller-advisory');
  assert.ok(profile.name.length > 0);
  assert.ok(profile.headline.length > 0);
  assert.equal(profile.linkedinUrl, 'https://linkedin.com/in/robert-miller-advisory');

  const connections = await client.fetchConnections('Miller Advisory');
  assert.ok(connections.length >= 3);
  const first = connections[0];
  assert.ok(first.id);
  assert.ok(first.fullName);
  assert.ok(first.email);
  assert.ok(first.company);
  assert.ok(first.jobTitle);
  assert.ok(['strong', 'moderate', 'weak'].includes(first.relationshipStrength));
});

test('GoPartnerService: LinkedIn onboarding flow connects and imports prospects with points bonus', async () => {
  const store = new ConnectemStore();
  const service = new GoPartnerService(store);

  // Use seeded partner Bob Miller
  const partner = store.getPartner('partner_bmiller')!;
  const initialPoints = partner.pointsBalance;
  const initialProspectCount = store.listProspectsByPartner(partner.id).length;

  // 1. Connect LinkedIn
  const profile = await service.connectLinkedIn(partner.id, 'https://linkedin.com/in/bob-miller');
  assert.ok(profile.name);

  // 2. Fetch connections
  const connections = await service.getLinkedInConnections(partner.id);
  assert.ok(connections.length >= 3);

  // 3. 1-Click Import first 2 connections
  const toImportIds = [connections[0].id, connections[1].id];
  const importResult = await service.importLinkedInConnections(partner.id, toImportIds);

  assert.equal(importResult.importedCount, 2);
  assert.equal(importResult.prospects.length, 2);

  // Verify prospects exist in store linked to partner
  const updatedProspects = store.listProspectsByPartner(partner.id);
  assert.equal(updatedProspects.length, initialProspectCount + 2);

  // Verify partner earned onboarding bonus points
  const updatedPartner = store.getPartner(partner.id)!;
  assert.ok(updatedPartner.pointsBalance > initialPoints);

  // Re-importing same IDs should not duplicate
  const duplicateImport = await service.importLinkedInConnections(partner.id, toImportIds);
  assert.equal(duplicateImport.importedCount, 0);
});

test('Go Onboarding API: full LinkedIn multi-screen flow via HTTP', async () => {
  const { server } = createConnectemApp();

  // 1. Log in as Bob Miller
  const loginRes = await simulateRequest(server, '/api/go/login', {
    method: 'POST',
    body: { email: 'bob.miller@milleradvisory.com' }
  });
  const token = loginRes.data.data.token;

  // 2. Screen 1: Connect LinkedIn profile
  const connectRes = await simulateRequest(server, '/api/go/onboarding/linkedin/connect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { linkedinUrl: 'https://linkedin.com/in/bob-miller-advisory' }
  });
  assert.equal(connectRes.status, 200);
  assert.equal(connectRes.data.success, true);
  assert.equal(connectRes.data.data.nextStep, 'connections');
  assert.ok(connectRes.data.data.profile.name);

  // 3. Screen 2: Fetch discovered connections
  const getConnRes = await simulateRequest(server, '/api/go/onboarding/linkedin/connections', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(getConnRes.status, 200);
  assert.ok(getConnRes.data.data.connections.length >= 3);
  const connIds = getConnRes.data.data.connections.slice(0, 3).map((c: any) => c.id);

  // 4. Screen 2: 1-Click add as prospects
  const importRes = await simulateRequest(server, '/api/go/onboarding/linkedin/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { connectionIds: connIds }
  });
  assert.equal(importRes.status, 200);
  assert.equal(importRes.data.data.importedCount, 3);

  // 5. Verify the new prospects appear in partner relationships list
  const relsRes = await simulateRequest(server, '/api/go/relationships', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(relsRes.status, 200);
  assert.ok(relsRes.data.data.length >= 5); // 2 seeded + 3 imported
});

test('Go Portal UI: HTML contains separate onboarding screens and 1-click import controls', async () => {
  const { server } = createConnectemApp();
  const res = await simulateRequest(server, '/go');

  assert.equal(res.status, 200);

  // Verify separate screens exist
  assert.ok(res.text.includes('id="onboarding-sequence-section"'));
  assert.ok(res.text.includes('id="onboarding-screen-linkedin"'));
  assert.ok(res.text.includes('id="onboarding-screen-connections"'));
  assert.ok(res.text.includes('id="onboarding-screen-complete"'));

  // Stepper indicators
  assert.ok(res.text.includes('id="step-nav-1"'));
  assert.ok(res.text.includes('id="step-nav-2"'));
  assert.ok(res.text.includes('id="step-nav-3"'));

  // Screen 1 controls
  assert.ok(res.text.includes('id="linkedin-connect-form"'));
  assert.ok(res.text.includes('id="linkedin-profile-url"'));
  assert.ok(res.text.includes('id="linkedin-connect-btn"'));

  // Screen 2 controls (Add contacts)
  assert.ok(res.text.includes('id="one-click-import-btn"'));
  assert.ok(res.text.includes('id="connections-select-all"'));
  assert.ok(res.text.includes('id="connections-items-list"'));
  assert.ok(res.text.includes('Add Contacts'));

  // Screen 3 and Sync banner controls
  assert.ok(res.text.includes('id="enter-workspace-btn"'));
  assert.ok(res.text.includes('id="launch-linkedin-sync-btn"'));
});
