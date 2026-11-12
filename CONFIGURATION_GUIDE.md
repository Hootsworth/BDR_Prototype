# ConnectEM GTM Platform: Production Credentials & Configuration Guide

This comprehensive reference document details every API key, token, service account, and OAuth credential required to achieve full production operation for the ConnectEM / BDR prototype platform deployed on Vercel.

---

## Quick Reference Summary Table

| Service | Environment Variable | Required For | Where to Obtain |
|---|---|---|---|
| **Token Encryption** | `TOKEN_ENCRYPTION_KEY` | Serverless session & OAuth token encryption | Generated locally via Fernet |
| **Vercel Bridge** | `VERCEL_BACKEND_BRIDGE_SECRET` | Node.js to Python serverless invocation bridge | Generated locally via OpenSSL |
| **Cloud Firestore** | `FIREBASE_PROJECT_ID` | Cloud database project identifier | Firebase / GCP Console |
| **Cloud Firestore** | `FIREBASE_USE_FIRESTORE` | Set to `true` to enable persistent cloud storage | Vercel Environment Variables |
| **Cloud Firestore** | `FIREBASE_SERVICE_ACCOUNT_KEY` | Real persistent serverless authentication | GCP Console (IAM Service Accounts) |
| **Google Workspace** | `GOOGLE_CLIENT_ID` | Gmail & Google Calendar OAuth 2.0 | Google Cloud Console (Credentials) |
| **Google Workspace** | `GOOGLE_CLIENT_SECRET` | Gmail & Google Calendar OAuth 2.0 | Google Cloud Console (Credentials) |
| **Google Workspace** | `GOOGLE_REDIRECT_URI` | OAuth authorization callback | `https://admin.connectem.ai/api/google/oauth/callback` |
| **Twilio Voice** | `TWILIO_ACCOUNT_SID` | High-priority intro voice calling | Twilio Console Dashboard |
| **Twilio Voice** | `TWILIO_AUTH_TOKEN` | Twilio REST API authentication | Twilio Console Dashboard |
| **Twilio Voice** | `TWILIO_FROM_NUMBER` | Provisioned outbound phone number | Twilio Console (Phone Numbers) |
| **LinkedIn** | `LINKEDIN_CLIENT_ID` | Sign In with LinkedIn & Profile Verification | LinkedIn Developer Portal |
| **LinkedIn** | `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth 2.0 Client Secret | LinkedIn Developer Portal |
| **LinkedIn** | `LINKEDIN_REDIRECT_URI` | LinkedIn OAuth callback | `https://admin.connectem.ai/api/linkedin/oauth/callback` |
| **OpenAI** | `OPENAI_API_KEY` | AI email drafting & context summarization | OpenAI Platform Dashboard |
| **Google Gemini** | `GEMINI_API_KEY` | Dual-model fallback AI generation | Google AI Studio |
| **Explorium** | `EXPLORIUM_API_KEY` | B2B lead enrichment & verification | Explorium Platform |
| **Resend** | `RESEND_API_KEY` | Transactional email delivery fallback | Resend Dashboard |
| **Resend** | `RESEND_FROM_EMAIL` | Verified sending domain address | Resend (Domains) |
| **Slack** | `SLACK_WEBHOOK_URL` | Outbound team alerts & notifications | Slack API Apps (Incoming Webhooks) |
| **Clerk Auth** | `CLERK_PUBLISHABLE_KEY` | Frontend user authentication | Clerk Dashboard (API Keys) |
| **Clerk Auth** | `CLERK_SECRET_KEY` | Backend token validation & user lookup | Clerk Dashboard (API Keys) |
| **Clerk Auth** | `CLERK_ISSUER` | JWT issuer verification URL | Clerk Dashboard (JWT Templates) |

---

## 1. Security & Serverless Infrastructure

### 1.1 `TOKEN_ENCRYPTION_KEY`
- **Purpose**: Encrypts sensitive OAuth tokens (Google refresh tokens, LinkedIn tokens) before storing them in the database, and signs stateless admin session tokens across Vercel serverless functions.
- **Requirement**: Must be a 32-byte URL-safe base64-encoded string (compatible with Python `cryptography.fernet.Fernet`).
- **How to Generate**:
  Run this one-liner in your terminal:
  ```bash
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
- **Action**: Copy the output string and add it to Vercel Environment Variables as `TOKEN_ENCRYPTION_KEY`.

### 1.2 `VERCEL_BACKEND_BRIDGE_SECRET`
- **Purpose**: Authenticates requests forwarded from the Node.js OIDC middleware (`api/oidc.js`) to the Python serverless runtime (`api/index.py`).
- **How to Generate**:
  ```bash
  openssl rand -hex 32
  ```
- **Action**: Add to Vercel Environment Variables as `VERCEL_BACKEND_BRIDGE_SECRET`.

---

## 2. Google Cloud Firestore (Persistent Database)

Vercel instances have ephemeral local disk (`/tmp`). When `FIREBASE_USE_FIRESTORE=true` is set, all contacts, influencer profiles, outreach logs, rate limits, and deduplication state persist in Cloud Firestore.

### Setup Tutorial (Service Account Key — Recommended):
1. Navigate to the **[Google Cloud IAM Service Accounts Console](https://console.cloud.google.com/iam-admin/serviceaccounts)**.
2. Select your Firebase project.
3. Click **+ Create Service Account**.
   - Name: `connectem-firestore-backend`
   - Description: `Serverless backend access to Cloud Firestore`
4. Click **Create and Continue**.
5. Grant the following role:
   - **Cloud Datastore User** (or **Firebase Admin SDK Administrator Service Agent**)
6. Click **Done**.
7. Click on your newly created service account in the table, go to the **Keys** tab, click **Add Key** -> **Create New Key**, and choose **JSON**.
8. A JSON file will download to your computer.
9. Open the JSON file in any text editor, select all text, and copy it.
10. In your **Vercel Project Settings -> Environment Variables**:
    - Variable Name: `FIREBASE_SERVICE_ACCOUNT_KEY`
    - Value: *[Paste the entire JSON string directly]*
    - Target: Production & Preview
11. Set:
    - `FIREBASE_USE_FIRESTORE`: `true`
    - `FIREBASE_PROJECT_ID`: Your Google Cloud / Firebase Project ID (e.g. `bdrcreek`)

### Alternative: Google Workload Identity Federation (Keyless)
If you prefer not to use a service account key file:
1. Configure Workload Identity Pool in GCP IAM matching Vercel's OIDC issuer (`https://oidc.vercel.com`).
2. Add the following variables to Vercel:
   - `GCP_PROJECT_NUMBER`: Your numerical GCP Project Number.
   - `GCP_WORKLOAD_IDENTITY_POOL_ID`: Your pool ID.
   - `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`: Your provider ID.
   - `GCP_SERVICE_ACCOUNT_EMAIL`: The IAM service account email.

---

## 3. Google Workspace OAuth (Gmail & Google Calendar)

ConnectEM enables direct outreach via the user's authentic connected Google Workspace email, enforcing compliance CC to `nextbdr@gmail.com`.

### Setup Tutorial:
1. Navigate to the **[Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials)**.
2. Ensure you have enabled both the **Gmail API** and the **Google Calendar API** in **APIs & Services -> Library**.
3. Go to **OAuth Consent Screen**:
   - User Type: **External** (or Internal for Google Workspace domains).
   - App Name: `ConnectEM GTM Console`
   - User Support Email: `nextbdr@gmail.com`
   - Developer Contact: `nextbdr@gmail.com`
   - Click **Save and Continue**.
4. In the **Scopes** section, add:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `openid`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Go to **Credentials -> + Create Credentials -> OAuth client ID**:
   - Application Type: **Web application**
   - Name: `ConnectEM Web Client`
   - **Authorized JavaScript origins**:
     - `https://admin.connectem.ai`
     - `https://go.connectem.ai`
     - `https://your-vercel-deployment.vercel.app`
   - **Authorized redirect URIs**:
     - `https://admin.connectem.ai/api/google/oauth/callback`
     - `https://go.connectem.ai/api/google/oauth/callback`
     - `https://your-vercel-deployment.vercel.app/api/google/oauth/callback`
6. Click **Create**. Copy the **Client ID** and **Client Secret**.
7. In **Vercel Project Settings -> Environment Variables**, configure:
   - `GOOGLE_CLIENT_ID`: `your-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `GOCSPX-...`
   - `GOOGLE_REDIRECT_URI`: `https://admin.connectem.ai/api/google/oauth/callback`

---

## 4. Twilio Voice Calling

ConnectEM includes real-time introduction phone call dispatching and webhook callback tracking.

### Setup Tutorial:
1. Create or log in to your account at **[Twilio Console](https://console.twilio.com/)**.
2. On the main Dashboard, locate:
   - **Account SID**: Starts with `AC...`
   - **Auth Token**: Click "Show" to reveal.
3. In **Phone Numbers -> Manage -> Active numbers**, verify that you own an active phone number with **Voice** capabilities.
   - If not, click **Buy a number** and select a number with Voice capability.
   - Format: Standard E.164 (e.g. `+12125550199`).
4. In **Phone Numbers -> Manage -> Active Numbers -> Click your number**:
   - Under **Voice Configuration**, you can set the status callback URL to:
     `https://admin.connectem.ai/api/twilio/webhook/call-status`
   - HTTP Method: `HTTP POST`
5. In **Vercel Project Settings -> Environment Variables**, add:
   - `TWILIO_ACCOUNT_SID`: `AC...`
   - `TWILIO_AUTH_TOKEN`: `your-twilio-auth-token`
   - `TWILIO_FROM_NUMBER`: `+12125550199`

---

## 5. LinkedIn Integration

### Official API Constraints & Clarification
- **Officially Supported Capabilities**:
  1. **OpenID Connect Authentication**: Authenticates member identity, retrieves verified name, email address, and profile picture (`openid profile email`).
  2. **Share on LinkedIn / UGC Posts**: Publishes organic broadcast posts or thought leadership content to the member's LinkedIn feed (`w_member_social`).
  3. **Assisted 1:1 Outreach Handoff**: ConnectEM formats tailored AI notes to the clipboard and directly opens the recipient's verified LinkedIn profile.
- **Why Automated 1:1 DMs are NOT API-Automated**:
  LinkedIn's official Developer Agreement (Section 2.2) restricts programmatic 1-to-1 direct messaging to enterprise partners with specialized Recruiter System Connect or Sales Navigator Partner clearance. Third-party tools that automate LinkedIn direct messaging use unauthorized browser scraping which violates LinkedIn terms and leads to immediate account bans. ConnectEM protects your LinkedIn account standing with transparent assisted handoff.

### Setup Tutorial:
1. Navigate to the **[LinkedIn Developer Portal](https://developer.linkedin.com/)**.
2. Click **Create App**:
   - App Name: `ConnectEM Outreach`
   - LinkedIn Page: Associate your official company LinkedIn page.
   - App Logo: Upload your brand mark.
3. In the **Products** tab:
   - Request access to **Sign In with LinkedIn using OpenID Connect** (Immediate self-serve access; grants `openid`, `profile`, `email`).
   - Request access to **Share on LinkedIn** (Grants `w_member_social`).
4. In the **Auth** tab:
   - Locate your **Client ID** and **Client Secret**.
   - Under **OAuth 2.0 settings -> Authorized redirect URLs for your app**, add:
     - `https://admin.connectem.ai/api/linkedin/oauth/callback`
     - `https://go.connectem.ai/api/linkedin/oauth/callback`
5. In **Vercel Project Settings -> Environment Variables**, add:
   - `LINKEDIN_CLIENT_ID`: `your-linkedin-client-id`
   - `LINKEDIN_CLIENT_SECRET`: `your-linkedin-client-secret`
   - `LINKEDIN_REDIRECT_URI`: `https://admin.connectem.ai/api/linkedin/oauth/callback`

---

## 6. AI Providers (OpenAI & Google Gemini)

ConnectEM utilizes dual-model AI orchestration for drafting executive introduction briefs and email outreach.

### 6.1 OpenAI
1. Navigate to **[OpenAI API Keys](https://platform.openai.com/api-keys)**.
2. Click **+ Create new secret key** (Name: `connectem-prod`).
3. Set in Vercel:
   - `OPENAI_API_KEY`: `sk-proj-...`

### 6.2 Google Gemini AI
1. Navigate to **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Click **Create API Key**.
3. Set in Vercel:
   - `GEMINI_API_KEY`: `AIzaSy...`

---

## 7. Data Enrichment & Email Infrastructure

### 7.1 Explorium (B2B Lead Enrichment)
1. Log in to your **[Explorium Account](https://explorium.ai/)**.
2. Under **Account Settings -> API Keys**, generate an API key.
3. Set in Vercel:
   - `EXPLORIUM_API_KEY`: `your-explorium-api-key`

### 7.2 Resend (Transactional Email Delivery Fallback)
1. Sign up or log in at **[Resend](https://resend.com/api-keys)**.
2. Create an API key with sending permissions.
3. In **Domains**, add and verify your sending domain (e.g. `connectem.ai`) with SPF and DKIM DNS records.
4. Set in Vercel:
   - `RESEND_API_KEY`: `re_...`
   - `RESEND_FROM_EMAIL`: `Aditya from ConnectEM <outreach@connectem.ai>`

### 7.3 Slack (Real-Time Team Notifications)
1. Navigate to **[Slack API Apps](https://api.slack.com/apps)**.
2. Click **Create New App -> From scratch**, select your Slack Workspace.
3. Enable **Incoming Webhooks**, click **Add New Webhook to Workspace**, and select the channel (e.g. `#gtm-outreach`).
4. Copy the Webhook URL (`https://hooks.slack.com/services/...`).
5. Set in Vercel:
   - `SLACK_WEBHOOK_URL`: `https://hooks.slack.com/services/...`

---

## 8. Step-by-Step Vercel Configuration Checklist

To configure these in your live Vercel deployment:
1. Open your project on **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Go to **Settings -> Environment Variables**.
3. Add each key from the tables above, checking both **Production** and **Preview**.
4. Trigger a fresh deployment (or promote a commit) so that all serverless containers restart with the updated secrets.
5. In the ConnectEM Admin Portal (`https://admin.connectem.ai`), run:
   - **Firestore Health Check**: `POST /api/admin/verify-firestore` -> Expect HTTP 200 `verified`
   - **Twilio Health Check**: `POST /api/admin/verify-twilio` -> Expect HTTP 200 `verified`
   - **Google Workspace OAuth**: Click "Connect Google Workspace" -> Complete Google consent screen.
