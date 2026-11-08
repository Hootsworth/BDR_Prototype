/**
 * ConnectEM Core Data Models & Shared Types
 */

export type RelationshipStrength = 'strong' | 'moderate' | 'weak';
export type VisibilityTier = 'discoverable' | 'anonymous' | 'ask_partner' | 'private';
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

export interface Contact {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  company: string;
  industry?: string;
  phone?: string;
  linkedinUrl?: string;
  isInfluencer?: boolean;
  influencerId?: string;
  referredBy?: string;
  referredByEmail?: string;
  relationshipStrength?: RelationshipStrength;
  relationshipContext?: string;
  warmPathScore?: number;
  visibility?: VisibilityTier;
  createdAt?: string;
  updatedAt?: string;
}

export interface InfluencerPartner extends Contact {
  isInfluencer: true;
  totalReferrals?: number;
  referralCredits?: number;
  pointsBalance?: number;
  verifiedRevenue?: number;
  shareToken?: string;
  activeAgreements?: string[];
}

export interface IntroductionRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  partnerId: string;
  partnerName: string;
  contactId: string;
  contactName: string;
  contactCompany: string;
  status: IntroRequestStatus;
  warmPathScore: number;
  forwardableBrief: string;
  specificAsk: string;
  optInToken?: string;
  scheduledMeetingUrl?: string;
  meetingScheduledAt?: string;
  meetingCompletedAt?: string;
  partnerPointsAwarded?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}
