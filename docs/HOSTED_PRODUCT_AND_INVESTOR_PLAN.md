# Trusted Influencer Network: Hosted Product and Investor Plan

**Prepared:** 7 October 2026; Phase 1 reward model updated 9 October 2026  
**Scope:** Product strategy, hosted SaaS transition, launch readiness, and codebase audit.  
**Evidence basis:** Repository review of the current `main` branch, including the local Python API, Vercel adapter, Marketplace and Influencer Portal flows, operating documentation, and automated test contracts. This is a planning and code review, not a penetration test, legal opinion, cloud deployment review, or proof of customer demand.

**Firebase/Clerk setup update (9 October 2026):** Firestore remains the data store for project `bdrcreek`; the browser and backend API use Clerk for identity and session verification. Clerk configuration and admin user IDs are environment-driven. The frontend no longer initializes Firebase Authentication. Clerk keys/issuer and hosted deployment credentials still need to be supplied to the deployment environment.

**Phase 2 implementation update (9 October 2026):** server-side Vendor/Influencer approval gates, routed request transitions, 30-day participant sessions, and no hosted demo-email success have been added. The hosted Cloud Run/Firestore environment is still not provisioned; region, billing, Auth-provider setup, admin UID, and deployment are outstanding.

**Phase 3 preparation update (10 October 2026):** a closed-pilot operating runbook and weekly scorecard have been added in [`PHASE_3_CLOSED_PILOT_RUNBOOK.md`](PHASE_3_CLOSED_PILOT_RUNBOOK.md). The pilot has not started; the Phase 2 hosted-staging gate and external buyer/Influencer commitments remain prerequisites.

**Superseding release update (15 October 2026):** Vercel Production is serving the previous portal; the new Clerk partner portal and admin integration are deployed to Preview. Vendor signup now uses Firestore instead of returning the old Vercel 503. Production has its Clerk and Firestore/WIF credentials, but the admin allowlist and hosted API security flags were absent (the flags and canonical portal URL are now staged, pending the next deployment). A production operator Clerk ID, live authenticated workflow verification, scheduled backups/restore rehearsal, approved agreements, and a real pilot are still outstanding.

## 1. Executive assessment

The business thesis is clear: turn trusted relationships and industry influence into a measurable customer acquisition channel. The current product contains useful building blocks for that thesis—partner and vendor profiles, a masked network directory, introduction requests, human review, referral credits, and an IRM console—but it is still a local-first prototype with adjacent BDR/outbound functionality. It is not ready to launch as a public hosted marketplace.

The most important launch blockers are not visual polish. They are production operator access, tenant isolation, concurrency-safe product records, verified participant onboarding, operational recovery, and trustworthy attribution/reward records. The Vercel API now uses Firestore and the portal/admin share its referral and reward data; the release remains in Preview while production authorization and account-level verification are completed.

**Recommended sequence:** keep the current direction—Marketplace and Vendor onboarding first, Influencers in the Portal, IRM operations behind them—then earn the right to expand into the Model 1 relationship-management system. Start with a managed, human-reviewed marketplace pilot in one narrow vertical, demonstrate qualified introductions and repeatable outcomes, then productize deeper CRM and automation. Do not position the existing app as autonomous BDR software in the investor pitch.

## 2. Investor narrative

### The problem

Companies spend heavily on channels that begin with low-context outreach, while many buying decisions are influenced by advisors, operators, executives, consultants, and experts who already have credibility with the target market. Those relationships are valuable but fragmented across personal networks, spreadsheets, and informal referral arrangements. Outcomes, consent, ownership, and rewards are difficult to track consistently.

### The product

The platform gives companies a controlled way to discover eligible trusted connectors and request a specific warm introduction. Influencers curate or submit their networks, decide whether to make each introduction, and can see the progress and rewards attributed to it. An IRM operator handles participant review, agreement status, routing, exceptions, and quality control. The product records the evidence trail from request through meeting and eventual commercial outcome.

### The initial buyer and wedge

The repository is pre-validation evidence, not market proof. The initial vertical and buyer must be chosen using interviews and pilot commitments. A plausible wedge is a high-value B2B category where one qualified introduction can materially affect pipeline economics and existing influencer relationships are common. The current interface defaults to FinTech/enterprise software but that should be treated as prototype copy, not a validated ICP. Select one vertical only after confirming:

- a buyer has a recurring need for access to a defined buying committee;
- connectors can identify and obtain permission for relevant introductions;
- referral economics and disclosure obligations can be made clear;
- introduction outcomes can be verified without collecting unnecessary sensitive data;
- both sides will use a shared workflow rather than reverting to email and spreadsheets.

### Why now / why this approach

This is an operating-system hypothesis for trusted distribution: make relationship-based acquisition measurable, governable, and repeatable. The defensible asset would not be a directory alone. It would be the combination of trusted participant supply, permissioned relationship coverage, reliable routing, outcome data, and repeat participation. These are hypotheses to validate; no proprietary network scale or traction claim is established by this repository.

### Business model to validate

Use a staged model rather than assuming one take-rate fits every reward:

1. **Pilot:** fixed program or managed-service fee to cover IRM operations and prove a measurable buyer outcome.
2. **Marketplace:** buyer subscription or program fee plus a clearly disclosed success fee where commercially and legally appropriate.
3. **Influencer rewards:** cash, recurring revenue share, equity, events, recognition, or other benefits under explicit, trackable terms; payouts require eligibility, approval, tax/compliance handling, and dispute rules.
4. **Later Model 1:** IRM software subscription for companies operating their own trusted-partner programs, with workflow, analytics, integrations, and governance.

Do not promise reward rates, take rates, margins, or recurring revenue until buyer willingness-to-pay, connector participation, costs, and legal constraints are measured.

### Early proof points investors should expect

Track a small set of cohort metrics from the first pilot:

- approved active vendors and verified active influencers;
- eligible network coverage by target account and buyer role;
- request acceptance and decline rates, and time to first response;
- accepted introductions, meetings held, and verified opportunities;
- buyer conversion and pipeline/revenue attributed to introductions;
- repeat request and repeat participation rates;
- influencer reward liability, approved, paid, disputed, and outstanding amounts;
- buyer acquisition cost, program gross margin, and payback once there are enough cohorts to calculate them;
- trust/quality signals: complaints, opt-outs, duplicate requests, invalid relationships, and dispute rate.

The critical metric is not profile count. It is qualified introductions that progress to verified commercial outcomes with repeat participation and acceptable economics.

### Fundraising story

Pitch the company as building trusted distribution infrastructure, beginning with a managed vertical marketplace and expanding into IRM software after proving the workflow. Be explicit about what is live today, what is a pilot workflow, and what remains roadmap. Current code does not establish production usage, customer traction, revenue, a verified network, compliant payments, or legal-grade contracting; those must not be implied.

## 3. Product operating model

### Roles

- **Buyer/vendor:** defines its target customer profile, requests a specific introduction, sees request status, and can provide outcome feedback.
- **Influencer/connector:** controls their submitted network and consent, chooses whether to respond, makes an introduction, and sees reward and outcome status.
- **IRM operator:** verifies organizations and participants, reviews network eligibility, routes requests, adjudicates exceptions, and reconciles outcomes/rewards.
- **Platform admin:** manages tenant configuration, access, audit events, support, and platform-level controls without using an ordinary participant account.

### Canonical introduction lifecycle

The UI, API, analytics, and rewards ledger need one state machine. Recommended minimum:

`requested → irm_approved → influencer_accepted → intro_made → meeting_scheduled → meeting_held → outcome_recorded → reward_approved → paid`

At each point, define who may make the transition, what evidence is required, whether it can be reversed, and how both parties are notified. `declined`, `cancelled`, `expired`, and `disputed` are explicit terminal or exception states. Prevent duplicate active requests for the same buyer, target, and influencer; keep status history rather than overwriting the only record. Do not award payable value from self-reported clicks or a single mutable integer.

### Marketplace privacy model

Default to minimal disclosure: show enough aggregate/contextual information for a buyer to assess fit, but do not expose a target person's identity or contact details until the approved consent and introduction process permits disclosure. Keep the requester, influencer, and IRM scopes separate. Log every reveal and export. Give participants withdrawal, correction, deletion/retention, and request escalation paths appropriate to the chosen jurisdictions and contracts.

## 4. Hosted-product target and transition plan

### Recommended architecture

Use a **modular monolith** initially; microservices would add operational overhead without solving the present gaps. Keep the static frontend if useful for the pilot, but replace the local persistence contract and gradually separate product domains from the old BDR console.

- **Web:** hosted application with separate public Marketplace, Vendor workspace, Influencer Portal, and authenticated IRM console.
- **API:** versioned server API with centralized authentication, role authorization, tenant context, input validation, idempotency, and audit events. Existing Python domain logic may be migrated into a conventional framework or kept behind a clean service layer; do not deploy `BaseHTTPRequestHandler` as a production boundary without a hardening and maintainability pass.
- **Primary database:** managed PostgreSQL with explicit migrations, foreign keys, unique constraints, tenant ownership, and transactional workflow/reward updates. Move from one JSON `app_state` record and workbook snapshots to normalized records. Treat XLSX/CSV as import/export only.
- **Identity:** managed identity provider with verified email, password reset, MFA for operators, short-lived sessions, revocation, and server-verified tokens. Bind every user to an organization/role/tenant on the server. Frontend Firebase/Clerk state alone is not authorization.
- **Files:** private object storage for agreements and evidence, malware/type/size checks, signed short-lived access URLs, retention rules, and an audit log. Avoid base64 documents in the main state payload.
- **Background work:** job queue for email, notifications, imports, payout reconciliation, and integrations; retry safely with idempotency keys.
- **Operations:** isolated staging and production, managed secrets, encrypted backups with restore drills, structured logs/metrics/traces, alerting, dependency and vulnerability management, and a documented incident process.
- **Payments:** defer automated payout until reward terms, identity/tax collection, payment provider, disputes, reversals, and accounting are defined. Until then, label credits as non-cash program tracking, reconcile manually, and avoid UI that implies money was paid.
- **Influencer economy:** validate a configurable, additive schedule of 200 points for a completed warm introduction, 600 for a qualified meeting held, 1,000 for an accepted opportunity, 5,000 for a customer close, and 2,500 for a distinct customer expansion. A fully progressing referral would accumulate 6,800 points through close. Treat these as proposed program terms, not a cash conversion rate. The catalogue can include cash, nonprofit donations, conference sponsorship, products/services, executive events, VIP dinners, research sponsorship, speaking, content collaboration, and personal-brand/thought-leadership support. Publish eligibility, costs, funding, capacity, and delivery terms per program. Require buyer-confirmed evidence and an immutable, idempotent ledger with approvals, disputes, and reversal entries before automation. The detailed discovery checklist and interview prompts are in the Phase 1 charter.

For pooled multi-tenancy, enforce tenant boundaries in API queries and preferably at the database layer as defense in depth. Supabase's documentation, if selected as the managed Postgres/auth option, specifically warns that RLS policies and grants must both be configured and that secret/service-role keys bypass RLS and must remain server-side. Vendor choice should follow data residency, expected team capability, reliability, and budget—not be decided by the prototype's current Vercel config.

### Four-phase plan to begin

The goal is to go from the current local prototype to a trustworthy hosted pilot, then use that pilot to decide whether and how to expand into Model 1 IRM. Each phase has a deliverable and a decision gate; do not start broad public signup before the previous gate is met.

#### Phase 1 — Validate the wedge and lock the rules

**Purpose:** decide who the first product serves and what a successful introduction means before rebuilding infrastructure.

**Work:**

- Choose one initial vertical, buyer persona, and narrow use case through customer and influencer interviews. Treat the current FinTech/enterprise defaults as placeholder assumptions.
- Recruit 2–3 design partners for a time-boxed, invite-only pilot; agree what outcome they will measure and whether they will pay for a pilot.
- Map Vendor, Influencer, IRM operator, and platform admin permissions.
- Approve a single request lifecycle, consent/PII release rule, verification standard, reward terminology, dispute path, and basic program economics.
- Decide the first pilot geography and obtain legal review of referral terms, participant disclosures, data handling, and agreements.

**Deliverable:** a short pilot charter, signed design-partner intent, workflow/state diagram, metric definitions, data map, and a prioritized scope.

**Gate to Phase 2:** there is a specific buyer pain and use case, named design partners, and an agreed way to tell a qualified introduction from an unqualified one. If buyer, supply, consent, or reward assumptions remain unclear, continue discovery rather than scaling the code.

#### Phase 2 — Build the hosted foundation and close critical logic gaps

**Purpose:** make the system safe and durable for real invited users.

**Work:**

- Replace local SQLite/XLSX/JSON state as the production source of truth with managed PostgreSQL and migrations; retain spreadsheets for import/export.
- Add server-verified identity, organization membership, roles, tenant scoping, expiring/revocable sessions, email verification, recovery, and MFA for IRM operators.
- Enforce vendor and influencer approval on every Marketplace API path. Require IRM approval before routing to an influencer; block schedule/completion transitions that skip required states.
- Add an auditable state-event and non-cash reward ledger; do not make credit totals look like payments.
- Move agreement files to private object storage and define retention; use an approved signing workflow.
- Separate demo and production environments, disable demo email success in production, centralize send/consent safeguards, add backups, restore rehearsal, monitoring, rate limits, and an incident/support runbook.

**Deliverable:** hosted staging environment with role-specific accounts and a documented end-to-end scenario.

**Gate to Phase 3:** no dependency on local files; tenant and role boundaries are demonstrated; restore is rehearsed; vendor approval and request-state rules are enforced server-side; critical/high findings from targeted security review are resolved.

#### Phase 3 — Run a closed, human-reviewed marketplace pilot

**Purpose:** learn whether trusted introductions create enough buyer value and participant trust to justify productization.

**Work:**

- Invite only the design-partner Vendors and a small, reviewed Influencer cohort; manually verify organizations and network eligibility.
- Operate request review, consent, routing, follow-up, outcome confirmation, and reward reconciliation with a named IRM owner.
- Track request acceptance, time to response, introductions made, meetings held, qualified opportunities, repeat participation, disputes/opt-outs, reward liability, and program costs.
- Conduct weekly participant feedback and fix workflow friction before adding integrations or automation.
- Keep rewards manually reconciled until payment, tax, reversal, and dispute procedures are ready.

**Deliverable:** pilot results report with cohort data, participant feedback, operating costs, and a documented list of failure modes.

**Gate to Phase 4:** at least one buyer demonstrates repeat intent or willingness to pay, introductions are trusted and auditable, and early program economics have a plausible path. If outcomes or trust are weak, revise the wedge/workflow before expanding.

#### Phase 4 — Prove repeatability, then expand toward Model 1 IRM

**Purpose:** convert what worked in the pilot into repeatable software and validate a second revenue motion.

**Work:**

- Test repeat programs, pricing, buyer acquisition, support load, and contribution margin using additional cohorts.
- Add only the integrations necessary for verified outcomes (likely CRM first); establish reporting definitions for sourced vs. influenced pipeline and revenue.
- Productize tenant-configurable program rules, partner lifecycle, analytics, and audit controls when customers need to run their own IRM programs.
- Add payment automation and broader self-service only after legal, operational, identity, tax, dispute, and support processes are proven.
- Prepare an investor data room with pilot evidence, conversion cohorts, unit-economics assumptions, security posture, architecture, roadmap, and clearly labeled risks.

**Deliverable:** evidence-backed scale decision and an investor narrative grounded in pilot results; Model 1 becomes a deliberate expansion rather than an assumption.

**Gate to broader launch:** multiple cohorts show repeat buyer demand, reliable delivery, acceptable trust/quality outcomes, and improving economics. Public signup and larger-scale automation should follow this gate, not precede it.

**Planning note:** phase durations depend on team size, stack choice, legal review, and design-partner access. Set dates after Phase 1 discovery; avoid false precision before those dependencies are known.

### First deployment recommendation

Vercel currently serves the UI and API; Clerk handles identity, and Firestore stores the shared hosted state through workload identity federation. The product still stores most records in a compressed whole-state snapshot for compatibility, with compare-and-swap writes and reload/retry on conflicts. Keep it restricted to a controlled pilot while migrating to tenant-owned transactional records and proving backup restoration, monitoring, and support ownership.

## 5. Codebase audit: gaps against the business and production standard

### Critical before any public participant launch

1. **Production release is not promoted.** The connected partner portal and shared admin projection are in Preview. Production still serves the retired portal. Deploy after an operator Clerk ID is allowlisted and authenticated reads/writes are verified; a local HTTP test does not prove a successful production signup.
2. **No complete organization authorization model.** Clerk now provides the application identity and server-verified sessions for operator APIs. The pilot still needs organization membership, tenant scoping, vendor/influencer role mapping, and production admin IDs configured. Browser sign-in alone does not grant API permissions.
3. **No tenant isolation model.** Vendor data is filtered by vendor id in some handlers, but there is no first-class tenant across buyers, operators, influencers, records, files, logs, or billing. SaaS isolation must be explicit and tested; AWS guidance distinguishes tenant isolation from authentication/authorization.
4. **Vendor approval is now enforced server-side.** Network access and new introduction requests require explicit IRM approval in addition to a signed agreement. Continue to exercise this gate in staging and document operator review criteria.
5. **Influencer eligibility now has a review gate for self-signups.** New self-registered Influencers are pending review and cannot act on Marketplace requests until approved by IRM. Legacy/admin-created Influencers without an explicit status remain eligible for compatibility; migration and a real identity/organization verification standard are still required.
6. **Introduction transition controls are improved.** Influencer actions require `irm_approved`; influencers cannot self-mark a meeting complete, and IRM requires buyer evidence to confirm it. Automated evidence integrations and full state-event audit history remain future work.
7. **Reward credits are mutable profile totals, not a financial ledger.** Marketplace milestone awards now use an append-only, idempotent evidence-linked prototype ledger and cannot be self-awarded by influencers. This addresses the initial Marketplace path, but legacy referrals still have derived prototype credits; reversals and full program-level reconciliation, catalog pricing, funding controls, and cash settlement are not implemented. Do not represent legacy credits as payable cash. Full commercial reward terms still require Phase 1 buyer/connector validation.
8. **Agreement records are not legal-grade execution.** Current agreement flows store a checkbox/typed signer metadata and optional data URL; they do not provide verified signer identity, robust evidence/audit trail, versioned terms, or qualified e-signature. Operator approval is distinct from participant agreement. Use a legal-reviewed signing process before relying on signatures commercially.

### High-priority product and reliability issues

9. **Relationship attribution relies partly on names.** Network matching can fall back from stable influencer id/email to `referredBy` display-name matching. Names collide and change; migrate to required foreign keys and repair ambiguous legacy links during import.
10. **PII release is tied to request status.** The vendor's personal details unlock after influencer acceptance/schedule/completion. The exact disclosure condition should be a consent event and audited reveal—not inferred from a status value that can currently be set too early.
11. **Outbound email hosted fallback is disabled.** `/api/email/send` no longer returns simulated success when `HOSTED_API_ONLY=true`; local prototype behavior remains available. Centralized approval/consent guardrails and email-provider staging validation remain outstanding.
12. **Outbound consent guardrails differ by route.** The Google Gmail send path calls `check_send_guardrails`, while the Resend `/api/email/send` route only checks required fields and lacks the same explicit approval/opt-out/deduplication/quota validation. Centralize these controls or remove outbound BDR features from the marketplace service.
13. **Persistence has competing sources of truth.** Default local `read_workbook_state()` reads SQLite JSON as primary when seeded, while writes synchronize SQLite, XLSX, and JSON snapshots. This is workable as a prototype but risks divergence and complicates migration. Decide and document one canonical store; export workbooks.
14. **Synthetic data can contaminate product thinking.** First load seeds 30 influencers and 30 contacts in local mode. Demo exclusions depend on `isDemoData`, while old seed/import records may not carry it. Use separate demo/staging databases and explicit provenance rather than data-shape assumptions.
15. **Vendor/influencer token lifecycle is incomplete.** Tokens are hashed in storage, but the reviewed flow has no visible expiry or user-controlled revoke-all/session-management behavior; vendor token is in browser storage, influencer token in session storage. Add expiring revocable sessions, account recovery, throttling, email verification, MFA for IRM, and secure cookies where architecture allows.
16. **Rate limiting and abuse controls are not evident on public signup/login/request APIs.** Add IP/account throttles, bot protection appropriate to traffic, invitation controls for pilot, password reset safeguards, and alerting for enumeration/credential stuffing.
17. **Current deployment does not demonstrate production observability or recovery.** No hosted health/SLO posture, tenant-aware audit trail, restore verification, incident runbook, or operational ownership is established by the repository.

### Product-purpose mismatch / investor credibility

18. **Product identity is split.** README and technical documentation describe an “Autonomous BDR Platform & GTM Console,” including a 12-agent pipeline, outbound email/LinkedIn automation, simulated providers, and sales-enrichment tools. The stated business is a trusted-influencer network with IRM. Preserve only integrations that directly support referral workflow or prove customer demand; otherwise separate/retire them from the investor-facing product.
19. **Documentation is stale and internally inconsistent.** README says Model 2 Marketplace needs persistent hosting, while the Vercel route confirms it is disabled. Technical docs describe old architecture and use absolute paths. Docs and tests should reflect the canonical business workflow and actual deployed capabilities.
20. **Rewards and revenue attribution are not end-to-end.** There is no buyer-confirmed opportunity/revenue lifecycle, CRM reconciliation, payout ledger, or cross-party dispute workflow. “Measurable acquisition” needs an auditable definition for influenced pipeline, sourced pipeline, meetings, and closed revenue.
21. **Supply quality is asserted rather than proven.** UI labels include “Verified IRM Network Partner,” but available flows only store agreement/signup data and do not establish identity, role, organization, or relationship verification. Remove “verified” claims until verification criteria and evidence exist.
22. **Consent, disclosures, and compliance need product design.** The network contains personal and professional data and may involve paid endorsements/referrals, regulated categories, multiple jurisdictions, and employment conflicts. Before launch, define data minimization/retention and deletion, participant permissions, conflict disclosures, referral fee terms, recordkeeping, prohibited categories, and legal review for the pilot's jurisdictions. This plan is not legal advice.

## 6. Investor and launch readiness scorecard

| Area | Current assessment | Needed before launch |
|---|---|---|
| Business thesis | Clear and pitchable | Validate one initial vertical and buyer with interviews and committed pilot |
| Product concept | Useful workflow components exist | Simplify around network quality → approved request → introduction → verified outcome → reward |
| Local demo | Prototype flows exist | Keep demo data isolated and accurately labeled |
| Hosted service | **Not ready** | Persistent DB, real identity, API authorization, tenant boundaries, production operations |
| Marketplace controls | **Not ready** | Enforce vendor/influencer approval and request transitions server-side |
| Trust and agreements | **Not ready for commercial reliance** | Verification standard, legal-reviewed agreements/signature evidence, consent and disclosures |
| Rewards | **Tracking only** | Ledger, approval, payout reconciliation, dispute/reversal rules, tax/payment decision |
| Analytics | Partial / not commercial attribution | Outcome definitions and evidence linked to CRM/deal stages |
| Investor evidence | No traction evidenced in code | Pilot commitments, cohort outcomes, repeat usage, economics, customer references |
| Documentation | **Needs refresh** | Reframe README/docs and remove obsolete BDR-first claims or label as prototype modules |

**Launch verdict:** suitable for a controlled local demo and product discovery; not ready for public signup or a production marketplace. For investor conversations, the concept and roadmap are ready to explain, but pitch traction and economics must be presented as unvalidated until measured.

## 7. Near-term fix order

1. Freeze the canonical role model, vertical pilot, reward terminology, consent model, and introduction state machine.
2. Move state into managed PostgreSQL with migrations, tenant foreign keys, and normalized users, organizations, influencer profiles, relationships, requests, state events, reward ledger, and audit events.
3. Implement server-side identity, verified onboarding, organization membership, roles, expiring/revocable sessions, and tenant-aware access checks.
4. Enforce vendor and influencer review gates and legal agreement prerequisites on every API path; require IRM routing before influencer action; prevent completion before meeting scheduled/held evidence.
5. Implement invitation/review controls, relationship ownership/consent, privacy-safe discovery, controlled PII reveal, and audit logs.
6. Convert credits to a ledger with explicitly non-cash status until payouts are supported; define outcome confirmation and disputes.
7. Turn off production demo email responses; centralize send policy; isolate/disable unrelated BDR outbound paths in the marketplace product.
8. Add hosted staging, backups/restore drill, monitoring/alerts, support/incident process, and verified end-to-end pilot runbook.
9. Rewrite investor-facing and technical docs to match the product, clearly separating live capabilities, pilot operations, and roadmap.
10. Only then onboard a small invited pilot; keep public self-service signup closed until the pilot clears trust, quality, and reliability gates.

## 8. Open decisions that should be resolved during discovery

- Which vertical and buyer segment will be the first narrow wedge?
- Is the initial buyer buying managed access to a network, referral-program operations, or IRM software? The pilot may bundle these, but the product must identify the buyer's paid job.
- Who verifies a relationship, and what counts as sufficient proof without over-collecting personal data?
- What reward structures are allowed, who funds them, when do they vest, and who bears chargeback/dispute risk?
- Which geographies and regulated sectors are in scope for pilot one?
- Will the platform itself broker introductions or only provide tooling to customer-owned programs?
- Which integrations are essential to prove deal outcomes: CRM, calendar, email, payments, or e-signature?
- What service level and support model will pilot customers expect?

## 9. Sources for architecture recommendations

- AWS, [SaaS Architecture Fundamentals: Tenant Isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html): tenant isolation must be explicit and is separate from ordinary authentication/authorization.
- AWS, [SaaS Identity](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/saas-identity.html): bind authenticated users to tenant context and carry that context through application operations.
- Supabase, [Postgres Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): if selected, configure grants and policies together, enable RLS on exposed tables, and keep service-role keys server-side.
- Vercel, [Functions Limitations](https://vercel.com/docs/functions/limitations): functions have execution, payload, and runtime constraints; they do not provide durable product persistence by themselves.
