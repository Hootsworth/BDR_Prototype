# Autonomous BDR Platform & GTM Console

An enterprise-grade autonomous sales development platform and campaign orchestrator. Features a **12-agent LangGraph pipeline**, local-first **Python REST/RPC server**, **Google Workspace integration**, **durable local workbook persistence (.xlsx)**, and an **In-App One-Click Auto-Updater** synced directly to GitHub.

---

## 🚀 Quickstart (One-Click Local Launch)

The easiest way to run the application locally:

* **macOS / Linux**: Run `./run_local.sh` (or `bash run_local.sh`).
* **Windows**: Double-click `run_local.bat`.

The launcher initializes the local Python environment, installs dependencies, starts the server at `http://localhost:8001`, and automatically opens your browser.

```bash
# Manual CLI launch
cp .env.example .env
python3 -m pip install -r requirements.txt
python3 server.py
```

To run the interactive LangGraph multi-agent pipeline in your terminal:
```bash
python3 main.py
```

---

## ⚡ In-App One-Click Auto-Updater

When you push new updates, bug fixes, or enhancements to GitHub (`git push origin main`), anyone running the app locally will automatically see an **Update Available** banner at the top of their dashboard at `http://localhost:8001`.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚡ New Update Available: [Commit Title] — [ 🚀 1-Click Update ]  [×]   │
└────────────────────────────────────────────────────────────────────────┘
```

1. **One-Click Upgrade**: Clicking **1-Click Update** downloads the latest changes in place and automatically reloads the page.
2. **Data Preservation**: User credentials (`.env`), local databases (`.prototype-data/`), and active Excel workbooks (`*.xlsx`) are **100% preserved**.
3. **Dual-Mode Compatibility**: Works seamlessly via `git pull` if Git is installed, or downloads and overlays the latest code archive automatically if run from an unzipped package.

---

## 📁 Compartmentalized Project Structure

```
├── README.md                     # Main project overview & quickstart guide
├── run_local.sh / run_local.bat  # 1-click launchers for macOS/Linux and Windows
├── requirements.txt              # Python runtime dependencies
├── package.json                  # Node scripts and development dependencies
├── server.py                     # Backend HTTP / REST / RPC server & updater
├── main.py                       # LangGraph multi-agent runner & terminal CLI
├── index.html & style.css        # Web Console UI shell & styling
├── app.js & config.js            # Web Console state controller & configurations
├── version.json                  # Local release & commit version metadata
├── vercel.json                   # Vercel serverless deployment config
│
├── agents/                       # LangGraph 12-Agent Engine
│   ├── graph.py                  # StateGraph definition & 3 approval breakpoints
│   ├── state.py                  # BDRState TypedDict schema & reducers
│   ├── discovery_agents.py       # Agents 1-3: ICP, Contact Intel, Data Quality
│   ├── campaign_agents.py        # Agents 4-7: Personalization, Launch, Telemetry
│   ├── qualification_agents.py   # Agents 8-10: Intent, LinkedIn, BANT SQLs
│   └── pipeline_agents.py        # Agents 11-12: Meeting Scheduling, HubSpot CRM
│
├── api/                          # Serverless & REST API Handlers
│   └── index.py                  # Vercel function adapter for server.py
│
├── cli/                          # Terminal User Interface
│   └── dashboard.py              # 2-Panel ANSI Terminal Dashboard & Approval UI
│
├── components/                   # HTML Template Partials for Web Console
│   ├── dashboard.html, upload.html, enrich.html, influencers.html,
│   ├── campaign-outbound.html, campaign-schedule.html, events-list.html,
│   └── dialogs.html, settings-keys.html, agent-mode.html
│
├── cursors/                      # UI Assets for Agent Pointer Simulations
│   └── arrow_2x.png, hand_2x.png, crosshair_2x.png, etc.
│
├── data/                         # Sample Datasets & Seed CSVs
│   ├── master_merged_data.csv
│   ├── mock_gtm_pipeline_leads.csv
│   ├── mock_influencers.csv
│   └── sample_gtm_contacts.csv
│
├── docs/                         # Centralized Technical Documentation & Specs
│   ├── TECHNICAL_DOCUMENTATION.md # Complete Technical Architecture Reference
│   ├── technical_documentation.pdf# Publication-ready LaTeX PDF document
│   ├── technical_documentation.tex# LaTeX source code
│   ├── INSTALLATION.md            # Detailed installation & configuration manual
│   ├── DESIGN.md                  # Main editorial design tokens specification
│   ├── AGENTS.md                  # Coding agent design system rules
│   ├── elevenlabs_DESIGN.md       # Voice-AI brand styling specification
│   └── miro_DESIGN.md             # Whiteboard canvas layout models
│
├── scripts/                      # Operational Verification Scripts
│   ├── verify_prototype.py       # Definition-of-Done smoke verification
│   └── verify_ui_buttons.py      # UI button verification test
│
├── src/                          # Modular Frontend JS Engine & Subsystems
│   ├── auth.js                   # Clerk & session authentication
│   ├── database.js               # Reactive database model & state management
│   ├── firebase-auth.js          # Firebase auth adapter
│   ├── google-integration.js     # Google Identity Services client
│   ├── local-workbook.js         # Local-first .xlsx server-managed persistence
│   ├── main.js                   # Client init, updater engine & lifecycle
│   └── components/               # Modular UI component handlers
│
├── tests/                        # Automated Pytest / Unittest Test Suite
│   ├── test_workflow.py          # Multi-agent LangGraph pipeline test
│   ├── test_server.py            # API server, updater & guardrail tests
│   └── test_frontend_contract.py # Contract tests for UI & local workbook
│
├── tools/                        # GTM Tool Connectors & Deterministic Mocks
│   ├── apollo_mock.py, clay_mock.py, zerobounce_mock.py,
│   ├── inboxkit_mock.py, lemlist_mock.py, linkedin_mock.py, hubspot_mock.py
│
└── vendor/                       # Design System CSS Assets
    └── astryx/                   # astryx.css, reset.css, theme.css
```

---

## 📊 Local Workbook Mode (.xlsx)

The web console connects to **one active local `.xlsx` workbook** (`gtm-console-database.xlsx`) acting as a multi-table relational database:

* **10 Auditable Sheets**: `Contacts`, `Companies`, `Enrichment`, `Campaigns`, `Activities`, `Approvals`, `Events`, `Settings`, `Runs`, `Metadata`.
* **Zero Configuration & Server-Managed**: Managed directly on disk by the Python server via `openpyxl` (`/api/workbook/state`) — works in any browser without manual file dialogs.
* **Continuous Auto-Save**: Changes auto-save continuously on mutation, on a 3-second safety net timer, on tab backgrounding (`visibilitychange`), and upon tab close via `sendBeacon`.
* **Export Snapshots**: Download a portable snapshot anytime via **Settings → Export copy**.

---

## 🧪 Verification & Testing

Run all automated test suites:

```bash
# Python Unit & Contract Tests
python3 -m unittest discover -s tests -v

# Definition-of-Done Smoke Test
python3 scripts/verify_prototype.py
```

---

## 📖 Technical Documentation

* 📄 **Technical PDF Document**: [`docs/technical_documentation.pdf`](docs/technical_documentation.pdf)
* 📝 **LaTeX Source**: [`docs/technical_documentation.tex`](docs/technical_documentation.tex)
* 📑 **Markdown Specification**: [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md)
