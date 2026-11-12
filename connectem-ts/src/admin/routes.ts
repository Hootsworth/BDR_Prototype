import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminService } from './service.ts';
import type { ApiResponse } from '../bridge/types.ts';

function parseGoogleCredential(credential?: string): { email?: string; name?: string; picture?: string } | null {
  if (!credential) return null;
  try {
    const parts = credential.split('.');
    if (parts.length >= 2) {
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      const data = JSON.parse(payload);
      return {
        email: data.email,
        name: data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim(),
        picture: data.picture
      };
    }
  } catch {
    // fallback
  }
  return null;
}

export async function handleAdminRoute(
  req: IncomingMessage,
  res: ServerResponse,
  service: AdminService,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  if (!pathname.startsWith('/api/admin')) return false;

  const sendJson = (status: number, data: ApiResponse) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };

  const readBody = async <T>(): Promise<T> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  };

  try {
    // POST /api/admin/login
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await readBody<{ email: string; password?: string }>();
      const result = service.login(body.email, body.password);
      sendJson(200, { success: true, data: result });
      return true;
    }

    // POST /api/admin/google-login
    if (pathname === '/api/admin/google-login' && req.method === 'POST') {
      const body = await readBody<{ credential?: string; email?: string; name?: string }>();
      const parsed = parseGoogleCredential(body.credential);
      const email = parsed?.email || body.email || 'nextbdr@gmail.com';
      const name = parsed?.name || body.name || (email === 'nextbdr@gmail.com' ? 'NextBDR Compliance Admin' : 'Admin Operator');
      const result = service.loginWithGoogle(email, name);
      sendJson(200, { success: true, data: result });
      return true;
    }

    // GET /api/admin/session
    if (pathname === '/api/admin/session' && req.method === 'GET') {
      const authHeader = (req.headers['authorization'] || '') as string;
      const session = service.verifySession(authHeader);
      if (!session) {
        sendJson(401, { success: false, error: 'Unauthorized administrator session' });
        return true;
      }
      sendJson(200, { success: true, data: session });
      return true;
    }

    // POST /api/admin/logout
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const authHeader = (req.headers['authorization'] || '') as string;
      service.logout(authHeader);
      sendJson(200, { success: true, data: { loggedOut: true } });
      return true;
    }

    // GET /api/admin/metrics
    if (pathname === '/api/admin/metrics' && req.method === 'GET') {
      const metrics = service.getExecutiveDashboard();
      sendJson(200, { success: true, data: metrics });
      return true;
    }

    // GET /api/admin/provider-keys or GET /api/admin/settings
    if ((pathname === '/api/admin/provider-keys' || pathname === '/api/admin/settings') && req.method === 'GET') {
      const settings = service.getSettings();
      if (pathname === '/api/admin/settings') {
        sendJson(200, { success: true, data: settings });
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(JSON.stringify(settings));
      }
      return true;
    }

    // POST /api/admin/provider-keys or POST /api/admin/settings
    if ((pathname === '/api/admin/provider-keys' || pathname === '/api/admin/settings') && req.method === 'POST') {
      const body = await readBody<any>();
      const updated = service.updateSettings(body);
      if (pathname === '/api/admin/settings') {
        sendJson(200, { success: true, data: updated });
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(JSON.stringify(updated));
      }
      return true;
    }

    // GET /api/admin/search-accounts?q=Apex
    if (pathname === '/api/admin/search-accounts' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const results = service.searchTargetAccounts(q);
      sendJson(200, { success: true, data: results, meta: { query: q, count: results.length } });
      return true;
    }

    // GET /api/admin/intro-requests
    if (pathname === '/api/admin/intro-requests' && req.method === 'GET') {
      const requests = service.listAllRequests();
      sendJson(200, { success: true, data: requests, meta: { total: requests.length } });
      return true;
    }

    // POST /api/admin/intro-requests
    if (pathname === '/api/admin/intro-requests' && req.method === 'POST') {
      const body = await readBody<{
        vendorId: string;
        vendorName: string;
        partnerId: string;
        prospectId: string;
        customBrief?: string;
        specificAsk?: string;
      }>();
      const request = service.requestWarmIntro(body);
      sendJson(201, { success: true, data: request });
      return true;
    }

    // GET /api/admin/partners
    if (pathname === '/api/admin/partners' && req.method === 'GET') {
      const partners = service.listPartners();
      sendJson(200, { success: true, data: partners, meta: { total: partners.length } });
      return true;
    }

    // POST /api/admin/partners
    if (pathname === '/api/admin/partners' && req.method === 'POST') {
      const body = await readBody<{
        fullName: string;
        email: string;
        company: string;
        jobTitle: string;
        privacyTier?: any;
        phone?: string;
      }>();
      const partner = service.createPartner(body);
      sendJson(201, { success: true, data: partner });
      return true;
    }

    // PUT /api/admin/partners/:id or /api/admin/influencers/:id
    if ((pathname.startsWith('/api/admin/partners/') || pathname.startsWith('/api/admin/influencers/')) && (req.method === 'PUT' || req.method === 'PATCH')) {
      const id = pathname.split('/')[4];
      const body = await readBody<any>();
      try {
        const updated = service.updatePartner(id, body);
        sendJson(200, { success: true, data: updated });
      } catch (err: any) {
        sendJson(404, { success: false, error: err.message || 'Influencer not found' });
      }
      return true;
    }

    // DELETE /api/admin/partners/:id or /api/admin/influencers/:id
    if ((pathname.startsWith('/api/admin/partners/') || pathname.startsWith('/api/admin/influencers/')) && req.method === 'DELETE') {
      const id = pathname.split('/')[4];
      const deleted = service.deletePartner(id);
      if (deleted) {
        sendJson(200, { success: true, data: { id, deleted: true } });
      } else {
        sendJson(404, { success: false, error: 'Influencer not found' });
      }
      return true;
    }

    // POST /api/admin/outreach
    if (pathname === '/api/admin/outreach' && req.method === 'POST') {
      const body = await readBody<{
        targetType: 'influencer' | 'prospect';
        targetId: string;
        recipientEmail: string;
        recipientName: string;
        subject?: string;
        message?: string;
        channel?: 'email' | 'linkedin' | 'call';
        callOutcome?: string;
        notes?: string;
      }>();
      const outreach = await service.sendOutreach(body);
      sendJson(200, { success: true, data: outreach });
      return true;
    }

    // GET /api/admin/prospects
    if (pathname === '/api/admin/prospects' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const prospects = service.listAllProspects(q);
      sendJson(200, { success: true, data: prospects, meta: { total: prospects.length } });
      return true;
    }

    // POST /api/admin/prospects
    if (pathname === '/api/admin/prospects' && req.method === 'POST') {
      const body = await readBody<{
        partnerId: string;
        fullName: string;
        email: string;
        company: string;
        jobTitle: string;
        relationshipStrength?: 'strong' | 'moderate' | 'weak';
        relationshipContext?: string;
      }>();
      const prospect = service.createProspect(body);
      sendJson(201, { success: true, data: prospect });
      return true;
    }

    // POST /api/admin/prospects/import
    if (pathname === '/api/admin/prospects/import' && req.method === 'POST') {
      const body = await readBody<{ records: any[] }>();
      const created = service.ingestProspects(body.records || []);
      sendJson(201, { success: true, data: created, meta: { imported: created.length } });
      return true;
    }

    // POST /api/admin/prospects/:id/convert-to-influencer
    if (pathname.startsWith('/api/admin/prospects/') && pathname.endsWith('/convert-to-influencer') && req.method === 'POST') {
      const parts = pathname.split('/');
      const prospectId = parts[4];
      const result = service.convertProspectToInfluencer(prospectId);
      sendJson(200, { success: true, data: result.partner, meta: { alreadyExisted: result.alreadyExisted, message: result.message } });
      return true;
    }

    // PUT /api/admin/prospects/:id or /api/admin/contacts/:id
    if ((pathname.startsWith('/api/admin/prospects/') || pathname.startsWith('/api/admin/contacts/')) && (req.method === 'PUT' || req.method === 'PATCH')) {
      const parts = pathname.split('/');
      const prospectId = parts[4];
      const body = await readBody<any>();
      try {
        const updated = service.updateProspect(prospectId, body);
        sendJson(200, { success: true, data: updated });
      } catch (err: any) {
        sendJson(404, { success: false, error: err.message || 'Prospect not found' });
      }
      return true;
    }

    // DELETE /api/admin/prospects/:id or /api/admin/contacts/:id
    if ((pathname.startsWith('/api/admin/prospects/') || pathname.startsWith('/api/admin/contacts/')) && req.method === 'DELETE') {
      const parts = pathname.split('/');
      const prospectId = parts[4];
      const deleted = service.deleteProspect(prospectId);
      if (deleted) {
        sendJson(200, { success: true, data: { id: prospectId, deleted: true } });
      } else {
        sendJson(404, { success: false, error: 'Prospect not found' });
      }
      return true;
    }

    // GET /api/admin/scheduled-meetings
    if (pathname === '/api/admin/scheduled-meetings' && req.method === 'GET') {
      const meetings = service.listScheduledMeetings();
      sendJson(200, { success: true, data: meetings });
      return true;
    }

    // POST /api/admin/scheduled-meetings
    if (pathname === '/api/admin/scheduled-meetings' && req.method === 'POST') {
      const body = await readBody<any>();
      const created = service.createScheduledMeeting(body);
      sendJson(201, { success: true, data: created });
      return true;
    }

    // GET /api/admin/events
    if (pathname === '/api/admin/events' && req.method === 'GET') {
      const events = service.listEvents();
      sendJson(200, { success: true, data: events });
      return true;
    }

    // POST /api/admin/events
    if (pathname === '/api/admin/events' && req.method === 'POST') {
      const body = await readBody<{
        title: string;
        date: string;
        location: string;
        type?: string;
        description?: string;
      }>();
      const event = service.createEvent(body);
      sendJson(201, { success: true, data: event });
      return true;
    }

    // POST /api/admin/events/:id/attendees
    if (pathname.startsWith('/api/admin/events/') && pathname.endsWith('/attendees') && req.method === 'POST') {
      const parts = pathname.split('/');
      const eventId = parts[4];
      const body = await readBody<{
        fullName: string;
        email: string;
        company: string;
        jobTitle: string;
        asInfluencer?: boolean;
      }>();
      const result = service.addEventAttendee(eventId, body);
      sendJson(201, { success: true, data: result.attendee, event: result.event });
      return true;
    }

    // POST /api/admin/events/:eventId/convert-attendee/:attendeeId
    if (pathname.startsWith('/api/admin/events/') && pathname.includes('/convert-attendee/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const eventId = parts[4];
      const attendeeId = parts[6];
      const result = service.convertEventAttendeeToInfluencer(eventId, attendeeId);
      sendJson(200, { success: true, data: result.partner, attendee: result.attendee, message: result.message });
      return true;
    }

    // GET /api/admin/agent/insights
    if (pathname === '/api/admin/agent/insights' && req.method === 'GET') {
      const insights = service.getAgentInsights();
      sendJson(200, { success: true, data: insights, insights });
      return true;
    }

    // POST /api/admin/agent/execute
    if (pathname === '/api/admin/agent/execute' && req.method === 'POST') {
      const body = await readBody<{ actionKey?: string; actionId?: string; params?: any }>();
      const key = body.actionKey || body.actionId || '';
      const result = service.executeAgentAction(key, body.params);
      sendJson(200, { success: true, data: result, ...result });
      return true;
    }

    // POST /api/admin/agent/chat
    if (pathname === '/api/admin/agent/chat' && req.method === 'POST') {
      const body = await readBody<{ query?: string; message?: string }>();
      const q = body.query || body.message || '';
      const result = service.chatWithAgent(q);
      sendJson(200, {
        success: true,
        data: result,
        reply: result.response,
        actionsTaken: result.actionLabel ? [result.actionLabel] : [],
        recommendedActions: [result.actionType]
      });
      return true;
    }

    sendJson(404, { success: false, error: 'Admin Route Not Found' });
    return true;
  } catch (err: any) {
    sendJson(400, { success: false, error: err.message || 'Admin Request Error' });
    return true;
  }
}
