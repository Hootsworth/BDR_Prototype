# GTM Console prototype

This repository is an internal prototype for a BDR/GTM workflow. It can run a complete workflow with deterministic mock providers and human approval checkpoints. It is not production-ready and must be operated in prototype mode until live integrations, persistence, and server-side secret handling are complete.

## Run locally

The easiest path after downloading or cloning the repository is:

- macOS/Linux: run `./run_local.sh` (make it executable once with `chmod +x run_local.sh`).
- Windows: double-click `run_local.bat`.

The launcher creates a local Python environment, installs the required packages, starts the app at `http://localhost:8001`, and opens the browser. Keep the launcher window open while using the app. It creates `.env` from `.env.example` on first run; edit `.env` only when using server-side provider integrations.

Manual startup is also supported. Requirements are Python 3.9+, Node.js (only needed for the optional checks), and the dependencies in `requirements.txt`.

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

Generate `TOKEN_ENCRYPTION_KEY` with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. This key must remain stable; changing it requires reconnecting Google Workspace.

For the local backend mode, create a Google Cloud OAuth **Web application** client, enable Gmail API and Google Calendar API, and add `http://localhost:8001/api/google/oauth/callback` as an authorized redirect URI. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.

### Vercel deployment

The Vercel deployment must include the Python `/api` function. Configure these Vercel environment variables for the deployed domain:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN/api/google/oauth/callback
TOKEN_ENCRYPTION_KEY
OPENAI_API_KEY
EXPLORIUM_API_KEY
```

Add the exact HTTPS callback URL to the Google OAuth client. Vercel's function filesystem is temporary, so SQLite state in the deployed function is not durable across cold starts; use a managed database before treating the deployment as a multi-user production service. The repository keeps `api/index.py`, `server.py`, and `requirements.txt` available to the Vercel function. [Vercel Python Functions](https://vercel.com/docs/functions/runtimes/python)

### Local workbook mode and browser Google integration

Set the public Google OAuth client ID in `config.js` as `window.GoogleConfig.clientId`, or enter it under Settings → Google Workspace. The Connect Google Workspace button uses Google Identity Services directly in the browser, so it no longer depends on `/api/google/*` routes or the Vercel Python function. Add the deployed site's HTTPS URL as an authorized JavaScript origin in Google Cloud; the browser token flow does not use a redirect callback.

Open **Settings → Save as .xlsx** to create a local database workbook, or **Open .xlsx** to connect an existing one. The workbook contains `Contacts`, `Companies`, `Enrichment`, `Campaigns`, `Activities`, `Approvals`, `Events`, `Settings`, `Runs`, and `Metadata`. All workflow records are written back to the selected workbook after changes; provider API keys and Google OAuth tokens are intentionally kept out of the workbook. Use Chrome or Edge so the app can write back to the selected file. The app remembers the file handle and will reopen it automatically when the browser grants permission again.

In local workbook mode:

- The `.xlsx` file is the durable local database, not browser storage.
- `Contacts` contains the complete contact records; related sheets keep enrichment, outreach, approvals, events, replies, and workflow runs auditable.
- `Save as .xlsx` creates all supported sheets even when starting from an empty app.
- `Export copy` downloads a portable snapshot without changing the connected workbook.
- Direct browser enrichment requires the user to enter provider keys in Settings. Those keys remain in that browser’s local settings and are not written to the workbook.

If no workbook is connected, the local server and browser cache remain compatibility fallbacks. Once a workbook is connected, it takes precedence and the app stops sending workflow state to the local SQLite snapshot. Email sends require explicit approval, reject suppressed/unsubscribed contacts, reject exact duplicate messages, and are capped by `PROTOTYPE_DAILY_SEND_LIMIT`.

## Pilot validation

Run the local checks before a pilot:

```bash
npm run verify:prototype
npm test
npm run test:python
```

For the live pilot, use a dedicated Google Workspace test account, a verified sending identity, synthetic or opted-in contacts, and `PROTOTYPE_DAILY_SEND_LIMIT=5`. Verify one Gmail send, one Calendar/Meet event, one reply sync, a rejected duplicate send, a suppressed contact, and recovery after restarting the server before increasing the limit.

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

Package the launcher and browser workbook flow as a signed desktop application for users who need automatic file permission restoration without browser prompts. For multi-user deployment, move token storage and workbook persistence to managed services.
