# GTM Console prototype

This repository is an internal prototype for a BDR/GTM workflow. It can run a complete workflow with deterministic mock providers and human approval checkpoints. It is not production-ready and must be operated in prototype mode until live integrations, persistence, and server-side secret handling are complete.

## Run locally

Requirements: Python 3.9+, Node.js, and the dependencies in `requirements.txt`.

```bash
cp .env.example .env
python3 -m pip install -r requirements.txt
npm install
python3 server.py
```

Open `http://localhost:8001`. The browser app uses mock data by default. The terminal workflow can be run separately with:

```bash
python3 main.py
```

For AI profiles and real HTTPS email delivery, configure `OPENAI_API_KEY`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in `.env` before starting the server. The sender address must belong to a domain verified with Resend. The Send Email action now reports failure instead of marking a contact sent when the provider rejects the request.

For Google Workspace, create a Google Cloud OAuth **Web application** client, enable Gmail API and Google Calendar API, and add `http://localhost:8001/api/google/oauth/callback` as an authorized redirect URI. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. The Connect Google Workspace button then uses OAuth and keeps tokens on the backend session.

The local prototype stores browser database snapshots in `.prototype-data/gtm.sqlite3` and workflow checkpoints in `.prototype-data/langgraph.sqlite` when `langgraph-checkpoint-sqlite` is installed. Email sends require explicit approval, reject suppressed/unsubscribed contacts, reject exact duplicate messages, and are capped by `PROTOTYPE_DAILY_SEND_LIMIT`.

## Prototype boundaries

- Apollo, Clay, ZeroBounce, Lemlist, HubSpot, InboxKit, and LinkedIn are mock drivers in the terminal workflow.
- Engagement events and calendar bookings in the browser are simulated unless explicitly connected.
- The LangGraph checkpoint is currently in-memory and is lost when the process exits.
- Do not use real prospect data or enable live sending until credentials are moved behind a backend and unsubscribe/suppression checks are verified.

## Verification

```bash
npm test
npm run test:python
```

The Python checks validate the graph shape and the deterministic discovery/approval path. They do not validate external providers.

## Next prototype milestone

Replace `MemorySaver` with a persistent local store, add a unique run ID per campaign, and route all provider calls through an authenticated backend. Keep the current mock mode as the default test environment.
