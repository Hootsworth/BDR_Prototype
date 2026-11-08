# ConnectEM TypeScript Prototype (`connectem-ts`)

A fullstack TypeScript prototype for **ConnectEM** (Trusted Relationship Network & Warm Introductions Platform) structured into three distinct parts:

```
connectem-ts/
├── src/
│   ├── bridge/             # Part 3: The Connector (shared models, state store, scoring, double opt-in protocol)
│   │   ├── types.ts        # Pure domain interfaces & contracts
│   │   ├── store.ts        # Shared durable repository & double opt-in state machine
│   │   ├── scoring.ts      # 0-100 Warm Path scoring algorithm
│   │   └── index.ts        # Barrel export
│   │
│   ├── admin/              # Part 2: Admin Side ("Admin")
│   │   ├── service.ts      # Target account discovery, prospect ingestion, warm intro dispatch
│   │   ├── routes.ts       # /api/admin/* endpoint handlers
│   │   └── index.ts        # Barrel export
│   │
│   ├── go/                 # Part 1: Partner Side ("Go")
│   │   ├── service.ts      # Partner profile, privacy tiers, relationships, review inbox, rewards
│   │   ├── routes.ts       # /api/go/* endpoint handlers
│   │   └── index.ts        # Barrel export
│   │
│   └── server.ts           # Unified HTTP dispatcher mounting Admin, Go, and Opt-In APIs
│
├── tests/
│   ├── bridge.test.ts      # Tests for Warm Path scoring, opt-in protocol, attribution
│   ├── admin.test.ts       # Tests for Admin campaigns, account search, pipeline tracking
│   ├── go.test.ts          # Tests for Partner profile, privacy tiers, request review, points
│   └── e2e-flow.test.ts    # Full integration: Admin requests -> Partner reviews -> Contact opts in -> Attribution recorded
│
├── tsconfig.json           # Native ESNext / NodeNext configuration
├── package.json            # Scripts
└── README.md
```

## Running the Server
Runs directly in Node.js v22.6+ / v26+ with native TypeScript:
```bash
cd connectem-ts
node src/server.ts
```
Or with auto-reload:
```bash
node --watch src/server.ts
```

## Running the Automated Test Suite
Every feature has test coverage executed via Node's native test runner (`node --test`):
```bash
cd connectem-ts
npm test
# Or run specific test suites:
node --test tests/bridge.test.ts
node --test tests/admin.test.ts
node --test tests/go.test.ts
node --test tests/e2e-flow.test.ts
```

## Three Distinct Architecture Parts

### 1. `Go` (Partner & Influencer Workspace)
- **Partner Onboarding & Auth:** Bearer token authentication with session resolution.
- **Privacy Tiers:** `discoverable`, `anonymous`, `ask_partner` (default), and `private`.
- **Relationship Manager:** Adding contacts, setting relationship strength and context.
- **Review Inbox:** Review warm introduction requests (`approved`, `declined` with zero penalty, `needs_context`).
- **Rewards Ledger:** Verified milestone points and point redemption.

### 2. `Admin` (Enterprise & Operator Console)
- **Target Account Discovery:** Graph-based warm path matching with 0–100 confidence scoring.
- **Prospect Ingestion:** Batch import with partner attribution.
- **Warm Intro Dispatch:** Forwardable briefs formatted in the partner's voice with specific asks.
- **Attribution & Pipeline:** Active requests, held meetings, and pipeline revenue tracking.

### 3. `Bridge` (The Connector)
- **Domain Models & Contracts:** Shared types for Partners, Prospects, IntroRequests, and AttributionEvents.
- **Warm Path Scoring (0–100):** Weighted by relationship strength (40%), partner credibility (25%), fatigue/recency (15%), and relevance match (20%).
- **Double Opt-In Protocol:** Tokenized introductions where contacts confirm interest before any meeting or contact handoff.
- **Attribution & Rewards:** Points awarded exclusively on verified milestones (`opt_in_accepted`, `meeting_held`, `deal_won`).
