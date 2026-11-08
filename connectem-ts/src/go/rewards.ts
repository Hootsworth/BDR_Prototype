import type { RewardCategory } from '../bridge/types.ts';

export interface RewardCatalogItem {
  id: string;
  name: string;
  category: RewardCategory;
  description: string;
}

export const REWARD_CATALOG: RewardCatalogItem[] = [
  { id: 'cash-reward', name: 'Cash reward', category: 'cash', description: 'Request a cash payout for manual review.' },
  { id: 'nonprofit-donation', name: 'Donate to your nonprofit', category: 'impact', description: 'Direct a reward toward a nonprofit you care about.' },
  { id: 'conference-sponsorship', name: 'Conference sponsorship', category: 'experiences', description: 'Request support to attend or participate in a conference.' },
  { id: 'product-services', name: 'Free products or services', category: 'services', description: 'Request products or professional services from the network.' },
  { id: 'executive-event', name: 'Executive events', category: 'experiences', description: 'Request a place at a curated executive gathering.' },
  { id: 'vip-dinner', name: 'VIP dinner', category: 'experiences', description: 'Request an invitation to a small-group dinner.' },
  { id: 'research-sponsorship', name: 'Research sponsorship', category: 'services', description: 'Request support for an independent research project.' },
  { id: 'speaking-opportunity', name: 'Speaking opportunity', category: 'visibility', description: 'Request help finding a relevant speaking platform.' },
  { id: 'content-collaboration', name: 'Content collaboration', category: 'visibility', description: 'Request a co-created article, interview, or event.' },
  { id: 'thought-leadership', name: 'Personal brand support', category: 'visibility', description: 'Request help with personal branding and thought leadership.' }
];

export const CREDIT_MILESTONES = [
  { id: 'warm-intro', name: 'Warm introduction', credits: 200 },
  { id: 'qualified-meeting', name: 'Qualified meeting', credits: 600 },
  { id: 'opportunity-created', name: 'Opportunity created', credits: 1000 },
  { id: 'customer-close', name: 'Customer closes', credits: 5000 },
  { id: 'customer-expansion', name: 'Customer expansion', credits: 2500 }
];
