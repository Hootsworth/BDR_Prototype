# Phase 1: Discovery and Pilot Charter

**Status:** Phase 1 workflow implemented in the prototype; market, buyer, region, and partner commitments are not yet confirmed.  
**Product thesis:** A trusted-influencer network helps companies create qualified warm introductions through people with relevant credibility and relationships, then tracks outcomes and rewards transparently.

## Phase 1 objective

In two weeks of focused discovery, decide whether there is a narrow, repeatable first use case worth hosting and piloting. Do not treat profile count, app completion, or positive feedback as validation. Validation means buyers will commit time/data/budget, qualified connectors will participate under clear consent and reward terms, and both sides agree on how outcomes will be measured.

## Decisions to make

1. **Initial vertical and geography:** choose one segment where trusted introductions can affect a high-value sale and where pilot compliance requirements are manageable.
2. **Economic buyer:** identify the role that owns budget and pipeline impact.
3. **First job to be done:** decide whether the pilot sells managed access to introductions, operating an existing referral program, or a contained IRM workflow.
4. **Supply model:** identify where qualified connectors come from, how they are verified, and why they will contribute relationships.
5. **Consent and disclosure:** decide when the connector confirms permission, what information is visible at each step, and how paid referrals/conflicts are disclosed.
6. **Reward model:** validate the proposed points schedule and redemption mix, identify who funds/approves each reward, and define the evidence that makes points earned.
7. **Commercial test:** determine whether design partners will pay for a fixed-fee pilot or sign a written pilot commitment with a defined buying process.

## Initial hypotheses to test

These are questions, not claims:

| Hypothesis | Evidence that supports it | Evidence that weakens it |
|---|---|---|
| Buyers have a recurring problem reaching a specific hard-to-reach audience | Recent examples of deals delayed/lost due to access; existing referral spend; named budget owner | Referrals are rare, opportunistic, or already handled adequately in CRM |
| Relevant connectors can make permissioned introductions repeatedly | Connectors name reachable target roles and agree to a pilot workflow with consent | Network is stale, low-relevance, or connectors will not share/use a workflow |
| Buyers will trust a curated network more than a broad directory | Buyers accept the masked discovery and IRM review process | Buyers require unrestricted contact data or do not trust network quality |
| Both sides accept a transparent reward and disclosure policy | They can explain when a reward is earned and how it is disclosed | Reward terms create conflicts, legal barriers, or disincentivize participation |
| The workflow produces measurable commercial progress | CRM owner can confirm introduction, meeting, opportunity, and eventual outcome | Outcomes cannot be attributed or verified at reasonable operational cost |
| Managed pilot can be delivered at viable cost | IRM work per introduction is bounded and buyers accept a pilot fee | Every request requires high-touch manual work with no willingness to pay |

## Interview plan

Target **8–12 interviews** in the selected vertical: 4–6 buyers, 3–4 potential connectors, and 1–2 people responsible for sales operations, partnerships, or compliance. Avoid asking whether they “like the idea.” Ask for recent behavior, budget, and concrete next steps.

### Buyer interview (30–40 minutes)

1. Tell me about the last three deals where access to a decision-maker or trusted advocate mattered.
2. How did your team get the introduction? Who initiated it? How long did it take?
3. What did the company spend in time, cash, commission, or favors to generate that access?
4. Which buyer roles/accounts are hardest to reach? How often does this problem occur?
5. How do you currently track referral source, influence, meeting, pipeline, and closed revenue?
6. What makes you trust or reject an introduction source? What evidence do you require?
7. What would prevent your team from participating: procurement, CRM process, conflict, privacy, or compliance?
8. If a small pilot covered [specific audience/use case] for [fixed period], who would approve it and what budget would it come from?
9. What measurable result would justify renewing or expanding? What result would make you stop?
10. Will you introduce us to the budget owner and share an anonymized example or CRM process? Can we schedule a pilot-design session now?

### Connector / influencer interview (30 minutes)

1. Describe a recent introduction you made that created value for both sides.
2. How do you decide whether to introduce someone? What makes you decline?
3. How do you currently keep track of introductions and follow-up?
4. What information would you be willing to share, and at what point should the recipient's identity/contact details be disclosed?
5. How should the platform confirm that you have permission before an introduction is made?
6. What reward types feel appropriate or inappropriate in your professional context? What disclosure would you expect?
7. What would make you participate repeatedly? What would damage your reputation or trust?
8. Would you review and verify 5–10 relevant contacts in a short pilot? What would you need to do that?
9. What evidence should confirm that an introduction, meeting, or opportunity occurred?
10. What terms, privacy controls, or program rules would you need before joining?

### Points and reward economy validation

Treat this schedule as a **pilot hypothesis**, not a cash promise or universal rate card. Configure it per buyer program only after the buyer funds/approves rewards and the connector accepts published terms.

| Verified milestone | Proposed points | Evidence required before credit |
|---|---:|---|
| Warm introduction made | 200 | Permissioned handoff actually delivered; a submitted name, request, or accepted request alone earns nothing |
| Qualified meeting held | 600 | Buyer confirms the meeting occurred and target fits agreed role/account criteria |
| Opportunity created | 1,000 | Buyer/CRM owner confirms a distinct opportunity was accepted into the defined pipeline |
| Customer closes | 5,000 | Buyer confirms the agreed close event, such as executed contract or first payment |
| Customer expansion | 2,500 | Buyer confirms a distinct expansion against an existing customer |

Under this additive proposal, a referral reaching close earns 6,800 total points across the first four milestones; a later qualifying expansion adds 2,500. Confirm in interviews that stacking feels fair. Define multi-connector splits, duplicate/referral conflicts, cancellations, refunds, disputes, and milestone corrections before publishing pilot terms.

Ask connectors to rank the reward types below, choose their top three, say when they would redeem, and assess whether the point values feel motivating and fair. Ask buyers what budget funds rewards, who approves it, the maximum liability they accept, and what evidence they can supply.

Potential redemption catalogue to validate:

- Cash rewards (only with a funded budget, disclosed conversion rate, jurisdiction/payment/tax review, approval, and reconciliation process)
- Non-cash options: donation to the connector's nominated nonprofit; conference sponsorship; free products or services; executive events; VIP dinners; research sponsorship; speaking opportunities; content collaboration; personal branding or thought-leadership support.

Each catalogue item needs a published points cost, description/fair value where relevant, availability and eligibility, fulfillment owner, capacity or geographic limits, expected delivery time, and cancellation/substitution terms. Donations need recipient eligibility and delivery confirmation. Events and sponsorships need capacity and a fulfillment date. A point balance must not imply cash value or guaranteed redemption until conversion, funding, terms, and legal/tax treatment are settled.

If validated, the product needs an append-only reward ledger: immutable earning/redemption/adjustment events; stable event IDs for idempotency; links to request and evidence; approver and timestamp; visible pending/approved/redeemed/disputed/reversed states; and compensating reversal entries instead of deleting history. No award for a requested introduction or merely scheduled meeting. The pilot can record points manually; do not automate payments yet.

For US-facing pilots, obtain qualified review of referral, endorsement, privacy, and tax treatment before promising cash or non-cash value. A material connection tied to an endorsement may require clear disclosure under FTC guidance, and IRS guidance explains taxable income can include money, property, goods, or services. Requirements depend on facts and jurisdiction. [FTC endorsement guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking) · [IRS taxable income](https://www.irs.gov/filing/taxable-income).

### Interview record (one per participant)

- Participant type and segment (use a code; don't put personal contact details in research notes)
- Recent concrete example and current workaround
- Frequency and economic impact, in participant's own terms
- Current alternatives and switching costs
- Required trust, privacy, consent, reward, and evidence rules
- Budget owner, budget source, procurement steps, and timing
- Commitment offered: intro, pilot-design session, data/process access, written intent, or payment
- Exact objection and what evidence would resolve it
- Follow-up owner/date
- Researcher confidence: high / medium / low, with reason

## Pilot definition (fill after interviews)

| Field | Decision |
|---|---|
| Vertical, geography, and target account profile | To be selected from interview evidence |
| Economic buyer and champion | To be confirmed |
| Pilot job to be done | One sentence, specific and measurable |
| Participating buyer organizations | Target: 2–3 committed design partners; do not count verbal curiosity |
| Connector cohort | Small, manually reviewed cohort; size based on qualified coverage, not vanity count |
| Duration | Proposed 6–8 weeks after hosted foundation passes launch gate |
| Request scope | One request per defined account/contact/use case; no unrestricted directory export |
| Consent point | Connector confirms permission before identity/contact disclosure or direct outreach |
| Introduction definition | A connector-originated, permissioned handoff acknowledged by both sides |
| Qualified meeting definition | Buyer confirms the meeting occurred and that the target fits the agreed ICP/role |
| Outcome evidence | Buyer CRM stage or named owner confirmation; capture minimal evidence and timestamp |
| Reward treatment | Prefer non-cash tracking during pilot unless funding, terms, approvals, and legal review are complete |
| Point schedule and funding | Proposed schedule above; approve buyer-funded budget, conversion rules, caps, and fulfillment terms before points are redeemable |
| Reward evidence and ledger | Manual confirmation in pilot; record milestone evidence, approver, timestamp, event ID, disputes, and reversals |
| Redemption test | Track preferences, redemption rate, delivery time, cost/liability, and satisfaction; no assumed point-to-cash conversion |
| Commercial test | Fixed pilot fee or written budgeted intent; define before onboarding |
| Pilot owner | Named IRM operator accountable for approvals, exceptions, and weekly reporting |
| Stop conditions | Consent breach, repeated poor-fit requests, unresolved critical security issue, or no outcome owner |

## Pilot metrics

Use cohort denominators and timestamps; report raw counts alongside rates when volumes are small.

**Supply and trust**

- invited, verified, approved, and active connectors;
- contacts submitted, consent-eligible, and approved for matching;
- opt-outs, complaints, invalid relationships, and duplicate contacts.

**Marketplace workflow**

- eligible requests, IRM approval/decline, connector acceptance/decline;
- time from request to each response and to introduction;
- introductions made, meetings scheduled, meetings held, and no-shows;
- requests cancelled, expired, disputed, or blocked by missing consent.

**Buyer value and economics**

- qualified opportunities and sourced/influenced pipeline under written definitions;
- buyer repeat request and renewal intent;
- IRM labor minutes and direct costs per qualified introduction;
- pilot revenue, program gross margin estimate, and reward liability;
- rewards approved, paid (if enabled), pending, reversed, and disputed.
- points by verified milestone, pending vs. approved points, redemption requests and fulfillment time by reward type, buyer-funded reward cost/liability, and point disputes or reversals.

Do not claim CAC, LTV, payback, conversion benchmarks, or market size from a tiny pilot. State sample size and caveats.

## Two-week execution cadence

| Days | Activity | Output |
|---|---|---|
| 1–2 | Choose candidate segments; build a list of 20 interview prospects; finalize neutral interview guide | Segment shortlist and outreach list |
| 3–7 | Conduct buyer and connector interviews; capture concrete examples and commitments | Interview notes and evidence table |
| 8–9 | Synthesize patterns; compare alternatives and workflow requirements | One-page problem/ICP memo and unresolved risks |
| 10–11 | Run pilot-design sessions with the strongest prospects | Draft pilot scope, metrics, roles, and commercial test |
| 12–13 | Confirm legal/privacy/reward requirements for pilot geography; validate operational effort | Risk and cost checklist; pilot charter revisions |
| 14 | Make the go / revise / stop decision | Signed-off Phase 1 decision record |

## Phase 1 decision gate

**GO to hosted pilot build** only if all are true:

- one vertical, one buyer, and one use case are specific enough to recruit against;
- at least two qualified buyer organizations commit to a pilot-design process, and at least one identifies a plausible budget owner and buying path;
- enough qualified connectors agree to participate and can explain the consent/reward expectations;
- the buyer and connector definitions for a successful introduction and held meeting are compatible;
- there is an accountable owner for confirming outcomes and operating the pilot;
- there is a legal/privacy path for the chosen geography and reward approach;
- the economics do not obviously require more manual work than buyers would fund.

**REVISE** if need is real but the segment, buyer, supply, reward, or workflow remains unclear. Run targeted follow-up interviews.

**STOP / change wedge** if buyers do not show recent pain or budget, connectors will not participate under a trustworthy consent process, or outcome attribution cannot be made credible.

## Current repo implications for Phase 1

- The existing Marketplace/Portal screens can support a prototype walkthrough, but they should not be used for public signups until durable storage and server authorization are connected.
- Seeded/synthetic contacts are not evidence of network supply. Keep all demos labeled and separate from pilot records.
- Existing credits are prototype tracking, not a payout commitment. Do not use them as a promised cash schedule.
- The proposed points schedule is a discovery artifact. The prototype's current credit schedule differs; replace it only after buyer funding, connector acceptance, evidence rules, and pilot terms are agreed.
- Existing agreement metadata and “verified” labels are not proof of identity or a qualified electronic signature.
- The first pilot can be concierge-operated while the hosted app is built, but participant consent, access, and data handling still need a documented process.
- Prototype delivery now supports an evidence-linked, idempotent milestone ledger, controlled redemption requests, IRM review/fulfillment actions, and buyer-evidence confirmation before a meeting is complete. This is implementation progress, not market validation or launch approval.
- The working app supports manual award/redemption review. It does not yet define tenant-configurable program budgets, points-to-value conversions, catalog pricing/capacity, automated buyer CRM evidence, or cash payment settlement.
- Final pilot commitments still require external Phase 1 research: 8–12 interviews, a buyer-funded rewards budget, clear jurisdiction-specific terms, and the go/revise/stop decision. No interviews or partner commitments are represented as complete in this repository.

## Decisions to record at the end of Phase 1

- chosen wedge and why the evidence supports it;
- rejected alternatives and evidence;
- buyer and connector personas;
- pilot commitments and commercial path;
- network sourcing and verification process;
- consent, PII disclosure, agreement, reward, and dispute policies;
- validated milestone definitions, funded point schedule, redemption catalogue, ledger/reversal rules, and jurisdiction-specific payment/tax/disclosure review;
- introduction and outcome definitions;
- success metrics, sample-size limits, and stop conditions;
- hosted product scope and what remains manual;
- go / revise / stop decision, owner, and date.
