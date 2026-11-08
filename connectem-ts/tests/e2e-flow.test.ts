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
): Promise<{ status: number; data: any; headers: Record<string, string> }> {
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
    req.headers = {
      host: 'localhost:8002',
      ...(bodyStr ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(bodyStr)) } : {}),
      ...(options.headers || {})
    };

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
        parsed = resBody ? JSON.parse(resBody) : null;
      } catch {
        parsed = resBody;
      }
      resolve({ status: statusCode, data: parsed, headers: resHeaders });
    });

    res.on('error', reject);
    req.on('error', reject);

    server.emit('request', req, res);
  });
}

test('E2E: Full workflow across Admin, Go, and Bridge', async () => {
  const { server } = createConnectemApp();

  // 1. Check Health Endpoint
  const healthRes = await simulateRequest(server, '/api/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data.data.service, 'ConnectEM-TS');
  assert.deepEqual(healthRes.data.data.modules, ['admin', 'go', 'bridge']);

  // 2. Admin searches target accounts
  const searchRes = await simulateRequest(server, '/api/admin/search-accounts?q=Apex');
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.data.length, 1);
  const target = searchRes.data.data[0];
  assert.equal(target.prospect.fullName, 'Sarah Jenkins');
  assert.equal(target.partner.fullName, 'Bob Miller');

  // 3. Admin launches warm intro request
  const reqRes = await simulateRequest(server, '/api/admin/intro-requests', {
    method: 'POST',
    body: {
      vendorId: 'vendor_e2e_ai',
      vendorName: 'E2E Vendor Corp',
      partnerId: target.partner.id,
      prospectId: target.prospect.id,
      specificAsk: 'Executive Architecture Review'
    }
  });
  assert.equal(reqRes.status, 201);
  const introReqId = reqRes.data.data.id;
  assert.equal(reqRes.data.data.status, 'pending_partner_review');

  // 4. Partner ("Go") checks inbox using their auth token
  const partnerAuth = { 'authorization': 'Bearer token_partner_bmiller_secret' };
  const inboxRes = await simulateRequest(server, '/api/go/inbox', {
    headers: partnerAuth
  });
  assert.equal(inboxRes.status, 200);
  const pending = inboxRes.data.data.find((r: any) => r.id === introReqId);
  assert.ok(pending);

  // 5. Partner reviews and approves
  const reviewRes = await simulateRequest(server, '/api/go/inbox/review', {
    method: 'POST',
    headers: partnerAuth,
    body: {
      requestId: introReqId,
      decision: 'approved',
      notes: 'Happy to check with Sarah.'
    }
  });
  assert.equal(reviewRes.status, 200);
  assert.ok(reviewRes.data.data.optInUrl);
  const optInToken = reviewRes.data.data.request.optInToken;
  assert.ok(optInToken);

  // 6. Contact opens opt-in link (Bridge endpoint)
  const contactViewRes = await simulateRequest(server, `/api/connectem/opt-in?token=${optInToken}`);
  assert.equal(contactViewRes.status, 200);
  assert.equal(contactViewRes.data.data.partnerName, 'Bob Miller');
  assert.equal(contactViewRes.data.data.status, 'partner_approved');

  // 7. Contact accepts the double opt-in introduction
  const respondRes = await simulateRequest(server, '/api/connectem/opt-in/respond', {
    method: 'POST',
    body: {
      token: optInToken,
      decision: 'accept',
      notes: 'Looking forward to meeting.',
      meetingUrl: 'https://calendly.com/e2e-vendor/demo'
    }
  });
  assert.equal(respondRes.status, 200);
  assert.equal(respondRes.data.data.status, 'contact_accepted');
  assert.equal(respondRes.data.data.meetingUrl, 'https://calendly.com/e2e-vendor/demo');

  // 8. Verify Partner received points for verified opt-in
  const rewardsRes = await simulateRequest(server, '/api/go/rewards', {
    headers: partnerAuth
  });
  assert.equal(rewardsRes.status, 200);
  // Bob Miller started at 120 + 15 = 135
  assert.equal(rewardsRes.data.data.pointsBalance, 135);

  // 9. Verify Admin dashboard shows updated accepted introduction
  const metricsRes = await simulateRequest(server, '/api/admin/metrics');
  assert.equal(metricsRes.status, 200);
  assert.equal(metricsRes.data.data.acceptedIntros, 1);
});
