# GTM Console & Autonomous BDR Agent: Technical Documentation

---

## 1. Executive Architecture Overview

The **Autonomous BDR GTM Engine** is a hybrid autonomous sales development platform. It integrates a **LangGraph-orchestrated multi-agent pipeline**, a local-first **Python HTTP API server** (with Vercel serverless function compatibility), an **interactive terminal dashboard (CLI)**, and a **modern web console** supporting local workbook storage (`.xlsx`), Google Workspace OAuth integration, and AI-powered prospect enrichment.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT LAYER                                     │
├───────────────────────────────┬──────────────────────────────────────────────────┤
│        Web Console UI         │           Terminal CLI (main.py)                 │
│  - Vanilla JS / HTML5 Shell   │  - Interactive ANSI Dashboard (cli/dashboard.py) │
│  - Local Workbook (.xlsx)     │  - LangGraph Thread Runner                       │
│  - Client Google Auth (GIS)   │  - Human-in-the-Loop Approval Interceptor        │
└───────────────┬───────────────┴──────────────────────────┬───────────────────────┘
                │ HTTP / REST                              │ Graph Invocation
                ▼                                          ▼
┌───────────────────────────────┐          ┌───────────────────────────────────────┐
│     BACKEND API SERVER        │          │       LANGGRAPH BDR MULTI-AGENT       │
│         (server.py)           │          │             (agents/graph.py)         │
├───────────────────────────────┤          ├───────────────────────────────────────┤
│ • Auth & Token Encryption     │          │ 1. ICP Discovery Agent                │
│ • Google Gmail & Cal Proxies  │          │ 2. Contact Intelligence Agent         │
│ • Guardrails & Rate Limits    │          │ 3. Data Quality Agent (ZeroBounce)    │
│ • OpenAI Enrichment Route     │          │ 4. Personalization Agent (LLM)        │
│ • Resend Email Delivery       │          │ ⏸ [BREAKPOINT 1: campaign_launch]     │
│ • Explorium Proxy             │          │ 5. Campaign Launch Agent (Lemlist)    │
└───────────────┬───────────────┘          │ 6. Deliverability Agent (InboxKit)    │
                │                          │ 7. Engagement Monitoring Agent        │
                │                          │ 8. Intent Detection Agent             │
                │                          │ ⏸ [BREAKPOINT 2: linkedin_engagement] │
                │                          │ 9. LinkedIn Engagement Agent          │
                │                          │ 10. Qualification Agent (BANT LLM)    │
                │                          │ 11. Meeting Scheduler Agent           │
                │                          │ ⏸ [BREAKPOINT 3: crm_intelligence]    │
                │                          │ 12. CRM Intelligence Agent (HubSpot)  │
                │                          └───────────────────┬───────────────────┘
                ▼                                              │
┌───────────────────────────────┐                              │
│         DATA PERSISTENCE      │                              ▼
├───────────────────────────────┤          ┌───────────────────────────────────────┐
│ • SQLite: gtm.sqlite3         │◄─────────┤     STATE & MEMORY CHECKPOINTING      │
│ • Local Workbook (.xlsx)      │          │ • BDRState (TypedDict + Reducers)     │
│ • Fernet Token Vault          │          │ • SqliteSaver / MemorySaver Checkpoint│
└───────────────────────────────┘          └───────────────────────────────────────┘
```

---

## 2. Markdown Files Directory

The repository includes documentation files governing architecture, UI design tokens, developer workflows, and agent execution:

| File | Path | Role & Content Description |
| :--- | :--- | :--- |
| **`README.md`** | [`README.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/README.md) | Primary application manual. Outlines local startup steps (`./run_local.sh`, `main.py`), Vercel deployment variables, workbook storage modes, security policies, pilot testing steps, and provider boundaries. |
| **`INSTALLATION.md`** | [`INSTALLATION.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/INSTALLATION.md) | Step-by-step developer environment setup guide covering Python 3.9+ requirements, Node dependencies, virtualenv setup, and `.env` initialization. |
| **`DESIGN.md`** | [`DESIGN.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/DESIGN.md) | Design token specification for the user interface. Defines color palettes (`#292524` ink, `#f5f5f5` canvas, pastel gradient accents), typography (Waldenburg Light 300 serif headers, Inter body), component spacing, and surface elevations. |
| **`AGENTS.md`** | [`AGENTS.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/AGENTS.md) | Guidelines for AI coding agents regarding the Astryx component library, token conventions (`var(--color-*)`), layout rules (no raw `<div>`), and component swizzling. |
| **`elevenlabs/DESIGN.md`** | [`elevenlabs/DESIGN.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/elevenlabs/DESIGN.md) | Editorial brand guidelines and voice-AI UI design specifications. |
| **`miro/DESIGN.md`** | [`miro/DESIGN.md`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/miro/DESIGN.md) | Visual canvas specifications and whiteboard workflow layout patterns. |

---

## 3. Tools and Integration Modules

The application utilizes a modular tool ecosystem split between specialized mock providers (`tools/`) for deterministic simulation and live API integrations (`server.py`).

### 3.1. Internal Tool Modules (`tools/`)

All mock tools expose standard classes instantiated as singletons in [`tools/__init__.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/__init__.py):

```python
from tools.apollo_mock import ApolloMock
from tools.clay_mock import ClayMock
from tools.zerobounce_mock import ZeroBounceMock
from tools.inboxkit_mock import InboxKitMock
from tools.lemlist_mock import LemlistMock
from tools.hubspot_mock import HubSpotMock
from tools.linkedin_mock import LinkedInMock

apollo = ApolloMock()
clay = ClayMock()
zerobounce = ZeroBounceMock()
inboxkit = InboxKitMock()
lemlist = LemlistMock()
hubspot = HubSpotMock()
linkedin = LinkedInMock()
```

#### Detailed Provider Capabilities:

1. **`ApolloMock` ([`tools/apollo_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/apollo_mock.py))**:
   - `search_accounts(industries, employee_range, geography)`: Queries company database filtered by ICP criteria, returning firmographic data, tech stacks, and account scores.
   - `find_contacts(domain, roles)`: Maps buying committee personas (CIO, CTO, Head of Data, Analytics Director) to discovered account domains.
   - `enrich_contact(email)`: Enriches contact records with direct dial numbers, seniority levels, departments, and LinkedIn profile URLs.

2. **`ClayMock` ([`tools/clay_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/clay_mock.py))**:
   - `get_company_signals(domain)`: Identifies company-level growth signals, including AI initiatives, recent funding rounds, hiring sprees, and trigger events.
   - `get_contact_signals(email)`: Scrapes recent social activity, public posts, and career milestone events.

3. **`ZeroBounceMock` ([`tools/zerobounce_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/zerobounce_mock.py))**:
   - `validate_email(email)`: Executes syntax verification, MX record checks, and spam trap detection. Returns `status` (`valid`, `invalid`, `spamtrap`, `abuse`) and deliverability `score` (0-100).

4. **`InboxKitMock` ([`tools/inboxkit_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/inboxkit_mock.py))**:
   - `get_healthy_sending_inboxes()`: Returns inboxes with spam scores below warning thresholds.
   - `get_inbox_health(email)`: Evaluates inbox reputation, warming stage, and spam rating.
   - `log_send(email)`: Records volume to enforce mailbox warming limits.

5. **`LemlistMock` ([`tools/lemlist_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/lemlist_mock.py))**:
   - `add_to_sequence(contact, sequence_id, subject, body)`: Enrolls prospect into automated outreach campaigns.
   - `get_sequence(email)` / `get_all_active_sequences()`: Tracks engagement telemetry (opens, link clicks, email replies, reply text content).

6. **`LinkedInMock` ([`tools/linkedin_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/linkedin_mock.py))**:
   - `like_recent_post(profile_url, post_snippet)`: Simulates automated social engagement touches.
   - `send_connection_request(profile_url, note)`: Dispatches personalized connection notes upon human approval.

7. **`HubSpotMock` ([`tools/hubspot_mock.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/tools/hubspot_mock.py))**:
   - `upsert_contact(email, properties)`: Mirrors contact properties and updates lifecycle stages (`Prospect` $\rightarrow$ `Engaged` $\rightarrow$ `Sales Qualified Lead` $\rightarrow$ `Discovery Scheduled`).
   - `log_activity(email, activity_type, details)`: Appends audit logs for emails, LinkedIn touches, and qualification events.
   - `create_deal(email, deal_name, deal_value)`: Generates pipeline deals with deal values and calculates total pipeline ARR.

---

## 4. API Endpoints & Server Routing

The backend server is implemented in [`server.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/server.py) (`ProxyHTTPRequestHandler`) and adapted for serverless deployment via [`api/index.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/api/index.py) (`handler`).

```
                              API ROUTING MATRIX
─────────────────────────────────────────────────────────────────────────────
Route                             Method   Auth / Session   Description
─────────────────────────────────────────────────────────────────────────────
/api/google/oauth/start           GET      Public           Initiates Google OAuth2 flow
/api/google/oauth/callback        GET      OAuth Code       Completes code exchange
/api/google/status                GET      Session Cookie   Returns Google auth status
/api/google/verify                GET      Session Cookie   Validates Gmail & Calendar
/api/google/disconnect            GET      Session Cookie   Revokes session & deletes tokens
/api/state                        GET      Optional         Reads persisted JSON state
/api/state                        POST     Optional         Persists JSON state to SQLite
/api/google/gmail/draft           POST     Session Cookie   Creates Gmail draft
/api/google/gmail/send            POST     Session Cookie   Sends Gmail email (with guardrails)
/api/google/calendar/freebusy     POST     Session Cookie   Queries Google Calendar availability
/api/google/calendar/events       POST     Session Cookie   Creates Calendar event + Meet link
/api/google/gmail/replies         POST     Session Cookie   Fetches replies from contacts (<30d)
/api/ai/enrich                    POST     OPENAI_API_KEY   Generates AI prospect dossiers
/api/email/send                   POST     RESEND_API_KEY   Transactional outbound email
/api/proxy/*                      POST     EXPLORIUM_KEY    Proxies Explorium API requests
─────────────────────────────────────────────────────────────────────────────
```

### 4.1. Security & Outbound Guardrails (`check_send_guardrails`)

Before any email is sent through `/api/google/gmail/send` or transactional endpoints, the server validates:
1. **Payload completeness**: Requires `to`, `subject`, and `body`.
2. **Opt-out compliance**: Rejects requests if `suppressed` or `unsubscribed` flags are present.
3. **Explicit Approval**: Rejects requests unless `approved === True`.
4. **SHA-256 Deduplication**: Calculates `email_fingerprint = SHA256(to + '\0' + subject + '\0' + body)` and verifies against `sent_emails` table.
5. **Daily Quota**: Enforces `PROTOTYPE_DAILY_SEND_LIMIT` (default: 25 sends/day).

---

## 5. Data Architecture & Persistence

```
                                  DATA STORES
  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
  │   SQLite Database       │  │  Local XLSX Workbook    │  │  CSV Seed Datasets      │
  │   (.prototype-data/)    │  │  (Browser File System)  │  │  (Workspace Root)       │
  ├─────────────────────────┤  ├─────────────────────────┤  ├─────────────────────────┤
  │ • app_state             │  │ • Contacts              │  │ • master_merged_data.csv│
  │ • google_connections    │  │ • Companies             │  │ • mock_gtm_pipeline_    │
  │ • sent_emails           │  │ • Enrichment            │  │   leads.csv             │
  │ • Fernet Encrypted      │  │ • Campaigns             │  │ • mock_influencers.csv  │
  │   Access & Refresh      │  │ • Activities            │  │ • sample_gtm_contacts   │
  │   OAuth Tokens          │  │ • Approvals             │  │   .csv                  │
  │                         │  │ • Events / Runs         │  │                         │
  └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

### 5.1. SQLite Tables Schema (`gtm.sqlite3`)

1. **`app_state`**:
   - `key` (TEXT PRIMARY KEY): Storage key (e.g., `'database'`).
   - `value` (TEXT NOT NULL): Serialized JSON object.
   - `updated_at` (TEXT NOT NULL): ISO 8601 UTC timestamp.

2. **`google_connections`**:
   - `id` (INTEGER PRIMARY KEY CHECK (id = 1)): Enforces single active connection in prototype.
   - `session_id` (TEXT): Cryptographically secure session token.
   - `email` (TEXT), `name` (TEXT): Connected account identity.
   - `access_token` (TEXT), `refresh_token` (TEXT): Fernet-encrypted credentials.
   - `expires_at` (REAL), `updated_at` (TEXT).

3. **`sent_emails`**:
   - `id` (INTEGER PRIMARY KEY AUTOINCREMENT).
   - `fingerprint` (TEXT UNIQUE NOT NULL): SHA-256 hash preventing duplicate outbound emails.
   - `recipient` (TEXT NOT NULL), `subject` (TEXT NOT NULL), `provider_id` (TEXT), `sent_at` (TEXT NOT NULL).

---

## 6. State Definition & Memory Management

The agent workflow state is modeled in [`agents/state.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/agents/state.py) using Python typing and LangGraph reducers.

### 6.1. `BDRState` Schema

```python
class BDRState(TypedDict):
    icp_definition: Dict[str, Any]             # Target industries, sizes, geography
    accounts: List[Dict[str, Any]]             # Identified ICP companies
    contacts: List[Dict[str, Any]]             # Buying committee prospects
    sequences: Dict[str, Any]                  # Outreach copies & sequence states
    email_outbox: List[Dict[str, Any]]         # Dispatched emails log
    linkedin_actions: List[Dict[str, Any]]     # Dispatched social touches log
    intent_scores: Dict[str, int]              # Real-time intent scores (opens/clicks/replies)
    qualification_status: Dict[str, Dict]      # BANT qualification evaluations
    crm_records: Dict[str, Any]                # Mirrored HubSpot records (contacts, deals, meetings)
    human_approval_queue: List[Dict[str, Any]] # Intercepted items awaiting review
    metrics: Dict[str, Any]                    # Global execution telemetry
    logs: Annotated[List[str], operator.add]   # Monotonic append-only log channel
    current_agent: str                         # Currently active agent node
```

### 6.2. LangGraph Checkpointing & Human-in-the-Loop Interrupts

The multi-agent graph in [`agents/graph.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/agents/graph.py) is compiled with **`SqliteSaver`** (durable persistence in `.prototype-data/langgraph.sqlite`) or **`MemorySaver`** (fallback in-memory):

```python
compiled_graph = builder.compile(
    checkpointer=memory,
    interrupt_before=[
        "campaign_launch",      # Intercept high-value account emails
        "linkedin_engagement",  # Intercept connection requests
        "crm_intelligence"      # Intercept deal size & meeting bookings
    ]
)
```

- **Execution Pausing**: When LangGraph encounters a node declared in `interrupt_before`, execution halts, state is snapshotted into the checkpointer under `thread_id`, and control returns to the caller.
- **State Resumption**: Once approvals are applied to `state["human_approval_queue"]`, the client invokes `graph.invoke(None, config)` to resume execution from the exact checkpoint.

---

## 7. LLM Configurations & Prompt Design

The system integrates OpenAI models (`gpt-4o-mini`) configured for low latency, zero hallucination, and structured outputs.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             LLM CONFIGURATION                              │
├───────────────────┬────────────────────────────────────────────────────────┤
│ Model             │ gpt-4o-mini                                            │
│ Temperature       │ 0.2 (deterministic formatting, minimal creativity)     │
│ Response Format   │ {"type": "json_object"} (guaranteed JSON response)     │
└───────────────────┴────────────────────────────────────────────────────────┘
```

### 7.1. Agent Prompting Strategies

1. **Personalization Agent ([`agents/campaign_agents.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/agents/campaign_agents.py))**:
   - **System Prompt**: `"You are an expert outbound BDR specializing in sales development for SaaS enterprise platforms. Generate a short, direct, highly personalized email outreach copy (1-2 paragraphs max, no generic fluff)."`
   - **Inputs**: Prospect name, title, company, trigger events, AI initiatives, recent LinkedIn post snippet, base template structure.
   - **Output Format**: `{"subject": "...", "body": "..."}`.

2. **Qualification Agent ([`agents/qualification_agents.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/agents/qualification_agents.py))**:
   - **System Prompt**: `"You are an expert sales qualifier. Evaluate the prospect's reply and details against the BANT (Budget, Authority, Need, Timeline) framework. Summarize your evaluation and output a qualification status."`
   - **Inputs**: Prospect reply text, current tech stack, company signals.
   - **Output Format**: `{"budget": str, "authority": str, "need": str, "timeline": str, "is_qualified": bool, "evaluation_summary": str}`.

3. **AI Enrichment API ([`server.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/server.py) `/api/ai/enrich`)**:
   - **System Prompt**: `"You are a careful B2B research assistant."`
   - **Guardrails**: `"Use only supplied facts and cautious inferences. Never invent phone numbers, emails, URLs, employers, events, or specific claims. Mark inferred values and leave unknown fields empty."`
   - **Output Format**: Structured JSON dossier per contact (`seniority`, `pain_points`, `buying_signals`, `personalization_angles`, `confidence`).

---

## 8. Client Invocation & RPC Execution Flow

### 8.1. How `main.py` (CLI Client) Drives the Multi-Agent Pipeline

[`main.py`](file:///Users/adityadixit/My%20stuff/power-cli/LangChain/main.py) acts as the primary runtime coordinator for LangGraph agent execution:

```
                  MAIN.PY / CLIENT INVOCATION LIFECYCLE
                  
   ┌───────────────┐
   │  Launch CLI   │ ──► Initialize Graph & Thread ID (`bdr-<uuid>`)
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │  run_step()   │ ──► First Run: `graph.invoke(initial_state, config)`
   └───────┬───────┘     Resume:    `graph.invoke(None, config)`
           │
           ▼
 ┌───────────────────┐
 │ Node Execution    │ ──► Executes sequential nodes:
 │ (Agents 1 -> 12)  │     icp_discovery -> contact_intelligence -> data_quality -> personalization
 └─────────┬─────────┘
           │
           ▼
 ┌───────────────────┐     YES     ┌────────────────────────────────────────────────┐
 │ Hit Breakpoint?   ├────────────►│ Render Approval Queue in CLI Dashboard         │
 │ (interrupt_before)│             │ (campaign_launch / linkedin / crm_intelligence)│
 └─────────┬─────────┘             └───────────────────────┬────────────────────────┘
           │ NO                                            │ User inputs [A]pprove / [R]eject
           │                                               ▼
           │                       ┌────────────────────────────────────────────────┐
           │                       │ Mutate Checkpointer State via:                 │
           │                       │ `graph.update_state(config, updated_values)`   │
           │                       └───────────────────────┬────────────────────────┘
           │                                               │
           └───────────────────────┬───────────────────────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │ Next Node /   │
                           │ Completion    │
                           └───────────────┘
```

### 8.2. Client RPC Invocation on Backend APIs

When clients (CLI scripts or Web UI) trigger live external actions, they invoke the backend RPC endpoints:

```
Client (Web UI / main.py)
       │
       │  POST /api/google/gmail/send
       │  Payload: { to, subject, body, approved: true }
       ▼
ProxyHTTPRequestHandler (server.py)
       │
       ├──► 1. Verify Cookie (`gtm_session`) & Decrypt Token via Fernet
       ├──► 2. Refresh OAuth Token if within 60s of expiration
       ├──► 3. check_send_guardrails(payload)
       │       ├── Check required fields
       │       ├── Verify approval flag
       │       ├── Check SHA-256 fingerprint in sent_emails table
       │       └── Verify daily limit (<25 sends)
       ├──► 4. Transmit MIME message to Google API (https://gmail.googleapis.com/...)
       ├──► 5. Insert fingerprint record into SQLite `sent_emails`
       └──► 6. Return JSON response { id: message_id, status: 'sent' }
```

---

## 9. Verification & Testing Framework

The repository includes automated test suites to ensure contract stability:

| Test Script | Target Area | Validation Criteria |
| :--- | :--- | :--- |
| **`tests/test_workflow.py`** | LangGraph Agent Pipeline | Tests all 12 agent nodes sequentially, validates data propagation in `BDRState`, and checks breakpoint pausing. |
| **`tests/test_server.py`** | HTTP Endpoints & Guardrails | Validates OAuth handshake, token encryption/decryption, SHA-256 send deduplication, daily send rate limit enforcement, and AI proxy routes. |
| **`tests/test_frontend_contract.py`** | Frontend / Backend Sync | Asserts contract integrity between UI component requirements, workbook columns, and API schemas. |
| **`scripts/verify_prototype.py`** | End-to-End Smoke Test | Executes headless verification of the complete workflow. |

---
*Technical Documentation generated for GTM Console & Autonomous BDR Agent Platform.*
