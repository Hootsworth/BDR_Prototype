/**
 * ConnectEM Core Types (Bridge between Admin and Go)
 */

export type PrivacyTier = 'discoverable' | 'anonymous' | 'ask_partner' | 'private';

export type RelationshipStrength = 'strong' | 'moderate' | 'weak';

export type IntroRequestStatus =
  | 'draft'
  | 'pending_partner_review'
  | 'partner_approved'
  | 'partner_declined'
  | 'contact_contacted'
  | 'contact_accepted'
  | 'contact_declined'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'deal_closed';

export type AttributionStage =
  | 'opt_in_accepted'
  | 'meeting_held'
  | 'opportunity_created'
  | 'deal_won'
  | 'customer_expansion';

export interface PartnerNotificationPreferences {
  emailOnNewRequest: boolean;
  emailOnOptIn: boolean;
  emailOnComplianceCc: boolean;
  weeklySummary: boolean;
}

export interface Partner {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string;
  phone?: string;
  bio?: string;
  expertise: string[];
  geography: string[];
  privacyTier: PrivacyTier;
  pointsBalance: number;
  verifiedRevenue: number;
  authToken?: string;
  gmailConnected?: boolean;
  gmailEmail?: string;
  linkedinConnected?: boolean;
  linkedinProfileUrl?: string;
  bookingUrl?: string;
  aiDraftLimitDaily?: number;
  aiDraftsUsedToday?: number;
  aiUsageResetDate?: string;
  aiDraftsUsedThisWeek?: number;
  aiUsageWeekStart?: string;
  aiModelAssignment?: string;
  defaultAiTone?: string;
  notificationPreferences?: PartnerNotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachActivity {
  id: string;
  partnerId: string;
  prospectId: string;
  channel: 'email' | 'call' | 'linkedin';
  recipientEmail?: string;
  recipientPhone?: string;
  recipientLinkedin?: string;
  subject?: string;
  content?: string;
  adminCcEnforced?: string; // 'nextbdr@gmail.com'
  aiAssisted?: boolean;
  callOutcome?: string;
  twilioUsed?: boolean;
  timestamp: string;
}

export interface Prospect {
  id: string;
  partnerId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  company: string;
  jobTitle: string;
  industry?: string;
  relationshipStrength: RelationshipStrength;
  relationshipContext?: string;
  phone?: string;
  linkedinUrl?: string;
  optInCount: number;
  lastContactedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntroRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  partnerId: string;
  prospectId: string;
  prospectName: string;
  prospectCompany: string;
  status: IntroRequestStatus;
  warmPathScore: number;
  forwardableBrief: string;
  specificAsk: string;
  optInToken?: string;
  partnerDecision?: 'approved' | 'declined' | 'needs_context';
  partnerNotes?: string;
  contactDecision?: 'accept' | 'maybe_later' | 'decline';
  contactNotes?: string;
  scheduledMeetingUrl?: string;
  meetingScheduledAt?: string;
  meetingCompletedAt?: string;
  pipelineValue?: number;
  closedArr?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttributionEvent {
  id: string;
  introRequestId: string;
  partnerId: string;
  vendorId: string;
  prospectId: string;
  stage: AttributionStage;
  pointsAwarded: number;
  creditsAwarded?: number;
  pipelineValue?: number;
  closedRevenue?: number;
  verified: boolean;
  notes?: string;
  timestamp: string;
}

export type RewardCategory = 'cash' | 'impact' | 'experiences' | 'services' | 'visibility';

export interface RewardRedemptionRequest {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  itemIds: string[];
  itemNames: string[];
  creditsRequested: number;
  availableCreditsAtSubmission: number;
  details?: string;
  status: 'submitted' | 'under_review' | 'approved' | 'fulfilled' | 'declined';
  emailRecipient?: string;
  emailStatus: 'queued' | 'recipient_not_configured';
  submittedAt: string;
}

export interface RedemptionEmailOutboxItem {
  id: string;
  requestId: string;
  to?: string;
  subject: string;
  text: string;
  status: 'queued' | 'recipient_not_configured';
  createdAt: string;
}

export interface WarmPathScoreBreakdown {
  total: number;
  relationshipWeight: number;
  recencyWeight: number;
  partnerCredibility: number;
  relevanceMatch: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}
