import { randomBytes, randomUUID, scryptSync, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import type {
  Partner,
  Prospect,
  IntroRequest,
  AttributionEvent,
  AttributionStage,
  OutreachActivity,
  RewardRedemptionRequest,
  RedemptionEmailOutboxItem
} from './types.ts';
import { calculateWarmPathScore } from './scoring.ts';
import { chooseAiModelAssignment, getUtcWeekStart } from '../go/ai-models.ts';
import { CREDIT_MILESTONES } from '../go/rewards.ts';
import {
  loadRealDatabase,
  saveProspectToDatabase,
  persistPartnerToDatabase,
  updatePartnerPasswordInDatabase,
  updatePartnerProfileInDatabase
} from './database.ts';

export function hashPortalPassword(password: string): string {
  const salt = randomBytes(16);
  const iterations = 310000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  const encodedSalt = salt.toString('base64url');
  return `pbkdf2_sha256$${iterations}$${encodedSalt}$${digest}`;
}

export function verifyPortalPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  try {
    const parts = storedHash.split('$');
    if (parts.length === 4 && parts[0] === 'pbkdf2_sha256') {
      const iterations = parseInt(parts[1], 10);
      const salt = Buffer.from(parts[2], 'base64url');
      const expectedDigest = parts[3];
      const actualDigest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
      return actualDigest.length === expectedDigest.length && timingSafeEqual(Buffer.from(actualDigest), Buffer.from(expectedDigest));
    }
    const legacyDigest = pbkdf2Sync(password, Buffer.from('gtm_irm_marketplace_salt_v1'), 100000, 32, 'sha256').toString('hex');
    if (legacyDigest === storedHash) return true;
  } catch (_) {}
  return false;
}

export class ConnectemStore {
  private partners = new Map<string, Partner>();
  private prospects = new Map<string, Prospect>();
  private introRequests = new Map<string, IntroRequest>();
  private attributions = new Map<string, AttributionEvent>();
  private outreachActivities = new Map<string, OutreachActivity>();
  private rewardRedemptions = new Map<string, RewardRedemptionRequest>();
  private redemptionEmailOutbox = new Map<string, RedemptionEmailOutboxItem>();
  private partnerPasswordHashes = new Map<string, string>();
  public isRealDatabaseLoaded = false;

  constructor(options: { loadRealDatabase?: boolean } = {}) {
    const shouldLoadReal = options.loadRealDatabase ?? (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT);
    this.seedDefaultData(shouldLoadReal);
  }

  private seedDefaultData(loadReal = false) {
    // 1. If real database is requested (or running production server), load from gtm-console-database.json
    if (loadReal) {
      try {
        const realData = loadRealDatabase();
        for (const [id, partner] of realData.partners.entries()) {
          this.partners.set(id, partner);
        }
        for (const [id, prospect] of realData.prospects.entries()) {
          this.prospects.set(id, prospect);
        }
        for (const [id, req] of realData.introRequests.entries()) {
          this.introRequests.set(id, req);
        }
        for (const [id, attr] of realData.attributions.entries()) {
          this.attributions.set(id, attr);
        }
        this.isRealDatabaseLoaded = realData.partners.size > 0;
      } catch (e) {
        console.warn('[Store] Could not initialize from real database, using baseline:', e);
      }
    }

    // In production mode with real database loaded, no dummy data is added.
    if (this.isRealDatabaseLoaded) {
      return;
    }

    // 2. Baseline fallback for standalone unit tests running without real database
    const partnerId = 'partner_bmiller';
    if (!this.partners.has(partnerId)) {
      const partner: Partner = {
        id: partnerId,
        fullName: 'Bob Miller',
        email: 'bob.miller@milleradvisory.com',
        company: 'Miller Advisory & Ventures',
        jobTitle: 'Managing Partner',
        phone: '+1 (555) 019-2834',
        bio: 'Executive advisor with 20+ years in credit union & community banking IT strategy.',
        expertise: ['Fintech', 'Credit Unions', 'IT Infrastructure'],
        geography: ['North America'],
        privacyTier: 'ask_partner',
        pointsBalance: 120,
        verifiedRevenue: 450000,
        authToken: 'token_partner_bmiller_secret',
        bookingUrl: 'https://calendly.com/miller-advisory/briefing',
        aiDraftLimitDaily: 20,
        aiDraftsUsedToday: 0,
        aiUsageResetDate: new Date().toISOString().split('T')[0],
        aiDraftsUsedThisWeek: 0,
        aiUsageWeekStart: getUtcWeekStart(),
        aiModelAssignment: chooseAiModelAssignment(),
        defaultAiTone: 'warm',
        notificationPreferences: {
          emailOnNewRequest: true,
          emailOnOptIn: true,
          emailOnComplianceCc: true,
          weeklySummary: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.partners.set(partner.id, partner);
    }

    // Ensure prospects for Bob Miller exist in unit test mode
    if (!this.prospects.has('prospect_sjenkins')) {
      const prospect: Prospect = {
        id: 'prospect_sjenkins',
        partnerId,
        fullName: 'Sarah Jenkins',
        firstName: 'Sarah',
        lastName: 'Jenkins',
        email: 'sjenkins@apexfcu.org',
        company: 'Apex Federal Credit Union',
        jobTitle: 'Chief Information Officer',
        industry: 'Banking / Credit Unions',
        relationshipStrength: 'strong',
        relationshipContext: 'Advised Sarah on core banking platform migration in 2024.',
        phone: '+1 (555) 345-6789',
        linkedinUrl: 'https://linkedin.com/in/sarah-jenkins-cu',
        optInCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.prospects.set(prospect.id, prospect);
    }

    if (!this.prospects.has('prospect_mchen')) {
      const prospect2: Prospect = {
        id: 'prospect_mchen',
        partnerId,
        fullName: 'Marcus Chen',
        firstName: 'Marcus',
        lastName: 'Chen',
        email: 'mchen@horizoncu.com',
        company: 'Horizon Community Credit Union',
        jobTitle: 'VP of Digital Transformation',
        industry: 'Banking / Credit Unions',
        relationshipStrength: 'moderate',
        relationshipContext: 'Co-panelist on Finovate 2025 AI in Lending track.',
        phone: '+1 (555) 890-1234',
        linkedinUrl: 'https://linkedin.com/in/marcus-chen-cu',
        optInCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.prospects.set(prospect2.id, prospect2);
    }
  }

  // --- Partners ---
  getPartner(id: string): Partner | undefined {
    return this.partners.get(id);
  }

  getPartnerByEmail(email: string): Partner | undefined {
    const trimmed = (email || '').trim().toLowerCase();
    return Array.from(this.partners.values()).find(
      p => p.email.toLowerCase() === trimmed
    );
  }

  getPartnerByToken(token: string): Partner | undefined {
    return Array.from(this.partners.values()).find(p => p.authToken === token);
  }

  setPartnerPassword(email: string, password: string): void {
    const normalizedEmail = email.trim().toLowerCase();
    const hash = hashPortalPassword(password);
    this.partnerPasswordHashes.set(normalizedEmail, hash);
    const partner = this.getPartnerByEmail(normalizedEmail);
    if (partner) {
      partner.passwordHash = hash;
      partner.mustChangePassword = false;
      partner.passwordChanged = true;
    }
    updatePartnerPasswordInDatabase(normalizedEmail, hash);
  }

  verifyPartnerPassword(email: string, password: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const stored = this.partnerPasswordHashes.get(normalizedEmail);
    if (stored) {
      if (stored.startsWith('pbkdf2_sha256$')) {
        return verifyPortalPassword(password, stored);
      }
      if (stored.includes(':')) {
        const [saltHex, hashHex] = stored.split(':');
        const expected = Buffer.from(hashHex, 'hex');
        const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
        if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
          this.setPartnerPassword(normalizedEmail, password);
          return true;
        }
        return false;
      }
    }

    const partner = this.getPartnerByEmail(normalizedEmail);
    if (partner) {
      if (partner.passwordHash && verifyPortalPassword(password, partner.passwordHash)) {
        this.partnerPasswordHashes.set(normalizedEmail, partner.passwordHash);
        return true;
      }
      const legacy = (partner as any).defaultPassword || (partner as any).password;
      if (legacy && legacy === password) {
        this.setPartnerPassword(normalizedEmail, password);
        return true;
      }
      // If newly provisioned partner has no password set yet, accept password (>= 8 chars), hash and save
      if (!partner.passwordHash && !stored && password && password.length >= 8) {
        this.setPartnerPassword(normalizedEmail, password);
        return true;
      }
    }
    return false;
  }

  createPartner(data: Omit<Partner, 'id' | 'createdAt' | 'updatedAt' | 'pointsBalance' | 'verifiedRevenue'>): Partner {
    const id = `partner_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const partner: Partner = {
      aiDraftLimitDaily: 20,
      aiDraftsUsedToday: 0,
      aiUsageResetDate: now.split('T')[0],
      aiDraftsUsedThisWeek: 0,
      aiUsageWeekStart: getUtcWeekStart(),
      aiModelAssignment: chooseAiModelAssignment(),
      defaultAiTone: 'warm',
      notificationPreferences: {
        emailOnNewRequest: true,
        emailOnOptIn: true,
        emailOnComplianceCc: true,
        weeklySummary: false
      },
      ...data,
      id,
      pointsBalance: 0,
      verifiedRevenue: 0,
      authToken: `token_${id}_${randomUUID().slice(0, 12)}`,
      createdAt: now,
      updatedAt: now
    };
    this.partners.set(id, partner);
    persistPartnerToDatabase(partner);
    return partner;
  }

  updatePartner(id: string, updates: Partial<Partner>): Partner {
    const partner = this.partners.get(id);
    if (!partner) throw new Error(`Partner not found: ${id}`);
    const updated: Partner = {
      ...partner,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.partners.set(id, updated);
    updatePartnerProfileInDatabase(id, updates);
    return updated;
  }

  deletePartner(id: string): boolean {
    const exists = this.partners.has(id);
    if (!exists) return false;
    this.partners.delete(id);
    return true;
  }

  listPartners(): Partner[] {
    return Array.from(this.partners.values());
  }

  // --- Prospects ---
  getProspect(id: string): Prospect | undefined {
    return this.prospects.get(id);
  }

  listProspectsByPartner(partnerId: string): Prospect[] {
    return Array.from(this.prospects.values()).filter(p => p.partnerId === partnerId);
  }

  createProspect(data: Omit<Prospect, 'id' | 'optInCount' | 'createdAt' | 'updatedAt'>): Prospect {
    const id = `prospect_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const prospect: Prospect = {
      ...data,
      id,
      optInCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.prospects.set(id, prospect);
    try {
      saveProspectToDatabase(data.partnerId, prospect);
    } catch (_) {}
    return prospect;
  }

  updateProspect(id: string, updates: Partial<Prospect>): Prospect {
    const prospect = this.prospects.get(id);
    if (!prospect) throw new Error(`Prospect not found: ${id}`);
    const updated: Prospect = {
      ...prospect,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.prospects.set(id, updated);
    return updated;
  }

  deleteProspect(id: string): boolean {
    const exists = this.prospects.has(id);
    if (!exists) return false;
    this.prospects.delete(id);
    return true;
  }

  findWarmPathsForAccount(companyName: string): Array<{ partner: Partner; prospect: Prospect; score: number }> {
    const term = companyName.toLowerCase().trim();
    const results: Array<{ partner: Partner; prospect: Prospect; score: number }> = [];

    for (const prospect of this.prospects.values()) {
      if (prospect.company.toLowerCase().includes(term)) {
        const partner = this.partners.get(prospect.partnerId);
        if (partner && partner.privacyTier !== 'private') {
          const breakdown = calculateWarmPathScore(partner, prospect);
          results.push({
            partner,
            prospect,
            score: breakdown.total
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // --- Intro Requests & Double Opt-In State Machine ---
  createIntroRequest(params: {
    vendorId: string;
    vendorName: string;
    partnerId: string;
    prospectId: string;
    forwardableBrief: string;
    specificAsk: string;
  }): IntroRequest {
    const partner = this.partners.get(params.partnerId);
    const prospect = this.prospects.get(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${params.partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    const warmPathScore = calculateWarmPathScore(partner, prospect).total;
    const now = new Date().toISOString();
    const id = `req_${randomUUID().slice(0, 8)}`;

    const req: IntroRequest = {
      id,
      vendorId: params.vendorId,
      vendorName: params.vendorName,
      partnerId: params.partnerId,
      prospectId: params.prospectId,
      prospectName: prospect.fullName,
      prospectCompany: prospect.company,
      status: 'pending_partner_review',
      warmPathScore,
      forwardableBrief: params.forwardableBrief,
      specificAsk: params.specificAsk,
      createdAt: now,
      updatedAt: now
    };

    this.introRequests.set(id, req);
    return req;
  }

  partnerReviewRequest(params: {
    requestId: string;
    partnerId: string;
    decision: 'approved' | 'declined' | 'needs_context';
    notes?: string;
  }): IntroRequest {
    const req = this.introRequests.get(params.requestId);
    if (!req) throw new Error(`Request not found: ${params.requestId}`);
    if (req.partnerId !== params.partnerId) throw new Error('Unauthorized partner review.');

    req.partnerDecision = params.decision;
    req.partnerNotes = params.notes;
    req.updatedAt = new Date().toISOString();

    if (params.decision === 'approved') {
      req.status = 'partner_approved';
      // Generate clean double opt-in token for the contact
      req.optInToken = `optin_${randomUUID().replace(/-/g, '')}`;
    } else if (params.decision === 'declined') {
      req.status = 'partner_declined';
    }

    return req;
  }

  getIntroRequestByOptInToken(token: string): IntroRequest | undefined {
    return Array.from(this.introRequests.values()).find(r => r.optInToken === token);
  }

  contactRespondOptIn(params: {
    token: string;
    decision: 'accept' | 'maybe_later' | 'decline';
    notes?: string;
    meetingUrl?: string;
  }): IntroRequest {
    const req = this.getIntroRequestByOptInToken(params.token);
    if (!req) throw new Error('Invalid or expired introduction opt-in token.');

    req.contactDecision = params.decision;
    req.contactNotes = params.notes;
    req.updatedAt = new Date().toISOString();

    const prospect = this.prospects.get(req.prospectId);
    if (prospect) {
      prospect.optInCount += 1;
      prospect.lastContactedAt = new Date().toISOString();
    }

    if (params.decision === 'accept') {
      req.status = 'contact_accepted';
      req.scheduledMeetingUrl = params.meetingUrl || 'https://calendly.com/company-gtm/intro-call';
      
      // Record initial verified opt-in attribution milestone
      this.recordAttribution({
        introRequestId: req.id,
        partnerId: req.partnerId,
        vendorId: req.vendorId,
        prospectId: req.prospectId,
        stage: 'opt_in_accepted',
        pointsAwarded: 15,
        verified: true,
        notes: `Contact ${req.prospectName} opted in.`
      });
    } else {
      req.status = 'contact_declined';
    }

    return req;
  }

  recordAttribution(params: Omit<AttributionEvent, 'id' | 'timestamp'>): AttributionEvent {
    const creditsByStage: Record<AttributionStage, number> = {
      opt_in_accepted: 15,
      meeting_held: CREDIT_MILESTONES[1].credits,
      opportunity_created: CREDIT_MILESTONES[2].credits,
      deal_won: CREDIT_MILESTONES[3].credits,
      customer_expansion: CREDIT_MILESTONES[4].credits
    };
    const awardedCredits = params.verified ? (params.pointsAwarded !== undefined ? params.pointsAwarded : creditsByStage[params.stage]) : 0;
    const id = `attr_${randomUUID().slice(0, 8)}`;
    const event: AttributionEvent = {
      ...params,
      pointsAwarded: awardedCredits,
      creditsAwarded: awardedCredits,
      id,
      timestamp: new Date().toISOString()
    };
    this.attributions.set(id, event);

    // Apply verified milestone credits to the partner balance.
    if (awardedCredits > 0) {
      const partner = this.partners.get(params.partnerId);
      if (partner) {
        partner.pointsBalance += awardedCredits;
        if (params.closedRevenue) {
          partner.verifiedRevenue += params.closedRevenue;
        }
      }
    }

    return event;
  }

  listAttributionsByPartner(partnerId: string): AttributionEvent[] {
    return Array.from(this.attributions.values()).filter(a => a.partnerId === partnerId);
  }

  createRewardRedemptionRequest(params: Omit<RewardRedemptionRequest, 'id' | 'submittedAt'>): RewardRedemptionRequest {
    const id = `rwd_${randomUUID().slice(0, 10)}`;
    const submittedAt = new Date().toISOString();
    const request: RewardRedemptionRequest = { ...params, id, submittedAt };
    const emailOutbox: RedemptionEmailOutboxItem = {
      id: `mail_${randomUUID().slice(0, 10)}`,
      requestId: id,
      to: params.emailRecipient,
      subject: `Influencer reward redemption request ${id}`,
      text: [
        'A new influencer reward redemption request was submitted.',
        `Request: ${id}`,
        `Partner: ${params.partnerName} <${params.partnerEmail}> (${params.partnerId})`,
        `Rewards: ${params.itemNames.join(', ')}`,
        `Credits requested: ${params.creditsRequested}`,
        `Available credits: ${params.availableCreditsAtSubmission}`,
        `Details: ${params.details || 'None provided'}`
      ].join('\n'),
      status: params.emailStatus,
      createdAt: submittedAt
    };
    this.rewardRedemptions.set(id, request);
    this.redemptionEmailOutbox.set(emailOutbox.id, emailOutbox);
    return request;
  }

  listRewardRedemptionsByPartner(partnerId: string): RewardRedemptionRequest[] {
    return Array.from(this.rewardRedemptions.values())
      .filter(request => request.partnerId === partnerId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  listIntroRequestsForPartner(partnerId: string): IntroRequest[] {
    return Array.from(this.introRequests.values()).filter(r => r.partnerId === partnerId);
  }

  listAllIntroRequests(): IntroRequest[] {
    return Array.from(this.introRequests.values());
  }

  getAdminMetrics(): {
    totalPartners: number;
    totalProspects: number;
    activeRequests: number;
    acceptedIntros: number;
    totalVerifiedRevenue: number;
  } {
    const requests = Array.from(this.introRequests.values());
    const acceptedIntros = requests.filter(r => r.status === 'contact_accepted' || r.status === 'meeting_completed' || r.status === 'deal_closed').length;
    const totalVerifiedRevenue = Array.from(this.partners.values()).reduce((sum, p) => sum + p.verifiedRevenue, 0);

    return {
      totalPartners: this.partners.size,
      totalProspects: this.prospects.size,
      activeRequests: requests.length,
      acceptedIntros,
      totalVerifiedRevenue
    };
  }

  // --- Outreach Activities & Channel Providers ---
  logOutreachActivity(data: Omit<OutreachActivity, 'id' | 'timestamp'>): OutreachActivity {
    const id = `act_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const act: OutreachActivity = {
      ...data,
      id,
      timestamp: now
    };
    this.outreachActivities.set(id, act);

    const prospect = this.prospects.get(data.prospectId);
    if (prospect) {
      prospect.lastContactedAt = now;
      this.prospects.set(prospect.id, prospect);
    }

    return act;
  }

  listOutreachActivitiesByPartner(partnerId: string): OutreachActivity[] {
    return Array.from(this.outreachActivities.values())
      .filter(a => a.partnerId === partnerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  isTwilioEnabled(): boolean {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  }
}
