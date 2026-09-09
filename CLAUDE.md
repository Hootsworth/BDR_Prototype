# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project-specific notes for Claude when working in this repo.

## What this is

An internal single-user/local-first prototype for a BDR/GTM workflow: a vanilla-JS browser frontend (no build step) backed by a stdlib-only Python HTTP server (`server.py`), plus a separate LangGraph-based autonomous agent pipeline (`agents/`, driven by `main.py`) that is **not** wired into the web app — it's a standalone terminal workflow with its own in-memory state.

## Commands

Run locally (starts the server at `http://localhost:8001` and serves the static frontend):
```bash
python3 server.py
```
`./run_local.sh` (macOS/Linux) or `run_local.bat` (Windows) does first-run setup (venv, `pip install -r requirements.txt`, copies `.env.example` → `.env`) and then starts the server.

Terminal agent workflow (separate from the web app):
```bash
python3 main.py
```

Tests / checks — there is no bundler, transpiler, or JS test runner; "tests" are syntax checks plus Python unit tests:
```bash
npm test                    # node --check on app.js + each live src/*.js file (syntax-only, no assertions)
npm run test:python         # unittest discover over tests/ (test_server.py, test_workflow.py, test_frontend_contract.py)
npm run verify:prototype    # scripts/verify_prototype.py — validates the LangGraph shape + deterministic discovery/approval path
python3 scripts/verify_ui_buttons.py   # not wired to package.json; checks index.html/components for dead/unwired buttons
```
Run a single Python test with `python3 -m unittest tests.test_server -v` (or `tests.test_server.SomeTestCase.test_name`).

There is no lint config in the repo — don't invent one.

## Architecture

**Frontend is unbundled, template-driven vanilla JS.** `index.html` is the entry point and the authoritative list of what's live (see `app.js` note below). On boot, `src/main.js`'s `bootstrapApp()` fetches HTML fragments from `components/*.html` (one per tab: `dashboard`, `upload`, `analyse`, `influencers`, `enrich`, `campaign-outbound`, `campaign-schedule`, `events-list`, `settings-keys`, `agent-mode`, plus `dialogs.html`) and injects them into `<div id="tab-panel-*">` containers already in `index.html` — the tab markup does not exist until that fetch resolves. Each `src/components/*.js` file then wires up behavior for its tab (e.g. `dashboard.js` → `renderDashboard()`, `tables.js` → `filterInfluencersTable()`/`filterUploadTable()`). `src/database.js` holds the single in-memory `database` object (contacts + related state) that all components read/write; mutating it and calling `saveDatabaseCache()` is what triggers persistence (see workbook section below).

**Backend is a single stdlib `http.server` handler in `server.py`** — no framework. Routing is a long if/elif chain in `do_GET`/`do_POST` matching on `self.path` (e.g. `/api/workbook/state`, `/api/google/*`, `/api/ai/enrich`, `/api/email/send`). `api/index.py` re-exports this for Vercel's Python function runtime (`vercel.json` routes there); note Vercel's filesystem is ephemeral so the SQLite fallback (`/api/state`, `.prototype-data/gtm.sqlite3`) isn't durable there — the xlsx workbook is the durable store in both modes.

**Two separate persistence layers, workbook wins:**
1. The xlsx workbook (`gtm-console-database.xlsx`) — authoritative when connected; see the dedicated section below.
2. A SQLite snapshot (`/api/state`, `.prototype-data/gtm.sqlite3`) — fallback-only, used if the workbook fetch fails, and no longer written once a workbook is connected.

**Auth is optional and config-driven, not code-driven.** `config.js`'s `window.ClerkConfig.publishableKey` gates whether `src/auth.js` enforces a Clerk sign-in wall; a blank key means local single-user mode with no gate. `src/firebase-auth.js` is a separate, currently-secondary auth path loaded alongside it — check which one a given flow actually uses before assuming either is authoritative.

**Google Workspace integration is split across two mechanisms**: `src/google-integration.js` uses Google Identity Services directly in the browser (token flow, no server redirect) for the "Connect Google Workspace" button; `server.py`'s `/api/google/*` routes (OAuth start/callback, Gmail send/draft, Calendar events/freebusy) are a separate server-side flow used for the Vercel deployment path. Google tokens are encrypted at rest via `TOKEN_ENCRYPTION_KEY` (Fernet if `cryptography` is installed, base64 passthrough otherwise — see `token_cipher()`/`encrypt_token()`/`decrypt_token()` in `server.py`).

**The LangGraph agent pipeline (`agents/`) is architecturally independent of the web app.** `agents/graph.py` builds a 12-node sequential `StateGraph` (`agents/state.py`'s `BDRState`) — discovery → engagement → signal analysis → qualification phases — with `interrupt_before` breakpoints for human-in-the-loop approval, checkpointed via LangGraph's `MemorySaver` (in-memory only, lost on process exit). If `langgraph` isn't installed, `agents/graph.py` falls back to a hand-rolled `MockGraphInstance`/`StateGraph`/`MemorySaver` that reimplements the same node-sequencing/interrupt/checkpoint interface — check which path is active (`HAS_LANGGRAPH`) before assuming real LangGraph semantics. `main.py` drives this graph from the terminal via `cli/dashboard.py`. `tools/*_mock.py` (Apollo, Clay, HubSpot, InboxKit, Lemlist, LinkedIn, ZeroBounce) are mocked providers this graph calls — none of these are live external integrations; the web app's own provider-blocking logic (see README "Current product boundaries") is separate and enforced in the frontend/server, not here.

## `app.js` at the repo root is dead code

`app.js` (~200KB, root of the repo) is **not loaded by `index.html`** and is not part of the running app. The live frontend is the modular set of files under `src/` and `src/components/`, loaded directly by `index.html`. Before editing dashboard/table/state logic, check `index.html`'s `<script>` tags to confirm which file is actually live — `app.js` still exists and can look plausible, but changes there have no effect.

## Local workbook persistence (`gtm-console-database.xlsx`)

`gtm-console-database.xlsx`, at the repo root, is the durable source of truth for contacts and related workflow state (enrichment, campaigns, activities, approvals, events, settings, runs). It is **entirely server-managed** — the browser never opens it directly.

- **`server.py`**: `WORKBOOK_PATH` (near the top, overridable via the `GTM_WORKBOOK_PATH` env var) points at this file. `read_workbook_state()` / `write_workbook_state()` use `openpyxl` to parse/write all 10 sheets (`Contacts`, `Companies`, `Enrichment`, `Campaigns`, `Activities`, `Approvals`, `Events`, `Settings`, `Runs`, `Metadata`), exposed via `GET`/`POST /api/workbook/state`. Writes are atomic (write to `.tmp`, then `os.replace`).
- **`src/local-workbook.js`**: frontend counterpart. `loadWorkbookFromServer()` runs on every boot (`src/main.js`'s `bootstrapApp()`) and is treated as authoritative — localStorage cache and the SQLite `/api/state` snapshot are fallback-only, used solely if the workbook fetch fails (e.g. network error). `saveWorkbookToServer()` is called on every state mutation (via `src/database.js`'s `saveDatabaseCache()`), on a 3-second interval safety net, on `visibilitychange` (tab hidden), and via `navigator.sendBeacon` on `pagehide` (tab close) — so edits are saved essentially continuously, not just on an explicit "save" action.
- There is **no file picker** — this deliberately replaced an earlier File System Access API implementation (Chrome/Edge only, required a manual "Open .xlsx" click) so the app works with zero manual steps in any browser.

**Gotcha**: if `gtm-console-database.xlsx` is open in Excel (or any other app) while the server is running, saves from the app will silently overwrite it (file locks are advisory on macOS), and a later save from Excel will clobber the app's changes back. Close it in Excel before running the app.

## `isInfluencer` — Influencers vs. Prospects

Contacts are a single list (`database.contacts`) with a boolean `isInfluencer` field — there's no separate "Influencers" table. `isInfluencer === true` → Influencer, anything else → Prospect. This split is used in:
- Dashboard KPI tiles (`src/components/dashboard.js`'s `renderDashboard()` — the "Influencers" tile is `#dashboard-total-contacts`, historically named after an earlier "Total Contacts" tile it replaced).
- The Influencers table (`filterInfluencersTable()`) vs. the Upload/Prospects table (`filterUploadTable()`).

In the xlsx file, `isInfluencer` is stored as a real Excel boolean cell (not text `"TRUE"`/`"FALSE"`), and both `openpyxl` (backend) and the app's own writer round-trip it as a native boolean — no string coercion needed.

## Astryx UI components (see `AGENTS.md`)

The frontend UI is built on the Astryx component library (`@astryxdesign/core`, 153 components via `npx astryx <cmd>`). Full workflow/rules live in `AGENTS.md` — key points: no raw `<div>`-based layout (components do layout/spacing), no hardcoded colors/spacing (use `var(--color-*|--spacing-*|--radius-*)` tokens), run `astryx build "<idea>"` / `astryx component <Name>` to discover components before hand-rolling markup or CSS.
