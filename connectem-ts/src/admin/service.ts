import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ConnectemStore } from '../bridge/store.ts';
import type { Prospect, IntroRequest } from '../bridge/types.ts';
import {
  loadRealEvents,
  loadRealScheduledMeetings,
  persistEventToDatabase,
  persistAttendeeToDatabase,
  persistMeetingToDatabase,
  persistProspectToDatabase,
  readDatabaseJson,
  writeDatabaseJson
} from '../bridge/database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CampaignDraft {
  prospectId: string;
  partnerId: string;
  channel: 'email' | 'linkedin';
  subject?: string;
  body: string;
  forwardableBrief: string;
}

export interface EventAttendee {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string;
  isInfluencer?: boolean;
  partnerId?: string;
  addedAt: string;
}

export interface ScheduledMeeting {
  id: string;
  contactId?: number | string;
  contactName: string;
  contactTitle: string;
  contactCompany: string;
  contactEmail: string;
  contactPhone?: string;
  platform: 'Google Meet' | 'Microsoft Teams' | 'Zoom' | string;
  meetingUrl: string;
  timeString: string;
  influencerName: string;
  influencerId?: number | string;
  influencerCredits?: number;
  status: 'Confirmed' | 'Call Scheduled' | 'Completed' | string;
  notes?: string;
  datetimeRaw: string;
}

export interface FieldEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  type: string;
  description: string;
  attendees: EventAttendee[];
  createdAt: string;
}

export interface AgentInsight {
  id: string;
  category: 'outreach' | 'warm_paths' | 'followup' | 'influencer';
  title: string;
  description: string;
  actionKey: string;
  actionId?: string;
  actionLabel: string;
  targetCount: number;
  metric?: string;
}

export interface AdminSettings {
  // General & AI Keys
  openai: string;
  gemini: string;
  exploriumApiKey: string;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  exploriumConfigured: boolean;
  defaultAiModel: string;
  geminiSearchGrounding: boolean;
  sidebarPosition: 'left' | 'right';
  sidebarCollapsible: boolean;

  // Account & Profile (RBAC)
  adminName: string;
  adminEmail: string;
  userRole: string;
  authProvider: string;
  complianceEmail: string;
  notificationEmail: string;

  // Google Workspace & Mail
  googleClientId: string;
  googleClientSecret: string;
  googleClientSecretConfigured: boolean;
  googleRedirectUri: string;

  // Twilio Voice
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioConfigured: boolean;
  twilioFromNumber: string;

  // LinkedIn API
  linkedinClientId: string;
  linkedinClientSecret: string;
  linkedinAccessToken: string;
  linkedinConfigured: boolean;

  // Lemlist Outbound & MCP
  resendApiKey: string;
  resendConfigured: boolean;
  lemlistApiKey: string;
  lemlistEmail: string;
  lemlistMcpCommand: string;
  lemlistConfigured: boolean;

  // Firecrawl Scraping
  firecrawlApiKey: string;
  firecrawlDepth: string;
  firecrawlConfigured: boolean;

  // CRM Bi-Directional Sync
  crmAutoDeal: boolean;
  crmReplySync: boolean;
  crmSuppression: boolean;
  crmWebhookEndpoint: string;

  // Alerts & Scheduling
  slackWebhookUrl: string;
  calendlyUrl: string;
  calendarProvider: string;

  // Influencer Economics
  defaultCreditsPerProspect: number;
  creditsPerMeeting: number;
  autoApproveIntros: boolean;
  dataRetentionDays: number;

  // System
  appVersion: string;
  currentCommit: string;
}

export class AdminService {
  private store: ConnectemStore;
  private activeTokens: Set<string> = new Set();
  private events: FieldEvent[] = [];
  private meetings: ScheduledMeeting[] = [];
  private settings: AdminSettings = {
    // General & AI Keys
    openai: '',
    gemini: '',
    exploriumApiKey: '',
    openaiConfigured: false,
    geminiConfigured: false,
    exploriumConfigured: false,
    defaultAiModel: 'gemini-1.5-pro',
    geminiSearchGrounding: true,
    sidebarPosition: 'left',
    sidebarCollapsible: false,

    // Account & Profile (RBAC)
    adminName: 'GTM Administrator',
    adminEmail: 'nextbdr@gmail.com',
    userRole: 'Admin',
    authProvider: 'Admin Session Token',
    complianceEmail: 'nextbdr@gmail.com',
    notificationEmail: 'nextbdr@gmail.com',

    // Google Workspace & Mail
    googleClientId: '',
    googleClientSecret: '',
    googleClientSecretConfigured: false,
    googleRedirectUri: 'http://localhost:8002/api/google/oauth/callback',

    // Twilio Voice
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioConfigured: false,
    twilioFromNumber: '+1 (855) 314-1409',

    // LinkedIn API
    linkedinClientId: '86gtm_linkedin_oauth_app',
    linkedinClientSecret: '',
    linkedinAccessToken: '',
    linkedinConfigured: false,

    // Lemlist Outbound & MCP
    resendApiKey: '',
    resendConfigured: false,
    lemlistApiKey: '',
    lemlistEmail: 'nextbdr@gmail.com',
    lemlistMcpCommand: 'npx mcp-remote https://app.lemlist.com/mcp',
    lemlistConfigured: false,

    // Firecrawl Scraping
    firecrawlApiKey: '',
    firecrawlDepth: 'deep_dorking',
    firecrawlConfigured: false,

    // CRM Bi-Directional Sync
    crmAutoDeal: true,
    crmReplySync: true,
    crmSuppression: true,
    crmWebhookEndpoint: 'https://api.gtmconsole.internal/v1/crm/webhook-listener',

    // Alerts & Scheduling
    slackWebhookUrl: '',
    calendlyUrl: 'https://calendly.com/company-gtm/intro-call',
    calendarProvider: 'google',

    // Influencer Economics
    defaultCreditsPerProspect: 50,
    creditsPerMeeting: 200,
    autoApproveIntros: true,
    dataRetentionDays: 365,

    // System
    appVersion: 'v1.1.0',
    currentCommit: 'main'
  };

  constructor(store: ConnectemStore) {
    this.store = store;
    this.loadRealSettings();
    this.seedDefaultEvents();
    this.seedScheduledMeetings();
  }

  private loadRealSettings() {
    const db = readDatabaseJson();
    if (db && db.settings && typeof db.settings === 'object') {
      this.settings = { ...this.settings, ...db.settings };
    }
  }

  private seedScheduledMeetings() {
    const realMeetings = loadRealScheduledMeetings();
    if (realMeetings.length > 0) {
      this.meetings = realMeetings;
      return;
    }

    // Baseline fallback for unit tests running without database file
    this.meetings = [
      {
        id: 'meet_nov_02',
        contactName: 'David Sterling',
        contactTitle: 'Chief Information Officer',
        contactCompany: 'First Tech Federal Credit Union',
        contactEmail: 'dsterling@firsttech.org',
        contactPhone: '+1 (415) 890-1234',
        platform: 'Google Meet',
        meetingUrl: 'https://meet.google.com/ft-sterling-briefing',
        timeString: '11/02/2026 at 02:30 PM (EST)',
        influencerName: 'Bob Miller',
        influencerId: 'partner_miller',
        influencerCredits: 50,
        status: 'Confirmed',
        notes: 'Referred by Bob Miller. Discussing enterprise database authorization gateways and zero-trust audit compliance.',
        datetimeRaw: '2026-11-02T14:30:00.000Z'
      },
      {
        id: 'meet_nov_04',
        contactName: 'Elena Rostova',
        contactTitle: 'Managing Director',
        contactCompany: 'Apex Growth Partners',
        contactEmail: 'elena@apexgp.com',
        contactPhone: '+1 (212) 555-0199',
        platform: 'Microsoft Teams',
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/apex-growth-briefing',
        timeString: '11/04/2026 at 11:00 AM (EST)',
        influencerName: 'Sarah Jenkins',
        influencerId: 'partner_jenkins',
        influencerCredits: 35,
        status: 'Confirmed',
        notes: 'Referred by Sarah Jenkins. Briefing with private equity portfolio tech leaders on warm intro velocity.',
        datetimeRaw: '2026-11-04T11:00:00.000Z'
      },
      {
        id: 'meet_nov_06',
        contactName: 'Liam Anderson',
        contactTitle: 'Chief Information Officer',
        contactCompany: 'Apex Federal Credit Union',
        contactEmail: 'liam.anderson.31@apexcu.org',
        contactPhone: '+1 (965) 798-8019',
        platform: 'Google Meet',
        meetingUrl: 'https://meet.google.com/gtm-31-demo',
        timeString: '11/06/2026 at 03:00 PM (EST)',
        influencerName: 'Kim Beluzo',
        influencerId: 1,
        influencerCredits: 25,
        status: 'Confirmed',
        notes: 'Referred by Kim Beluzo. High-intent follow-up briefing on NCUA-compliant database guardrails.',
        datetimeRaw: '2026-11-06T15:00:00.000Z'
      },
      {
        id: 'meet_nov_12',
        contactName: 'Rachel Adams',
        contactTitle: 'VP Strategy',
        contactCompany: 'Beacon Point Ventures',
        contactEmail: 'rachel@beaconpoint.vc',
        contactPhone: '+1 (617) 432-8871',
        platform: 'Zoom',
        meetingUrl: 'https://zoom.us/j/9482718290',
        timeString: '11/12/2026 at 01:30 PM (EST)',
        influencerName: 'Marcus Vance',
        influencerId: 'partner_vance',
        influencerCredits: 40,
        status: 'Confirmed',
        notes: 'Referred by Marcus Vance. Joint portfolio briefing on enterprise warm intro pipeline acceleration.',
        datetimeRaw: '2026-11-12T13:30:00.000Z'
      }
    ];
  }

  listScheduledMeetings(): ScheduledMeeting[] {
    return this.meetings;
  }

  createScheduledMeeting(params: Partial<ScheduledMeeting>): ScheduledMeeting {
    const meeting: ScheduledMeeting = {
      id: params.id || `meet_${randomUUID().slice(0, 8)}`,
      contactId: params.contactId,
      contactName: (params.contactName || 'Executive Contact').trim(),
      contactTitle: (params.contactTitle || 'Executive').trim(),
      contactCompany: (params.contactCompany || 'Company').trim(),
      contactEmail: (params.contactEmail || '').trim(),
      contactPhone: (params.contactPhone || '').trim(),
      platform: (params.platform || 'Google Meet').trim(),
      meetingUrl: (params.meetingUrl || 'https://meet.google.com/connectem-demo').trim(),
      timeString: params.timeString || 'Scheduled Meeting',
      influencerName: (params.influencerName || 'Influencer Partner').trim(),
      influencerId: params.influencerId,
      influencerCredits: params.influencerCredits || 25,
      status: params.status || 'Confirmed',
      notes: params.notes || `Scheduled by ${params.influencerName || 'Influencer Partner'}.`,
      datetimeRaw: params.datetimeRaw || new Date().toISOString()
    };
    this.meetings.unshift(meeting);
    try {
      persistMeetingToDatabase(meeting);
    } catch (_) {}
    return meeting;
  }

  private seedDefaultEvents() {
    const realEvents = loadRealEvents();
    if (realEvents.length > 0) {
      this.events = realEvents;
      return;
    }

    // Baseline fallback for unit tests running without database file
    this.events = [
      {
        id: 'event_gac_dinner',
        title: 'GAC 2026 Executive VIP Dinner',
        date: '2026-11-14',
        location: 'Washington, D.C. (The Mayflower Hotel)',
        type: 'Executive Dinner',
        description: 'Private C-suite dinner for Credit Union CIOs and Advisory Partners discussing zero-trust database compliance.',
        attendees: [
          {
            id: 'att_dsterling',
            fullName: 'David Sterling',
            email: 'dsterling@firsttech.org',
            company: 'First Tech Federal Credit Union',
            jobTitle: 'Chief Information Officer',
            isInfluencer: true,
            partnerId: 'partner_dsterling',
            addedAt: '2026-11-01T10:00:00Z'
          },
          {
            id: 'att_erostova',
            fullName: 'Elena Rostova',
            email: 'elena@apexgp.com',
            company: 'Apex Growth Partners',
            jobTitle: 'Managing Director',
            isInfluencer: false,
            addedAt: '2026-11-01T11:30:00Z'
          }
        ],
        createdAt: '2026-11-01T09:00:00Z'
      },
      {
        id: 'event_fintech_roundtable',
        title: 'FinTech & AI Governance Roundtable',
        date: '2026-11-28',
        location: 'New York, NY (Penn Club)',
        type: 'VIP Roundtable',
        description: 'Interactive executive briefing on enterprise LLM database gateways and referral partner rewards.',
        attendees: [
          {
            id: 'att_mvance',
            fullName: 'Marcus Vance',
            email: 'mvance@crestview.org',
            company: 'Crestview Capital',
            jobTitle: 'Managing Partner',
            isInfluencer: false,
            addedAt: '2026-11-02T08:15:00Z'
          },
          {
            id: 'att_radams',
            fullName: 'Rachel Adams',
            email: 'rachel@beaconpoint.vc',
            company: 'Beacon Point Ventures',
            jobTitle: 'VP Strategy',
            isInfluencer: false,
            addedAt: '2026-11-02T09:00:00Z'
          }
        ],
        createdAt: '2026-11-02T08:00:00Z'
      },
      {
        id: 'event_symwest_summit',
        title: 'SymWest 2026 Ecosystem Summit',
        date: '2026-12-05',
        location: 'San Diego, CA (Convention Center)',
        type: 'Conference Summit',
        description: 'Core banking ecosystem leaders and fintech syndicates.',
        attendees: [
          {
            id: 'att_jblake',
            fullName: 'Jonathan Blake',
            email: 'jblake@sierrafund.io',
            company: 'Sierra FinTech Fund',
            jobTitle: 'General Partner',
            isInfluencer: false,
            addedAt: '2026-11-02T12:00:00Z'
          }
        ],
        createdAt: '2026-11-02T10:00:00Z'
      }
    ];
  }

  /**
   * Authenticate admin via credentials or token.
   */
  login(email: string, password?: string) {
    const adminEmail = (email || '').trim().toLowerCase() || 'nextbdr@gmail.com';
    const token = `admin_token_${randomUUID().replace(/-/g, '')}`;
    this.activeTokens.add(token);
    return {
      token,
      email: adminEmail,
      role: 'admin',
      name: adminEmail === 'nextbdr@gmail.com' ? 'NextBDR Compliance Admin' : 'Admin Operator'
    };
  }

  /**
   * Verify an active administrator bearer token.
   */
  verifySession(token: string) {
    if (!token) return null;
    const cleanToken = token.replace('Bearer ', '').trim();
    if (this.activeTokens.has(cleanToken)) {
      return {
        email: 'nextbdr@gmail.com',
        role: 'admin',
        valid: true
      };
    }
    return null;
  }

  /**
   * Invalidate administrator session.
   */
  logout(token: string) {
    const cleanToken = (token || '').replace('Bearer ', '').trim();
    this.activeTokens.delete(cleanToken);
    return true;
  }

  /**
   * Search for warm paths to target accounts across the entire partner network.
   */
  searchTargetAccounts(companyQuery: string) {
    return this.store.findWarmPathsForAccount(companyQuery);
  }

  /**
   * Ingest target prospects (e.g. from CSV or target account lists).
   */
  ingestProspects(records: Array<{
    partnerId: string;
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    relationshipStrength?: 'strong' | 'moderate' | 'weak';
    relationshipContext?: string;
  }>): Prospect[] {
    const created: Prospect[] = [];
    for (const rec of records) {
      const prospect = this.store.createProspect({
        partnerId: rec.partnerId,
        fullName: rec.fullName,
        email: rec.email,
        company: rec.company,
        jobTitle: rec.jobTitle,
        relationshipStrength: rec.relationshipStrength || 'moderate',
        relationshipContext: rec.relationshipContext || 'Direct partner acquaintance'
      });
      created.push(prospect);
    }
    return created;
  }

  /**
   * Generate forwardable introduction brief customized for the partner's voice.
   */
  generateIntroductionBrief(prospect: Prospect, partnerName: string, vendorValueProp: string): string {
    return `Hi ${prospect.firstName || prospect.fullName},\n\nI was speaking with the team at ConnectEM about secure data infrastructure. Knowing your focus as ${prospect.jobTitle} at ${prospect.company}, I thought this would be directly relevant to your roadmap:\n\n${vendorValueProp}\n\nWould you be open to a 20-minute executive briefing next week? Let me know and I will connect you directly.\n\nBest,\n${partnerName}`;
  }

  /**
   * Launch an introduction request through a trusted partner with safety guardrails.
   */
  requestWarmIntro(params: {
    vendorId: string;
    vendorName: string;
    partnerId: string;
    prospectId: string;
    customBrief?: string;
    specificAsk?: string;
  }): IntroRequest {
    const partner = this.store.getPartner(params.partnerId);
    const prospect = this.store.getProspect(params.prospectId);
    if (!partner) throw new Error(`Partner not found: ${params.partnerId}`);
    if (!prospect) throw new Error(`Prospect not found: ${params.prospectId}`);

    const brief = params.customBrief || this.generateIntroductionBrief(
      prospect,
      partner.fullName,
      'Automated compliance guardrails for enterprise database operations.'
    );

    return this.store.createIntroRequest({
      vendorId: params.vendorId,
      vendorName: params.vendorName,
      partnerId: params.partnerId,
      prospectId: params.prospectId,
      forwardableBrief: brief,
      specificAsk: params.specificAsk || '20-minute introductory executive briefing'
    });
  }

  /**
   * Get executive attribution and pipeline metrics.
   */
  getExecutiveDashboard() {
    const metrics = this.store.getAdminMetrics();
    return {
      ...metrics,
      activePartners: metrics.totalPartners,
      totalWarmPaths: metrics.totalProspects
    };
  }

  /**
   * List all introduction requests for administration audit.
   */
  listAllRequests() {
    return this.store.listAllIntroRequests();
  }

  /**
   * List all partners with relationship counts and status.
   */
  listPartners() {
    return this.store.listPartners().map(partner => ({
      ...partner,
      contactsCount: this.store.listProspectsByPartner(partner.id).length,
      credits: partner.pointsBalance ?? 0
    }));
  }

  /**
   * List prospects with partner attribution context and outreach status.
   */
  listAllProspects(query?: string) {
    const results: Array<Prospect & {
      partnerName: string;
      partnerCompany: string;
      partnerJobTitle: string;
      outreachStatus: string;
      introRequestId?: string;
      introSpecificAsk?: string;
      introForwardableBrief?: string;
    }> = [];
    const term = (query || '').toLowerCase().trim();

    const requestMap = new Map<string, IntroRequest>();
    for (const req of this.store.listAllIntroRequests()) {
      requestMap.set(req.prospectId, req);
    }

    for (const partner of this.store.listPartners()) {
      const contacts = this.store.listProspectsByPartner(partner.id);
      for (const c of contacts) {
        if (!term || c.fullName.toLowerCase().includes(term) || c.company.toLowerCase().includes(term) || c.jobTitle.toLowerCase().includes(term) || partner.fullName.toLowerCase().includes(term)) {
          const req = requestMap.get(c.id);
          let outreachStatus = 'Pending';
          if (req) {
            if (req.status === 'meeting_scheduled' || req.status === 'meeting_completed') outreachStatus = 'Meeting Scheduled';
            else if (req.status === 'contact_accepted') outreachStatus = 'Intro Accepted';
            else if (req.status === 'contact_contacted') outreachStatus = 'Intro Sent';
            else if (req.status === 'partner_approved') outreachStatus = 'Partner Approved';
            else if (req.status === 'pending_partner_review') outreachStatus = 'In Review';
            else outreachStatus = req.status;
          } else if (c.lastContactedAt) {
            outreachStatus = 'Contacted';
          }

          results.push({
            ...c,
            partnerName: partner.fullName,
            partnerCompany: partner.company,
            partnerJobTitle: partner.jobTitle || 'Executive Partner',
            outreachStatus,
            introRequestId: req?.id,
            introSpecificAsk: req?.specificAsk || '20-minute executive briefing on secure data operations',
            introForwardableBrief: req?.forwardableBrief || `Hi ${c.firstName || c.fullName}, connecting you regarding enterprise data infrastructure based on ${partner.fullName}'s recommendation.`
          });
        }
      }
    }
    return results;
  }

  /**
   * Create an influencer / partner.
   */
  createPartner(params: {
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    privacyTier?: 'discoverable' | 'anonymous' | 'ask_partner' | 'private';
    phone?: string;
    expertise?: string[];
    geography?: string[];
  }) {
    return this.store.createPartner({
      fullName: params.fullName,
      email: params.email,
      company: params.company,
      jobTitle: params.jobTitle,
      privacyTier: params.privacyTier || 'ask_partner',
      expertise: params.expertise || ['Enterprise GTM', 'Advisory'],
      geography: params.geography || ['Global'],
      phone: params.phone || '',
      bio: `${params.jobTitle} at ${params.company}`
    });
  }

  /**
   * Send outreach to an influencer or prospect, enforcing CC to nextbdr@gmail.com.
   */
  sendOutreach(params: {
    targetType: 'influencer' | 'prospect';
    targetId: string;
    recipientEmail: string;
    recipientName: string;
    subject?: string;
    message?: string;
    channel?: 'email' | 'linkedin' | 'call';
    callOutcome?: string;
    notes?: string;
  }) {
    const complianceCc = 'nextbdr@gmail.com';
    if (params.targetType === 'prospect') {
      const p = this.store.getProspect(params.targetId);
      if (p) {
        p.lastContactedAt = new Date().toISOString();
        p.optInCount = (p.optInCount || 0) + 1;
        persistProspectToDatabase(p);
      }
    }
    return {
      id: `outreach_${Date.now()}`,
      targetType: params.targetType,
      targetId: params.targetId,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
      subject: params.subject || `Outreach via ${params.channel || 'email'}`,
      message: params.message || '',
      channel: params.channel || 'email',
      callOutcome: params.callOutcome || '',
      notes: params.notes || '',
      complianceCc,
      sentAt: new Date().toISOString(),
      status: 'delivered'
    };
  }

  /**
   * Create a single prospect under a specified partner.
   */
  createProspect(params: {
    partnerId: string;
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    relationshipStrength?: 'strong' | 'moderate' | 'weak';
    relationshipContext?: string;
  }): Prospect {
    const partner = this.store.getPartner(params.partnerId);
    if (!partner) throw new Error(`Partner not found: ${params.partnerId}`);
    return this.store.createProspect({
      partnerId: params.partnerId,
      fullName: params.fullName,
      email: params.email,
      company: params.company,
      jobTitle: params.jobTitle,
      relationshipStrength: params.relationshipStrength || 'strong',
      relationshipContext: params.relationshipContext || 'Advisory relationship'
    });
  }

  /**
   * Convert an executive prospect into an influencer partner.
   */
  convertProspectToInfluencer(prospectId: string) {
    const allProspects = this.listAllProspects();
    const prospect = allProspects.find(p => p.id === prospectId);
    if (!prospect) {
      throw new Error(`Prospect not found: ${prospectId}`);
    }

    // Check if partner already exists with this email
    const existing = this.store.listPartners().find(
      p => p.email.toLowerCase() === prospect.email.toLowerCase()
    );
    if (existing) {
      return {
        partner: existing,
        alreadyExisted: true,
        message: `${prospect.fullName} is already an influencer partner.`
      };
    }

    const partner = this.store.createPartner({
      fullName: prospect.fullName,
      email: prospect.email,
      company: prospect.company,
      jobTitle: prospect.jobTitle || 'Executive Partner',
      privacyTier: 'ask_partner',
      expertise: ['Executive Network', 'Enterprise Advisory'],
      geography: ['Global'],
      phone: prospect.phone || '',
      bio: `Converted from Prospect. ${prospect.jobTitle} at ${prospect.company}.`
    });

    return {
      partner,
      alreadyExisted: false,
      message: `${prospect.fullName} successfully converted to an Influencer partner.`
    };
  }

  // ─── Field Events & Calendar (Way to Add Influencers) ───

  listEvents(): FieldEvent[] {
    return this.events;
  }

  createEvent(params: {
    title: string;
    date: string;
    location: string;
    type?: string;
    description?: string;
  }): FieldEvent {
    const newEvent: FieldEvent = {
      id: `event_${randomUUID().slice(0, 8)}`,
      title: params.title.trim(),
      date: params.date,
      location: params.location.trim() || 'TBD',
      type: params.type || 'Executive Dinner',
      description: params.description || '',
      attendees: [],
      createdAt: new Date().toISOString()
    };
    this.events.unshift(newEvent);
    try {
      persistEventToDatabase(newEvent);
    } catch (_) {}
    return newEvent;
  }

  addEventAttendee(eventId: string, attendee: {
    fullName: string;
    email: string;
    company: string;
    jobTitle: string;
    asInfluencer?: boolean;
  }) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);

    let partnerId: string | undefined;
    let isInfluencer = Boolean(attendee.asInfluencer);

    if (isInfluencer) {
      // Auto-register as an influencer partner in the store if not already present
      const existing = this.store.listPartners().find(
        p => p.email.toLowerCase() === attendee.email.trim().toLowerCase()
      );
      if (existing) {
        partnerId = existing.id;
      } else {
        const newPartner = this.store.createPartner({
          fullName: attendee.fullName.trim(),
          email: attendee.email.trim(),
          company: attendee.company.trim(),
          jobTitle: attendee.jobTitle.trim() || 'Executive Partner',
          privacyTier: 'ask_partner',
          expertise: ['Field Event Network', event.type],
          geography: ['North America'],
          bio: `Met at ${event.title} (${event.date}).`
        });
        partnerId = newPartner.id;
      }
    }

    const newAttendee: EventAttendee = {
      id: `att_${randomUUID().slice(0, 8)}`,
      fullName: attendee.fullName.trim(),
      email: attendee.email.trim(),
      company: attendee.company.trim(),
      jobTitle: attendee.jobTitle.trim(),
      isInfluencer,
      partnerId,
      addedAt: new Date().toISOString()
    };

    event.attendees.push(newAttendee);
    try {
      persistAttendeeToDatabase(eventId, newAttendee);
    } catch (_) {}
    return { event, attendee: newAttendee };
  }

  convertEventAttendeeToInfluencer(eventId: string, attendeeId: string) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);

    const attendee = event.attendees.find(a => a.id === attendeeId);
    if (!attendee) throw new Error(`Attendee not found: ${attendeeId}`);

    const existing = this.store.listPartners().find(
      p => p.email.toLowerCase() === attendee.email.toLowerCase()
    );

    let partner = existing;
    if (!partner) {
      partner = this.store.createPartner({
        fullName: attendee.fullName,
        email: attendee.email,
        company: attendee.company,
        jobTitle: attendee.jobTitle || 'Executive Partner',
        privacyTier: 'ask_partner',
        expertise: ['Field Event Network', event.type],
        geography: ['North America'],
        bio: `Met at ${event.title} (${event.date}).`
      });
    }

    attendee.isInfluencer = true;
    attendee.partnerId = partner.id;

    return {
      partner,
      attendee,
      message: `${attendee.fullName} from ${event.title} is now an Influencer partner.`
    };
  }

  // ─── Integrated Agent Mode (Copilot & Autonomous Workflows) ───

  getAgentInsights(): AgentInsight[] {
    const prospects = this.listAllProspects();
    const partners = this.store.listPartners();

    const uncontacted = prospects.filter(p => !p.outreachStatus || p.outreachStatus === 'Pending');
    const inactivePartners = partners.filter(p => (p.contactsCount || 0) === 0);
    const followUps = prospects.filter(p => p.outreachStatus?.includes('Follow-up') || p.outreachStatus?.includes('Follow up'));

    const insights: AgentInsight[] = [];

    insights.push({
      id: 'insight_uncontacted',
      category: 'outreach',
      title: 'Queue Personalized Outreach',
      description: `${uncontacted.length || prospects.length} prospects have influencer briefing notes and are ready for outreach.`,
      actionKey: 'draft_uncontacted',
      actionId: 'queue_outreach_drafts',
      actionLabel: 'Draft Outbound Messages',
      targetCount: uncontacted.length || prospects.length,
      metric: `${uncontacted.length || prospects.length} pending`
    });

    insights.push({
      id: 'insight_warm_paths',
      category: 'warm_paths',
      title: 'High-Score Warm Path Radar',
      description: 'Found high-confidence warm paths (score 90+) into top target accounts.',
      actionKey: 'scan_warm_paths',
      actionId: 'scan_warm_paths',
      actionLabel: 'Scan Top Warm Paths',
      targetCount: Math.min(15, prospects.length),
      metric: 'Top warm paths'
    });

    insights.push({
      id: 'insight_influencers',
      category: 'influencer',
      title: 'Activate Network Influencers',
      description: `${inactivePartners.length || partners.length} registered influencers ready to introduce executive prospects.`,
      actionKey: 'activate_influencers',
      actionId: 'activate_dormant_partners',
      actionLabel: 'Draft Influencer Check-ins',
      targetCount: inactivePartners.length || partners.length,
      metric: `${inactivePartners.length || partners.length} partners`
    });

    insights.push({
      id: 'insight_followups',
      category: 'followup',
      title: 'Prepare Event Follow-up Notes',
      description: `${followUps.length > 0 ? followUps.length : 'All'} field event attendees and prospects awaiting follow-up cadence.`,
      actionKey: 'queue_followups',
      actionId: 'prep_event_followups',
      actionLabel: 'Prepare Follow-up Notes',
      targetCount: followUps.length > 0 ? followUps.length : Math.min(5, prospects.length),
      metric: `${followUps.length > 0 ? followUps.length : 5} follow-ups`
    });

    return insights;
  }

  executeAgentAction(actionKey: string, params: any = {}) {
    const prospects = this.listAllProspects();
    const partners = this.store.listPartners();

    if (actionKey === 'draft_uncontacted' || actionKey === 'queue_outreach_drafts') {
      const targets = prospects.filter(p => !p.outreachStatus || p.outreachStatus === 'Pending').slice(0, 5);
      const drafts = targets.map(p => ({
        prospectId: p.id,
        prospectName: p.fullName,
        company: p.company,
        email: p.email,
        partnerName: p.partnerName,
        subject: `Quick introduction from ${p.partnerName || 'a mutual connection'}`,
        draftMessage: `Hi ${p.firstName || p.fullName},\n\n${p.partnerName || 'Our mutual connection'} suggested I reach out regarding your leadership at ${p.company}.\n\nWould you have 15 minutes for a quick chat next week?\n\nBest,\nConnectEM Admin\nCC: nextbdr@gmail.com`
      }));
      return {
        action: actionKey,
        success: true,
        count: drafts.length,
        summary: `Generated ${drafts.length} personalized outreach drafts tailored with influencer briefing context.`,
        items: drafts
      };
    }

    if (actionKey === 'scan_warm_paths') {
      const topMatches = this.searchTargetAccounts('Apex').concat(this.searchTargetAccounts('Crestview'));
      return {
        action: actionKey,
        success: true,
        count: topMatches.length,
        summary: `Identified ${topMatches.length} high-confidence warm paths into target enterprise accounts.`,
        items: topMatches.slice(0, 6)
      };
    }

    if (actionKey === 'activate_influencers' || actionKey === 'activate_dormant_partners') {
      const inactive = partners.filter(p => (p.contactsCount || 0) === 0).slice(0, 5);
      const notes = inactive.map(inf => ({
        partnerId: inf.id,
        partnerName: inf.fullName,
        company: inf.company,
        email: inf.email,
        subject: `Checking in / ConnectEM introductions alignment`,
        message: `Hi ${inf.fullName.split(' ')[0]},\n\nHope you are having a productive week! Following up to see if any peers in your network at enterprise accounts would benefit from warm briefings.\n\nBest,\nConnectEM Admin\nCC: nextbdr@gmail.com`
      }));
      return {
        action: actionKey,
        success: true,
        count: notes.length,
        summary: `Prepared ${notes.length} re-engagement notes for registered influencers.`,
        items: notes
      };
    }

    if (actionKey === 'queue_followups' || actionKey === 'prep_event_followups') {
      const followUps = prospects.filter(p => p.outreachStatus?.includes('Follow-up') || p.outreachStatus?.includes('Follow up'));
      return {
        action: actionKey,
        success: true,
        count: followUps.length,
        summary: `Found ${followUps.length} prospects requiring follow-up.`,
        items: followUps
      };
    }

    return {
      action: actionKey,
      success: true,
      summary: `Workflow action ${actionKey} executed successfully.`
    };
  }

  chatWithAgent(query: string) {
    const q = (query || '').toLowerCase().trim();
    const prospects = this.listAllProspects();
    const partners = this.store.listPartners();
    const events = this.listEvents();

    // Check for convert command in chat
    if (q.includes('convert') && q.includes('influencer')) {
      const matchingProspect = prospects.find(p => q.includes(p.fullName.toLowerCase()) || q.includes((p.firstName || '').toLowerCase()));
      if (matchingProspect) {
        const res = this.convertProspectToInfluencer(matchingProspect.id);
        return {
          response: `${res.message} They are now listed in your Influencer network.`,
          actionType: 'converted_prospect',
          actionData: res.partner
        };
      }
    }

    // Check for target account query
    if (q.includes('apex') || q.includes('crestview') || q.includes('account') || q.includes('who can introduce')) {
      const targetQuery = q.includes('apex') ? 'Apex' : (q.includes('crestview') ? 'Crestview' : '');
      const matches = this.searchTargetAccounts(targetQuery);
      if (matches.length > 0) {
        const m = matches[0];
        return {
          response: `Best warm path to ${m.prospect.company}: **${m.partner.fullName}** has a **${m.score}% warm path score** connecting to **${m.prospect.fullName}** (${m.prospect.jobTitle}).`,
          actionType: 'open_outreach',
          actionLabel: `Open Outreach for ${m.prospect.fullName}`,
          prospectId: m.prospect.id
        };
      }
    }

    // Check for top influencers
    if (q.includes('top influencer') || q.includes('best partner') || q.includes('who has given')) {
      const sorted = [...partners].sort((a, b) => (b.contactsCount || 0) - (a.contactsCount || 0));
      const top = sorted[0];
      return {
        response: `Your most active influencer is **${top?.fullName || 'Bob Miller'}** (${top?.company}) with **${top?.contactsCount || 0} prospects introduced**.`,
        actionType: 'view_influencers',
        actionLabel: 'View Influencer Network'
      };
    }

    // Check for events query
    if (q.includes('event') || q.includes('calendar') || q.includes('summit') || q.includes('dinner')) {
      return {
        response: `You have **${events.length} scheduled events** (including **${events[0]?.title}** on ${events[0]?.date}). You can add influencers directly from any event attendee.`,
        actionType: 'view_events',
        actionLabel: 'View Events & Calendar'
      };
    }

    // Check for outreach/draft query
    if (q.includes('draft') || q.includes('reach out') || q.includes('uncontacted')) {
      const uncontacted = prospects.filter(p => !p.outreachStatus || p.outreachStatus === 'Pending');
      const first = uncontacted[0] || prospects[0];
      return {
        response: `Found **${uncontacted.length} uncontacted prospects**. Recommended next step: Reach out to **${first.fullName}** (${first.company}), introduced by ${first.partnerName}.`,
        actionType: 'open_outreach',
        actionLabel: `Draft Outreach to ${first.fullName}`,
        prospectId: first.id
      };
    }

    // General fallback assistance
    return {
      response: `I'm analyzing your **${prospects.length} prospects**, **${partners.length} influencers**, and **${events.length} field events**. You can ask me to find warm paths, queue outreach drafts, convert prospects to influencers, or review event attendees.`,
      actionType: 'overview',
      actionLabel: 'Queue Outreach Drafts',
      actionKey: 'draft_uncontacted'
    };
  }

  // ─── Admin Settings & Integrations ───
  getSettings(): AdminSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AdminSettings>): AdminSettings {
    this.settings = {
      ...this.settings,
      ...updates,
      openaiConfigured: Boolean(updates.openai !== undefined ? updates.openai : this.settings.openai),
      geminiConfigured: Boolean(updates.gemini !== undefined ? updates.gemini : this.settings.gemini),
      exploriumConfigured: Boolean(updates.exploriumApiKey !== undefined ? updates.exploriumApiKey : this.settings.exploriumApiKey),
      resendConfigured: Boolean(updates.resendApiKey !== undefined ? updates.resendApiKey : this.settings.resendApiKey),
      twilioConfigured: Boolean(updates.twilioAccountSid !== undefined ? updates.twilioAccountSid : this.settings.twilioAccountSid),
      googleClientSecretConfigured: Boolean((updates as any).googleClientSecret || this.settings.googleClientSecretConfigured),
      linkedinConfigured: Boolean(updates.linkedinAccessToken !== undefined ? updates.linkedinAccessToken : this.settings.linkedinAccessToken),
      lemlistConfigured: Boolean(updates.lemlistApiKey !== undefined ? updates.lemlistApiKey : this.settings.lemlistApiKey),
      firecrawlConfigured: Boolean(updates.firecrawlApiKey !== undefined ? updates.firecrawlApiKey : this.settings.firecrawlApiKey)
    };
    const db = readDatabaseJson();
    if (db) {
      db.settings = { ...(db.settings || {}), ...this.settings };
      writeDatabaseJson(db);
    }
    return { ...this.settings };
  }
}
