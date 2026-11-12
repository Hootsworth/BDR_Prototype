import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GoPartnerService } from './service.ts';
import type { ApiResponse, PrivacyTier } from '../bridge/types.ts';

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

export async function handleGoRoute(
  req: IncomingMessage,
  res: ServerResponse,
  service: GoPartnerService,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  if (!pathname.startsWith('/api/go') && !pathname.startsWith('/api/partner-portal')) return false;

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

  const authHeader = ((req.headers['authorization'] || (req.headers as any)['Authorization']) || '') as string;
  const currentPartner = service.authenticate(authHeader);

  try {
    // POST /api/go/login & POST /api/partner-portal/login
    if ((pathname === '/api/go/login' || pathname === '/api/partner-portal/login') && req.method === 'POST') {
      const body = await readBody<{ email: string; password: string }>();
      const result = service.login(body.email, body.password);
      const referrals = service.listNetwork(result.partner.id);
      sendJson(200, {
        success: true,
        status: 'success',
        token: result.token,
        partner: result.partner,
        influencer: result.partner,
        referrals,
        mustChangePassword: Boolean(result.partner.mustChangePassword),
        data: {
          ...result,
          referrals,
          mustChangePassword: Boolean(result.partner.mustChangePassword)
        }
      });
      return true;
    }

    // POST /api/go/google-login & POST /api/partner-portal/google-login
    if ((pathname === '/api/go/google-login' || pathname === '/api/partner-portal/google-login') && req.method === 'POST') {
      const body = await readBody<{ credential?: string; email?: string; name?: string; company?: string; jobTitle?: string }>();
      const parsed = parseGoogleCredential(body.credential);
      const email = (parsed?.email || body.email || '').trim().toLowerCase();
      if (!email) {
        sendJson(400, { success: false, error: 'A valid Google email is required.' });
        return true;
      }
      const name = parsed?.name || body.name || email.split('@')[0];
      const result = service.loginWithGoogle({
        email,
        name,
        company: body.company,
        jobTitle: body.jobTitle
      });
      const referrals = service.listNetwork(result.partner.id);
      sendJson(200, {
        success: true,
        status: 'success',
        token: result.token,
        partner: result.partner,
        influencer: result.partner,
        referrals,
        mustChangePassword: false,
        data: {
          ...result,
          referrals,
          mustChangePassword: false
        }
      });
      return true;
    }

    // POST /api/go/demo-login — development & preview profile.
    if (pathname === '/api/go/demo-login' && req.method === 'POST') {
      const result = service.demoLogin();
      const referrals = service.listNetwork(result.partner.id);
      sendJson(200, {
        success: true,
        status: 'success',
        token: result.token,
        partner: result.partner,
        influencer: result.partner,
        referrals,
        mustChangePassword: false,
        data: result
      });
      return true;
    }

    // POST /api/go/onboard, /api/go/signup, /api/partner-portal/signup, /api/partner-portal/onboard
    if ((pathname === '/api/go/onboard' || pathname === '/api/go/signup' || pathname === '/api/partner-portal/signup' || pathname === '/api/partner-portal/onboard') && req.method === 'POST') {
      const body = await readBody<any>();
      const partner = service.onboardPartner(body);
      sendJson(201, {
        success: true,
        status: 'success',
        token: partner.authToken,
        partner,
        influencer: partner,
        data: partner
      });
      return true;
    }

    // All subsequent Go & Partner Portal routes require authenticated partner session
    if (!currentPartner) {
      sendJson(401, { success: false, error: 'Sign in to your Go partner workspace first.' });
      return true;
    }

    // GET /api/go/session or /api/partner-portal/session
    if ((pathname === '/api/go/session' || pathname === '/api/partner-portal/session') && req.method === 'GET') {
      const referrals = service.listNetwork(currentPartner.id);
      sendJson(200, {
        success: true,
        status: 'success',
        profileComplete: true,
        token: currentPartner.authToken,
        partner: currentPartner,
        influencer: currentPartner,
        user: currentPartner,
        referrals,
        data: currentPartner
      });
      return true;
    }

    // POST /api/go/change-password or /api/partner-portal/change-password
    if ((pathname === '/api/go/change-password' || pathname === '/api/partner-portal/change-password') && req.method === 'POST') {
      const body = await readBody<{ email?: string; currentPassword?: string; newPassword?: string }>();
      const updated = service.changePassword(
        currentPartner.id,
        body.email || currentPartner.email,
        body.currentPassword || '',
        body.newPassword || ''
      );
      sendJson(200, {
        success: true,
        status: 'success',
        message: 'Password updated successfully.',
        partner: updated,
        influencer: updated,
        data: updated
      });
      return true;
    }

    // POST /api/partner-portal/sync-partner or GET /api/partner-portal/sync-partner
    if (pathname === '/api/partner-portal/sync-partner') {
      if (req.method === 'POST') {
        const body = await readBody<any>();
        if (body.partner) service.updateProfile(currentPartner.id, body.partner);
      }
      sendJson(200, {
        success: true,
        status: 'success',
        influencer: currentPartner,
        partner: currentPartner,
        referrals: service.listNetwork(currentPartner.id)
      });
      return true;
    }

    // GET /api/partner-portal/google/status
    if (pathname === '/api/partner-portal/google/status' && req.method === 'GET') {
      sendJson(200, {
        success: true,
        status: 'success',
        connected: Boolean(currentPartner.gmailConnected),
        email: currentPartner.gmailEmail || currentPartner.email
      });
      return true;
    }

    // POST /api/go/settings/privacy
    if (pathname === '/api/go/settings/privacy' && req.method === 'POST') {
      const body = await readBody<{ privacyTier: PrivacyTier }>();
      const updated = service.updatePrivacySettings(currentPartner.id, body.privacyTier);
      sendJson(200, { success: true, data: updated });
      return true;
    }

    // GET /api/go/settings (Complete overview including API integrations and AI usage)
    if (pathname === '/api/go/settings' && req.method === 'GET') {
      const overview = service.getSettingsOverview(currentPartner.id);
      sendJson(200, { success: true, data: overview });
      return true;
    }

    // POST /api/go/settings/profile
    if (pathname === '/api/go/settings/profile' && req.method === 'POST') {
      const body = await readBody<any>();
      const updated = service.updateProfile(currentPartner.id, body);
      sendJson(200, { success: true, data: updated });
      return true;
    }

    // POST /api/go/settings/booking
    if (pathname === '/api/go/settings/booking' && req.method === 'POST') {
      const body = await readBody<{ bookingUrl: string }>();
      const updated = service.updateBookingUrl(currentPartner.id, body.bookingUrl || '');
      sendJson(200, { success: true, data: updated });
      return true;
    }

    // POST /api/go/settings/notifications
    if (pathname === '/api/go/settings/notifications' && req.method === 'POST') {
      const body = await readBody<any>();
      const updated = service.updateNotificationPreferences(currentPartner.id, body);
      sendJson(200, { success: true, data: updated });
      return true;
    }

    // GET /api/go/settings/ai/usage (Mandatory AI Quota Usage)
    if (pathname === '/api/go/settings/ai/usage' && req.method === 'GET') {
      const usage = service.getAiUsage(currentPartner.id);
      sendJson(200, { success: true, data: usage });
      return true;
    }

    // POST /api/go/settings/ai
    if (pathname === '/api/go/settings/ai' && req.method === 'POST') {
      const body = await readBody<{ defaultAiTone?: string }>();
      const result = service.updateAiPreferences(currentPartner.id, body);
      sendJson(200, { success: true, data: result });
      return true;
    }

    // GET /api/go/relationships
    if (pathname === '/api/go/relationships' && req.method === 'GET') {
      const list = service.listRelationships(currentPartner.id);
      sendJson(200, { success: true, data: list, meta: { total: list.length } });
      return true;
    }

    // POST /api/go/relationships
    if (pathname === '/api/go/relationships' && req.method === 'POST') {
      const body = await readBody<any>();
      const prospect = service.addRelationship(currentPartner.id, body);
      sendJson(201, { success: true, data: prospect });
      return true;
    }

    // PUT /api/go/relationships/:id
    if (pathname.startsWith('/api/go/relationships/') && (req.method === 'PUT' || req.method === 'PATCH')) {
      const id = pathname.split('/')[4];
      const body = await readBody<any>();
      try {
        const updated = service.updateRelationship(currentPartner.id, id, body);
        sendJson(200, { success: true, data: updated });
      } catch (err: any) {
        sendJson(404, { success: false, error: err.message || 'Contact not found' });
      }
      return true;
    }

    // DELETE /api/go/relationships/:id
    if (pathname.startsWith('/api/go/relationships/') && req.method === 'DELETE') {
      const id = pathname.split('/')[4];
      const deleted = service.deleteRelationship(currentPartner.id, id);
      if (deleted) {
        sendJson(200, { success: true, data: { id, deleted: true } });
      } else {
        sendJson(404, { success: false, error: 'Contact not found' });
      }
      return true;
    }

    // GET /api/go/inbox
    if (pathname === '/api/go/inbox' && req.method === 'GET') {
      const inbox = service.listInboxRequests(currentPartner.id);
      sendJson(200, { success: true, data: inbox, meta: { count: inbox.length } });
      return true;
    }

    // POST /api/go/inbox/review
    if (pathname === '/api/go/inbox/review' && req.method === 'POST') {
      const body = await readBody<{
        requestId: string;
        decision: 'approved' | 'declined' | 'needs_context';
        notes?: string;
      }>();
      const result = service.reviewIntroRequest({
        partnerId: currentPartner.id,
        requestId: body.requestId,
        decision: body.decision,
        notes: body.notes
      });
      sendJson(200, { success: true, data: result });
      return true;
    }

    // GET /api/go/rewards
    if (pathname === '/api/go/rewards' && req.method === 'GET') {
      const rewards = service.getRewardsLedger(currentPartner.id);
      sendJson(200, { success: true, data: rewards });
      return true;
    }

    // POST /api/go/rewards/requests — queue a manual redemption request.
    if (pathname === '/api/go/rewards/requests' && req.method === 'POST') {
      const body = await readBody<{ itemIds: string[]; creditsRequested?: number; details?: string }>();
      const request = service.requestRewardRedemption(currentPartner.id, body);
      sendJson(201, { success: true, data: request });
      return true;
    }

    // Legacy redemption endpoint: turn old requests into pending marketplace requests.
    if (pathname === '/api/go/rewards/redeem' && req.method === 'POST') {
      const body = await readBody<{ points: number; rewardType: string }>();
      const itemIdByType: Record<string, string> = {
        ach_wire: 'cash-reward',
        advisory_credit: 'product-services',
        charitable_gift: 'nonprofit-donation'
      };
      const request = service.requestRewardRedemption(currentPartner.id, {
        itemIds: [itemIdByType[body.rewardType] || body.rewardType],
        creditsRequested: body.points
      });
      sendJson(200, { success: true, data: { ...request, remainingBalance: currentPartner.pointsBalance - body.points } });
      return true;
    }

    // --- Onboarding Sequence: LinkedIn Integration ---
    // POST /api/go/onboarding/linkedin/connect
    if (pathname === '/api/go/onboarding/linkedin/connect' && req.method === 'POST') {
      const body = await readBody<{ linkedinUrl: string }>();
      const profile = await service.connectLinkedIn(currentPartner.id, body.linkedinUrl);
      sendJson(200, {
        success: true,
        data: {
          profile,
          nextStep: 'connections'
        }
      });
      return true;
    }

    // GET /api/go/onboarding/linkedin/connections
    if (pathname === '/api/go/onboarding/linkedin/connections' && req.method === 'GET') {
      const connections = await service.getLinkedInConnections(currentPartner.id);
      sendJson(200, {
        success: true,
        data: {
          connections,
          total: connections.length
        }
      });
      return true;
    }

    // POST /api/go/onboarding/linkedin/import
    if (pathname === '/api/go/onboarding/linkedin/import' && req.method === 'POST') {
      const body = await readBody<{ connectionIds?: string[] }>();
      const result = await service.importLinkedInConnections(currentPartner.id, body.connectionIds);
      sendJson(200, {
        success: true,
        data: result
      });
      return true;
    }

    // --- In-App Outreach (Gmail, Admin CC nextbdr@gmail.com, AI drafts, Twilio, LinkedIn) ---
    // POST /api/go/outreach/gmail/connect
    if (pathname === '/api/go/outreach/gmail/connect' && req.method === 'POST') {
      const body = await readBody<{ email?: string }>();
      const updated = service.grantGmailPermission(currentPartner.id, body.email);
      sendJson(200, {
        success: true,
        data: {
          connected: true,
          email: updated.gmailEmail || body.email,
          provider: 'Gmail'
        }
      });
      return true;
    }

    // GET /api/go/outreach/gmail/status
    if (pathname === '/api/go/outreach/gmail/status' && req.method === 'GET') {
      const status = service.getGmailStatus(currentPartner.id);
      sendJson(200, { success: true, data: status });
      return true;
    }

    // POST /api/go/outreach/email/ai-draft
    if (pathname === '/api/go/outreach/email/ai-draft' && req.method === 'POST') {
      const body = await readBody<{ prospectId: string; purpose?: string; tone?: string }>();
      const draft = service.generateAiEmailDraft(currentPartner.id, body);
      sendJson(200, { success: true, data: draft });
      return true;
    }

    // POST /api/go/outreach/email (Enforces CC nextbdr@gmail.com)
    if (pathname === '/api/go/outreach/email' && req.method === 'POST') {
      const body = await readBody<{
        prospectId: string;
        subject: string;
        body: string;
        aiAssisted?: boolean;
      }>();
      const activity = await service.sendOutreachEmail(currentPartner.id, body);
      sendJson(200, { success: true, data: activity });
      return true;
    }

    // GET /api/go/outreach/twilio/status
    if (pathname === '/api/go/outreach/twilio/status' && req.method === 'GET') {
      const status = service.getTwilioStatus();
      sendJson(200, { success: true, data: status });
      return true;
    }

    // POST /api/go/outreach/call/log
    if (pathname === '/api/go/outreach/call/log' && req.method === 'POST') {
      const body = await readBody<{
        prospectId: string;
        outcome: string;
        notes?: string;
        twilioUsed?: boolean;
      }>();
      const activity = service.logCallActivity(currentPartner.id, body);
      sendJson(200, { success: true, data: activity });
      return true;
    }

    // POST /api/go/outreach/linkedin/log
    if (pathname === '/api/go/outreach/linkedin/log' && req.method === 'POST') {
      const body = await readBody<{ prospectId: string; notes?: string }>();
      const activity = service.logLinkedInOutreach(currentPartner.id, body);
      sendJson(200, { success: true, data: activity });
      return true;
    }

    // GET /api/go/outreach/activities
    if (pathname === '/api/go/outreach/activities' && req.method === 'GET') {
      const activities = service.listOutreachActivities(currentPartner.id);
      sendJson(200, { success: true, data: activities });
      return true;
    }

    sendJson(404, { success: false, error: 'Go Route Not Found' });
    return true;
  } catch (err: any) {
    sendJson(400, { success: false, error: err.message || 'Go Request Error' });
    return true;
  }
}
