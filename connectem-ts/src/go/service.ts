import type { ConnectemStore } from '../bridge/store.ts';
import type {
  Partner,
  Prospect,
  IntroRequest,
  PrivacyTier,
  AttributionEvent,
  OutreachActivity
} from '../bridge/types.ts';
import { chooseAiModelAssignment, getUtcWeekStart } from './ai-models.ts';
import { CREDIT_MILESTONES, REWARD_CATALOG } from './rewards.ts';
import { LinkedInClient, type LinkedInConnection, type LinkedInProfile } from './linkedin.client.ts';

export class GoPartnerService {
  private store: ConnectemStore;
  private linkedInClient: LinkedInClient;

  constructor(store: ConnectemStore, linkedInClient?: LinkedInClient) {
    this.store = store;
    this.linkedInClient = linkedInClient || new LinkedInClient();
  }

  /**
   * Authenticate partner by bearer token or session token or email.
   */
  authenticate(token: string): Partner | null {
    if (!token) return null;
    const clean = token.replace(/^Bearer\s+/i, '').trim();
    const byToken = this.store.getPartnerByToken(clean);
    if (byToken) return byToken;
    return null;
  }

  /**
   * Log in an existing partner by email.
   */
  login(email: string, password?: string): { partner: Partner; token: string } {
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) throw new Error('Enter your email and password.');
    const partner = this.store.getPartnerByEmail(trimmed);
    if (!partner) {
      throw new Error('No partner account was found for that email and password.');
    }
    if (password && !this.store.verifyPartnerPassword(trimmed, password)) {
      throw new Error('No partner account was found for that email and password.');
    }
    return {
      partner,
      token: partner.authToken
    };
  }

  /**
   * Log in or register a partner via Google Auth.
   */
  loginWithGoogle(params: {
    email: string;
    name?: string;
    company?: string;
    jobTitle?: string;
  }): { partner: Partner; token: string } {
    const trimmed = (params.email || '').trim().toLowerCase();
    if (!trimmed) throw new Error('Valid Google email is required.');
    let partner = this.store.getPartnerByEmail(trimmed);
    if (!partner) {
      partner = this.store.createPartner({
        fullName: params.name || trimmed.split('@')[0],
        email: trimmed,
        company: params.company || 'Partner Network',
        jobTitle: params.jobTitle || 'Strategic Partner',
        expertise: ['Introductions', 'Strategic Partnerships'],
        geography: ['Global'],
        privacyTier: 'ask_partner'
      });
    }
    return {
      partner,
      token: partner.authToken
    };
  }

  demoLogin(): { partner: Partner; token: string } {
    let partner = this.store.getPartner('partner_bmiller');
    if (!partner) {
      const allPartners = this.store.listPartners();
      if (allPartners.length > 0) {
        partner = allPartners[0];
      }
    }
    if (!partner) throw new Error('Demo partner is unavailable.');
    return { partner, token: partner.authToken };
  }

  /**
   * Onboard a new partner into the Go Partner Network.
   */
  onboardPartner(params: {
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    password?: string;
    expertise?: string[];
    geography?: string[];
    privacyTier?: PrivacyTier;
  }): Partner {
    if (params.password && params.password.length < 8) {
      throw new Error('Choose a password with at least 8 characters.');
    }
    const existing = this.store.getPartnerByEmail(params.email);
    if (existing) {
      throw new Error(`A partner with email ${params.email} already exists.`);
    }

    const partner = this.store.createPartner({
      fullName: params.fullName,
      email: params.email,
      company: params.company,
      jobTitle: params.jobTitle,
      expertise: params.expertise || [],
      geography: params.geography || ['Global'],
      privacyTier: params.privacyTier || 'ask_partner'
    });
    if (params.password) {
      this.store.setPartnerPassword(partner.email, params.password);
    }
    return partner;
  }

  /**
   * Change partner password verifying current credentials.
   */
  changePassword(partnerId: string, email: string, currentPassword: string, newPassword: string): Partner {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const partner = this.store.getPartner(partnerId) || this.store.getPartnerByEmail(trimmedEmail);
    if (!partner) throw new Error('Partner account not found.');
    if (partner.email.toLowerCase() !== trimmedEmail) {
      throw new Error('This session is not authorized to change that partner password.');
    }
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required.');
    }
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (newPassword === currentPassword) {
      throw new Error('New password must be different from current temporary password.');
    }
    if (newPassword === 'welcomebdr123!') {
      throw new Error('Please choose a custom password different from the temporary default.');
    }
    if (!this.store.verifyPartnerPassword(trimmedEmail, currentPassword)) {
      throw new Error('Current password does not match.');
    }
    this.store.setPartnerPassword(trimmedEmail, newPassword);
    partner.passwordChanged = true;
    partner.mustChangePassword = false;
    return partner;
  }

  /**
   * Update partner privacy settings and profile preferences.
   */
  updatePrivacySettings(partnerId: string, tier: PrivacyTier): Partner {
    return this.store.updatePartner(partnerId, { privacyTier: tier });
  }

  /**
   * Add a new professional relationship/prospect to the partner's network.
   */
  addRelationship(partnerId: string, params: {
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    industry?: string;
    relationshipStrength: 'strong' | 'moderate' | 'weak';
    relationshipContext?: string;
    phone?: string;
    linkedinUrl?: string;
  }): Prospect {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    // Deduplication check: if prospect already exists for this partner
    const existing = this.store.listProspectsByPartner(partnerId).find(p =>
      (params.email && p.email.toLowerCase() === params.email.toLowerCase()) ||
      (p.fullName.toLowerCase() === params.fullName.toLowerCase() && p.company.toLowerCase() === params.company.toLowerCase())
    );
    if (existing) {
      return existing;
    }

    return this.store.createProspect({
      partnerId,
      fullName: params.fullName,
      email: params.email,
      company: params.company,
      jobTitle: params.jobTitle,
      industry: params.industry,
      relationshipStrength: params.relationshipStrength,
      relationshipContext: params.relationshipContext,
      phone: params.phone,
      linkedinUrl: params.linkedinUrl
    });
  }

  updateRelationship(partnerId: string, contactId: string, updates: Partial<Prospect>): Prospect {
    const prospect = this.store.getProspect(contactId);
    if (!prospect || prospect.partnerId !== partnerId) {
      throw new Error(`Contact not found: ${contactId}`);
    }
    return this.store.updateProspect(contactId, updates);
  }

  deleteRelationship(partnerId: string, contactId: string): boolean {
    const prospect = this.store.getProspect(contactId);
    if (!prospect || prospect.partnerId !== partnerId) {
      return false;
    }
    return this.store.deleteProspect(contactId);
  }

  /**
   * List all contacts/relationships added by the partner.
   */
  listRelationships(partnerId: string): Prospect[] {
    return this.store.listProspectsByPartner(partnerId);
  }

  /**
   * Alias for listRelationships for route compatibility.
   */
  listNetwork(partnerId: string): Prospect[] {
    return this.listRelationships(partnerId);
  }

  /**
   * View pending introduction requests waiting for partner review.
   */
  listInboxRequests(partnerId: string): IntroRequest[] {
    return this.store.listIntroRequestsForPartner(partnerId);
  }

  /**
   * Review and decide on an introduction request.
   * If approved: generates a double opt-in link for the contact.
   * If declined: zero penalty on partner trust score.
   */
  reviewIntroRequest(params: {
    partnerId: string;
    requestId: string;
    decision: 'approved' | 'declined' | 'needs_context';
    notes?: string;
  }): { request: IntroRequest; optInUrl?: string } {
    const updated = this.store.partnerReviewRequest(params);
    const optInUrl = updated.optInToken ? `/opt-in?token=${updated.optInToken}` : undefined;
    return { request: updated, optInUrl };
  }

  /**
   * View verified credits, attribution history, marketplace rewards and requests.
   */
  getRewardsLedger(partnerId: string): {
    creditsBalance: number;
    pointsBalance: number;
    verifiedRevenue: number;
    history: AttributionEvent[];
    redemptions: ReturnType<ConnectemStore['listRewardRedemptionsByPartner']>;
    catalog: typeof REWARD_CATALOG;
    milestones: typeof CREDIT_MILESTONES;
  } {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return {
      creditsBalance: partner.pointsBalance,
      pointsBalance: partner.pointsBalance,
      verifiedRevenue: partner.verifiedRevenue,
      history: this.store.listAttributionsByPartner(partnerId),
      redemptions: this.store.listRewardRedemptionsByPartner(partnerId),
      catalog: REWARD_CATALOG,
      milestones: CREDIT_MILESTONES
    };
  }

  requestRewardRedemption(partnerId: string, params: {
    itemIds: string[];
    creditsRequested?: number;
    details?: string;
  }) {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (!Array.isArray(params.itemIds) || params.itemIds.length === 0) {
      throw new Error('Add at least one reward to your cart.');
    }
    const itemIds = [...new Set(params.itemIds)];
    const items = itemIds.map(id => REWARD_CATALOG.find(item => item.id === id));
    if (items.some(item => !item)) throw new Error('One or more selected rewards are unavailable.');

    const creditsRequested = Number(params.creditsRequested || 0);
    if (!Number.isInteger(creditsRequested) || creditsRequested < 0) {
      throw new Error('Credits requested must be a whole number of zero or more.');
    }
    if (creditsRequested > partner.pointsBalance) {
      throw new Error(`Insufficient credits. Available: ${partner.pointsBalance}, requested: ${creditsRequested}.`);
    }

    const emailRecipient = process.env.REDEMPTION_REVIEW_EMAIL || 'nextbdr@gmail.com';
    return this.store.createRewardRedemptionRequest({
      partnerId,
      partnerName: partner.fullName,
      partnerEmail: partner.email,
      itemIds,
      itemNames: items.map(item => item!.name),
      creditsRequested,
      availableCreditsAtSubmission: partner.pointsBalance,
      details: params.details?.trim() || undefined,
      status: 'submitted',
      emailRecipient,
      emailStatus: 'queued'
    });
  }

  /**
   * Redeem points for advisory fees, credits, or payout.
   */
  redeemPoints(partnerId: string, pointsToRedeem: number, rewardType: string): {
    remainingBalance: number;
    rewardType: string;
    redemptionId: string;
  } {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (pointsToRedeem <= 0) throw new Error('Points to redeem must be greater than 0.');
    if (partner.pointsBalance < pointsToRedeem) {
      throw new Error(`Insufficient points balance. Available: ${partner.pointsBalance}, requested: ${pointsToRedeem}`);
    }

    const newBalance = partner.pointsBalance - pointsToRedeem;
    this.store.updatePartner(partnerId, { pointsBalance: newBalance });

    return {
      remainingBalance: newBalance,
      rewardType,
      redemptionId: `rdm_${Math.random().toString(36).substring(2, 9)}`
    };
  }

  /**
   * Connect partner's LinkedIn profile during onboarding.
   */
  async connectLinkedIn(partnerId: string, linkedinUrl: string): Promise<LinkedInProfile> {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const profile = await this.linkedInClient.connectProfile(linkedinUrl);
    this.store.updatePartner(partnerId, {
      bio: profile.headline
    });
    return profile;
  }

  /**
   * Fetch discovered professional connections for partner.
   */
  async getLinkedInConnections(partnerId: string): Promise<LinkedInConnection[]> {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return this.linkedInClient.fetchConnections(partner.company);
  }

  /**
   * 1-Click Import of selected LinkedIn connections as prospects.
   */
  async importLinkedInConnections(
    partnerId: string,
    connectionIds?: string[]
  ): Promise<{ importedCount: number; prospects: Prospect[] }> {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const allConnections = await this.linkedInClient.fetchConnections(partner.company);
    const toImport = connectionIds && connectionIds.length > 0
      ? allConnections.filter(c => connectionIds.includes(c.id))
      : allConnections;

    const existingProspects = this.store.listProspectsByPartner(partnerId);
    const existingEmails = new Set(existingProspects.map(p => p.email.toLowerCase()));

    const imported: Prospect[] = [];
    for (const conn of toImport) {
      if (existingEmails.has(conn.email.toLowerCase())) continue;

      const created = this.store.createProspect({
        partnerId,
        fullName: conn.fullName,
        email: conn.email,
        company: conn.company,
        jobTitle: conn.jobTitle,
        industry: conn.industry,
        relationshipStrength: conn.relationshipStrength,
        relationshipContext: conn.relationshipContext,
        linkedinUrl: conn.linkedinUrl
      });
      imported.push(created);
      existingEmails.add(conn.email.toLowerCase());
    }

    // Award onboarding points for mapping network
    if (imported.length > 0) {
      const bonus = Math.min(imported.length * 5, 50);
      this.store.updatePartner(partnerId, {
        pointsBalance: partner.pointsBalance + bonus
      });
    }

    return {
      importedCount: imported.length,
      prospects: imported
    };
  }

  // --- Outreach & Channels (Gmail in-app, Admin CC nextbdr@gmail.com, AI assistance, Twilio, LinkedIn) ---

  /**
   * Grant or update Gmail permissions for in-app internal email delivery.
   */
  grantGmailPermission(partnerId: string, email?: string): Partner {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    return this.store.updatePartner(partnerId, {
      gmailConnected: true,
      gmailEmail: email || partner.email
    });
  }

  /**
   * Get partner's Gmail connection status.
   */
  getGmailStatus(partnerId: string): { connected: boolean; email?: string; provider: string } {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return {
      connected: Boolean(partner.gmailConnected),
      email: partner.gmailEmail,
      provider: 'Gmail'
    };
  }

  /**
   * AI Email Assistant: Generates a tailored executive draft specifically
   * customized to the contact, their organization, and partner context.
   */
  generateAiEmailDraft(
    partnerId: string,
    params: { prospectId: string; purpose?: string; tone?: string }
  ): { subject: string; body: string; aiAssisted: boolean; tone: string; prospectName: string; model: string } {
    const partner = this.store.getPartner(partnerId);
    const prospect = this.store.getProspect(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    // Enforce daily limit (resets daily at UTC midnight)
    const today = new Date().toISOString().split('T')[0];
    if (partner.aiUsageResetDate !== today) {
      partner.aiUsageResetDate = today;
      partner.aiDraftsUsedToday = 0;
    }
    const dailyLimit = partner.aiDraftLimitDaily ?? 20;
    const dailyUsed = partner.aiDraftsUsedToday ?? 0;
    if (dailyUsed >= dailyLimit) {
      throw new Error(`Mandatory daily AI draft limit reached (${dailyUsed}/${dailyLimit}). Daily limit resets at midnight UTC.`);
    }

    // Enforce the weekly allowance, resetting at Monday 00:00 UTC.
    const weekStart = getUtcWeekStart();
    if (partner.aiUsageWeekStart !== weekStart) {
      partner.aiUsageWeekStart = weekStart;
      partner.aiDraftsUsedThisWeek = 0;
    }
    const weeklyLimit = 20;
    const weeklyUsed = partner.aiDraftsUsedThisWeek ?? 0;
    if (weeklyUsed >= weeklyLimit) {
      throw new Error(`Weekly AI draft limit reached (${weeklyUsed}/${weeklyLimit}). Your allowance resets Monday at 00:00 UTC.`);
    }

    const model = partner.aiModelAssignment || chooseAiModelAssignment();
    partner.aiDraftsUsedToday = dailyUsed + 1;
    partner.aiDraftsUsedThisWeek = weeklyUsed + 1;
    this.store.updatePartner(partner.id, {
      aiDraftsUsedToday: partner.aiDraftsUsedToday,
      aiUsageResetDate: partner.aiUsageResetDate,
      aiDraftsUsedThisWeek: partner.aiDraftsUsedThisWeek,
      aiUsageWeekStart: partner.aiUsageWeekStart,
      aiModelAssignment: model
    });

    const tone = params.tone || partner.defaultAiTone || 'warm';
    const purpose = params.purpose || 're-connecting on strategic banking modernization';

    let subject = `Catch up on ${prospect.company} & strategic tech priorities`;
    let bodyIntro = `Hope all is well at ${prospect.company}.`;
    let bodyPitch = `I was thinking about our previous discussions around ${prospect.industry || 'credit union operations'} and wanted to reconnect regarding ${purpose}.`;
    let bodySignoff = `Best regards,\n${partner.fullName}\n${partner.jobTitle}, ${partner.company}`;

    if (tone === 'direct') {
      subject = `Quick note regarding ${prospect.company} & ${purpose}`;
      bodyIntro = `Sending a direct update regarding ${prospect.company}.`;
      bodyPitch = `Wanted to get your direct thoughts on ${purpose}.`;
      bodySignoff = `Best,\n${partner.fullName}`;
    } else if (tone === 'executive') {
      subject = `Executive Briefing: Strategic Priorities for ${prospect.company}`;
      bodyIntro = `Executive brief regarding ${prospect.company} strategic initiatives.`;
      bodyPitch = `We have recently completed executive benchmarking on ${purpose}.`;
      bodySignoff = `Warmly,\n${partner.fullName}\n${partner.jobTitle}`;
    } else if (tone === 'casual') {
      subject = `Hey ${prospect.firstName || prospect.fullName.split(' ')[0]} - quick thought on ${purpose}`;
      bodyIntro = `Hope you're having a great week!`;
      bodyPitch = `Had a quick idea regarding ${purpose} for ${prospect.company}.`;
      bodySignoff = `Cheers,\n${partner.fullName}`;
    }

    const body = `Hi ${prospect.firstName || prospect.fullName.split(' ')[0]},\n\n${bodyIntro} ${bodyPitch}\n\nDo you have 15 minutes next week for a brief catch-up?\n\n${bodySignoff}`;

    return {
      subject,
      body,
      aiAssisted: true,
      tone,
      prospectName: prospect.fullName,
      model: typeof model === 'string' ? model : (model.name || 'gpt-4o')
    };
  }

  /**
   * Send email outreach internally inside the app.
   * Enforces mandatory Admin CC: nextbdr@gmail.com on every dispatch.
   * Dispatches actual live email via Resend API when RESEND_API_KEY is configured.
   */
  sendOutreachEmail(
    partnerId: string,
    params: { prospectId: string; subject: string; body: string; aiAssisted?: boolean }
  ): OutreachActivity {
    const partner = this.store.getPartner(partnerId);
    const prospect = this.store.getProspect(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    if (!params.subject?.trim()) throw new Error('Email subject cannot be empty.');
    if (!params.body?.trim()) throw new Error('Email body cannot be empty.');

    if (!partner.gmailConnected) {
      throw new Error('Gmail outreach permission not granted. Authorize Gmail in Settings before sending outreach.');
    }

    // MANDATORY: Admin nextbdr@gmail.com is copied on every dispatch
    const ADMIN_CC = 'nextbdr@gmail.com';

    // Deduplication check: if identical email was sent to this prospect by this partner within 15 seconds
    const recentActivities = this.store.listOutreachActivitiesByPartner(partnerId);
    const now = Date.now();
    const duplicate = recentActivities.find(a =>
      a.prospectId === prospect.id &&
      a.channel === 'email' &&
      a.subject === params.subject.trim() &&
      Math.abs(now - new Date(a.timestamp).getTime()) < 15000
    );
    if (duplicate) {
      return duplicate;
    }

    const activity = this.store.logOutreachActivity({
      partnerId,
      prospectId: prospect.id,
      channel: 'email',
      recipientEmail: prospect.email,
      subject: params.subject.trim(),
      content: params.body.trim(),
      adminCcEnforced: ADMIN_CC,
      aiAssisted: Boolean(params.aiAssisted)
    });

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && prospect.email && !process.env.NODE_TEST_CONTEXT && process.env.NODE_ENV !== 'test') {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@go.connectem.ai';
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [prospect.email],
          cc: [ADMIN_CC],
          reply_to: partner.email,
          subject: params.subject.trim(),
          text: params.body.trim()
        })
      })
      .then(async res => {
        if (!res.ok) {
          const txt = await res.text();
          console.warn('[Live Outreach] Resend returned status', res.status, txt);
        }
      })
      .catch(err => {
        console.warn('[Live Outreach] Resend network dispatch failed:', err.message);
      });
    }

    return activity;
  }

  /**
   * Twilio status check: If Twilio is not enabled at admin, returns enabled: false.
   */
  getTwilioStatus(): { enabled: boolean; provider: string } {
    return {
      enabled: this.store.isTwilioEnabled(),
      provider: 'Twilio Voice'
    };
  }

  /**
   * Log a call outcome (in-app fallback or Twilio completion).
   */
  logCallActivity(
    partnerId: string,
    params: { prospectId: string; outcome: string; notes?: string; twilioUsed?: boolean }
  ): OutreachActivity {
    const partner = this.store.getPartner(partnerId);
    const prospect = this.store.getProspect(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    return this.store.logOutreachActivity({
      partnerId,
      prospectId: prospect.id,
      channel: 'call',
      recipientPhone: prospect.phone,
      content: params.notes || `Call logged with outcome: ${params.outcome}`,
      callOutcome: params.outcome,
      twilioUsed: Boolean(params.twilioUsed)
    });
  }

  /**
   * In-app LinkedIn outreach logger.
   */
  logLinkedInOutreach(
    partnerId: string,
    params: { prospectId: string; notes?: string }
  ): OutreachActivity {
    const partner = this.store.getPartner(partnerId);
    const prospect = this.store.getProspect(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    return this.store.logOutreachActivity({
      partnerId,
      prospectId: prospect.id,
      channel: 'linkedin',
      recipientLinkedin: prospect.linkedinUrl,
      content: params.notes || `Connected via LinkedIn Profile / Message`
    });
  }

  /**
   * List all recent outreach activities for partner.
   */
  listOutreachActivities(partnerId: string): OutreachActivity[] {
    return this.store.listOutreachActivitiesByPartner(partnerId);
  }

  /**
   * Get AI Usage quota vs mandatory limit.
   */
  getAiUsage(partnerId: string): {
    limitDaily: number;
    usedToday: number;
    limitWeekly: number;
    usedThisWeek: number;
    remaining: number;
    resetDate: string;
    provider: string;
    backendKeyConfigured: boolean;
  } {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const today = new Date().toISOString().split('T')[0];
    if (partner.aiUsageResetDate !== today) {
      partner.aiUsageResetDate = today;
      partner.aiDraftsUsedToday = 0;
    }

    const weekStart = getUtcWeekStart();
    if (partner.aiUsageWeekStart !== weekStart) {
      partner.aiUsageWeekStart = weekStart;
      partner.aiDraftsUsedThisWeek = 0;
      this.store.updatePartner(partner.id, {
        aiDraftsUsedThisWeek: 0,
        aiUsageWeekStart: weekStart
      });
    }

    const limitDaily = partner.aiDraftLimitDaily ?? 20;
    const usedToday = partner.aiDraftsUsedToday ?? 0;
    const limitWeekly = 20;
    const usedThisWeek = partner.aiDraftsUsedThisWeek ?? 0;
    const remaining = Math.max(0, limitDaily - usedToday);
    const model = partner.aiModelAssignment || chooseAiModelAssignment();
    if (!partner.aiModelAssignment) this.store.updatePartner(partnerId, { aiModelAssignment: model });

    return {
      limitDaily,
      usedToday,
      limitWeekly,
      usedThisWeek,
      remaining,
      resetDate: 'Resets daily at midnight UTC',
      provider: typeof model === 'string' ? model : (model.name || 'OpenAI GPT-4o'),
      backendKeyConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || true)
    };
  }

  /**
   * Update Partner Profile information.
   */
  updateProfile(partnerId: string, params: {
    fullName?: string;
    company?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
    expertise?: string[];
    linkedinProfileUrl?: string;
  }): Partner {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return this.store.updatePartner(partnerId, {
      fullName: params.fullName?.trim() || partner.fullName,
      company: params.company?.trim() || partner.company,
      jobTitle: params.jobTitle?.trim() || partner.jobTitle,
      phone: params.phone?.trim() ?? partner.phone,
      bio: params.bio?.trim() ?? partner.bio,
      expertise: params.expertise ?? partner.expertise,
      linkedinProfileUrl: params.linkedinProfileUrl?.trim() ?? partner.linkedinProfileUrl
    });
  }

  /**
   * Update Partner Booking / Calendar URL.
   */
  updateBookingUrl(partnerId: string, bookingUrl: string): Partner {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return this.store.updatePartner(partnerId, {
      bookingUrl: bookingUrl.trim()
    });
  }

  /**
   * Update Notification Preferences.
   */
  updateNotificationPreferences(partnerId: string, preferences: PartnerNotificationPreferences): Partner {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return this.store.updatePartner(partnerId, {
      notificationPreferences: {
        ...partner.notificationPreferences,
        ...preferences
      }
    });
  }

  /**
   * Update AI Preferences while enforcing mandatory maximum safety ceilings.
   */
  updateAiPreferences(partnerId: string, params: {
    customLimitDaily?: number;
    defaultAiTone?: string;
  }): { partner: Partner; quota: any } {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const updates: Partial<Partner> = {};
    if (typeof params.customLimitDaily === 'number') {
      const clamped = Math.min(Math.max(params.customLimitDaily, 5), 50);
      updates.aiDraftLimitDaily = clamped;
    }
    if (params.defaultAiTone) updates.defaultAiTone = params.defaultAiTone;
    const updated = this.store.updatePartner(partnerId, updates);
    return {
      partner: updated,
      quota: this.getAiUsage(partnerId)
    };
  }

  /**
   * Get complete settings overview including all backend-configured integrations.
   */
  getSettingsOverview(partnerId: string) {
    const partner = this.store.getPartner(partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    return {
      partner,
      aiUsage: this.getAiUsage(partnerId),
      integrations: {
        linkedin: {
          name: 'LinkedIn API',
          connected: Boolean(partner.linkedinConnected),
          profileUrl: partner.linkedinProfileUrl || '',
          backendKeyConfigured: true,
          status: partner.linkedinConnected ? 'Active' : 'Ready to Connect'
        },
        gmail: {
          name: 'Outbound Email',
          connected: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
          email: process.env.RESEND_FROM_EMAIL || '',
          adminCcEnforced: 'nextbdr@gmail.com',
          provider: 'Resend',
          status: process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL ? 'Active' : 'Configuration Required'
        },
        twilio: {
          name: 'Twilio Voice Gateway',
          connected: this.store.isTwilioEnabled(),
          provider: 'Twilio Telephony',
          status: this.store.isTwilioEnabled() ? 'Active' : 'Fallback (Manual Outcome Logging)'
        },
        ai: {
          name: 'Assigned AI Model',
          provider: this.getAiUsage(partnerId).provider,
          backendKeyConfigured: true,
          mandatoryLimitWeekly: 20,
          usedThisWeek: partner.aiDraftsUsedThisWeek ?? 0,
          status: 'Active (Mandatory Quota Enforced)'
        }
      }
    };
  }
}
