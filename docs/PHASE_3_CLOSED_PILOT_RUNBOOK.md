# Phase 3: Closed Marketplace Pilot Runbook

**Status:** operating plan prepared; a real pilot has not started. The hosted foundation gate in Phase 2 is still open (Firestore/Cloud Run access, production identity configuration, durable hosted operation, and a restore rehearsal remain outstanding). Do not use the local prototype with real participant data as if it were the hosted pilot.

## Objective

Test whether a small, human-reviewed group of Vendors and Influencers can produce permissioned, qualified introductions that buyers value enough to repeat. The pilot is a learning exercise, not a public launch or proof of product-market fit.

## Entry criteria

Start participant onboarding only when all are true:

- Phase 2's hosted and security gate is met and the staging environment has passed a documented end-to-end rehearsal.
- One vertical, geography, buyer use case, qualification definition, and pilot owner are recorded in the Phase 1 charter.
- The buyer has named a decision-maker and outcome verifier, agreed to the measurement window, and committed to a pilot-design session or written intent.
- The buyer and Influencers have approved the data-sharing, consent, conflict-disclosure, referral, and reward terms for the jurisdiction.
- IRM has manually reviewed each Vendor and Influencer, confirmed agreements through the organization's approved signing process, and recorded the cohort roster outside public-facing data.
- A funded reward budget and manual approval/fulfillment owner are defined. Points remain program credits; they must not be described as payable cash unless the applicable terms and settlement process are approved.

If an entry criterion fails, keep the pilot in preparation and resolve the dependency. Do not substitute synthetic/demo records for pilot evidence.

## Roles and controls

| Role | Pilot responsibility |
|---|---|
| Pilot owner (IRM) | Owns cohort, weekly review, decisions, and escalation. |
| Vendor buyer | Submits a specific target and context, confirms qualification, and reports outcomes. |
| Influencer | Confirms permission before introducing, can decline without penalty, and reports follow-up friction. |
| Outcome verifier | Confirms meeting, opportunity, close, or expansion from an agreed buyer-side source. |
| Reward approver | Confirms evidence, approves point events, reconciles redemptions, and records fulfillment. |

Keep identity and relationship details limited to people who need them. Record only the evidence reference and decision needed for the pilot; do not copy sensitive CRM notes into research documents.

## Operating cycle

1. **Invite and verify:** invite only the named cohort. Confirm organization, role, agreement, consent, and program eligibility with IRM review.
2. **Submit and review:** Vendor submits one target account/contact and a concrete reason for the requested introduction. IRM checks fit, duplicate/conflict risk, and completeness before routing.
3. **Ask the Influencer:** show the approved request context. The Influencer may accept, decline, or ask for clarification. No contact details are disclosed before the agreed permission point.
4. **Confirm the handoff:** IRM records whether the permissioned introduction was actually delivered. A request or acceptance alone is not a completed introduction and earns no points.
5. **Verify outcomes:** the buyer/outcome verifier confirms meeting held, opportunity accepted, close, and expansion as they occur. IRM records the evidence reference and decision; participants cannot self-approve outcomes.
6. **Reconcile rewards:** reward approver checks the published terms, evidence, duplicate milestones, available budget, and any dispute before approving or fulfilling a reward.
7. **Review weekly:** collect structured feedback from both sides, resolve opt-outs/disputes, inspect operating time and costs, and fix friction before adding automation.

## Weekly scorecard

Use one reporting window and one deduplicated request ID per opportunity. Report counts and rates together; a small pilot's percentages can swing sharply.

| Measure | Definition |
|---|---|
| Invited / approved cohort | Count of invited Vendors and Influencers, with approval and agreement status. |
| Requests submitted | Distinct valid Vendor requests received in the reporting window. |
| Requests routed | Requests approved by IRM and sent to an eligible Influencer. |
| Influencer response rate | Routed requests with accept or decline ÷ routed requests. Also report median time to first response. |
| Permissioned introductions | Handoffs confirmed as delivered with required permission ÷ accepted requests. |
| Meetings held | Buyer-verified meetings ÷ permissioned introductions. Also report median time from request to confirmed meeting. |
| Qualified opportunities | Buyer/CRM-owner confirmed opportunities ÷ verified meetings. Apply the agreed qualification rule. |
| Closed / expanded customers | Buyer-verified closes and expansions; show counts and cohort age, not inferred revenue. |
| Repeat participation | Vendors submitting another valid request and Influencers accepting another request. |
| Trust and safety | Opt-outs, declines, complaints, consent exceptions, disputes, and data incidents. Any incident gets an owner and resolution record. |
| Reward liability | Points approved, points requested for redemption, points fulfilled, and remaining funded budget. Do not convert to cash unless approved terms define the conversion. |
| Operating cost | IRM hours and direct spend per request, delivered introduction, and verified meeting. State assumptions. |
| Buyer repeat intent | Record whether the buyer asks to continue, what they would pay for, and the next concrete action/date. |

Do not present an empty field as zero. Mark it **not yet observable** and state the expected evidence source and follow-up date.

## Weekly feedback record

For each coded participant (avoid names in the research log), record:

- Role (buyer, Influencer, operator) and interview date.
- What happened since the prior check-in, using one recent example.
- Where the request, consent, response, verification, or reward process stalled.
- Whether the introduction was relevant and trustworthy, and why.
- Time spent by the participant and IRM operator.
- Any opt-out, dispute, conflict, privacy concern, or unexpected reward expectation.
- Continue / change / stop recommendation, reason, owner, and due date.
- Evidence location/reference with access restricted to the pilot team.

## Decision review

At the end of the agreed pilot window, review the scorecard with the buyer and Influencer representatives. Continue only if the buyer demonstrates repeat intent or a credible willingness-to-pay path, participants trust the consent and routing process, outcomes can be verified at acceptable effort, and there are no unresolved high-severity safety or data issues. Otherwise revise the wedge or workflow and document the evidence behind the decision.

The pilot owner should publish a short results memo containing cohort size, funnel counts, response times, participant feedback themes, operating costs, reward liability, failures and fixes, limitations, and the continue/change/stop decision. Separate measured results from assumptions; do not claim traction from prototype activity.
