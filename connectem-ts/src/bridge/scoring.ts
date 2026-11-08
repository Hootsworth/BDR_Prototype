import type { Partner, Prospect, WarmPathScoreBreakdown } from './types.ts';

/**
 * ConnectEM Warm Path Scoring Algorithm (0-100)
 * Evaluates how credibly and effectively an introduction can be facilitated.
 */
export function calculateWarmPathScore(
  partner: Partner,
  prospect: Prospect,
  targetContext?: { industry?: string; seniorityRequirement?: string }
): WarmPathScoreBreakdown {
  // 1. Relationship Strength Weight (Max 40)
  let relationshipWeight = 10;
  if (prospect.relationshipStrength === 'strong') {
    relationshipWeight = 40;
  } else if (prospect.relationshipStrength === 'moderate') {
    relationshipWeight = 25;
  }

  // 2. Partner Credibility & Trust Score (Max 25)
  // Higher credibility for partners with active verified points and lower opt-out rates
  let partnerCredibility = 15;
  if (partner.pointsBalance > 100) partnerCredibility = 25;
  else if (partner.pointsBalance > 30) partnerCredibility = 20;

  // 3. Recency & Fatigue Score (Max 15)
  // Penalize over-contacted contacts; reward fresh connections
  let recencyWeight = 15;
  if (prospect.optInCount > 5) {
    recencyWeight = 5;
  } else if (prospect.optInCount > 2) {
    recencyWeight = 10;
  }

  // 4. Target Relevance & Seniority Match (Max 20)
  let relevanceMatch = 10;
  if (targetContext?.industry && prospect.industry) {
    if (targetContext.industry.toLowerCase() === prospect.industry.toLowerCase()) {
      relevanceMatch += 5;
    }
  }
  const title = prospect.jobTitle.toLowerCase();
  if (title.includes('chief') || title.includes('vp') || title.includes('head') || title.includes('director')) {
    relevanceMatch += 5;
  }

  const total = Math.min(100, Math.max(0, relationshipWeight + partnerCredibility + recencyWeight + relevanceMatch));

  return {
    total,
    relationshipWeight,
    recencyWeight,
    partnerCredibility,
    relevanceMatch
  };
}
